/* Original teaching plastron. The displayed incision follows the licensed tracing chosen in the lab. */
(function () {
  'use strict';
  const base='img/han-character-formation/';
  const xSpan=2.94, ySpan=4.41;
  const stations=[[.21,1.02],[.265,1.065],[.286,1.06],[.305,1.15],[.326,1.20],
    [.58,1.175],[.606,1.16],[.627,1.075],[.67,1.08],[.743,1.115],[.80,1.08],
    [.87,.985],[.93,.84],[.975,.67],[1,.49]];

  function halfWidth(t){
    if(t<=.21)return Math.max(.008,1.02*Math.sqrt(1-((.21-t)/.21)**2));
    const end=stations.findIndex(point=>point[0]>=t);
    const [t0,w0]=stations[end-1],[t1,w1]=stations[end];
    return w0+(w1-w0)*(t-t0)/(t1-t0);
  }
  function sheetPoint(u,t,width){
    const tail=Math.max(0,(t-.87)/.13);
    const notch=.32*Math.max(0,1-Math.abs(u)/.78)+.055*Math.max(0,(Math.abs(u)-.8)/.2);
    const x=u*width, y=2.08-4.16*t+notch*tail*tail;
    const arch=Math.sin(Math.PI*t);
    const z=.045+.156*(1-u*u)*arch-.034*u*u+.012*Math.cos(3*y);
    const thickness=.10+.065*arch+.033*u*u*arch;
    return {x,y,z,thickness,s:x/xSpan+.5,v:y/ySpan+.5};
  }
  async function loadImage(url){
    const im=new Image();im.src=url;await im.decode();return im;
  }
  function canvasOf(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  let materialImages;
  function maps(){
    if(!materialImages){
      materialImages=Promise.all(['obverse.webp','obverse-relief.png','reverse.webp','reverse-relief.png']
        .map(file=>loadImage(base+'model/'+file))).catch(err=>{materialImages=null;throw err;});
    }
    return materialImages;
  }
  // Zhang–Suen thinning removes the width of the tracing while preserving endpoints, branches and loops.
  const cuts=new Map();
  async function cutMask(key){
    if(cuts.has(key))return cuts.get(key);
    const im=await loadImage(base+key+'-oracle'+(key==='wood'?'.svg':'.png'));
    const n=160,field=canvasOf(n,n),c=field.getContext('2d',{willReadFrequently:true});
    const fit=(n-8)/Math.max(im.naturalWidth,im.naturalHeight),w=im.naturalWidth*fit,h=im.naturalHeight*fit;
    c.drawImage(im,(n-w)/2,(n-h)/2,w,h);
    const pixels=c.getImageData(0,0,n,n).data,ink=new Uint8Array(n*n);
    for(let i=0;i<ink.length;i++){
      const at=i*4;ink[i]=pixels[at+3]*(1-(pixels[at]+pixels[at+1]+pixels[at+2])/765)>85?1:0;
    }
    let changed;
    do{
      changed=false;
      for(let pass=0;pass<2;pass++){
        const erase=[];
        for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){
          const i=y*n+x;if(!ink[i])continue;
          const neighbors=[ink[i-n],ink[i-n+1],ink[i+1],ink[i+n+1],ink[i+n],ink[i+n-1],ink[i-1],ink[i-n-1]];
          const sum=neighbors.reduce((a,b)=>a+b,0);
          if(sum<2||sum>6)continue;
          const turns=neighbors.reduce((a,p,j)=>a+(!p&&neighbors[(j+1)%8]),0);
          const [north,,east,,south,,west]=neighbors;
          const joined=pass?(north*east*west||north*south*west):(north*east*south||east*south*west);
          if(turns===1&&!joined)erase.push(i);
        }
        erase.forEach(i=>{ink[i]=0;});if(erase.length)changed=true;
      }
    }while(changed);
    c.clearRect(0,0,n,n);c.fillStyle='#fff';
    let left=n,right=0,top=n,bottom=0;
    for(let i=0;i<ink.length;i++)if(ink[i]){
      const x=i%n,y=Math.floor(i/n);
      c.beginPath();c.arc(x+.5,y+.5,1.37,0,2*Math.PI);c.fill();
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    const padded=4,mask=canvasOf(right-left+2*padded+1,bottom-top+2*padded+1);
    mask.getContext('2d').drawImage(field,padded-left,padded-top);
    cuts.set(key,mask);return mask;
  }
  function tinted(mask,color){
    const tile=canvasOf(mask.width,mask.height),c=tile.getContext('2d');
    c.drawImage(mask,0,0);c.globalCompositeOperation='source-in';c.fillStyle=color;c.fillRect(0,0,tile.width,tile.height);
    return tile;
  }

  async function create(host,T,onTurn,navHost=host){
    const [THREE,{OrbitControls},images]=await Promise.all([
      import('../vendor/three/three.module.min.js'),import('../vendor/three/OrbitControls.js'),maps()]);
    const [obverse,obverseHeight,reverse,reverseHeight]=images;
    const canvas=document.createElement('canvas');canvas.tabIndex=0;
    canvas.setAttribute('aria-label',T('可旋轉與平移的龜腹甲模型','Rotatable and pannable turtle plastron'));
    const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
    host.append(canvas);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(31,1,.1,65);
    const orbit=new OrbitControls(camera,canvas);
    orbit.enableDamping=!matchMedia('(prefers-reduced-motion:reduce)').matches;orbit.dampingFactor=.16;
    orbit.minDistance=3;orbit.maxDistance=18;orbit.maxPolarAngle=Math.PI*.86;
    const nav=LabView3DNav.attach({THREE,controls:orbit,canvas,host:navHost,radius:2.5,T});
    const group=new THREE.Group();scene.add(group);group.position.y=.055;
    const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.83,...extra});
    function texture(image,color){
      const tex=new THREE.Texture(image);
      if(color)tex.colorSpace=THREE.SRGBColorSpace;
      tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());tex.needsUpdate=true;return tex;
    }
    const paint=canvasOf(obverse.width,obverse.height),relief=canvasOf(obverse.width,obverse.height);
    const frontColor=texture(paint,true),frontBump=texture(relief,false);
    const textures=[frontColor,frontBump,texture(reverse,true),texture(reverseHeight,false)];
    const frontMaterial=mat(0xffffff,{map:frontColor,bumpMap:frontBump,bumpScale:.045,vertexColors:true});
    const backMaterial=mat(0xffffff,{map:textures[2],bumpMap:textures[3],bumpScale:.012,vertexColors:true});
    const read=canvasOf(reverseHeight.width,reverseHeight.height).getContext('2d',{willReadFrequently:true});
    read.drawImage(reverseHeight,0,0);
    const depth=read.getImageData(0,0,reverseHeight.width,reverseHeight.height).data;
    function pitDepth(s,v){
      const col=Math.round(s*(reverseHeight.width-1)),row=Math.round((1-v)*(reverseHeight.height-1));
      return Math.max(0,(226-depth[4*(row*reverseHeight.width+col)])/184)*.102;
    }
    function mesh(positions,uvs,colors,indices,material){
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      if(uvs)g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
      const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=false;group.add(m);return m;
    }
    const rows=174,cols=128,stride=cols+1,front=[],back=[],coords=[],colors=[],indices=[],backIndices=[];
    for(let r=0;r<=rows;r++){
      const t=(1-Math.cos(Math.PI*r/rows))/2,width=halfWidth(t);
      for(let j=0;j<=cols;j++){
        const u=2*j/cols-1,p=sheetPoint(u,t,width),i=r*stride+j;
        front.push(p.x,p.y,p.z);back.push(p.x,p.y,p.z-p.thickness+pitDepth(p.s,p.v));coords.push(p.s,p.v);
        const wear=1-.20*Math.abs(u)**11-.095*(Math.abs(2*t-1)**11);
        colors.push(wear,wear*.991,wear*.97);
        if(r<rows&&j<cols){
          indices.push(i,i+stride,i+1,i+1,i+stride,i+stride+1);
          backIndices.push(i,i+1,i+stride,i+1,i+stride+1,i+stride);
        }
      }
    }
    mesh(front,coords,colors,indices,frontMaterial);mesh(back,coords,colors,backIndices,backMaterial);
    // Close the two faces with a rounded, weathered cut edge. The bridge keeps a long straight sawn side.
    const boundary=[];
    for(let j=0;j<=cols;j++)boundary.push(j);
    for(let r=1;r<=rows;r++)boundary.push(r*stride+cols);
    for(let j=cols-1;j>=0;j--)boundary.push(rows*stride+j);
    for(let r=rows-1;r>0;r--)boundary.push(r*stride);
    const rim=[],rimColors=[],rimIndices=[];
    for(let k=0;k<boundary.length;k++){
      const i=3*boundary[k],x=front[i],y=front[i+1];
      for(let band=0;band<=4;band++){
        const fraction=band/4,bulge=Math.sin(Math.PI*fraction);
        rim.push(x*(1+.010*bulge),y*(1+.004*bulge),front[i+2]*(1-fraction)+back[i+2]*fraction);
        const fleck=.90+.047*Math.sin(k*1.83)+.04*Math.sin(k*.19+band*.4)-.08*bulge;
        rimColors.push(fleck,fleck*.95,fleck*.84);
        if(band<4){const a=k*5+band,b=((k+1)%boundary.length)*5+band;rimIndices.push(a,b,a+1,b,b+1,a+1);}
      }
    }
    mesh(rim,null,rimColors,rimIndices,mat(0xad8c64,{side:THREE.DoubleSide,vertexColors:true}));
    function stand(w,h,d,col,x,y,z){
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(col,{metalness:.24}));
      m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);
    }
    stand(2.50,.085,.80,0x42453e,0,-2.12,-.04);
    for(const side of [-1,1]){stand(.036,.60,.048,0x6f654f,side*.54,-1.78,-.12);stand(.052,.055,.18,0x9d8866,side*.54,-1.95,-.008);}
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),mat(0xddd9cb));floor.rotation.x=-Math.PI/2;floor.position.y=-2.17;floor.receiveShadow=true;scene.add(floor);
    scene.add(new THREE.HemisphereLight(0xfff1da,0xa7acb2,1.40));
    const lamp=new THREE.DirectionalLight(0xffeed5,2.15);lamp.position.set(-3.8,4,4.1);
    lamp.castShadow=true;lamp.shadow.mapSize.set(768,768);lamp.shadow.normalBias=.02;scene.add(lamp);
    const fill=new THREE.DirectionalLight(0xf6e7cc,1.74);fill.position.set(3.7,2,-3.9);scene.add(fill);
    let disposed=false,frame=0,revision=0;
    function request(){
      if(frame||disposed||document.hidden||!host.clientWidth)return;
      frame=requestAnimationFrame(()=>{frame=0;if(disposed||document.hidden)return;orbit.update();renderer.render(scene,camera);});
    }
    orbit.addEventListener('change',request);
    const beforeDrag=new THREE.Quaternion();
    orbit.addEventListener('start',()=>beforeDrag.copy(camera.quaternion));
    orbit.addEventListener('end',()=>{if(beforeDrag.angleTo(camera.quaternion)>.025)onTurn('free');});
    async function exhibit(key){
      canvas.setAttribute('aria-busy','true');
      const ticket=++revision,mask=await cutMask(key);
      if(disposed||ticket!==revision)return;
      const w=paint.width,h=paint.height;
      const color=paint.getContext('2d'),height=relief.getContext('2d');
      color.drawImage(obverse,0,0);height.drawImage(obverseHeight,0,0);
      // The source graph sits in the right abdominal scute. Its fine bevel and dark trough use the same mask.
      const scale=Math.min((.64/xSpan*w)/mask.width,(.64/ySpan*h)/mask.height);
      const dw=scale*mask.width,dh=scale*mask.height,px=(.5+.70/xSpan)*w-dw/2,py=(.5+.20/ySpan)*h-dh/2;
      color.drawImage(tinted(mask,'#ead8ad'),px+.95,py+1.15,dw,dh);
      color.drawImage(tinted(mask,'#684d36'),px,py,dw,dh);
      height.drawImage(tinted(mask,'#393939'),px,py,dw,dh);
      const letter={wood:'木',mountain:'山',moon:'月'}[key];
      canvas.setAttribute('aria-label',T('可旋轉與平移的龜腹甲，展字','Rotatable and pannable plastron, graph')+' '+letter);
      canvas.setAttribute('aria-busy','false');
      frontColor.needsUpdate=true;frontBump.needsUpdate=true;request();
    }
    function theme(){const bg=LabDraw.dark?0x242c2c:0xdadad2;scene.background=new THREE.Color(bg);floor.material.color.setHex(bg);request();}
    function setView(pose,notify=true){
      const angle={front:0,back:Math.PI,side:84*Math.PI/180}[pose];
      if(angle===undefined)return;
      // Flush residual drag damping before setting a repeatable camera target.
      const damping=orbit.enableDamping;orbit.enableDamping=false;orbit.update();
      const distance=8.65;
      orbit.target.set(0,-.015,0);camera.position.set(Math.sin(angle)*distance,.36,Math.cos(angle)*distance);
      orbit.update();orbit.enableDamping=damping;nav.home();if(notify)onTurn(pose);request();
    }
    function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();request();}
    function visible(){if(!document.hidden)request();}
    const ro=new ResizeObserver(resize);ro.observe(host);document.addEventListener('visibilitychange',visible);
    setView('front',false);theme();resize();
    function dispose(){
      disposed=true;++revision;cancelAnimationFrame(frame);ro.disconnect();document.removeEventListener('visibilitychange',visible);
      orbit.removeEventListener('change',request);nav.dispose();orbit.dispose();
      textures.forEach(tex=>tex.dispose());
      scene.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});
      lamp.shadow.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();
    }
    return {exhibit,theme,home:()=>setView('front'),setView,dispose};
  }
  window.HanShell={create};
})();
