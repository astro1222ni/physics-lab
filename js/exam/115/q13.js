/* 115 學測第 13 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,dot}=K,C=K.colors,P=Exam115Core;
  const TAU=2*Math.PI,BETA=0.08,F_HI=1/(1-BETA),F_LO=1/(1+BETA);
  // tt：一個公轉週期裡的時間比例（0–1）。tt＝1/4 是甲時刻（starFrequency 的 phase 0），3/4 是乙時刻；畫面上的 f 全部由 starFrequency 算。
  const phaseOf=tt=>TAU*tt-Math.PI/2, fAt=tt=>P.starFrequency(phaseOf(tt),1,BETA);
  const TT1=.25,TT2=.75;
  // 朝測站（vr>0）偏藍、遠離偏紅、垂直是白
  function mix(vr){const a=[238,245,246],b=vr>0?[127,182,255]:[255,138,128],k=Math.min(1,Math.abs(vr));return 'rgb('+a.map((v,i)=>Math.round(v+(b[i]-v)*k)).join(',')+')';}
  // 波浪線（星光）：λ 由頻率決定（λ ∝ 1/f）
  function wave(g,x1,y1,x2,y2,lam,col,ph=0,amp=4,w=1.8){
    const L=Math.hypot(x2-x1,y2-y1),ux=(x2-x1)/L,uy=(y2-y1)/L;g.beginPath();
    for(let d=0;d<=L;d+=1.2){const a=amp*Math.sin(TAU*d/lam-ph)*Math.min(1,d/8,(L-d)/8);const px=x1+ux*d-uy*a,py=y1+uy*d+ux*a;d?g.lineTo(px,py):g.moveTo(px,py);}
    g.strokeStyle=col;g.lineWidth=w;g.lineJoin='round';g.stroke();
  }
  // 圓頂天文台（地面測站）：x 是圓頂中心、gy 是地面；望遠鏡朝右上 45°
  function station(g,x,gy){
    box(g,x-17,gy-22,34,22,2,'#4f6573','#9db3bf',1.2);
    g.save();g.translate(x,gy-22);g.rotate(Math.PI/4);g.fillStyle='#22313b';g.fillRect(-3.5,-24,7,18);g.restore();
    g.beginPath();g.arc(x,gy-22,17,Math.PI,0);g.fillStyle='#8ea5b1';g.fill();g.strokeStyle='#d5e3ea';g.lineWidth=1.2;g.stroke();
    g.save();g.beginPath();g.arc(x,gy-22,17,Math.PI,0);g.clip();g.translate(x,gy-22);g.rotate(Math.PI/4);g.fillStyle='#22313b';g.fillRect(-3.5,-19,7,19);g.restore();
    return [x+12,gy-34];
  }
  // 逆時針的圓弧箭頭（畫面上的逆時針）
  function ccw(g,cx,cy,r,a0,span,col){
    g.beginPath();g.arc(cx,cy,r,a0,a0-span,true);g.strokeStyle=col;g.lineWidth=1.6;g.stroke();
    const a=a0-span,x=cx+r*Math.cos(a),y=cy+r*Math.sin(a),tx=Math.sin(a),ty=-Math.cos(a);
    g.beginPath();g.moveTo(x+tx*7,y+ty*7);g.lineTo(x-ty*4,y+tx*4);g.lineTo(x+ty*4,y-tx*4);g.closePath();g.fillStyle=col;g.fill();
  }
  function starBall(g,x,y,r){const gr=g.createRadialGradient(x-r*.35,y-r*.4,r*.1,x,y,r);gr.addColorStop(0,'#ffffff');gr.addColorStop(.35,'#d6dde2');gr.addColorStop(1,'#7d8a93');g.beginPath();g.arc(x,y,r,0,TAU);g.fillStyle=gr;g.fill();}
  // 恆星－行星系統＋地面測站。o={cx,cy,rs,rp,tt,d(測站沿 225° 的距離),vel,hidePlanet,labels,wph}
  function system(g,o){
    const {cx,cy,rs,rp,tt}=o,st=fAt(tt),sx=cx+rs*st.x,sy=cy-rs*st.y,px=cx-rp*st.x,py=cy+rp*st.y;
    const gy=cy+o.d+34,obs=station(g,cx-o.d-12,gy);line(g,cx-o.d-60,gy,cx-o.d+70,gy,'#9db3bf',1.5);
    g.beginPath();g.arc(cx,cy,rp,0,TAU);g.strokeStyle=o.hidePlanet?'#ffffff1c':'#ffffff3a';g.lineWidth=1.2;g.stroke();
    g.beginPath();g.arc(cx,cy,rs,0,TAU);g.strokeStyle='#ffffff55';g.stroke();
    ccw(g,cx,cy,rp+8,-.25,.9,o.hidePlanet?'#ffffff33':C.faint);ccw(g,cx,cy,rs*.55,2.2,2.2,C.faint);
    wave(g,sx,sy,obs[0],obs[1],o.neutral?13:13/st.f,o.neutral?'#c9d8de':mix(st.vr),o.wph||0);
    if(o.hidePlanet){g.beginPath();g.arc(px,py,6,0,TAU);g.setLineDash([3,3]);g.strokeStyle='#ffffff55';g.lineWidth=1.2;g.stroke();g.setLineDash([]);}
    else{dot(g,px,py,6,'#11181d');g.beginPath();g.arc(px,py,6,0,TAU);g.strokeStyle='#8a99a3';g.lineWidth=1.2;g.stroke();}
    starBall(g,sx,sy,o.rStar||12);
    dot(g,cx,cy,2.2,C.white);label(g,'x',cx+5,cy+14,C.white,15);
    if(o.vel){const a=3*Math.PI/4+phaseOf(tt),vx=-Math.sin(a),vy=-Math.cos(a),L=30;arrow(g,sx+vx*13,sy+vy*13,sx+vx*(13+L),sy+vy*(13+L),C.gold,2.6,9);}
    if(o.labels){const k=o.labels;label(g,T('恆星','Star'),sx+(st.x<0?-16:16),sy-14,C.white,15*k,st.x<0?'right':'left');
      if(!o.hidePlanet){const ux=-st.x,uy=st.y,lx=cx+(rp+18)*ux,ly=cy+(rp+18)*uy+5;label(g,T('行星','Planet'),lx,ly,C.faint,15*k,Math.abs(ux)<.35?'center':ux>0?'left':'right');}
      label(g,T('地面測站','Ground station'),Math.max(cx-o.d-12,40),gy+20,C.faint,15*k,'center');}
    return {sx,sy,st,obs,gy};
  }
  // f–t 圖：b={x,y(橫軸),w,h}；upto：畫到哪；bins：動手區已畫的格子
  function ftGraph(g,b,o={}){
    const X=u=>b.x+8+u*(b.w-16),Y=f=>b.y-14-(f-F_LO)/(F_HI-F_LO)*(b.h-46);
    arrow(g,b.x,b.y,b.x+b.w+10,b.y,C.faint,1.5,7);arrow(g,b.x,b.y,b.x,b.y-b.h,C.faint,1.5,7);
    sci(g,'f',b.x+6,b.y-b.h+6,C.white,17);label(g,'t',b.x+b.w+8,b.y+18,C.white,17,'right');
    line(g,b.x,Y(1),b.x+b.w,Y(1),'#ffffff66',1.2,[5,4]);sci(g,'f_0',b.x-5,Y(1)+6,C.white,16,'right');
    for(const [u,z,e] of [[TT1,'甲','time 1'],[TT2,'乙','time 2']]){line(g,X(u),b.y,X(u),b.y-b.h+24,'#ffffff55',1.2,[5,4]);label(g,T(z,e),X(u),b.y-b.h+18,C.white,16,'center');}
    const seg2=(a,c,col,w=3)=>{g.beginPath();for(let i=0;i<=40;i++){const u=a+(c-a)*i/40,f=fAt(u).f;i?g.lineTo(X(u),Y(f)):g.moveTo(X(u),Y(f));}g.strokeStyle=col;g.lineWidth=w;g.lineJoin='round';g.stroke();};
    if(o.bins){const n=o.bins.length;o.bins.forEach((on,i)=>{if(on)seg2(i/n,(i+1)/n,C.teal);});}
    else if(o.upto>0)seg2(0,o.upto,o.color||C.teal);
    if(o.dot!=null){const f=fAt(o.dot);dot(g,X(o.dot),Y(f.f),5.5,mix(f.vr));line(g,X(o.dot),b.y,X(o.dot),Y(f.f),'#ffd17e88',1.2,[2,3]);}
    return {X,Y};
  }
  // 原卷五張 f–t 小圖（A 水平；B 甲最低乙最高；C 都最低；D 都最高；E 甲最高乙最低）
  const SHAPE=[()=>0,u=>-Math.sin(TAU*u),u=>-Math.abs(Math.sin(TAU*u)),u=>Math.abs(Math.sin(TAU*u)),u=>Math.sin(TAU*u)];
  function mini(g,i,x,y,w,h,o={}){
    const fs=o.font||11,L=x+fs*1.6,B=y+h-5,Tp=y+fs+5,R=x+w-5,col=o.color||'#eef5f6';
    arrow(g,L,B,R,B,'#92aeba',1.1,Math.max(5,fs*.5));arrow(g,L,B,L,Tp-3,'#92aeba',1.1,Math.max(5,fs*.5));
    const X=u=>L+3+u*(R-L-12),mid=(Tp+B)/2+1,A=(B-Tp)*.36;
    if(i)line(g,L,mid,R-6,mid,'#ffffff77',1,[4,3]);sci(g,'f_0',L-3,mid+fs*.35,'#eef5f6',fs,'right');
    for(const [u,z,e] of [[TT1,'甲','1'],[TT2,'乙','2']]){line(g,X(u),B,X(u),Tp+2,'#ffffff66',1,[4,3]);label(g,T(z,e),X(u),Tp-1,'#c9d8de',fs,'center');}
    g.beginPath();for(let j=0;j<=80;j++){const u=j/80,yy=mid-A*SHAPE[i](u);j?g.lineTo(X(u),yy):g.moveTo(X(u),yy);}g.strokeStyle=col;g.lineWidth=o.lw||1.8;g.stroke();
  }
  function choiceArt(canvas,i){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);const g=canvas.getContext('2d');g.scale(d,d);mini(g,i,0,0,r.width,r.height,{font:r.width<130?11:12});}
  // 救護車（車頭朝右）
  function ambulance(g,x,y,rider){
    box(g,x-36,y-28,64,28,4,'#eef3f5','#9fb0b8',1.2);box(g,x+28,y-19,18,19,3,'#eef3f5','#9fb0b8',1.2);
    g.fillStyle='#bfe2f2';g.fillRect(x+32,y-16,10,8);g.fillStyle='#e35d52';g.fillRect(x-36,y-12,82,4);g.fillRect(x-16,y-25,4,11);g.fillRect(x-20,y-21,12,4);
    box(g,x-6,y-34,14,6,2,'#ff5a5a');for(const wx of [x-22,x+30]){dot(g,wx,y+2,6.5,'#30363b');dot(g,wx,y+2,2.5,'#9aa4ab');}
    if(rider){g.fillStyle='#bfe2f2';g.fillRect(x+6,y-24,14,10);dot(g,x+13,y-19,4,'#f1c9a5');}
  }
  function person(g,x,y,col){dot(g,x,y-30,6,col);line(g,x,y-24,x,y-8,col,3);line(g,x,y-8,x-6,y+2,col,3);line(g,x,y-8,x+6,y+2,col,3);line(g,x-7,y-18,x+7,y-18,col,3);}
  // 聲波：每個波前以「發出當時的波源位置」為圓心擴大（鏡頭跟著車走，路面往後退）
  function siren(g,t,o={}){
    const ax=o.ax??230,ay=150,c=70,T0=.4,beta=.4,vs=beta*c,sy=ay-31;
    g.save();g.beginPath();g.rect(0,52,460,150);g.clip();
    for(let k=0;k<14;k++){const age=(t%T0)+k*T0,r=c*age,cx=ax-vs*age;g.beginPath();g.arc(cx,sy,r,0,TAU);g.strokeStyle='rgba(138,230,215,'+Math.max(0,.75-age*.18)+')';g.lineWidth=1.6;g.stroke();}
    g.restore();
    line(g,0,ay+9,460,ay+9,'#5d7380',2);const off=(t*vs)%40;for(let x=-off;x<460;x+=40)line(g,x,ay+20,x+18,ay+20,'#5d7380',2);
    ambulance(g,ax,ay,o.rider);arrow(g,ax+50,ay-40,ax+84,ay-40,C.gold,2.4,9);
    person(g,430,ay+2,C.blue);person(g,30,ay+2,C.red);
    if(o.lambda){ // 前、後相鄰兩個波前的間距＝波長（照上面的公式算）
      const age1=(t%T0)+T0,age2=age1+T0,f1=ax-vs*age1+c*age1,f2=ax-vs*age2+c*age2,b1=ax-vs*age1-c*age1,b2=ax-vs*age2-c*age2;
      if(f2<455){line(g,f1,sy-48,f1,sy-36,C.blue,2);line(g,f2,sy-48,f2,sy-36,C.blue,2);line(g,f1,sy-42,f2,sy-42,C.blue,2);label(g,T('λ 短','short λ'),(f1+f2)/2,sy-54,C.blue,15,'center');}
      if(b2>5){line(g,b1,sy-48,b1,sy-36,C.red,2);line(g,b2,sy-48,b2,sy-36,C.red,2);line(g,b1,sy-42,b2,sy-42,C.red,2);label(g,T('λ 長','long λ'),(b1+b2)/2,sy-54,C.red,15,'center');}
    }
    return {beta};
  }
  // 光譜條：左藍右紅；參考線＝實驗室的 f0，觀測線依 vr 移動（移動量放大示意）
  function spectrum(g,x,y,w,vr,o={}){
    const gr=g.createLinearGradient(x,0,x+w,0);['#6b5fd6','#4d8fe0','#4cc3c0','#9adf6a','#f0d75a','#f29a4f','#e55a4f'].forEach((c,i,a)=>gr.addColorStop(i/(a.length-1),c));
    box(g,x,y,w,22,4,null,null);g.fillStyle=gr;g.fillRect(x,y,w,22);
    const mid=x+w/2,obs=mid-vr*w*.22;line(g,mid,y-6,mid,y+28,'#ffffff',1.5,[3,3]);line(g,obs,y-2,obs,y+24,'#0b0f14',4);
    if(o.labels!==false){sci(g,'f_0',mid,y+46,C.white,15,'center');label(g,T('藍（f 高）','Blue (high f)'),x,y-10,C.blue,15);label(g,T('紅（f 低）','Red (low f)'),x+w,y-10,C.red,15,'right');}
  }
  function shareTag(g,i,x,y){const Q=ExamPaper.questions[13];label(g,'ABCDE'[i]+'（'+Q.shares[i]+'%）',x,y,C.white,16,'center');}
  const SYS={cx:128,cy:88,rs:26,rp:56,d:86},GB={x:252,y:214,w:190,h:186};
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const id=s.id,k=s.part,t=s.t;
    switch(id){
      case 'Q13_08':{mini(g,1,20,34,200,150,{font:16,color:C.red,lw:3});mini(g,4,244,34,200,150,{font:16,color:C.teal,lw:3});
        shareTag(g,1,124,212);shareTag(g,4,348,212);if(k>.35)label(g,T('剛好上下顛倒','Exactly upside down'),230,240,C.gold,17,'center');return;}
      case 'Q13_09':case 'Q13_10':{
        const sx=330-60*((t*.25)%1);station(g,60,214);line(g,10,214,140,214,'#9db3bf',1.5);starBall(g,sx,150,14);arrow(g,sx-18,150,sx-56,150,C.gold,2.6,9);
        label(g,T('恆星朝測站靠近','The star approaches the station'),300,118,C.gold,16,'center');
        wave(g,120,46,440,46,12,C.white,t*4,5,2);wave(g,120,86,440,86,30,C.white,t*4,5,2);
        label(g,T('壓縮？','Squeezed?'),112,52,C.white,17,'right');label(g,T('拉長？','Stretched?'),112,92,C.white,17,'right');
        if(id==='Q13_10')label(g,T('一緊張就搞混','Easy to mix up under pressure'),300,244,C.red,17,'center');return;}
      case 'Q13_11':siren(g,t);label(g,T('用救護車來記','Remember it with an ambulance'),230,32,C.gold,18,'center');return;
      case 'Q13_12':siren(g,t);label(g,T('開過來：聲音較高','Coming: higher pitch'),448,32,C.blue,17,'right');if(k>.45)label(g,T('開走：聲音較低','Leaving: lower pitch'),12,32,C.red,17);return;
      case 'Q13_13':siren(g,t,{lambda:true});label(g,T('前方擠在一起 → f 高','Ahead: squeezed → high f'),448,32,C.blue,16,'right');label(g,T('後方被拉開 → f 低','Behind: stretched → low f'),12,32,C.red,16);
        label(g,T('波源速度放大示意','Source speed exaggerated'),230,238,C.faint,15,'center');return;
      case 'Q13_14':siren(g,t,{rider:true});label(g,T('站在路邊：聽得到變化','Roadside: you hear the change'),12,32,C.green,16);
        label(g,T('坐在車上：跟波源一起動，f 不變','Riding along: moving with the source, f unchanged'),448,238,C.gold,15,'right');return;
      case 'Q13_15':{const w=1.4,vr=-Math.cos(w*t),x=200+60*Math.sin(w*t);station(g,48,128);starBall(g,x,70,14);
        wave(g,x,70,60,94,13*(1-BETA*vr),mix(vr),t*6);
        spectrum(g,40,170,380,vr);label(g,vr>.25?T('靠近 → 藍移（f 變高）','Approaching → blueshift (f up)'):vr<-.25?T('遠離 → 紅移（f 變低）','Receding → redshift (f down)'):'',448,44,vr>0?C.blue:C.red,17,'right');
        label(g,T('移動量放大示意','Shift exaggerated'),448,240,C.faint,15,'right');return;}
      case 'Q13_16':{const tt=.75*seg(k,.02,.9);system(g,{...SYS,tt,vel:true,wph:t*5});ftGraph(g,GB,{upto:tt,dot:tt});
        const gx=u=>GB.x+8+u*(GB.w-16);if(tt>=TT1-.005)label(g,T('最高','Max'),gx(TT1)+12,GB.y-GB.h+18,C.blue,16);if(tt>=TT2-.005)label(g,T('最低','Min'),gx(TT2)+12,GB.y-GB.h+18,C.red,16);return;}
      case 'Q13_17':{const tt=.5,r=system(g,{...SYS,tt,vel:true,wph:t*5}),{X,Y}=ftGraph(g,GB,{upto:1});
        for(const u of [0,.5,1])dot(g,X(u),Y(1),5.5,C.white);
        sci(g,T('速度 ⊥ 視線 → f = f_0','v ⊥ line of sight → f = f_0'),230,244,C.white,16,'center');return;}
      case 'Q13_18':{const tt=TT1+(TT2-TT1)*seg(k,.05,.85);system(g,{...SYS,tt,vel:true,wph:t*5});const {X}=ftGraph(g,GB,{upto:1,dot:tt});
        const y=GB.y+12;line(g,X(TT1),y,X(TT2),y,C.gold,2);line(g,X(TT1),y-6,X(TT1),y+4,C.gold,2);line(g,X(TT2),y-6,X(TT2),y+4,C.gold,2);
        label(g,T('半圈＝半個週期','Half a turn = half a period'),(X(TT1)+X(TT2))/2,y+20,C.gold,15,'center');return;}
      case 'Q13_19':{system(g,{...SYS,tt:TT1,vel:true,wph:t*5});ftGraph(g,GB,{upto:1});label(g,T('甲最高、乙最低 → E','Max at 1, min at 2 → E'),230,244,C.green,18,'center');mark(g,436,236,true,9);return;}
      case 'Q13_20':{mini(g,1,20,34,200,150,{font:16,color:C.red,lw:3});mini(g,4,244,34,200,150,{font:16,color:C.teal,lw:3});mark(g,124,214,false,11);mark(g,348,214,true,11);
        label(g,T('B：上下顛倒，記反了','B: flipped, mixed up'),124,244,C.red,16,'center');label(g,'E',348,244,C.green,17,'center');return;}
      case 'Q13_21':{mini(g,2,20,34,200,150,{font:16,color:C.red,lw:3});mini(g,3,244,34,200,150,{font:16,color:C.red,lw:3});label(g,'C',124,212,C.white,17,'center');label(g,'D',348,212,C.white,17,'center');
        if(k>.3)label(g,T('轉一圈起伏 2 次：週期只有一半','Two wiggles per orbit: half the period'),230,242,C.red,16,'center');return;}
      case 'Q13_22':{label(g,T('靠近 → f 變高（藍移）','Approach → f up (blueshift)'),230,74,C.blue,22,'center');label(g,T('遠離 → f 變低（紅移）','Recede → f down (redshift)'),230,124,C.red,22,'center');
        spectrum(g,60,170,340,Math.sin(t*1.6));return;}
      case 'Q13_23':{const tt=(t*.12)%1,r=system(g,{...SYS,tt,hidePlanet:true,wph:t*5,labels:1});label(g,T('行星太暗，看不到','Planet too dim to see'),SYS.cx,22,C.faint,15,'center');
        spectrum(g,250,110,190,r.st.vr,{labels:false});label(g,T('光譜線','Spectral line'),345,96,C.white,16,'center');label(g,T('一下藍移、一下紅移','Blue, then red, then blue…'),345,162,C.gold,15,'center');
        label(g,T('徑向速度法','Radial velocity method'),345,200,C.teal,18,'center');return;}
      default:{ // Q13_24：窗簾在動 → 後面有貓
        const sw=Math.sin(t*3)*8;box(g,140,34,170,170,6,'#0d1a24','#6d8794',3);
        g.beginPath();g.moveTo(146,40);g.lineTo(304,40);for(let x=304;x>=146;x-=4){const u=(x-146)/158;g.lineTo(x+sw*Math.sin(u*Math.PI),196+6*Math.sin(u*TAU*3+t*4));}g.closePath();g.fillStyle='#b8695e';g.fill();
        for(let x=160;x<300;x+=22)line(g,x+sw*.5,42,x+sw,194,'#8f4a42',2);
        label(g,T('窗簾在動','The curtain moves'),225,232,C.white,17,'center');
        label(g,T('窗簾＝恆星','Curtain = star'),12,80,C.white,16);label(g,T('看得到在晃','we see it sway'),12,104,C.faint,15);
        label(g,T('貓＝行星','Cat = planet'),448,80,C.gold,16,'right');label(g,T('看不到','we cannot see it'),448,104,C.faint,15,'right');
      }
    }
  }
  const NB=48;
  function hands(g,s){
    const r=system(g,{...SYS,tt:s.tt,vel:true,labels:1,wph:s.t*5});
    if(s.focus){g.beginPath();g.arc(r.sx,r.sy,19,0,TAU);g.strokeStyle=C.gold;g.lineWidth=1.5;g.setLineDash([3,3]);g.stroke();g.setLineDash([]);}
    ftGraph(g,GB,{bins:s.bins,dot:s.tt});
    const n=s.bins.filter(Boolean).length;label(g,n>=NB?T('一整圈畫完！','Full orbit drawn!'):T('已畫 ','Drawn ')+Math.round(n/NB*100)+'%',GB.x+GB.w,GB.y+30,n>=NB?C.green:C.gold,15,'right');
    if(n===0)label(g,T('拖恆星繞圈 ↻','Drag the star round ↻'),SYS.cx,16,C.gold,15,'center');
  }
  const ttOf=(x,y)=>{const a=Math.atan2(-(y-SYS.cy),x-SYS.cx);return (((a-3*Math.PI/4+Math.PI/2)/TAU)%1+1)%1;};
  function pointer(canvas,h){
    const pt=e=>{const r=canvas.getBoundingClientRect(),k=Math.min(r.width/460,r.height/250);return [(e.clientX-r.left-(r.width-460*k)/2)/k,(e.clientY-r.top-(r.height-250*k)/2)/k];};
    let on=false;
    canvas.addEventListener('pointerdown',e=>{if(h.down(...pt(e))===false)return;on=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();});
    canvas.addEventListener('pointermove',e=>{if(on)h.move(...pt(e));});
    const end=e=>{if(!on)return;on=false;h.up?.(...pt(e));};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  }
  ExamScene.add(13,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,tt:0,bins:Array(NB).fill(false),focus:false}),
    paint,choiceArt,
    preview(g){
      for(const [ox,tt,z,e] of [[0,TT1,'甲時刻','Time 1'],[230,TT2,'乙時刻','Time 2']]){
        system(g,{cx:ox+150,cy:96,rs:21,rp:50,d:78,tt,labels:1.05,rStar:11,neutral:true});label(g,T(z,e),ox+150,24,C.white,18,'center');
      }
      line(g,230,30,230,240,'#35505f',1);
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,btn,complete,render}){
      s.hands=true;s.tt=0;canvas.tabIndex=0;canvas.style.touchAction='none';
      let last=null,done=false,frame=0;
      const beep=f=>{if(LabSettings.get('sound'))LabSound.tone({freq:Math.round(620*f),dur:.06,type:'sine',gain:.08});};
      function go(tt){
        tt=((tt%1)+1)%1;const a=Math.floor(tt*NB)%NB;
        if(last!==null){let d=a-last;if(d>NB/2)d-=NB;if(d<-NB/2)d+=NB;const st=Math.sign(d);for(let i=1;i<=Math.abs(d);i++)s.bins[((last+st*i)%NB+NB)%NB]=true;}
        if(!s.bins[a]){s.bins[a]=true;beep(fAt(tt).f);}
        last=a;s.tt=tt;s.t=performance.now()/1000;
        if(!done&&s.bins.every(Boolean)){done=true;complete();if(LabSettings.get('sound'))LabSound.sweep({from:500,to:1000,dur:.3,gain:.12});}
        render();
      }
      pointer(canvas,{down(x,y){if(Math.hypot(x-SYS.cx,y-SYS.cy)>SYS.rp+24)return false;cancelAnimationFrame(frame);last=Math.floor(s.tt*NB)%NB;go(ttOf(x,y));},move(x,y){go(ttOf(x,y));}});
      canvas.addEventListener('keydown',e=>{const d={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[e.key];if(!d)return;e.preventDefault();cancelAnimationFrame(frame);last=Math.floor(s.tt*NB)%NB;go(s.tt+d/NB);});
      canvas.addEventListener('focus',()=>{s.focus=true;render();});canvas.addEventListener('blur',()=>{s.focus=false;render();});
      btn(T('清除曲線','Clear graph'),()=>{cancelAnimationFrame(frame);s.bins=Array(NB).fill(false);last=null;s.bins[Math.floor(s.tt*NB)%NB]=true;});
      btn(T('▶ 自動繞一圈','▶ Auto: one orbit'),()=>{cancelAnimationFrame(frame);const t0=performance.now(),tt0=s.tt;last=Math.floor(tt0*NB)%NB;
        const tick=now=>{const u=clamp((now-t0)/2500,0,1);go(tt0+u);if(u<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);});
      s.bins[0]=true;last=0;return {};
    },
    read(s,output){const f=fAt(s.tt),n=s.bins.filter(Boolean).length,tag=f.vr>.05?T('靠近測站','approaching'):f.vr<-.05?T('遠離測站','receding'):T('和視線垂直','across the line of sight');
      output.innerHTML='t = '+s.tt.toFixed(2)+' T　'+T('恆星','Star')+' <b>'+tag+'</b>　f/f<sub>0</sub> = <b>'+f.f.toFixed(3)+'</b><br>'+T('已畫 ','Drawn ')+n+' / '+NB+T(' 格（速度放大示意：v = 0.08c）',' slices (speed exaggerated: v = 0.08c)');}
  });
  Exam115.add(13,{choiceArt});
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(13,{groups:{wrong:["靠近是變高還是變低", "Approaching: higher or lower?"],flip:["都卜勒效應", "The Doppler effect"],solve:["一圈裡的頻率", "Frequency over one orbit"],others:["其他選項", "The other choices"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\text{approach}\ \Rightarrow\ f\ ?\ f_0`,flip:[String.raw`\text{靠近}\ f>f_0\ \text{（藍移）}\quad \text{遠離}\ f<f_0\ \text{（紅移）}`,String.raw`\text{approach}\ f>f_0\ \text{(blueshift)}\quad \text{recede}\ f<f_0\ \text{(redshift)}`],solve:[String.raw`\text{甲}:\ f_{\max},\quad \text{乙}:\ f_{\min},\quad \tfrac12\,T`,String.raw`\text{time 1}:\ f_{\max},\quad \text{time 2}:\ f_{\min},\quad \tfrac12\,T`],others:[String.raw`\text{B：記反}\quad \text{C、D：週期不對}`,String.raw`\text{B: reversed}\quad \text{C, D: wrong period}`],trick:[String.raw`\text{靠近變高，遠離變低}`,String.raw`\text{closer: higher; away: lower}`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q13=[
 {
  "id": "Q13_08",
  "row": "wrong",
  "duration": 3.64,
  "disp": "選 B 的人，是把靠近和遠離記反了。",
  "en": "People who chose B mixed up approaching and receding."
 },
 {
  "id": "Q13_09",
  "row": "wrong",
  "duration": 3.48,
  "disp": "靠近的時候，波長被壓縮，還是被拉長？",
  "en": "When it approaches, is the wavelength squeezed or stretched?"
 },
 {
  "id": "Q13_10",
  "row": "wrong",
  "duration": 1.53,
  "disp": "一緊張就搞混。",
  "en": "Under pressure, it's easy to get confused."
 },
 {
  "id": "Q13_11",
  "row": "flip",
  "duration": 2.1,
  "disp": "用救護車記就不會錯。",
  "en": "Remember it with an ambulance and you won't get it wrong."
 },
 {
  "id": "Q13_12",
  "row": "flip",
  "duration": 4.97,
  "disp": "救護車開過來，喔咿喔咿，聲音比較高；開走以後，聲音變低。",
  "en": "When an ambulance comes toward you, nee-naw nee-naw, the pitch is higher; after it passes, the pitch drops."
 },
 {
  "id": "Q13_13",
  "row": "flip",
  "duration": 8.53,
  "disp": "因為救護車往前開，前面的波一個一個被擠在一起，波長變短，所以頻率變高；後面的波被拉開，頻率就變低。",
  "en": "As the ambulance drives forward, the waves ahead get squeezed together, the wavelength shortens, and the frequency rises; the waves behind get stretched, and the frequency falls."
 },
 {
  "id": "Q13_14",
  "row": "flip",
  "duration": 8.27,
  "disp": "注意喔，你要站在路邊聽；如果你是坐在救護車上，聲音就不會變，而且我想你應該也沒有心情聽。",
  "en": "Careful: you have to be standing by the road. If you're riding in the ambulance, the pitch doesn't change, and I doubt you'd be in the mood to listen anyway."
 },
 {
  "id": "Q13_15",
  "row": "flip",
  "duration": 5.36,
  "disp": "光也一樣，靠近，頻率變高，叫藍移；遠離，頻率變低，叫紅移。",
  "en": "Light works the same way: approaching, higher frequency, called blueshift; receding, lower frequency, called redshift."
 },
 {
  "id": "Q13_16",
  "row": "solve",
  "duration": 9.65,
  "disp": "甲時刻，恆星正往地球跑，靠近的速度最大，所以頻率最高；乙時刻，背著地球跑，遠離的速度最大，所以頻率最低。",
  "en": "At time 1 the star runs toward Earth at top approach speed, so the frequency is highest; at time 2 it runs away at top speed, so the frequency is lowest."
 },
 {
  "id": "Q13_17",
  "row": "solve",
  "duration": 6.66,
  "disp": "速度方向和視線垂直的時候，沒有靠近也沒有遠離，測到的就是原本的頻率。",
  "en": "When its velocity is perpendicular to the line of sight, it's neither approaching nor receding, so we measure the original frequency."
 },
 {
  "id": "Q13_18",
  "row": "solve",
  "duration": 2.98,
  "disp": "甲到乙是半圈，剛好半個週期。",
  "en": "From time 1 to time 2 is half a turn, exactly half a period."
 },
 {
  "id": "Q13_19",
  "row": "solve",
  "duration": 2.61,
  "disp": "甲最高、乙最低的，只有 E。",
  "en": "Only E is highest at time 1 and lowest at time 2."
 },
 {
  "id": "Q13_20",
  "row": "others",
  "duration": 2.49,
  "disp": "B 剛好上下顛倒，就是記反了。",
  "en": "B is exactly upside down: approaching and receding swapped."
 },
 {
  "id": "Q13_21",
  "row": "others",
  "duration": 5.92,
  "disp": "C 和 D 的週期只有一半，好像恆星轉一圈，頻率就起伏 2 次，也不對。",
  "en": "C and D have half the period, as if the frequency rose and fell twice per orbit. Also wrong."
 },
 {
  "id": "Q13_22",
  "row": "trick",
  "duration": 3.78,
  "disp": "秒殺口訣：靠近頻率變高，遠離頻率變低。",
  "en": "The shortcut: approaching, the frequency goes up; receding, the frequency goes down."
 },
 {
  "id": "Q13_23",
  "row": "trick",
  "duration": 10.26,
  "disp": "這也是天文學家找系外行星的方法，叫徑向速度法：行星太暗看不到，就看恆星被拉得一晃一晃，光譜線一下藍移、一下紅移。",
  "en": "This is also how astronomers find exoplanets, the radial velocity method: the planet is too dim to see, so watch the star wobble, its spectral lines shifting blue, then red."
 },
 {
  "id": "Q13_24",
  "row": "trick",
  "duration": 6.39,
  "disp": "就像你看不到躲在窗簾後面的貓，可是窗簾一直在動，你就知道後面有貓。",
  "en": "It's like a cat hiding behind the curtain: you can't see it, but the curtain keeps moving, so you know it's there."
 }
];
/* tracks:end */
