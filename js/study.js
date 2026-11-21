/* 同一個按需繪製的 3D 場景；科學量由主引擎提供，失敗時保留 2D。 */
(function(){
  'use strict';
  let THREE,loading,renderer,world,camera,light,intro,app,floor,host,active,failed=false,visible=true,draws=0,lastKey='',observer,colorVersion=-1;
  const materials={};
  const token=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function texture(base,grain){
    const cv=document.createElement('canvas');cv.width=512;cv.height=256;const c=cv.getContext('2d');c.fillStyle=base;c.fillRect(0,0,512,256);
    let seed=721;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let j=0;j<110;j++){const y=rand()*256;c.strokeStyle=LabDraw.alpha(grain,.07+rand()*.18);c.lineWidth=.3+rand()*1.2;c.beginPath();c.moveTo(-10,y);for(let x=0;x<=520;x+=20)c.lineTo(x,y+Math.sin(x*.018+j)*(.7+rand()*2));c.stroke();}
    for(let j=0;j<7;j++){const x=rand()*512,y=rand()*256;c.strokeStyle=LabDraw.alpha(grain,.15);for(let r=1;r<5;r++){c.beginPath();c.ellipse(x,y,r*11,r*1.8,0,0,Math.PI*2);c.stroke();}}
    const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
  }
  function mat(color,opts){return new THREE.MeshStandardMaterial(Object.assign({color,roughness:.72,metalness:0},opts));}
  function mesh(geometry,material,x,y,z,parent){const m=new THREE.Mesh(geometry,material);m.position.set(x||0,y||0,z||0);m.castShadow=true;m.receiveShadow=true;(parent||world).add(m);return m;}
  const box=(w,h,d,m,x,y,z,p)=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,p);
  function lineTube(points,r,m,p){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v))),48,r,7,false),m,0,0,0,p);}
  function hand(parent){
    const g=new THREE.Group();parent.add(g);const skin=mat(token('--study-hand')),nail=mat(LabDraw.shade(token('--study-hand'),.22)),sleeve=mat(token('--study-sleeve')),cuff=mat(LabDraw.shade(token('--study-sleeve'),.28));
    const ell=(sx,sy,sz,x,y,z,m)=>{const o=mesh(new THREE.SphereGeometry(1,20,14),m||skin,x,y,z,g);o.scale.set(sx,sy,sz);return o;};
    // 手心、掌背、對握的拇指與四根彎曲手指，環穿過指節內側。
    ell(.035,.021,.027,.025,0,.005);ell(.049,.016,.021,.087,0,.005);
    for(let i=0;i<4;i++){const z=-.023+i*.014,x=.004+i*.002;lineTube([[x+.027,.012,z],[x+.008,.021,z],[x-.004,.012,z],[x-.003,-.009,z],[x+.011,-.014,z]],.006,skin,g);ell(.005,.0018,.004,x-.004,.016,z+.002,nail);}
    lineTube([[.044,-.008,.027],[.019,-.022,.031],[.003,-.015,.024],[.008,-.003,.016]],.009,skin,g);
    const fore=mesh(new THREE.CylinderGeometry(.023,.029,.075,20),sleeve,.127,0,.004,g);fore.rotation.z=-Math.PI/2;
    const edge=mesh(new THREE.CylinderGeometry(.024,.024,.017,20),cuff,.105,0,.004,g);edge.rotation.z=-Math.PI/2;
    const seam=mat(LabDraw.shade(token('--study-sleeve'),.38));lineTube([[.113,.020,.013],[.14,.019,.015],[.16,.02,.018]],.0007,seam,g);
    return g;
  }
  function build(){
    world=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,30);
    world.add(new THREE.HemisphereLight(0xfff6e8,0xc1cbd9,1.8));light=new THREE.DirectionalLight(0xfff5e5,2.1);light.position.set(-1.4,3,3);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-2;light.shadow.camera.right=2;light.shadow.camera.top=2;light.shadow.camera.bottom=-2;light.shadow.normalBias=.002;light.shadow.bias=-.0003;light.shadow.radius=4;world.add(light);
    const fill=new THREE.DirectionalLight(0xc9e4ff,.6);fill.position.set(2,1,-1);world.add(fill);
    materials.wood=mat(token('--study-wood'),{map:texture('#d3a36f','#704324')});materials.edge=mat(token('--study-edge'),{map:texture('#b98550','#644323')});materials.table=mat(token('--study-table'),{map:texture('#d5be98','#887255')});materials.metal=mat('#c6d0d9',{metalness:.8,roughness:.28});materials.rope=mat('#ccb792',{roughness:.93});
    intro=new THREE.Group();world.add(intro);const crate=new THREE.Group();crate.rotation.y=-.15;intro.add(crate);
    box(.35,.018,.25,materials.edge,0,.011,0,crate);
    for(let i=0;i<4;i++){const y=.039+i*.052;box(.35,.044,.018,materials.wood,0,y,.126,crate);box(.35,.044,.018,materials.wood,0,y,-.126,crate);box(.018,.044,.25,materials.edge,-.175,y,0,crate);box(.018,.044,.25,materials.edge,.175,y,0,crate);}
    for(const x of [-.15,.15])box(.024,.224,.011,materials.edge,x,.123,.14,crate);
    const bookColors=['#386479','#9c4b3e','#b49a62','#5e7861','#596d8f','#805d63','#d0c09d'];
    for(let i=0;i<9;i++){const h=.24+(i*7%5)*.019,b=new THREE.Group();b.position.set(-.135+i*.034,.022,0);b.rotation.z=(i%4-1.5)*.022;crate.add(b);const cover=mat(bookColors[i%7]);box(.029,h,.18,cover,0,h/2,0,b);box(.022,h-.012,.164,mat('#eee4d0'),0,h/2,.006,b);box(.032,h+.004,.007,cover,0,h/2,.096,b);for(const y of [.025,h-.025])box(.024,.002,.001,mat('#e0cb9f'),0,y,.100,b);}
    const rope=lineTube([[.18,.125,.02],[.37,.125,.02]],.0032,materials.rope,intro);intro.userData.rope=rope;
    const fist=hand(intro);fist.position.set(.37,.125,.02);intro.userData.hand=fist;
    floor=new THREE.Group();world.add(floor);const plane=mesh(new THREE.PlaneGeometry(12,8),mat(token('--study-floor'),{map:texture('#c7c4bb','#72746e')}),0,0,0,floor);plane.rotation.x=-Math.PI/2;plane.receiveShadow=true;
    app=new THREE.Group();world.add(app);app.userData.body=box(.18,.14,.14,materials.wood,0,.07,0,app);
    app.userData.body.rotation.y=-.14;
    const rim=mat(LabDraw.shade(token('--study-wood'),-.16));box(.182,.004,.142,rim,0,.004,0,app);
    const pts=[];for(let i=0;i<=500;i++){const t=i/500,a=t*Math.PI*20;pts.push([.008+t*.144,Math.cos(a)*.007,Math.sin(a)*.007]);}
    const spring=lineTube(pts,.0016,materials.metal,app);spring.position.set(.09,.072,0);app.userData.spring=spring;
    lineTube([[.081,.072,0],[.092,.072,0],[.098,.072,0]],.0016,materials.metal,app);
    const ring=mesh(new THREE.TorusGeometry(.009,.0016,8,32),materials.metal,0,.072,0,app);app.userData.ring=ring;
    const fist2=hand(app);app.userData.hand=fist2;
    const tableFront=box(8,.028,.50,[materials.edge,materials.edge,materials.table,materials.edge,materials.edge,materials.edge],0,-.016,0);world.userData.front=tableFront;
    for(const x of [-.27,.45])box(.035,.075,.035,materials.edge,x,-.066,.17,tableFront);
  }
  async function load(){if(loading)return loading;loading=(async()=>{try{
    THREE=await import(new URL('vendor/three/three.module.min.js',document.baseURI).href);
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0,0);renderer.domElement.className='study-webgl';
    renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();failed=true;if(host)host.classList.remove('ready');dispatchEvent(new Event('study:visualready'));});build();return true;
  }catch(e){failed=true;return false;}})();return loading;}
  function attach(node,kind,notify){host=node;active=kind;lastKey='';if(observer)observer.disconnect();observer=new IntersectionObserver(es=>{visible=es[0]?.isIntersecting!==false;if(visible)notify?.();});observer.observe(node);
    load().then(ok=>{if(!ok||!node.isConnected||node!==host)return;node.append(renderer.domElement);node.classList.add('ready');notify?.();});}
  function project(x,y,z){const v=new THREE.Vector3(x,y,z).project(camera);return {x:(v.x+1)*renderer.domElement.clientWidth/2,y:(1-v.y)*renderer.domElement.clientHeight/2};}
  function paint(o){
    if(failed||!renderer||!host?.isConnected||!visible||document.hidden||document.documentElement.dataset.lpState==='full'&&innerWidth<1240)return null;
    if(colorVersion!==LabDraw.ver){materials.wood.color.set(token('--study-wood'));materials.edge.color.set(token('--study-edge'));materials.table.color.set(token('--study-table'));floor.children[0].material.color.set(token('--study-floor'));colorVersion=LabDraw.ver;}
    const {w,h}=o;if(!w||!h)return null;const key=JSON.stringify(o)+LabDraw.ver;if(key===lastKey)return host._geometry;lastKey=key;
    renderer.setSize(w,h,false);host.style.width=w+'px';host.style.height=h+'px';
    const isIntro=active==='crate',ppm=isIntro?Math.min((w-30)/.79,(h-90)/.43):Math.min(1000,(w-24)/.80);
    const bx=isIntro?w*.27:(o.center||112),by=isIntro?h*.73:(o.table||h*.74),cos=3.5/Math.hypot(2.0,3.5),baseX=(bx-w/2)/ppm,baseY=(h/2-by)/(ppm*cos);
    camera.left=-w/(2*ppm);camera.right=w/(2*ppm);camera.top=h/(2*ppm);camera.bottom=-h/(2*ppm);camera.position.set(0,2.0,3.5);camera.lookAt(0,0,0);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    intro.visible=isIntro;app.visible=!isIntro;world.userData.front.visible=!isIntro;floor.visible=isIntro;
    if(isIntro){intro.position.set(baseX,baseY,0);floor.position.y=baseY-.004;intro.userData.hand.position.x=.37;}
    else{
      const physical=-(o.motionX||0),follow=Math.abs(physical)>.03?physical-Math.sign(physical)*.03:0,dx=physical-follow,dir=o.left?-1:1;
      app.position.set(baseX+dx,baseY,0);app.scale.x=dir;const L=.16+Math.abs(o.F)/500;app.userData.spring.scale.x=L/.16;app.userData.spring.scale.y=app.userData.spring.scale.z=1-Math.abs(o.F)/500;
      app.userData.ring.position.x=.09+L+.008;app.userData.hand.position.set(.09+L+.008,.072,0);app.userData.hand.scale.setScalar(o.hover?1.06:1);
      world.userData.front.position.y=baseY-.016;world.userData.front.position.x=-follow%1;materials.wood.map.offset.x=0;materials.table.map.offset.x=follow;
    }
    world.updateMatrixWorld(true);renderer.render(world,camera);draws++;
    const p=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).applyMatrix4(app.matrixWorld);return project(v.x,v.y,v.z);};
    const len=.16+Math.abs(o.F||0)/500,geometry=isIntro?{ppm,mode:'3d'}:{ppm,mode:'3d',contact:p(0,0,.07),center:p(0,.07,.07),top:p(0,.14,0),hook:p(.09,.072,0),ring:p(.09+len+.008,.072,0),zeroRing:p(.258,.072,0),pxPerN:ppm/500,bodyShift:-(o.motionX||0),modelWidth:(.18+len+.173)*ppm};
    host._geometry=geometry;return geometry;
  }
  window.StudyVisual3D={attach,paint,get ready(){return !!renderer&&!failed;},get stats(){return {draws,failed,visible,contexts:renderer?1:0};},detach(){observer?.disconnect();host=null;lastKey='';}};
})();

