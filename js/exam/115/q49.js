/* 115 學測第 49 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,P=Exam115Core;
  // 同一個量全頁同色：R2 青、R3 金、合成綠；入射藍、反射紫、折射橘；慢波速介質粉紅、快波速介質淺白
  const R2C=C.teal,R3C=C.gold,SUMC=C.green,INC=C.blue,REFL=C.violet,REFR='#ff9f6b',SLOW='#f0a0b0',FAST='#dfe9ee';
  const VR=1.5,TH=30,D2R=Math.PI/180; // VR：示意用「快層波速＝慢層的 1.5 倍」（題目沒給數值，只用來畫折射的方向）
  // ── (a) 三格波形：R2、R3、合成（和答題卷一樣，上下虛線＝R2 的振幅）
  const L={x:60,lam:120,w:240,A:18,cy:[48,124,196],half:[26,26,40]};
  const HW={x:52,lam:100,w:200,A:16,cy:[38,104,184],half:[22,22,36]};
  function frame(g,o,i,name,col,dashCol){
    const cy=o.cy[i],h=o.half[i];g.strokeStyle='#ffffff14';g.lineWidth=1;
    for(let gx=o.x;gx<=o.x+o.w+.1;gx+=o.lam/4){g.beginPath();g.moveTo(gx,cy-h);g.lineTo(gx,cy+h);g.stroke();}
    for(const dy of [-o.A,o.A])line(g,o.x,cy+dy,o.x+o.w,cy+dy,dashCol||'#ffffff66',1,[4,4]);
    arrow(g,o.x,cy,o.x+o.w+12,cy,C.faint,1.5,7);arrow(g,o.x,cy+h,o.x,cy-h-4,C.faint,1.5,7);
    sci(g,name,o.x-8,cy+6,col,16,'right');
  }
  function wave(g,o,i,f,col,wd=2.6,upto=1){
    const cy=o.cy[i];g.beginPath();g.strokeStyle=col;g.lineWidth=wd;g.lineJoin='round';
    const n=Math.max(2,Math.round(120*upto));for(let j=0;j<=n;j++){const px=o.x+o.w*upto*j/n,th=2*Math.PI*(px-o.x)/o.lam,y=cy-o.A*f(th);j?g.lineTo(px,y):g.moveTo(px,y);}g.stroke();
  }
  // st：{a3 振幅比, ph 相位差（弧度）, show3, upto2, align}；回傳合成振幅（R2 的幾倍）
  function waves(g,o,st){
    frame(g,o,0,'R_2',R2C);frame(g,o,1,'R_3',R3C);frame(g,o,2,T('合成','Sum'),SUMC,R2C+'77');
    const a3=st.a3??.8,ph=st.ph??0;
    if(st.align){const ok=Math.abs(Math.atan2(Math.sin(ph),Math.cos(ph)))<.2,col=ok?SUMC:C.red;
      for(let q=1;q<8;q+=2){const px=o.x+o.lam*q/4;if(px>o.x+o.w)break;line(g,px,o.cy[0]-o.half[0],px,o.cy[2]+o.half[2],col+'aa',1.4,[3,4]);}}
    if(o===L)label(g,T('電場','E field'),o.x+8,16,C.faint,15);
    if(o===L)label(g,T('位置','Position'),o.x+o.w+16,o.cy[0]+5,C.faint,15);
    wave(g,o,0,Math.sin,R2C,2.6,st.upto2??1);
    if(st.show3!==false)wave(g,o,1,th=>a3*Math.sin(th+ph),R3C);
    if(st.show3!==false)wave(g,o,2,th=>Math.sin(th)+a3*Math.sin(th+ph),SUMC,3);
    return P.superpose(a3,ph);
  }
  // ── (b) 極坐標圖：上半慢波速（粉紅）、下半快波速；θ 是光線和法線的夾角
  function polar(g,cx,cy,R,o={}){
    const deg=o.th??TH,th=deg*D2R,th2=P.refract(deg,VR);
    g.beginPath();g.moveTo(cx+R,cy);g.arc(cx,cy,R,0,Math.PI,true);g.closePath();g.fillStyle=SLOW+'40';g.fill();
    g.beginPath();g.moveTo(cx+R,cy);g.arc(cx,cy,R,0,Math.PI);g.closePath();g.fillStyle=FAST+'1c';g.fill();
    if(o.wedge&&th2!==null){g.beginPath();g.moveTo(cx,cy);g.arc(cx,cy,R,0,Math.PI/2-th);g.closePath();g.fillStyle=SUMC+'33';g.fill();}
    g.strokeStyle=SLOW+'cc';g.lineWidth=1.3;for(const r of [R,R+10]){g.beginPath();g.arc(cx,cy,r,0,2*Math.PI);g.stroke();}
    for(let a=0;a<360;a+=15){const r=a*D2R;line(g,cx+R*Math.cos(r),cy+R*Math.sin(r),cx+(R+10)*Math.cos(r),cy+(R+10)*Math.sin(r),SLOW+'cc',1);}
    line(g,cx-R,cy,cx+R,cy,C.white,2.2);line(g,cx,cy-R,cx,cy+R,C.faint,1.2,[5,4]);
    const ray=(ang,u,col,inward)=>{if(u<=0)return;const ex=cx+R*.94*Math.sin(ang),ey=cy+R*.94*Math.cos(ang);
      if(inward)arrow(g,ex,ey,ex+(cx-ex)*u,ey+(cy-ey)*u,col,3,11);else arrow(g,cx,cy,cx+(ex-cx)*u,cy+(ey-cy)*u,col,3,11);};
    const inc=o.inc??1;
    if(inc>=1)line(g,cx,cy,cx+R*.94*Math.sin(th),cy+R*.94*Math.cos(th),INC+'aa',1.5,[3,4]); // 不偏折時的延長虛線
    ray(Math.PI+th,inc,INC,true);ray(Math.PI-th,o.refl||0,REFL);
    if(th2!==null)ray(th2*D2R,o.refr||0,REFR);
    else if(o.refr)label(g,T('全反射','Total reflection'),cx,cy+R*.55,REFR,15,'center');
    // 角度弧：aR 是光線那一端、aN 是法線那一端；夾縫夠寬就把字放在夾縫裡，太窄就放到光線外側（遠離法線），不壓到光線
    const arc=(aR,aN,r,col,txt)=>{const a0=Math.min(aR,aN),a1=Math.max(aR,aN);g.beginPath();g.arc(cx,cy,r,a0,a1);g.strokeStyle=col;g.lineWidth=2;g.stroke();
      let px,py;
      if(a1-a0>=44*D2R){const m=(a0+a1)/2;px=cx+(r+16)*Math.cos(m);if(Math.abs(px-cx)<22)px=cx+(Math.cos(m)<0?-22:22);py=cy+(r+16)*Math.sin(m);}
      else{const dx=Math.cos(aR),dy=Math.sin(aR),w=txt.replace(/_/g,'').length*8.5;let nx=dy,ny=-dx;if(nx*Math.cos(aN)+ny*Math.sin(aN)>0){nx=-nx;ny=-ny;}
        const ext=8+w/2*Math.abs(nx)+8*Math.abs(ny);px=cx+(r+16)*dx+nx*ext;py=cy+(r+16)*dy+ny*ext;}
      sci(g,txt,px,py+5,col,15,'center');};
    if(o.arcs&&deg>=8){const up=-Math.PI/2;
      if(o.arcs.includes('i'))arc(up-th,up,30,INC,o.sym?'θ_1':Math.round(deg)+'°');
      if(o.arcs.includes('r')&&(o.refl||0)>=1)arc(up+th,up,30,REFL,Math.round(deg)+'°');
      if(o.arcs.includes('t')&&th2!==null&&(o.refr||0)>=1)arc(Math.PI/2-th2*D2R,Math.PI/2,34,REFR,o.sym?'θ_2':th2.toFixed(1)+'°');}
    // 入射線的名字 I：放在光線靠法線那一側（角度太小時改放外側），避開角度標籤
    if(inc>=1){const q=R*.86,sd=deg>=20?9:-9;label(g,'I',cx-q*Math.sin(th)+sd*Math.cos(th),cy-q*Math.cos(th)-sd*Math.sin(th)+6,INC,17,'center');}
    return th2;
  }
  // ── 推車比喻：兩個輪子各照自己所在的地面速率前進（泥巴慢、柏油快），先上柏油的輪子先變快，車頭就轉向
  const CART=(()=>{const W=40,IY=126,pts=[];let th=TH*D2R,x=200-108*Math.sin(th),y=IY-108*Math.cos(th);
    for(let i=0;i<900&&y<240&&x<452;i++){const ay=-Math.sin(th),v=py=>py<IY?.6:.6*VR,
      vA=v(y+ay*W/2),vB=v(y-ay*W/2);x+=Math.sin(th)*(vA+vB)/2;y+=Math.cos(th)*(vA+vB)/2;th=Math.min(Math.PI/2,th+(vB-vA)/W);pts.push([x,y,th]);}
    return {pts,W,IY,final:pts[pts.length-1][2]/D2R};})();
  function cart(g,k){
    const {pts,W,IY}=CART;g.fillStyle='#6b4a32';g.fillRect(-460,-250,1380,IY+250);g.fillStyle='#2b3238';g.fillRect(-460,IY,1380,380);
    for(let i=0;i<40;i++)K.dot(g,(i*97)%460,(i*53)%IY,1.6,'#8a6446');
    for(let x=10;x<460;x+=46)line(g,x,IY+70,x+22,IY+70,'#c9d1d4',2);
    line(g,0,IY,460,IY,C.white,2);
    const n=Math.round(seg(k,0,.92)*(pts.length-1)),[x,y,th]=pts[n];
    const hit=pts.findIndex(p=>p[1]>=IY);if(hit>0){line(g,pts[hit][0],IY-80,pts[hit][0],IY+90,C.faint,1.2,[5,4]);label(g,T('法線','Normal'),pts[hit][0]+6,IY-66,C.faint,15);}
    g.beginPath();pts.slice(0,n+1).forEach(([px,py],i)=>i?g.lineTo(px,py):g.moveTo(px,py));g.strokeStyle=C.gold+'cc';g.lineWidth=2;g.setLineDash([6,4]);g.stroke();g.setLineDash([]);
    g.save();g.translate(x,y);g.rotate(-th);box(g,-W/2+3,-30,W-6,26,4,'#c98b4a','#f0c27a',1.5);
    for(const sx of [-W/2,W/2])box(g,sx-4,-7,8,14,3,'#111a20','#9aa8b0',1.5);line(g,-W/2,0,W/2,0,C.white,2.5);g.restore();
    label(g,T('泥巴：慢','Mud: slow'),12,26,'#f0c9a0',17);label(g,T('柏油路：快','Asphalt: fast'),12,IY+30,'#dfe6e9',17);
    const ay=-Math.sin(th);if(y-ay*W/2>=IY-1&&y+ay*W/2<IY)label(g,T('先上柏油的輪子先變快','The wheel on asphalt speeds up first'),448,IY-14,C.gold,16,'right');
    if(n>=pts.length-1){label(g,T('車子轉向：偏離法線','The cart turns away from the normal'),448,IY+104,REFR,17,'right');}
  }
  const right=(g,lines,x=352)=>lines.forEach(([txt,col,size,y])=>sci(g,txt,x,y,col,size||16));
  const ampText=(g,a,col,y=L.cy[2]+6)=>sci(g,T('振幅 ×','Amp. ×')+a.toFixed(2),352,y,col,15);
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const k=s.part,t=s.t,PO=[140,125,92];
    switch(s.id){
      case 'Q49_06':waves(g,L,{upto2:seg(k,0,.55),show3:false});label(g,'?',L.x+L.w/2,L.cy[1]+10,R3C,30,'center');
        right(g,[[T('畫 R_3','Draw R_3'),R3C,18,112],[T('讓疊加後','Make the sum'),C.white,16,180],[T('反射最強','strongest'),SUMC,16,204]]);return;
      case 'Q49_08':{const a=waves(g,L,{ph:2.2+t*1.3});right(g,[[T('隨便畫','Any wave'),C.white,17,104],[T('一個？','will do?'),C.white,17,128]]);ampText(g,a,SUMC);return;}
      case 'Q49_09':{const a=waves(g,L,{ph:2.4+(Math.PI-2.4)*ease(seg(k,0,.7))});right(g,[[T('會抵消！','Cancels!'),C.red,18,116]]);ampText(g,a,C.red);return;}
      case 'Q49_10':case 'Q49_11':{const a=waves(g,L,{ph:Math.PI,align:true});
        right(g,s.id==='Q49_10'?[[T('峰對谷','Crest on trough'),C.red,17,104],[T('破壞性干涉','destructive'),C.red,15,128]]:[[T('越疊越暗','Dimmer!'),C.red,18,116]]);
        if(s.id==='Q49_11')mark(g,446,110,false,9);ampText(g,a,C.red);return;}
      case 'Q49_12':{const ph=Math.PI*(1-ease(seg(k,0,.6))),a=waves(g,L,{a3:1,ph,align:k>.62});
        if(k>.62)right(g,[[T('峰對峰','Crest on crest'),SUMC,17,104],[T('建設性干涉','constructive'),SUMC,15,128]]);ampText(g,a,SUMC);return;}
      case 'Q49_13':{const a=waves(g,L,{a3:1,align:true});right(g,[[T('振幅呢？','Amplitude?'),R3C,19,116]]);ampText(g,a,SUMC);return;}
      case 'Q49_14':{const a3=1-.2*ease(seg(k,.15,.75)),a=waves(g,L,{a3,align:true});
        right(g,[[T('更深處回來','From deeper:'),C.white,15,90],[T('被吸收','absorbed'),C.faint,15,112],[T('也有透射','or transmitted'),C.faint,15,134],[T('→ 略小','→ smaller'),R3C,17,158]]);
        ampText(g,a,SUMC,L.cy[2]+22);return;}
      case 'Q49_15':{waves(g,L,{a3:.8,align:true});right(g,[[T('① 同相','1. In phase'),C.white,17,104],[T('② 振幅略小','2. Smaller'),C.white,15,138]]);
        if(k>.2)mark(g,446,98,true,9);if(k>.5)mark(g,446,132,true,9);return;}
      case 'Q49_16':polar(g,...PO,{inc:seg(k,0,.45),arcs:k>.45?'i':''});
        right(g,[[T('上：慢波速介質','Top: slow medium'),SLOW,16,48],[T('入射角 30°','Incidence 30°'),INC,17,104],[T('畫反射線、','Draw the reflected'),R3C,16,150],[T('折射線','and refracted rays'),R3C,16,174],[T('下：快波速介質','Bottom: fast medium'),FAST,16,226]],262);return;
      case 'Q49_17':polar(g,...PO,{refl:seg(k,0,.5),arcs:'ir'});
        right(g,[[T('反射角','Angle of reflection'),REFL,18,100],[T('＝ 入射角 ＝ 30°','= incidence = 30°'),REFL,17,128]],262);return;
      case 'Q49_18':polar(g,...PO,{refl:1,refr:seg(k,0,.45),arcs:'irt',wedge:k>.5});
        right(g,[[T('慢 → 快：變快','Slow → fast: speeds up'),C.white,16,56],[T('折射線偏離法線','Bends away'),REFR,17,96],[T('（偏近界面）','from the normal'),REFR,15,120],
          ...(k>.5?[[T('落在虛線和界面之間','Between the dashed line'),SUMC,15,168],[T('就對了','and the interface'),SUMC,15,190]]:[]),[T('示意：v_快 = 1.5 v_慢','Sketch: v_fast = 1.5 v_slow'),C.faint,15,232]],262);return;
      case 'Q49_19':cart(g,k);return;
      case 'Q49_20':polar(g,...PO,{refl:1,refr:1,arcs:'it',sym:true});
        right(g,[[T('快的那一邊','On the fast side,'),C.gold,19,100],[T('角度比較大','the angle is bigger'),C.gold,19,130],['θ_2 > θ_1',REFR,18,176]],262);return;
      default:{const th2=polar(g,...PO,{refl:1,refr:1,arcs:'it',sym:true});
        right(g,[['sin θ_1 / sin θ_2',C.white,18,70],['= v_1 / v_2',C.white,18,98],[T('θ：光和法線的夾角','θ: angle to the normal'),C.faint,15,130],
          ...(k>.35?[[T('示意：sin 30° / sin '+th2.toFixed(1)+'°','Sketch: sin 30° / sin '+th2.toFixed(1)+'°'),C.faint,15,180],['= 0.50 / '+(.5*VR).toFixed(2)+' = 1 / '+VR,C.faint,15,204]]:[])],262);}
    }
  }
  // 能動手：拖 R3（左右＝相位、上下＝振幅）或拉桿；拖極坐標圖改入射角
  function hands(g,s){
    const sum=waves(g,HW,{a3:s.a3,ph:s.ph*D2R,align:s.aid});
    const th2=polar(g,362,108,66,{th:s.th,refl:1,refr:1,arcs:'irt'});
    label(g,T('慢','Slow'),284,58,SLOW,15,'right');label(g,T('快','Fast'),284,168,FAST,15,'right');
    sci(g,T('合成振幅 ','Sum amplitude ')+sum.toFixed(2)+T(' 倍',' ×'),HW.x-40,244,SUMC,15);
    if(s.done)mark(g,212,238,true,8);
    label(g,T('反射角 ','Reflection ')+Math.round(s.th)+'°',362,216,REFL,15,'center');
    label(g,th2===null?T('超過臨界角：全反射','Total reflection'):T('折射角 ','Refraction ')+th2.toFixed(1)+'°',362,240,REFR,15,'center');
  }
  const ok=s=>Math.abs(s.ph)<=10&&s.a3>=.6&&s.a3<=.95;
  ExamScene.add(49,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,a3:1,ph:120,th:TH,aid:false,done:false}),
    paint,
    preview(g){
      // 圖 19（a）：白（快）灰（慢）交錯的薄膜單元，I1 射入，各界面反射出 R1、R2、R3…；圖 19（b）：界面放大，I 從慢射向快
      const x0=44,x1=214,top=74,hl=13;
      for(let i=0;i<10;i++){g.fillStyle=i%2?'#7c8892':'#d9e4ea';g.fillRect(x0,top+i*hl,x1-x0,hl);}
      g.strokeStyle='#0c2535';g.lineWidth=2;for(let u=0;u<5;u++)g.strokeRect(x0,top+u*2*hl,x1-x0,2*hl);
      label(g,'⋮',(x0+x1)/2,top+10*hl+18,C.faint,18,'center');
      const ex=70,tn=.62;arrow(g,ex-34,top-48,ex,top,INC,2.5,10);sci(g,'I_1',ex-36,top-50,INC,16,'right');
      for(let r=0;r<4;r++){const d=r*2*hl,xr=ex+tn*d,xo=ex+2*tn*d;
        if(r){line(g,ex,top,xr,top+d,'#0c2535',1.5,[2,3]);line(g,xr,top+d,xo,top,'#0c2535',1.5,[2,3]);}
        arrow(g,xo,top,xo+22,top-38,C.white,2.2,8);if(r<3)sci(g,'R_'+(r+1),xo+26,top-40,r===1?R2C:r===2?R3C:C.white,16);else label(g,'…',xo+28,top-40,C.white,16);}
      g.beginPath();g.arc(x1-12,top+4*hl,6,0,2*Math.PI);g.strokeStyle='#0c2535';g.lineWidth=1.8;g.stroke();
      line(g,x1-6,top+4*hl-3,276,58,C.faint,1,[4,4]);line(g,x1-6,top+4*hl+3,276,204,C.faint,1,[4,4]);
      const cx=350,cy=128,R=78;g.beginPath();g.moveTo(cx+R,cy);g.arc(cx,cy,R,0,Math.PI,true);g.closePath();g.fillStyle='#7c8892';g.fill();
      g.beginPath();g.moveTo(cx+R,cy);g.arc(cx,cy,R,0,Math.PI);g.closePath();g.fillStyle='#d9e4ea';g.fill();
      g.beginPath();g.arc(cx,cy,R,0,2*Math.PI);g.strokeStyle=C.white;g.lineWidth=1.5;g.setLineDash([5,4]);g.stroke();g.setLineDash([]);line(g,cx-R,cy,cx+R,cy,'#0c2535',2);
      arrow(g,cx-R*.8*Math.sin(TH*D2R),cy-R*.8*Math.cos(TH*D2R),cx,cy,'#0c2535',3,11);label(g,'I',cx-36,cy-36,'#0c2535',17,'right');
      label(g,T('慢波速','Slow'),cx+32,cy-42,'#0c2535',15,'center');label(g,T('介質','medium'),cx+32,cy-22,'#0c2535',15,'center');label(g,T('快波速','Fast'),cx+32,cy+30,'#0c2535',15,'center');label(g,T('介質','medium'),cx+32,cy+50,'#0c2535',15,'center');
      label(g,T('圖 19（a）白：快　灰：慢','Fig. 19(a) white: fast · grey: slow'),x0-4,242,C.faint,15);label(g,T('圖 19（b）','Fig. 19(b)'),cx,242,C.faint,15,'center');
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,btn,toggle,complete,render}){
      s.hands=true;canvas.style.touchAction='none'; /* 手指拖 R3 和光線時不讓頁面捲走 */ let last=0;
      const beep=(f,d=.06,gain=.05,type='sine')=>{if(!LabSettings.get('sound'))return;const n=performance.now();if(n-last<70)return;last=n;LabSound.tone({freq:f,dur:d,type,gain});};
      const check=()=>{const sum=P.superpose(s.a3,s.ph*D2R);beep(240+160*sum);if(ok(s)&&!s.done){s.done=true;if(LabSettings.get('sound'))LabSound.tone({freq:880,dur:.18,type:'triangle',gain:.12,delay:.08});complete();}};
      const rp=range(T('R3 相位差（度）','R3 phase shift (°)'),-180,180,120,v=>{s.ph=v;sync();check();});
      const ra=range(T('R3 振幅（R2 的 %）','R3 amplitude (% of R2)'),0,120,100,v=>{s.a3=v/100;sync();check();});
      const rt=range(T('(b) 入射角（度）','(b) Angle of incidence (°)'),0,85,TH,v=>{s.th=v;sync();beep(300+5*v,.05,.04,'triangle');});
      function sync(){rp.input.value=Math.round(s.ph);rp.val.textContent=Math.round(s.ph)+'°';ra.input.value=Math.round(s.a3*100);ra.val.textContent=Math.round(s.a3*100)+'%';rt.input.value=Math.round(s.th);rt.val.textContent=Math.round(s.th)+'°';}
      sync();
      toggle('畫出波峰對齊線','Show crest guides',v=>s.aid=v);
      btn(T('R3 反相看看','Try R3 out of phase'),()=>{s.ph=180;sync();check();});
      let d0=null;const norm=a=>((a+180)%360+360)%360-180;
      return {hit:(x,y)=>{if(x>=HW.x-10&&x<=HW.x+HW.w+10&&Math.abs(y-HW.cy[1])<=32){d0={x,y,ph:s.ph,a:s.a3};return 0;}
          if(Math.hypot(x-362,y-108)<=80)return 1;return null;},
        move:(i,x,y)=>{if(i===0){s.ph=Math.round(norm(d0.ph-(x-d0.x)/HW.lam*360));s.a3=clamp(Math.round((d0.a-(y-d0.y)/HW.A)*100)/100,0,1.2);sync();check();}
          else{const dy=108-y,th=dy<=2?85:Math.atan(Math.abs(x-362)/dy)/D2R;s.th=clamp(Math.round(th),0,85);sync();beep(300+5*s.th,.05,.04,'triangle');}render();}};
    },
    read(s,output){
      const sum=P.superpose(s.a3,s.ph*D2R),th2=P.refract(s.th,VR);
      const tip=ok(s)?T('最強反射：同相、振幅略小 ✓','Strongest reflection: in phase, slightly smaller ✓'):
        s.a3>.95?T('R<sub>3</sub> 從更深處回來，一路被吸收、透射，振幅要比 R<sub>2</sub> 略小。','R<sub>3</sub> comes back from deeper down and loses some on the way: make it slightly smaller than R<sub>2</sub>.'):
        s.a3<.6?T('振幅太小了，只要「略小」。','Too small: only slightly smaller.'):T('相位還沒對齊：波峰要對波峰。','Not in phase yet: crest on crest.');
      output.innerHTML=T('(a) R<sub>3</sub> 相位差 ','(a) R<sub>3</sub> phase shift ')+Math.round(s.ph)+T('°、振幅 ','°, amplitude ')+s.a3.toFixed(2)+T(' 倍 → 合成振幅 <b>',' × → sum amplitude <b>')+sum.toFixed(2)+T('</b> 倍。','</b> ×. ')+tip+
        '<br>'+T('(b) 入射角 ','(b) Incidence ')+Math.round(s.th)+T('° → 反射角 ','° → reflection ')+Math.round(s.th)+T('°、','°, ')+(th2===null?T('超過臨界角，全反射','past the critical angle: total reflection'):T('折射角 ','refraction ')+th2.toFixed(1)+'°')+T('（示意：快層波速取慢層的 1.5 倍）',' (sketch: the fast layer is 1.5 × faster)');
    }
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(49,{groups:{askA:["(a) 畫出 R3", "(a) Draw R3"],wrongA:["峰對谷會抵消", "Crest on trough cancels"],solveA:["同相、振幅略小", "In phase, slightly smaller"],askB:["(b) 反射與折射", "(b) Reflection and refraction"],solveB:["慢到快，偏離法線", "Slow to fast bends away from the normal"],trick:["口訣", "The rule"]},board:{askA:String.raw`R_1,\ R_2,\ R_3`,wrongA:[String.raw`\text{峰對谷}\Rightarrow\text{抵消}`,String.raw`\text{crest on trough}\Rightarrow\text{cancel}`],solveA:[String.raw`R_3\ \text{與}\ R_2\ \text{同相，振幅略小}`,String.raw`R_3\ \text{in phase with}\ R_2,\ \text{slightly smaller}`],askB:String.raw`\theta_{\text{reflect}}=\theta_{\text{incident}}`,solveB:[String.raw`v_1<v_2\ \Rightarrow\ \theta_2>\theta_1\ \text{（偏離法線）}`,String.raw`v_1<v_2\ \Rightarrow\ \theta_2>\theta_1\ \text{(away from normal)}`],trick:String.raw`\dfrac{\sin\theta_1}{\sin\theta_2}=\dfrac{v_1}{v_2}`}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q49=[
 {
  "id": "Q49_06",
  "row": "askA",
  "duration": 6.33,
  "disp": "第一小題：已知 \\(R_{2}\\) 的電場圖，畫出 \\(R_{3}\\)，讓疊加以後的反射最強。",
  "en": "Part 1: given the electric field graph of R2, draw R3 so the combined reflection is strongest."
 },
 {
  "id": "Q49_08",
  "row": "wrongA",
  "duration": 4.98,
  "disp": "直覺會想：每一層都反射一點，加起來就變強嘛，隨便畫一個波就好？",
  "en": "Your instinct: every layer reflects a bit, so it adds up stronger. Draw any wave, right?"
 },
 {
  "id": "Q49_09",
  "row": "wrongA",
  "duration": 2.18,
  "disp": "不行，波會互相抵消。",
  "en": "No. Waves can cancel each other."
 },
 {
  "id": "Q49_10",
  "row": "wrongA",
  "duration": 5.04,
  "disp": "\\(R_{3}\\) 如果波峰對到 \\(R_{2}\\) 的波谷，就是破壞性干涉，反而變暗。",
  "en": "If R3's crests meet R2's troughs, that's destructive interference, and it gets darker."
 },
 {
  "id": "Q49_11",
  "row": "wrongA",
  "duration": 3.82,
  "disp": "鏡子越疊越暗，晶片廠的工程師會哭給你看。",
  "en": "A mirror that dims with every layer would make the fab engineers cry."
 },
 {
  "id": "Q49_12",
  "row": "solveA",
  "duration": 6.51,
  "disp": "要最強，就要建設性干涉，波峰對波峰，波谷對波谷，相位相同。",
  "en": "For maximum strength you need constructive interference: crest on crest, trough on trough, in phase."
 },
 {
  "id": "Q49_13",
  "row": "solveA",
  "duration": 0.91,
  "disp": "振幅呢？",
  "en": "And the amplitude?"
 },
 {
  "id": "Q49_14",
  "row": "solveA",
  "duration": 8.98,
  "disp": "因為 \\(R_{3}\\) 從更深的地方反射回來，一路上有被吸收、有透射出去，所以振幅要比 \\(R_{2}\\) 略小一點。",
  "en": "R3 comes back from deeper down, losing some to absorption and transmission on the way, so its amplitude should be slightly smaller than R2's."
 },
 {
  "id": "Q49_15",
  "row": "solveA",
  "duration": 3.94,
  "disp": "評分原則就是這 2 點：相位相同，振幅略小。",
  "en": "The grading comes down to these 2 points: same phase, slightly smaller amplitude."
 },
 {
  "id": "Q49_16",
  "row": "askB",
  "duration": 7.2,
  "disp": "第二小題：光從慢波速介質，射向快波速介質，畫出反射線和折射線。",
  "en": "Part 2: light goes from a slow medium into a fast medium. Draw the reflected and refracted rays."
 },
 {
  "id": "Q49_17",
  "row": "solveB",
  "duration": 3.52,
  "disp": "反射，反射角等於入射角，要精確畫。",
  "en": "Reflection: the angle of reflection equals the angle of incidence. Draw it precisely."
 },
 {
  "id": "Q49_18",
  "row": "solveB",
  "duration": 9.14,
  "disp": "折射，因為光從慢波速進到快波速，速度變快，所以折射線會偏離法線，也就是比原來的路徑更偏近界面。",
  "en": "Refraction: going from slow to fast, the light speeds up, so the refracted ray bends away from the normal, closer to the interface than the original path."
 },
 {
  "id": "Q49_19",
  "row": "solveB",
  "duration": 8.06,
  "disp": "打個比喻，推車從泥巴地推到柏油路，先碰到柏油路的輪子先變快，車子就轉向了。",
  "en": "Picture pushing a cart from mud onto asphalt: the wheel that reaches the asphalt first speeds up first, and the cart turns."
 },
 {
  "id": "Q49_20",
  "row": "trick",
  "duration": 2.83,
  "disp": "口訣：快的那一邊，角度比較大。",
  "en": "The rule: on the fast side, the angle is bigger."
 },
 {
  "id": "Q49_21",
  "row": "trick",
  "duration": 7.89,
  "disp": "光在哪一邊跑得快，那一邊和法線的夾角就比較大；寫成式子，就是黑板上這一條。",
  "en": "Wherever light runs faster, the angle with the normal is bigger on that side; written as an equation, it's this line on the board."
 }
];
/* tracks:end */
