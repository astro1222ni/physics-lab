import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

const C = window.BasketballShotCore, D = window.LabDraw;
const v = (x,y,z) => new THREE.Vector3(x,y,z);
const mix = D.mix, shade = D.shade;
function texture(width,height,paint) {
  const tile=document.createElement('canvas');tile.width=width;tile.height=height;
  paint(tile.getContext('2d'),width,height);
  const map=new THREE.CanvasTexture(tile);map.colorSpace=THREE.SRGBColorSpace;
  map.anisotropy=4;return map;
}
function floorMap(x0,x1,width,shot,p) {
  return texture(2048,1024,(c,w,h)=>{
    const wood=shade(p.timber,p.dark?.30:.08);
    c.fillStyle=wood;c.fillRect(0,0,w,h);
    for(let row=0;row<76;row++){
      const y=row*h/76,board=h/76,stagger=(row%4)*37;
      for(let i=-1;i<15;i++){
        const x=i*153+stagger,seed=Math.sin(row*37+i*17);
        c.fillStyle=D.alpha(seed>0?p.white:p.deep,.035+Math.abs(seed)*.095);c.fillRect(x,y,153,board);
        c.strokeStyle=D.alpha(p.deep,.22);c.lineWidth=1;c.strokeRect(x,y,153,board);
        c.strokeStyle=D.alpha(p.deep,.10);c.beginPath();c.moveTo(x+4,y+board*.43);
        c.bezierCurveTo(x+42,y+board*.27,x+82,y+board*.55,x+144,y+board*.38);c.stroke();
      }
    }
    c.save();c.scale(w/(x1-x0),h/width);c.translate(-x0,width/2);
    c.strokeStyle=p.white;c.lineWidth=.05;
    if(shot){
      const ft=-4.225,base=1.575;
      c.fillStyle=D.alpha(p.pad,.48);c.fillRect(ft,-2.45,base-ft,4.9);c.strokeRect(ft,-2.45,base-ft,4.9);
      c.strokeRect(base-28,-7.5,28,15);
      c.beginPath();c.arc(ft,0,1.80,Math.PI/2,1.5*Math.PI);c.stroke();
      c.setLineDash([.26,.25]);c.beginPath();c.arc(ft,0,1.8,-Math.PI/2,Math.PI/2);c.stroke();c.setLineDash([]);
      const r=C.court.threePoint,z=6.6,join=-Math.sqrt(r*r-z*z),a=Math.acos(join/r);
      c.beginPath();c.moveTo(base,-z);c.lineTo(join,-z);c.arc(0,0,r,-a,a,true);c.lineTo(base,z);c.stroke();
      c.beginPath();c.arc(0,0,1.275,Math.PI/2,1.5*Math.PI);c.stroke();
      c.beginPath();c.arc(base-14,0,1.8,0,2*Math.PI);c.stroke();
      c.fillRect(base-14,-7.5,.05,15);
      for(const x of [-1.12,-1.99,-2.90,-3.78])for(const s of [-1,1])c.fillRect(x,s*2.45,.055,s*.18);
    }else{
      c.strokeStyle=D.alpha(p.white,.82);c.lineWidth=.055;c.strokeRect(0,-1.35,x1-2,2.7);
      for(let m=1;m<x1-1;m++){
        c.beginPath();c.moveTo(m,1.35);c.lineTo(m,m%5?1.58:1.92);c.stroke();
        if(!(m%5)){c.font='.42px system-ui';c.fillStyle=p.white;c.fillText(m+' m',m-.3,2.43);}
      }
    }
    c.restore();
  });
}
function ballMap(soft,p) {
  return texture(512,256,(c,w,h)=>{
    c.fillStyle=soft?p.softball:p.ball;c.fillRect(0,0,w,h);
    for(let y=2;y<h;y+=4)for(let x=(y%8?1:3);x<w;x+=4){
      c.fillStyle=D.alpha(p.deep,soft?.055:.17);c.fillRect(x,y,1.5,1.4);
    }
    const wave=(base,amp,cycles,phase)=>{
      c.beginPath();for(let x=0;x<=w;x+=2){
        const y=h*(base+amp*Math.sin(x/w*Math.PI*2*cycles+phase));if(x)c.lineTo(x,y);else c.moveTo(x,y);
      }c.stroke();
    };
    c.strokeStyle=soft?p.orange:p.deep;c.lineWidth=soft?4:3.9;
    if(soft){c.setLineDash([6,3]);wave(.27,.19,2,0);wave(.73,.19,2,Math.PI);}
    else{wave(.5,0,1,0);wave(.5,.31,1,0);wave(.5,.31,1,Math.PI);
      for(const x of [0,128,256,384,512]){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}}
  });
}
function clear(group) {
  const mats=new Set(),geos=new Set(),maps=new Set();
  group.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});
  mats.forEach(m=>{if(m.map)maps.add(m.map);m.dispose();});maps.forEach(m=>m.dispose());geos.forEach(g=>g.dispose());group.clear();
}
function material(color,opts={}){return new THREE.MeshStandardMaterial({color,roughness:.68,...opts});}
function mesh(g,geo,mat,x,y,z) {
  const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=!mat.transparent;o.receiveShadow=true;g.add(o);return o;
}
function box(g,mat,x,y,z,w,h,d) {return mesh(g,new THREE.BoxGeometry(w,h,d),mat,x,y,z);}
function ell(g,mat,x,y,z,rx,ry,rz) {
  const o=mesh(g,new THREE.SphereGeometry(1,22,15),mat,x,y,z);o.scale.set(rx,ry,rz);return o;
}
function strut(g,mat,a,b,r,r2=r,sides=10) {
  const start=v(...a),delta=v(...b).sub(start),len=delta.length();
  if(len<.0001)return;
  const m=mesh(g,new THREE.CylinderGeometry(r2,r,len,sides),mat,...start.clone().addScaledVector(delta,.5).toArray());
  m.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize());return m;
}
function gym(g,x0,x1,isShot,p) {
  const floor=material(p.white,{map:floorMap(x0,x1,18,isShot,p),roughness:.52});
  const ground=mesh(g,new THREE.PlaneGeometry(x1-x0,18),floor,(x0+x1)/2,-.012,0);
  ground.rotation.x=-Math.PI/2;ground.castShadow=false;
  const pad=material(p.pad),wall=material(p.wall),beam=material(p.metal,{metalness:.43}),
    glass=material(mix(p.wall,p.path,.23),{emissive:shade(p.wall,-.52),roughness:.27}),
    rail=material(shade(p.timber,.14)),stripe=material(p.orange),lamp=material(p.white,{emissive:shade(p.white,-.15)});
  const sideWall=new THREE.Group(),endWall=new THREE.Group();
  g.add(sideWall,endWall);
  const mid=(x0+x1)/2;
  box(sideWall,wall,mid,3.75,-8.94,x1-x0,7.5,.15);
  box(endWall,wall,x1,3.75,0,.18,7.5,18);
  for(let x=x0+.55;x<x1;x+=1.12)box(sideWall,pad,x,.85,-8.79,1.08,1.65,.16);
  for(let z=-8.45;z<8.8;z+=1.12)box(endWall,pad,x1-.13,.85,z,.14,1.65,1.08);
  box(sideWall,stripe,mid,1.83,-8.78,x1-x0,.09,.10);
  box(endWall,stripe,x1-.13,1.83,0,.10,.09,18);
  // Perforated acoustic timber and the dark reveal above the wall padding.
  const acoustic=texture(256,128,(c,w,h)=>{
    c.fillStyle=mix(p.timber,p.wall,.34);c.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=12){
      c.fillStyle=D.alpha(p.deep,.31);c.fillRect(x,0,2,h);
      c.fillStyle=D.alpha(p.white,.19);c.fillRect(x+2,0,1,h);
      for(let y=5;y<h;y+=12){c.fillStyle=D.alpha(p.deep,.24);c.fillRect(x+5,y,1.8,1.8);}
    }
  });
  acoustic.wrapS=THREE.RepeatWrapping;acoustic.repeat.x=(x1-x0)/3;
  const lining=material(p.white,{map:acoustic});
  box(sideWall,lining,mid,2.85,-8.83,x1-x0,1.85,.07);
  box(endWall,lining,x1-.095,2.85,0,.065,1.85,17.9);
  for(let x=x0+1.35;x<x1-1;x+=3){
    box(sideWall,glass,x,5.34,-8.79,2.74,2.07,.07);
    box(sideWall,beam,x,5.34,-8.70,.045,2.09,.05);
    box(sideWall,beam,x,5.35,-8.70,2.73,.05,.05);
    box(sideWall,beam,x-1.43,3.7,-8.7,.105,7.4,.15);
    strut(sideWall,beam,[x-1.43,6.55,-8.7],[x-1.43,8,-3],.07);
    strut(sideWall,beam,[x-1.43,7.65,-8.7],[x-1.43,8,-3],.055);
    box(sideWall,lamp,x-1.43,7.58,-3.45,.14,.07,1.4);
  }
  for(let z=-7;z<8;z+=3.2){
    box(endWall,glass,x1-.14,5.34,z,.06,2.07,2.86);box(endWall,beam,x1-.20,5.34,z,.05,.05,2.86);
    box(endWall,beam,x1-.20,5.34,z,.05,2.07,.05);
  }
  for(let x=x0+2;x<x1-2;x+=4){
    box(sideWall,rail,x,.49,-7.22,2.8,.10,.42);box(sideWall,rail,x,.83,-7.42,2.8,.22,.07);
    for(const dx of [-1.05,1.05])box(sideWall,beam,x+dx,.24,-7.22,.07,.48,.31);
  }
  return {sideWall,endWall,endX:x1};
}
function basket(g,p) {
  const board=C.court.boardOffset,y=C.rimHeight, steel=material(p.metal,{metalness:.56,roughness:.4}),
    pad=material(p.pad),white=material(p.white),orange=material(p.orange,{metalness:.38}),net=material(p.white);
  box(g,pad,board+1.12,.23,0,1.54,.46,1.00);
  for(const z of [-.38,.38]) {
    strut(g,steel,[board+1.39,.4,z],[board+1.08,2.81,z],.082);
    strut(g,steel,[board+1.12,2.35,z],[board+.03,3.52,z],.047);
    strut(g,steel,[board+1.08,2.85,z],[board+.04,3.55,z],.057);
    ell(g,steel,board+1.51,.105,z,.12,.12,.07);
  }
  const bottom=C.court.boardBottom,bh=C.court.boardHeight,bw=C.court.boardWidth;
  const glass=new THREE.MeshPhysicalMaterial({color:shade(p.path,.74),roughness:.18,metalness:.10,
    transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide,clearcoat:1});
  box(g,glass,board+.007,bottom+bh/2,0,.014,bh,bw);
  function rect(x,b,h,w,t,mat){
    for(const y of [b+t/2,b+h-t/2])box(g,mat,x,y,0,.025,t,w);
    for(const z of [-(w-t)/2,(w-t)/2])box(g,mat,x,b+h/2,z,.025,h,t);
  }
  rect(board+.018,bottom,bh,bw,.058,steel);rect(board-.009,bottom+.018,bh-.036,bw-.036,.035,white);
  rect(board-.014,y,.45,.59,.04,white);
  box(g,orange,board-.08,y,0,.16,.035,.09);
  const rim=mesh(g,new THREE.TorusGeometry(C.rimRadius+.009,.009,10,80),orange,0,y,0);rim.rotation.x=Math.PI/2;
  const cords=new THREE.Group();g.add(cords);cords.position.y=y;
  const cord=(a,r,height)=>[r*Math.cos(a),height-y,r*Math.sin(a)];
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    for(const sign of [-1,1]){
      const pts=[cord(a,.225,y-.009),cord(a+sign*.27,.190,2.88),cord(a+sign*.58,.144,2.71),cord(a+sign*.80,.128,2.64)];
      for(let j=1;j<pts.length;j++)strut(cords,net,pts[j-1],pts[j],.0045,.0045,5);
    }
  }
  return cords;
}
// Smooth transverse sections give the body a jaw, rib cage, waist and changing
// muscle bellies. Each row is [height, front radius, side radius, front offset].
function crossSection(rows, y) {
  let i=1;
  while (i<rows.length-1 && y>rows[i][0]) i++;
  const a=rows[i-1], b=rows[i], t=THREE.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
  return [1,2,3].map(k=>THREE.MathUtils.lerp(a[k]||0,b[k]||0,t));
}
function surface(parent,mat,rings,sides,point,name) {
  const positions=[],uv=[],indices=[];
  for(let j=0;j<=rings;j++){
    for(let i=0;i<=sides;i++){
      const q=i/sides,t=j/rings;
      positions.push(...point(q,t).toArray());uv.push(q,t);
      if(i && j){
        const k=j*(sides+1)+i;
        indices.push(k-sides-2,k-1,k-sides-1,k-sides-1,k-1,k);
      }
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);
  smoothNormals(geo,rings,sides);
  const part=mesh(parent,geo,mat,0,0,0);part.name=name;return part;
}
function smoothNormals(geo,rings,sides) {
  geo.computeVertexNormals();
  const normals=geo.getAttribute('normal');
  for(let i=0;i<=rings;i++){
    const a=i*(sides+1),b=a+sides,n=v().fromBufferAttribute(normals,a).add(v().fromBufferAttribute(normals,b)).normalize();
    normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);
  }
}
function sectionPoint(rows,angle,y,extra=0) {
  const [rx,rz,x]=crossSection(rows,y);
  return v(x+(rx+extra)*Math.cos(angle),y,(rz+extra)*Math.sin(angle));
}
function form(parent,mat,rows,name,sides=24) {
  return surface(parent,mat,rows.length-1,sides,(q,t)=>{
    const [y,rx,rz,x=0]=rows[Math.round(t*(rows.length-1))],a=q*2*Math.PI;
    return v(x+rx*Math.cos(a),y,rz*Math.sin(a));
  },name);
}
function trimLine(parent,mat,points,r=.005) {
  const curve=new THREE.CatmullRomCurve3(points);
  return mesh(parent,new THREE.TubeGeometry(curve,Math.max(8,points.length*2),r,6,false),mat,0,0,0);
}
// Local Y follows the bone. Keep its front and lateral cross-sections stable at any bend.
function fitBone(part,a,b) {
  const y=b.clone().sub(a),length=y.length();y.normalize();
  const x=v(1,0,0).addScaledVector(y,-y.x);
  if(x.lengthSq()<.012)x.copy(v(0,1,0).cross(y));
  x.normalize();
  part.position.copy(a);part.scale.y=length;
  part.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,x.clone().cross(y)));
}
function bentJoint(base,end,pole,first,second) {
  const axis=end.clone().sub(base),length=Math.max(axis.length(),.0001);axis.divideScalar(length);
  const reach=THREE.MathUtils.clamp(length,Math.abs(first-second)+.0001,first+second-.0001);
  const along=(reach*reach+first*first-second*second)/(2*reach);
  const bend=pole.clone().addScaledVector(axis,-pole.dot(axis)).normalize();
  return base.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,first*first-along*along)));
}
function uniformMap(p) {
  return texture(768,256,(c,w,h)=>{
    c.fillStyle=p.jersey;c.fillRect(0,0,w,h);
    const grad=c.createLinearGradient(0,0,0,h);
    grad.addColorStop(0,D.alpha(p.white,.07));grad.addColorStop(.47,D.alpha(p.white,0));grad.addColorStop(1,D.alpha(p.deep,.20));
    c.fillStyle=grad;c.fillRect(0,0,w,h);
    // Tiny offset perforations and two contrasting side gussets.
    for(let x=0;x<w;x+=6)for(let y=(x%12?3:0);y<h;y+=6){
      c.fillStyle=D.alpha(p.deep,.14);c.fillRect(x,y,1.2,1.8);
    }
    for(const side of [.25,.75]){
      const x=w*side;
      c.fillStyle=D.alpha(p.deep,.30);c.beginPath();c.moveTo(x-15,0);c.lineTo(x+16,0);
      c.lineTo(x+24,h);c.lineTo(x-6,h);c.closePath();c.fill();
      c.strokeStyle=p.white;c.lineWidth=3;c.beginPath();c.moveTo(x+17,0);c.lineTo(x+25,h);c.stroke();
    }
    c.textAlign='center';c.textBaseline='middle';c.fillStyle=p.white;c.strokeStyle=D.alpha(p.deep,.6);
    c.lineWidth=2;c.font='bold 74px system-ui';
    // The front and back are centred half a turn apart on this atlas.
    for(const x of [0,w/2,w]){c.save();c.translate(x,h*.40);c.scale(-1,1);c.strokeText('7',0,0);c.fillText('7',0,0);c.restore();}
  });
}
function upperBody(parent,p,skin,hair,trim) {
  const torso=new THREE.Group();parent.add(torso);
  const ribs=[
    [-.065,.072,.118,-.013],[.03,.113,.151,-.015],[.13,.116,.144,-.009],
    [.24,.119,.146,0],[.32,.143,.162,.010],[.40,.155,.182,.018],
    [.47,.141,.197,.014],[.51,.113,.210,.006],[.54,.091,.193,.001],
    [.565,.083,.149,-.002],[.589,.067,.087,-.001],[.60,.053,.061,0]
  ];
  form(torso,skin,ribs,'ribcage');
  // The top perimeter descends under each axilla and through the V neck.
  const topAt=a=>{
    const lateral=Math.abs(Math.sin(a)),front=Math.cos(a)>0;
    const neck=(front?.112:.058)*Math.pow(Math.max(0,1-lateral/.56),1.12);
    const opening=.184*THREE.MathUtils.smoothstep(lateral,.72,1);
    return .553-neck-opening;
  };
  const shirt=material(p.white,{map:uniformMap(p),roughness:.98,side:THREE.DoubleSide});
  surface(torso,shirt,25,72,(q,t)=>{
    const a=q*2*Math.PI,top=topAt(a),y=THREE.MathUtils.lerp(-.018,top,t);
    return sectionPoint(ribs,a,y,.009+.005*(1-t));
  },'sleeveless-jersey');
  const edge=Array.from({length:81},(_,i)=>{
    const a=i*Math.PI/40;return sectionPoint(ribs,a,topAt(a),.012);
  });
  trimLine(torso,trim,edge,.005);
  const neck=form(torso,skin,[[.524,.057,.066],[.565,.068,.066],[.619,.057,.057,.003],[.668,.063,.062,.004]],'neck');
  neck.rotation.z=-.06;
  const head=new THREE.Group();head.position.set(.022,.609,0);head.scale.setScalar(.951);torso.add(head);
  const face=[
    [0,.034,.039,.044],[.014,.065,.055,.026],[.039,.086,.074,.012],
    [.064,.097,.084,.008],[.096,.103,.090,.004],[.133,.104,.089,.002],
    [.171,.102,.089,0],[.199,.092,.083,-.004],[.221,.068,.067,-.007],[.234,.002,.002,-.008]
  ];
  form(head,skin,face,'jaw-cheeks-and-skull',32);
  // A close-cropped haircut follows the temples, forehead and nape.
  surface(head,hair,13,48,(q,t)=>{
    const a=q*Math.PI*2,front=Math.cos(a),side=Math.abs(Math.sin(a));
    const hairline=.120+.042*front-.021*Math.pow(side,9)+.003*Math.sin(13*a);
    const y=THREE.MathUtils.lerp(hairline,.234,t);
    const point=sectionPoint(face,a,y,.0035*(1-t));point.y+=.006*t;return point;
  },'cropped-hair');
  const warm=material(mix(p.skin,p.deep,.29),{roughness:.93});
  const eyeWhite=material(mix(p.skin,p.white,.70)),iris=material(shade(p.deep,-.05));
  for(const s of [-1,1]){
    ell(head,skin,-.007,.100,s*.089,.021,.030,.012);
    ell(head,material(mix(p.skin,p.deep,.17)),-.008,.101,s*.099,.010,.015,.002);
    ell(head,skin,.000,.095,s*.100,.005,.008,.003);
    const eye=ell(head,eyeWhite,.092,.113,s*.043,.008,.0065,.016);eye.rotation.y=-s*.38;
    ell(head,iris,.099,.114,s*.043,.004,.0055,.0055);
    trimLine(head,hair,[v(.093,.131,s*.030),v(.088,.136,s*.047),v(.080,.132,s*.061)],.0038);
  }
  const nose=form(head,skin,[[.074,.002,.003,.101],[.077,.007,.010,.103],[.081,.011,.015,.106],
    [.085,.014,.016,.109],[.090,.015,.014,.110],[.096,.012,.011,.109],
    [.106,.009,.009,.106],[.118,.005,.007,.102],[.129,.002,.004,.098]],'nose',22);
  nose.castShadow=false;
  trimLine(head,warm,[v(.100,.055,-.021),v(.104,.054,0),v(.100,.055,.021)],.0022);
  return torso;
}
// Build hands in metres around the real ball. The angular coordinates run from
// heel to fingertips and across the palm. Each finger has two knuckles and a
// tapered pad tangent to the ball; only the heel of the palm stands clear.
function gripHand(parent,skin,nail,r,shooting) {
  const hand=new THREE.Group(),prefix=shooting?'shooting-':'guide-';hand.name=prefix+'hand';parent.add(hand);
  const normal=shooting?v(-.40,-.70,.59).normalize():v(-.21,.03,-.98).normalize();
  const tangent=(shooting?v(1,.10,0):v(.54,.84,0));
  tangent.addScaledVector(normal,-tangent.dot(normal)).normalize();
  const across=normal.clone().cross(tangent),sign=shooting?1:-1;
  const sphere=(along,width,offset)=>{
    // A hand holding a softball spans more of its circumference.
    const a=along/r,b=Math.atan(width/r)*sign;
    return normal.clone().multiplyScalar(Math.cos(a)*Math.cos(b)).addScaledVector(tangent,Math.sin(a)*Math.cos(b))
      .addScaledVector(across,Math.sin(b)).multiplyScalar(r+offset);
  };
  const palmRows=[
    [-.082,.021,.016,.023],[-.072,.027,.020,.021],[-.053,.033,.022,.020],
    [-.032,.040,.019,.018],[-.012,.043,.015,.015],[.002,.042,.012,.012],[.010,.034,.006,.011]
  ];
  surface(hand,skin,palmRows.length-1,24,(q,t)=>{
    const [d,w,thick,lift]=palmRows[Math.round(t*(palmRows.length-1))],a=q*Math.PI*2;
    return sphere(d,sign*w*Math.sin(a),lift+thick*Math.cos(a));
  },prefix+'cupped-palm');
  const wrist=sphere(-.078,0,.023);
  const fingerNames=['index','middle','ring','little'];
  for(let id=0;id<5;id++){
    const thumb=id===4, fingerName=thumb?'thumb':fingerNames[id];
    const halfWidth=thumb?.0103:[.0093,.0095,.0088,.0076][id];
    const gap=thumb?0:(id-1.5)*.020;
    const length=thumb?.060:[.072,.079,.073,.059][id];
    const distance=(t)=>thumb?-.052+length*t:length*t;
    const spread=(t)=>thumb?-.029-.050*Math.sin(Math.PI*.48*t):gap*(1+.52*t);
    const radiusAt=t=>{
      const stops=[[0,.80],[.10,1],[.28,.80],[.42,.94],[.57,.73],[.70,.82],[.85,.70],[.93,.66],[1,.16]];
      let i=1;while(i<stops.length-1&&t>stops[i][0])i++;
      const a=stops[i-1],b=stops[i];return halfWidth*THREE.MathUtils.lerp(a[1],b[1],(t-a[0])/(b[0]-a[0]));
    };
    const center=t=>sphere(distance(t),spread(t),.85*radiusAt(t)+.003*(1-t)*(1-t));
    function axes(t) {
      const n=center(t).normalize(),y=center(Math.min(1,t+.005)).sub(center(Math.max(0,t-.005))).normalize();
      const z=n.clone().cross(y).normalize();
      return {n:y.clone().cross(z).normalize(),y,z};
    }
    surface(hand,skin,17,10,(q,t)=>{
      const c=center(t),a=q*Math.PI*2,rad=radiusAt(t),frame=axes(t);
      return c.addScaledVector(frame.n,Math.cos(a)*rad*.85).addScaledVector(frame.z,Math.sin(a)*rad);
    },prefix+fingerName);
    const t=.866,frame=axes(t),tip=center(t).addScaledVector(frame.n,radiusAt(t)*.79);
    const plate=ell(hand,nail,...tip.toArray(),halfWidth*.12,halfWidth*.68,halfWidth*.43);
    plate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.n,frame.y,frame.z));plate.castShadow=false;
  }
  return {wrist,place(centre,shift,turn){
    // A ground-level release comes off the top of the ball as the player stoops.
    const low=1-THREE.MathUtils.smoothstep(centre.y,r,r+.22);
    const grip=new THREE.Quaternion().identity().slerp(new THREE.Quaternion().setFromUnitVectors(
      normal,v(0,.98,shooting?.20:-.20).normalize()),low);
    const anchor=wrist.clone().applyQuaternion(grip).add(centre).add(shift);
    hand.quaternion.setFromAxisAngle(v(0,0,1),turn).multiply(grip);
    hand.position.copy(anchor).sub(wrist.clone().applyQuaternion(hand.quaternion));
    return anchor;
  }};
}
function athlete(g,h,p,radius) {
  const skin=material(p.skin,{roughness:.91}),hair=material(mix(p.deep,p.skin,.095),{roughness:1}),
    nails=material(mix(p.skin,p.white,.29),{roughness:.78}),trim=material(p.white,{roughness:.95}),
    cloth=material(shade(p.jersey,-.46),{roughness:.98}),binding=material(mix(p.jersey,p.deep,.19),{roughness:.93}),
    sole=material(mix(p.white,p.timber,.24),{roughness:.90}),shoe=material(shade(p.wall,.65),{roughness:.88});
  const torso=upperBody(g,p,skin,hair,trim);
  const belt=form(torso,cloth,[[-.10,.121,.166,-.017],[-.05,.132,.169,-.012],[.048,.122,.153,-.008]],'shorts-seat');
  belt.castShadow=true;
  form(torso,binding,[[.036,.125,.157,-.008],[.059,.122,.155,-.008]],'waistband');
  function leg(side) {
    const thigh=form(g,skin,[[0,.084,.081],[.20,.105,.093,.010],[.43,.099,.086,.013],
      [.70,.080,.070,.009],[.91,.064,.060],[1,.062,.057]],'thigh');
    const legOpening=form(g,cloth,[[0,.098,.092],[.17,.118,.102,.003],[.36,.115,.102,.003],
      [.62,.099,.087,.005],[.64,.100,.089,.005]],'shorts-leg');
    const stripe=trimLine(legOpening,trim,[v(0,.12,-side*.100),v(.01,.35,-side*.104),v(.017,.62,-side*.088)],.005);
    // trimLine belongs to the leg's unit-length mesh and follows its pose.
    stripe.castShadow=false;
    const calf=form(g,skin,[[0,.061,.057],[.12,.062,.058],[.29,.069,.062,-.012],
      [.44,.066,.057,-.014],[.66,.046,.044,-.009],[.86,.034,.034],[1,.035,.032]],'calf');
    const kneecap=ell(g,skin,0,0,0,.063,.064,.057);
    const sock=form(g,trim,[[.68,.048,.045,-.008],[.72,.048,.045,-.009],[.88,.038,.037],[1,.039,.038]],'sock');
    const welt=form(g,binding,[[.72,.049,.046,-.009],[.746,.047,.045,-.008]],'sock-stripe');
    const foot=new THREE.Group();g.add(foot);
    ell(foot,sole,.046,-.082,0,.143,.021,.063);
    ell(foot,shoe,.048,-.057,0,.137,.039,.061);
    ell(foot,shoe,-.015,-.025,0,.070,.053,.057);
    ell(foot,binding,.050,-.038,side*.047,.069,.014,.013).rotation.z=-.16;
    for(let i=0;i<3;i++){
      const x=.031+i*.022,y=-.007-i*.009;
      trimLine(foot,trim,[v(x-.003,y-.006,-.033),v(x,y,0),v(x+.005,y-.008,.034)],.003);
    }
    return (hip,ankle,heel)=>{
      const knee=bentJoint(hip,ankle,v(1,0,side*.15),.444,.434);
      fitBone(thigh,hip,knee);fitBone(legOpening,hip,knee);fitBone(calf,knee,ankle);
      fitBone(sock,knee,ankle);fitBone(welt,knee,ankle);kneecap.position.copy(knee);
      foot.position.copy(ankle);foot.rotation.set(0,-side*.10,-heel);
    };
  }
  function arm(side,shooting) {
    const prefix=shooting?'shooting-':'guide-';
    const shoulderAnchor=new THREE.Object3D();shoulderAnchor.position.set(.001,.501,side*.185);
    shoulderAnchor.name=prefix+'deltoid';torso.add(shoulderAnchor);
    const rows=[[-.17,.033,.041],[-.12,.054,.052],[-.06,.069,.062],[.02,.077,.071],
      [.15,.075,.071],[.26,.069,.064],[.35,.066,.059,.002],[.51,.065,.054,.013],
      [.65,.062,.052,.014],[.82,.049,.043,.008],[.94,.041,.040],[1,.041,.040]];
    const upper=form(g,skin,rows,prefix+'upper-arm');
    const shoulderArc=new THREE.CubicBezierCurve3(v(),v(),v(),v());
    const cos=[],sin=[];
    for(let i=0;i<=24;i++){cos.push(Math.cos(i*Math.PI/12));sin.push(Math.sin(i*Math.PI/12));}
    const centreAt=v(),along=v(),front=v(),lateral=v(),offset=v(),local=new THREE.Quaternion();
    function joinShoulder(){
      // Sweep the proximal rings from under the collarbone into the humerus.
      // The deltoid and biceps share vertices and shading, even with the arm overhead.
      local.copy(upper.quaternion).invert().multiply(torso.quaternion);
      shoulderArc.v0.set(-.008,.018,-side*.089).applyQuaternion(local);
      shoulderArc.v1.set(-.002,.030,side*.035).applyQuaternion(local);
      shoulderArc.v2.set(0,upper.scale.y*.105,0);shoulderArc.v3.set(0,upper.scale.y*.26,0);
      const pos=upper.geometry.getAttribute('position');
      for(let i=0;i<=5;i++){
        shoulderArc.getPoint(i/5,centreAt);shoulderArc.getTangent(i/5,along);
        front.set(1,0,0).addScaledVector(along,-along.x).normalize();lateral.crossVectors(front,along);
        for(let j=0;j<=24;j++){
          offset.copy(centreAt).addScaledVector(front,rows[i][1]*cos[j]).addScaledVector(lateral,rows[i][2]*sin[j]);
          pos.setXYZ(i*25+j,offset.x,offset.y/upper.scale.y,offset.z);
        }
      }
      pos.needsUpdate=true;smoothNormals(upper.geometry,rows.length-1,24);
    }
    upper.geometry.boundingSphere=new THREE.Sphere(v(0,.4,0),1);
    const lower=form(g,skin,[[0,.043,.041],[.13,.051,.047,.002],[.29,.053,.046,.005],
      [.47,.045,.040,.005],[.67,.033,.031,.004],[.84,.027,.027],[1,.027,.024]],prefix+'forearm');
    const elbowCap=ell(g,skin,0,0,0,.043,.042,.041),wristCap=ell(g,skin,0,0,0,.028,.028,.026);
    elbowCap.name=prefix+'elbow';wristCap.name=prefix+'wrist';
    const sleeve=shooting?null:form(g,binding,[[.51,.045,.039,.005],[.57,.042,.037,.005]],'guide-forearm-band');
    const palm=gripHand(g,skin,nails,radius,shooting);
    return (u,follow,centre,angle)=>{
      const shoulder=shoulderAnchor.position.clone().applyQuaternion(torso.quaternion).add(torso.position);
      const release=shooting?0:THREE.MathUtils.smoothstep(u,.79,1);
      const shift=shooting?v(.018*follow,-.012*follow,0):v(-.070*release-.060*follow,-.017*release-.12*follow,-.072*release-.036*follow);
      shift.y+=(1-THREE.MathUtils.smoothstep(centre.y,.16,.60))*(shooting?.04*follow:.24*follow+.07*release);
      const turn=shooting?-(.78+.003*angle)*follow:.22*release+.45*follow;
      const wrist=palm.place(centre,shift,turn);
      const pole=v(-.25+.93*u,-1+.39*u,side*(shooting?.13:.39));
      const elbow=bentJoint(shoulder,wrist,pole,.326,.277);
      fitBone(upper,shoulder,elbow);joinShoulder();fitBone(lower,elbow,wrist);
      if(sleeve)fitBone(sleeve,elbow,wrist);
      elbowCap.position.copy(elbow);wristCap.position.copy(wrist);
    };
  }
  const frontLeg=leg(1),rearLeg=leg(-1),shoot=arm(1,true),guide=arm(-1,false);
  const totalJump=Math.max(0,h-(2.025+(radius-.1225)*1.65));
  return (fraction,follow,angle,flightTime=0)=>{
    const u=THREE.MathUtils.smoothstep(fraction,0,1),upright=THREE.MathUtils.smoothstep(h,0,1.63);
    const jump=Math.max(0,totalJump*u-.5*C.g*flightTime*flightTime);
    const landing=flightTime-Math.sqrt(2*totalJump/C.g);
    const absorb=totalJump>.02&&landing>0&&landing<.36?.07*Math.sin(Math.PI*landing/.36):0;
    const hipHeight=.31+.615*upright-.103*(1-u)*upright-absorb;
    const lean=.08+.12*(1-u)+1.13*(1-upright);
    const hipX=-.345-.30*(1-upright)-.07*(1-u);
    torso.rotation.z=-lean;torso.position.set(hipX,hipHeight+jump,0);
    const heel=.11*u+.30*THREE.MathUtils.smoothstep(h,2.08,2.70)*u;
    for(const [side,poseLeg] of [[1,frontLeg],[-1,rearLeg]]){
      const hip=v(-.014,.005,side*.094).applyQuaternion(torso.quaternion).add(torso.position);
      const ankle=v((side===1?-.265:-.578)-.10*(1-upright),.104+jump+.12*heel,side*.137);
      poseLeg(hip,ankle,heel);
    }
    // The hands and ball share a single gather point. At release the ball centre
    // is exactly (0,h,0), the origin of the independently solved trajectory.
    const gather=v(.275,.52,.044).applyQuaternion(torso.quaternion).add(torso.position);
    const centre=gather.lerp(v(0,h-totalJump+jump-absorb,0),u);
    shoot(u,follow,centre,angle);guide(u,follow,centre,angle);return centre;
  };
}
// Fit each ball, the player and the basket in the perspective frustum. For a
// point of depth z, its horizontal image limit is (eyeZ-z)*kx; the vertical
// calculation is identical. This also fits steep shots on a wide, short canvas.
function frameCourt(camera,controls,points,behind,bearing) {
  const out=(behind?v(-1,.31,.42):v(-.22,.16,1)).applyAxisAngle(v(0,1,0),bearing).normalize();
  const right=v(0,1,0).cross(out).normalize(),up=out.clone().cross(right);
  const ky=.87*Math.tan(camera.fov*Math.PI/360),kx=ky*camera.aspect;
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity,z0=Infinity,z1=-Infinity;
  for(const [point,r] of points){
    const x=point.dot(right),y=point.dot(up),z=point.dot(out);
    x0=Math.min(x0,x-r-(z+r)*kx);x1=Math.max(x1,x+r+(z+r)*kx);
    y0=Math.min(y0,y-r-(z+r)*ky);y1=Math.max(y1,y+r+(z+r)*ky);
    z0=Math.min(z0,z-r);z1=Math.max(z1,z+r);
  }
  const eyeZ=Math.max((x1-x0)/(2*kx),(y1-y0)/(2*ky),z1+.9),centreZ=(z1+z0)/2;
  controls.target.copy(right).multiplyScalar((x1+x0)/2).addScaledVector(up,(y1+y0)/2).addScaledVector(out,centreZ);
  camera.zoom=1;camera.updateProjectionMatrix();
  camera.position.copy(controls.target).addScaledVector(out,eyeZ-centreZ);
}
export function createGym(host,T,onLoss,navHost=host) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled=true;
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',T('體育館立體視圖','Gym in 3D'));
  host.append(canvas);
  const crossingMarker=new THREE.Group();crossingMarker.name='crossing-marker';
  const scene=new THREE.Scene(),fixed=new THREE.Group(),actor=new THREE.Group(),paths=new THREE.Group(),equipment=new THREE.Group();
  scene.add(fixed,actor,paths,equipment,crossingMarker);
  const sideCam=new THREE.PerspectiveCamera(36,1,.045,220);
  const ballCam=new THREE.OrthographicCamera(-1,1,1,-1,.015,220);
  let cam=sideCam;
  const controls=new OrbitControls(cam,canvas);
  controls.enableDamping=!D.reducedMotion();controls.minDistance=.55;controls.maxDistance=100;controls.maxPolarAngle=Math.PI*.496;
  const nav=window.LabView3DNav.attach({THREE,controls,host:navHost,canvas,radius:45,T});
  const hemi=new THREE.HemisphereLight(0xffffff,0x808080,1.65),sun=new THREE.DirectionalLight(0xffffff,2.0);sun.position.set(-5,10,5);
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.bias=-.00035;sun.shadow.normalBias=.016;
  Object.assign(sun.shadow.camera,{left:-15,right:15,top:12,bottom:-12,far:50});scene.add(hemi,sun,sun.target);
  let pose=null,data,ball=null,staticKey='',actorKey='',ballKey='',framing='',name='side',raf=0,gone=false,origin=0;
  let framePoints=[],walls=null,net=null,lastContact=null,netTime=-10;
  const flash=mesh(scene,new THREE.SphereGeometry(.06,12,8),new THREE.MeshBasicMaterial({color:0xffba45,transparent:true}),0,0,0);
  flash.castShadow=false;flash.visible=false;
  const spinAxis=v(),spinTurn=new THREE.Quaternion();
  function spinBall(t){
    ball.quaternion.identity();
    const spins=data.result.spins||[];
    for(let i=0;i<spins.length&&spins[i][0]<t;i++){
      const [start,x,y,z]=spins[i],duration=Math.min(t,spins[i+1]?.[0]??t)-start;
      spinAxis.set(x,y,z);const rate=spinAxis.length();
      if(rate)ball.quaternion.premultiply(spinTurn.setFromAxisAngle(spinAxis.multiplyScalar(1/rate),rate*duration));
    }
  }
  const incoming=new THREE.Vector3(), endOfApproach=new THREE.Plane();
  function styleTrails(){
    for(const trail of paths.children){
      trail.material.clippingPlanes=name==='ball'?[endOfApproach]:[];
      trail.material.opacity=trail.userData.opacity*(name==='ball'?.32:1);
      trail.material.transparent=trail.material.opacity<1;
      trail.material.needsUpdate=true;
    }
  }
  function updateBallProjection(){
    const distance=cam.position.distanceTo(controls.target),half=distance*.33;
    cam.left=-half*sideCam.aspect;cam.right=half*sideCam.aspect;cam.top=half;cam.bottom=-half;
    // The near plane sits just upstream of the rim, including after a bank.
    cam.near=Math.max(.015,distance-(data.p.mode==='shot'?.30:1.1));
    cam.updateProjectionMatrix();
  }
  function request(){
    if(raf||gone||document.hidden)return;
    raf=requestAnimationFrame(()=>{
      raf=0;if(gone||document.hidden)return;
      controls.update();if(cam===ballCam)updateBallProjection();
      // Cut away the foreground wall and its fittings when an orbit crosses outside the gym.
      if(walls){
        walls.sideWall.visible=cam.position.z>-7.0;
        walls.endWall.visible=cam.position.x<walls.endX-.4;
      }
      renderer.render(scene,cam);
    });
  }
  function markCrossing(s,p){
    crossingMarker.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});crossingMarker.clear();
    const cross=s.result.crossing;
    if(!cross||s.p.mode!=='shot')return;
    crossingMarker.position.set(cross.worldX??origin+cross.x,C.rimHeight,cross.worldZ??0);
    crossingMarker.quaternion.setFromUnitVectors(v(0,0,1),v(cross.worldVx??cross.vx,cross.vy,cross.worldVz??0).normalize());
    const points=Array.from({length:97},(_,i)=>v(C.ballRadius*Math.cos(i*Math.PI/48),C.ballRadius*Math.sin(i*Math.PI/48),0));
    const paint=s.result.rimHit?new THREE.LineDashedMaterial({color:p.path,dashSize:.019,gapSize:.012}):new THREE.LineBasicMaterial({color:p.path});
    const outline=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),paint);
    outline.computeLineDistances();crossingMarker.add(outline);
    ell(crossingMarker,material(p.path),0,0,0,.009,.009,.009);
  }
  function preset(kind) {
    if(!data)return;
    if(controls.enableDamping){
      controls.enableDamping=false;controls.update();controls.enableDamping=true;
    }
    const shot=data.p.mode==='shot';
    name=kind==='ball'&&(!shot||data.result.crossing)?'ball':kind==='back'?'back':'side';
    crossingMarker.visible=name==='ball'&&shot;
    // The parallel projection is a measurement view of the ring or landing point.
    actor.visible=name!=='ball';
    cam=name==='ball'?ballCam:sideCam;controls.object=cam;
    controls.maxPolarAngle=name==='ball'?Math.PI/2:Math.PI*.496;
    if(name==='ball'){
      const r=data.result;
      incoming.set(shot?(r.crossing.worldVx??r.crossing.vx):r.vxLand,shot?r.crossing.vy:r.vyLand,r.crossing?.worldVz??0).normalize();
      controls.target.set(shot?0:origin+r.R,shot?C.rimHeight:0,0);
      cam.position.copy(controls.target).addScaledVector(incoming,shot?-1.65:-4.2);
      cam.zoom=1;updateBallProjection();
      endOfApproach.setFromNormalAndCoplanarPoint(incoming,controls.target.clone().addScaledVector(incoming,-.025));
    }else frameCourt(cam,controls,framePoints,name==='back',actor.rotation.y);
    styleTrails();controls.update();nav.home();request();
  }
  function resize(){
    const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
    sideCam.aspect=w/h;sideCam.updateProjectionMatrix();renderer.setSize(w,h,false);preset(name);
  }
  function refresh(s,traces,p) {
    const flightChanged=data?.result!==s.result;
    data=s;origin=s.p.mode==='shot'?-s.p.distance:0;
    const shot=s.p.mode==='shot';
    let xmin=Math.min(origin-1.15,-.8),xmax=shot?2:2.8,top=shot?4.1:2.3;
    const radius=C.balls[s.p.mode].diameter/2;
    framePoints=[[v(origin-.94,0,0),.12],[v(origin-.34,Math.max(1.80,s.p.height-.15),0),.16],
      [v(origin,s.p.height,0),radius],[v(origin-.22,.10,.16),.15]];
    const spot=s.result.station;
    actor.position.set(spot?.x??0,0,spot?.z??0);actor.rotation.y=(spot?.bearing??0)*Math.PI/180;
    if(shot)for(const [point] of framePoints)point.applyAxisAngle(v(0,1,0),actor.rotation.y);
    if(shot)for(const side of [-1,1]){
      framePoints.push([v(C.court.boardOffset,C.court.boardBottom+C.court.boardHeight,side*C.court.boardWidth/2),.06],
        [v(0,C.rimHeight,side*C.rimRadius),.06],[v(C.court.boardOffset+1.6,.15,side*.42),.15]);
    }
    for(const {result:r} of traces){
      for(const [x,y,z] of r.path||r.points){
        xmin=Math.min(xmin,x-radius);xmax=Math.max(xmax,x+radius);top=Math.max(top,y+radius);
        framePoints.push([v(x,y,shot?z:0),radius]);
      }
    }
    const x0=Math.min(-15,Math.floor(xmin/5)*5-2),x1=Math.max(4.6,Math.ceil(xmax/5)*5+.5);
    const sk=[p.dark,shot,x0,x1].join('/');
    if(sk!==staticKey){
      staticKey=sk;clear(fixed);walls=gym(fixed,x0,x1,shot,p);net=shot?basket(fixed,p):null;
      scene.background=new THREE.Color(p.wall);scene.fog=new THREE.FogExp2(p.wall,.025);
      hemi.color.set(shade(p.wall,.8));hemi.groundColor.set(shade(p.timber,-.12));hemi.intensity=p.dark?1.48:1.64;
      sun.color.set(shade(p.timber,.74));sun.intensity=p.dark?2.05:2.18;
    }
    const ak=[s.p.mode,s.p.height,p.dark].join('/');
    if(ak!==actorKey){actorKey=ak;clear(actor);pose=athlete(actor,s.p.height,p,C.balls[s.p.mode].diameter/2);}

    clear(paths);
    for(const tr of traces){
      const pts=shot?C.displayPath(tr.result,120):tr.result.points,keep=[],step=shot?1:Math.max(1,Math.floor(pts.length/88));
      for(let i=0;i<pts.length;i++)if(i%step===0||i===pts.length-1||Math.abs(pts[i][shot?3:2]-(tr.result.board?.t??-9))<1e-9)
        keep.push(v(pts[i][0],pts[i][1],shot?pts[i][2]:0));
      if(tr.dash){
        const dashed=new THREE.LineDashedMaterial({color:tr.ink,dashSize:tr.dash[0]<4?.025:.11,gapSize:.075,transparent:true,opacity:tr.opacity});
        const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(keep),dashed);line.computeLineDistances();line.userData.opacity=tr.opacity;paths.add(line);continue;
      }
      const mat=material(tr.ink,{emissive:shade(tr.ink,-.67),transparent:!!tr.dash,opacity:tr.opacity});
      // A polyline curve keeps the board kink; smoothing it would round off the impact.
      const curve=new THREE.CurvePath();for(let i=1;i<keep.length;i++)curve.add(new THREE.LineCurve3(keep[i-1],keep[i]));
      if(curve.getLength()>.001){
        const tube=mesh(paths,new THREE.TubeGeometry(curve,Math.max(64,keep.length*2),tr.dash?.010:.015,6,false),mat,0,0,0);
        tube.castShadow=false;tube.userData.opacity=tr.opacity;
      }else mat.dispose();
    }
    const bk=[s.p.mode,p.dark].join('/');
    if(bk!==ballKey){
      ballKey=bk;clear(equipment);
      ball=mesh(equipment,new THREE.SphereGeometry(C.balls[s.p.mode].diameter/2,30,20),
        material(p.white,{map:ballMap(!shot,p),roughness:shot?.86:.68}),origin,s.p.height,0);
      ball.rotation.z=.36;ball.name='released-ball';
    }
    markCrossing(s,p);crossingMarker.visible=name==='ball'&&shot;styleTrails();
    const fk=[s.p.mode,origin,Math.round(top*2),Math.round(xmin),Math.round(xmax)].join('/');
    if(framing!==fk||flightChanged){framing=fk;preset(name);}request();
  }
  const observer=new ResizeObserver(resize);observer.observe(host);
  function lost(e){e.preventDefault();if(!gone)onLoss();}
  canvas.addEventListener('webglcontextlost',lost);controls.addEventListener('change',request);
  document.addEventListener('visibilitychange',request);resize();
  return {refresh,preset,contact(e){lastContact=e;if(e.type==='net')netTime=e.t;},
    frameRelease(){if(name!=='ball')preset(name);},
    prepare(fraction){if(ball&&pose){const held=pose(fraction,0,data.p.angle);ball.position.copy(actor.localToWorld(held));ball.quaternion.identity();flash.visible=false;lastContact=null;netTime=-10;if(net)net.rotation.set(0,0,0);request();}},
    move(pos,t=0){if(ball&&pose){pose(1,THREE.MathUtils.smoothstep(t,0,.16),data.p.angle,t);ball.position.set(pos[4]??pos[0],pos[1],pos[5]??0);spinBall(t);
      if(net){const elapsed=t-netTime;net.rotation.z=elapsed>=0?.15*Math.sin(elapsed*21)*Math.exp(-elapsed*5):0;}
      flash.visible=!!lastContact&&t>=lastContact.t&&t-lastContact.t<.18;
      if(flash.visible){flash.position.set(lastContact.x,lastContact.y,lastContact.z);flash.material.opacity=1-(t-lastContact.t)/.18;}
      request();}},
    dispose(){gone=true;cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('webglcontextlost',lost);
      document.removeEventListener('visibilitychange',request);controls.removeEventListener('change',request);
      nav.dispose();controls.dispose();clear(fixed);clear(actor);clear(paths);clear(equipment);flash.geometry.dispose();flash.material.dispose();sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();clear(crossingMarker);canvas.remove();}
  };
}