/* 八段自學：每次只前進一步；受力與運動一律沿用 InclineCore。 */
(function(){
  'use strict';
  if (!document.querySelector('.study-page')) return;
  const T=(a,b)=>LabSettings.t(a,b),tr=p=>Array.isArray(p)?T(p[0],p[1]):String(p||'');
  const $=id=>document.getElementById(id),E=(tag,text,cls)=>LabPanel.element(tag,text,cls),B=(text,fn)=>LabPanel.button(text,fn),rich=(node,text)=>LabPanel.rich(node,text);
  const C=InclineCore,D=LabDraw,V=StudyVisual3D,P=StudyDraw;
  let unit,section=0,index=0,stars=Array(8).fill(false),answers={},classAnswers={},polls={},reveal=false,teaching=false,key;
  let canvas,ctx,scene,experiment,frame=0,lastTime=0,geometry,drag,hover=false,photoCanvas,photoHost,visualHost,examplesIndex=1,guideDefined=false,currentQuestion=null,sceneElapsed=0;
  const visits=new Set(),voicedStars=new Set();let armed=false,forceVoice,forceTimer,noiseAt=0,strainAt=0,previousF=0,previousKind='static',captionText='',audioLog=[];
  const fs=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||1;
  const col=P.color,font=P.font;
  function sound(event,method,o){if(!armed||!window.LabSound?.enabled()||document.hidden)return;audioLog.push({event,method,...o});if(audioLog.length>500)audioLog.shift();dispatchEvent(new CustomEvent('study:sound',{detail:{event,method,...o}}));return LabSound[method](o);}
  function tap(event='page'){sound(event,'tone',{freq:530,dur:.045,gain:.025});}
  function stopVoice(){clearTimeout(forceTimer);forceVoice?.stop(.10);forceVoice=null;}
  function forceSound(F,kind){if(!armed||!LabSound?.enabled())return;const n=Math.abs(F);if(Math.abs(F-previousF)>.02){
    const o={freq:300+8*n,gain:.018,type:'sine'};if(!forceVoice)forceVoice=sound('force-rise','voice',o);else{forceVoice.set(o,.035);audioLog.push({event:'force-rise',method:'set',...o});}
    clearTimeout(forceTimer);forceTimer=setTimeout(stopVoice,140);
  }previousF=F;const limit=C.components(params(0,scene?.material)).fsMax,now=performance.now();
    if(kind==='static'&&n>limit*.90&&now-strainAt>450){sound('near-limit','sweep',{from:480,to:610,dur:.18,gain:.024,type:'triangle'});strainAt=now;}
    if(previousKind==='static'&&kind==='kinetic'){sound('slip','noise',{dur:.11,gain:.07,filter:1650,q:.9});sound('friction-drop','sweep',{from:660,to:330,dur:.16,gain:.045});}
    previousKind=kind;
  }
  function slidingSound(s){if(performance.now()-noiseAt<165||!s.motion.v||isCovered())return;noiseAt=performance.now();const v=Math.min(3,Math.abs(s.motion.v));sound('sliding','noise',{dur:.17,gain:.012+.012*v,filter:1100+v*260,q:.6});}
  function params(F,material){const surf=material&&material!=='unit'?C.SURFACES.find(x=>x.id===material):{mus:.5,muk:.4};return {theta:0,mode:'along',m:5,mus:surf.mus,muk:surf.muk,g:C.G,F:F||0};}
  const forces=s=>C.forcesAt(params(s.F,s.material),s.motion.v,0);
  function snapshot(s,type){return Object.assign({},forces(s),{F:s.F,moving:s.motion.v!==0,type:type||'frame'});}
  function fresh(){return {F:0,motion:C.newState(),trace:[],peak:0,material:'unit',left:false,showValues:true,ramp:false,interacted:false};}
  function point(s){const k=forces(s),p={F:Math.abs(s.F),f:Math.abs(k.f),kind:k.kind},last=s.trace.at(-1);if(!last||last.kind!==p.kind||Math.abs(last.F-p.F)>.04||Math.abs(last.f-p.f)>.04){s.trace.push(p);if(s.trace.length>1800)s.trace.shift();}}
  function standard(material){const max=C.components(params(0,material)),points=[];for(let F=0;F<max.fsMax;F+=.5)points.push({F,f:F,kind:'static'});points.push({F:max.fsMax,f:max.fsMax,kind:'static'},{F:max.fsMax,f:max.fk,kind:'kinetic'});for(let F=max.fsMax+.5;F<=50;F+=.5)points.push({F,f:max.fk,kind:'kinetic'});return points;}
  function target(n){const s=fresh();s.F=[0,5,15,15,24.5,25,40,40][n];s.peak=s.F;const limit=n>=5?50:s.F;s.trace=standard().filter(p=>p.F<=limit&&(n>=5||p.kind==='static'));if(n<3)s.trace=[{F:s.F,f:s.F,kind:'static'}];return s;}
  function save(){if(teaching)return;try{localStorage.setItem(key,JSON.stringify({section,index,stars,answers}));}catch(e){}}
  function read(){try{const p=JSON.parse(localStorage.getItem(key)||'null');if(!p)return;section=Math.max(0,Math.min(7,+p.section||0));index=Math.max(0,Math.min(unit.sections[section].steps.length-1,+p.index||0));stars=Array.from({length:8},(_,i)=>!!p.stars?.[i]);answers=p.answers||{};}catch(e){}}
  function hash(){const m=/^#s([1-8])-(\d+)$/.exec(location.hash);if(!m)return false;section=+m[1]-1;index=Math.max(0,Math.min(unit.sections[section].steps.length-1,+m[2]-1));return true;}
  function progress(){const nav=$('study-progress');nav.replaceChildren();unit.sections.forEach((s,i)=>{const b=B((i+1)+(innerWidth>=1000?' '+tr(s.title):''),()=>{tap();go(i,0);});b.setAttribute('aria-label',(i+1)+' '+tr(s.title)+(stars[i]?T('，已完成','; complete'):''));if(section===i)b.setAttribute('aria-current','step');b.classList.toggle('done',stars[i]);nav.append(b);});}
  function canAdvance(){return teaching||!currentQuestion||Number.isInteger(answers[currentQuestion]);}
  function mark(){if(teaching||stars[section])return;const s=unit.sections[section];if(s.steps.some(x=>x.question&&!Number.isInteger(answers[x.question])))return;if(s.kind==='quiz'&&s.steps.some(x=>answers[x.question]!==unit.questions[x.question].correct))return;if(s.kind==='experiment'&&(LabSteps.done.length!==6||!LabSteps.done.every(Boolean)))return;stars[section]=true;save();progress();}
  function next(skip){if(!skip&&!canAdvance())return;tap();const s=unit.sections[section];if(index===s.steps.length-1){if(!skip)mark();if(section<7)go(section+1,0);else{mark();render();}return;}go(section,index+1);}
  function prev(){tap();if(index)go(section,index-1);else if(section)go(section-1,unit.sections[section-1].steps.length-1);}
  function go(s,i){const old=section;section=Math.max(0,Math.min(7,s));index=Math.max(0,Math.min(unit.sections[section].steps.length-1,i));scrollTo(0,0);reveal=false;if(old!==section&&innerWidth<1240)LabPanel.close();if(unit.sections[section].kind!=='examples')LabPanel.setTab('concept');history.replaceState(null,'','#s'+(section+1)+'-'+(index+1));render();save();}
  function caption(text){if(captionText===text)return;captionText=text;rich($('study-caption'),text);const label=['prediction','quiz','summary','experiment'].includes(unit.sections[section].kind)?['說明','Explanation']:['觀念','Concept'];LabPanel.setContext({label,caption:text});}
  function panel(st){const kind=unit.sections[section].kind,hidden=teaching&&!reveal&&['prediction','quiz'].includes(kind),body=hidden?T('先讓大家選，再按「公布答案」看答案與說明。','Let everyone choose, then press “Reveal answer” for the answer and explanation.'):tr(st.body),nodes=[rich(E('p'),body)];
    if(kind==='scene'){const k=forces(scene);nodes.push(rich(E('p'),`\\(F=${Math.abs(scene.F).toFixed(1)}\\ \\mathrm{N},\\quad f_${k.kind==='static'?'s':'k'}=${Math.abs(k.f).toFixed(1)}\\ \\mathrm{N}\\)`));if(index===7)unit.shortBoard.forEach(p=>nodes.push(rich(E('p'),tr(p))));}
    if(kind==='experiment')nodes.push(settings());
    if(!hidden&&!new URLSearchParams(location.search).has('embed'))(st.videoKeys||[]).forEach(k=>{const v=unit.videos[k];if(!v)return;const a=E('a',T('▶ 看倪老師上課講這段（〔20〕','▶ Watch Dr. Ni explain this in class (in Chinese, ')+v.time+T('）',')'),'lp-lecture-link');a.href=v.href;a.target='_blank';a.rel='noopener';nodes.push(a);});
    LabPanel.setContent('concept',nodes);LabPanel.setStrip((body.match(/^[^。！？.!?]*[。！？.!?]?/) || [''])[0],'concept');
    if(kind!=='experiment'){const list=E('ol',null,'lp-unit-nav');unit.sections.forEach((s,i)=>{const b=B((i+1)+'. '+tr(s.title),()=>{tap();go(i,0);});if(i===section)b.setAttribute('aria-current','step');const li=E('li');li.append(b);list.append(li);});LabPanel.setContent('steps',[E('h3',T('這一單元怎麼走','Your path through this unit')),list]);LabPanel.setStrip((section+1)+'/8 '+tr(unit.sections[section].title),'steps');}
    const examples=window.LAB_EXAMPLE_DATA['incline-friction'];if(kind!=='examples'){LabPanel.setContent('examples',[E('h3',T('換個情境，試試看','Try another situation')),...examples.map(ex=>{const b=B('',()=>{examplesIndex=ex.n;tap();go(5,0);});rich(b,T('範例 ','Example ')+ex.n+' · '+tr(ex.q));return b;})]);LabPanel.setStrip(T('三個情境：斜面、改變拉力、直立牆','Three situations: incline, changing pull, vertical wall'),'examples');}
    LabPanel.setStrip(T('想挑戰星星？到完整斜面實驗試試','Ready for stars? Try the full incline experiment'),'missions');
  }
  function settings(){const box=E('div',null,'lp-settings');box.append(E('h3',T('實驗設定','Experiment settings')));const label=E('label',T('接觸面','Surfaces')),sel=E('select');sel.id='study-material';label.htmlFor=sel.id;
    [['unit',T('本單元桌面','This unit’s table')],['wood',T('木頭／木頭','Wood on wood')],['rubber',T('橡膠／乾混凝土','Rubber on dry concrete')]].forEach(([v,t])=>{const o=E('option',t);o.value=v;sel.append(o);});sel.value=experiment.material;sel.onchange=()=>{experiment.material=sel.value;experiment.F=0;experiment.motion=C.newState();experiment.trace=[];experiment.ramp=false;draw();};box.append(label,sel);
    const row=E('label'),swap=E('input');swap.type='checkbox';swap.dataset.studySide='';swap.checked=experiment.left;swap.onchange=()=>{experiment.left=swap.checked;setForce((swap.checked?-1:1)*Math.abs(experiment.F));};row.append(swap,E('span',T('換邊拉','Pull from the other side')));box.append(row);
    const row2=E('label'),values=E('input');values.type='checkbox';values.checked=experiment.showValues;values.onchange=()=>{experiment.showValues=values.checked;draw();};row2.append(values,E('span',T('顯示讀數','Show readings')));box.append(row2,B(T('清除軌跡','Clear trace'),()=>{experiment.trace=[];draw();}),E('p',T('六步引導使用本單元桌面。換材質後，再試著量一次上限。','The six guided checks use this unit’s table. After changing surfaces, try measuring a new limit.')));return box;
  }
  function graphIcon(type){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 60');svg.classList.add('study-graph-choice');svg.setAttribute('aria-hidden','true');for(const [d,opacity,width] of [['M10 4V50H96','.4','1'],[['M10 25H95','M10 50L85 6','M10 50L50 9V20H95'][type],'1','3']]){const p=document.createElementNS(ns,'path');p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width',width);p.setAttribute('opacity',opacity);svg.append(p);}return svg;}
  function feedback(q,a){const ok=a===q.correct,box=E('div',null,'study-feedback '+(ok?'is-correct':'is-wrong'));box.append(E('strong',(ok?'✓ ':'✗ ')+T(ok?'對，抓到重點了':'再想一遍',ok?'Yes — that is the key':'Try once more')));let text=tr(q.feedback[a]).replace(/^M[1-7](?:[/／]M?[1-7])*\s*[｜|]\s*/,'').replace(/^✓\s*/,'');box.append(rich(E('p'),text));return box;}
  function mini(qid){const cv=E('canvas',null,'study-condition');cv.setAttribute('role','img');cv.setAttribute('aria-label',T('水平桌面上的五公斤木塊，受向右水平拉力','A 5 kg block on a level table under a horizontal rightward pull'));requestAnimationFrame(()=>{if(!cv.isConnected)return;const w=cv.clientWidth,h=cv.clientHeight,dpr=Math.min(2,devicePixelRatio||1);cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);D.backdrop(c,w,h);const y=h-20,x=w*.32;D.block(c,12,y,w-24,8,col('--study-table'),{r:3,shadow:false});P.block(c,x-29,y-39,58,39);txtOn(c,'5 kg',x,y-16,15,D.c.text);D.arrow(c,x+36,y-28,x+121,y-28,D.c.pos,3);D.pill(c,qid==='p1'?'F = 10 N':T('F 慢慢加大','Increase F'),x+97,y-35,D.c.pos,'center',font(15));});return cv;}
  function question(qid,comparison){currentQuestion=qid;const q=unit.questions[qid],kind=unit.sections[section].kind,div=E('div',null,'study-question');div.classList.toggle('revealed',reveal);div.append(rich(E('h3'),tr(q.q)));
    if(kind==='prediction')div.append(mini(qid));const opts=E('div',null,'study-options'),responses=teaching?classAnswers:answers;const a=responses[qid],graded=comparison||kind==='quiz';
    q.options.forEach((text,i)=>{const wrap=E('div'),b=B('',()=>{responses[qid]=i;save();if(teaching)tap('class-select');else if(kind==='quiz'){if(i===q.correct){sound('quiz-correct','tone',{freq:660,dur:.13,gain:.07});sound('quiz-correct','tone',{freq:990,dur:.19,gain:.055,delay:.12});}else sound('quiz-wrong','tone',{freq:300,dur:.16,gain:.055});}else tap('prediction-select');render();});const selected=Number.isInteger(a)&&a===i,expose=!teaching||reveal;b.setAttribute('aria-pressed',String(expose&&selected));
      if(graded&&expose&&selected)b.classList.add(i===q.correct?'correct':'wrong');if(teaching&&reveal&&i===q.correct)b.classList.add('correct');
      b.append(E('span','ABCD'[i],'study-letter'));if(q.graph)b.append(graphIcon(i));b.append(rich(E('span'),tr(text)));if(graded&&expose&&selected)b.append(E('span',i===q.correct?'✓':'✗','study-answer-mark'));if(comparison)b.disabled=true;wrap.append(b);
      if(teaching&&kind==='prediction'){const p=E('div',null,'study-poll'),id=qid+'-'+i;p.append(B(T('舉手 +1','Hands +1'),()=>{polls[id]=(polls[id]||0)+1;render();}),E('output',String(polls[id]||0)),B('−1',()=>{polls[id]=Math.max(0,(polls[id]||0)-1);render();}));wrap.append(p);}opts.append(wrap);
    });div.append(opts);
    if(graded&&(!teaching&&Number.isInteger(a)||teaching&&reveal))div.append(feedback(q,teaching?q.correct:a));
    if(teaching){div.append(B(reveal?T('藏起答案','Hide answer'):T('公布答案','Reveal answer'),()=>{reveal=!reveal;render();}));if(reveal&&!graded)div.append(feedback(q,q.correct));}
    return div;
  }
  function predictionSummary(){const box=E('div',null,'study-prediction-summary');box.append(E('h3',T('先把你的想法放在這裡','Keep your ideas here')));['p1','p2'].forEach((id,i)=>{const q=unit.questions[id],a=(teaching?classAnswers:answers)[id],entry=E('section');entry.append(E('h4',T('預測 ','Prediction ')+(i+1)));const choice=E('div');if(Number.isInteger(a)){if(q.graph)choice.append(graphIcon(a));choice.append(rich(E('p'),T('你選：','You chose: ')+'ABCD'[a]+' · '+tr(q.options[a])));}else choice.append(E('p',T('這題先跳過','Skipped for now')));entry.append(choice);box.append(entry);});return box;}
  function introView(){const box=E('div',null,'study-photo'),host=E('div',null,'study-3d-host'),cv=E('canvas');photoHost=host;photoCanvas=cv;cv.setAttribute('role','img');cv.setAttribute('aria-label',tr(unit.photo.alt));box.append(host,cv);cv.onclick=()=>next(false);V.attach(host,'crate',drawPhoto);requestAnimationFrame(drawPhoto);return box;}
  function drawPhoto(){const cv=photoCanvas;if(!cv?.isConnected)return;const w=cv.clientWidth,h=cv.clientHeight,dpr=Math.min(2,devicePixelRatio||1);if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);const rendered=V.paint({w,h,step:index});
    if(!rendered)crate2d(c,w,h);D.pill(c,T('水平地板 · 原本靜止','Level floor · initially at rest'),12,35,D.c.text,'left',font(w>=760?19:16));
    if(index){const sx=w*.3+Math.min(72,w*.19),sy=h*.49;D.arrow(c,sx,sy,sx+Math.min(w*.25,index===1?75:105),sy,D.c.pos,3);D.pill(c,'F',sx+45,sy-15,D.c.pos,'center',font(w>=760?28:22));}
    D.pill(c,T('示意圖：繩子水平拉，木箱沒有滑','Illustration: horizontal pull, no slip'),w/2,h-18,D.c.muted,'center',font(w>=760?19:15));
  }
  function crate2d(c,w,h){D.backdrop(c,w,h);const sc=Math.min((w-25)/390,(h-100)/300),x=w*.12,y=h*.7;c.save();c.translate(x,y);c.scale(sc,sc);D.contactShadow(c,89,0,118,0);D.block(c,-35,0,430,14,col('--study-table'),{r:5,shadow:false});
    const front=col('--study-wood'),edge=col('--study-edge');for(let i=0;i<9;i++){const bh=115+(i*13%35);D.block(c,13+i*16,-bh,14,bh-15,[D.c.pos,D.c.field,D.c.accent,col('--study-book')][i%4],{r:2,shadow:false});c.strokeStyle=D.alpha(D.c.text,.23);for(const y of [-bh+12,-32]){c.beginPath();c.moveTo(16+i*16,y);c.lineTo(24+i*16,y);c.stroke();}}
    c.fillStyle=edge;c.beginPath();c.moveTo(172,-101);c.lineTo(197,-121);c.lineTo(197,-20);c.lineTo(172,0);c.fill();for(let j=0;j<4;j++)P.block(c,0,-105+j*27,173,22);for(const dx of [9,150])D.block(c,dx,-105,12,107,edge,{r:2,shadow:false});
    c.strokeStyle=col('--study-rope');c.lineWidth=4;c.beginPath();c.moveTo(176,-57);c.lineTo(248,-57);c.stroke();P.hand(c,248,-57,1,.77);c.restore();}
  function sceneView(interactive){const box=E('div',null,'study-scene'),visual=E('div',null,'study-visual');visualHost=E('div',null,'study-3d-host');canvas=E('canvas');ctx=canvas.getContext('2d');canvas.tabIndex=interactive?0:-1;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',T('水平桌面木塊、可伸長的彈簧與摩擦力對拉力圖','Block on a level table, stretching spring, and friction versus pull graph'));canvas.classList.toggle('is-interactive',interactive);visual.append(visualHost,canvas);box.append(visual);if(unit.sections[section].kind==='compare'&&index===1)visualHost.hidden=true;else V.attach(visualHost,'apparatus',draw);
    if(interactive){const tools=E('div',null,'study-experiment-tools');tools.append(B(T('慢慢加力','Add force gently'),e=>{experiment.ramp=!experiment.ramp;experiment.interacted=true;tools.firstChild.textContent=experiment.ramp?T('停止加力','Stop adding force'):T('慢慢加力','Add force gently');kick();}),B(T('最大值歸零','Reset peak'),()=>{tap();experiment.peak=0;draw();}),B(T('跟著做','Follow steps'),()=>LabPanel.open('steps')));box.append(tools);
      const range=E('input');range.type='range';range.min='-50';range.max='50';range.step='.1';range.value=experiment.F;range.id='study-force-accessible';range.className='study-sr';range.setAttribute('aria-label',T('水平拉力','Horizontal pull'));range.oninput=()=>setForce(+range.value);box.append(range);canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);canvas.onpointerleave=()=>{if(!drag){hover=false;draw();}};
    }else canvas.onclick=()=>next(false);requestAnimationFrame(()=>{resize();kick();});return box;}
  function compareView(){if(!index)return question('p1',true);scene=experiment?.trace.length>1?experiment:target(7);scene.standardResult=!(experiment?.trace.length>1);const box=sceneView(false);const a=(teaching?classAnswers:answers).p2;if(Number.isInteger(a))box.append(feedback(unit.questions.p2,a));else box.append(E('p',T('還沒選預測？可以先看標準結果，再回去想想。','No prediction yet? Examine the standard result, then revisit your guess.'),'study-compare-note'));return box;}
  function exampleView(){const box=E('div',null,'study-example-view'),iframe=E('iframe',null,'study-iframe');iframe.title=T('範例的斜面實驗','Incline experiment for this example');iframe.src='incline-friction.html?embed=1&ex='+examplesIndex+'&lang='+LabSettings.lang;const data=window.LAB_EXAMPLE_DATA['incline-friction'];
    iframe.onload=()=>{if(!iframe.isConnected)return;const child=iframe.contentWindow;child.LabPanel?.close();child.addEventListener('lab:examplechange',e=>{examplesIndex=e.detail.n;LabPanel.showExample(data[examplesIndex-1]);exampleCaption();layout();});child.addEventListener('lab:experimentstate',e=>LabSteps.feed(e.detail));LabPanel.open('examples');layout();};box.append(iframe);return box;}
  function exampleCaption(){caption(examplesIndex===3?T('換到[[直立牆面]]，同樣先看有沒有滑。','At a [[vertical wall]], first check for slipping.'):tr(unit.sections[5].steps[0].cap));}
  function summaryView(){const box=E('div',null,'study-summary');unit.shortBoard.forEach((pair,i)=>{const card=E('section',null,'study-summary-card '+(i<=index?'lit':'upcoming'));card.append(E('span',['01','02','03'][i],'study-card-num'),E('h3',tr([['未滑動','At rest'],['恰滑動','At the threshold'],['已滑動','Sliding']][i])),rich(E('p'),tr(pair).replace(/^[^：:]+[：:]\s*/,'')));const cv=E('canvas');cv.setAttribute('aria-hidden','true');card.append(cv);requestAnimationFrame(()=>drawSummaryIcon(cv,i));box.append(card);});
    if(index===3){const next=E('div',null,'study-next-unit');next.append(E('p',T('下一單元：最大靜摩擦力有多大？','Next: How big is the static limit?')));const row=E('div',null,'study-stars');row.setAttribute('aria-label',T('已得星星 ','Stars earned: ')+stars.filter(Boolean).length+'/8');let chime=0;stars.forEach((on,i)=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');if(on)svg.classList.add('earned');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d','M12 1.5 15.2 8l7.2 1-5.2 5 1.2 7.2L12 17.8l-6.4 3.4L6.8 14 1.6 9l7.2-1Z');svg.append(p);row.append(svg);if(on&&!voicedStars.has(i)){voicedStars.add(i);sound('star','tone',{freq:660+i*66,dur:.16,gain:.035,delay:chime++*.15});}});next.append(row);box.append(next);}return box;}
  function drawSummaryIcon(cv,i){if(!cv.isConnected)return;const w=cv.clientWidth,h=cv.clientHeight,dpr=Math.min(2,devicePixelRatio||1);cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);const wide=innerWidth>=1240,x=wide?w*.5:w*.43,y=h*(wide?.68:.56),bw=wide?76:36,bh=wide?52:28;D.block(c,8,y,w-16,7,col('--study-table'),{r:2,shadow:false});P.block(c,x-bw/2,y-bh,bw,bh);const length=wide?[46,66,76][i]:[18,24,29][i];D.arrow(c,x+bw/2,y-bh*.65,x+bw/2+length,y-bh*.65,D.c.pos,3);D.arrow(c,x,y-2,x-(i===2?length*.65:length),y-2,col('--fric'),3);P.subscript(c,'f',i===2?'k':'s',x-length*.5,y+19,wide?20:16,col('--fric'),'center');}
  function render(){cancelAnimationFrame(frame);frame=0;lastTime=0;stopVoice();V.detach();canvas=ctx=photoCanvas=photoHost=visualHost=null;drag=null;geometry=null;currentQuestion=null;sceneElapsed=0;captionText='';const s=unit.sections[section],st=s.steps[index];document.body.dataset.studyKind=s.kind;visits.add(section+'-'+index);progress();
    $('study-kicker').textContent=(section+1)+'/8';$('study-heading').textContent=tr(s.title);$('study-count').textContent=T('第 ','Step ')+(index+1)+'/'+s.steps.length;const hidden=teaching&&!reveal&&['prediction','quiz'].includes(s.kind);caption(hidden?T('[[先讓大家選]]，再按「公布答案」。','[[Let everyone choose]], then press “Reveal answer”.'):tr(st.cap));$('study-footnote').textContent=teaching?T('方向鍵翻頁 · A 公布答案 · P 說明','Arrows: navigate · A: reveal · P: help'):T('按下一步，慢慢看；隨時能回上一步。','One step at a time. You can always go back.');
    LabPanel.setTab('concept');let view;LabSteps.setActive(s.kind==='experiment');if(s.kind==='photo')view=introView();else if(s.kind==='prediction')view=st.question?question(st.question):predictionSummary();else if(s.kind==='scene'){scene=target(index);view=sceneView(false);}else if(s.kind==='experiment'){if(!experiment)experiment=fresh();scene=experiment;view=sceneView(true);if(!guideDefined){LabSteps.define(unit.experimentSteps);guideDefined=true;}}else if(s.kind==='compare')view=compareView();else if(s.kind==='examples')view=exampleView();else if(s.kind==='quiz')view=question(st.question);else view=summaryView();
    $('study-stage').replaceChildren(view);panel(st);if(s.kind==='examples'){LabPanel.showExample(window.LAB_EXAMPLE_DATA['incline-friction'][examplesIndex-1]);exampleCaption();}
    $('study-prev').disabled=!section&&!index;$('study-next').disabled=!canAdvance();$('study-skip').hidden=canAdvance();$('study-next').textContent=section===7&&index===3?T('完成 ✓','Finish ✓'):T('下一步 ▶','Next ▶');
    LabPanel.math($('study-main'));requestAnimationFrame(layout);if(s.kind==='prediction'&&!st.question)sound('prediction-lock','tone',{freq:430,dur:.065,gain:.055,type:'triangle'});if(s.kind==='photo'&&index){sound('crate-strain','sweep',{from:380,to:510,dur:.25,gain:.035,type:'triangle'});sound('crate-thump','noise',{dur:.09,filter:380,q:.8,gain:.07,delay:.15});}if(s.kind==='scene'){const k=forces(scene);forceSound(scene.F,k.kind);if(k.kind==='kinetic')kick();}
  }
  function isCovered(){return document.hidden||innerWidth<1240&&LabPanel.state==='full';}
  function layout(){const top=$('study-stage').getBoundingClientRect().top+scrollY,footer=document.querySelector('.study-controls'),cap=$('study-caption').getBoundingClientRect().height,foot=$('study-footnote').getBoundingClientRect().height,tools=document.querySelector('.study-experiment-tools'),fb=document.querySelector('.study-scene>.study-feedback'),mobile=innerWidth<760;
    const available=innerHeight-top-cap-foot-footer.getBoundingClientRect().height-(mobile?56:0)-(tools?tools.getBoundingClientRect().height:0)-(fb?fb.getBoundingClientRect().height:0)-34;
    const h=Math.max(mobile?290:370,Math.min(mobile?438:490,available));document.body.style.setProperty('--study-canvas-h',Math.round(h)+'px');document.body.style.setProperty('--study-nav',footer.getBoundingClientRect().height+'px');resize();drawPhoto();const limit=innerHeight-footer.getBoundingClientRect().height-(mobile?56:0);document.body.classList.toggle('study-scroll',$('study-footnote').getBoundingClientRect().bottom+scrollY>limit);
  }
  function resize(){if(!canvas)return;const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function txtOn(c,text,x,y,n,color,align){c.save();D.haloText(c,text,x,y,color||D.c.text,align||'center','middle',font(n,700));c.restore();}
  function pill(text,x,y,n,color,align){return D.pill(ctx,text,x,y,color||D.c.text,align||'center',font(n,700));}
  function mathPill(base,sub,text,x,y,size,color,align,prefix){ctx.save();ctx.font=font(size,700,true);const a=ctx.measureText(base).width;ctx.font=font(size*.68,600);const b=ctx.measureText(sub).width;ctx.font=font(size,700);const pre=ctx.measureText(prefix||'').width,c=ctx.measureText(text||'').width,w=pre+a+b+c+16,s=size*fs();let left=x-w/2;if(align==='left')left=x;if(align==='right')left=x-w;D.roundRect(ctx,left,y-s-5,w,s*1.5+7,7);ctx.fillStyle=D.alpha(D.c['canvas-bg'],.94);ctx.fill();ctx.strokeStyle=D.alpha(color,.25);ctx.lineWidth=1;ctx.stroke();P.subscript(ctx,base,sub,left+7+pre,y,size,color);ctx.font=font(size,700);ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='alphabetic';if(prefix)ctx.fillText(prefix,left+7,y);ctx.fillText(text,left+8+pre+a+b,y);ctx.restore();return {x:left,y:y-s-5,w,h:s*1.5+7};}
  function accelPill(value,x,y){const text='a = '+value+' m/s ';const b=pill(text,x,y,20,col('--fric'));ctx.save();ctx.font=font(13,700);ctx.fillStyle=col('--fric');ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText('2',b.x+b.w-11,b.y+9);ctx.restore();}
  function updateLiveCaption(){
    if(unit.sections[section].kind==='experiment'&&scene.interacted){const k=forces(scene);let motion=T('靜止','at rest');if(k.kind==='kinetic'){if(Math.abs(k.a)<1e-10)motion=T('等速','constant speed');else if(k.a*scene.motion.v>=0)motion=k.a<0?T('向右加速','accelerating right'):T('向左加速','accelerating left');else motion=scene.motion.v<0?T('向右滑、減速','sliding right, slowing down'):T('向左滑、減速','sliding left, slowing down');}caption(T('拉力 ','Pull ')+Math.abs(scene.F).toFixed(1)+' N · '+T('[[摩擦力 ','[[Friction ')+Math.abs(k.f).toFixed(1)+' N]] · '+motion);}
  }
  function draw(){if(!canvas?.isConnected||!scene)return;updateLiveCaption();if(isCovered())return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;ctx.clearRect(0,0,w,h);const desktop=w>=740,split=desktop?Math.round(w*.56):w,appH=desktop?h:Math.round(h*.53),ar={x:0,y:0,w:split,h:appH,desktop},gr={x:desktop?split:0,y:desktop?0:appH,w:desktop?w-split:w,h:desktop?h:h-appH,desktop};geometry={};if(unit.sections[section].kind==='compare'&&index===1)drawGraph({x:0,y:0,w,h,desktop});else{drawApp(ar);drawGraph(gr);}
    const range=$('study-force-accessible');if(range){range.value=scene.F;range.setAttribute('aria-valuetext',`F ${scene.F.toFixed(1)} N; ${forces(scene).kind==='static'?'f_s':'f_k'} ${Math.abs(forces(scene).f).toFixed(1)} N`);}
  }
  function drawApp(r){const k=forces(scene),dir=scene.left?-1:1,base=r.desktop?Math.max(162,r.w*.27):112,center=scene.left?r.w-base:base,table=r.desktop?r.h*.50:r.h*.67,model=V.paint({w:r.w,h:r.h,F:scene.F,motionX:scene.motion.x,left:scene.left,center,table,hover}),g=model||fallbackApp(r,center,table),n=teaching?30:r.desktop?22:18,sm=teaching?20:r.desktop?18:14,forceScale=r.desktop?3:2;
    geometry.apparatus={...g,x:0,y:0,w:r.w,h:r.h};const contact=g.contact,hook=g.hook,ring=g.ring,cy=g.center;if(hover||drag){ctx.save();ctx.fillStyle=D.alpha(D.c.accent,.16);ctx.beginPath();ctx.arc(ring.x,ring.y,25,0,Math.PI*2);ctx.fill();ctx.restore();}
    const readX=Math.min(r.w-82,Math.max(82,(hook.x+ring.x)/2)),fy=hook.y-(r.desktop?54:44),forceEnd=hook.x+scene.F*forceScale,fricEnd=contact.x-k.f*forceScale;
    if(scene.F){D.arrow(ctx,hook.x,fy,forceEnd,fy,D.c.pos,3);mathPill('F','',' = '+Math.abs(scene.F).toFixed(1)+' N',hook.x+dir*3,fy-18,teaching?32:r.desktop?22:20,D.c.pos,scene.left?'right':'left');}
    if(k.f){D.arrow(ctx,contact.x,contact.y-2,fricEnd,contact.y-2,col('--fric'),3);mathPill('f',k.kind==='static'?'s':'k',' = '+Math.abs(k.f).toFixed(1)+' N',Math.max(76,Math.min(r.w-76,contact.x-k.f*forceScale/2)),contact.y+Math.max(24,n*fs()+12),n,col('--fric'));}
    else mathPill('f','s',' = 0 N',contact.x,contact.y+Math.max(24,n*fs()+12),n,col('--fric'));
    if(k.kind==='static'&&scene.F){const ty=g.top.y-18;D.arrow(ctx,cy.x,ty,cy.x+dir*33,ty,D.c.muted,1.8,{dash:[4,4]});pill(dir>0?T('趨勢向右','Tendency: right'):T('趨勢向左','Tendency: left'),cy.x,g.top.y+14,sm,D.c.muted);}
    if(scene.showValues){if(!scene.F)pill('F = 0.0 N',readX,hook.y-18,teaching?32:r.desktop?22:20,D.c.pos);pill(T('最大讀數 ','Peak ')+scene.peak.toFixed(1)+' N',hook.x+dir*16*fs(),hook.y+45*fs(),sm,col('--study-peak'),scene.left?'right':'left');}
    txtOn(ctx,'5 kg',cy.x,cy.y+4,r.desktop?22:16,D.c.text);
    const net=Math.abs(k.net),state=k.kind==='static'?T('靜止 · 合力 0','Rest · net force 0'):net<1e-10?T('合力 0 · 等速','Net force 0 · constant speed'):T('合力 ','Net ')+net.toFixed(1)+T(k.net<0?' N 向右':' N 向左',k.net<0?' N right':' N left');
    if(r.desktop){pill(k.kind==='static'?T('靜止','At rest'):T('滑動中','Sliding'),12,30,sm,D.c.accent,'left');D.block(ctx,14,r.h-101,r.w-28,89,D.c.surface,{r:12,shadow:false});txtOn(ctx,state,r.w/2,r.h-72,teaching?24:22,k.kind==='static'?D.c.accent:col('--fric'));if(k.kind==='kinetic')accelPill(Math.abs(k.a).toFixed(2),r.w/2,r.h-22);else mathPill('f','s',' = F',r.w/2,r.h-29,teaching?24:20,D.c.accent);}
    else pill(state,12,30,sm,k.kind==='static'?D.c.accent:col('--fric'),'left');
    pill(T('箭頭長度 ∝ 力','Arrow length ∝ force'),r.w-12,30,r.desktop?16:14,D.c.muted,'right');
    geometry.ring=ring;geometry.hand={x:ring.x+dir*20,y:ring.y};geometry.graph=geometry.graph||{};geometry.contact=contact;geometry.block={x:cy.x-.09*g.ppm,y:g.top.y,w:.18*g.ppm,h:.14*g.ppm};geometry.forceArrow={x0:hook.x,x1:forceEnd,y:fy,length:Math.abs(scene.F*forceScale)};geometry.fArrow={x0:contact.x,x1:fricEnd,y:contact.y-2,length:Math.abs(k.f*forceScale)};geometry.scale=forceScale;geometry.spring={length:.16+Math.abs(scene.F)/500,extension:Math.abs(scene.F)/500,turns:10,ppm:g.ppm,zeroRing:g.zeroRing,pxPerN:g.pxPerN};
  }
  function fallbackApp(r,cx,table){D.backdrop(ctx,r.w,r.h);const ppm=Math.min(1000,(r.w-24)/.80),dir=scene.left?-1:1,physical=-scene.motion.x,dx=Math.max(-.03,Math.min(.03,physical))*ppm,bw=.18*ppm,bh=.14*ppm,center=cx+dx,hook={x:center+dir*bw/2,y:table-bh*.52},len=(.16+Math.abs(scene.F)/500)*ppm,ring={x:hook.x+dir*(len+.008*ppm),y:hook.y};
    D.block(ctx,4,table,r.w-8,12,col('--study-table'),{r:3,shadow:false});D.block(ctx,4,table+12,r.w-8,10,col('--study-edge'),{r:2,shadow:false});if(r.desktop){D.block(ctx,23,table+22,17,45,col('--study-edge'),{r:2,shadow:false});D.block(ctx,r.w-42,table+22,17,45,col('--study-edge'),{r:2,shadow:false});}P.block(ctx,center-bw/2,table-bh,bw,bh);P.spring(ctx,hook.x,hook.y,ring.x-dir*7,ring.y,{r:6*(1-Math.abs(scene.F)/500)});P.hand(ctx,ring.x,ring.y,dir,ppm*.00115);
    return {ppm,mode:'2d',contact:{x:center,y:table},center:{x:center,y:table-bh*.5},top:{x:center,y:table-bh},hook,ring,zeroRing:{x:hook.x+dir*.168*ppm,y:hook.y},pxPerN:ppm/500,modelWidth:(.18+.16+Math.abs(scene.F)/500+.173)*ppm};}
  function drawGraph(r){ctx.save();ctx.translate(r.x,r.y);D.backdrop(ctx,r.w,r.h);const desktop=r.desktop,n=teaching?20:desktop?20:13,sm=teaching?20:desktop?18:14,kind=unit.sections[section].kind,max=C.components(params(0,scene.material)),k=forces(scene),reached=(kind==='scene'&&index>=4)||kind==='compare'||scene.trace.some(t=>t.kind==='kinetic'),both=reached&&(k.kind==='kinetic'||kind==='compare'||scene.trace.some(t=>t.kind==='kinetic')),compact=!desktop&&both&&kind!=='compare',margin=desktop?52:39,py0=desktop?83:kind==='compare'?82:compact?28:38,p={x:margin,y:py0,w:r.w-margin-20,h:r.h-py0-(compact?100:55)},top=Math.max(30,Math.ceil(max.fsMax/10)*10),px=F=>p.x+F/50*p.w,py=f=>p.y+p.h-f/top*p.h;
    D.block(ctx,7,7,r.w-14,r.h-14,D.c.surface,{r:12,shadow:false});ctx.strokeStyle=D.alpha(D.c.muted,.15);ctx.lineWidth=1;for(let F=0;F<=50;F+=10){ctx.beginPath();ctx.moveTo(px(F),p.y);ctx.lineTo(px(F),p.y+p.h);ctx.stroke();txtOn(ctx,String(F),px(F),p.y+p.h+15,n,D.c.muted);}for(let f=0;f<=top;f+=10){ctx.beginPath();ctx.moveTo(p.x,py(f));ctx.lineTo(p.x+p.w,py(f));ctx.stroke();txtOn(ctx,String(f),p.x-12,py(f),n,D.c.muted,'right');}
    txtOn(ctx,'f (N)',14,compact?15:22,n,D.c.text,'left');txtOn(ctx,'F (N)',r.w-14,compact?15:r.h-11,n,D.c.text,'right');
    if((kind==='scene'&&index>=3)||kind==='experiment'||kind==='compare'){ctx.strokeStyle=D.alpha(D.c.muted,.6);ctx.lineWidth=1.5;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(px(0),py(0));ctx.lineTo(px(Math.min(top,50)),py(Math.min(top,50)));ctx.stroke();ctx.setLineDash([]);P.subscript(ctx,'f','s',px(10),py(10)-8,sm,D.c.muted);txtOn(ctx,'= F',px(10)+25,py(10)-12,sm,D.c.muted,'left');}
    if(kind==='compare'&&Number.isInteger((teaching?classAnswers:answers).p2)){const paths=[[[0,15],[50,15]],[[0,0],[Math.min(50,top),Math.min(50,top)]],[[0,0],[24.5,24.5],[24.5,19.6],[50,19.6]]];ctx.strokeStyle=col('--study-predict');ctx.lineWidth=9;ctx.beginPath();paths[(teaching?classAnswers:answers).p2].forEach(([F,f],i)=>i?ctx.lineTo(px(F),py(f)):ctx.moveTo(px(F),py(f)));ctx.stroke();}
    let prev;for(const pt of scene.trace){if(pt.f>top){prev=null;continue;}if(prev&&(prev.kind===pt.kind||pt.kind==='kinetic'&&Math.abs(prev.F-pt.F)<1.1)){ctx.strokeStyle=pt.kind==='static'?D.c.accent:col('--fric');ctx.lineWidth=3;ctx.setLineDash(pt.kind==='kinetic'?[7,4]:[]);ctx.beginPath();ctx.moveTo(px(prev.F),py(prev.f));ctx.lineTo(px(pt.F),py(pt.f));ctx.stroke();}prev=pt;}ctx.setLineDash([]);
    const current={x:px(Math.abs(scene.F))+r.x,y:py(Math.abs(k.f))+r.y};ctx.beginPath();ctx.arc(current.x-r.x,current.y-r.y,hover?7:6,0,Math.PI*2);ctx.fillStyle=k.kind==='static'?D.c.accent:col('--fric');ctx.fill();ctx.strokeStyle=D.c.surface;ctx.lineWidth=2;ctx.stroke();
    if(reached){mathPill('f','s,max',' = '+max.fsMax.toFixed(1)+' N',r.w-14,compact?r.h-40:desktop?33:21,sm,D.c.accent,'right',T('最大靜摩擦力 ','Static limit '));if(both)mathPill('f','k',' = '+max.fk.toFixed(1)+' N',r.w-14,compact?r.h-11:desktop?65:50,sm,col('--fric'),'right',T('動摩擦力 ','Kinetic friction '));}
    if(kind==='compare')txtOn(ctx,scene.standardResult?T('標準結果／灰帶：預測','Standard / grey: prediction'):T('實驗結果／灰帶：預測','Data / grey: prediction'),14,r.h-12,sm,D.c.text,'left');
    geometry.graph={x:r.x+p.x,y:r.y+p.y,w:p.w,h:p.h,point:current,standard:!!scene.standardResult};ctx.restore();}
  function setForce(F){if(!experiment)return;experiment.interacted=true;experiment.F=Math.max(-50,Math.min(50,Math.round(F*10)/10));experiment.left=experiment.F<0||experiment.F===0&&experiment.left;const side=document.querySelector('[data-study-side]');if(side)side.checked=experiment.left;experiment.peak=Math.max(experiment.peak,Math.abs(experiment.F));point(experiment);const k=forces(experiment);forceSound(experiment.F,k.kind);draw();kick();}
  function local(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function pointerDown(e){if(!geometry)return;const p=local(e),g=geometry.graph,ring=geometry.ring;const onRing=Math.hypot(p.x-ring.x,p.y-ring.y)<42||Math.hypot(p.x-geometry.hand.x,p.y-geometry.hand.y)<38,onGraph=Math.hypot(p.x-g.point.x,p.y-g.point.y)<28;if(!onRing&&!onGraph)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);drag={kind:onGraph?'graph':'ring',offset:p.x-ring.x,target:p.x};hover=true;experiment.ramp=false;}
  function pointerMove(e){const p=local(e);if(!drag){const next=geometry&&Math.hypot(p.x-geometry.ring.x,p.y-geometry.ring.y)<38;if(hover!==next){hover=next;draw();}return;}drag.target=p.x;applyDrag();}
  function applyDrag(){if(!drag||!geometry)return;const sign=experiment.left?-1:1,g=geometry.graph,s=geometry.spring;const value=drag.kind==='graph'?(drag.target-g.x)/g.w*50:(drag.target-drag.offset-s.zeroRing.x)/(s.pxPerN)*sign;setForce(sign*Math.max(0,Math.min(50,value)));}
  function pointerUp(){if(!drag)return;drag=null;experiment.ramp=false;stopVoice();setForce(0);}
  function kick(){if(!frame&&!document.hidden&&(unit.sections[section].kind==='experiment'||unit.sections[section].kind==='scene'&&index>=5&&sceneElapsed<.7))frame=requestAnimationFrame(tick);}
  function tick(time){frame=0;if(document.hidden||!canvas)return;const dt=lastTime?Math.min((time-lastTime)/1000,1/30):1/60;lastTime=time;const kind=unit.sections[section].kind;
    if(kind==='experiment'){if(experiment.ramp){experiment.F=Math.min(50,Math.abs(experiment.F)+2*dt)*(experiment.left?-1:1);experiment.peak=Math.max(experiment.peak,Math.abs(experiment.F));forceSound(experiment.F,forces(experiment).kind);}const result=C.step(params(experiment.F,experiment.material),experiment.motion,dt);experiment.motion=result.s;for(const e of result.ev){LabSteps.feed(snapshot(experiment,e.type));if(e.type==='slip'&&previousKind!=='kinetic')forceSound(experiment.F,'kinetic');}LabSteps.feed(snapshot(experiment));point(experiment);draw();if(drag?.kind==='ring')applyDrag();slidingSound(experiment);if(experiment.motion.v||experiment.ramp)kick();else lastTime=0;
    }else if(kind==='scene'&&index>=5){const result=C.step(params(scene.F),scene.motion,dt);scene.motion=result.s;sceneElapsed+=dt;draw();slidingSound(scene);if(sceneElapsed<.7)kick();else lastTime=0;}
  }
  function setupClassControl(){const b=$('study-class'),settings=$('lab-settings');if(!settings)return;if(innerWidth<760){if(b.parentElement!==settings)settings.prepend(b);}else if(!b.closest('.study-top'))document.querySelector('.study-top').append(b);}
  function classMode(on){teaching=on;document.documentElement.classList.toggle('lab-projector',on);$('study-class').setAttribute('aria-pressed',String(on));reveal=false;if(on)LabPanel.close();render();dispatchEvent(new Event('lab:themechange'));}
  function keydown(e){if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea,.lab-set-panel'))return;if(!teaching&&unit.sections[section].kind==='experiment'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setForce(experiment.F+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?5:.5));return;}if(!teaching)return;const k=e.key.toLowerCase();if(/^[1-8]$/.test(k)){e.preventDefault();go(+k-1,0);}else if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();next(false);}else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();prev();}else if(k==='a'){e.preventDefault();reveal=!reveal;render();}else if(k==='p'){e.preventDefault();LabPanel.state==='collapsed'?LabPanel.open():LabPanel.close();}else if(k==='r'){e.preventDefault();render();}else if(k==='home'){e.preventDefault();go(0,0);}else if(k==='end'){e.preventDefault();go(7,3);}else if(k==='f'){e.preventDefault();if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});}}
  function mount(data){unit=data;key='study:'+unit.id+':v2';teaching=document.documentElement.classList.contains('lab-projector');if(!teaching)read();hash();
    LabPanel.mount({onMissions:()=>{save();try{sessionStorage.setItem('ms-on:incline-friction','1');}catch(e){}location.href='incline-friction.html?ex='+examplesIndex;},onChange:()=>{if(LabPanel.state==='full'&&innerWidth<1240)stopVoice();requestAnimationFrame(()=>{layout();kick();});}});
    document.addEventListener('pointerdown',()=>{armed=true;},{capture:true,passive:true});document.addEventListener('keydown',()=>{armed=true;},{capture:true});
    const sync=()=>{$('study-sound').textContent=LabSettings.get('sound')?'🔊':'🔇';$('study-sound').setAttribute('aria-pressed',String(LabSettings.get('sound')));$('study-sound').setAttribute('aria-label',T('音效：','Sound: ')+(LabSettings.get('sound')?T('開','on'):T('關','off')));};sync();$('study-sound').onclick=()=>LabSettings.set('sound',!LabSettings.get('sound'));
    addEventListener('lab:settingschange',e=>{if(e.detail?.name==='sound'){sync();if(!e.detail.value)stopVoice();}});
    $('study-prev').onclick=prev;$('study-next').onclick=()=>next(false);$('study-skip').onclick=()=>next(true);$('study-replay').onclick=()=>{tap();voicedStars.clear();if(unit.sections[section].kind==='experiment'){experiment=fresh();LabSteps.define(unit.experimentSteps);}render();};$('study-class').onclick=()=>classMode(!teaching);document.addEventListener('keydown',keydown);
    addEventListener('study:visualready',()=>{draw();drawPhoto();});addEventListener('resize',()=>{setupClassControl();layout();progress();});addEventListener('lab:themechange',()=>{captionText='';render();});addEventListener('hashchange',()=>{if(hash()){reveal=false;render();save();}});document.addEventListener('visibilitychange',()=>{lastTime=0;if(document.hidden){cancelAnimationFrame(frame);frame=0;stopVoice();}else{draw();drawPhoto();kick();}});
    addEventListener('lab:stepcomplete',e=>{sound('step-complete','tone',{freq:880,dur:.16,gain:.06});if(e.detail.index===e.detail.total-1){[660,825,990,1320].forEach((freq,i)=>sound('guide-complete','tone',{freq,dur:.18,gain:.05,delay:i*.11}));mark();}});
    addEventListener('lab:solutionstep',e=>{if(unit.sections[section].kind==='examples')document.querySelector('.study-iframe')?.contentWindow?.LabExamples?.solution(e.detail.n,e.detail.line);});
    new MutationObserver(()=>{const on=document.documentElement.classList.contains('lab-projector');if(on!==teaching)classMode(on);}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupClassControl);else setupClassControl();render();}
  window.Study={mount,go,next:()=>next(false),replay:()=>{voicedStars.clear();render();},classMode,get state(){return {section:section+1,step:index+1,stars:stars.slice(),answers:{...answers},teaching};},get scene(){return scene;},get geometry(){return geometry;},get visits(){return [...visits];},get audioLog(){return audioLog.slice();},get rendering(){return {raf:!!frame,three:V.stats};}};
})();

