/* 斜面與摩擦力的 3D 檢視。1 單位 = 1 m；只呈現 env.state()，不積分物理。
 * 鉸鏈為原點，板沿區域 −x，區域 +y 為法線，rotation.z = −theta。
 * three.js 僅在頁面按下 3D 時載入。 */
(function () {
  'use strict';
  const DEG = Math.PI / 180;

  function create(lib, env) {
    const THREE = lib.THREE, LD = window.LabDraw, T = env.T, G = env.geo;
    const { BOARD, BT, BL, BH, PEG_W, PEG_H, STOP_W, STOP_H, X0, XMAX, GATES } = G;
    const alpha = LD.alpha, shade = LD.shade, FONT = LD.FONT;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    env.host.appendChild(canvas);
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch (e) { canvas.remove(); throw e; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(), boardGroup = new THREE.Group();
    boardGroup.name = 'incline'; scene.add(boardGroup);
    const camera = new THREE.PerspectiveCamera(35, 1.5, 0.05, 40);
    const controls = new lib.OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 0.8; controls.maxDistance = 9;
    controls.maxPolarAngle = 88 * DEG; controls.enablePan = true; controls.screenSpacePanning = true;
    let colors = {}, width = 0, height = 0, narrow = false, frame = 0, active = true;
    let viewLocked = false, movingCamera = false, cameraTween = null, previousTheta = null;
    let dragging = false, pointerId = null, hovering = false, rendered = false, damping = 0;
    let lastKey = '', themeVersion = 0, lastHUD = '', lastWedge = null;
    const geometries = new Set(), materials = new Set(), textures = new Map(), surfaceMats = new Map();
    const themed = [], labels = new Map(), arrows = new Map();
    const axisY = new THREE.Vector3(0, 1, 0), zAxis = new THREE.Vector3(0, 0, 1);
    const v = (x, y, z) => new THREE.Vector3(x, y, z || 0);
    function geo(g) { geometries.add(g); return g; }
    function mat(m) { materials.add(m); return m; }
    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      ['canvas-bg','text','muted','surface','accent','pos','neg','field','equi','b-mech','b-optics','r-au'].forEach(k => { colors[k] = cs.getPropertyValue('--' + k).trim(); });
      colors.dark = LD.rgb(colors['canvas-bg']).reduce((a,b) => a+b, 0) / 3 < 100;
      canvas.setAttribute('aria-label', T('3D 斜面與摩擦力：可抬高的木板、木塊、光電門、受力箭頭與摩擦錐（可拖曳旋轉、滾輪或兩指縮放；拖曳木板上端的把手可改變角度）',
        '3D incline and friction: the tiltable board, the block, the photogates, the force arrows and the friction cone (drag to rotate, scroll or pinch to zoom; drag the handle at the top of the board to change the angle)'));
    }
    readColors();
    function colorMaterial(getColor, props, basic) {
      const options=Object.assign(basic?{color:getColor()}:{color:getColor(),roughness:0.5},props);
      if(basic)delete options.roughness;
      const m = mat(new (basic ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial)(options));
      themed.push(() => { m.color.setStyle(getColor()); if (m.emissive && props && props.emissiveIntensity != null) m.emissive.copy(m.color); });
      return m;
    }
    const metal = colorMaterial(() => shade(colors.field, colors.dark ? -0.35 : 0.3), {metalness:0.8,roughness:0.35});
    const plastic = colorMaterial(() => shade(colors.field, colors.dark ? -0.6 : 0.1), {roughness:0.5});
    const grip = colorMaterial(() => shade(colors.field,-0.6), {roughness:0.9});
    const rubber = colorMaterial(() => shade(colors.field,-0.75), {roughness:0.95});
    const rulerMat = colorMaterial(() => colors.text, {roughness:0.6});
    const textMat = colorMaterial(() => colors.text, {roughness:0.5});
    const handleMat = colorMaterial(() => colors.accent, {roughness:0.3,emissive:colors.accent,emissiveIntensity:0});
    const tableColor = () => shade(colors.equi, colors.dark ? -0.55 : 0.62);
    const tableMat = colorMaterial(tableColor, {roughness:0.75,metalness:0});
    const edgeMat = colorMaterial(() => shade(tableColor(),-0.25), {roughness:0.75});
    const shellMat = colorMaterial(() => shade(colors.field, colors.dark ? -0.4 : 0.75), {roughness:0.5});
    const pointerMat = colorMaterial(() => colors.pos, {roughness:0.4});
    const glassMat = mat(new THREE.MeshPhysicalMaterial({color:colors.surface,transparent:true,opacity:0.35,roughness:0.15,clearcoat:1,depthWrite:false}));
    themed.push(() => glassMat.color.setStyle(colors.surface));

    function mesh(parent, name, geometry, material, position, shadow) {
      const m = new THREE.Mesh(geo(geometry), material); m.name = name;
      if (position) m.position.copy(position);
      m.castShadow = m.receiveShadow = shadow !== false; parent.add(m); return m;
    }
    function box(parent,name,w,h,d,material,x,y,z) { return mesh(parent,name,new THREE.BoxGeometry(w,h,d),material,v(x,y,z)); }
    function cylinder(parent,name,r,length,material,x,y,z,axis) {
      const m=mesh(parent,name,new THREE.CylinderGeometry(r,r,length,20),material,v(x,y,z));
      if(axis==='x')m.rotation.z=-Math.PI/2; if(axis==='z')m.rotation.x=Math.PI/2;return m;
    }
    function torus(parent,name,r,tube,material,x,y,z) { return mesh(parent,name,new THREE.TorusGeometry(r,tube,8,64),material,v(x,y,z),false); }
    function group(parent,name) { const g=new THREE.Group();g.name=name;parent.add(g);return g; }

    // 固定種子的 CanvasTexture；主題切換只重畫同一張貼圖。
    function makeTexture(id,w,h,paint) {
      if(textures.has(id))return textures.get(id).texture;
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
      texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
      const item={canvas:c,texture,paint};textures.set(id,item);paint(c.getContext('2d'),w,h);return texture;
    }
    function grain(c,w,h,base,light) {
      let seed=137;const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
      c.fillStyle=base;c.fillRect(0,0,w,h);c.lineWidth=1;c.strokeStyle=alpha(shade(base,-0.35),light?0.18:0.25);
      for(let i=0;i<40;i++) {
        const y=rnd()*h,ph=rnd()*6,amp=1+rnd()*3;c.beginPath();
        for(let x=0;x<=w;x+=8){const yy=y+amp*Math.sin(x/80+ph);if(x)c.lineTo(x,yy);else c.moveTo(x,yy);}c.stroke();
      }
      for(let i=0;i<3;i++) {
        const x=rnd()*w,y=rnd()*h;c.save();c.translate(x,y);c.scale(3,1);
        const g=c.createRadialGradient(0,0,0,0,0,8);g.addColorStop(0,alpha(shade(base,-0.4),0.3));g.addColorStop(1,alpha(base,0));c.fillStyle=g;c.beginPath();c.arc(0,0,8,0,2*Math.PI);c.fill();c.restore();
      }
    }
    function surfaceTexture(id) {
      const sizes={wood:[512,256],boardwood:[1024,128],waxed:[512,256],steel:[512,128],concrete:[512,512],snow:[512,512],ice:[512,256],mystery:[512,256]};
      if(!sizes[id])return null;
      const [w,h]=sizes[id];
      return makeTexture('surface-'+id,w,h,(c,w,h)=>{
        const base=env.material(id).base;c.clearRect(0,0,w,h);c.fillStyle=base;c.fillRect(0,0,w,h);
        let seed=61;const rnd=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
        if(['wood','boardwood','waxed'].includes(id))grain(c,w,h,base,id==='waxed');
        else if(id==='steel')for(let i=0;i<300;i++){c.strokeStyle=alpha(i%2?'#ffffff':'#000000',i%2?0.06:0.05);c.beginPath();const y=rnd()*h;c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
        else if(id==='concrete'||id==='snow')for(let i=0;i<2000;i++){c.fillStyle=alpha(shade(base,id==='snow'?-0.08:(rnd()<0.5?-0.2:0.2)),0.35);const r=1+rnd();c.fillRect(rnd()*w,rnd()*h,r,r);}
        else if(id==='ice'){c.strokeStyle=alpha('#ffffff',0.3);c.lineWidth=1;for(let i=0;i<10;i++){const x=rnd()*w,y=rnd()*h;c.beginPath();c.moveTo(x,y);c.lineTo(x+12,y-7);c.lineTo(x+18,y+5);c.lineTo(x+45,y-12);c.stroke();}}
        else if(id==='mystery'){c.font='700 160px '+FONT;c.fillStyle=alpha(colors.text,0.35);c.textAlign='center';c.textBaseline='middle';c.fillText('?',w/2,h/2);}
      });
    }
    function surface(id,front) {
      const key=id+(front?'-front':'');if(surfaceMats.has(key))return surfaceMats.get(key);
      const props={wood:{roughness:0.72},boardwood:{roughness:0.68},waxed:{roughness:0.35,clearcoat:0.6},steel:{metalness:0.9,roughness:0.32},rubber:{roughness:0.95},concrete:{roughness:0.95},glass:{roughness:0.05,clearcoat:1,transparent:true,opacity:0.5,ior:1.5},snow:{roughness:1},ice:{roughness:0.08,clearcoat:1,transparent:true,opacity:0.75},custom:{roughness:0.5},mystery:{roughness:0.55},plain:{roughness:0.6}};
      const physical=['waxed','glass','ice'].includes(id);
      const m=mat(new (physical?THREE.MeshPhysicalMaterial:THREE.MeshStandardMaterial)(Object.assign({color:env.material(id).base},props[id]||props.plain)));
      if(id!=='mystery'||front)m.map=surfaceTexture(id);
      // 貼圖本身已有底色，避免再乘一次同色而失去材質亮度。
      if(m.map)m.color.set('#ffffff');
      themed.push(()=>{if(!m.map)m.color.setStyle(env.material(id).base);});surfaceMats.set(key,m);return m;
    }
    tableMat.map=makeTexture('table',512,256,(c,w,h)=>grain(c,w,h,tableColor(),true));tableMat.color.set('#ffffff');
    tableMat.map.wrapS=THREE.RepeatWrapping;tableMat.map.repeat.set(3,1);
    const ticksMat=mat(new THREE.MeshStandardMaterial({color:'#ffffff',roughness:0.68}));
    let boardId='boardwood';
    ticksMat.map=makeTexture('board-ticks',1024,32,(c,w,h)=>{
      const base=env.material(boardId).base;c.fillStyle=shade(base,-0.1);c.fillRect(0,0,w,h);c.strokeStyle=alpha(shade(base,-0.6),0.7);c.lineWidth=1.5;c.beginPath();
      for(let i=0;i<=Math.round(XMAX*10);i++){const x=(X0+i*0.1)/BOARD*w;c.moveTo(x,0);c.lineTo(x,h*(i%5===0?0.7:0.35));}c.stroke();
    });
    function repaint(id) { const q=textures.get(id);if(q){q.paint(q.canvas.getContext('2d'),q.canvas.width,q.canvas.height);q.texture.needsUpdate=true;} }

    // 21 組比例器材；桌腳只作實驗桌示意。
    box(scene,'table',3.4,0.06,1.3,tableMat,-1,-0.03,0);
    box(scene,'table-edge',3.4,0.06,0.02,edgeMat,-1,-0.03,0.66);
    [-2.62,0.62].forEach(x=>[-0.57,0.57].forEach(z=>box(scene,'table-leg',0.05,0.8,0.05,metal,x,-0.46,z)));
    const board=box(boardGroup,'board',BOARD,BT,0.30,surface('boardwood'),-BOARD/2,BT/2,0);
    cylinder(scene,'hinge',0.018,0.34,metal,0,0.012,0,'z');
    box(boardGroup,'top-peg',PEG_W,PEG_H,0.30,metal,-BOARD+PEG_W/2,BT+PEG_H/2,0);
    box(boardGroup,'bottom-stop',STOP_W,STOP_H,0.30,metal,-STOP_W/2,BT+STOP_H/2,0);
    box(boardGroup,'stop-pad',0.008,STOP_H,0.30,rubber,-STOP_W-0.004,BT+STOP_H/2,0);
    const supportBase=box(scene,'stand-base',0.34,0.025,0.22,metal,-2.04,0.0125,-0.24);
    const supportRod=cylinder(scene,'stand-rod',0.012,1,metal,0,0,0);
    const boss=box(scene,'boss-head',0.06,0.05,0.06,metal,0,0,0);
    const knob=cylinder(scene,'boss-knob',0.012,0.05,grip,0,0,0,'x');
    const arm=cylinder(scene,'stand-arm',0.008,0.10,metal,0,0,0,'z');
    const protractorMat=mat(new THREE.MeshPhysicalMaterial({color:colors.surface,transparent:true,opacity:0.22,roughness:0.1,clearcoat:1,side:THREE.DoubleSide,depthWrite:false}));
    themed.push(()=>protractorMat.color.setStyle(colors.surface));
    mesh(scene,'protractor',new THREE.CircleGeometry(0.6,64,Math.PI/2,Math.PI/2),protractorMat,v(0,0,-0.17),false);
    const arc=mesh(scene,'protractor-rim',new THREE.TorusGeometry(0.6,0.003,6,64,Math.PI/2),metal,v(0,0,-0.17),false);arc.rotation.z=Math.PI/2;
    const protractorTex=makeTexture('protractor',1024,1024,(c,w,h)=>{
      c.clearRect(0,0,w,h);const r=w*0.49,x=w/2,y=h/2;c.strokeStyle=colors.text;c.lineCap='round';
      for(let d=0;d<=90;d++){const a=Math.PI+d*DEG,len=r*(d%10===0?0.13:d%5===0?0.08:0.05);c.lineWidth=d%10===0?3:2;c.globalAlpha=d%10===0?0.75:d%5===0?0.6:0.45;c.beginPath();c.moveTo(x+(r-len)*Math.cos(a),y+(r-len)*Math.sin(a));c.lineTo(x+r*Math.cos(a),y+r*Math.sin(a));c.stroke();}
      c.globalAlpha=0.7;c.fillStyle=colors.text;c.font='700 34px '+FONT;c.textAlign='center';c.textBaseline='middle';for(let d=0;d<=90;d+=10){const a=Math.PI+d*DEG;c.fillText(String(d),x+r*0.78*Math.cos(a),y+r*0.78*Math.sin(a));}c.globalAlpha=1;
    });
    const scaleOverlay=mat(new THREE.MeshBasicMaterial({map:protractorTex,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    mesh(scene,'protractor-ticks',new THREE.PlaneGeometry(1.2245,1.2245),scaleOverlay,v(0,0,-0.168),false);
    const wedgeMat=colorMaterial(()=>colors.accent,{transparent:true,opacity:0.18,depthWrite:false,side:THREE.DoubleSide},true);
    const wedge=mesh(scene,'angle-wedge',new THREE.CircleGeometry(0.55,48,Math.PI,0),wedgeMat,v(0,0,-0.165),false);
    const block=box(boardGroup,'block',BL,BH,0.14,surface('wood'),0,BT+BH/2,0);
    const eye=group(boardGroup,'eye-screw');
    const eyeRing=torus(eye,'eye-ring',0.012,0.003,metal,0,0,0);eyeRing.rotation.y=Math.PI/2;
    cylinder(eye,'eye-shaft',0.003,0.012,metal,0.012,0,0,'x');
    const gates=GATES.map((gx,i)=>{
      const x=-BOARD+X0+gx, g=group(boardGroup,'photogate-'+(i+1));g.position.x=x;
      [-1,1].forEach(sg=>{box(g,'gate-post',0.025,0.20,0.025,plastic,0,BT+0.10,sg*0.19);box(g,'sensor',0.04,0.05,0.03,plastic,0,BT+BH/2,sg*0.1725);});
      box(g,'gate-crossbar',0.025,0.03,0.405,plastic,0,BT+0.20,0);
      const beamMat=colorMaterial(()=>colors.pos,{transparent:true,opacity:0.25,depthWrite:false},true);
      const glowMat=colorMaterial(()=>colors.pos,{transparent:true,opacity:0,depthWrite:false},true);
      const beam=cylinder(g,'beam',0.003,0.35,beamMat,0,BT+BH/2,0,'z');beam.castShadow=beam.receiveShadow=false;
      const glow=cylinder(g,'beam-glow',0.012,0.35,glowMat,0,BT+BH/2,0,'z');glow.castShadow=glow.receiveShadow=false;
      return {group:g,beamMat,glowMat};
    });
    const springScale=group(boardGroup,'spring-scale');
    const rope=cylinder(springScale,'rope',0.0012,0.06,textMat,0.03,0,0,'x');
    cylinder(springScale,'scale-tube',0.022,0.26,glassMat,0.19,0,0,'x');
    const coilPoints=[];for(let i=0;i<=288;i++){const u=i/288,a=24*Math.PI*u;coilPoints.push(v(u,0.013*Math.cos(a),0.013*Math.sin(a)));}
    const coil=mesh(springScale,'spring',new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coilPoints),288,0.0018,6,false),metal,v(0.07,0,0));
    const indicator=cylinder(springScale,'scale-pointer',0.016,0.004,pointerMat,0.13,0,0,'x');
    torus(springScale,'scale-ring',0.018,0.003,metal,0.34,0,0).rotation.y=Math.PI/2;
    const push=group(scene,'push-rod');
    box(push,'push-plate',0.012,0.09,0.10,metal,0.006,0,0);
    cylinder(push,'rod',0.011,0.36,metal,0.192,0,0,'x');
    cylinder(push,'force-meter',0.026,0.09,shellMat,0.23,0,0,'x');
    cylinder(push,'rod-grip',0.02,0.08,grip,0.412,0,0,'x');
    const handle=mesh(boardGroup,'handle',new THREE.SphereGeometry(0.035,24,16),handleMat,v(-BOARD+0.02,BT/2,0.17));
    const ruler=group(scene,'force-scale');ruler.position.set(-2.3,0.004,0.45);
    const rulerBar=box(ruler,'scale-bar',1,0.004,0.012,rulerMat,0,0,0);
    const rulerEndA=box(ruler,'scale-end',0.004,0.025,0.012,rulerMat,0,0.01,0);
    const rulerEndB=box(ruler,'scale-end',0.004,0.025,0.012,rulerMat,0,0.01,0);

    // 所有向量幾何建一次；只縮放箭身、箭頭與尾端。
    function arrowObject(id,key,opts) {
      opts=opts||{};const g=group(scene,id), material=colorMaterial(()=>colors[key],{roughness:0.4,emissive:colors[key],emissiveIntensity:colors.dark?0.25:0,transparent:!!opts.opacity,opacity:opts.opacity||1});
      const r=opts.r||0.008, headR=opts.headR||0.022;
      const shaft=mesh(g,'shaft',new THREE.CylinderGeometry(r,r,1,12),material,null,false);
      const head=mesh(g,'head',new THREE.ConeGeometry(headR,1,20),material,null,false);
      const segments=opts.dashed?Array.from({length:6},()=>mesh(g,'dash',new THREE.CylinderGeometry(r,r,1,10),material,null,false)):null;
      let tail=null;if(opts.tail)tail=mesh(g,'round-tail',new THREE.SphereGeometry(0.016,16,12),material,null,false);
      const a={group:g,shaft,head,segments,tail,material,key,opts};arrows.set(id,a);return a;
    }
    const W=arrowObject('W','neg'),N=arrowObject('N','accent'),f=arrowObject('f','pos'),F=arrowObject('F','b-mech',{tail:true});
    const P=arrowObject('P','muted'),net=arrowObject('net','b-optics',{opacity:0.55}),R=arrowObject('R','r-au',{r:0.010,headR:0.026});
    const Wpar=arrowObject('Wpar','neg',{r:0.005,dashed:true}),Wperp=arrowObject('Wperp','neg',{r:0.005,dashed:true});
    function setArrow(a,origin,vector,scale,visible) {
      const length=vector.length()*scale;a.group.visible=!!visible&&length>1e-7;
      if(!a.group.visible)return origin.clone();
      const direction=vector.clone().normalize(),hl=length<0.07?length*0.85:0.06,rad=length<0.07?hl/0.06:1;
      a.group.position.copy(origin);a.group.quaternion.setFromUnitVectors(axisY,direction);
      a.head.scale.set(rad,hl,rad);a.head.position.y=length-hl/2;
      const sl=Math.max(0.00001,length-hl);a.shaft.scale.y=sl;a.shaft.position.y=sl/2;a.shaft.visible=!a.segments;
      if(a.segments)a.segments.forEach((m,i)=>{m.scale.y=sl/6*0.6;m.position.y=(i+0.3)*sl/6;});
      if(a.tail)a.tail.position.set(0,0,0);
      return origin.clone().addScaledVector(direction,length+0.05);
    }
    // 錐體為單位 μ 的幾何，改係數只縮放 x/z。
    const coneRoot=group(boardGroup,'friction-cone');
    const coneMat=colorMaterial(()=>colors.pos,{transparent:true,opacity:0.12,side:THREE.DoubleSide,depthWrite:false},true);
    const cone=mesh(coneRoot,'static-cone',new THREE.ConeGeometry(0.5,0.5,64,1,true),coneMat,v(0,0.25,0),false);cone.rotation.x=Math.PI;
    const rimMat=colorMaterial(()=>colors.pos,{transparent:true,opacity:0.85,depthWrite:false},true);
    const rim=torus(coneRoot,'static-rim',0.5,0.004,rimMat,0,0.5,0);rim.rotation.x=Math.PI/2;
    const haloMat=colorMaterial(()=>colors.pos,{transparent:true,opacity:0.3,depthWrite:false},true);
    const halo=torus(coneRoot,'rim-glow',0.5,0.012,haloMat,0,0.5,0);halo.rotation.x=Math.PI/2;
    function line(parent,name,points,key,dashed,opacity) {
      const props={color:colors[key],transparent:true,opacity:opacity==null?0.7:opacity,depthWrite:false};
      const material=mat(dashed?new THREE.LineDashedMaterial(Object.assign(props,{dashSize:0.03,gapSize:0.02})):new THREE.LineBasicMaterial(props));
      themed.push(()=>material.color.setStyle(colors[key]));
      const l=new THREE.Line(geo(new THREE.BufferGeometry().setFromPoints(points)),material);l.name=name;if(dashed)l.computeLineDistances();parent.add(l);return l;
    }
    const circle=Array.from({length:97},(_,i)=>v(0.5*Math.cos(i/96*2*Math.PI),0,0.5*Math.sin(i/96*2*Math.PI)));
    const kinetic=line(coneRoot,'kinetic-rim',circle,'pos',true,0.6);kinetic.position.y=0.5;kinetic.material.dashSize=0.02;kinetic.material.gapSize=0.014;
    const normal=line(coneRoot,'normal', [v(0,0,0),v(0,0.55,0)],'muted',true);
    const plumb=line(scene,'plumb', [v(0,0,0),v(0,0.6,0)],'neg',true);
    const opposite=line(scene,'opposite-push',[v(0,0,0),v(0.6,0,0)],'b-mech',true);
    const axes=group(boardGroup,'incline-axes');
    line(axes,'x-axis',[v(0,0,0),v(0.45,0,0)],'muted',false);
    line(axes,'y-axis',[v(0,0,0),v(0,0.45,0)],'muted',false);
    const axesMat=colorMaterial(()=>colors.muted,{},true);
    const xHead=mesh(axes,'x-tip',new THREE.ConeGeometry(0.01,0.03,12),axesMat,v(0.45,0,0),false);xHead.rotation.z=-Math.PI/2;
    mesh(axes,'y-tip',new THREE.ConeGeometry(0.01,0.03,12),axesMat,v(0,0.45,0),false);

    // Sprite 文字經過共用的 2D Canvas 翻譯與字級設定；支援下標和小字上標。
    function textParts(text) {
      const re=/_\{([^}]*)\}|_([A-Za-z0-9])|\^(-?\d+)/g, parts=[];let end=0,m;
      while((m=re.exec(text))){if(m.index>end)parts.push({text:text.slice(end,m.index)});parts.push({text:m[1]||m[2]||m[3],sub:!m[3],sup:!!m[3]});end=re.lastIndex;}
      if(end<text.length)parts.push({text:text.slice(end)});return parts;
    }
    function label(id,text,position,key,visible) {
      let q=labels.get(id);
      if(!q){
        const c=document.createElement('canvas');c.width=1024;c.height=64;
        const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
        const m=mat(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,transparent:true,toneMapped:false}));
        const sprite=new THREE.Sprite(m);sprite.renderOrder=10;sprite.name='label-'+id;scene.add(sprite);
        const leader=line(scene,'label-leader-'+id,[v(0,0,0),v(0,0,0)],'muted',false,0.38);
        leader.material.depthTest=false;leader.renderOrder=9;
        q={canvas:c,texture,sprite,leader,text:'',version:-1,width:0};labels.set(id,q);
      }
      q.sprite.visible=!!visible;q.leader.visible=false;if(!visible)return;
      const ink=colors[key]||key;
      if(text!==q.text||q.version!==themeVersion||q.ink!==ink){
        q.text=text;q.version=themeVersion;q.ink=ink;
        const c=q.canvas.getContext('2d');const parts=textParts(text);
        const font=p=>(p.sub||p.sup?'600 20px ':'600 28px ')+FONT;
        let tw=0;parts.forEach(p=>{c.font=font(p);tw+=c.measureText(p.text).width;});
        // 保持 GPU 貼圖尺寸不變；改 Canvas 寬度會讓 WebGL 的既有儲存沿用舊字。
        q.width=Math.min(1022,Math.ceil(tw+20));c.clearRect(0,0,1024,64);
        c.fillStyle=alpha(colors['canvas-bg'],0.85);c.strokeStyle=alpha(ink,0.4);c.lineWidth=1.5;
        LD.roundRect(c,1,9,q.width-2,46,16);c.fill();c.stroke();
        c.textAlign='left';c.textBaseline='middle';c.lineJoin='round';let xx=10;
        parts.forEach(p=>{c.font=font(p);const yy=32+(p.sub?7:p.sup?-9:0);c.strokeStyle=colors['canvas-bg'];c.lineWidth=6;c.strokeText(p.text,xx,yy);c.fillStyle=ink;c.fillText(p.text,xx,yy);xx+=c.measureText(p.text).width;});
        q.texture.needsUpdate=true;
      }
      const h=narrow?0.075:0.06;
      q.sprite.scale.set(h*16,h,1);q.sprite.center.set(q.width/2048,0.5);q.sprite.position.copy(position);q.anchor=position.clone();
    }
    function hideLabels() { labels.forEach(q=>{q.sprite.visible=false;q.leader.visible=false;}); }
    function local(x,y,z) { return boardGroup.localToWorld(v(x,y,z)); }

    const hemi=new THREE.HemisphereLight('#ffffff',colors.equi,0.95);scene.add(hemi);
    const sun=new THREE.DirectionalLight('#ffffff',1.6);sun.castShadow=true;
    sun.shadow.camera.left=sun.shadow.camera.bottom=-2.6;sun.shadow.camera.right=sun.shadow.camera.top=2.6;
    sun.shadow.camera.near=0.5;sun.shadow.camera.far=12;sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.02;sun.shadow.radius=3;scene.add(sun,sun.target);
    const fill=new THREE.DirectionalLight('#ffffff',0.35);scene.add(fill,fill.target);
    function lighting() {
      hemi.color.set(colors.dark?'#8fa3ad':'#ffffff');hemi.groundColor.setStyle(shade(colors.equi,colors.dark?-0.7:0.5));hemi.intensity=colors.dark?0.55:0.95;
      sun.intensity=colors.dark?1.25:1.6;sun.shadow.mapSize.set(narrow?1024:2048,narrow?1024:2048);
      if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}
      coneMat.opacity=colors.dark?0.16:0.12;wedgeMat.opacity=colors.dark?0.26:0.18;
      arrows.forEach(a=>a.material.emissiveIntensity=colors.dark?0.25:0);
    }
    function autoFrame(s,name) {
      // 依水平與垂直視角各算一次、取大者：木板（含錐與標籤的上方空間）約佔畫面寬的七成，不再被整張實驗桌擠到角落
      const th=s.theta*DEG, target=local(-BOARD*(narrow?0.5:0.56),BT,0).add(v(0,0.24,0));
      const vt=Math.tan(camera.fov*DEG/2), ht=vt*camera.aspect;
      let distance=Math.max((BOARD*Math.cos(th)+0.75)/(2*ht),(BOARD*Math.sin(th)+0.95)/(2*vt))*1.08;
      let az=28*DEG,el=16*DEG;
      if(name==='side'){az=0;el=0;}
      if(name==='cone'){target.copy(local(-BOARD+X0+s.x,BT,0.09)).add(v(Math.sin(th),Math.cos(th),0).multiplyScalar(0.25));if(narrow)target.y+=0.16;distance=narrow?1.5:1.3;az=38*DEG;el=22*DEG;}
      return {target,position:target.clone().add(v(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(distance))};
    }
    function moveCamera(name,duration) {
      const dest=autoFrame(env.state(),name);
      if(reduced||!rendered||duration<=0){camera.position.copy(dest.position);controls.target.copy(dest.target);camera.lookAt(dest.target);controls.update();}
      else cameraTween={from:camera.position.clone(),targetFrom:controls.target.clone(),to:dest.position,targetTo:dest.target,start:performance.now(),duration};
      requestRender();
    }
    function updateHUD(s) {
      const fo=s.fo,angle=fo.N>0?(Math.atan2(Math.abs(fo.f),fo.N)/DEG).toFixed(1)+'°':'—';
      const critical=s.hide?'?':(Math.atan(s.mu.mus)/DEG).toFixed(1)+'°';
      const atLimit=fo.kind==='static'&&fo.fsMax>0&&Math.abs(fo.f)>=0.98*fo.fsMax;
      // 手機的 HUD 已移到畫面上方、有整行寬度，所以和寬版一樣寫完整句子
      const prefix=T('接觸力與法線夾角 α = ','Angle of R from the normal α = ');
      let line=prefix+angle+T('（θc = ',' (θc = ')+critical+T('）',')');
      if(atLimit||s.slipping)line+=T('・已到錐面',' · on the cone');
      if(fo.kind==='kinetic')line+=T('・貼在動摩擦錐上',' · on the kinetic cone');
      const lock=s.mode==='horiz'&&90-s.theta<=Math.atan(s.mu.mus)/DEG+1e-9;
      const rows=['t = '+s.t.toFixed(2)+' s'+(s.slow?T('（0.25×）',' (0.25×)'):''),s.status,line];
      if(lock&&!s.hide)rows.push(T('水平推力的反方向在錐內：自鎖','The opposite of the push lies inside the cone: self-locking'));
      const key=JSON.stringify([rows,s.statusColor,atLimit,s.slipping,fo.kind]);
      if(key!==lastHUD){
        lastHUD=key;env.hud.replaceChildren();rows.forEach((text,i)=>{const el=document.createElement(i===0?'b':'div');el.textContent=text;if(i===1)el.style.color=s.statusColor;if(i===2&&(atLimit||s.slipping))el.className='lim';env.hud.appendChild(el);});
      }
    }
    function sync(s) {
      const th=s.theta*DEG,cs=Math.cos(th),sn=Math.sin(th),bx=-BOARD+X0+s.x;
      boardGroup.rotation.z=-th;boardGroup.updateMatrixWorld(true);
      block.position.x=bx;eye.position.set(bx-BL/2-0.012,BT+BH/2,0);
      const id=s.mats.board==='wood'?'boardwood':s.mats.board;
      if(boardId!==id||!Array.isArray(board.material)){boardId=id;const m=surface(id);board.material=[m,m,m,m,ticksMat,m];repaint('board-ticks');}
      const blockMaterial=surface(s.mats.block);block.material=s.mats.block==='mystery'?[blockMaterial,blockMaterial,blockMaterial,blockMaterial,surface('mystery',true),blockMaterial]:blockMaterial;
      const h=2.04*sn-0.02,x=-2.04*cs;supportBase.position.x=x;
      supportRod.visible=boss.visible=knob.visible=arm.visible=h>=0.05;
      supportRod.scale.y=Math.max(0.001,h);supportRod.position.set(x,0.025+h/2,-0.24);
      boss.position.set(x,2.04*sn-0.03,-0.24);knob.position.set(x-0.04,boss.position.y,-0.24);arm.position.set(x,boss.position.y,-0.19);
      if(lastWedge!==s.theta){geometries.delete(wedge.geometry);wedge.geometry.dispose();
        // CircleGeometry 正角逆時針；從 π−θ 掃到 π 才在桌面上方。
        wedge.geometry=geo(new THREE.CircleGeometry(0.55,48,Math.PI-th,th));lastWedge=s.theta;
      }
      gates.forEach((g,i)=>{g.beamMat.opacity=s.gates[i].blocked?0.95:0.25+0.7*s.gates[i].flash;g.glowMat.opacity=s.gates[i].blocked?0.25:0.25*s.gates[i].flash;});
      springScale.visible=s.mode==='along'&&Math.abs(s.F)>1e-9;
      const dir=s.F>0?-1:1;springScale.position.set(bx+dir*(BL/2+0.016),BT+BH/2,0);springScale.rotation.y=dir<0?Math.PI:0;
      const ls=0.06+0.14*Math.min(Math.abs(s.F),100)/100;coil.scale.x=ls;indicator.position.x=0.07+ls;
      push.visible=s.mode==='horiz'&&s.F>1e-9;
      const center=local(bx,BT+BH/2,0),origin=local(bx,BT+BH/2,0.09),contact=local(bx,BT,0.09);
      const lambda=Math.min(BL/2/Math.max(cs,1e-9),BH/2/Math.max(sn,1e-9));push.position.copy(center).add(v(lambda,0,0));
      handle.scale.setScalar(hovering?1.08:1);handleMat.emissiveIntensity=hovering?0.35:0;
      const t=v(cs,-sn,0),n=v(sn,cs,0),fo=s.fo,kF=0.55/s.nice;
      hideLabels();
      const q=value=>s.hide?'?':Math.abs(value).toFixed(Math.abs(value)<10?2:1)+' N';
      function force(a,from,vector,text,key,visible){const p=setArrow(a,from,vector,kF,visible);label(a.group.name,text,p,key,visible&&a.group.visible);}
      force(W,origin,v(0,-fo.W,0),'W '+fo.W.toFixed(1)+' N','neg',true);
      force(N,origin,n.clone().multiplyScalar(fo.N),'N '+q(fo.N),'accent',true);
      force(f,contact,t.clone().multiplyScalar(fo.f),(fo.kind==='kinetic'?'f_k ':'f_s ')+q(fo.f),'pos',Math.abs(fo.f)>1e-6);
      force(F,origin,s.mode==='horiz'?v(-s.F,0,0):t.clone().multiplyScalar(-s.F),'F '+Math.abs(s.F).toFixed(Math.abs(s.F)<10?2:1)+' N','b-mech',Math.abs(s.F)>1e-9);
      force(P,origin,t.clone().multiplyScalar(fo.P),(s.phase==='held'?T('手 ','Hand '):T('擋板 ','Stop '))+q(fo.P),'muted',Math.abs(fo.P)>1e-6);
      force(net,origin,t.clone().multiplyScalar(fo.net),'ΣF '+q(fo.net),'b-optics',s.show.net&&Math.abs(fo.net)>1e-6);
      force(Wpar,origin,t.clone().multiplyScalar(fo.Wpar),'mg sinθ','neg',s.show.comp);
      force(Wperp,origin,n.clone().multiplyScalar(-fo.Wperp),'mg cosθ','neg',s.show.comp);
      force(R,contact,n.clone().multiplyScalar(fo.N).addScaledVector(t,fo.f),T('接觸力 R = N + f','Contact force R = N + f'),'r-au',s.show.cone);
      coneRoot.position.set(bx,BT,0.09);coneRoot.visible=s.show.cone;
      cone.visible=rim.visible=kinetic.visible=!s.hide;
      cone.scale.set(s.mu.mus,1,s.mu.mus);rim.scale.set(s.mu.mus,s.mu.mus,1);halo.scale.copy(rim.scale);
      kinetic.scale.set(s.mu.muk,1,s.mu.muk);
      const lit=(fo.kind==='static'&&fo.fsMax>0&&Math.abs(fo.f)>=0.98*fo.fsMax)||s.slipping;
      rimMat.opacity=lit?1:0.85;halo.visible=!s.hide&&s.show.cone&&lit&&!reduced;
      normal.visible=true;
      plumb.position.copy(contact);plumb.visible=s.show.cone;
      opposite.position.copy(contact);opposite.visible=s.show.cone&&s.mode==='horiz';
      label('cone',T('摩擦錐 θ_c = ','Friction cone θ_c = ')+(Math.atan(s.mu.mus)/DEG).toFixed(1)+'°',local(bx-0.10,BT+0.57,0.09),'pos',s.show.cone&&!s.hide);
      label('kinetic',T('動摩擦錐 tan^-1 μ_k = ','Kinetic cone tan^-1 μ_k = ')+(Math.atan(s.mu.muk)/DEG).toFixed(1)+'°',local(bx+0.12,BT+0.43,0.09),'pos',s.show.cone&&!s.hide);
      label('plumb',T('鉛垂線','Plumb line'),contact.clone().add(v(0,0.66,0)),'neg',s.show.cone);
      const locked=90-s.theta<=Math.atan(s.mu.mus)/DEG+1e-9;
      label('opposite',T('水平推力的反方向','Opposite of the push')+(!s.hide&&locked?T('・在錐內 → 自鎖',' · inside → self-locking'):''),contact.clone().add(v(0.68,0,0)),'b-mech',s.show.cone&&s.mode==='horiz');
      label('mystery',T('?  錐的大小要自己量','?  Measure the cone yourself'),contact.clone().addScaledVector(n,0.35),'b-optics',s.show.cone&&s.hide);
      axes.visible=s.show.axes;axes.position.set(bx,BT+BH/2,0.09);
      label('xaxis',T('x（沿斜面向下 +）','x (down the slope +)'),origin.clone().addScaledVector(t,0.49),'muted',s.show.axes);
      label('yaxis',T('y（垂直斜面）','y (normal)'),origin.clone().addScaledVector(n,0.49),'muted',s.show.axes);
      gates.forEach((g,i)=>label('gate'+i,String(i+1),local(g.group.position.x,BT+0.27,0),'pos',true));
      label('tool',s.mode==='along'?T('彈簧秤（示意）','Spring scale (schematic)'):T('推桿（示意）','Push rod (schematic)'),s.mode==='along'?local(bx+dir*0.32,BT+BH/2-0.07,0):push.position.clone().add(v(0.23,-0.09,0)),'muted',Math.abs(s.F)>1e-9);
      const length=0.55*s.bar/s.nice;rulerBar.scale.x=length;rulerBar.position.x=length/2;rulerEndB.position.x=length;
      label('scale',s.bar+' N',v(-2.3+length/2,0.07,0.45),'text',true);
      updateHUD(s);
      sun.target.position.copy(local(-BOARD/2,BT,0));sun.position.copy(sun.target.position).add(v(-2,4.5,3));
      fill.target.position.copy(sun.target.position);fill.position.copy(sun.target.position).add(v(2,1.5,-2.5));
      if(previousTheta!==s.theta){if(previousTheta!=null&&!viewLocked)moveCamera('',300);previousTheta=s.theta;}
    }
    function avoidLabels() {
      const hr=env.hud.getBoundingClientRect(),cr=canvas.getBoundingClientRect();
      const placed=[{x:hr.left-cr.left-4,y:hr.top-cr.top-4,w:hr.width+8,h:hr.height+8}];
      const n=v(Math.sin(env.state().theta*DEG),Math.cos(env.state().theta*DEG),0);
      // 「水平推力的反方向」與神秘表面的「?」也要參加避讓（原本沒列入，會疊在別的標籤上）
      const rank=['cone','plumb','R','opposite','mystery','N','f','W','F','kinetic','P','net','Wpar','Wperp','xaxis','yaxis','gate0','gate1','tool','scale'];
      // 分主次：主角（錐、鉛垂線、R 與主要的力）可以拉短引線離開一點；次要標籤只放在原位附近，放不下就先不顯示
      // （箭頭本身照畫，顏色看下方圖例）。手機的遠景只留主角，避免整個場景被標籤蓋住。
      const MAIN={cone:1,plumb:1,R:1,opposite:1,mystery:1,N:1,f:1,W:1,F:1};
      rank.forEach(id=>{
        const q=labels.get(id);if(!q||!q.sprite.visible)return;
        const base=q.anchor.clone(),p0=base.clone().project(camera);
        const depth=base.clone().applyMatrix4(camera.matrixWorldInverse).z;
        if(depth>=-camera.near||p0.z>1||p0.z< -1||Math.abs(p0.x)>1.1||Math.abs(p0.y)>1.1){q.sprite.visible=false;return;}
        // Canvas 的字只佔貼圖高 28/64；以實際字高保證至少 11 CSS px。
        const pxPerM=height/(-2*depth*Math.tan(camera.fov*DEG/2));
        let h=Math.max(narrow?0.075:0.06,11/pxPerM*64/28);
        h=Math.min(h,18/pxPerM*64/28,(width-12)/(q.width/64*pxPerM));
        q.sprite.scale.set(h*16,h,1);
        const pw=q.width/64*h*pxPerM,ph=46/64*h*pxPerM;
        const bx=(p0.x+1)*width/2,by=(1-p0.y)*height/2;
        const main=!!MAIN[id], overview=pxPerM<(narrow?300:180);
        if(!main&&narrow&&overview){q.sprite.visible=false;return;}
        const candidates=[];
        for(let i=0;i<=(main?4:2);i++){const p=base.clone().addScaledVector(n,0.07*i).project(camera);candidates.push([(p.x+1)*width/2,(1-p.y)*height/2]);}
        // 主角標籤以短引線保持可讀；最多離開 4 格（手機 3 格），不再疊成一整欄。
        const rMax=main?(narrow?3:4):1;
        for(let r=1;r<=rMax;r++)for(const dx of [0,-1,1,-2,2])for(const dy of [-1,1])candidates.push([bx+dx*r*18,by+dy*r*(ph+3)]);
        let best=null,cost=Infinity;
        candidates.forEach(([x,y])=>{
          x=Math.max(pw/2+3,Math.min(width-pw/2-3,x));y=Math.max(ph/2+3,Math.min(height-ph/2-3,y));
          const rect={x:x-pw/2,y:y-ph/2,w:pw,h:ph};
          if(placed.some(b=>rect.x<b.x+b.w+2&&rect.x+rect.w+2>b.x&&rect.y<b.y+b.h+2&&rect.y+rect.h+2>b.y))return;
          const c=Math.hypot(x-bx,y-by);if(c<cost){best={x,y,rect};cost=c;}
        });
        if(!best&&main&&!narrow){
          for(let y=ph/2+3;y<=height-ph/2-3;y+=ph+3)for(const x of [pw/2+3,width/2,width-pw/2-3]){
            const rect={x:x-pw/2,y:y-ph/2,w:pw,h:ph};
            if(placed.some(b=>rect.x<b.x+b.w+2&&rect.x+rect.w+2>b.x&&rect.y<b.y+b.h+2&&rect.y+rect.h+2>b.y))continue;
            const c=Math.hypot(x-bx,y-by);if(c<cost){best={x,y,rect};cost=c;}
          }
        }
        if(!best){q.sprite.visible=false;return;}
        const location=v(best.x/width*2-1,1-best.y/height*2,p0.z).unproject(camera);q.sprite.position.copy(location);
        placed.push(best.rect||{x:best.x-pw/2,y:best.y-ph/2,w:pw,h:ph});
        q.leader.visible=cost>12&&Number.isFinite(cost);
        if(q.leader.visible){const a=q.leader.geometry.attributes.position;a.setXYZ(0,base.x,base.y,base.z);a.setXYZ(1,location.x,location.y,location.z);a.needsUpdate=true;q.leader.geometry.computeBoundingSphere();}
      });
    }
    function requestRender() { if(active&&!document.hidden&&!frame)frame=requestAnimationFrame(render); }
    function render(now) {
      frame=0;if(!active||document.hidden)return;
      const s=env.state();sync(s);
      if(cameraTween){
        const u=Math.min(1,(now-cameraTween.start)/cameraTween.duration),ease=1-Math.pow(1-u,3);
        movingCamera=true;camera.position.lerpVectors(cameraTween.from,cameraTween.to,ease);controls.target.lerpVectors(cameraTween.targetFrom,cameraTween.targetTo,ease);camera.lookAt(controls.target);movingCamera=false;
        if(u===1)cameraTween=null;
      }
      const before=camera.position.clone(),target=controls.target.clone();
      movingCamera=true;controls.update();movingCamera=false;
      const changed=before.distanceToSquared(camera.position)+target.distanceToSquared(controls.target)>1e-12;
      if(changed)damping=2;else damping=Math.max(0,damping-1);
      camera.updateMatrixWorld();avoidLabels();renderer.render(scene,camera);rendered=true;
      if(s.animating||s.effects||dragging||cameraTween||damping)requestRender();
    }
    function update() {
      if(!active)return;
      const s=env.state();
      // 靜止時只更新 HTML 時鐘，不為時間流逝重畫整個 WebGL 場景。
      updateHUD(s);
      const key=JSON.stringify([s.theta,s.m,s.mode,s.F,s.phase,s.x,s.v,s.animating?s.t.toFixed(2):null,s.mu.mus,s.mu.muk,s.surf,s.nice,s.bar,s.show,s.gates,s.status,s.dragging,s.slipping,themeVersion]);
      if(key!==lastKey){lastKey=key;requestRender();}
    }
    function resize() {
      const w=env.host.clientWidth;if(!w)return;
      const nar=w<560,h=Math.round(w/(nar?4/3:3/2)),changed=nar!==narrow;
      if(w===width&&h===height)return;
      width=w;height=h;narrow=nar;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=nar?40:35;camera.updateProjectionMatrix();
      if(changed)lighting();if(!viewLocked)moveCamera('',0);requestRender();
    }
    const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),plane=new THREE.Plane(zAxis,0),point=new THREE.Vector3();
    function ray(e) { const b=canvas.getBoundingClientRect();ndc.set((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1);raycaster.setFromCamera(ndc,camera); }
    function hover(e) {
      ray(e);if(raycaster.intersectObject(handle,false).length>0)return true;
      // 保持比例球的大小，另給手機至少 44 px 的可抓取範圍。
      const p=handle.getWorldPosition(new THREE.Vector3()).project(camera),b=canvas.getBoundingClientRect();
      return p.z>=-1&&p.z<=1&&Math.hypot(e.clientX-b.left-(p.x+1)*b.width/2,e.clientY-b.top-(1-p.y)*b.height/2)<=22;
    }
    function dragAngle(e,done) { ray(e);if(raycaster.ray.intersectPlane(plane,point)){const d=Math.atan2(point.y,-point.x)/DEG;env.setAngle(Math.max(0,Math.min(90,d)),done);} }
    function down(e) {
      if(e.button!==0||!hover(e))return;
      e.preventDefault();e.stopImmediatePropagation();dragging=true;pointerId=e.pointerId;controls.enabled=false;cameraTween=null;
      canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';dragAngle(e,false);requestRender();
    }
    function move(e) {
      if(dragging){e.preventDefault();e.stopImmediatePropagation();dragAngle(e,false);requestRender();return;}
      const hot=hover(e);if(hot!==hovering){hovering=hot;canvas.style.cursor=hot?'grab':'';requestRender();}
    }
    function up(e) {
      if(!dragging||e.pointerId!==pointerId)return;
      e.preventDefault();e.stopImmediatePropagation();dragAngle(e,true);dragging=false;controls.enabled=true;pointerId=null;canvas.style.cursor=hovering?'grab':'';requestRender();
    }
    function leave() { if(!dragging&&hovering){hovering=false;canvas.style.cursor='';requestRender();} }
    function controlsStart() { if(!dragging){controls.maxPolarAngle=88*DEG;viewLocked=true;cameraTween=null;damping=2;requestRender();} }
    function controlsChange() { if(!movingCamera){damping=2;requestRender();} }
    function visibility() { if(document.hidden){if(frame)cancelAnimationFrame(frame);frame=0;}else requestRender(); }
    function lost(e) { e.preventDefault();if(active)env.lost(); }
    canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',move,true);
    canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',up,true);canvas.addEventListener('pointerleave',leave);
    canvas.addEventListener('webglcontextlost',lost);document.addEventListener('visibilitychange',visibility);
    controls.addEventListener('start',controlsStart);controls.addEventListener('change',controlsChange);
    const observer=new ResizeObserver(resize);observer.observe(env.host);
    function onTheme() {
      readColors();themeVersion++;themed.forEach(fn=>fn());textures.forEach((q,id)=>repaint(id));
      tableMat.color.set('#ffffff');lighting();lastKey='';update();
    }
    function dispose() {
      if(!active)return;active=false;api.active=false;if(frame)cancelAnimationFrame(frame);frame=0;
      if(dragging)env.setAngle(env.state().theta,true);
      observer.disconnect();document.removeEventListener('visibilitychange',visibility);
      canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',move,true);
      canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',up,true);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('webglcontextlost',lost);
      controls.removeEventListener('start',controlsStart);controls.removeEventListener('change',controlsChange);controls.dispose();
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(q=>q.texture.dispose());labels.forEach(q=>q.texture.dispose());
      renderer.dispose();renderer.forceContextLoss();canvas.remove();env.hud.replaceChildren();
    }
    const api={active:true,update,onTheme,resetCamera:()=>{controls.maxPolarAngle=88*DEG;viewLocked=false;moveCamera('',400);},viewFrom:name=>{controls.maxPolarAngle=name==='side'?Math.PI/2:88*DEG;viewLocked=true;moveCamera(name,400);},dispose};
    lighting();sync(env.state());resize();moveCamera('',0);update();return api;
  }
  window.InclineThree = { create };
})();
