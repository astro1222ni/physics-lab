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
    const ruler=add(new THREE.BoxGeometry(.15,4,2),new THREE.MeshStandardMaterial({color:tokens.card||0xf7f4ec,roughness:.7}),optical);ruler.position.set(21,3,1.8);
    const spot=add(new THREE.SphereGeometry(.16,12,8),new THREE.MeshBasicMaterial({color:tokens.pos}),optical);
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
      const y=3+Math.max(-1.75,Math.min(1.75,200*Math.tan(2*s.th)/2));spot.position.set(20.9,y,1.8);
      ray.geometry.setFromPoints([new THREE.Vector3(8,6,8),mirror.position.clone(),spot.position.clone()]);
    }
    return {update,dispose(){root.removeFromParent();}};
  }
  window.CurrentBalanceExtras3D={create};
})();
