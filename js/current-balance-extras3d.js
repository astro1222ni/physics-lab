/* 教學用右手、米粒與壓縮光路；只讀取同一份天平角度與接線，不改變物理。 */
(function () {
  'use strict';
  function create(THREE, scene, T, tokens) {
    const root=new THREE.Group();scene.add(root);
    const skin=new THREE.MeshStandardMaterial({color:0xe4b48e,roughness:.72,metalness:0});
    const nail=new THREE.MeshStandardMaterial({color:0xf1d2b9,roughness:.45});
    const crease=new THREE.LineBasicMaterial({color:0xa66e50,transparent:true,opacity:.5});
    const hand=new THREE.Group();root.add(hand);hand.scale.setScalar(1.1);
    const add=(geo,mat,parent=hand)=>{const mesh=new THREE.Mesh(geo,mat);parent.add(mesh);mesh.castShadow=true;return mesh;};
    // 掌面與拇指根部採平滑體積，避免擠出板材般的稜邊；掌紋投影到表面。
    const palm=add(new THREE.SphereGeometry(1,32,24),skin);palm.scale.set(1.6,1.95,.48);
    const thenar=add(new THREE.SphereGeometry(1,24,16),skin);thenar.position.set(.75,-.7,.05);thenar.scale.set(.8,1,.5);
    const wrist=add(new THREE.CapsuleGeometry(.76,1.7,5,16),skin);wrist.position.set(-.15,-2.7,0);wrist.scale.set(1,.95,.55);
    function finger(x,y,length,width,angle,parent=hand){
      const group=new THREE.Group();parent.add(group);group.position.set(x,y,0);group.rotation.z=angle;
      const lengths=[length*.43,length*.32,length*.25];let at=0;
      lengths.forEach((len,k)=>{const shape=add(new THREE.CapsuleGeometry(width*(1-k*.12),Math.max(.05,len-2*width*(1-k*.12)),5,14),skin,group);shape.position.set(0,at+len/2,-k*.035);shape.scale.z=.72;at+=len-.08;
        if(k<2){const curve=new THREE.EllipseCurve(0,at,width*.72,.07,0,Math.PI,false,0);const points=curve.getPoints(12).map(p=>new THREE.Vector3(p.x,p.y,.24-k*.035));group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),crease));}});
      const n=add(new THREE.SphereGeometry(width*.72,12,8),nail,group);n.position.set(0,at-width*.65,-.22);n.scale.set(.85,1.45,.14);
    }
    finger(-1.05,1.45,2.5,.31,.07);finger(-.35,1.65,2.85,.34,.015);finger(.38,1.6,2.65,.32,-.045);finger(1.02,1.25,2.08,.27,-.12);
    finger(1.1,-.35,2.0,.39,-Math.PI/2);
    const curves=[[[.8,.3],[-.4,.1],[-1,-.5]],[[.4,-1],[-.1,-.2],[-.8,.7]],[[1,.9],[.1,.65],[-.8,.85]]];
    curves.forEach(points=>{const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],p[1],.48*Math.sqrt(Math.max(.1,1-(p[0]/1.6)**2-(p[1]/1.95)**2))+.01)));hand.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),crease));});
    const arrows=new THREE.Group();root.add(arrows);const labels=[];
    function label(base,index,color){const cv=document.createElement('canvas');cv.width=192;cv.height=96;const g=cv.getContext('2d');g.fillStyle='rgba(20,25,30,.85)';g.roundRect(4,4,184,88,14);g.fill();g.fillStyle='#fff';g.font='700 45px system-ui';g.fillText(base,32,58);if(index){g.font='700 28px system-ui';g.fillText(index,65,71);}const tex=new THREE.CanvasTexture(cv);const material=new THREE.SpriteMaterial({map:tex,depthTest:false});const sprite=new THREE.Sprite(material);sprite.scale.set(2.1,1.05,1);sprite.renderOrder=15;arrows.add(sprite);labels.push(sprite);return sprite;}
    const colors=[tokens.equi,tokens.neg,tokens.pos],names=[['I','1'],['B',''],['F','']];
    const helpers=colors.map((color,i)=>{const arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),6,color,.65,.35);arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.line.renderOrder=14;arrow.cone.renderOrder=14;arrows.add(arrow);return {arrow,text:label(...names[i],color)};});
    const rice=new THREE.Group();root.add(rice);const grainMat=new THREE.MeshStandardMaterial({color:tokens.card||0xf1e5c8,roughness:.9});
    for(let i=0;i<6;i++){const g=add(new THREE.SphereGeometry(.18,12,8),grainMat,rice);g.scale.set(.6,1.9,.65);g.rotation.z=-.25+(i%3)*.2;g.position.set((i%3-1)*.24,-.95-Math.floor(i/3)*.4,.2);}
    const optical=new THREE.Group();root.add(optical);
    const mirror=add(new THREE.BoxGeometry(.12,1.1,1.1),new THREE.MeshStandardMaterial({color:0xdde9f0,metalness:1,roughness:.08}),optical);
    const laserMat=new THREE.LineBasicMaterial({color:tokens.pos,transparent:true,opacity:.85});const ray=new THREE.Line(new THREE.BufferGeometry(),laserMat);optical.add(ray);
    // 白屏要有尺規（站長 11/16：「白屏上也要有尺規，我才知道那個光點是打在原本的零點上啊」）：
    // 和 2D 牆上直尺同一把尺：−10～+10 mm、每 1 mm 短刻線、每 5 mm 長刻線標數字、0 點綠色基準線，底下即時讀數。
    const MM=.14,RANGE=11;   // 每 mm 在屏上的高度（世界單位）；超出 ±11 mm 光點停在屏緣
    const sc=document.createElement('canvas');sc.width=256;sc.height=512;const sg=sc.getContext('2d');
    const scaleTex=new THREE.CanvasTexture(sc);if('colorSpace' in scaleTex&&THREE.SRGBColorSpace)scaleTex.colorSpace=THREE.SRGBColorSpace;scaleTex.anisotropy=4;
    let shownMm=null;
    function drawScale(mm){
      const H=512,mid=H/2,k=MM/4*H;   // 屏高 4 → 512 px
      sg.fillStyle='#f7f4ec';sg.fillRect(0,0,256,H);
      sg.strokeStyle='#b9b2a2';sg.lineWidth=3;sg.strokeRect(1.5,1.5,253,H-3);
      sg.strokeStyle='#1f9d6b';sg.lineWidth=4;sg.beginPath();sg.moveTo(14,mid);sg.lineTo(242,mid);sg.stroke();   // 0 點基準線
      sg.textAlign='right';sg.textBaseline='middle';
      for(let v=-10;v<=10;v++){const y=mid-v*k,major=v%5===0;
        sg.strokeStyle=v===0?'#1f9d6b':'#2c2c2c';sg.lineWidth=major?4:2;sg.beginPath();sg.moveTo(major?96:118,y);sg.lineTo(150,y);sg.stroke();
        if(major){sg.fillStyle=v===0?'#1f9d6b':'#2c2c2c';sg.font='700 34px system-ui,sans-serif';sg.fillText(v>0?'+'+v:v<0?'−'+(-v):'0',86,y);}}
      sg.textAlign='center';sg.fillStyle='#2c2c2c';sg.font='700 26px system-ui,sans-serif';sg.fillText('mm',200,30);
      if(mm!=null){sg.fillStyle='#c0392b';sg.font='700 30px system-ui,sans-serif';sg.fillText(T('光點 ','Spot ')+(mm>0?'+':mm<0?'−':'')+Math.abs(mm).toFixed(1)+' mm',128,H-30);}
      scaleTex.needsUpdate=true;
    }
    drawScale(0);
    const screenMat=new THREE.MeshStandardMaterial({color:tokens.card||0xf7f4ec,roughness:.7}),faceMat=new THREE.MeshStandardMaterial({map:scaleTex,roughness:.75});
    // BoxGeometry 六面順序 +x、−x、+y、−y、+z、−z；光從 −x 那一側打過來，尺規畫在 −x 面
    const ruler=add(new THREE.BoxGeometry(.15,4,2),[screenMat,faceMat,screenMat,screenMat,screenMat,screenMat],optical);ruler.position.set(21,3,1.8);
    const spot=add(new THREE.SphereGeometry(.13,12,8),new THREE.MeshBasicMaterial({color:tokens.pos}),optical);
    function update(s){
      hand.visible=arrows.visible=!!s.show.hand;
      const origin=new THREE.Vector3(-8,7,5);
      hand.position.copy(origin);
      // 模型局部 x＝拇指、y＝四指、z＝掌心。轉換矩陣行列式為 +1，反向不會變成左手。
      const I=new THREE.Vector3(0,0,-s.s1),B=new THREE.Vector3(s.s2,0,0),F=new THREE.Vector3(0,-s.s1*s.s2,0);
      hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(I,B,F));
      [I,B,F].forEach((dir,i)=>{helpers[i].arrow.position.copy(origin);helpers[i].arrow.setDirection(dir);helpers[i].text.position.copy(origin).addScaledVector(dir,6.6);});
      rice.visible=s.hung&&s.weight==='rice';rice.position.set(1.5+14*Math.cos(s.th),-14*Math.sin(s.th)-.15,0);rice.children.forEach((g,i)=>g.visible=i<s.grains);
      optical.visible=!!s.show.optical;mirror.position.set(1.5,.8,0);mirror.rotation.z=-s.th;
      // 光點讀數和 2D 同一個公式（屏距 2.00 m）：mm = D·tan2θ
      const core=window.CurrentBalanceStudyCore,mm=(core?core.optical(s.th):2*Math.tan(2*s.th))*1000;
      const y=3+Math.max(-RANGE,Math.min(RANGE,mm))*MM;spot.position.set(20.9,y,1.8);
      const r=Math.round(mm*10)/10;if(optical.visible&&r!==shownMm){shownMm=r;drawScale(r);}
      ray.geometry.setFromPoints([new THREE.Vector3(8,6,8),mirror.position.clone(),spot.position.clone()]);
    }
    return {update,dispose(){root.removeFromParent();}};
  }
  window.CurrentBalanceExtras3D={create};
})();
