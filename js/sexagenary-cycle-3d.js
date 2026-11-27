/* The board lies in local XY with depth along Z. Both wheels use the same module and core outline. */
(function () {
  'use strict';
  const K = window.SexagenaryCore;
  async function create(host, bridge) {
    const [THREE, { OrbitControls }] = await Promise.all([
      import('../vendor/three/three.module.min.js'), import('../vendor/three/OrbitControls.js')
    ]);
    if (!bridge.active()) return null;
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', bridge.T('咬合的十齒與十二齒木輪和六十格轉盤','Meshing ten- and twelve-tooth wooden wheels and a sixty-position dial'));
    const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.append(canvas);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32,1,.15,180);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = .18;
    controls.minDistance = 9; controls.maxDistance = 90; controls.maxPolarAngle = Math.PI * .47;
    const nav = LabView3DNav.attach({ THREE, controls, canvas, host, radius:13, T:bridge.T });
    const board = new THREE.Group();
    board.rotation.x = -Math.PI / 2; scene.add(board);
    const materials = new Set(), textures = new Set();
    function material(color, extras) {
      const m = new THREE.MeshStandardMaterial({ color, roughness:.64, ...extras });
      materials.add(m); return m;
    }
    const walnut = material(0x81563b), iron = material(0x304339,{metalness:.48});
    const brass = material(0xe2b05e,{metalness:.58,roughness:.34}), red = material(0xb54f32);
    const plate = material(0x476457), floor = material(0xb0aaa0);
    function mesh(parent, geo, mat, x, y, z) {
      const m = new THREE.Mesh(geo,mat); m.position.set(x,y,z);
      m.castShadow = m.receiveShadow = true; parent.add(m); return m;
    }
    function disk(parent, r, h, mat, x, y, z) {
      const geo = new THREE.CylinderGeometry(r,r,h,72);
      geo.rotateX(Math.PI/2);
      return mesh(parent,geo,mat,x,y,z);
    }
    function texture(size, painter) {
      const sheet = document.createElement('canvas'); sheet.width = sheet.height = size;
      const g = sheet.getContext('2d'); painter(g,size);
      const t = new THREE.CanvasTexture(sheet); t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(4,renderer.capabilities.getMaxAnisotropy());
      textures.add(t); return t;
    }
    function wood(g, size, light) {
      g.fillStyle = light ? '#d5a16a' : '#a06b45'; g.fillRect(0,0,size,size);
      for (let i = 0; i < 195; i++) {
        const y = size * i / 192;
        g.lineWidth = i % 4 ? 1.4 : 3;
        g.strokeStyle = i % 3 ? 'rgba(91,48,24,.16)' : 'rgba(255,231,183,.34)';
        g.beginPath();
        for (let x = -5; x <= size+7; x += 8) {
          const yy = y + 3*Math.sin(x/53 + i*.07) + 4*Math.sin(x/137+y*.026);
          if (x === -5) g.moveTo(x,yy); else g.lineTo(x,yy);
        }
        g.stroke();
      }
    }
    function wheelFace(n) {
      const labels = n === 10 ? [K.stems,K.stemEn] : [K.branches,K.branchEn];
      return texture(768,(g,size) => {
        wood(g,size,n === 10); const r = size/2;
        g.translate(r,r);
        function ring(rad, width, color) {
          g.beginPath(); g.arc(0,0,rad,0,K.TAU); g.strokeStyle=color; g.lineWidth=width; g.stroke();
        }
        ring(r*.79,r*.31,n === 10 ? '#e9c795' : '#294f49');
        ring(r*.965,4,'#694725'); ring(r*.933,3,'#f0ce88'); ring(r*.633,4,'#c39a61');
        ring(r*.48,3,'rgba(70,40,23,.55)');
        for (let i=0;i<n;i++) {
          const angle=K.labelAngle(n,i);
          g.save();g.rotate(Math.PI/2-angle);g.translate(0,-r*.785);
          g.fillStyle=n===10?'#372819':'#f9e7c2';g.textAlign='center';g.textBaseline='middle';
          g.font='bold '+(bridge.english?45:65)+'px Georgia, "Microsoft JhengHei", serif';
          g.fillText(bridge.T(labels[0][i],labels[1][i]),0,0);g.restore();
        }
      });
    }
    function face(parent,r,z,t) {
      const m=material(0xffffff,{map:t,roughness:.78});
      return mesh(parent,new THREE.CircleGeometry(r,112),m,0,0,z);
    }
    function cutGear(teeth, mate, module, depth, bevel) {
      const shape=new THREE.Shape();
      K.gearOutline(teeth,mate).forEach(([x,y],i)=>i?shape.lineTo(x*module,y*module):shape.moveTo(x*module,y*module));
      shape.closePath();
      // All material stays inside the tested boundary, including its chamfer.
      return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,
        bevelOffset:-bevel,bevelSegments:1,curveSegments:5});
    }
    function toothGrain(g,size,n){
      const light=n===10, scale=size/(n+2), root=(n/2-1.25)*scale;
      wood(g,size,light);g.translate(size/2,size/2);
      for(let i=0;i<n;i++){
        g.save();g.rotate(-i*K.TAU/n);
        g.beginPath();g.arc(0,0,size*.72,-Math.PI/n,Math.PI/n);
        g.arc(0,0,root,Math.PI/n,-Math.PI/n,true);g.closePath();g.clip();
        const shade=g.createLinearGradient(root,0,size/2,0);
        shade.addColorStop(0,light?'#c6935c':'#8c5737');shade.addColorStop(1,light?'#edc891':'#bd8758');
        g.fillStyle=shade;g.fillRect(0,-size/2,size/2,size);
        for(let j=-9;j<=9;j++){
          const y=j*scale*.10;
          g.beginPath();g.moveTo(root-2,y*.8);
          g.bezierCurveTo(root+scale*.7,y+scale*.05,size/2-scale*.55,y-scale*.05,size/2+2,y*.94);
          g.strokeStyle=j%3?'rgba(82,44,24,.29)':'rgba(255,230,182,.55)';g.lineWidth=scale*(j%3?.022:.033);g.stroke();
        }g.restore();
      }
    }
    function makeWheel(n,x) {
      const group=new THREE.Group();group.position.set(x,K.drive.stemY,.59);board.add(group);
      group.name=n===10?'stem-wheel':'branch-wheel';
      const geom=cutGear(n,n===10?12:10,1,.72,.045);
      const xy=geom.attributes.position, uv=geom.attributes.uv, diameter=n+2;
      for(let i=0;i<xy.count;i++)uv.setXY(i,.5+xy.getX(i)/diameter,.5+xy.getY(i)/diameter);
      const grain=texture(768,(ctx,size)=>toothGrain(ctx,size,n));
      const cap=material(0xffefd7,{map:grain,roughness:.62});
      mesh(group,geom,[cap,walnut],0,0,0);
      const r=n/2-1.28;
      face(group,r,.78,wheelFace(n));
      disk(group,r*.34,.18,iron,0,0,.88);disk(group,r*.23,.22,brass,0,0,1.02);
      mesh(group,new THREE.BoxGeometry(r*.23,.07,.035),walnut,0,0,1.145);
      return group;
    }
    // Frame, raised bed, brass corner fasteners and wheel bearings.
    const frameWood=material(0x896843,{map:texture(384,(g,size)=>wood(g,size,true)),roughness:.55});
    mesh(board,new THREE.BoxGeometry(25.6,19.6,.85),frameWood,0,1,-.42);
    mesh(board,new THREE.BoxGeometry(25.05,19.05,.17),brass,0,1,-.015);
    mesh(board,new THREE.BoxGeometry(24.83,18.83,.18),plate,0,1,.11);
    for (const x of [-11.75,11.75]) for (const y of [-7.65,9.65]) {
      disk(board,.19,.12,brass,x,y,.25);
      mesh(board,new THREE.BoxGeometry(.21,.045,.02),iron,x,y,.32);
    }
    for (const x of [-5.5,5.5]) disk(board,.67,.44,iron,x,-1.2,.38);
    const d=K.drive, stem=makeWheel(10,d.stemX), branch=makeWheel(12,5.5);
    const dial=new THREE.Group();dial.name='index-dial';dial.position.set(d.dialX,d.dialY,1.43);board.add(dial);
    const rim=mesh(dial,cutGear(d.ringTeeth,d.pinionTeeth,d.module,.25,.012),brass,0,0,0);
    rim.name='dial-ring';rim.rotation.z=Math.PI/d.ringTeeth;
    disk(dial,3.15,.11,iron,0,0,.275);
    const dialTex=texture(640,(g,size)=>{
      const r=size/2;g.translate(r,r);g.fillStyle='#e3ce9f';g.fillRect(-r,-r,size,size);
      g.strokeStyle='#70532c';g.lineWidth=4;
      for(const rad of [.94,.58,.32]){g.beginPath();g.arc(0,0,r*rad,0,K.TAU);g.stroke();}
      for(let k=0;k<60;k++){
        const mark=k===0||(k+1)%5===0;
        g.save();g.rotate(-k*K.TAU/60);
        g.fillStyle=k===0?'#9d392b':'#51432c';g.fillRect(-2,-r*.94,4,r*(mark?.17:.10));
        if(mark){g.font='bold 31px Georgia';g.textAlign='center';g.textBaseline='middle';g.fillText(String(k+1),0,-r*.67);}
        g.restore();
      }
    });
    face(dial,3.09,.339,dialTex);
    const spindle=new THREE.Group();spindle.position.set(d.dialX,d.dialY,1.86);board.add(spindle);
    disk(board,.65,1.42,iron,d.dialX,d.dialY,.82);
    disk(spindle,.90,.12,brass,0,0,0);
    face(spindle,.82,.075,texture(160,(g,s)=>{
      g.fillStyle='#365045';g.fillRect(0,0,s,s);g.fillStyle='#faeac4';
      g.font='bold 82px Georgia';g.textAlign='center';g.textBaseline='middle';g.fillText('60',s/2,s/2);
    }));

    // A coupling rod joins matching eccentric pins on the stem wheel and on a
    // second shaft. The pinion and the brass rim share pitch and face elevation.
    const copper=material(0xbe7544,{metalness:.48,roughness:.35});
    disk(board,.43,1.40,iron,d.pinionX,d.dialY,.83);
    const pinion=mesh(board,cutGear(d.pinionTeeth,d.ringTeeth,d.module,.25,.012),copper,d.pinionX,d.dialY,1.43);
    pinion.name='dial-pinion';
    function crank(x,y){
      const arm=new THREE.Group();board.add(arm);arm.position.set(x,y,1.89);
      disk(arm,.25,.22,iron,0,0,-.06);
      mesh(arm,new THREE.BoxGeometry(d.crank,.32,.16),brass,d.crank/2,0,.035);
      disk(arm,.21,.25,brass,d.crank,0,.08);
      disk(arm,.12,.16,iron,d.crank,0,.26);return arm;
    }
    const cranks=[crank(d.stemX,d.stemY),crank(d.pinionX,d.dialY)];
    cranks[0].name='stem-crank';cranks[1].name='pinion-crank';
    const distance=Math.hypot(d.pinionX-d.stemX,d.dialY-d.stemY);
    // A slotted strap leaves the wood and the teeth visible underneath.
    const strap=new THREE.Shape(), width=.215;
    strap.moveTo(-width,0);strap.lineTo(-width,distance);strap.absarc(0,distance,width,Math.PI,0,true);
    strap.lineTo(width,0);strap.absarc(0,0,width,0,-Math.PI,true);strap.closePath();
    const slot=new THREE.Path(), halfSlot=.064;
    slot.moveTo(-halfSlot,.66);slot.lineTo(-halfSlot,distance-.66);
    slot.absarc(0,distance-.66,halfSlot,Math.PI,0,true);slot.lineTo(halfSlot,.66);
    slot.absarc(0,.66,halfSlot,0,-Math.PI,true);slot.closePath();strap.holes.push(slot);
    const rod=mesh(board,new THREE.ExtrudeGeometry(strap,{depth:.12,bevelEnabled:true,bevelSize:.027,
      bevelThickness:.025,bevelSegments:2}),brass,0,0,2.12);
    rod.name='coupling-rod';rod.rotation.z=-Math.atan2(d.pinionX-d.stemX,d.dialY-d.stemY);
    for(const y of [0,distance]){
      disk(rod,.145,.11,iron,0,y,.15);
      mesh(rod,new THREE.BoxGeometry(.17,.036,.022),brass,0,y,.21);
    }
    function pointer(x,y,z) {
      const tri=new THREE.Shape();tri.moveTo(-.28,.55);tri.lineTo(.28,.55);tri.lineTo(0,-.25);tri.closePath();
      mesh(board,new THREE.ExtrudeGeometry(tri,{depth:.14,bevelEnabled:false}),red,x,y,z);
    }
    pointer(-5.5,d.stemY+5-.9,1.54);pointer(5.5,d.stemY+6-.9,1.54);
    disk(board,.30,1.53,iron,d.dialX,d.dialY+3.59,.99);
    pointer(d.dialX,d.dialY+3.14,1.83);
    const ground=mesh(scene,new THREE.PlaneGeometry(200,200),floor,0,-.91,0);
    ground.rotation.x=-Math.PI/2;ground.castShadow=false;
    scene.add(new THREE.HemisphereLight(0xfff4dd,0x6c716e,1.45));
    const sun=new THREE.DirectionalLight(0xffedcd,2.55);sun.position.set(-10,19,8);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-19,right:19,top:19,bottom:-19,near:1,far:68});
    sun.shadow.bias=-.0004;sun.shadow.normalBias=.027;scene.add(sun);
    let frame=0,disposed=false;
    function draw(){
      frame=0;if(disposed||document.hidden||!bridge.active())return;
      controls.update();renderer.render(scene,camera);
    }
    function invalidate(){if(!frame&&!disposed&&!document.hidden)frame=requestAnimationFrame(draw);}
    controls.addEventListener('change',invalidate);
    function fit(){
      const aspect=host.clientWidth/Math.max(1,host.clientHeight);
      const d=Math.max(39,53/Math.max(.5,aspect));
      controls.target.set(0,.2,-.7);
      camera.position.copy(controls.target).add(new THREE.Vector3(.06,.88,.48).normalize().multiplyScalar(d));
      controls.update();nav.home();invalidate();
    }
    function resize(){if(!host.clientWidth||!host.clientHeight)return;renderer.setSize(host.clientWidth,host.clientHeight,false);
      camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();invalidate();}
    function theme(){
      const dark=window.LabDraw.dark;scene.background=new THREE.Color(dark?0x15211e:0xe7e2d5);
      floor.color.setHex(dark?0x26332e:0xc0b8a7);plate.color.setHex(dark?0x334d43:0x4d6856);invalidate();
    }
    function update(t){
      const a=K.angles(t),pose=K.drivePose(t);
      stem.rotation.z=a.stem;branch.rotation.z=a.branch;dial.rotation.z=a.dial;pinion.rotation.z=pose.pinion;
      cranks.forEach(arm=>{arm.rotation.z=Math.atan2(pose.dy,pose.dx);});
      rod.position.set(d.stemX+pose.dx,d.stemY+pose.dy,2.12);invalidate();
    }
    const observer=new ResizeObserver(resize);observer.observe(host);
    resize();theme();fit();update(bridge.position());
    function dispose(){
      disposed=true;cancelAnimationFrame(frame);observer.disconnect();
      controls.removeEventListener('change',invalidate);nav.dispose();controls.dispose();
      scene.traverse(o=>o.geometry?.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
      sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();
    }
    return { update,theme,fit,dispose };
  }
  window.Sexagenary3D={create};
})();
