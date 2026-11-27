/* 115 學測第 14 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,dot}=K,C=K.colors,D=Exam113Draw,P=Exam115Core;
  const TAU=2*Math.PI;
  // 距離用字幕說的數量級：核內 10^-15 m、電子到核 10^-10 m（四種力全部由 heliumForces 算）
  const R_NUC=1e-15,R_ATOM=1e-10,F=P.heliumForces(R_NUC,R_ATOM);
  const RATIO13=F.pp/F.pe,RATIO_G=F.nnGravity/F.pp,RATIO_S=F.strong/F.pp;
  const lg=v=>Math.log10(v),ex=v=>Math.round(lg(v));
  // 四種力：甲 p–p 靜電、乙 n–n 重力、丙 p–e 靜電、丁 p–p 強力（全頁同色）
  const FORCES=[
    {zh:'甲',en:'1',v:F.pp,col:C.gold,name:['p–p 靜電力','p–p electric']},
    {zh:'乙',en:'2',v:F.nnGravity,col:C.green,name:['n–n 重力','n–n gravity']},
    {zh:'丙',en:'3',v:F.pe,col:C.blue,name:['p–e 靜電力','p–e electric']},
    {zh:'丁',en:'4',v:F.strong,col:C.violet,name:['p–p 強力','p–p strong']}];
  const nm=i=>T(FORCES[i].zh,FORCES[i].en);
  const ANSWER=[3,0,2,1]; // 由大到小：丁＞甲＞丙＞乙（由數值排序驗證）
  const sorted=[0,1,2,3].sort((a,b)=>FORCES[b].v-FORCES[a].v);
  if(sorted.join()!==ANSWER.join())console.warn('Q14 排序與答案不符',sorted);
  const PROTON='#e8705f',NEUTRON='#a9b8c2',ELECTRON='#dfeaff';
  function particle(g,x,y,r,kind){D.ball(g,x,y,r,kind==='p'?PROTON:kind==='n'?NEUTRON:ELECTRON);
    if(kind!=='n')label(g,kind==='p'?'+':'−',x,y+r*.45,kind==='p'?'#fff':'#16324a',r*1.25,'center');}
  // 氦原子（不照比例）：核在 (cx,cy)，電子軌道半徑 R
  function atom(g,cx,cy,R,o={}){
    g.beginPath();g.ellipse(cx,cy,R,R*.42,-.3,0,TAU);g.strokeStyle='#ffffff40';g.lineWidth=1.2;g.stroke();
    const s=o.nr||7;[['p',-1,-1],['n',1,-1],['n',-1,1],['p',1,1]].forEach(([k,a,b])=>particle(g,cx+a*s*.9,cy+b*s*.9,s,k));
    const es=[0,Math.PI].map(a=>{const x=cx+R*Math.cos(a)*Math.cos(-.3)-R*.42*Math.sin(a)*Math.sin(-.3),y=cy+R*Math.cos(a)*Math.sin(-.3)+R*.42*Math.sin(a)*Math.cos(-.3);return [x,y];});
    es.forEach(([x,y])=>particle(g,x,y,o.er||6,'e'));
    return {es,p:[[cx-s*.9,cy-s*.9],[cx+s*.9,cy+s*.9]],n:[[cx+s*.9,cy-s*.9],[cx-s*.9,cy+s*.9]]};
  }
  // 原子核特寫：兩質子在左右、兩中子在上下
  function nucleus(g,cx,cy,r){const d=r*1.05;particle(g,cx-d,cy,r,'p');particle(g,cx+d,cy,r,'p');particle(g,cx,cy-d*.95,r,'n');particle(g,cx,cy+d*.95,r,'n');return {p1:[cx-d,cy],p2:[cx+d,cy],n1:[cx,cy-d*.95],n2:[cx,cy+d*.95]};}
  function dim(g,x1,y1,x2,y2,txt,col,dy=-12){line(g,x1,y1,x2,y2,col,2);for(const [x,y] of [[x1,y1],[x2,y2]])line(g,x,y-6,x,y+6,col,2);if(txt)sci(g,txt,(x1+x2)/2,(y1+y2)/2+dy,col,16,'center');}
  // 分數：num 在上、den 在下
  function frac(g,x,y,num,den,col,size=20){g.font='600 '+size+'px system-ui,sans-serif';const w=Math.max(g.measureText(num.replace(/[\^_{}]/g,'')).width,g.measureText(den.replace(/[\^_{}]/g,'')).width)+8;
    sci(g,num,x,y-6,col,size,'center');line(g,x-w/2,y,x+w/2,y,col,2);sci(g,den,x,y+size+2,col,size,'center');return w;}
  // 對數尺（橫）：a..b 是 10 的次方
  function ruler(g,o){
    const {x,y,w,a,b}=o,X=e=>x+(e-a)/(b-a)*w;
    line(g,x,y,x+w,y,C.faint,2);for(let e=Math.ceil(a/5)*5;e<=b;e+=5){line(g,X(e),y-4,X(e),y+4,C.faint,1.5);if(e%10===0)sci(g,'10^{'+String(e).replace('-','−')+'}',X(e),y+24,C.faint,15,'center');}
    label(g,T('力（N）・對數尺','Force (N) · log scale'),x+w,y-58,C.faint,15,'right');
    const show=o.show||[0,1,2,3];const pos=show.map(i=>({i,x:X(lg(FORCES[i].v))})).sort((p,q)=>p.x-q.x);
    for(let j=1;j<pos.length;j++)pos[j].lx=Math.max(pos[j].x,(pos[j-1].lx??pos[j-1].x)+24);if(pos.length)pos[0].lx=pos[0].x;
    for(const p of pos){const f=FORCES[p.i];g.beginPath();g.moveTo(p.x,y-3);g.lineTo(p.x-6,y-14);g.lineTo(p.x+6,y-14);g.closePath();g.fillStyle=f.col;g.fill();
      line(g,p.x,y-14,p.lx,y-22,f.col,1.2);label(g,nm(p.i),p.lx,y-28,f.col,18,'center');}
    return X;
  }
  function bracket(g,x1,x2,y,txt,col){line(g,x1,y,x2,y,col,2);line(g,x1,y,x1,y+8,col,2);line(g,x2,y,x2,y+8,col,2);sci(g,txt,(x1+x2)/2,y-8,col,16,'center');}
  const RU={x:40,y:150,w:390,a:-36,b:6};
  function choicesList(g,k){const L=ExamPaper.questions[14].choices,ok='C';
    'ABCDE'.split('').forEach((c,i)=>{const y=40+i*42,show=k>i*.15;if(!show)return;label(g,'('+c+')',70,y+6,C.white,18);label(g,T(L[i][0],L[i][1]),112,y+6,c===ok?C.green:C.white,18);mark(g,330,y,c===ok,10);});}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const id=s.id,k=s.part,t=s.t;
    switch(id){
      case 'Q14_09':case 'Q14_10':case 'Q14_11':{
        // 左：甲（核內兩質子），右：丙（質子與電子）；電量一樣
        label(g,nm(0),110,34,C.gold,20,'center');particle(g,90,96,13,'p');particle(g,130,96,13,'p');line(g,103,96,117,96,C.gold,3);
        label(g,nm(2),340,34,C.blue,20,'center');particle(g,270,96,13,'p');particle(g,420,96,9,'e');line(g,283,96,411,96,C.blue,3);
        sci(g,'+e  +e',110,140,C.white,17,'center');sci(g,'+e  −e',345,140,C.white,17,'center');
        if(id==='Q14_09')label(g,T('電量一樣大 → 甲＝丙？','Same charge size → 1 = 3?'),230,206,C.gold,20,'center');
        if(id==='Q14_10'){label(g,T('電量一樣，力就一樣？','Same charge, same force?'),230,200,C.gold,20,'center');}
        if(id==='Q14_11'){label(g,T('一樣的只有電量','Only the charges match'),230,196,C.white,18,'center');if(k>.4)label(g,T('還有一個量沒比……','One quantity is still missing…'),230,228,C.red,18,'center');}
        return;}
      case 'Q14_12':{const a=atom(g,130,130,95);g.beginPath();g.arc(130,130,22,0,TAU);g.strokeStyle=C.gold;g.lineWidth=1.5;g.stroke();
        line(g,152,124,300,60,'#ffd17e66',1);line(g,152,136,300,200,'#ffd17e66',1);g.beginPath();g.arc(370,130,78,0,TAU);g.fillStyle='#0b1d28';g.fill();g.strokeStyle=C.gold;g.stroke();
        const n=nucleus(g,370,130,26);dim(g,n.p1[0],n.p1[1],n.p2[0],n.p2[1],'',C.gold);sci(g,'r_{'+T('甲','1')+'} = ?',370,234,C.gold,18,'center');dim(g,130,130,a.es[0][0],a.es[0][1],'',C.blue);sci(g,'r_{'+T('丙','3')+'} = ?',90,240,C.blue,18,'center');label(g,T('你忘了距離','You forgot the distance'),230,24,C.red,19,'center');return;}
      case 'Q14_13':{atom(g,110,130,88);g.beginPath();g.arc(110,130,22,0,TAU);g.strokeStyle=C.gold;g.lineWidth=1.5;g.stroke();
        const z=ease(seg(k,0,.5));line(g,132,124,132+(270-132)*z,124-(124-52)*z,'#ffd17e66',1);line(g,132,136,132+(270-132)*z,136+(208-136)*z,'#ffd17e66',1);
        if(z>.98){g.beginPath();g.arc(350,130,82,0,TAU);g.fillStyle='#0b1d28';g.fill();g.strokeStyle=C.gold;g.stroke();const n=nucleus(g,350,130,26);
          line(g,n.p1[0],n.p1[1],n.p1[0],n.p1[1]+50,'#ffd17e99',1,[3,3]);line(g,n.p2[0],n.p2[1],n.p2[0],n.p2[1]+50,'#ffd17e99',1,[3,3]);dim(g,n.p1[0],n.p1[1]+50,n.p2[0],n.p2[1]+50,'',C.gold);sci(g,'r_{'+T('甲','1')+'} ≈ 10^{−15} m',350,236,C.gold,18,'center');label(g,T('放大 10 萬倍','Zoomed in 100 000×'),350,30,C.faint,15,'center');}
        label(g,T('原子核裡的兩個質子','Two protons in the nucleus'),110,24,C.white,16,'center');return;}
      case 'Q14_14':{const a=atom(g,230,120,150,{nr:6,er:8}),e=a.es[0];dim(g,230,120,e[0],e[1],'',C.blue);
        sci(g,'r_{'+T('丙','3')+'} ≈ 10^{−10} m',300,232,C.blue,18,'center');label(g,T('電子在原子核外面（不照比例）','Electron outside the nucleus (not to scale)'),230,24,C.white,16,'center');return;}
      case 'Q14_15':{const X=e=>50+(e+16)*360/8;line(g,40,140,430,140,C.faint,2);for(let e=-16;e<=-8;e++){line(g,X(e),136,X(e),144,C.faint,1.5);if(e===-15||e===-10)sci(g,'10^{'+String(e).replace('-','−')+'}',X(e),166,e===-15||e===-10?C.white:C.faint,15,'center');}
        label(g,T('距離（m）・對數尺','Distance (m) · log scale'),430,200,C.faint,15,'right');
        dot(g,X(-15),140,7,C.gold);dot(g,X(-10),140,7,C.blue);sci(g,'r_{'+T('甲','1')+'}',X(-15),120,C.gold,18,'center');sci(g,'r_{'+T('丙','3')+'}',X(-10),120,C.blue,18,'center');
        if(k>.3)bracket(g,X(-15),X(-10),80,T('5 個次方＝10^{5} 倍','5 powers = 10^{5} times'),C.white);return;}
      case 'Q14_16':{sci(g,'F =',150,128,C.white,26,'right');frac(g,215,122,'k q_{1} q_{2}','r^{2}',C.white,26);label(g,T('庫侖定律','Coulomb’s law'),230,44,C.teal,18,'center');
        if(k>.5)label(g,T('距離的平方在分母','Distance squared below'),230,214,C.gold,17,'center');return;}
      case 'Q14_17':{const ra=T('甲','1'),rc=T('丙','3');sci(g,'F_{'+ra+'} =',120,82,C.gold,22,'right');frac(g,180,76,'k e·e','r_{'+ra+'}^{2}',C.gold,22);
        sci(g,'F_{'+rc+'} =',330,82,C.blue,22,'right');frac(g,390,76,'k e·e','r_{'+rc+'}^{2}',C.blue,22);
        box(g,150,46,60,30,6,null,C.white,1.5);box(g,360,46,60,30,6,null,C.white,1.5);
        sci(g,T('電量一樣 → 只看距離的平方','Same charges → only r^{2} matters'),230,170,C.white,18,'center');return;}
      case 'Q14_18':{const a=T('甲','1'),c=T('丙','3');sci(g,'F_{'+a+'} / F_{'+c+'}',100,78,C.white,22,'center');sci(g,'= (r_{'+c+'} / r_{'+a+'})^{2}',290,78,C.white,22,'center');
        if(k>.3)sci(g,'= (10^{'+ex(R_ATOM/R_NUC)+'})^{2}',230,140,C.white,24,'center');if(k>.6)sci(g,'= 10^{'+ex(RATIO13)+'}',230,200,C.gold,28,'center');return;}
      case 'Q14_19':{const X=ruler(g,{...RU,show:[0,2]});bracket(g,X(lg(F.pe)),X(lg(F.pp)),64,'10^{'+ex(RATIO13)+'} '+T('倍＝100 億倍','times = 10 billion'),C.gold);
        label(g,T('甲 ≫ 丙','1 ≫ 3'),230,226,C.gold,20,'center');return;}
      case 'Q14_20':{const n=nucleus(g,150,125,30);label(g,T('中子不帶電','Neutrons: no charge'),150,26,NEUTRON,17,'center');
        line(g,n.n1[0],n.n1[1],n.n2[0],n.n2[1],C.green,3);label(g,nm(1),166,128,C.green,18);
        label(g,T('沒有靜電力','No electric force'),340,100,C.white,18,'center');label(g,T('只有重力','Only gravity'),340,140,C.green,20,'center');return;}
      case 'Q14_21':{particle(g,80,118,20,'p');particle(g,140,118,20,'p');line(g,100,118,120,118,C.gold,4);label(g,nm(0)+T('：靜電力',': electric'),110,212,C.gold,18,'center');
        particle(g,310,118,20,'n');particle(g,370,118,20,'n');line(g,330,118,350,118,C.green,4);label(g,nm(1)+T('：重力',': gravity'),340,212,C.green,18,'center');
        label(g,'≠',225,128,C.red,40,'center');label(g,T('B：甲＝乙？','B: 1 = 2?'),225,36,C.red,18,'center');mark(g,225,176,false,12);return;}
      case 'Q14_22':case 'Q14_23':{const X=ruler(g,{...RU,show:[0,1]});bracket(g,X(lg(F.nnGravity)),X(lg(F.pp)),64,T('同粒子、同距離：差約 ','Same particles, same r: about ')+'10^{'+String(-ex(RATIO_G))+'} '+T('倍','times'),C.green);
        if(id==='Q14_23')label(g,T('不用背：重力小非常非常多','No need to memorise: gravity is tiny'),230,226,C.white,18,'center');return;}
      case 'Q14_24':{const X=ruler(g,{...RU,show:[1,2]});bracket(g,X(lg(F.nnGravity)),X(lg(F.pe)),64,T('丙離得遠，還是大 ','3 is farther yet still ')+'10^{'+ex(F.pe/F.nnGravity)+'} '+T('倍','times bigger'),C.blue);
        label(g,T('丙 ≫ 乙','3 ≫ 2'),230,226,C.blue,20,'center');return;}
      case 'Q14_25':{ruler(g,{...RU,show:[0,1,2]});label(g,T('甲 ＞ 丙 ＞ 乙','1 > 3 > 2'),230,226,C.white,24,'center');return;}
      case 'Q14_26':case 'Q14_27':case 'Q14_28':{const n=nucleus(g,230,120,32);
        if(id==='Q14_26'){label(g,T('丁：強力呢？','4: the strong force?'),230,26,C.violet,20,'center');return;}
        arrow(g,n.p1[0]-34,n.p1[1],n.p1[0]-74,n.p1[1],C.gold,4,12);arrow(g,n.p2[0]+34,n.p2[1],n.p2[0]+74,n.p2[1],C.gold,4,12);
        label(g,T('甲：靜電斥力，推開','1: electric push apart'),230,26,C.gold,17,'center');
        if(id==='Q14_28'){arrow(g,n.p1[0]-120,n.p1[1]+50,n.p1[0]-36,n.p1[1]+8,C.violet,7,16);arrow(g,n.p2[0]+120,n.p2[1]+50,n.p2[0]+36,n.p2[1]+8,C.violet,7,16);
          label(g,T('丁：強力拉住 → 丁 ＞ 甲','4: strong force holds → 4 > 1'),230,222,C.violet,18,'center');label(g,T('箭頭不照比例：丁約為甲的 ','Arrows not to scale: 4 ≈ ')+Math.round(RATIO_S)+T(' 倍',' × 1'),230,244,C.faint,15,'center');}
        return;}
      case 'Q14_29':{label(g,'(C)',120,90,C.white,22,'right');label(g,T('甲 ＞ 丙 ＞ 乙','1 > 3 > 2'),136,90,C.green,26);label(g,T('丁不在選項裡','4 is not in this choice'),230,150,C.violet,19,'center');label(g,T('只比甲、丙、乙','It only ranks 1, 3, 2'),230,190,C.white,17,'center');return;}
      case 'Q14_30':choicesList(g,k);return;
      case 'Q14_31':choicesList(g,1);label(g,T('答案 C','Answer: C'),448,240,C.green,22,'right');return;
      case 'Q14_35':{const W=[T('強','Strong'),T('電','EM'),T('弱','Weak'),T('重','Gravity')],cols=[C.violet,C.gold,C.faint,C.green];
        W.forEach((w,i)=>{if(k<i*.18)return;const x=50+i*96,h=150-i*36;box(g,x,214-h,84,h,6,cols[i]+'33',cols[i],2);label(g,w,x+42,206-h+i*0,cols[i],20,'center');});
        label(g,T('只排名次，高度不照比例','Ranking only, heights not to scale'),440,24,C.faint,15,'right');return;}
      case 'Q14_36':{const n=nucleus(g,150,125,22);g.beginPath();g.arc(150,125,58,0,TAU);g.setLineDash([5,4]);g.strokeStyle=C.violet;g.lineWidth=2;g.stroke();g.setLineDash([]);
        sci(g,T('強力範圍 ≈ 10^{−15} m','Strong-force range ≈ 10^{−15} m'),150,212,C.violet,16,'center');particle(g,380,125,9,'e');label(g,T('核外：強力 ≈ 0','Outside: strong ≈ 0'),380,160,C.white,16,'center');
        label(g,T('在原子核的距離裡比','Compared at nuclear distances'),230,30,C.red,19,'center');return;}
      case 'Q14_37':{label(g,T('同一種力：看距離','Same force: look at the distance'),230,34,C.teal,20,'center');
        particle(g,70,120,11,'p');particle(g,96,120,11,'p');label(g,T('近 → 大','near → big'),83,170,C.gold,18,'center');
        particle(g,230,120,11,'p');particle(g,400,120,8,'e');label(g,T('遠 → 小','far → small'),315,170,C.blue,18,'center');sci(g,'F ∝ 1/r^{2}',230,222,C.white,22,'center');return;}
      case 'Q14_38':case 'Q14_39':{
        g.beginPath();g.arc(230,560,360,Math.PI*1.2,Math.PI*1.8);g.fillStyle='#2f6f9a';g.fill();label(g,T('地球','Earth'),230,236,C.white,18,'center');
        if(id==='Q14_38'){label(g,T('重力有多弱？','How weak is gravity?'),230,60,C.white,22,'center');return;}
        const lift=ease(seg(k,.1,.6)),cy=170-60*lift;
        box(g,206,40,48,40,4,'#c8463d','#ff8a80',1.5);box(g,206,62,48,18,0,'#8aa1ad',null);label(g,'N',230,62,'#fff',15,'center');
        g.beginPath();g.ellipse(230,cy,7,14,0,0,TAU);g.strokeStyle='#d7e0e4';g.lineWidth=2.4;g.stroke();g.beginPath();g.ellipse(230,cy+3,4,9,0,0,TAU);g.stroke();
        arrow(g,262,cy,262,cy-34,C.red,3,10);label(g,T('磁力','Magnetic'),270,cy-14,C.red,16);arrow(g,198,cy,198,cy+20,C.green,3,10);label(g,T('整顆地球的重力','Pull of the whole Earth'),190,cy+26,C.green,16,'right');
        return;}
    }
  }
  // 動手：拖卡片排名次（由大到小）；排對後揭曉對數尺
  const SLOT={x:16,y:34,w:196,h:44,gap:6};
  const slotY=i=>SLOT.y+i*(SLOT.h+SLOT.gap);
  function hands(g,s){
    label(g,T('大','Largest'),SLOT.x+SLOT.w/2,24,C.white,15,'center');label(g,T('小','Smallest'),SLOT.x+SLOT.w/2,248,C.white,15,'center');
    s.order.forEach((fi,i)=>{if(s.drag&&s.drag.fi===fi)return;card(g,fi,slotY(i),i,s);});
    if(s.drag)card(g,s.drag.fi,s.drag.y,null,s,true);
    const ok=s.order.join()===ANSWER.join();
    if(ok||s.reveal){const RX=274,RY0=36,RY1=222,a=-36,b=6,Y=e=>RY1-(e-a)/(b-a)*(RY1-RY0);
      line(g,RX,RY0,RX,RY1,C.faint,2);for(let e=-35;e<=5;e+=5){line(g,RX-4,Y(e),RX+4,Y(e),C.faint,1.5);if(e%10===0)sci(g,'10^{'+String(e).replace('-','−')+'}',RX-8,Y(e)+5,C.faint,15,'right');}
      label(g,T('對數尺（N）','Log scale (N)'),RX,24,C.faint,15,'center');
      const pos=[0,1,2,3].map(i=>({i,y:Y(lg(FORCES[i].v))})).sort((p,q)=>p.y-q.y);for(let j=1;j<4;j++)pos[j].ly=Math.max(pos[j].y,(pos[j-1].ly??pos[j-1].y)+22);pos[0].ly=pos[0].y;
      for(const p of pos){const f=FORCES[p.i];dot(g,RX,p.y,5,f.col);line(g,RX,p.y,RX+30,p.ly,f.col,1);label(g,nm(p.i),RX+36,p.ly+6,f.col,17);sci(g,'≈ '+K.sciText(f.v,0)+' N',RX+58,p.ly+6,f.col,15);}
    }else label(g,T('排好就揭曉數量級','Rank them to reveal the sizes'),340,130,C.faint,15,'center');
    if(ok){label(g,T('排對了！','Correct!'),448,246,C.green,17,'right');}
  }
  function card(g,fi,y,slot,s,lift){const f=FORCES[fi],x=SLOT.x;box(g,x,y,SLOT.w,SLOT.h,8,lift?'#1d3a4f':'#13293a',f.col,lift?2.6:1.6);
    if(slot!==null)label(g,String(slot+1),x+14,y+28,C.faint,15,'center');label(g,nm(fi),x+40,y+30,f.col,20,'center');label(g,T(...f.name),x+60,y+28,C.white,15);
    for(let j=0;j<3;j++)line(g,x+SLOT.w-22,y+16+j*6,x+SLOT.w-10,y+16+j*6,'#ffffff55',1.5);
    if(s.focus&&slot===s.cursor){box(g,x-3,y-3,SLOT.w+6,SLOT.h+6,10,null,s.grab?C.gold:C.white,1.5);}}
  function pointer(canvas,h){
    const pt=e=>{const r=canvas.getBoundingClientRect(),k=Math.min(r.width/460,r.height/250);return [(e.clientX-r.left-(r.width-460*k)/2)/k,(e.clientY-r.top-(r.height-250*k)/2)/k];};
    let on=false;canvas.addEventListener('pointerdown',e=>{if(h.down(...pt(e))===false)return;on=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();});
    canvas.addEventListener('pointermove',e=>{if(on)h.move(...pt(e));});const end=e=>{if(!on)return;on=false;h.up?.(...pt(e));};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  }
  ExamScene.add(14,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,order:[0,1,2,3],drag:null,reveal:false,cursor:0,grab:false,focus:false}),
    paint,
    preview(g){const a=atom(g,150,128,120,{nr:13,er:9});
      K.boost(1.15,()=>{label(g,T('氦原子','Helium atom'),150,26,C.white,17,'center');
        label(g,T('質子 ×2','2 protons'),330,70,PROTON,16);label(g,T('中子 ×2','2 neutrons'),330,104,NEUTRON,16);label(g,T('電子 ×2','2 electrons'),330,138,ELECTRON,16);
        label(g,T('不照比例','Not to scale'),330,200,C.faint,15);});},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,btn,toggle,complete,render}){
      s.hands=true;canvas.tabIndex=0;canvas.style.touchAction='none';let done=false;
      const snd=(f,d=.06)=>{if(LabSettings.get('sound'))LabSound.tone({freq:f,dur:d,type:'triangle',gain:.1});};
      const check=()=>{if(!done&&s.order.join()===ANSWER.join()){done=true;complete();if(LabSettings.get('sound'))LabSound.sweep({from:500,to:1100,dur:.3,gain:.12});}};
      const slotAt=y=>clamp(Math.round((y-SLOT.y-SLOT.h/2)/(SLOT.h+SLOT.gap)),0,3);
      pointer(canvas,{
        down(x,y){if(x<SLOT.x||x>SLOT.x+SLOT.w||y<SLOT.y-4||y>slotY(3)+SLOT.h+4)return false;const i=slotAt(y);s.drag={fi:s.order[i],dy:y-slotY(i),y:slotY(i)};snd(520);render();},
        move(x,y){if(!s.drag)return;s.drag.y=clamp(y-s.drag.dy,SLOT.y-6,slotY(3)+6);const to=slotAt(s.drag.y+SLOT.h/2),from=s.order.indexOf(s.drag.fi);
          if(to!==from){s.order.splice(from,1);s.order.splice(to,0,s.drag.fi);snd(420+to*60,.04);}render();},
        up(){if(!s.drag)return;s.drag=null;snd(640);check();render();}});
      canvas.addEventListener('keydown',e=>{const up=e.key==='ArrowUp',dn=e.key==='ArrowDown';
        if(e.key===' '||e.key==='Enter'){e.preventDefault();s.grab=!s.grab;snd(s.grab?520:640);if(!s.grab)check();render();return;}
        if(!up&&!dn)return;e.preventDefault();const to=clamp(s.cursor+(up?-1:1),0,3);
        if(s.grab&&to!==s.cursor){const o=s.order;[o[s.cursor],o[to]]=[o[to],o[s.cursor]];snd(420+to*60,.04);check();}s.cursor=to;render();});
      canvas.addEventListener('focus',()=>{s.focus=true;render();});canvas.addEventListener('blur',()=>{s.focus=false;s.grab=false;render();});
      btn(T('打亂重來','Shuffle'),()=>{do{for(let i=3;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s.order[i],s.order[j]]=[s.order[j],s.order[i]];}}while(s.order.join()===ANSWER.join());snd(360);});
      toggle('先看數量級（對數尺）','Peek at the sizes (log scale)',v=>s.reveal=v);
      return {};
    },
    read(s,output){const ok=s.order.join()===ANSWER.join();
      output.innerHTML=T('你的排序：','Your ranking: ')+'<b>'+s.order.map(nm).join(' ＞ ')+'</b>　'+(ok?T('排對了：強力最大，重力最小','Correct: strong is largest, gravity smallest'):T('拖卡片換位置（鍵盤：↑↓ 移動、空白鍵抓放）','Drag the cards (keyboard: ↑↓ to move, Space to pick up)'))+
        '<br><small>'+T('估算距離：核內 ','Distances used: inside nucleus ')+'10<sup>−15</sup> m'+T('，電子到核 ',', electron to nucleus ')+'10<sup>−10</sup> m</small>';}
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(14,{groups:{wrong:["電量一樣，力就一樣？", "Same charges, same force?"],flip:["距離差十萬倍", "Distances differ 100 000 times"],solve1:["甲和丙比", "Compare 1 and 3"],solve2:["乙最小", "Force 2 is smallest"],solve3:["丁最大", "Force 4 is largest"],trick:["口訣", "The rule"],jokeT:["距離決定一切", "Distance decides"]},board:{wrong:[String.raw`q_{\text{甲}}=q_{\text{丙}}\ \overset{?}{\Rightarrow}\ F_{\text{甲}}=F_{\text{丙}}`,String.raw`q_{\text{1}}=q_{\text{3}}\ \overset{?}{\Rightarrow}\ F_{\text{1}}=F_{\text{3}}`],flip:[String.raw`r_{\text{甲}}\approx10^{-15}\ \mathrm{m},\quad r_{\text{丙}}\approx10^{-10}\ \mathrm{m}`,String.raw`r_{\text{1}}\approx10^{-15}\ \mathrm{m},\quad r_{\text{3}}\approx10^{-10}\ \mathrm{m}`],solve1:[String.raw`\dfrac{F_{\text{甲}}}{F_{\text{丙}}}=\Big(\dfrac{r_{\text{丙}}}{r_{\text{甲}}}\Big)^{2}=\big(10^{5}\big)^{2}=10^{10}`,String.raw`\dfrac{F_{\text{1}}}{F_{\text{3}}}=\Big(\dfrac{r_{\text{3}}}{r_{\text{1}}}\Big)^{2}=\big(10^{5}\big)^{2}=10^{10}`],solve2:[String.raw`\dfrac{F_g}{F_e}\approx10^{-36}\ \Rightarrow\ \text{甲}>\text{丙}>\text{乙}`,String.raw`\dfrac{F_g}{F_e}\approx10^{-36}\ \Rightarrow\ \text{1}>\text{3}>\text{2}`],solve3:[String.raw`\text{丁}>\text{甲}>\text{丙}>\text{乙}`,String.raw`\text{4}>\text{1}>\text{3}>\text{2}`],trick:String.raw`F_{\text{strong}}>F_{e}>F_{\text{weak}}>F_{g}`,jokeT:String.raw`F\propto\dfrac{1}{r^{2}}`}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q14=[
 {
  "id": "Q14_09",
  "row": "wrong",
  "duration": 8.5,
  "disp": "很多人第一個想法：質子和電子的電量一樣大，質子和質子的電量也一樣大，所以甲等於丙。",
  "en": "Many people's first thought: a proton and an electron carry the same amount of charge, so do two protons, so force 1 equals force 3."
 },
 {
  "id": "Q14_10",
  "row": "wrong",
  "duration": 2.3,
  "disp": "電量一樣，力就一樣？",
  "en": "Same charge, same force?"
 },
 {
  "id": "Q14_11",
  "row": "wrong",
  "duration": 4.9,
  "disp": "那我跟愛因斯坦都只有一顆頭，物理怎麼差這麼多？",
  "en": "Einstein and I each have just one head, so why is our physics so different?"
 },
 {
  "id": "Q14_12",
  "row": "flip",
  "duration": 1.9,
  "disp": "可是你忘了距離。",
  "en": "What you forgot is distance."
 },
 {
  "id": "Q14_13",
  "row": "flip",
  "duration": 7.7,
  "disp": "甲的 2 個質子，都在原子核裡面，距離大概是原子核的大小，\\(10^{-15}\\) 公尺。",
  "en": "The 2 protons in force 1 are both in the nucleus, about one nucleus apart: \\(10^{-15}\\) meters."
 },
 {
  "id": "Q14_14",
  "row": "flip",
  "duration": 7.7,
  "disp": "丙的電子在原子核外面，它和質子的距離，大概是原子的大小，\\(10^{-10}\\) 公尺。",
  "en": "The electron in force 3 is outside the nucleus, about one atom away from the proton: \\(10^{-10}\\) meters."
 },
 {
  "id": "Q14_15",
  "row": "flip",
  "duration": 6.1,
  "disp": "\\(10^{-10}\\)，比 \\(10^{-15}\\) 多了 5 個次方，也就是 10 萬倍。",
  "en": "\\(10^{-10}\\) is 5 powers of ten bigger than \\(10^{-15}\\), which is 100,000 times."
 },
 {
  "id": "Q14_16",
  "row": "solve1",
  "duration": 5.7,
  "disp": "靜電力的公式：F 等於 k 乘以 2 個電量，再除以距離的平方。",
  "en": "The electric force formula: F equals k times the 2 charges, divided by the distance squared."
 },
 {
  "id": "Q14_17",
  "row": "solve1",
  "duration": 6.1,
  "disp": "因為甲和丙的電量一樣大，所以 2 個力的比值，只看距離的平方。",
  "en": "Forces 1 and 3 have equal charges, so their ratio depends only on the distance squared."
 },
 {
  "id": "Q14_18",
  "row": "solve1",
  "duration": 5.5,
  "disp": "甲比丙近了 10 萬倍，平方就是 10 萬乘以 10 萬，\\(10^{10}\\)。",
  "en": "Force 1 is 100,000 times closer, and squaring that gives 100,000 × 100,000, or \\(10^{10}\\)."
 },
 {
  "id": "Q14_19",
  "row": "solve1",
  "duration": 5.3,
  "disp": "所以甲是丙的 \\(10^{10}\\) 倍，100 億倍，甲遠遠大於丙。",
  "en": "So force 1 is \\(10^{10}\\) times force 3, ten billion times. Force 1 is far bigger than force 3."
 },
 {
  "id": "Q14_20",
  "row": "solve2",
  "duration": 6.7,
  "disp": "再來看乙，因為中子不帶電，所以 2 個中子之間沒有靜電力，只有重力。",
  "en": "Now force 2. Neutrons have no charge, so between 2 neutrons there is no electric force, only gravity."
 },
 {
  "id": "Q14_21",
  "row": "solve2",
  "duration": 5.9,
  "disp": "選 B 的同學，就是以為 2 個中子跟 2 個質子一樣，力也一樣大。",
  "en": "Those who chose B assumed 2 neutrons are just like 2 protons, with an equal force."
 },
 {
  "id": "Q14_22",
  "row": "solve2",
  "duration": 10.3,
  "disp": "重力是 4 種基本交互作用裡面最弱的：同樣的 2 個粒子、同樣的距離，重力比靜電力小了大概 \\(10^{36}\\) 倍。",
  "en": "Gravity is the weakest of the 4 fundamental interactions: for the same 2 particles at the same distance, it is about \\(10^{36}\\) times weaker than the electric force."
 },
 {
  "id": "Q14_23",
  "row": "solve2",
  "duration": 5.7,
  "disp": "這個數字不用背，你只要記得，重力比靜電力小非常非常多。",
  "en": "No need to memorize that number. Just remember that gravity is far, far weaker than the electric force."
 },
 {
  "id": "Q14_24",
  "row": "solve2",
  "duration": 4.5,
  "disp": "所以丙雖然距離比較遠，還是比乙大很多很多。",
  "en": "So even though force 3 acts over a longer distance, it is still far bigger than force 2."
 },
 {
  "id": "Q14_25",
  "row": "solve2",
  "duration": 3.3,
  "disp": "整理一下：甲大於丙，丙大於乙。",
  "en": "To sum up: force 1 is greater than force 3, and force 3 is greater than force 2."
 },
 {
  "id": "Q14_26",
  "row": "solve3",
  "duration": 1.7,
  "disp": "那丁的強力呢？",
  "en": "What about force 4?"
 },
 {
  "id": "Q14_27",
  "row": "solve3",
  "duration": 4.1,
  "disp": "2 個質子都帶正電，靜電力會把它們推開。",
  "en": "Both protons are positively charged, so the electric force pushes them apart."
 },
 {
  "id": "Q14_28",
  "row": "solve3",
  "duration": 7.7,
  "disp": "可是它們還是被綁在原子核裡面，就是因為強力把它們拉住，所以強力一定比甲大。",
  "en": "Yet they stay bound in the nucleus because the strong force holds them, so it must be bigger than force 1."
 },
 {
  "id": "Q14_29",
  "row": "solve3",
  "duration": 5.1,
  "disp": "可是選項 C 根本沒有放丁，它只比甲、丙、乙這 3 個。",
  "en": "But option C doesn't include force 4 at all; it only ranks forces 1, 3 and 2."
 },
 {
  "id": "Q14_30",
  "row": "solve3",
  "duration": 6.5,
  "disp": "A 說甲等於丁，B 說甲等於乙，D 說甲等於丙，E 說丁最小，全都錯。",
  "en": "A says 1 equals 4, B says 1 equals 2, D says 1 equals 3, E says 4 is the smallest: all wrong."
 },
 {
  "id": "Q14_31",
  "row": "solve3",
  "duration": 1.3,
  "disp": "答案是 C。",
  "en": "The answer is C."
 },
 {
  "id": "Q14_35",
  "row": "trick",
  "duration": 4.9,
  "disp": "秒殺口訣：強、電、弱、重，強力最強，重力最弱。",
  "en": "The shortcut: strong, electric, weak, gravity. The strong force is the strongest, gravity the weakest."
 },
 {
  "id": "Q14_36",
  "row": "trick",
  "duration": 9.7,
  "disp": "注意喔，這是在原子核那麼小的距離裡比的；強力只在原子核的範圍裡有作用，離開原子核就幾乎沒有了。",
  "en": "Careful: that ranking is at the tiny scale of a nucleus. The strong force only acts inside the nucleus and all but vanishes outside it."
 },
 {
  "id": "Q14_37",
  "row": "trick",
  "duration": 2.9,
  "disp": "同一種力比大小，就看距離。",
  "en": "For the same kind of force, just look at the distance."
 },
 {
  "id": "Q14_38",
  "row": "jokeT",
  "duration": 1.5,
  "disp": "重力有多弱？",
  "en": "How weak is gravity?"
 },
 {
  "id": "Q14_39",
  "row": "jokeT",
  "duration": 5.1,
  "disp": "一塊小磁鐵，就能把迴紋針從整顆地球的手裡搶過來。",
  "en": "One small magnet can snatch a paper clip away from the entire Earth."
 }
];
/* tracks:end */
