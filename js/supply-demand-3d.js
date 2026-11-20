// Three.js is loaded only after a student selects the stall.
export function createStall({ THREE, OrbitControls, host, navHost, T, reduced, onLost }) {
  const D = window.LabDraw, core = window.SupplyDemandCore;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0; canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', T('可旋轉的園遊會飲料攤、排隊客人與側桌', 'Orbitable school fair drink stall with a queue and side table'));
  const priceTag = document.createElement('span');
  priceTag.className = 'board-price'; priceTag.id = 'boardPrice'; priceTag.setAttribute('aria-hidden','true');
  host.append(canvas,priceTag);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, .1, 85);
  const control = new OrbitControls(camera, canvas);
  control.enableDamping = !reduced.matches;
  control.minDistance = 2.4; control.maxDistance = 32;
  control.maxPolarAngle = Math.PI * .485;
  const nav = window.LabView3DNav.attach({ THREE, controls: control, host:navHost, canvas, radius: 6, T });
  const resources = new Set();
  const own = resource => { resources.add(resource); return resource; };
  const material = (color, options={}) => own(new THREE.MeshStandardMaterial({ color, roughness: .74, ...options }));
  const box = own(new THREE.BoxGeometry(1,1,1));
  const cyl = own(new THREE.CylinderGeometry(1,1,1,16));
  const ico = own(new THREE.IcosahedronGeometry(1,0));
  const ball = own(new THREE.SphereGeometry(1,12,9));
  const taper = own(new THREE.CylinderGeometry(1,.77,1,12));
  const limbs = own(new THREE.CylinderGeometry(.80,1,1,7));
  const rim = own(new THREE.TorusGeometry(1,.09,5,16));
  const shell = new THREE.Group(); scene.add(shell);
  function mesh(geometry, mat, x,y,z, sx=1,sy=1,sz=1) {
    const m = new THREE.Mesh(geometry,mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz);
    m.castShadow=true; m.receiveShadow=true; shell.add(m); return m;
  }
  function beam(start,end,r,mat) {
    const a=new THREE.Vector3(...start), b=new THREE.Vector3(...end);
    const delta=b.clone().sub(a), p=a.add(b).multiplyScalar(.5);
    const m=mesh(cyl,mat,p.x,p.y,p.z,r,delta.length(),r);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return m;
  }
  const sky = new THREE.HemisphereLight(0xfff4d9,0xb1b6a0,1.8);
  const sun = new THREE.DirectionalLight(0xffdfa4,3.1);
  sun.position.set(-5.4,9,6.2); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-7,right:7,top:6,bottom:-6, near:.2,far:27});
  sun.shadow.normalBias=.022; sun.shadow.bias=-.00025;
  scene.add(sky,sun);
  function texture(w,h,paint) {
    const board=document.createElement('canvas'); board.width=w; board.height=h;
    const ctx=board.getContext('2d'); paint(ctx,w,h);
    const map=own(new THREE.CanvasTexture(board)); map.colorSpace=THREE.SRGBColorSpace;
    map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy()); return map;
  }
  // Seedless, deterministic grain and woven seams. Textures stay attached as the market changes.
  const grain=texture(256,128,(ctx,w,h)=>{
    ctx.fillStyle='#c58d5d'; ctx.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=3) {
      ctx.strokeStyle=y%4?'#ad754e':'#e0aa78'; ctx.lineWidth=.65; ctx.beginPath();
      for(let x=0;x<=w;x+=4) { const v=y+1.7*Math.sin(x/28+y*.7)+.7*Math.sin(x/11+y); if(x)ctx.lineTo(x,v);else ctx.moveTo(x,v); } ctx.stroke();
    }
    for(const [x,y] of [[42,35],[176,92]]) for(let r=1;r<5;r++) {
      ctx.beginPath(); ctx.ellipse(x,y,r*4,r,0,0,Math.PI*2);ctx.strokeStyle='#a57251';ctx.stroke();
    }
  });
  const cloth=texture(512,128,(ctx,w,h)=>{
    for(let x=0;x<w;x+=32) {
      ctx.fillStyle=(x/32)%2?'#fff0cd':'#397c74'; ctx.fillRect(x,0,32,h);
      ctx.fillStyle='rgba(31,49,39,.14)'; ctx.fillRect(x,0,1,h);
    }
    for(let y=0;y<h;y+=3){ctx.fillStyle='rgba(255,250,223,.08)'; ctx.fillRect(0,y,w,1);}
    for(const y of [5,h-7]) { ctx.setLineDash([3,2]); ctx.lineWidth=1; ctx.strokeStyle='#c5b594'; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y);ctx.stroke(); }
  });
  const wood=material(0xffffff,{map:grain}), edge=material(0x815237), green=material(0x356c60);
  const brass=material(0xdeae56,{roughness:.34,metalness:.45}), cream=material(0xffedca);
  const paving=material(0xdabf97), trim=material(0xa07c58), soil=material(0x8d795a);
  const grass=material(0x82956e), bark=material(0x755a42), leaves=material(0x5d866a);
  const darkLeaf=material(0x396a58), terracotta=material(0xb16747), citrus=material(0xf6b94a);
  const clothMat=material(0xffffff,{map:cloth,side:THREE.DoubleSide});
  const chalk=material(0x234740);
  const shadeMap=texture(128,128,(p,w,h)=>{
    const g=p.createRadialGradient(w/2,h/2,8,w/2,h/2,w/2);
    g.addColorStop(0,'rgba(39,34,19,.62)');g.addColorStop(.64,'rgba(39,34,19,.34)');g.addColorStop(1,'rgba(39,34,19,0)');
    p.fillStyle=g;p.fillRect(0,0,w,h);
  });
  const contact=mesh(own(new THREE.PlaneGeometry(15.3,11.3)),material(0xffffff,{map:shadeMap,transparent:true,depthWrite:false}),.25,-.481,1.19);
  contact.rotation.x=-Math.PI/2;contact.castShadow=false;
  mesh(box,soil,0,-.28,1.12,10.65,.35,7.65);
  mesh(box,grass,0,-.12,1.12,10.56,.10,7.56);
  mesh(box,paving,0,-.056,1.13,10.22,.10,7.21);
  // The joints and little kerbs give the courtyard a scale independent of the quantities.
  for(let z=-2.2;z<4.8;z+=.72) {
    mesh(box,trim,0,-.004,z,10.18,.005,.012);
    for(let x=-4.75+(Math.round((z+2.2)/.72)%2)*.55;x<5.1;x+=1.13) mesh(box,trim,x,-.003,z+.35,.012,.005,.70);
  }
  for(const x of [-3.75,3.65]) {
    mesh(taper,terracotta,x,.24,-1.85,.37,.48,.37);
    mesh(cyl,bark,x,.94,-1.85,.085,1.04,.085);
    mesh(ico,leaves,x,1.65,-1.85,.70,.84,.68);
    mesh(ico,darkLeaf,x+.27,1.46,-1.68,.43,.53,.43);
    mesh(ico,leaves,x-.30,1.65,-1.76,.39,.55,.44);
    for(const [dx,dy] of [[-.26,.02],[.19,.23],[.34,-.19]]) mesh(ball,citrus,x+dx,1.68+dy,-1.37,.08,.08,.08);
  }
  // Counter, slats, apron, corner irons and turned canopy posts.
  mesh(box,edge,-1.22,.18,-.78,4.19,.20,1.64);
  mesh(box,wood,-1.22,.65,-.78,4.04,.91,1.47);
  for(let i=0;i<17;i++) mesh(box,i%3===0?edge:wood,-3.16+i*.244,.67,-.032,.204,.80,.052);
  mesh(box,wood,-1.22,1.18,-.77,4.43,.16,1.77);
  mesh(box,brass,-1.22,1.12,.119,4.36,.034,.031);
  for(const x of [-3.22,.77]) for(const z of [-1.52,.01]) {
    mesh(cyl,wood,x,1.94,z,.068,2.79,.068);
    mesh(cyl,brass,x,1.32,z,.087,.09,.087);
    beam([x,2.72,z],[x+(x<0?.36:-.36),3.12,z],.036,edge);
  }
  // One pitched fabric surface with UVs across the full width, and a scalloped front valance.
  function roof(zEdge,zRidge,yEdge,yRidge) {
    const geo=own(new THREE.BufferGeometry());
    geo.setAttribute('position',new THREE.Float32BufferAttribute([-3.55,yEdge,zEdge, 1.11,yEdge,zEdge, -3.55,yRidge,zRidge, 1.11,yRidge,zRidge],3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
    geo.setIndex([0,1,2,2,1,3]); geo.computeVertexNormals(); mesh(geo,clothMat,0,0,0);
  }
  roof(.46,-.82,3.02,3.48); roof(-2.04,-.82,3.02,3.48);
  beam([-3.55,3.48,-.82],[1.11,3.48,-.82],.035,brass);
  for(let i=0;i<16;i++){
    const x=-3.55+(i+.5)*4.66/16, mat=i%2?cream:green;
    mesh(box,mat,x,2.94,.46,4.66/16,.18,.036);
    mesh(ball,mat,x,2.85,.46,4.66/32,.078,.026);
  }
  function graphic(map,x,y,z,w,h) {
    const m=mesh(own(new THREE.PlaneGeometry(w,h)),material(0xffffff,{map,roughness:.91}),x,y,z); m.castShadow=false; return m;
  }
  const nameMap=texture(512,128,(p,w,h)=>{
    p.fillStyle='#28564f';p.fillRect(0,0,w,h);p.strokeStyle='#e6c384';p.lineWidth=3;p.strokeRect(6,6,w-12,h-12);
    p.fillStyle='#ffc959';p.beginPath();p.arc(72,66,39,0,Math.PI*2);p.fill();
    p.strokeStyle='#fff0c7';p.lineWidth=3;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;p.beginPath();p.moveTo(72,66);p.lineTo(72+35*Math.cos(a),66+35*Math.sin(a));p.stroke();}
    p.fillStyle='#fff2d4';p.textAlign='center';p.textBaseline='middle';p.font='bold 46px '+D.FONT;p.fillText(T('園遊會茶攤','Fair tea stall'),307,65,335);
  });
  mesh(box,brass,-1.22,.69,.023,2.43,.67,.065);
  graphic(nameMap,-1.22,.69,.061,2.38,.62);
  // Glass-look drink dispensers with a visible fill line, lids, tap and lever.
  const glass=material(0xd1e8dc,{transparent:true,opacity:.21,roughness:.18,depthWrite:false});
  const amber=material(0xe29a39), rose=material(0xb95346);
  for(const [x,drink] of [[-2.62,amber],[-1.99,rose]]) {
    mesh(cyl,edge,x,1.36,-.42,.27,.17,.27); mesh(cyl,drink,x,1.75,-.42,.224,.56,.224);
    mesh(cyl,glass,x,1.83,-.42,.254,.75,.254); mesh(cyl,cream,x,2.22,-.42,.267,.06,.267);
    mesh(ball,brass,x,2.28,-.42,.066,.059,.066);
    beam([x,1.53,-.24],[x,1.53,-.075],.033,brass); mesh(box,brass,x,1.58,-.085,.11,.035,.04);
    for(let i=0;i<3;i++){const ice=mesh(box,cream,x+.10*Math.cos(i*2.2),2.015,-.42+.10*Math.sin(i*2.2),.095,.05,.095); ice.rotation.y=i;}
  }
  // A single aproned vendor stays behind the counter, outside the customer queue.
  const skin=material(0xc78a64), apron=material(0x357569), hairMat=material(0x543a2d);
  mesh(taper,cream,.13,1.57,-1.08,.235,.65,.165);
  mesh(box,apron,.13,1.54,-.916,.355,.48,.034);
  mesh(box,cream,.13,1.48,-.891,.16,.09,.018);
  mesh(ico,skin,.13,2.05,-1.08,.192,.221,.184);
  mesh(ico,hairMat,.13,2.18,-1.093,.209,.13,.196);
  mesh(cyl,cream,.13,2.233,-1.08,.232,.071,.229);
  mesh(cyl,green,.13,2.245,-1.08,.19,.10,.19);
  mesh(ico,skin,.13,2.03,-.908,.052,.054,.054);
  for(const x of [.061,.199]) mesh(ball,hairMat,x,2.08,-.918,.018,.020,.014);
  beam([-.067,1.82,-1.03],[-.16,1.58,-.85],.070,cream);
  beam([-.16,1.58,-.85],[-.30,1.48,-.63],.050,skin);
  beam([.31,1.82,-1.03],[.38,1.55,-.90],.070,cream);
  beam([.38,1.55,-.90],[.29,1.39,-.66],.050,skin);
  // A framed chalk price board is readable from the counter and changes with the posted price.
  const menuX=-.97, menuZ=-1.05;
  mesh(box,wood,menuX,1.95,menuZ,1.14,1.31,.092);
  mesh(box,chalk,menuX,1.95,menuZ+.04,1.02,1.18,.052);
  const menu=texture(320,336,()=>{}); graphic(menu,menuX,1.95,menuZ+.071,.98,1.13);
  const boardAnchor = new THREE.Vector3(menuX,1.99,menuZ+.10);
  const projected = new THREE.Vector3();
  let lastPrice;
  function menuPrice(price) {
    if (lastPrice===price) return;
    lastPrice=price; const p=menu.image.getContext('2d'), w=menu.image.width;
    p.fillStyle='#27463f';p.fillRect(0,0,w,336);p.textAlign='center';p.textBaseline='middle';
    p.fillStyle='#efd095';p.font='bold 37px '+D.FONT;p.fillText(T('今日茶價','TEA TODAY'),w/2,55,w-25);
    p.strokeStyle='#c7b791';p.lineWidth=2;p.beginPath();p.moveTo(35,88);p.lineTo(285,88);p.stroke();
    p.fillStyle='#fff4d7';p.font='bold 79px '+D.FONT;
    const digits=price===null?'':Number(price.toFixed(2));
    priceTag.textContent=price===null?T('無市場','No market'):T(digits+' 元','NT$'+digits);
    p.fillText(priceTag.textContent,w/2,164,w-18);
    p.fillStyle='#c9ded3';p.font='31px '+D.FONT;
    p.fillText(price === null ? T('無市場','NO MARKET') : T('每杯','per cup'),w/2,257,w-25); menu.needsUpdate=true;
  }
  // A separate open side table holds all the excess inventory.
  for(const x of [1.65,3.47]) for(const z of [-1.04,-.06]) mesh(box,green,x,.39,z,.09,.78,.09);
  mesh(box,wood,2.56,.84,-.55,2.17,.13,1.29); mesh(box,wood,2.56,.28,-.55,1.95,.07,1.12);
  for(const x of [1.65,3.47]) beam([x,.22,-1.03],[x,.70,-.10],.035,brass);
  const sideSign=texture(256,72,(p,w,h)=>{
    p.fillStyle='#9d5936';p.fillRect(0,0,w,h);p.strokeStyle='#fbda9a';p.strokeRect(3,3,w-6,h-6);
    p.fillStyle='#fff1d2';p.textAlign='center';p.textBaseline='middle';p.font='bold 35px '+D.FONT;p.fillText(T('未售','UNSOLD'),w/2,h/2,w-12);
  });
  graphic(sideSign,2.57,.69,.108,.82,.23);

  // Reuse geometry and GPU batches across the full slider range, including large queues.
  const batchMat=material(0xffffff,{roughness:.69});
  const batches=new Map(), pose=new THREE.Object3D(), tint=new THREE.Color();
  function batch(name,geo,capacity) {
    const m=new THREE.InstancedMesh(geo,batchMat,capacity); m.count=0; m.castShadow=true; m.receiveShadow=true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled=false;
    scene.add(m); batches.set(name,m); return m;
  }
  const shirts=batch('shirts',limbs,110),heads=batch('heads',ico,110),hair=batch('hair',ico,110);
  const legs=batch('legs',limbs,220),shoes=batch('shoes',ico,220),arms=batch('arms',limbs,220),noses=batch('noses',ico,110);
  // A change of policy can briefly show both the old hand-held cups and the new side-table stock.
  const cups=batch('cups',taper,224),lids=batch('lids',cyl,224),bands=batch('bands',taper,224),rims=batch('rims',rim,224);
  function item(m,x,y,z,sx,sy,sz,col,rx=0,ry=0,rz=0) {
    pose.position.set(x,y,z);pose.scale.set(sx,sy,sz);pose.rotation.set(rx,ry,rz);pose.updateMatrix();
    m.setMatrixAt(m.count,pose.matrix);m.setColorAt(m.count,tint.set(col));m.count++;
  }
  function paperCup(x,y,z,unsold,k=1) {
    item(cups,x,y+.135*k,z,.093*k,.27*k,.093*k,0xffedca);
    item(bands,x,y+.137*k,z,.091*k,.084*k,.091*k,unsold?0xb46b41:0x44877c);
    item(lids,x,y+.270*k,z,.093*k,.012*k,.093*k,0xd89240);
    item(rims,x,y+.278*k,z,.099*k,.099*k,.099*k,0xffe9bc,Math.PI/2);
  }
  function cupsOnSide(n) {
    for (let i=0;i<n;i++) {
      const slot=i%28;
      paperCup(1.74+(slot%7)*.245,.905+Math.floor(i/28)*.278,-.97+Math.floor(slot/7)*.27,true);
    }
  }
  const clothes=[0xca7660,0x4b9994,0xe1ad51,0x7583a0,0x8fa468,0xbb8595];
  const skins=[0xdbac82,0xb98464,0xf2c39b,0xa97253], hairTones=[0x49392f,0x684a35,0x382f2d];
  const clamp01 = x => Math.max(0,Math.min(1,x));
  const mix = (a,b,t) => a+(b-a)*t;
  const smooth = t => { t=clamp01(t); return t*t*(3-2*t); };
  const heightOf = id => .93+(id%5)*.027;
  const coatColors=clothes.map(c=>new THREE.Color(c)), queueCoat=new THREE.Color(0x545b62);
  const skinColors=skins.map(c=>new THREE.Color(c)), queueSkin=new THREE.Color(0x9e897c), shade=new THREE.Color();
  const counter={x:-.30,y:1.39,z:-.53};
  function person(id,x,z,angle,held) {
    const k=heightOf(id), sin=Math.sin(angle), cos=Math.cos(angle);
    return {id,x,z,angle,held,cup:held,
      cx:x+.19*(cos+sin)*k,cy:.56*k,cz:z+.19*(cos-sin)*k};
  }
  function destination(id,i,waiting,counts) {
    const columns=waiting ? (counts.waiting>20?9:4) : 6;
    const row=Math.floor(i/columns), col=i%columns;
    const k=waiting && row%2 ? columns-1-col : col;
    const rows=Math.ceil((waiting?counts.waiting:counts.served)/columns);
    const pitch=waiting ? Math.min(.54,3.7/Math.max(1,rows-1)) : Math.min(.46,2.55/Math.max(1,rows-1));
    return waiting ? person(id,.28+k*.47,.58+row*pitch+k*.06,Math.PI*1.13,0)
      : person(id,-1.05-k*.48,1.58+row*pitch+k*.12,2*Math.PI-.91,1);
  }
  function blend(a,b,t) {
    const p={id:a.id};
    for(const k of ['x','z','angle','held','cup','cx','cy','cz']) p[k]=mix(a[k],b[k],t);
    return p;
  }
  function guest(p) {
    const {id,x,z,angle,held}=p, scale=heightOf(id);
    const cos=Math.cos(angle),sin=Math.sin(angle);
    const shirt=shade.lerpColors(queueCoat,coatColors[id%coatColors.length],held).getHex();
    const skin=shade.lerpColors(queueSkin,skinColors[id%skinColors.length],held).getHex();
    function part(m,lx,y,lz,sx,sy,sz,color,rx=0,rz=0) {
      item(m,x+(lx*cos+lz*sin)*scale,y*scale,z+(-lx*sin+lz*cos)*scale,sx*scale,sy*scale,sz*scale,color,rx,angle,rz);
    }
    for(const sign of [-1,1]) {
      part(legs,sign*.068,.215,.016*sign,.058,.33,.061,0x4c5760);
      part(shoes,sign*.068,.06,.047+.018*sign,.075,.058,.115,0x443e39);
      const raise=sign===1 ? held : 0;
      part(arms,sign*.165,.505+.06*raise,.014+.071*raise,.052,.244,.054,skin,-.12-.82*raise,sign*.16);
    }
    if(p.cup>.002) paperCup(p.cx,p.cy,p.cz,false,p.cup);
    part(shirts,0,.53,0,.169,.33,.118,shirt);
    part(heads,0,.83,0,.133,.155,.13,skin);
    part(noses,0,.821,.115,.038,.04,.04,skin);
    part(hair,0,.917,-.015,.143,.099,.135,hairTones[id%3]);
  }
  let data, counts, people=[], nextId=0, stock=0, transition=null;
  let frame=0, disposed=false, viewpoint='front', homeDistance=16, roofHalf=3.0;
  function rebuild() {
    batches.forEach(m=>{m.count=0;});
    cupsOnSide(Math.round(stock));
    people.forEach(guest);
    batches.forEach(m=>{m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;});
  }
  function beyondFrame(p,side) {
    const eye=new THREE.Vector3(p.x,.55,p.z).applyMatrix4(camera.matrixWorldInverse);
    const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);
    const halfWidth=Math.abs(eye.z)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect/camera.zoom;
    const distance=side*(halfWidth+.55)-eye.x, dx=right.x*distance, dz=right.z*distance;
    return {...p,x:p.x+dx,z:p.z+dz,cx:p.cx+dx,cz:p.cz+dz};
  }
  function crowdPlan(target) {
    // Keep the established customers first. When sales rise, the front of the old queue is served first.
    const holding=people.filter(p=>p.held>=.5), queue=people.filter(p=>p.held<.5);
    const sales=[], moves=[];
    function assign(waiting,i) {
      let from=waiting ? (queue.shift() || holding.shift()) : (holding.shift() || queue.shift());
      const to=destination(from?from.id:nextId++,i,waiting,target);
      if(!from) from=beyondFrame(person(to.id,waiting?to.x:.52,waiting?to.z+.65:.87,Math.PI*1.13,0),1);
      const move={from,to,delay:0,span:1};
      if(!waiting && from.held<.99) {
        // A drink begins at the vendor, crosses the counter, then stays in this guest's hand.
        move.approach=person(to.id,.03,.48,Math.PI,0);
        move.approach.cx=counter.x;move.approach.cy=counter.y;move.approach.cz=counter.z;
        move.received=person(to.id,.03,.48,Math.PI,1);
        sales.push(move);
      }
      moves.push(move);
    }
    for(let i=0;i<target.served;i++) assign(false,i);
    for(let i=0;i<target.waiting;i++) assign(true,i);
    const extras=queue.concat(holding);
    extras.forEach((p,i)=>{
      const to=beyondFrame(p,p.held>=.5?-1:1);
      moves.push({from:p,to,leaving:true,delay:.12+.26*i/Math.max(1,extras.length-1),span:.58});
    });
    sales.forEach((m,i)=>{m.delay=sales.length>1?.43*i/(sales.length-1):0;m.span=sales.length>1?.57:1;});
    return moves;
  }
  function sample(now,finish=false) {
    if(!transition)return;
    const t=finish?1:clamp01((now-transition.start)/1080), {moves,oldStock}=transition;
    if(t>=1) {
      people=moves.filter(m=>!m.leaving).map(m=>m.to);
      stock=counts.unsold;transition=null;return;
    }
    stock=mix(oldStock,counts.unsold,smooth(t));
    people=moves.map(m=>{
      const u=clamp01((t-m.delay)/m.span);
      if(!m.approach) {
        const p=blend(m.from,m.to,smooth(u));
        if(m.cupLift) p.cy+=m.cupLift*Math.sin(Math.PI*u);
        return p;
      }
      if(u<.32)return blend(m.from,m.approach,smooth(u/.32));
      if(u<.55)return blend(m.approach,m.received,smooth((u-.32)/.23));
      const p=blend(m.received,m.to,smooth((u-.55)/.45));
      const hand=person(p.id,p.x,p.z,p.angle,1);
      p.cx=hand.cx;p.cy=hand.cy;p.cz=hand.cz;
      return p;
    });
  }
  function update(s) {
    const target=core.stallCounts(s), now=performance.now();
    const changed=!counts || ['served','waiting','unsold'].some(k=>counts[k]!==target[k]);
    const tradeChange=data ? s.traded-data.traded : 0;
    data=s;menuPrice(s.actualPrice);
    if(changed || Math.abs(tradeChange)>1e-8){
      sample(now); // A second edit starts from what the student is seeing, even mid-handoff.
      const first=!counts;
      const moves=crowdPlan(target);
      // A fractional sale can change the reading without adding a two-cup group.
      // The same guest lifts or lowers their drink; no extra person enters the queue.
      if(!changed && target.served) moves[target.served-1].cupLift=.15*Math.sign(tradeChange);
      counts=target;transition={moves,oldStock:stock,start:now};
      sample(now,first||reduced.matches);rebuild();
    }
    const description=T('成交、排隊未買到、未售的杯數','Cups sold, wanted but unavailable, and unsold');
    const localized=window.LabSettings.toHans?.(description) || description;
    canvas.setAttribute('aria-description',localized+' · '+[s.traded,s.shortage,s.excess].map(n=>Number(n.toFixed(2))).join(' / '));
    request();
  }
  function theme() {
    scene.background=new THREE.Color(D.mix(D.c['canvas-bg'],D.c.equi,D.dark?.09:.12));
    sky.intensity=D.dark?1.22:1.8;sun.intensity=D.dark?2.3:3.1;
    if(data){lastPrice=undefined;menuPrice(data.actualPrice);} nav.relabel();request();
  }
  function request() {
    if(frame || disposed || document.hidden) return;
    frame=requestAnimationFrame(now=>{
      frame=0; if(disposed || document.hidden)return;
      if(transition) {
        sample(now,reduced.matches);rebuild();
        if(transition)request();
      }
      control.update();renderer.render(scene,camera);
      projected.copy(boardAnchor).project(camera);
      const visible=camera.position.z>menuZ && projected.z>-1 && projected.z<1 && Math.abs(projected.x)<.91 && Math.abs(projected.y)<.90;
      priceTag.hidden=!visible;
      if(visible){priceTag.style.left=((projected.x+1)*50)+'%';priceTag.style.top=((1-projected.y)*50)+'%';}
    });
  }
  function resize() {
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false); camera.aspect=w/h;
    const shortLandscape=matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
    const closeFrame=w<460 || shortLandscape;
    const halfWidth=viewpoint==='front' ? (closeFrame?roofHalf:5.25) : (closeFrame?3.68:4.53);
    const minHeight=viewpoint==='front' ? (shortLandscape?2.55:2.50) : (shortLandscape?2.72:2.60);
    const half=Math.max(minHeight,halfWidth/camera.aspect);
    camera.fov=2*Math.atan(half/homeDistance)*180/Math.PI;
    camera.updateProjectionMatrix();request();
  }
  function preset(name) {
    viewpoint=name;camera.zoom=1;
    if(name==='front') {camera.position.set(2.55,5.45,13.55);control.target.set(-.69,1.34,.50);}
    else {camera.position.set(8.1,5.4,3.4);control.target.set(.78,1.04,.20);}
    homeDistance=camera.position.distanceTo(control.target);
    control.update();camera.updateMatrixWorld();
    if(name==='front'){
      const front=[[-3.55,3.02,.46],[1.11,3.02,.46],[-3.55,3.48,-.82],[1.11,3.48,-.82],[-3.55,3.02,-2.04],[1.11,3.02,-2.04]];
      const edges=front.map(v=>{const p=new THREE.Vector3(...v).applyMatrix4(camera.matrixWorldInverse);return p.x*homeDistance/-p.z;});
      roofHalf=(Math.max(...edges)-Math.min(...edges))/(2*.755);
    }
    nav.home();resize();
  }
  const observer=new ResizeObserver(resize);observer.observe(host);
  const motion=()=>{control.enableDamping=!reduced.matches;request();};
  const lost=e=>{ e.preventDefault();if(!disposed)onLost(); };
  reduced.addEventListener('change',motion);document.addEventListener('visibilitychange',request);
  canvas.addEventListener('webglcontextlost',lost);control.addEventListener('change',request);
  theme();preset('front');
  return {update,theme,preset,dispose(){
    disposed=true;cancelAnimationFrame(frame);observer.disconnect();
    reduced.removeEventListener('change',motion);document.removeEventListener('visibilitychange',request);
    canvas.removeEventListener('webglcontextlost',lost);control.removeEventListener('change',request);
    nav.dispose();control.dispose();batches.forEach(m=>m.dispose());resources.forEach(r=>r.dispose());
    sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();priceTag.remove();
  }};
}
