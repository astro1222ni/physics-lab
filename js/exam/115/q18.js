/* 115 學測第 18 題 */
(() => {
  // 畫面與動手（Claude 11/27）：月球核反應器。核能紅、電能藍、廢熱灰、質量 Δm 金、每秒次數 R 青，全頁一致。
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,sciText,sciHTML}=K,C=K.colors,D=Exam113Draw,P=Exam115Core,Q=Exam115.questions[18];
  const NUC=C.red,ELE=C.blue,HEAT=C.faint,DM=C.gold,RC=C.teal,EFF=.33,PE=300e6;
  const F=P.fission(),EN=F.E,PN=PE/EFF,RN=F.rate; // E_N≈2.97×10^-11 J、P_N≈9.1×10^8 W、R_N≈3.06×10^19 /s
  const beep=(f,d=.08,type='sine',gain=.1)=>{if(LabSettings.get('sound')&&window.LabSound)LabSound.tone({freq:f,dur:d,type,gain});};
  const mw=W=>Math.round(W/1e6), fmtMW=(W,html)=>{const m=W/1e6;return m<10?m.toFixed(1):m<1e4?String(Math.round(m)):(html?sciHTML:sciText)(m,1);};
  function star(g,x,y,r,color='#ffd36b',alpha=1,inner=.45){
    g.save();g.globalAlpha=alpha;g.beginPath();for(let i=0;i<20;i++){const a=i*Math.PI/10-Math.PI/2,rr=i%2?r*inner:r;g.lineTo(x+rr*Math.cos(a),y+rr*Math.sin(a));}g.closePath();
    const gr=g.createRadialGradient(x,y,1,x,y,r);gr.addColorStop(0,'#fffbe8');gr.addColorStop(1,color);g.fillStyle=gr;g.fill();g.restore();
  }
  const neutron=(g,x,y,r=6)=>D.ball(g,x,y,r,'#a9b8c2');
  // 圖 7：k 0→1：中子射入（0–0.4）→ 分裂飛出（0.4–1）；k≥1 是原卷的樣子
  function fig7(g,k=1,{labels=true,sc=1,ox=0,oy=0}={}){
    g.save();g.translate(ox,oy);g.scale(sc,sc);
    const U=[170,128],stat=k>=1,hit=seg(k,0,.4),fly=stat?1:seg(k,.42,1);
    const prod=[[330,58,26,26],[330,204,24,22]],ns=[[384,98],[394,128],[384,158]];
    if(!stat&&k<.42){D.nucleus(g,U[0],U[1],40,46);neutron(g,40+hit*(U[0]-84),128);}
    else{
      if(stat){D.nucleus(g,U[0],U[1],40,46);
        for(const [px,py] of prod)arrow(g,214,128+(py-128)*.3,px-30,py+(py<128?14:-14),C.white,1.5,8);
        for(const [nx,ny] of ns)arrow(g,226,128+(ny-128)*.5,nx-12,ny,C.white,1.5,8);}
      for(const [px,py,R,nn] of prod)D.nucleus(g,U[0]+(px-U[0])*fly,U[1]+(py-U[1])*fly,R,nn);
      for(const [nx,ny] of ns)neutron(g,U[0]+(nx-U[0])*fly,U[1]+(ny-U[1])*fly);
      star(g,190,128,stat?52:46*(.6+.4*Math.sin(fly*Math.PI)),'#ffb347',1,stat?.64:.45);
      if(stat)sci(g,T('核能 E_{N}','E_{N}'),190,134,'#3a1a00',15,'center',700);
    }
    if(labels){
      neutron(g,40,128);arrow(g,50,128,124,128,C.white,1.5,8);
      label(g,'n',52,120,C.white,16);label(g,T('中子','neutron'),40,154,C.faint,15,'center');
      label(g,T('鈾核 U','U nucleus'),150,72,C.white,17,'center');
      label(g,T('鋇核 Ba','Ba nucleus'),362,40,C.white,17);label(g,T('氪核 Kr','Kr nucleus'),362,236,C.white,17);
      for(const [nx,ny] of ns)label(g,'n',nx+11,ny+6,C.white,16);label(g,T('3 顆中子','3 neutrons'),452,190,C.faint,15,'right');
    }
    g.restore();
  }
  // 能量流（寬度照比例：核能 100%＝電能 33%＋廢熱 67%）
  function sankey(g,{y=34,num=false,hl=null}={}){
    const H=96,he=H*EFF,hh=H-he,x0=20,gx=168,gw=64,x1=gx+gw,x2=420;
    const fat=(x,yy,w,h,color)=>{g.beginPath();g.moveTo(x,yy);g.lineTo(x+w-14,yy);g.lineTo(x+w-14,yy-6);g.lineTo(x+w,yy+h/2);g.lineTo(x+w-14,yy+h+6);g.lineTo(x+w-14,yy+h);g.lineTo(x,yy+h);g.closePath();g.fillStyle=color;g.fill();};
    g.fillStyle=NUC+(hl==='pn'?'ee':'aa');g.fillRect(x0,y,gx-x0,H);
    box(g,gx,y-10,gw,H+20,8,'#1c2d38',C.white+'88',1.5);label(g,T('發電','Gener-'),gx+gw/2,y+H/2-2,C.white,15,'center');label(g,T('機組','ator'),gx+gw/2,y+H/2+17,C.white,15,'center');
    fat(x1,y,x2-x1,he,ELE+(hl==='pe'?'ff':'cc'));fat(x1,y+he+14,x2-x1-40,hh,HEAT+'66');
    sci(g,num?'P_{N} ≈ '+sciText(PN,1)+' W':T('核能功率 P_{N}','Nuclear P_{N}'),x0+8,y+H/2+6,C.white,num?17:18);
    sci(g,num?'P_{e} = '+sciText(PE,0)+' W':T('電功率 P_{e}　33%','Electric P_{e}　33%'),x1+14,y+he/2+6,'#06182a',17,'left',700);
    label(g,T('廢熱 67%','Waste heat 67%'),x1+14,y+he+14+hh/2+6,C.white,16);
    return y+H+20;
  }
  function frac(g,num,den,x,y,color,size=24){
    g.font='600 '+size+'px system-ui,sans-serif';const w=Math.max(g.measureText(num.replace(/[\^_{}]/g,'')).width,g.measureText(den.replace(/[\^_{}]/g,'')).width)*.92+12;
    sci(g,num,x,y-size*.35,color,size,'center');line(g,x-w/2,y,x+w/2,y,color,2);sci(g,den,x,y+size*.95,color,size,'center');return w;
  }
  const strike=(g,x,y,w,color=C.red)=>line(g,x-4,y+4,x+w+4,y-12,color,2.5);
  // 反應前後對照（中子一顆一顆數）
  function panels(g,{cut=false,dim=false}={}){
    const a=dim?'66':'';
    box(g,14,34,176,170,10,'#ffffff08',C.white+'44');box(g,226,34,222,170,10,'#ffffff08',C.white+'44');
    label(g,T('反應前','Before'),102,56,C.faint,16,'center');label(g,T('反應後','After'),337,56,C.faint,16,'center');
    arrow(g,194,120,222,120,C.white,2,9);
    D.nucleus(g,72,122,34,40);neutron(g,154,122,8);
    sci(g,'M_{U}',72,182,C.white+a,18,'center');sci(g,'M_{n}',154,182,C.white+a,18,'center');
    D.nucleus(g,268,98,22,24);D.nucleus(g,268,160,20,20);
    for(let j=0;j<3;j++)neutron(g,330+j*36,128,8);
    sci(g,'M_{Ba}',300,104,C.white+a,17);sci(g,'M_{Kr}',300,166,C.white+a,17);sci(g,'3M_{n}',366,182,C.white+a,18,'center');
    if(cut){line(g,140,108,168,136,C.red,3);line(g,168,108,140,136,C.red,3);line(g,316,114,344,142,C.red,3);line(g,344,114,316,142,C.red,3);}
  }
  function bars(g,x,y,list){ // 選答率長條
    list.forEach(([l,p,col],j)=>{const yy=y+j*34;label(g,l,x,yy+15,col,17);box(g,x+22,yy,p*3,20,5,col+'aa');label(g,p+'%',x+28+p*3,yy+16,col,16);});
  }
  // 數量級軸
  function decades(g,lo,hi,y,marks){
    const X=v=>40+(Math.log10(v)-lo)/(hi-lo)*380;line(g,36,y,424,y,C.white,1.5);
    for(let e=lo;e<=hi;e++){line(g,X(10**e),y-5,X(10**e),y+5,C.faint,1.5);sci(g,'10^{'+String(e).replace('-','−')+'}',X(10**e),y+26,C.faint,15,'center');}
    for(const [v,col,txt,up] of marks){K.dot(g,X(v),y,7,col);sci(g,txt,X(v),up?y-16:y+48,col,17,'center');}
    return X;
  }
  function flashes(g,t,n,area=[10,30,440,200]){
    for(let j=0;j<n;j++){const ph=(t*1.7+j*.137)%1,x=area[0]+((j*.618034+.1)%1)*area[2],y=area[1]+((j*.7548777+.3)%1)*area[3];star(g,x,y,4+10*Math.sin(ph*Math.PI),'#ffb347',1-ph);}
  }
  const id2=id=>+id.slice(4);
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const n=id2(s.id),k=s.part,t=s.t;
    // wrong：D 的想法
    if(n===10||n===11||n===12){
      label(g,T('選 D 的算法','Choice D'),20,34,C.faint,16);
      sci(g,'R_{N} =',40,112,C.white,24);frac(g,'P_{e} × 33%','E_{N}',190,106,C.white,24);
      if(n===10)label(g,T('功率 × 效率 ÷ 每次能量 = 每秒幾次？','power × efficiency ÷ energy each = rate?'),230,206,C.white,17,'center');
      if(n===11){bars(g,300,70,[['D',Q.shares[3],C.red],['E',Q.shares[4],C.green]]);label(g,T('看起來很合理？','Looks reasonable?'),230,214,C.gold,20,'center');}
      if(n===12){if(k>.15)strike(g,186,92,58);label(g,T('效率用反了！','Efficiency used backwards!'),230,206,C.red,22,'center');mark(g,400,104,false,14);}
      return;
    }
    if(n>=13&&n<=15){
      const bottom=sankey(g,{y:34,hl:n===14?'pn':null,num:n===15});
      if(n===13&&k>.3)sci(g,'P_{e} = P_{N} × 33%',230,bottom+44,C.white,22,'center');
      if(n===14&&k>.2)sci(g,'P_{N} > P_{e}',230,bottom+46,C.gold,28,'center');
      if(n===15){sci(g,'P_{N} = P_{e} ÷ 0.33',40,bottom+46,C.white,22);if(k>.4)sci(g,'≈ '+mw(PN)+' MW',290,bottom+46,NUC,22);if(k>.6)mark(g,424,bottom+38,true,10);}
      return;
    }
    if(n===16){ // 榨汁機
      for(const [fx,fy,c] of [[50,110,'#ff9a3a'],[82,100,'#ffcf4d'],[66,136,'#ff7a5c'],[98,130,'#ffb347'],[40,142,'#ffd36b']])D.ball(g,fx,fy,15,c);
      label(g,T('水果','Fruit'),70,184,C.white,17,'center');label(g,'900 mL',70,208,NUC,19,'center');
      arrow(g,126,120,168,120,C.white,2,9);
      box(g,176,72,80,96,12,'#2b3e4a',C.white+'99',1.5);label(g,T('榨汁機','Juicer'),216,112,C.white,16,'center');label(g,'1/3',216,140,C.gold,20,'center');
      arrow(g,262,104,316,94,C.white,2,9);arrow(g,262,140,316,176,HEAT,2,9);
      g.beginPath();g.moveTo(330,58);g.lineTo(338,134);g.lineTo(386,134);g.lineTo(394,58);g.strokeStyle=C.white;g.lineWidth=2;g.stroke();g.fillStyle='#ffb347cc';g.beginPath();g.moveTo(333,86);g.lineTo(338,134);g.lineTo(386,134);g.lineTo(391,86);g.closePath();g.fill();
      label(g,T('果汁 300 mL','Juice 300 mL'),360,34,ELE,17,'center');label(g,T('果渣','Pulp'),360,192,HEAT,16,'center');
      if(k>.45)sci(g,T('核能 9×10^{8} W → 電 3×10^{8} W','nuclear 9×10^{8} W → electric 3×10^{8} W'),230,238,C.white,17,'center');
      return;
    }
    if(n>=17&&n<=21){
      if(n===17){panels(g,{dim:true});sci(g,'A：Δm = M_{U} − (M_{Kr} + M_{Ba})  ?',230,234,C.white,19,'center');return;}
      panels(g,{cut:n>=20&&k>.2||n===21});
      if(n===18)sci(g,T('Δm = 反應前總質量 − 反應後總質量','Δm = mass before − mass after'),230,234,DM,18,'center');
      if(n===19)sci(g,'Δm = (M_{U} + M_{n}) − (M_{Ba} + M_{Kr} + 3M_{n})',230,234,DM,18,'center');
      if(n===20&&k>.35)sci(g,'Δm = M_{U} − M_{Ba} − M_{Kr} − 2M_{n}',230,234,DM,20,'center');
      if(n===21){sci(g,T('A 漏了 2M_{n} → A 錯','A misses 2M_{n} → wrong'),230,234,C.red,20,'center');mark(g,420,226,false,10);}
      return;
    }
    if(n===22||n===23){
      sci(g,'E = mc^{2}',230,96,DM,44,'center');label(g,T('質量 × 光速的平方','mass × (speed of light) squared'),230,140,C.white,18,'center');
      if(n===23){sci(g,'B：E_{N} = Δm × c',230,196,C.red,22,'center');strike(g,140,190,180);label(g,T('少了平方','missing the square'),230,236,C.red,18,'center');mark(g,400,190,false,11);}
      return;
    }
    if(n>=24&&n<=27){
      const on=j=>n>=24+j, col=j=>n===24+j?C.white:C.faint;
      sci(g,'E_{N} = Δm c^{2} = 3.3×10^{−28} × (3×10^{8})^{2}',22,46,col(0),19);
      if(on(1))sci(g,'(3×10^{8})^{2} = 9×10^{16}',22,96,col(1),20);
      if(on(2)){sci(g,'3.3 × 9 = 29.7',22,146,col(2),20);sci(g,'10^{−28} × 10^{16} = 10^{−12}',196,146,col(2),20);label(g,T('次方相加：−28 + 16 = −12','add exponents: −28 + 16 = −12'),196,174,DM,15);}
      if(on(3))sci(g,'E_{N} = 29.7×10^{−12} = 2.97×10^{−11} ≈ 3×10^{−11} J',22,224,C.green,19);
      return;
    }
    if(n===28){
      label(g,T('驗算：課本說一次分裂約 2 億 eV','Check: the textbook says about 200 MeV per fission'),20,36,C.white,17);
      sci(g,'2×10^{8} × 1.6×10^{−19} J ≈ 3.2×10^{−11} J',20,74,RC,19);
      const W=v=>v/3.4e-11*300;
      box(g,120,112,W(EN)*seg(k,.2,.5),26,5,C.green+'bb');box(g,120,156,W(3.2e-11)*seg(k,.2,.5),26,5,RC+'bb');
      label(g,T('我們算的','Ours'),112,131,C.green,16,'right');label(g,T('課本','Textbook'),112,175,RC,16,'right');
      if(k>.5){sci(g,sciText(EN,2)+' J',128,131,'#06182a',16,'left',700);sci(g,'3.2×10^{−11} J',128,175,'#06182a',16,'left',700);}
      if(k>.7){label(g,T('差不多：沒算錯','Close enough: correct'),230,238,C.green,19,'center');}
      return;
    }
    if(n===29){
      sci(g,'C：E_{N} ≈ 3×10^{−8} J ?',230,40,C.red,22,'center');
      const X=decades(g,-12,-7,130,[[EN,C.green,'E_{N}',true],[3e-8,C.red,'C',true]]);
      if(k>.3){line(g,X(EN),164,X(EN),174,DM,2);line(g,X(EN),174,X(3e-8),174,DM,2);line(g,X(3e-8),164,X(3e-8),174,DM,2);label(g,T('差 1000 倍','1000 times off'),(X(EN)+X(3e-8))/2,204,DM,17,'center');}
      if(k>.6)mark(g,X(3e-8)+20,96,false,10);
      return;
    }
    if(n===32){sci(g,'E：R_{N} ≈ 3×10^{19} Hz',230,96,RC,28,'center');sci(g,'Hz = 1/s',230,150,C.white,20,'center');label(g,T('每秒發生幾次','events per second'),230,186,C.faint,17,'center');return;}
    if(n===33){const b=sankey(g,{y:34,num:true});sci(g,'P_{N} = 3×10^{8} ÷ 0.33 ≈ '+sciText(PN,0)+' W',230,b+44,NUC,21,'center');return;}
    if(n===34){
      sci(g,'W = J/s',230,64,C.white,32,'center');
      const cx=110,cy=164,a=t*Math.PI*2;g.beginPath();g.arc(cx,cy,40,0,Math.PI*2);g.strokeStyle=C.white;g.lineWidth=2;g.stroke();line(g,cx,cy,cx+32*Math.sin(a),cy-32*Math.cos(a),C.gold,2.5);label(g,'1 s',cx,cy+62,C.faint,16,'center');
      sci(g,T('核能每秒放出','Nuclear energy each second:'),186,150,C.white,18);sci(g,sciText(PN,0)+' J',186,186,NUC,24);
      return;
    }
    if(n===35){fig7(g,(t*.4)%1.4,{labels:false,sc:.66,ox:4,oy:40});sci(g,T('每一次反應','Each reaction'),300,96,C.white,18);sci(g,'E_{N} ≈ 3×10^{−11} J',300,134,DM,21);return;}
    if(n===36){label(g,T('每秒要反應幾次？','How many reactions per second?'),230,100,C.gold,26,'center');sci(g,'R_{N} = ?',230,170,RC,30,'center');return;}
    if(n===37){sci(g,'R_{N} =',40,128,RC,26);frac(g,'P_{N}','E_{N}',170,122,C.white,26);label(g,T('每秒的總能量','energy per second'),250,100,NUC,17);label(g,T('÷ 每一次的能量','÷ energy per event'),250,158,DM,17);return;}
    if(n===38){
      sci(g,'R_{N} =',24,128,RC,24);frac(g,'9×10^{8}','3×10^{−11}',170,122,C.white,24);
      if(k>.2)label(g,'9 ÷ 3 = 3',290,96,C.white,20);
      if(k>.5){sci(g,'10^{8} ÷ 10^{−11}',290,142,C.white,20);label(g,T('8 − (−11) = 19','8 − (−11) = 19'),290,176,DM,18);}
      if(k>.8)sci(g,'= 10^{19}',290,214,C.white,20);
      return;
    }
    if(n===39){
      flashes(g,t,Math.round(10+70*seg(k,.1,.7)));
      box(g,60,90,340,70,12,'#0c2535e6',C.green,2);sci(g,T('R_{N} ≈ 3×10^{19} 次/秒','R_{N} ≈ 3×10^{19} per second'),230,136,C.green,26,'center');
      if(k>.6){box(g,160,182,150,38,10,'#0c2535e6',C.green,1.5);label(g,T('E 對','E is right'),220,208,C.green,22,'center');mark(g,280,200,true,10);}
      return;
    }
    if(n===40){
      D.nucleus(g,140,140,52,48,.6);
      for(const [dx,dy] of [[52,-46],[64,-20],[-50,-52]]){const y=140+dy+((t*30+dx)%18);g.beginPath();g.moveTo(140+dx,y-9);g.quadraticCurveTo(140+dx+6,y,140+dx,y+5);g.quadraticCurveTo(140+dx-6,y,140+dx,y-9);g.fillStyle='#9fd8ff';g.fill();}
      box(g,226,44,214,56,12,'#ffffff18',C.white+'88');label(g,T('我也很忙的好嗎','I am busy too, okay?'),333,79,C.white,18,'center');
      sci(g,T('已分裂 ','Fissions so far: ')+sciText(RN*Math.max(t,.01),1)+T(' 次',''),230,170,RC,19);
      label(g,T('（從這句開始算）','(since this line began)'),230,198,C.faint,15);
      return;
    }
    if(n===41){box(g,60,64,340,112,14,'#ffd17e1f',C.gold,2);label(g,T('秒殺','Shortcut'),230,104,C.gold,20,'center');label(g,T('單位對單位','Match the units'),230,146,C.white,28,'center');return;}
    if(n===42){
      sci(g,T('次/s','events/s'),40,100,RC,24);sci(g,'= W ÷ J',140,100,C.white,24);
      if(k>.3){let x=140;x+=sci(g,'= (',x,160,C.white,24);const j1=x;x+=sci(g,'J',x,160,C.white,24);x+=sci(g,'/s) ÷ ',x,160,C.white,24);const j2=x,wj=sci(g,'J',x,160,C.white,24);if(k>.55){strike(g,j1,158,wj,DM);strike(g,j2,158,wj,DM);}}
      if(k>.7)sci(g,'= 1/s',300,160,C.green,24);
      return;
    }
    // 43：核能一定比電能多
    sankey(g,{y:24});
    sci(g,'P_{e} ÷ 0.33 = '+mw(PN)+' MW > 300 MW',36,176,C.green,19);mark(g,420,170,true,9);
    if(k>.4){sci(g,'P_{e} × 0.33 = '+mw(PE*EFF)+' MW < 300 MW',36,222,C.red,19);mark(g,420,216,false,9);}
  }
  // 能動手：拖 R_N（對數軸）看電功率落在哪
  const LX=lg=>40+(lg-17)*95, XL=x=>17+(x-40)/95, PX=MW=>60+MW*.27;
  function hands(g,s){
    const R=10**s.lg,Pn=R*EN,Pe=Pn*EFF,ok=Math.abs(Pe-PE)<=.05*PE;
    sci(g,T('每秒分裂次數 R_{N} = ','Fissions per second R_{N} = ')+sciText(R,2)+T(' 次/s',' /s'),20,24,RC,17);
    line(g,LX(17),56,LX(21),56,C.white,2);
    for(let e=17;e<=21;e++){line(g,LX(e),50,LX(e),62,C.faint,1.5);sci(g,'10^{'+e+'}',LX(e),84,C.faint,15,'center');}
    K.dot(g,LX(s.lg),56,12,RC+'55');K.dot(g,LX(s.lg),56,7,RC);
    // 功率長條（0–1000 MW，同一尺度）
    const bar=(y,W,col,name)=>{const w=PX(Math.min(W/1e6,1000))-PX(0);box(g,PX(0),y,Math.max(1,w),18,4,col+'cc');if(W/1e6>1000)arrow(g,PX(1000)-2,y+9,PX(1000)+12,y+9,col,2,8);sci(g,name,PX(0)-6,y+15,col,17,'right');
      sci(g,fmtMW(W)+' MW',344,y+15,col,17);};
    g.fillStyle=C.gold+'33';g.fillRect(PX(285),142,PX(315)-PX(285),44);line(g,PX(300),136,PX(300),192,C.gold,1.5,[3,3]);
    bar(108,Pn,NUC,'P_{N}');bar(154,Pe,ELE,'P_{e}');
    line(g,PX(0),196,PX(1000),196,C.faint,1);for(const v of [0,300,600,900])label(g,String(v),PX(v),214,v===300?C.gold:C.faint,15,'center');label(g,'MW',PX(1000)+6,214,C.faint,15);
    if(s.dMode)label(g,T('D 的算法：電功率只有 ','Choice D: only ')+fmtMW(Pe)+' MW',230,242,C.red,16,'center');
    else sci(g,ok?T('達標：300 MW ±5%','On target: 300 MW ±5%'):T('目標：P_{e} 落在金色帶','Goal: P_{e} inside the gold band'),230,242,ok?C.green:C.gold,16,'center');
  }
  ExamScene.add(18,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,lg:18,dMode:false,ok:false,done:false}),
    paint,
    preview(g){K.boost(1.2,()=>fig7(g,1));},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,btn,complete,render}){
      s.hands=true;let r,lastTick=180;
      function set(lg,d=false){
        lg=clamp(Math.round(lg*100)/100,17,21);s.dMode=d;s.lg=lg;r.input.value=Math.round(lg*100);r.val.textContent=(10**lg/1e19).toPrecision(3);
        const Pe=10**lg*EN*EFF,ok=Math.abs(Pe-PE)<=.05*PE;
        if(Math.round(lg*10)!==lastTick){lastTick=Math.round(lg*10);beep(260+(lg-17)*110,.04,'triangle',.05);}
        if(ok&&!s.ok){beep(784,.12,'sine',.12);beep(1047,.18,'sine',.1);}
        s.ok=ok;if(ok&&!s.done){s.done=true;complete();}
      }
      r=range(T('每秒分裂次數','Fissions per second'),1700,2100,1800,v=>set(v/100));r.val.textContent='0.100';
      r.input.parentElement.querySelector('span').innerHTML=T('R<sub>N</sub>（×10<sup>19</sup> 次/s）','R<sub>N</sub> (×10<sup>19</sup> /s)'); // 讀數欄只放得下約 5 個字，單位寫進名稱
      btn('÷ 10',()=>set(s.lg-1));btn('× 10',()=>set(s.lg+1));
      btn(T('套用 D 的算法','Try choice D'),()=>set(Math.log10(PE*EFF/EN),true));
      canvas.tabIndex=0;canvas.setAttribute('aria-label',T('拖曳青色點設定每秒分裂次數；方向鍵左右微調','Drag the teal dot to set the fission rate; arrow keys fine-tune'));
      canvas.addEventListener('keydown',e=>{const d={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[e.key];if(d){set(s.lg+d*(e.shiftKey?.1:.01));e.preventDefault();render();}});
      return {hit:(x,y)=>y>28&&y<96?0:null,move:(_,x)=>{set(XL(x));render();}};
    },
    read(s,output){
      const R=10**s.lg,Pn=R*EN,Pe=Pn*EFF,ok=Math.abs(Pe-PE)<=.05*PE;
      output.innerHTML='R<sub>N</sub> = '+sciHTML(R,2)+' '+T('次/s','/s')+'　E<sub>N</sub> = Δm c<sup>2</sup> = '+sciHTML(EN,2)+' J<br>P<sub>N</sub> = R<sub>N</sub>E<sub>N</sub> = '+sciHTML(Pn,2)+' W　P<sub>e</sub> = 33% × P<sub>N</sub> = <b>'+fmtMW(Pe,true)+' MW</b>'+(ok?T('　達標：R<sub>N</sub> 約 3×10<sup>19</sup>，答案 E','　On target: R<sub>N</sub> ≈ 3×10<sup>19</sup>, answer E'):'');
    }
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(18,{groups:{wrong:["乘還是除 33%？", "Multiply or divide by 33%?"],flip:["電功率比核功率小", "Electric power is less than nuclear power"],solveA:["少掉的質量", "The missing mass"],solveBC:["一次分裂的能量", "Energy per fission"],solveE:["每秒幾次", "Fissions per second"],jokeE:["核能比電能大", "Nuclear beats electric"],trick:["口訣", "The rule"]},board:{wrong:String.raw`P_e\times33\%\div E_N\ ?`,flip:String.raw`P_e=P_N\times33\%\ \Rightarrow\ P_N=\dfrac{P_e}{0.33}`,solveA:String.raw`\Delta m=M_{\mathrm U}-M_{\mathrm{Ba}}-M_{\mathrm{Kr}}-2M_n`,solveBC:String.raw`E_N=\Delta m\,c^{2}=3.3\times10^{-28}\times(3\times10^{8})^{2}\approx3\times10^{-11}\ \mathrm{J}`,solveE:String.raw`R_N=\dfrac{P_N}{E_N}=\dfrac{9\times10^{8}}{3\times10^{-11}}=3\times10^{19}\ \mathrm{s^{-1}}`,jokeE:String.raw`P_N>P_e`,trick:[String.raw`\dfrac{\text{次}}{\mathrm{s}}=\dfrac{\mathrm{W}}{\mathrm{J}}`,String.raw`\dfrac{\text{events}}{\mathrm{s}}=\dfrac{\mathrm{W}}{\mathrm{J}}`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q18=[
 {
  "id": "Q18_10",
  "row": "wrong",
  "duration": 7.1,
  "disp": "選 D 的人是這樣想的：功率乘以效率，再除以每一次的能量，就是每秒幾次。",
  "en": "People who chose D thought: power times efficiency, divided by the energy per reaction, gives reactions per second."
 },
 {
  "id": "Q18_11",
  "row": "wrong",
  "duration": 2.5,
  "disp": "看起來很合理，對不對？",
  "en": "Looks reasonable, right?"
 },
 {
  "id": "Q18_12",
  "row": "flip",
  "duration": 1.9,
  "disp": "可是方向搞反了。",
  "en": "But it's backwards."
 },
 {
  "id": "Q18_13",
  "row": "flip",
  "duration": 8.3,
  "disp": "33% 是核能變成電能的效率，意思是：電功率，等於核能功率乘以 33%。",
  "en": "33% is the efficiency from nuclear to electric energy: electric power equals nuclear power times 33%."
 },
 {
  "id": "Q18_14",
  "row": "flip",
  "duration": 3.3,
  "disp": "所以核能功率，一定比電功率大。",
  "en": "So the nuclear power must be bigger than the electric power."
 },
 {
  "id": "Q18_15",
  "row": "flip",
  "duration": 5.9,
  "disp": "反過來求核能功率，要用電功率除以 33%，不是乘以。",
  "en": "To get the nuclear power, divide the electric power by 33%, don't multiply."
 },
 {
  "id": "Q18_16",
  "row": "flip",
  "duration": 8.7,
  "disp": "打個比喻，榨汁機只榨得出 1/3，你要喝 300 毫升的果汁，就得準備 900 毫升份量的水果。",
  "en": "It's like a juicer that only gets 1/3 out: to drink 300 mL of juice, you need 900 mL worth of fruit."
 },
 {
  "id": "Q18_17",
  "row": "solveA",
  "duration": 1.7,
  "disp": "A 問質量損失。",
  "en": "A asks about the mass loss."
 },
 {
  "id": "Q18_18",
  "row": "solveA",
  "duration": 5.3,
  "disp": "質量損失，等於反應前的總質量，減掉反應後的總質量。",
  "en": "Mass loss is the total mass before the reaction minus the total mass after."
 },
 {
  "id": "Q18_19",
  "row": "solveA",
  "duration": 6.5,
  "disp": "反應前是鈾核，加上 1 顆中子；反應後是鋇核、氪核，加上 3 顆中子。",
  "en": "Before: a uranium nucleus plus 1 neutron. After: barium and krypton nuclei plus 3 neutrons."
 },
 {
  "id": "Q18_20",
  "row": "solveA",
  "duration": 4.5,
  "disp": "前後的中子抵消掉 1 顆，還要再減掉 2 顆中子。",
  "en": "One neutron cancels on each side, leaving 2 more neutrons to subtract."
 },
 {
  "id": "Q18_21",
  "row": "solveA",
  "duration": 2.5,
  "disp": "A 漏了中子，所以 A 錯。",
  "en": "A forgot the neutrons, so A is wrong."
 },
 {
  "id": "Q18_22",
  "row": "solveBC",
  "duration": 5.9,
  "disp": "B，質能互變的公式是 E 等於 m c 平方，質量乘以光速的平方。",
  "en": "B: mass-energy equivalence is E equals m c squared, mass times the speed of light squared."
 },
 {
  "id": "Q18_23",
  "row": "solveBC",
  "duration": 4.1,
  "disp": "B 只乘了一次光速，少了平方，所以 B 錯。",
  "en": "B multiplies by the speed of light only once, missing the square, so B is wrong."
 },
 {
  "id": "Q18_24",
  "row": "solveBC",
  "duration": 7.7,
  "disp": "C 我們來算：E 等於 \\(3.3\\times10^{-28}\\)，乘以 \\((3\\times10^{8})^{2}\\)。",
  "en": "C, let's calculate: E equals \\(3.3\\times10^{-28}\\) times (\\(3\\times10^{8}\\)) squared."
 },
 {
  "id": "Q18_25",
  "row": "solveBC",
  "duration": 5.1,
  "disp": "\\(3\\times10^{8}\\)，平方以後是 \\(9\\times10^{16}\\)。",
  "en": "\\(3\\times10^{8}\\) squared is \\(9\\times10^{16}\\)."
 },
 {
  "id": "Q18_26",
  "row": "solveBC",
  "duration": 9.3,
  "disp": "3.3×9 等於 29.7；\\(10^{-28}\\)×\\(10^{16}\\)，次方相加，是 \\(10^{-12}\\)。",
  "en": "3.3 times 9 is 29.7; \\(10^{-28}\\) times \\(10^{16}\\), adding the exponents, is \\(10^{-12}\\)."
 },
 {
  "id": "Q18_27",
  "row": "solveBC",
  "duration": 9.5,
  "disp": "\\(29.7\\times10^{-12}\\)，就是 \\(2.97\\times10^{-11}\\)，大約 \\(3\\times10^{-11}\\) 焦耳。",
  "en": "\\(29.7\\times10^{-12}\\) is \\(2.97\\times10^{-11}\\), about \\(3\\times10^{-11}\\) joules."
 },
 {
  "id": "Q18_28",
  "row": "solveBC",
  "duration": 12.9,
  "disp": "我們來驗算一下：課本說核分裂一次大約放出 2 億電子伏特，換成焦耳，大約是 \\(3.2\\times10^{-11}\\)，跟我們算的差不多，表示沒算錯。",
  "en": "Let's check: textbooks say one fission releases about 200 million electron volts, which is about \\(3.2\\times10^{-11}\\) joules. That's close to ours, so the math is right."
 },
 {
  "id": "Q18_29",
  "row": "solveBC",
  "duration": 3.1,
  "disp": "不是 \\(10^{-8}\\)，所以 C 錯。",
  "en": "It isn't \\(10^{-8}\\), so C is wrong."
 },
 {
  "id": "Q18_32",
  "row": "solveE",
  "duration": 1.3,
  "disp": "最後看 E。",
  "en": "Finally, E."
 },
 {
  "id": "Q18_33",
  "row": "solveE",
  "duration": 8.1,
  "disp": "先求核能功率：電功率 \\(3\\times10^{8}\\) 瓦，除以 0.33，大約 \\(9\\times10^{8}\\) 瓦。",
  "en": "First the nuclear power: electric power \\(3\\times10^{8}\\) watts divided by 0.33, about \\(9\\times10^{8}\\) watts."
 },
 {
  "id": "Q18_34",
  "row": "solveE",
  "duration": 6.3,
  "disp": "因為瓦特就是焦耳每秒，所以核能每秒放出 \\(9\\times10^{8}\\) 焦耳。",
  "en": "A watt is a joule per second, so the nuclear energy released each second is \\(9\\times10^{8}\\) joules."
 },
 {
  "id": "Q18_35",
  "row": "solveE",
  "duration": 4.5,
  "disp": "每一次反應，放出 \\(3\\times10^{-11}\\) 焦耳。",
  "en": "Each reaction releases \\(3\\times10^{-11}\\) joules."
 },
 {
  "id": "Q18_36",
  "row": "solveE",
  "duration": 1.9,
  "disp": "每秒要反應幾次？",
  "en": "How many reactions per second?"
 },
 {
  "id": "Q18_37",
  "row": "solveE",
  "duration": 3.9,
  "disp": "就用每秒的總能量，除以每一次的能量。",
  "en": "Divide the total energy per second by the energy per reaction."
 },
 {
  "id": "Q18_38",
  "row": "solveE",
  "duration": 8.1,
  "disp": "9÷3 等於 3；\\(10^{8}\\)÷\\(10^{-11}\\)，次方相減，8 減−11，等於 19。",
  "en": "9 divided by 3 is 3; \\(10^{8}\\) divided by \\(10^{-11}\\), subtracting exponents, 8 minus negative 11, is 19."
 },
 {
  "id": "Q18_39",
  "row": "solveE",
  "duration": 5.1,
  "disp": "所以每秒大約 \\(3\\times10^{19}\\) 次，選項 E 是對的。",
  "en": "So about \\(3\\times10^{19}\\) reactions per second. E is right."
 },
 {
  "id": "Q18_40",
  "row": "jokeE",
  "duration": 5.5,
  "disp": "每秒分裂 \\(3\\times10^{19}\\) 次，鈾核：我也很忙的好嗎。",
  "en": "Splitting \\(3\\times10^{19}\\) times a second. Uranium nucleus: I'm busy too, you know."
 },
 {
  "id": "Q18_41",
  "row": "trick",
  "duration": 2.1,
  "disp": "秒殺：單位對單位。",
  "en": "The shortcut: match the units."
 },
 {
  "id": "Q18_42",
  "row": "trick",
  "duration": 5.3,
  "disp": "每秒幾次，就是瓦特除以焦耳，因為瓦特就是焦耳每秒。",
  "en": "Reactions per second is watts divided by joules, because a watt is a joule per second."
 },
 {
  "id": "Q18_43",
  "row": "trick",
  "duration": 5.7,
  "disp": "效率要放分子還是分母，用一句話檢查：核能一定比電能多。",
  "en": "Not sure whether the efficiency goes on top or bottom? One check: nuclear energy is always more than electric energy."
 }
];
/* tracks:end */
