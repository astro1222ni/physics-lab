/* 只有開啟剖面才載入 Three.js。靜態器材依材質批次繪製，人群讀取同一張路網的時程。 */
(function () {
  'use strict';
  async function create(host,lost) {
    const [THREE,{OrbitControls}]=await Promise.all([import('../vendor/three/three.module.min.js'),import('../vendor/three/OrbitControls.js')]);
    const C=window.SchoolEvacuationCore,D=window.LabDraw,T=window.LabSettings.t;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label',T('可旋轉的三層校舍與操場剖面','Rotatable three-storey school cutaway and field'));renderer.domElement.tabIndex=0;
    host.append(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-25,25,15,-15,.1,240);
    const controls=new OrbitControls(camera,renderer.domElement);
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    controls.enableDamping=!motion.matches;controls.dampingFactor=.14;controls.enablePan=true;
    controls.minZoom=.5;controls.maxZoom=5;controls.maxPolarAngle=Math.PI*.485;
    const nav=LabView3DNav.attach({THREE,controls,host,canvas:renderer.domElement,radius:30,T});
    const sky=new THREE.HemisphereLight(0xffffff,0x899b9a,2.2);scene.add(sky);
    const sun=new THREE.DirectionalLight(0xfff1db,3.1);sun.position.set(-18,34,20);sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-32,right:32,top:28,bottom:-28,near:1,far:90});sun.shadow.normalBias=.035;sun.shadow.bias=-.0003;scene.add(sun);
    let group,geos=[],mats=[],textures=[],jiggles=[],bodies,heads,disposed=false,frame=0,lastRun=null,preset=0;
    const dummy=new THREE.Object3D(),worldUp=new THREE.Vector3(0,1,0);
    let latest={r:null,t:-1,quake:false,clock:0},geometryKey='';
    function request() {
      if(frame||disposed||document.hidden||!host.clientWidth)return;
      frame=requestAnimationFrame(()=>{frame=0;if(disposed||document.hidden)return;controls.update();renderer.render(scene,camera);});
    }
    controls.addEventListener('change',request);
    function texture(w,h,draw,repeatX=1,repeatY=1) {
      const el=document.createElement('canvas');el.width=w;el.height=h;draw(el.getContext('2d'),w,h);
      const tex=new THREE.CanvasTexture(el);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(repeatX,repeatY);tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.push(tex);return tex;
    }
    function material(color,options={}) {const m=new THREE.MeshStandardMaterial({color,roughness:.79,...options});mats.push(m);return m;}
    function clearScene() {
      if(group){scene.remove(group);group.traverse(o=>{if(o.isInstancedMesh)o.dispose();});}
      geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
      geos=[];mats=[];textures=[];jiggles=[];bodies=heads=null;group=new THREE.Group();scene.add(group);
    }
    function build(r) {
      clearScene();
      const mix=D.mix, dark=D.dark;
      scene.background=new THREE.Color(mix(D.c['canvas-bg'],D.c.neg,dark?.14:.085));
      const body=material(dark?'#c6d6cf':'#dce4da'),trim=material('#39786e'),apron=material('#c2c8be');
      const metal=material('#65787a',{roughness:.4,metalness:.46}),rail=material('#bfd4cb',{roughness:.28,metalness:.54});
      const glass=material('#91c8d0',{transparent:true,opacity:.58,roughness:.17,metalness:.12,depthWrite:false});
      const pine=material(mix('#875432','#bf9767',.47)),leaves=material('#517e5d'),leafLight=material('#79a171');
      const white=material('#f7eed9'),blackboard=material('#285c50'),blue=material('#526e86');
      const west=material('#218f74'),east=material('#d28b3e'),brick=material('#a4634b');
      const tileTex=texture(128,128,(g,w,h)=>{g.fillStyle='#e8e7db';g.fillRect(0,0,w,h);g.lineWidth=2;g.strokeStyle='#c0c4b9';g.strokeRect(0,0,w,h);g.strokeStyle='#f5f3e6';g.strokeRect(3,3,w-6,h-6);},23,6);
      const tiles=material('#ffffff',{map:tileTex});
      const woodTex=texture(128,64,(g,w,h)=>{g.fillStyle='#c89760';g.fillRect(0,0,w,h);for(let i=0;i<20;i++){g.strokeStyle='rgba(105,59,24,'+(.08+.04*(i%3))+')';g.beginPath();g.moveTo(0,i*3.4);g.bezierCurveTo(30,i*3.5+3,80,i*3.3-2,w,i*3.4);g.stroke();}});
      const wood=material('#ffffff',{map:woodTex});
      const groundTex=texture(1024,512,(g,w,h)=>{
        g.fillStyle='#a9b9a0';g.fillRect(0,0,w,h);
        for(let i=0;i<1200;i++){const x=(i*97)%w,y=(i*193)%h;g.fillStyle=i%2?'#a2b69c':'#b2bfa6';g.fillRect(x,y,2,1);}
        const stadium=(x,y,W,H,fill,stroke)=>{g.beginPath();g.roundRect(x,y,W,H,H/2);if(fill){g.fillStyle=fill;g.fill();}if(stroke){g.strokeStyle=stroke;g.lineWidth=2;g.stroke();}};
        stadium(48,107,928,310,'#b86e55');for(let i=0;i<5;i++)stadium(52+i*10,111+i*10,920-i*20,302-i*20,null,'#f4dfc0');
        stadium(107,164,810,195,'#74a177');
        for(let i=0;i<8;i++){g.fillStyle=i%2?'#7ca87e':'#83ad81';g.fillRect(304+i*52,173,52,176);}
        g.strokeStyle='#ecead2';g.lineWidth=3;g.strokeRect(306,179,411,160);g.beginPath();g.moveTo(512,180);g.lineTo(512,338);g.stroke();g.beginPath();g.arc(512,260,35,0,2*Math.PI);g.stroke();
        g.strokeRect(306,214,57,85);g.strokeRect(660,214,57,85);
      });
      const turf=material('#ffffff',{map:groundTex});
      const geometry=g=>{geos.push(g);return g;},cube=geometry(new THREE.BoxGeometry(1,1,1)),cyl=geometry(new THREE.CylinderGeometry(1,1,1,10)),orb=geometry(new THREE.SphereGeometry(1,9,7));
      const batch=new Map();
      function add(shape,mat,x,y,z,w,h,d,quat) {
        let byMat=batch.get(shape);if(!byMat){byMat=new Map();batch.set(shape,byMat);}
        let items=byMat.get(mat);if(!items){items=[];byMat.set(mat,items);}
        dummy.position.set(x,y,z);dummy.scale.set(w,h,d);dummy.quaternion.identity();if(quat)dummy.quaternion.copy(quat);
        dummy.updateMatrix();items.push(dummy.matrix.clone());
      }
      const box=(mat,x,y,z,w,h,d)=>add(cube,mat,x,y,z,w,h,d);
      const ell=(mat,x,y,z,w,h,d)=>add(orb,mat,x,y,z,w,h,d);
      function tube(mat,a,b,radius) {
        const v=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);const len=v.length();
        const rot=new THREE.Quaternion().setFromUnitVectors(worldUp,v.normalize());
        add(cyl,mat,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,radius,len,radius,rot);
      }
      function tree(x,z,h) {
        add(cyl,pine,x,h*.29,z,.17,h*.65,.17);
        for(let k=0;k<6;k++){const a=k*2.4;ell(k%3?leaves:leafLight,x+Math.cos(a)*.70,h*(.68+k*.036),z+Math.sin(a)*.66,1.25,.92,1.06);}
      }
      // Raised diorama plinth and dedicated track texture on the top face.
      box(trim,0,-.96,6.2,44,.56,34);box(apron,0,-.62,6.2,43.7,.22,33.7);
      const ground=new THREE.Mesh(geometry(new THREE.PlaneGeometry(43.6,16.6)),turf);
      ground.rotation.x=-Math.PI/2;ground.position.set(0,-.42,14.1);ground.receiveShadow=true;group.add(ground);
      for(const [x,z,h] of [[-20,-5,4.5],[20,-5,5],[-20,8,3],[20,9,3.8],[-18,20.7,2.9],[18.9,20.5,3.8]])tree(x,z,h);
      for(let f=0;f<3;f++){
        const y=4*f;
        const slabWidth=f?28:38.2,front=f?4+r.q.corridor/2+.45:5.85,back=-5.75;
        const centerZ=(front+back)/2,depth=front-back,railZ=front-.45;
        box(body,0,y-.17,centerZ,slabWidth,.32,depth);box(tiles,0,y+.015,centerZ,slabWidth-.12,.05,depth-.25);
        box(trim,0,y-.26,front-.05,slabWidth,.13,.13);box(body,0,y+1.52,-5.6,37.8,3.15,.18);
        if(f)for(const s of [-1,1])box(tiles,s*16.45,y-.07,4.85,5.0,.20,1.7);
        for(let c=0;c<3;c++){
          const cx=(c-1)*9;
          for(let u=0;u<4;u++){
            const wx=cx-3.05+u*2.02;box(trim,wx,y+2.08,-5.42,1.92,1.65,.14);box(glass,wx,y+2.08,-5.31,1.75,1.49,.09);
            box(white,wx,y+2.08,-5.23,.05,1.55,.05);box(white,wx,y+2.30,-5.23,1.78,.045,.05);
          }
          if(f===0)continue;
          box(body,cx-4.43,y+1.04,-2.15,.14,2.05,6.7);box(blackboard,cx-4.29,y+1.61,-2.72,.10,1.18,3.6);
          box(wood,cx-4.16,y+.98,-2.72,.16,.075,3.75);box(white,cx-4.09,y+1.62,-3.2,.055,.03,.65);
          for(let row=0;row<Math.ceil(r.people.sizes[r.q.origins.indexOf((f-1)*3+c)]/8);row++)for(let col=0;col<4;col++){
            const dx=cx-2.78+1.84*col,dz=-4.02+1.04*row;
            box(wood,dx,y+.83,dz,1.32,.13,.57);box(metal,dx,y+.44,dz,.16,.73,.18);
            for(const shift of [-.32,.32]){
              box(blue,dx+shift,y+.43,dz+.42,.47,.09,.39);box(blue,dx+shift,y+.67,dz+.59,.47,.33,.07);
              box(metal,dx+shift,y+.21,dz+.42,.10,.40,.12);
            }
          }
          const shelf=new THREE.Group();shelf.position.set(cx+3.55,y,-3.96);group.add(shelf);jiggles.push(shelf);
          const local=(m,x,Y,z,w,h,d)=>{const obj=new THREE.Mesh(cube,m);obj.position.set(x,Y,z);obj.scale.set(w,h,d);shelf.add(obj);};
          local(wood,0,.95,0,1.10,1.90,.27);for(let t=0;t<3;t++){local(pine,0,.22+t*.57,.18,1.15,.07,.38);for(let j=0;j<4;j++)local([east,blue,trim][(j+t)%3],-.37+j*.22,.45+t*.57,.20,.16,.43-j%2*.09,.18);}
          const light=new THREE.Group();light.position.set(cx,y+3.5,-.6);group.add(light);jiggles.push(light);
          const stem=new THREE.Mesh(cyl,metal);stem.scale.set(.035,.52,.035);stem.position.y=-.26;light.add(stem);
          const lamp=new THREE.Mesh(cube,white);lamp.scale.set(2.25,.12,.32);lamp.position.y=-.54;light.add(lamp);
        }
        for(let x=-13.6;x<=14;x+=9)box(body,x,y+1.65,2.0,.32,3.3,.32);
        if(f>0){
          for(let x=-13.6;x<=14;x+=1.7)box(rail,x,y+.49,railZ,.07,.96,.07);
          for(const ht of [.49,.95])tube(rail,[-13.65,y+ht,railZ],[13.65,y+ht,railZ],.045);
        }else for(const side of [0,1]){
          const sx=side?16:-16,w=r.q.door;box(trim,sx-w/2-.12,1.05,5.65,.22,2.1,.30);box(trim,sx+w/2+.12,1.05,5.65,.22,2.1,.30);box(trim,sx,2.16,5.65,w+.45,.18,.3);
        }
      }
      // Open stairwells: two reversing flights, mid-landing, nosings, handrails and balusters.
      for(const side of [0,1])for(let f=1;f<=2;f++){
        const sign=side?1:-1,sx=sign*16,y=f*4,sw=r.q[side?'east':'west'],paint=side?east:west;
        for(let flight=0;flight<2;flight++){
          const cx=sx+sign*1.65*flight,ty=y-2*flight,z0=flight?-1:4,dz=flight?5:-5;
          for(let i=0;i<11;i++){
            const sy=ty-(i+1)*2/11,sz=z0+(i+.5)*dz/11;
            box(body,cx,sy-.07,sz,sw,.20,Math.abs(dz)/11+.035);
            box(paint,cx,sy+.042,sz-dz/24,sw,.035,.065);
            if(i%3===0)tube(metal,[cx+sign*sw*.48,sy,sz],[cx+sign*sw*.48,sy+.78,sz],.035);
          }
          tube(rail,[cx+sign*sw*.48,ty+.76,z0],[cx+sign*sw*.48,ty-1.24,z0+dz],.075);
        }
        box(apron,sx+sign*.825,y-2.08,-1.35,sw+1.7,.18,1.1);
        if(r.q.closed===side)box(brick,sx,y+.65,4.5,sw+.25,.35,.13);
      }
      // A small assembly platform, canopy, flagstaff and field benches.
      for(let i=0;i<3;i++)box(apron,-9,.08+i*.13,7.5-i*.33,4.3-i*.12,.16,1.7-i*.12);
      for(const x of [-10.85,-7.15])tube(metal,[x,.3,6.9],[x,2.35,6.9],.075);
      box(trim,-9,2.40,7,4.7,.16,1.8);tube(rail,[-12,0,7.4],[-12,4.7,7.4],.045);
      box(east,-11.54,4.32,7.4,.92,.48,.055);
      for(const x of [6,9,12]){box(wood,x,.48,7.1,2.0,.14,.6);box(metal,x-.72,.23,7.1,.13,.48,.42);box(metal,x+.72,.23,7.1,.13,.48,.42);}
      for(const [shape,byMat] of batch)for(const [mat,items] of byMat){const mesh=new THREE.InstancedMesh(shape,mat,items.length);items.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=mat!==glass;mesh.receiveShadow=true;group.add(mesh);}
      const clothes=material('#ffffff'),skin=material('#deb797');
      bodies=new THREE.InstancedMesh(cyl,clothes,r.total);heads=new THREE.InstancedMesh(orb,skin,r.total);
      for(const mesh of [bodies,heads]){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);}
      for(let i=0;i<r.total;i++)bodies.setColorAt(i,new THREE.Color(r.q.routes[r.people.classOf[i]]?'#cc8638':'#288d79'));
      lastRun=r;
    }
    function update(r,t,quake,clock) {
      if(disposed)return;
      if(lastRun===r&&latest.t===t&&latest.quake===quake&&(!quake||latest.clock===clock))return;
      latest={r,t,quake,clock};
      if(lastRun!==r){
        const q=r.q,key=[D.ver,q.west,q.east,q.door,q.corridor,q.closed,...r.people.sizes,...q.origins,...q.routes].join('/');
        if(key!==geometryKey){build(r);geometryKey=key;}
        lastRun=r;
      }
      for(let i=0;i<r.total;i++){const {p}=C.position(r,i,t);
        dummy.quaternion.identity();dummy.position.set(p[0],p[1]+.36,p[2]);dummy.scale.set(.14,.51,.14);dummy.updateMatrix();bodies.setMatrixAt(i,dummy.matrix);
        dummy.position.y=p[1]+.70;dummy.scale.setScalar(.155);dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);}
      bodies.instanceMatrix.needsUpdate=heads.instanceMatrix.needsUpdate=true;
      jiggles.forEach((o,i)=>{o.rotation.z=quake&&!motion.matches?Math.sin(clock*7+i*.42)*(i%2?.055:.012):0;});request();
    }
    function fit() {
      const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
      renderer.setSize(w,h,false);const aspect=w/h;
      const half=preset?Math.max(6.1,9/aspect):Math.max(16,30/aspect);
      camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
      camera.updateProjectionMatrix();request();
    }
    function cameraPreset(i) {
      preset=i;const side=latest.r?.q.closed===0?1:-1;
      const target=i?new THREE.Vector3(side*15,4,2):new THREE.Vector3(0,3.5,6);
      controls.target.copy(target);camera.position.copy(target).add(i?new THREE.Vector3(side*14,10,21):new THREE.Vector3(20,21,44));
      camera.zoom=1;camera.lookAt(target);controls.update();fit();nav.home();request();
    }
    function contextLost(e){e.preventDefault();if(!disposed)lost();}
    renderer.domElement.addEventListener('webglcontextlost',contextLost);
    const observer=new ResizeObserver(fit);observer.observe(host);cameraPreset(0);
    return {update,cameraPreset,theme(){if(latest.r){lastRun=null;update(latest.r,latest.t,latest.quake,latest.clock);}},
      dispose(){disposed=true;observer.disconnect();cancelAnimationFrame(frame);controls.removeEventListener('change',request);
        renderer.domElement.removeEventListener('webglcontextlost',contextLost);nav.dispose();controls.dispose();clearScene();sun.shadow.map?.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
  }
  window.SchoolEvacuation3D={create};
})();
