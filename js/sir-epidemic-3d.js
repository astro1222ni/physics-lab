import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const D = window.LabDraw, C = window.SirEpidemicCore;
const T = window.LabSettings.t;
const V = (x,y,z) => new THREE.Vector3(x,y,z);
const up = V(0,1,0);
function transform(x,y,z,w=1,h=1,d=1,ry=0,rz=0,rx=0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,'YXZ'));
  return new THREE.Matrix4().compose(V(x,y,z),q,V(w,h,d));
}

// A cap follows the same ellipsoid as the face. Its hairline rises at the
// forehead and drops at the nape, keeping the skin and hair surfaces separate.
function scalp(style) {
  const positions=[],normals=[],indices=[],sides=18,rings=9;
  for(let r=0;r<=rings;r++) for(let k=0;k<=sides;k++) {
    const phi=2*Math.PI*k/sides, front=Math.cos(phi);
    const hairline=[1.45,1.59,1.77,1.55,1.62][style]-.49*front+.085*Math.sin(phi*2+style);
    const angle=r*hairline/rings;
    const x=Math.sin(angle)*Math.sin(phi),y=Math.cos(angle),z=Math.sin(angle)*front;
    positions.push(x*.5,y*.5,z*.5);normals.push(x,y,z);
    if(r<rings && k<sides) {
      const a=r*(sides+1)+k,b=a+sides+1;
      indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setIndex(indices);return geometry;
}

// The mask spans both cheeks and clears the nose; three shallow folds catch the light.
function faceCover() {
  const positions=[],indices=[],columns=12,rows=12;
  for(let r=0;r<=rows;r++) for(let c=0;c<=columns;c++) {
    const v=r/rows,u=2*c/columns-1,a=Math.abs(u);
    const bottom=-.94+.23*a,top=.15-.34*a;
    const depth=.58-.30*a**1.65-.04*(1-v)+.014*Math.sin(v*6*Math.PI)*(1-.5*a);
    positions.push(u*(.4+.1*v),bottom+v*(top-bottom),depth);
    if(r<rows && c<columns) {
      const i=r*(columns+1)+c,j=i+columns+1;
      indices.push(i,i+1,j,i+1,j+1,j);
    }
  }
  const panel=new THREE.BufferGeometry();
  panel.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  panel.setIndex(indices);panel.computeVertexNormals();return panel;
}

// Hand-painted, tileable material maps. No image download is required.
function texture(kind) {
  const tile=document.createElement('canvas'); tile.width=256; tile.height=256;
  const g=tile.getContext('2d'); g.fillStyle='#f5f3ee'; g.fillRect(0,0,256,256);
  g.strokeStyle=kind==='brick'?'#a69a8e':'#b7b5ae'; g.lineWidth=kind==='roof'?3:2;
  if(kind==='brick') {
    for(let r=0;r<8;r++) {
      const offset=r%2*32;
      for(let c=-1;c<5;c++) {
        const x=c*64+offset, y=r*32;
        g.fillStyle='rgba(95,71,47,'+(.02+((r*7+c*3+20)%6)*.012)+')';
        g.fillRect(x+2,y+2,61,29); g.strokeRect(x,y,64,32);
      }
    }
  } else if(kind==='roof') {
    for(let x=0;x<=256;x+=32) {g.fillStyle='#bab9b4';g.fillRect(x,0,3,256);g.fillStyle='#fff';g.fillRect(x+3,0,2,256);}
  } else {
    g.strokeRect(0,0,128,128);g.strokeRect(128,128,128,128);
    for(let k=0;k<460;k++){g.fillStyle='rgba(75,68,61,.09)';g.fillRect((k*73)%255,(k*151+Math.floor(k/9))%256,1.5,1.5);}
  }
  const map=new THREE.CanvasTexture(tile);
  map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;
  if(kind==='brick') map.repeat.set(9,2);
  else if(kind==='roof') map.repeat.set(5,1);
  else map.repeat.set(10,8);
  return map;
}

export function createCourtyard(host,onLoss,campus) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate=false;
  const canvas=renderer.domElement; canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label',T('校舍與 '+campus.total+' 人的班級隊形','School buildings and '+campus.total+' students in class formations'));
  host.appendChild(canvas);
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(34,1,.1,170);
  const controls=new OrbitControls(camera,canvas);
  controls.enableDamping=true;controls.dampingFactor=.12;controls.zoomToCursor=true;
  controls.minDistance=2.7;controls.maxDistance=90;controls.maxPolarAngle=Math.PI*.48;
  const nav=window.LabView3DNav.attach({THREE,controls,host,canvas,radius:20,T});
  const sky=new THREE.HemisphereLight(0xfff5dd,0x9eaba6,1.75);
  const sun=new THREE.DirectionalLight(0xffe8c5,2.5);
  sun.position.set(-12,22,16);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
  Object.assign(sun.shadow.camera,{left:-19,right:19,top:17,bottom:-17,near:.5,far:64});
  sun.shadow.normalBias=.035;sun.shadow.bias=-.00035;sun.shadow.radius=2;
  scene.add(sky,sun);
  const floorGeo=new THREE.PlaneGeometry(120,120), floorMat=new THREE.ShadowMaterial({opacity:.20});
  const floor=new THREE.Mesh(floorGeo,floorMat);
  floor.rotation.x=-Math.PI/2;floor.position.y=-.81;floor.receiveShadow=true;scene.add(floor);
  const cube=new THREE.BoxGeometry(1,1,1), ball=new THREE.SphereGeometry(.5,14,10);
  const rod=new THREE.CylinderGeometry(.5,.5,1,8);
  const profile=points=>new THREE.LatheGeometry(points.map(([r,y])=>new THREE.Vector2(r,y)),12);
  const coat=profile([[0,0],[.44,0],[.46,.12],[.39,.41],[.47,.73],[.49,.81],[.40,.93],[.19,1],[0,1]]);
  const sleeve=profile([[0,0],[.34,.02],[.44,.12],[.49,.52],[.46,.76],[.32,.94],[0,1]]);
  const limb=profile([[0,0],[.29,.02],[.35,.20],[.46,.68],[.39,.91],[0,1]]);
  const foliage=new THREE.IcosahedronGeometry(.52,1), disc=new THREE.CylinderGeometry(.5,.5,1,32);
  const maps=['paving','brick','roof'].map(texture);
  const material=(map=null) => new THREE.MeshStandardMaterial({roughness:.82,map});
  const mats={};
  ['base','soil','paving','brick','roof','trim','stone','wood','leaf','leafLight','bark','line','metal',
    'recess','door','clock','clockInk','cloth','trousers','skin','hair','mask','jacket'].forEach(k=>{mats[k]=material();});
  mats.paving.map=maps[0];mats.brick.map=maps[1];mats.roof.map=maps[2];
  mats.glass=new THREE.MeshPhysicalMaterial({metalness:.14,roughness:.22,clearcoat:.65,transparent:true,opacity:.54,depthWrite:false});
  mats.cloth.side=THREE.DoubleSide;

  const batches=new Map(), hinges=[], drapes=[];
  function fixed(geometry,name,matrix) {
    const key=geometry.uuid+name;
    if(!batches.has(key)) batches.set(key,{geometry,name,matrices:[]});
    batches.get(key).matrices.push(matrix);
  }
  function box(name,x,y,z,w,h,d,ry=0,rz=0,rx=0) {fixed(cube,name,transform(x,y,z,w,h,d,ry,rz,rx));}
  function instances(geometry,name,matrices) {
    const mesh=new THREE.InstancedMesh(geometry,mats[name],matrices.length);
    mesh.name=name;
    matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.castShadow=!['glass','line','clockInk'].includes(name);mesh.receiveShadow=true;
    mesh.computeBoundingSphere();scene.add(mesh);return mesh;
  }

  box('base',0,-.44,-.8,25.9,.72,20.9);box('soil',0,-.10,-.8,25.55,.15,20.55);
  box('paving',.1,.01,.15,22.9,.12,16.5);
  for(const x of [-8.4,8.6]) box('line',x,.079,.35,.047,.008,12.65);
  for(const z of [-5.96,6.66]) box('line',.1,.079,z,17,.008,.047);
  for(let k=0;k<=5;k++) {
    const z=-5.95+k*2.52;
    for(const x of [-8.1,.12,8.3]) box('line',x,.082,z,.38,.008,.045);
  }
  // Two wings frame the court. Windows face the assembly ground in both wings.
  function wing(x,z,turn,bays) {
    const origin=transform(x,0,z,1,1,1,turn), width=bays*2.35+.72, depth=2.7;
    const loc=(a,b,c,w=1,h=1,d=1,ry=0,rz=0,rx=0)=>origin.clone().multiply(transform(a,b,c,w,h,d,ry,rz,rx));
    const unit=(name,a,b,c,w,h,d,rx=0)=>fixed(cube,name,loc(a,b,c,w,h,d,0,0,rx));
    unit('brick',0,2.43,0,width,4.74,depth);
    unit('stone',0,.26,0,width+.22,.34,depth+.22);
    unit('stone',0,2.33,0,width+.17,.17,depth+.18);
    unit('trim',0,4.82,0,width+.6,.22,depth+.51);
    for(const side of [-1,1]) unit('roof',0,5.08,side*.76,width+.69,.19,1.7,side*.30);
    unit('trim',0,5.32,0,width+.75,.13,.16);
    for(let b=0;b<bays;b++) {
      const wx=(b-(bays-1)/2)*2.35;
      for(const wy of [1.2,3.57]) {
        const face=depth/2;
        unit('stone',wx,wy,face+.045,1.87,1.27,.17);
        unit('recess',wx,wy,face+.15,1.64,1.04,.075);
        unit('stone',wx,wy-.63,face+.16,2.02,.10,.38);
        unit('trim',wx,wy+.61,face+.14,1.99,.10,.28);
        // Fixed curtain hangs behind two outward-opening casements.
        for(const side of [-1,1]) {
          drapes.push(loc(wx+side*.59,wy+.04,face+.215,.43,.89,.28));
          hinges.push({pivot:loc(wx+side*.80,wy,face+.26),side});
        }
      }
      unit('stone',wx-1.10,2.45,depth/2+.02,.12,4.68,.14);
    }
  }
  wing(0,-8.45,0,9);wing(-10.95,-2.0,Math.PI/2,4);
  // Entrance portico, stepped plinth, school clock and timber double doors.
  box('brick',0,2.74,-6.95,3.05,5.4,1.35);box('stone',0,5.46,-6.95,3.32,.20,1.6);
  box('trim',0,5.64,-6.95,3.5,.18,1.72);
  box('door',0,1.04,-6.22,1.68,1.99,.12);box('stone',0,1.03,-6.13,.06,1.98,.09);
  for(const x of [-.41,.41]) box('glass',x,1.36,-6.12,.61,.96,.09);
  for(const x of [-1.33,1.33]) fixed(rod,'stone',transform(x,1.18,-5.69,.24,2.28,.24));
  box('roof',0,2.39,-5.95,3.4,.19,1.4);box('stone',0,.16,-6.01,3.6,.22,1.32);
  box('stone',0,.10,-5.30,3.85,.12,.35);
  fixed(disc,'trim',transform(0,4.13,-6.22,1.15,.16,1.15,0,0,Math.PI/2));
  fixed(disc,'clock',transform(0,4.13,-6.11,1.01,.055,1.01,0,0,Math.PI/2));
  for(let k=0;k<12;k++) {
    const a=k*Math.PI/6;
    box('clockInk',Math.sin(a)*.42,4.13+Math.cos(a)*.42,-6.065,.026,.075,.02,0,-a);
  }
  box('clockInk',-.078,4.24,-6.045,.045,.29,.02,0,.6);
  box('clockInk',.135,4.23,-6.04,.039,.36,.02,0,-.96);
  // Timber benches and planting beds at the edges of the model.
  for(const [x,z] of [[9.8,-3],[9.8,3],[-9.5,5.7]]) {
    for(const leg of [-.72,.72]) box('metal',x,.30,z+leg,.56,.43,.12);
    for(let k=0;k<3;k++) box('wood',x+(k-1)*.20,.54,z,.17,.12,1.85);
    box('wood',x+.34,.85,z,.10,.28,1.86);
  }
  for(const [x,z,size] of [[11.5,6.7,1.0],[11.5,.1,.94],[11.5,-6.6,1.17],[-10.6,6.9,.86],[-11.6,4.3,.92]]) {
    box('stone',x,.19,z,1.52,.31,1.52);box('soil',x,.36,z,1.35,.06,1.35);
    fixed(rod,'bark',transform(x,1.17,z,.25,1.96,.25));
    fixed(foliage,'leaf',transform(x,2.45,z,2.15*size,2.7*size,2.04*size,.3));
    fixed(foliage,'leafLight',transform(x-.31,2.94,z+.23,1.54*size,1.70*size,1.5*size,.7));
  }
  for(const b of batches.values()) instances(b.geometry,b.name,b.matrices);

  const cloth=new THREE.PlaneGeometry(1,1,8,5), clothRest=cloth.attributes.position.array.slice();
  instances(cloth,'cloth',drapes);
  function ripple(time,strength) {
    const p=cloth.attributes.position;
    for(let j=0;j<p.count;j++) {
      const x=clothRest[j*3],y=clothRest[j*3+1],lo=.5-y;
      const fold=Math.cos(x*15);
      p.setXYZ(j,x+strength*lo*.14*Math.sin(time+x*2),y+.025*lo*fold,
        .22*fold+strength*lo*.55*Math.sin(time*1.35+3*x));
    }
    p.needsUpdate=true;cloth.computeVertexNormals();
  }
  ripple(0,0);
  const sashParts=[
    ['glass',0,0,.74,.94,.038],['trim',-.38,0,.045,1.02,.055],['trim',.38,0,.045,1.02,.055],
    ['trim',0,.48,.80,.044,.055],['trim',0,-.48,.80,.044,.055],['trim',0,.03,.8,.037,.053]
  ];
  const windowMeshes=sashParts.map(([name])=>instances(cube,name,hinges.map(h=>h.pivot)));
  function openWindows(air) {
    const angle=air>0 ? .32+.9*air : 0;
    hinges.forEach(({pivot,side},i)=>{
      const basis=pivot.clone().multiply(new THREE.Matrix4().makeRotationY(side*angle));
      sashParts.forEach(([,x,y,w,h,d],k)=>{
        windowMeshes[k].setMatrixAt(i,basis.clone().multiply(transform(-side*.40+x,y,.02,w,h,d)));
      });
    });
    windowMeshes.forEach(m=>{m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();});
  }

  // One stable student per seat. Proportions, clothes and posture stay the same across dates.
  const parts={};
  function part(name,matrix) { (parts[name]??=[]).push(matrix); }
  const badgeGeometry={s:new THREE.CircleGeometry(.5,20),i:new THREE.CircleGeometry(.60,3,Math.PI/2),r:new THREE.PlaneGeometry(.88,.88)};
  const smile=new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V(-.018,.002,0),V(0,-.003,.003),V(.018,.002,0)),8,.0019,5,false);
  mats.lip=new THREE.MeshStandardMaterial({color:0x835346,roughness:.92});
  mats.badge=new THREE.MeshBasicMaterial({color:0xfff6d8});
  mats.contact=new THREE.MeshBasicMaterial({color:0x312923,transparent:true,opacity:.19,depthWrite:false});
  const skinTones=[0xf4c8a4,0xd9a783,0x9b674c,0xc88c67,0xecb695,0xb17b58];
  const hairColors=[0x302724,0x4a342c,0x292a2e,0x694a3c,0x443430];
  const pantsColors=[0x3c4b58,0x64605f,0x44495c,0x485a5c,0x38465c];
  const students=[],caps=Array.from({length:5},(_,n)=>scalp(n));
  const assembly=[];
  const oldGrid=campus.classes===10 && campus.sizes.every(v=>v===40);
  const blockRows=Math.ceil(campus.classes/2);
  // All classes fit between the two boundary lines; use the original spacing at 20 rows.
  const depthScale=Math.min(1,(19*.525+4*.33)/((campus.rows-1)*.525+(blockRows-1)*.33));
  for(let j=0;j<campus.classes;j++) for(let index=0;index<campus.sizes[j];index++) {
    const seat=C.seatAt(campus,j,index);
    assembly.push({j,index,...seat});
    const id=oldGrid?seat.oldSeat:seat.seat;
    let seed=Math.imul(id+1,2654435761)>>>0;
    const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const pick=list=>list[Math.floor(random()*list.length)];
    const {row,col}=seat;
    const x=(col-9.5)*.74+(col<10?-.37:.37);
    const z=((row-(campus.rows-1)/2)*.525+(Math.floor(j/2)-(blockRows-1)/2)*.33)*depthScale+.34;
    const height=.86+.29*random(), width=.84+.37*random();
    const pose=transform(x,.082,z,width,height,.89+.19*random(),(random()-.5)*.79,(random()-.5)*.065);
    const local=(x,y,z,w,h,d,ry=0,rz=0,rx=0)=>pose.clone().multiply(transform(x,y,z,w,h,d,ry,rz,rx));
    // The narrow end of each sculpted limb follows the wrist or ankle.
    function segment(name,bottom,top,diameter,depth=1) {
      const a=V(...bottom), delta=V(...top).sub(a),length=delta.length();
      const q=new THREE.Quaternion().setFromUnitVectors(up,delta.normalize());
      part(name,pose.clone().multiply(new THREE.Matrix4().compose(a,q,V(diameter,length,diameter*depth))));
    }
    const skin=pick(skinTones),hair=pick(hairColors),pants=pick(pantsColors);
    const style=Math.floor(random()*5), stance=Math.floor(random()*6), lead=random()<.5?-1:1;
    const shade=(random()-.45)*.60, hem=.53+random()*.075, shoulder=.903+(random()-.5)*.028;
    const shoulderWidth=.345+random()*.06, bodyDepth=.216+random()*.028;
    students.push({skin,hair,pants,shade,style});
    part('shadows',local(.012,-.007,.014,.44,.003,.27));
    part('jackets',local(0,hem,0,shoulderWidth,.941-hem,bodyDepth));
    part('badges',local(.065,shoulder-.072,bodyDepth*.51+.006,.083,.083,1,.28));
    part('neck',local(0,.942,0,.096,.14,.102));
    const headY=1.048+(random()-.5)*.023, faceW=.171+random()*.021;
    part('heads',local(0,headY,.004,faceW,.224,.171));
    part('noses',local(0,headY-.007,.081,.026,.037,.027));
    part('mouths',local(0,headY-.049,.080,.83+style*.075,.9,1));
    part('cap'+style,local(0,headY,.004,faceW*1.058,.239,.184));
    const fringeX=[0,.042,-.042,0,.029][style], fringeY=[.078,.056,.045,.078,.067][style];
    part('fringe',local(fringeX,headY+fringeY,.053,style===0?.096:.123,style===2?.083:.052,.061,0,style===2?-.54:.22));
    if(style===1 || style===4) part('tails',local(.023,headY+(style===4?.113:-.023),-.078,.098,style===4?.093:.153,.100));
    if(style===2) for(const side of [-1,1]) part('locks',local(side*.068,headY-.006,-.017,.059,.167,.113,0,side*.10));
    if(style===3) for(let k=-2;k<=2;k++) part('curls',local(k*.031,headY+.073-Math.abs(k)*.004,.044,.058,.072,.080,0,k*.24));
    part('masks',local(0,headY,.004,faceW*.96,.073,.171));
    for(const side of [-1,1]) {
      part('eyes',local(side*.035,headY+.018,.081,.014,.017,.010));
      part('brows',local(side*.035,headY+.037,.080,.032,.0055,.007,0,side*(style-2)*.05));
      part('ears',local(side*faceW*.48,headY-.003,0,.033,.055,.029));
      if(style!==0 && style!==3) part('collars',local(side*.033,.91,.080,.059,.034,.021,0,side*.45));
      const active=side===lead, shoulderX=side*shoulderWidth*.42;
      const shoulderPt=[shoulderX,shoulder,0];
      let elbow=[side*.204,.737,-.001], wrist=[side*.216,.581,.025];
      if(stance===1 && active) {elbow=[side*.257,.749,.045]; wrist=[side*.182,.891,.113];}
      if(stance===2 && active) {elbow=[side*.286,.758,-.015]; wrist=[side*.159,.690,.085];}
      if(stance===3) {elbow=[side*.203,.729,.049]; wrist=[side*.059,.649,.130];}
      if(stance===4 && active) {elbow=[side*.246,.773,.044]; wrist=[side*.153,.985,.095];}
      if(stance===5 || (!active && stance===1)) {elbow=[side*.192,.735,-.062];wrist=[side*.121,.620,-.108];}
      const shoulderToElbow=V(...shoulderPt).lerp(V(...elbow),style%2?.82:.60).toArray();
      segment('sleeves',shoulderToElbow,shoulderPt,.105);
      segment('upperArms',elbow,shoulderToElbow,.067);
      segment('forearms',wrist,elbow,.065);
      part('elbows',local(elbow[0],elbow[1],elbow[2],.055,.061,.053));
      const palm=V(...wrist).sub(V(...elbow)).normalize().multiplyScalar(.040).add(V(...wrist));
      segment('hands',palm.toArray(),V(...wrist).lerp(V(...elbow),.07).toArray(),.052,.85);
      const step=side*lead*(stance===3?.047:.020), spread=.074+stance*.004;
      const ankle=[side*spread,.075,step], knee=[side*.081,.318,.019+step*.7],hip=[side*.074,.567,-.003];
      part('knees',local(knee[0],knee[1],knee[2],.087,.090,.095));
      segment('thighs',knee,hip,.142,1.08);segment('calves',ankle,knee,.110,1.10);
      part('shoes',local(ankle[0],.051,step+.026,.105,.080,.178,side*.085));
      part('soles',local(ankle[0],.027,step+.032,.107,.042,.175,side*.085));
    }
  }
  const jackets=instances(coat,'jacket',parts.jackets), sleeves=instances(sleeve,'jacket',parts.sleeves);
  const badges=Object.fromEntries(Object.entries(badgeGeometry).map(([key,geo])=>[key,instances(geo,'badge',parts.badges)]));
  instances(disc,'contact',parts.shadows).castShadow=false;
  function colored(name,geometry,material,colors) {
    const mesh=instances(geometry,material,parts[name]);
    colors.forEach((color,i)=>mesh.setColorAt(i,new THREE.Color(color)));
    mesh.instanceColor.needsUpdate=true;
    return mesh;
  }
  const tones=(key,n=1)=>students.flatMap(student=>Array(n).fill(student[key]));
  for(const name of ['heads','noses','neck']) colored(name,ball,'skin',tones('skin'));
  for(const name of ['ears','elbows','hands','upperArms','forearms']) colored(name,['ears','elbows'].includes(name)?ball:limb,'skin',tones('skin',2));
  caps.forEach((geo,style)=>colored('cap'+style,geo,'jacket',students.filter(s=>s.style===style).map(s=>s.hair)));
  colored('fringe',ball,'jacket',tones('hair'));
  for(const name of ['tails','locks','curls']) if(parts[name]) instances(ball,'hair',parts[name]);
  colored('knees',ball,'jacket',tones('pants',2));
  for(const name of ['thighs','calves']) colored(name,limb,'jacket',tones('pants',2));
  instances(smile,'lip',parts.mouths);instances(ball,'hair',parts.brows);
  instances(ball,'clockInk',parts.eyes);instances(cube,'mask',parts.collars);
  instances(ball,'hair',parts.shoes);instances(ball,'stone',parts.soles);
  const maskPanel=faceCover(),loops=[-1,1].map(side=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    V(side*.49,-.17,.28),V(side*.54,.13,.07),V(side*.57,-.12,-.05),V(side*.51,-.47,.01),V(side*.405,-.71,.24)
  ]),12,.011,5,false));
  const masks=[maskPanel,...loops].map(geo=>instances(geo,'mask',parts.masks));
  masks.forEach(mesh=>{mesh.visible=false;});
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  controls.enableDamping=!motion.matches;
  let data=null,activePreset='overview',af=0,oldTime=0,lastCount='',lastAir=-1,disposed=false;
  function render(time) {
    af=0; if(disposed || document.hidden) return;
    const waving=data && data.air>0 && !motion.matches;
    controls.update();
    if(waving && time-oldTime>45) {ripple(time*.001,data.air);oldTime=time;}
    renderer.render(scene,camera);
    if(waving) request();
  }
  function request() {if(!af && !document.hidden && !disposed) af=requestAnimationFrame(render);}
  function preset(name) {
    activePreset=name;
    const aspect=camera.aspect;
    if(name==='overview') {
      const target=V(0,.72,-.25),dir=V(12,19,27).normalize();
      // Fit the projected corners of the diorama for the actual viewport.
      const right=up.clone().cross(dir).normalize(),vert=dir.clone().cross(right);
      let distance=0;
      const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      for(const x of [-13,13]) for(const y of [-.8,5.8]) for(const z of [-11.3,9.9]) {
        const p=V(x,y,z).sub(target);
        distance=Math.max(distance,p.dot(dir)+Math.max(Math.abs(p.dot(vert)),Math.abs(p.dot(right))/aspect)/tan);
      }
      controls.target.copy(target);camera.position.copy(target).addScaledVector(dir,distance*1.025);
    } else {
      controls.target.set(.95,1.01,-3.85);
      camera.position.copy(controls.target).addScaledVector(V(.26,.14,1).normalize(),aspect<1.25?4.65:5.2);
    }
    controls.update();nav.home();request();
  }
  function resize() {
    const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h) return;
    const changed=Math.abs(camera.aspect-w/h)>.015;
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
    if(changed) preset(activePreset);else request();
  }
  function update(next) {
    data=next;
    if(lastAir!==data.air) {openWindows(data.air);ripple(0,0);lastAir=data.air;renderer.shadowMap.needsUpdate=true;}
    if(masks[0].visible!==(data.mask>0)) {masks.forEach(mesh=>{mesh.visible=data.mask>0;});renderer.shadowMap.needsUpdate=true;}
    const key=[data.schoolKey,data.day,data.counts.s,data.counts.i,...(data.classCounts||[]).flatMap(c=>[c.s,c.i])].join('/');
    if(key!==lastCount) {
      const tones={s:new THREE.Color(D.c.neg),i:new THREE.Color(D.c.pos),r:new THREE.Color(D.c.probe)};
      const used={s:0,i:0,r:0}, dye=new THREE.Color(), light=new THREE.Color(0xfff2df), dark=new THREE.Color(0x23343d);
      for(let i=0;i<assembly.length;i++) {
        const seat=assembly[i], group=C.seatGroup(data,seat.j,seat.index), tint=tones[group];
        badges[group].setMatrixAt(used[group]++,parts.badges[i]);
        const shade=students[i].shade;
        dye.copy(tint).lerp(shade>0?light:dark,Math.abs(shade));
        jackets.setColorAt(i,dye);
        dye.lerp(shade>0?dark:light,.08);
        sleeves.setColorAt(2*i,dye);sleeves.setColorAt(2*i+1,dye);
      }
      for(const [group,mesh] of Object.entries(badges)) {
        mesh.count=used[group];mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
      }
      jackets.instanceColor.needsUpdate=true;sleeves.instanceColor.needsUpdate=true;lastCount=key;
    }
    request();
  }
  function theme() {
    const c=D.c, dark=D.dark;
    const stone=dark?'#d7c5ac':'#e4d6bb',roof=dark?'#587977':'#42706b';
    const palette={
      base:D.mix(c.field,c.accent,.35),soil:'#88967b',paving:dark?'#aaa397':'#d2c7b7',
      brick:dark?'#ca916b':'#dba17c',stone,roof,trim:dark?'#607d77':'#53766f',
      wood:'#ad754c',leaf:'#548264',leafLight:'#799b6d',bark:'#785b40',line:'#f4e4b7',metal:'#576965',
      recess:'#294955',glass:'#96c9d2',door:'#386868',clock:'#fff2d1',clockInk:'#35484a',cloth:'#eed3a7',
      trousers:'#344d60',skin:'#ffffff',hair:'#3d3331',mask:'#d5f0eb',jacket:'#ffffff'
    };
    Object.entries(palette).forEach(([k,v])=>mats[k].color.set(v));
    scene.background=new THREE.Color(D.mix(c['canvas-bg'],c.accent,dark?.14:.10));
    sky.intensity=dark?1.35:1.7;sun.intensity=dark?1.95:2.25;
    renderer.shadowMap.needsUpdate=true;lastCount='';if(data) update(data);request();
  }
  function visibility() {if(document.hidden){cancelAnimationFrame(af);af=0;}else request();}
  function motionChange(){controls.enableDamping=!motion.matches;ripple(0,0);request();}
  function lost(e){e.preventDefault();if(!disposed) onLoss();}
  const observer=new ResizeObserver(resize);observer.observe(host);
  controls.addEventListener('change',request);document.addEventListener('visibilitychange',visibility);
  motion.addEventListener('change',motionChange);canvas.addEventListener('webglcontextlost',lost);
  theme();resize();
  return {update,theme,preset,dispose() {
    disposed=true;cancelAnimationFrame(af);observer.disconnect();nav.dispose();
    controls.removeEventListener('change',request);controls.dispose();
    document.removeEventListener('visibilitychange',visibility);motion.removeEventListener('change',motionChange);
    canvas.removeEventListener('webglcontextlost',lost);
    scene.traverse(o=>{if(o.isInstancedMesh) o.dispose();});
    [cube,ball,rod,coat,sleeve,limb,smile,foliage,disc,cloth,floorGeo,maskPanel,...loops,...caps,...Object.values(badgeGeometry)].forEach(g=>g.dispose());floorMat.dispose();
    Object.values(mats).forEach(m=>m.dispose());maps.forEach(m=>m.dispose());sun.shadow.dispose();
    renderer.dispose();renderer.forceContextLoss();canvas.remove();
  }};
}