/* 融入既有實驗的八段入口；原摩擦力樣品的 Study.mount 與場景保持原樣。 */
(function () {
  'use strict';
  const T=(a,b)=>LabSettings.t(a,b);
  function cue(kind) {
    if (!window.LabSound?.enabled() || document.hidden) return;
    const tones=kind==='correct'?[660,990]:kind==='star'?[660,825,990,1320]:kind==='wrong'?[300]:[530];
    tones.forEach((freq,i)=>LabSound.tone({freq,dur:kind==='page'?.045:.16,gain:kind==='page'?.025:.055,delay:i*.11}));
    dispatchEvent(new CustomEvent('study:sound',{detail:{event:kind,frequencies:tones}}));
  }
  function embed(options) {
    let section=0,step=0,active=false,teaching=false,reveal=false;
    function paint(){options.render({section:section+1,step:step+1,active,teaching,reveal});}
    function go(n,k,reset) {
      const old=section;section=Math.max(0,Math.min(7,n-1));step=Math.max(0,Math.min(options.sections[section].steps.length-1,(k||1)-1));reveal=false;
      if (old!==section || reset) options.enter(section+1,!!reset);
      options.step?.(section+1,step+1);const u=new URL(location.href);u.searchParams.set('study','1');u.searchParams.set('seg',section+1);u.searchParams.set('step',step+1);history.replaceState(null,'',u);
      cue('page');paint();options.save?.();
    }
    function next() {
      if (!teaching && options.canAdvance?.(section+1,step+1)===false) return;
      if (step===options.sections[section].steps.length-1) {
        if (!teaching && options.finish?.(section+1)===false) { paint();return; }
        if (section<7) go(section+2,1);else paint();
      } else go(section+1,step+2);
    }
    function prev(){if(step)go(section+1,step);else if(section)go(section,options.sections[section-1].steps.length);}
    function classMode(on){options.onClass?.(on);teaching=on;reveal=false;document.documentElement.classList.toggle('lab-projector',on);paint();dispatchEvent(new Event('resize'));}
    const api={start(n,k){active=true;document.documentElement.classList.add('eq-study');options.enter(n||1,true);go(n||1,k||1);LabPanel.close();options.start?.();dispatchEvent(new Event('resize'));},
      close(){if(teaching){options.onClass?.(false);teaching=false;document.documentElement.classList.remove('lab-projector');}active=false;document.documentElement.classList.remove('eq-study');LabPanel.close();options.close?.();const u=new URL(location.href);['study','seg','step'].forEach(k=>u.searchParams.delete(k));history.replaceState(null,'',u);dispatchEvent(new Event('resize'));},
      go,next,prev,reset(){options.enter(section+1,true);go(section+1,1);},classMode,reveal(){reveal=!reveal;paint();},paint,cue,
      emit(act,seg,data){if(teaching||window.LabShare?.restoring)return;LabMission.emit('study',Object.assign({module:options.id,seg,act,userAction:true,teaching:false,restoring:false},data||{}));},
      get state(){return {section:section+1,step:step+1,active,teaching,reveal};}};
    document.addEventListener('keydown',e=>{if(!active||!teaching||e.defaultPrevented||e.ctrlKey||e.altKey||e.metaKey||e.target.closest('input,select,textarea,.lab-set-panel'))return;const k=e.key.toLowerCase();if(/^[1-8]$/.test(k)){e.preventDefault();go(+k,1);}else if(['arrowright','pagedown',' '].includes(k)){e.preventDefault();next();}else if(['arrowleft','pageup'].includes(k)){e.preventDefault();prev();}else if(k==='a'){e.preventDefault();api.reveal();}else if(k==='r'){e.preventDefault();api.reset();}});
    return api;
  }
  window.StudyFlow={embed,cue};
})();
