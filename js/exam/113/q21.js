/* 113 學測第 21 題：眼睛與相機的成像（單選 D）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const POW0=P.relaxed,NEAR=0.25,POWN=POW0+1/NEAR;              // 看遠約 58.8 D、看 25 cm 約 62.8 D
  // ── 眼球剖面：o={x,y,R,power,pupil(mm),p(物距 m，Infinity＝遠方),rays,tag}
  function eye(g,o){
    const {x,y,R}=o,lx=x-R*.62,rx=x+R*.93,pw=o.power??POW0,pu=o.pupil??4,thick=clamp((pw-POW0)/4,0,1.3);
    const sc=g.createRadialGradient(x+R*.2,y-R*.3,R*.2,x,y,R);sc.addColorStop(0,'#fbf7f0');sc.addColorStop(1,'#cdbfae');
    g.beginPath();g.arc(x,y,R,0,Math.PI*2);g.fillStyle=sc;g.fill();
    g.beginPath();g.arc(x,y,R*.9,0,Math.PI*2);g.fillStyle='#173f52';g.fill();               // 玻璃體（剖面內部）
    g.beginPath();g.arc(x,y,R*.9,-.95,.95);g.strokeStyle='#e0806e';g.lineWidth=4;g.stroke(); // 視網膜
    box(g,x+R*.86,y-6,R*.5,12,4,'#e8c77a','#b89545',1);                                       // 視神經
    g.beginPath();g.ellipse(x-R*.78,y,R*.28,R*.5,0,Math.PI*.5,Math.PI*1.5);g.fillStyle='#bfe6f455';g.fill();g.strokeStyle='#d9f2fb';g.lineWidth=2;g.stroke(); // 角膜
    const half=R*.42,gap=clamp(pu,1.5,8)/8*half*.9;
    for(const sgn of [-1,1]){g.fillStyle='#7a4b2a';g.fillRect(lx-R*.12,y+sgn*gap-(sgn<0?half-gap:0),5,half-gap);}            // 虹膜（中間留瞳孔）
    for(const sgn of [-1,1])D.ball(g,lx+2,y+sgn*(R*.47),5+thick*1.2,'#e58f8a');                                              // 睫狀肌
    g.beginPath();g.ellipse(lx+4,y,4+thick*7,R*.4,0,0,Math.PI*2);g.fillStyle='#eaf6ffcc';g.fill();g.strokeStyle='#9fd3ea';g.lineWidth=1.5;g.stroke(); // 水晶體
    let res=null;
    if(o.rays!==false){res=rays(g,lx+4,rx,y,pw,o.p??Infinity,gap,o.raysUpto??1,o.objX??x-R*2.4,pu);}
    if(o.tag){label(g,T('角膜','Cornea'),x-R*1.02,y-R*.62,C.faint,13,'center');label(g,T('瞳孔','Pupil'),lx-R*.1,y+R*1.12,C.faint,13,'center');
      label(g,T('水晶體','Lens'),lx+8,y-R*1.04,C.faint,13,'center');label(g,T('視網膜','Retina'),x+R*.72,y-R*.98,'#e0806e',13,'center');}
    return res;
  }
  // 光線：從物點（或平行光）經瞳孔三處進來，會聚到像點；畫到視網膜為止，回傳視網膜上的模糊寬度（px）
  function rays(g,lx,rx,y,power,p,gap,upto,objX,pu=4){
    const im=P.eyeImage(p,power,pu/1000),ix=isFinite(im.q)?lx+(im.q/P.EYE)*(rx-lx):rx+400;
    const hs=[-gap*.85,0,gap*.85];let spread=0;
    g.save();g.globalCompositeOperation='lighter';
    for(const h of hs){
      const sx=isFinite(p)?objX:lx-150,sy=isFinite(p)?y:y+h;
      const a=seg(upto,0,.5),ax=sx+(lx-sx)*a,ay=sy+(y+h-sy)*a;line(g,sx,sy,ax,ay,'#ffe9a6cc',1.8);
      if(upto>.5){const b=seg(upto,.5,1),ex=lx+(rx-lx)*b,ey=y+h+(0-h)*((ex-lx)/(ix-lx));line(g,lx,y+h,ex,ey,'#ffe9a6cc',1.8);if(b>=1)spread=Math.max(spread,Math.abs(ey-y));}
    }
    g.restore();
    // 清不清楚照物理模型（視網膜上的模糊圓 < 15 µm）；光斑照模糊圓放大 4 倍畫，看得出大小
    const r=Math.max(2.5,im.blur/P.EYE*(rx-lx)*4);
    if(upto>=1){g.beginPath();g.arc(rx,y,Math.min(r,30),0,Math.PI*2);g.fillStyle=im.sharp?'#6fe0a8':'#ff8a80aa';g.fill();}
    return {spread,sharp:im.sharp,ix};
  }
  // ── 相機：鏡頭可前後移、光圈、感光元件
  function camera(g,x,y,o={}){
    const w=150,h=96,shift=o.shift??0;
    box(g,x,y-h/2,w,h,12,'#2b3640','#56656f',2);box(g,x+w*.3,y-h/2-12,40,14,4,'#38444e','#56656f',1.5);
    box(g,x-34+shift,y-30,40,60,6,'#3d4a54','#6c7c86',1.5);                     // 鏡筒
    g.beginPath();g.ellipse(x-30+shift,y,5,26,0,0,Math.PI*2);g.fillStyle='#bfe6f4aa';g.fill();g.strokeStyle='#d9f2fb';g.stroke();
    const ap=(o.aperture??.6)*22;for(const s of [-1,1]){g.fillStyle='#11181e';g.fillRect(x-8+shift,y+s*ap-(s<0?30-ap:0),4,30-ap);}
    box(g,x+w-22,y-34,8,68,2,o.iso?'#ffd17e':'#6a5acd',o.iso?'#ffe9a6':'#8f86e0',1.5);               // 感光元件
    if(o.iso)for(let i=0;i<5;i++)line(g,x+w-12,y-30+i*15,x+w-4,y-32+i*15,'#ffd17e',1.5);
    if(o.tag){label(g,T('鏡頭','Lens'),x-30+shift,y+50,C.faint,13,'center');label(g,T('光圈','Aperture'),x+4+shift,y-40,C.faint,13,'center');label(g,T('感光元件','Sensor'),x+w-18,y+56,C.faint,13,'center');}
    if(o.focusX!=null){const lx=x-30+shift,sx=x+w-22,fx=o.focusX;g.save();g.globalCompositeOperation='lighter';
      for(const hh of [-18,0,18]){line(g,lx-60,y+hh,lx,y+hh,'#ffe9a6cc',1.6);const ey=y+hh-hh*(sx-lx)/(fx-lx);line(g,lx,y+hh,sx,ey,'#ffe9a6cc',1.6);}
      g.restore();const sp=Math.abs(18-18*(sx-lx)/(fx-lx));g.beginPath();g.arc(sx,y,Math.max(2.5,sp),0,Math.PI*2);g.fillStyle=sp<1.5?'#6fe0a8':'#ff8a80aa';g.fill();}
  }
  function tree(g,x,y,h,flip=1,alpha=1){g.save();g.globalAlpha=alpha;g.translate(x,y);g.scale(1,flip);
    box(g,-h*.06,-h*.35,h*.12,h*.35,1,'#8a5a32');g.beginPath();g.moveTo(0,-h);g.lineTo(h*.32,-h*.32);g.lineTo(-h*.32,-h*.32);g.closePath();g.fillStyle='#4fbf7a';g.fill();g.restore();}
  // 看到的樣子：模糊用多張錯位疊出來（不依賴 canvas filter），亮度看瞳孔面積
  function view(g,x,y,w,h,blur,bright){
    box(g,x,y,w,h,8,'#0b1d28','#35505f',1.5);g.save();g.beginPath();g.rect(x+1,y+1,w-2,h-2);g.clip();
    const n=blur<.6?1:12,cx=x+w/2,by=y+h*.82;
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2,r=n>1?blur:0;tree(g,cx+Math.cos(a)*r,by+Math.sin(a)*r,h*.62,1,n>1?.16:1);}
    g.fillStyle='rgba(0,0,0,'+clamp(1-bright,0,.85)+')';g.fillRect(x,y,w,h);g.restore();
  }
  const ids=Array.from({length:13},(_,i)=>'Q21_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function shares(g,k,hot){const Q=ExamPaper.questions[21],L='ABCDE';
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*3.4*seg(k,0,.6),col=hot.includes(L[j])?(L[j]==='D'?C.green:C.red):'#5f7480';
      box(g,x,214-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,236,C.white,16,'center');if(k>.4)label(g,v+'%',x+23,206-hh,col,15,'center');});}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:shares(g,k,['E']);label(g,T('E：眼睛只靠縮放瞳孔對焦？','E: the eye focuses only with the pupil?'),440,34,C.red,15,'right');return;
      case 1:{camera(g,74,112,{shift:Math.sin(t*1.4)*8,tag:true,focusX:202});mark(g,130,204,true,10);label(g,T('相機：移鏡頭','Camera: move the lens'),130,236,C.green,14,'center');
        const pu=5+2.5*Math.sin(t*2);eye(g,{x:368,y:112,R:54,power:POW0,pupil:pu,p:NEAR,objX:274});
        if(k>.4){mark(g,360,204,false,10);label(g,T('眼睛：瞳孔不管對焦','Eye: pupil ≠ focus'),360,236,C.red,14,'center');}return;}
      case 2:{const pu=k<.5?2:7;eye(g,{x:150,y:122,R:72,power:POW0,pupil:pu});
        label(g,k<.5?T('大白天：瞳孔縮小','Daytime: pupil shrinks'):T('晚上：瞳孔放大','Night: pupil opens'),330,52,k<.5?C.gold:C.blue,16,'center');
        view(g,280,72,110,90,0,k<.5?.95:.55);label(g,T('變的是亮暗','Brightness changes'),335,190,C.white,15,'center');label(g,T('像的位置不變','The image does not move'),335,214,C.faint,14,'center');return;}
      case 3:{const th=ease(seg(k,.15,.8)),pw=POW0+th*(POWN-POW0);const r=eye(g,{x:250,y:122,R:76,power:pw,pupil:4,p:NEAR,objX:90});
        tree(g,90,122,40);label(g,'25 cm',90,150,C.faint,13,'center');
        label(g,T('睫狀肌收縮 → 水晶體變厚','Ciliary muscle contracts → lens thickens'),230,30,'#e58f8a',15,'center');
        label(g,r&&r.sharp?T('焦距變短，像落在視網膜上','Shorter focal length: image on the retina'):T('焦距改變中…','Changing the focal length…'),230,232,r&&r.sharp?C.green:C.white,15,'center');return;}
      case 4:shares(g,k,['C','E']);label(g,T('C：換感光程度更高的元件？','C: a more sensitive sensor?'),440,34,C.red,15,'right');return;
      case 5:{camera(g,84,120,{iso:true,focusX:194,tag:true});label(g,T('像落在感光元件前面','Image falls in front of the sensor'),300,40,C.white,14,'center');
        view(g,300,70,110,88,6,1);label(g,T('一樣糊','Still blurry'),355,186,C.red,17,'center');if(k>.5)mark(g,355,216,false,12);return;}
      case 6:{const lx=230;for(const h of [-30,0,30]){line(g,60,122+h,lx,122+h,'#ffe9a6',2);line(g,lx,122+h,lx+130,122+h-h*130/100,'#ffe9a6',2);}
        g.beginPath();g.ellipse(lx,122,10,50,0,0,Math.PI*2);g.fillStyle='#bfe6f466';g.fill();g.strokeStyle='#d9f2fb';g.lineWidth=2;g.stroke();
        D.chip(g,40,196,110,T('干涉','Interference'),C.red,false);D.chip(g,170,196,110,T('繞射','Diffraction'),C.red,false);D.chip(g,300,196,120,T('折射','Refraction'),C.green,k>.5);
        if(k>.3){line(g,52,211,138,211,C.red,2);line(g,182,211,268,211,C.red,2);}
        label(g,T('A、B 錯','A and B are wrong'),440,40,C.red,16,'right');return;}
      case 7:{const ex=330,R=70,lx=ex-R*.62,rx=ex+R*.93;eye(g,{x:ex,y:122,R,rays:false,tag:k>.6});tree(g,60,150,70);
        const a=seg(k,.1,.7),top=[60,80],ix=rx,iy=122+(150-80-28)*.42;
        line(g,top[0],top[1],top[0]+(lx+4-top[0])*a,top[1]+(122-top[1])*a,'#ffe9a6',2);
        if(a>=1){line(g,lx+4,122,ix,iy,'#ffe9a6',2);line(g,60,150,ix,150-(150-122)*2,'#ffe9a600',1);tree(g,ix-6,122-10,34,-1);}
        label(g,T('倒立、縮小的實像','Inverted, smaller, real image'),230,232,C.gold,16,'center');return;}
      case 8:{eye(g,{x:90,y:110,R:50,rays:false});tree(g,135,100,26,-1);line(g,150,110,230,110,'#e8c77a',4);
        const bx=290,by=110;g.beginPath();g.ellipse(bx,by,52,40,0,0,Math.PI*2);g.fillStyle='#e8a3b4';g.fill();g.strokeStyle='#c27b8e';g.lineWidth=2;g.stroke();
        for(let j=0;j<6;j++){g.beginPath();g.arc(bx-30+j*12,by-6+(j%2)*10,9,Math.PI,0);g.strokeStyle='#c27b8e';g.stroke();}
        if(k>.4){arrow(g,346,110,380,110,C.white,2,9);view(g,384,70,64,80,0,1);}
        label(g,T('大腦處理訊號 → 認得真正的方向','The brain reads the signal: true orientation'),230,214,C.white,15,'center');return;}
      case 9:label(g,T('答案 D','Answer: D'),230,130,C.green,30,'center');return;
      case 10:{const r=eye(g,{x:250,y:122,R:80,power:POW0,pupil:5,raysUpto:seg(k,0,.7)});label(g,T('放鬆：水晶體扁、焦距長','Relaxed: thin lens, long focal length'),230,30,C.gold,16,'center');
        if(k>.75)label(g,T('平行光剛好聚在視網膜：適合看遠','Parallel light lands on the retina: made for distance'),230,234,C.green,14,'center');return;}
      case 11:{g.fillStyle='#2a4b3a';g.beginPath();g.moveTo(0,190);for(let x=0;x<=460;x+=20)g.lineTo(x,180+Math.sin(x*.05)*8);g.lineTo(460,250);g.lineTo(0,250);g.fill();
        const dx=340-120*seg(k,.6,1);g.fillStyle='#c48a4d';g.beginPath();g.ellipse(dx,160,18,9,0,0,Math.PI*2);g.fill();for(const lx of [-12,-5,6,13])line(g,dx+lx,166,dx+lx,180,'#c48a4d',2.5);
        g.beginPath();g.ellipse(dx-18,150,6,5,0,0,Math.PI*2);g.fill();line(g,dx-20,146,dx-26,132,'#e8d2a6',2);line(g,dx-17,146,dx-14,132,'#e8d2a6',2);
        eye(g,{x:60,y:120,R:36,rays:false});line(g,96,120,dx-24,152,'#ffe9a666',1.5,[5,5]);
        label(g,T('先看清楚遠方，才活得下去','See far first, to survive'),230,40,C.gold,16,'center');return;}
      default:D.chip(g,40,80,170,T('瞳孔','Pupil'),C.gold,true);arrow(g,220,95,250,95,C.white,2,9);D.chip(g,260,80,160,T('亮暗','Brightness'),C.gold,k>.2);
        D.chip(g,40,140,170,T('水晶體','Lens'),C.teal,k>.4);arrow(g,220,155,250,155,C.white,2,9);D.chip(g,260,140,160,T('清楚','Sharpness'),C.teal,k>.6);
    }
  }
  // 能動手：選看遠或看近，調水晶體（睫狀肌）與瞳孔；遠、近都對焦才完成
  function hands(g,s){
    const pw=POW0+s.lens/100*5,p=s.near?NEAR:Infinity,r=eye(g,{x:250,y:118,R:82,power:pw,pupil:s.pupil,p,objX:60,tag:true});
    if(s.near){tree(g,60,118,44);label(g,'25 cm',60,146,C.faint,13,'center');}else label(g,T('遠方 →','From far away →'),20,40,C.faint,14);
    const im=P.eyeImage(p,pw,s.pupil/1000);view(g,362,10,90,70,clamp(im.blur*1e5/1.5,0,12),clamp(s.pupil*s.pupil/30,.25,1));
    label(g,T('看到的樣子','What you see'),407,96,C.faint,12,'center');
    label(g,r.sharp?T('清楚！','Sharp!'):T('模糊','Blurry'),250,236,r.sharp?C.green:C.red,17,'center');
    label(g,T('看遠 ','Far ')+(s.okFar?'✓':'—')+T('　看近 ','　Near ')+(s.okNear?'✓':'—'),20,236,C.white,14);
  }
  ExamScene.add(21,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,near:false,lens:40,pupil:4,okFar:false,okNear:false}),
    paint,
    preview(g){eye(g,{x:130,y:122,R:70,power:POW0,pupil:4,tag:true});camera(g,290,122,{tag:true,focusX:418});
      label(g,T('眼睛','Eye'),130,30,C.gold,16,'center');label(g,T('相機','Camera'),365,30,C.gold,16,'center');},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,toggle,complete}){
      s.hands=true;
      const check=()=>{const r=P.eyeImage(s.near?NEAR:Infinity,POW0+s.lens/100*5,s.pupil/1000);if(r.sharp){if(s.near)s.okNear=true;else s.okFar=true;}if(s.okFar&&s.okNear)complete();};
      toggle('看近（25 cm）','Look near (25 cm)',on=>{s.near=on;check();});
      const L=range(T('睫狀肌：水晶體厚薄','Ciliary muscle: lens thickness'),0,100,40,v=>{s.lens=v;L.val.textContent=(POW0+v/100*5).toFixed(1)+' D';check();});L.val.textContent=(POW0+2).toFixed(1)+' D';
      const U=range(T('瞳孔直徑','Pupil diameter'),2,8,4,v=>{s.pupil=v;U.val.textContent=v+' mm';check();});U.val.textContent='4 mm';
      check();return {};
    },
    read(s,output){const p=s.near?NEAR:Infinity,pw=POW0+s.lens/100*5,r=P.eyeImage(p,pw,s.pupil/1000);
      output.innerHTML=T('像距 ','Image distance ')+(isFinite(r.q)?(r.q*1000).toFixed(1)+' mm':'∞')+T('（視網膜在 17.0 mm）','(retina at 17.0 mm)')+'<br>'+T('瞳孔改的是亮暗；要清楚，得改水晶體','The pupil changes brightness; for sharpness, change the lens');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(21,{groups:{wrong:["瞳孔不是拿來對焦的", "The pupil does not focus"],wrong2:["換元件救不了模糊", "A better sensor cannot fix blur"],solve:["逐項判斷", "Check each choice"],story:["眼睛天生看遠", "Eyes are built for distance"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\text{pupil}\to\text{light},\quad\text{lens}\to f`,wrong2:String.raw`\text{blur: image}\neq\text{sensor}`,solve:String.raw`\boxed{D}\ \ \text{real, inverted}`,story:String.raw`\text{relaxed lens}\Rightarrow f\uparrow`,trick:String.raw`\dfrac1p+\dfrac1q=\dfrac1f`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q21=[
 {
  "id": "Q21_01",
  "row": "wrong",
  "duration": 2.74,
  "disp": "錯最多的是 E，有 22%。",
  "en": "The top wrong pick is E, at 22%."
 },
 {
  "id": "Q21_02",
  "row": "wrong",
  "duration": 6.32,
  "disp": "照相機調鏡頭和感光元件的距離，這沒錯；可是眼睛不是靠縮放瞳孔來對焦。",
  "en": "A camera does move the lens relative to the sensor. But the eye does not focus by changing the pupil."
 },
 {
  "id": "Q21_03",
  "row": "wrong",
  "duration": 5.53,
  "disp": "瞳孔就像相機的光圈，管的是光進來多少：大白天縮小，晚上放大。",
  "en": "The pupil is like the camera’s aperture. It controls how much light gets in: small in daylight, wide at night."
 },
 {
  "id": "Q21_04",
  "row": "wrong",
  "duration": 4.9,
  "disp": "眼睛對焦，靠的是睫狀肌改變水晶體的厚薄，也就是改變焦距。",
  "en": "The eye focuses with the ciliary muscles, which change the thickness of the lens, that is, its focal length."
 },
 {
  "id": "Q21_05",
  "row": "wrong2",
  "duration": 4.05,
  "disp": "C 也有 19%：換一個感光程度更高的元件。",
  "en": "C drew 19%: switch to a more sensitive sensor."
 },
 {
  "id": "Q21_06",
  "row": "wrong2",
  "duration": 6.94,
  "disp": "感光度高，只是元件對光比較敏感；像沒有剛好落在感光元件上，換多貴的元件都一樣糊。",
  "en": "Higher sensitivity only means the sensor responds more to light. If the image does not land right on the sensor, even the most expensive sensor is still blurry."
 },
 {
  "id": "Q21_07",
  "row": "solve",
  "duration": 5.94,
  "disp": "A、B 都用錯了現象：成像、配眼鏡矯正，靠的都是光的折射，不是干涉，也不是繞射。",
  "en": "A and B name the wrong effect. Forming an image and correcting vision with glasses both rely on refraction, not interference or diffraction."
 },
 {
  "id": "Q21_08",
  "row": "solve",
  "duration": 6.99,
  "disp": "D：遠方的物體經過凸透鏡，在焦點附近形成倒立縮小的實像；眼睛也一樣，視網膜上的像是倒的。",
  "en": "D: a distant object seen through a convex lens forms a small, inverted real image near the focal point. The eye is the same: the image on the retina is upside down."
 },
 {
  "id": "Q21_09",
  "row": "solve",
  "duration": 7.51,
  "disp": "那我們為什麼看到的是正的？大腦處理視網膜傳來的訊號，讓我們認得出東西真正的方向。",
  "en": "So why does the world look upright? The brain processes the signals from the retina so we recognize which way things really are."
 },
 {
  "id": "Q21_10",
  "row": "solve",
  "duration": 0.6,
  "disp": "答案 D。",
  "en": "The answer is D."
 },
 {
  "id": "Q21_11",
  "row": "story",
  "duration": 6.91,
  "disp": "我上課講過，一般正常的眼睛放鬆的時候，水晶體比較扁，焦距比較長，剛好適合看遠。",
  "en": "As I said in class, when a normal eye relaxes the lens is flatter and the focal length longer, just right for looking far away."
 },
 {
  "id": "Q21_12",
  "row": "story",
  "duration": 10.04,
  "disp": "我常說，這是為了活下去：古早的人類要先看清楚遠方的獵物，還有遠方的敵人；牠都已經衝到你眼前了才看清楚，那就來不及了。",
  "en": "I like to say it is about survival: early humans had to spot prey far away, and enemies far away. If you only see it clearly once it is in your face, it is too late."
 },
 {
  "id": "Q21_13",
  "row": "trick",
  "duration": 3.42,
  "disp": "秒殺口訣：瞳孔管亮暗，水晶體管清楚。",
  "en": "The quick rule: the pupil handles brightness, the lens handles sharpness."
 }
];
/* tracks:end */
