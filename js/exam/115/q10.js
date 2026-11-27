/* 115 學測第 10 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,dot}=K,C=K.colors,P=Exam115Core;
  // 圖 4 的 v-t 圖（逐句與動手共用）：t 0–20 s、v 0–10 m/s
  const G={x:58,y:200,w:270,h:120},X=t=>G.x+t/20*G.w,Y=v=>G.y-v/10*G.h,V=t=>P.carAt(t).v;
  // 顏色：v（v-t 線、速度箭頭）白、加速度（斜率三角形）青、位移面積：加速藍／等速灰／減速金、阻力紅
  const GRAY='#b4c3cc',AREA=[[0,5,C.blue],[5,10,GRAY],[10,20,C.gold]],CEN=[[101,183],[159,146],[238,170]];
  const snd=o=>{if(LabSettings.get('sound'))LabSound.tone(o);};
  const fmt=x=>(x<-1e-9?'−':'')+Math.abs(x).toFixed(1);
  function path(t0,t1){const pts=[[t0,V(t0)]];for(const [t] of P.CAR)if(t>t0&&t<t1)pts.push([t,V(t)]);pts.push([t1,V(t1)]);return pts;}
  function trace(g,t0,t1,color,w=3){if(t1<=t0)return;g.beginPath();path(t0,t1).forEach(([t,v],i)=>i?g.lineTo(X(t),Y(v)):g.moveTo(X(t),Y(v)));g.strokeStyle=color;g.lineWidth=w;g.lineJoin='round';g.lineCap='round';g.stroke();g.lineCap='butt';}
  function fill(g,t0,t1,col){if(t1<=t0)return;g.beginPath();g.moveTo(X(t0),Y(0));path(t0,t1).forEach(([t,v])=>g.lineTo(X(t),Y(v)));g.lineTo(X(t1),Y(0));g.closePath();g.fillStyle=col+'50';g.fill();g.strokeStyle=col;g.lineWidth=1.2;g.stroke();}
  function areas(g,upto=20,only=[0,1,2]){for(const i of only){const [a,b,c]=AREA[i];fill(g,a,Math.min(b,upto),c);}}
  const areaText=(g,i,txt)=>label(g,txt,CEN[i][0],CEN[i][1],C.white,17,'center');
  function axes(g){
    arrow(g,G.x,G.y,G.x+G.w+16,G.y,C.faint,1.6,8);arrow(g,G.x,G.y,G.x,Y(10)-26,C.faint,1.6,8);
    for(const t of [5,10,20]){line(g,X(t),G.y,X(t),G.y+5,C.faint,1.2);label(g,String(t),X(t),G.y+21,C.faint,15,'center');}
    label(g,'0',G.x-6,G.y+19,C.faint,15,'right');line(g,G.x-5,Y(10),G.x,Y(10),C.faint,1.2);label(g,'10',G.x-8,Y(10)+5,C.faint,15,'right');
    for(const t of [5,10])line(g,X(t),G.y,X(t),Y(10)-8,'#92aeba99',1.2,[5,4]);
    label(g,'t (s)',G.x+G.w+20,G.y+5,C.faint,15);label(g,'v (m/s)',G.x+8,Y(10)-14,C.faint,15);
  }
  function graph(g,o={}){axes(g);if(o.areas)areas(g,o.upto??20,o.areas);trace(g,0,20,C.white,3);}
  // 側面小汽車（車頭朝東＝朝右）；y＝路面
  function car(g,x,y,k=1){g.save();g.translate(x,y);g.scale(k,k);
    const gr=g.createLinearGradient(0,-27,0,-4);gr.addColorStop(0,'#78acdc');gr.addColorStop(1,'#2d5b86');
    g.beginPath();g.moveTo(-25,-6);g.lineTo(-25,-15);g.quadraticCurveTo(-24,-19,-15,-19);g.lineTo(-9,-27);g.lineTo(8,-27);g.lineTo(15,-19);g.lineTo(23,-17);g.quadraticCurveTo(27,-15,26,-6);g.closePath();
    g.fillStyle=gr;g.fill();g.strokeStyle='#bcd9f0';g.lineWidth=1.2/k;g.stroke();
    g.beginPath();g.moveTo(-7,-25);g.lineTo(1,-25);g.lineTo(1,-19);g.lineTo(-12,-19);g.closePath();g.moveTo(3,-25);g.lineTo(7,-25);g.lineTo(12,-19);g.lineTo(3,-19);g.closePath();g.fillStyle='#cdebf8';g.fill();
    for(const wx of [-15,15]){g.beginPath();g.arc(wx,-5,5.5,0,Math.PI*2);g.fillStyle='#1d2328';g.fill();g.beginPath();g.arc(wx,-5,2.2,0,Math.PI*2);g.fillStyle='#a7b1b8';g.fill();}
    g.fillStyle='#ffe9a6';g.fillRect(23,-14,3,3);g.restore();}
  function road(g,y,x0=10,x1=450){box(g,x0,y,x1-x0,9,3,'#34444f');line(g,x0+6,y+4.5,x1-6,y+4.5,'#eef5f655',1,[8,8]);}
  const Rx=m=>40+m*3; // 路上位置：0 m → 40、125 m → 415
  function shares(g,k){ExamPaper.questions[10].shares.forEach((v,j)=>{const L='ABCDE'[j],x=74+j*66,hh=v*1.75*seg(k,0,.6),col=L==='C'?C.green:'AB'.includes(L)?C.red:'#5f7480';
    box(g,x,208-hh,44,Math.max(1,hh),6,col+'aa',col);label(g,L,x+22,234,C.white,17,'center');if(k>.35)label(g,v+'%',x+22,200-hh,col,16,'center');});}
  // 斜率三角形：i＝0 加速段、1 減速段（都畫在線下，和面積三角形同一塊）
  function slopeTri(g,i){
    const col=C.teal;g.beginPath();
    if(i){g.moveTo(X(10),Y(10));g.lineTo(X(10),Y(0));g.lineTo(X(20),Y(0));}else{g.moveTo(X(0),Y(0));g.lineTo(X(5),Y(0));g.lineTo(X(5),Y(10));}
    g.closePath();g.fillStyle='#8ae6d726';g.fill();
    line(g,X(i?10:0),Y(0),X(i?20:5),Y(0),col,3.5);line(g,X(i?10:5),Y(0),X(i?10:5),Y(10),col,3.5);
    label(g,i?'Δt = 10 s':'Δt = 5 s',X(i?15:2.5),241,col,16,'center');
    label(g,i?'Δv = −10':'Δv = 10',(i?X(10):X(5))+6,i?180:118,col,16);
  }
  function gauge(g,cx,cy,r,v){
    g.beginPath();g.arc(cx,cy,r,Math.PI,2*Math.PI);g.strokeStyle='#5f7480';g.lineWidth=6;g.stroke();
    for(const u of [0,5,10]){const a=Math.PI*(1+u/10);line(g,cx+Math.cos(a)*(r-9),cy+Math.sin(a)*(r-9),cx+Math.cos(a)*(r+3),cy+Math.sin(a)*(r+3),C.faint,1.5);}
    label(g,'0',cx-r,cy+19,C.faint,15,'center');label(g,'10',cx+r,cy+19,C.faint,15,'center');
    const a=Math.PI*(1+v/10);line(g,cx,cy,cx+Math.cos(a)*(r-6),cy+Math.sin(a)*(r-6),C.white,3);dot(g,cx,cy,4,C.white);label(g,'v',cx,cy+19,C.white,15,'center');
  }
  function stamp(g,x,y,txt){g.beginPath();g.arc(x,y,36,0,Math.PI*2);g.fillStyle='#6fe0a81f';g.fill();g.strokeStyle=C.green;g.lineWidth=3;g.stroke();
    label(g,T('答案','Answer'),x,y-10,C.green,15,'center');label(g,txt,x,y+22,C.green,28,'center');}
  const top=(g,s,i=0,col=C.white,size=18)=>sci(g,s,260,i?54:28,col,size,'center');
  // 失去動力的車（左半邊）：v、阻力 f、N 與 mg；vf＝速度比例
  function forces(g,cx,y,k,vf,o={}){
    road(g,y,10,205);car(g,cx,y,k);
    if(vf>.04){arrow(g,cx+14,y-58,cx+14+56*vf,y-58,C.white,2.5,9);label(g,'v',cx+20+56*vf,y-53,C.white,16);}
    arrow(g,cx-25*k,y-16,cx-25*k-44,y-16,C.red,3,10);label(g,'f',cx-25*k-40,y-26,C.red,17);
    if(o.nm){arrow(g,cx-6,y-27*k,cx-6,y-27*k-40,C.faint,2,8);label(g,'N',cx,y-27*k-30,C.faint,16);
      arrow(g,cx-6,y-22,cx-6,y+24,C.faint,2,8);label(g,'mg',cx,y+22,C.faint,16);}
  }
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const n=+s.id.slice(4),k=s.part,t=s.t;
    if(n<=6){shares(g,k);label(g,T('選錯最多：A、B 各 8%','Top wrong picks: A and B, 8% each'),448,32,C.red,17,'right');return;}
    if(n===7){graph(g);trace(g,0,5,C.teal,4);trace(g,10,20,C.teal,4);label(g,T('A：減速的 a 量值是加速的 2 倍？','A: slowing |a| = 2 × speeding-up |a|?'),258,32,C.red,17,'center');return;}
    if(n<=10){const tt=n===8?20*seg(k,.05,.9):20,c=P.carAt(tt);road(g,44);car(g,Rx(c.x),44);axes(g);trace(g,0,tt,C.white,3);dot(g,X(tt),Y(c.v),5,C.white);
      if(n>8||k>.6){trace(g,10,20,'#ff8a8055',10);trace(g,10,20,C.red,3.5);label(g,T('比較長＝比較猛？','Longer = stronger?'),282,112,C.red,18);}
      if(n===10){label(g,T('短','short'),84,128,C.faint,17,'right');label(g,T('長','long'),232,172,C.red,17,'right');}
      return;}
    if(n<=18){graph(g);
      if(n===11){trace(g,0,5,C.teal,5);trace(g,10,20,C.teal,5);label(g,T('陡','steep'),84,128,C.teal,18,'right');label(g,T('緩','gentle'),286,138,C.teal,18);top(g,T('短的那段反而比較猛','The short line is the stronger one'),0,C.teal);return;}
      if(n===12){const tt=20*seg(k,.05,.92),c=P.carAt(tt);trace(g,0,tt,C.teal,4);dot(g,X(tt),Y(c.v),5,C.white);gauge(g,398,152,40,c.v);
        label(g,tt<5?T('指針猛轉','needle races'):tt<10?T('指針不動','needle still'):T('慢慢退','eases back'),398,192,C.teal,15,'center');
        top(g,T('加速度＝斜率：看陡不陡，不看長不長','a = slope: steepness, not length'),0,C.teal,17);return;}
      if(n===13){top(g,'a = Δv ÷ Δt',0,C.teal,20);if(k>.3){slopeTri(g,0);slopeTri(g,1);}return;}
      slopeTri(g,0);if(n>=16)slopeTri(g,1);
      if(n>=15)top(g,T('加速：a = 10 ÷ 5 = 2 m/s^{2}','Speeding up: a = 10 ÷ 5 = 2 m/s^{2}'),0,C.teal);
      if(n>=17)top(g,T('減速：a = −10 ÷ 10 = −1 m/s^{2}','Slowing: a = −10 ÷ 10 = −1 m/s^{2}'),1,C.teal);
      if(n===17&&k>.45)label(g,T('量值 1','size 1'),398,104,C.teal,17,'center');
      if(n===18){label(g,T('只有一半','only half'),398,96,C.teal,17,'center');label(g,'A',386,132,C.red,22,'center');mark(g,414,125,false,10);}
      return;}
    if(n<=26){const u=n===23?seg(k,0,.8):0,vf=n>=24?0:1-u,cx=n>=24?150:92+58*(1-(1-u)*(1-u));
      forces(g,cx,158,1.6,vf,{nm:n>=20});
      if(n>=20)label(g,T('合力＝阻力 f','Net force = friction f'),108,236,C.red,16,'center');
      if(n<21){label(g,T('B：阻力作的功','B: work by friction'),335,92,C.white,18,'center');sci(g,'W_{f} = −5×10^{6} J ?',335,128,C.red,18,'center');return;}
      const x=216;sci(g,T('合力作的功 = ΔK','W_{net} = ΔK'),x,40,C.white,17);if(n===21)label(g,T('（功能定理）','(work–energy theorem)'),x,64,C.faint,15);
      if(n>=22)sci(g,T('W_{f} = 末動能 − 初動能','W_{f} = K_{end} − K_{start}'),x,70,C.white,17);
      if(n>=23)sci(g,T('末動能 = 0','K_{end} = 0'),x,100,C.white,17);
      if(n>=24){sci(g,T('初動能 = 1/2 × 1000 × 10^{2}','K_{start} = 1/2 × 1000 × 10^{2}'),x,130,C.violet,17);sci(g,'= 5×10^{4} J',x+52,158,C.violet,17);}
      if(n>=25)sci(g,'W_{f} = −5×10^{4} J',x,194,C.gold,20);
      if(n>=26){sci(g,T('B 寫 −5×10^{6}：差 100 倍','B says −5×10^{6}: 100× off'),x,228,C.red,16);mark(g,440,222,false,9);}
      return;}
    if(n<=38){
      const sh=n<=33?(n<29?(n===28?[0,1,2]:null):n<32?[0]:[0,2]):(n===34?[0,2]:[0,1,2]);
      graph(g,{areas:sh||undefined,upto:n===28?20*seg(k,.1,.9):20});
      if(n===27){top(g,T('位移 = ？','Displacement = ?'),0,C.gold,20);return;}
      if(n===28){top(g,T('v × t = 位移 → 面積 = 位移','v × t = displacement → area = displacement'),0,C.gold,17);return;}
      if(n===29){top(g,T('三角形面積 = 1/2 × 底 × 高','Triangle area = 1/2 × base × height'),0,C.blue,18);return;}
      if(n<=33){areaText(g,0,'25 m');label(g,'5 s',X(2.5),241,C.blue,16,'center');label(g,'10 m/s',X(5)+6,148,C.blue,16);
        if(n!==33)top(g,'1/2 × 5 × 10 = 25 m',0,C.blue);
        if(n===31){g.strokeStyle=C.red;g.lineWidth=2;g.setLineDash([6,4]);g.strokeRect(X(0),Y(10),X(5)-X(0),G.h);g.setLineDash([]);
          top(g,T('D 說 50 m：忘了乘 1/2','D says 50 m: forgot the 1/2'),1,C.red,17);label(g,'D',386,112,C.red,22,'center');mark(g,414,105,false,10);}
        if(n>=32){areaText(g,2,'50 m');label(g,'10 s',X(15),241,C.gold,16,'center');top(g,'1/2 × 10 × 10 = 50 m',1,C.gold);}
        if(n===33){top(g,'50 ÷ 25 = 2',0,C.gold,20);label(g,'C',386,112,C.green,22,'center');mark(g,414,104,true,10);}
        return;}
      areaText(g,0,'25 m');areaText(g,2,'50 m');
      if(n===34){top(g,T('E：全程位移 = ？','E: total displacement = ?'),0,C.gold,20);return;}
      areaText(g,1,'50 m');
      if(n===35){top(g,'5 × 10 = 50 m',0,GRAY);return;}
      top(g,'25 + 50 + 50 = 125 m',0,C.gold,20);
      if(n===37){g.strokeStyle=C.red;g.lineWidth=2;g.setLineDash([6,4]);g.strokeRect(X(0),Y(10),G.w,G.h);g.setLineDash([]);
        top(g,T('E：10 × 20 = 200 m','E: 10 × 20 = 200 m'),1,C.red,17);label(g,'E',386,112,C.red,22,'center');mark(g,414,105,false,10);}
      if(n===38)stamp(g,398,126,'C');
      return;}
    if(n<=41){const u=n===39?0:n===40?seg(k,0,.75):1,cx=84+100*(1-(1-u)*(1-u)),vf=n===39?1:1-u;
      road(g,140,10,205);car(g,cx,140,1.2);arrow(g,cx-30,126,cx-74,126,C.red,3,10);label(g,'f',cx-70,116,C.red,17);
      if(vf>.04){arrow(g,cx+10,90,cx+10+48*vf,90,C.white,2.5,9);label(g,'v',cx+16+48*vf,95,C.white,16);}
      if(n>=40){line(g,84,166,84,176,C.gold,2);if(cx>88)arrow(g,84,171,cx,171,C.gold,2.5,9);if(u>.98)label(g,'d = 50 m',134,198,C.gold,17,'center');}
      const x=216;sci(g,'f = m a = 1000 × 1',x,50,C.red,17);sci(g,'= 1000 N',x+30,78,C.red,17);
      if(n>=40){sci(g,'W = −f d = −1000 × 50',x,122,C.white,17);sci(g,'= −5×10^{4} J',x+38,150,C.gold,18);}
      if(n===41){label(g,T('兩種算法一樣','Both ways agree'),x,200,C.green,18);mark(g,x+150,194,true,10);}
      return;}
    if(n===44){box(g,40,56,380,58,12,'#8ae6d71f',C.teal,2);label(g,T('斜率 → 加速度','Slope → acceleration'),230,94,C.teal,22,'center');
      box(g,40,140,380,58,12,'#ffd17e1f',C.gold,2);label(g,T('面積 → 位移','Area → displacement'),230,178,C.gold,22,'center');return;}
    if(n<=47){graph(g,{areas:[0,2]});
      if(n===45){for(const xx of [X(5)+12,X(10)-12]){arrow(g,xx,Y(5),xx,Y(10)+2,C.white,1.8,8);arrow(g,xx,Y(5),xx,Y(0)-2,C.white,1.8,8);}label(g,'10',159,146,C.white,18,'center');
        top(g,T('兩個三角形，高都是 10','Two triangles, both 10 tall'),0,C.white);return;}
      // 46–47：把加速段三角形翻過來疊到減速段上比底
      const u=n===46?ease(seg(k,.05,.6)):1,lerp=(a,b)=>a+(b-a)*u,pts=[[lerp(5,10),10],[lerp(5,10),0],[lerp(0,15),0]];
      g.beginPath();pts.forEach(([a,b],i)=>i?g.lineTo(X(a),Y(b)):g.moveTo(X(a),Y(b)));g.closePath();g.fillStyle='#7fb6ffaa';g.fill();g.strokeStyle=C.blue;g.lineWidth=2.5;g.stroke();
      if(u>.98){label(g,'5',X(12.5),241,C.blue,17,'center');label(g,'10',X(18),241,C.gold,17,'center');}
      if(n===47){box(g,90,8,340,34,8,'#ff8a801a',C.red,2);label(g,T('只有高一樣才能抄！','Only when the heights match!'),260,32,C.red,19,'center');}
      else top(g,T('同高：面積比 = 底的比 = 5 : 10 = 1 : 2','Same height: area ratio = base ratio = 1 : 2'),0,C.white,17);
      return;}
    // 48：比身高要站同一個地板
    line(g,20,212,440,212,C.faint,2);
    const tri=(x,y,b,col)=>{g.beginPath();g.moveTo(x,y);g.lineTo(x+b,y);g.lineTo(x+b,y-110);g.closePath();g.fillStyle=col+'66';g.fill();g.strokeStyle=col;g.lineWidth=2;g.stroke();};
    tri(60,212,70,C.blue);tri(150,212,140,C.gold);mark(g,220,236,true,10);
    box(g,320,168,100,44,4,'#8a5a32','#c08a5a',1.5);tri(335,168,70,'#9fb3bf');mark(g,383,120,false,16);
    label(g,T('站上椅子，不算','Standing on a chair: no'),370,240,C.red,15,'center');
    label(g,T('比高要站同一個地板','Compare from the same floor'),230,34,C.white,18,'center');
  }
  // 動手：拉時間（拖圖、拖車、滑桿或方向鍵），面積跟著長；到 20 s 讀出全程位移 125 m
  function hands(g,s){
    const tt=s.time,c=P.carAt(tt);
    road(g,44);line(g,Rx(125),44,Rx(125),14,C.faint,1.5);g.fillStyle=C.gold;g.beginPath();g.moveTo(Rx(125),14);g.lineTo(Rx(125)+16,19);g.lineTo(Rx(125),24);g.fill();
    label(g,'125 m',452,74,C.gold,17,'right');label(g,T('向東 →','East →'),214,72,C.faint,16);
    car(g,Rx(c.x),44);
    axes(g);areas(g,tt);trace(g,0,20,'#eef5f640',2);trace(g,0,tt,C.white,3);
    line(g,X(tt),G.y,X(tt),Y(10)-14,C.white,1.2,[4,3]);dot(g,X(tt),Y(c.v),5,C.white);
    const x=342;label(g,'t = '+tt.toFixed(1)+' s',x,100,C.white,18);label(g,'v = '+c.v.toFixed(1)+' m/s',x,126,C.white,17);
    sci(g,'a = '+fmt(tt>=20?0:c.a)+' m/s^{2}',x,152,C.teal,17);label(g,'Δx = '+c.x.toFixed(1)+' m',x,184,C.gold,19);
    if(s.done)mark(g,440,214,true,10);
  }
  function inverse(m){let a=0,b=20;for(let i=0;i<30;i++){const c=(a+b)/2;if(P.carAt(c).x<m)a=c;else b=c;}return b;}
  ExamScene.add(10,{
    state:()=>({row:'',id:'Q10_06',part:0,t:0,hands:false,time:0,done:false}),
    paint,
    preview(g){
      const x0=118,y0=184,w=300,h=126,PX=t=>x0+t/20*w,PY=v=>y0-v/10*h;
      arrow(g,x0,y0,x0+w+20,y0,C.white,2,10);arrow(g,x0,y0,x0,PY(10)-34,C.white,2,10);
      for(const t of [5,10])line(g,PX(t),y0,PX(t),PY(10)-14,C.white,1.6,[6,5]);
      g.beginPath();P.CAR.forEach(([t,v],i)=>i?g.lineTo(PX(t),PY(v)):g.moveTo(PX(t),PY(v)));g.strokeStyle=C.white;g.lineWidth=3;g.lineJoin='round';g.stroke();
      label(g,'0',x0-10,y0+26,C.white,22,'right');for(const t of [5,10,20])label(g,String(t),PX(t),y0+28,C.white,22,'center');
      line(g,x0-6,PY(10),x0,PY(10),C.white,2);label(g,'10',x0-12,PY(10)+8,C.white,22,'right');
      label(g,T('時間（秒）','Time (s)'),PX(10),244,C.white,20,'center');
      g.save();g.translate(50,PY(5));g.rotate(-Math.PI/2);label(g,T('速度（公尺/秒）','Velocity (m/s)'),0,0,C.white,20,'center');g.restore();
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,btn,complete,render}){
      s.hands=true;let frame=0,gen=0,lastSec=0,mode='graph',playB;
      const R=range(T('時間 t','Time t'),0,200,0,v=>{stop();set(v/10);});R.val.textContent='0.0 s';
      function set(t){s.time=clamp(t,0,20);R.input.value=Math.round(s.time*10);R.val.textContent=s.time.toFixed(1)+' s';
        const sec=Math.floor(s.time+1e-9);if(sec!==lastSec){lastSec=sec;snd({freq:300+40*P.carAt(s.time).v,dur:.05,type:'triangle',gain:.08});}
        if(s.time>=20&&!s.done){s.done=true;if(LabSettings.get('sound'))LabSound.sweep({from:440,to:880,dur:.25,gain:.12});complete();}}
      function stop(){gen++;cancelAnimationFrame(frame);if(playB)playB.textContent=T('▶ 自動播放','▶ Play');}
      btn(T('重來','Reset'),()=>{stop();set(0);});
      playB=btn(T('▶ 自動播放','▶ Play'),b=>{if(b.textContent.startsWith('❚')){stop();return;}stop();if(s.time>=20)set(0);
        const tok=gen;let prev;b.textContent=T('❚❚ 暫停','❚❚ Pause');
        const tick=now=>{if(tok!==gen)return;if(!canvas.isConnected||document.hidden||!canvas.closest('details')?.open)return stop();
          const dt=prev===undefined?0:Math.min(.1,(now-prev)/1000);prev=now;set(s.time+dt*2);render();if(s.time<20)frame=requestAnimationFrame(tick);else stop();};
        frame=requestAnimationFrame(tick);});
      canvas.tabIndex=0;
      canvas.addEventListener('keydown',e=>{const d={ArrowRight:.5,ArrowUp:.5,ArrowLeft:-.5,ArrowDown:-.5}[e.key];
        if(e.key==='Home'){stop();set(0);}else if(e.key==='End'){stop();set(20);}else if(d==null)return;else{stop();set(s.time+d);}e.preventDefault();render();});
      const at=(x,y)=>{if(mode==='road')set(inverse((x-40)/3));else set((x-G.x)/G.w*20);render();};
      return {hit:(x,y)=>{stop();mode=y<70?'road':'graph';at(x,y);return 0;},move:(_,x,y)=>at(x,y)};
    },
    read(s,output){const c=P.carAt(s.time);
      output.innerHTML='t = '+s.time.toFixed(1)+' s　v = '+c.v.toFixed(1)+' m/s　a = '+fmt(s.time>=20?0:c.a)+' m/s<sup>2</sup>　'+T('位移','Displacement')+' Δx = <b>'+c.x.toFixed(1)+' m</b><br>'+
        (s.done?T('面積長滿：全程位移 = 25 + 50 + 50 = 125 m','Area complete: total displacement = 25 + 50 + 50 = 125 m'):T('拖曳 v-t 圖或車子，把時間拉到 20 s，看面積長滿','Drag the v–t graph or the car to 20 s and watch the area fill'));}
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(10,{groups:{wrong:["線長不等於加速度大", "A longer line is not a bigger acceleration"],flip:["斜率才是加速度", "Slope is acceleration"],solveB:["阻力作的功", "Work done by friction"],solveC:["面積是位移", "Area is displacement"],solveE:["全程位移", "Total displacement"],altB:["另一種算法", "Another way"],trick:["口訣", "The rule"],jokeT:["站同一個地板", "Same floor"]},board:{wrong:[String.raw`\text{線比較長}\ \overset{?}{\Longrightarrow}\ a\ \text{比較大}`,String.raw`\text{longer line}\ \overset{?}{\Longrightarrow}\ \text{larger}\ a`],flip:String.raw`a=\dfrac{\Delta v}{\Delta t}:\ \dfrac{10-0}{5-0}=2,\quad \dfrac{0-10}{20-10}=-1`,solveB:String.raw`W_f=\Delta K=0-\tfrac12(1000)(10)^2=-5\times10^{4}\ \mathrm{J}`,solveC:String.raw`\tfrac12(5)(10)=25\ \mathrm{m},\quad \tfrac12(10)(10)=50\ \mathrm{m}`,solveE:String.raw`25+50+50=125\ \mathrm{m}`,altB:String.raw`f=ma=1000\ \mathrm{N},\quad W=-fd=-5\times10^{4}\ \mathrm{J}`,trick:[String.raw`\text{斜率}=a,\quad \text{面積}=\Delta x`,String.raw`\text{slope}=a,\quad \text{area}=\Delta x`],jokeT:[String.raw`\text{同高才能比底}`,String.raw`\text{same height, compare bases}`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q10=[
 {
  "id": "Q10_06",
  "row": "wrong",
  "duration": 2.7,
  "disp": "選錯的人，最常選 A 或 B。",
  "en": "Those who got it wrong mostly picked A or B."
 },
 {
  "id": "Q10_07",
  "row": "wrong",
  "duration": 4.5,
  "disp": "A 說，減速階段的加速度，是加速階段的 2 倍。",
  "en": "A says the acceleration while slowing down is twice the acceleration while speeding up."
 },
 {
  "id": "Q10_08",
  "row": "wrong",
  "duration": 5.1,
  "disp": "直覺會想，減速那段線比較長，好像比較猛，對不對？",
  "en": "Your gut says the slowing-down line is longer, so it must be stronger, right?"
 },
 {
  "id": "Q10_09",
  "row": "wrong",
  "duration": 2.1,
  "disp": "線比較長就比較猛？",
  "en": "A longer line means stronger?"
 },
 {
  "id": "Q10_10",
  "row": "wrong",
  "duration": 3.9,
  "disp": "那我上課講比較久，是不是就比較厲害？",
  "en": "Then if I lecture longer, does that make me better?"
 },
 {
  "id": "Q10_11",
  "row": "flip",
  "duration": 1.7,
  "disp": "其實剛好相反。",
  "en": "Actually, it's the other way around."
 },
 {
  "id": "Q10_12",
  "row": "flip",
  "duration": 8.9,
  "disp": "因為加速度是速度的變化量除以時間，在 v-t 圖上就是斜率，所以要看的是陡不陡，不是長不長。",
  "en": "Acceleration is the change in velocity divided by time, which on a v-t graph is the slope. So look at how steep it is, not how long."
 },
 {
  "id": "Q10_13",
  "row": "flip",
  "duration": 1.5,
  "disp": "斜率怎麼算？",
  "en": "How do we find the slope?"
 },
 {
  "id": "Q10_14",
  "row": "flip",
  "duration": 6.9,
  "disp": "加速段，速度從 0 變到 10，變化量是 10；時間從 0 秒到 5 秒，經過了 5 秒。",
  "en": "Speeding up, velocity goes from 0 to 10, a change of 10; time goes from 0 to 5 seconds, so 5 seconds pass."
 },
 {
  "id": "Q10_15",
  "row": "flip",
  "duration": 2.5,
  "disp": "10÷5，加速度是 2。",
  "en": "10 divided by 5: the acceleration is 2."
 },
 {
  "id": "Q10_16",
  "row": "flip",
  "duration": 7.3,
  "disp": "減速段，速度從 10 降到 0，變化量是−10；時間從 10 秒到 20 秒，經過了 10 秒。",
  "en": "Slowing down, velocity drops from 10 to 0, a change of minus 10; time goes from 10 to 20 seconds, so 10 seconds pass."
 },
 {
  "id": "Q10_17",
  "row": "flip",
  "duration": 6.9,
  "disp": "−10÷10，等於−1，負號只是表示加速度和運動方向相反，量值是 1。",
  "en": "Minus 10 divided by 10 is minus 1. The minus sign only means the acceleration points against the motion; the magnitude is 1."
 },
 {
  "id": "Q10_18",
  "row": "flip",
  "duration": 5.1,
  "disp": "所以減速的加速度量值，反而只有加速的一半，A 錯。",
  "en": "So the slowing-down acceleration is only half of the speeding-up one. A is wrong."
 },
 {
  "id": "Q10_19",
  "row": "solveB",
  "duration": 1.9,
  "disp": "B 問阻力作的功。",
  "en": "B asks about the work done by the resistance."
 },
 {
  "id": "Q10_20",
  "row": "solveB",
  "duration": 7.5,
  "disp": "因為減速的時候，汽車已經失去動力，水平方向只剩下阻力，所以阻力就是合力。",
  "en": "While slowing down, the car has lost its driving force, so only the resistance acts horizontally. The resistance is the net force."
 },
 {
  "id": "Q10_21",
  "row": "solveB",
  "duration": 4.5,
  "disp": "功能定理說：合力作的功，等於動能的變化量。",
  "en": "The work-energy theorem says the work done by the net force equals the change in kinetic energy."
 },
 {
  "id": "Q10_22",
  "row": "solveB",
  "duration": 4.1,
  "disp": "所以阻力作的功，等於末動能減掉初動能。",
  "en": "So the work done by the resistance equals final kinetic energy minus initial kinetic energy."
 },
 {
  "id": "Q10_23",
  "row": "solveB",
  "duration": 3.1,
  "disp": "車子最後停下來，末動能是 0。",
  "en": "The car ends up stopped, so its final kinetic energy is 0."
 },
 {
  "id": "Q10_24",
  "row": "solveB",
  "duration": 10.3,
  "disp": "初動能是 1/2 乘以質量，乘以速度的平方：1/2×1000，乘以 \\(10^{2}\\)，等於 \\(5\\times10^{4}\\) 焦耳。",
  "en": "Initial kinetic energy is 1/2 times mass times velocity squared: 1/2 × \\(1000\\times10^{2}\\), which is \\(5\\times10^{4}\\) joules."
 },
 {
  "id": "Q10_25",
  "row": "solveB",
  "duration": 9.7,
  "disp": "所以阻力作的功，等於 0 減掉 \\(5\\times10^{4}\\)，是−\\(5\\times10^{4}\\) 焦耳；負號表示阻力讓動能變少。",
  "en": "So the work is 0 minus \\(5\\times10^{4}\\), or −\\(5\\times10^{4}\\) joules. The minus sign means the resistance reduces the kinetic energy."
 },
 {
  "id": "Q10_26",
  "row": "solveB",
  "duration": 4.3,
  "disp": "選項寫 \\(10^{6}\\)，差了 100 倍，所以 B 錯。",
  "en": "The option says \\(10^{6}\\), off by a factor of 100. B is wrong."
 },
 {
  "id": "Q10_27",
  "row": "solveC",
  "duration": 1.5,
  "disp": "再來看位移。",
  "en": "Next, displacement."
 },
 {
  "id": "Q10_28",
  "row": "solveC",
  "duration": 6.1,
  "disp": "因為速度乘以時間就是位移，所以 v-t 圖底下的面積，就是位移。",
  "en": "Velocity times time is displacement, so the area under a v-t graph is the displacement."
 },
 {
  "id": "Q10_29",
  "row": "solveC",
  "duration": 5.1,
  "disp": "加速段是一個三角形，面積是 1/2 乘以底乘以高。",
  "en": "The speeding-up part is a triangle: its area is 1/2 times base times height."
 },
 {
  "id": "Q10_30",
  "row": "solveC",
  "duration": 6.7,
  "disp": "底是 5 秒，高是 10 公尺每秒，1/2×5×10，等於 25 公尺。",
  "en": "The base is 5 seconds, the height 10 meters per second: 1/2 × 5 × 10 = 25 meters."
 },
 {
  "id": "Q10_31",
  "row": "solveC",
  "duration": 6.5,
  "disp": "所以 D 說 50 公尺，錯；選 D 的同學，是忘了三角形還要乘 1/2。",
  "en": "So D's 50 meters is wrong. Those who chose D forgot the 1/2 for a triangle."
 },
 {
  "id": "Q10_32",
  "row": "solveC",
  "duration": 7.9,
  "disp": "減速段也是三角形，底是 10 秒，高一樣是 10，1/2×10×10，等於 50 公尺。",
  "en": "The slowing-down part is also a triangle, base 10 seconds, same height 10: 1/2 × 10 × 10 = 50 meters."
 },
 {
  "id": "Q10_33",
  "row": "solveC",
  "duration": 6.9,
  "disp": "50÷25 等於 2，減速段的位移，剛好是加速段的 2 倍，所以 C 對。",
  "en": "50 divided by 25 is 2. The slowing-down displacement is exactly twice the speeding-up one, so C is right."
 },
 {
  "id": "Q10_34",
  "row": "solveE",
  "duration": 1.9,
  "disp": "E 問全程的位移。",
  "en": "E asks about the displacement for the whole trip."
 },
 {
  "id": "Q10_35",
  "row": "solveE",
  "duration": 7.3,
  "disp": "中間等速段是長方形，面積是底乘以高，5 秒乘以 10 公尺每秒，等於 50 公尺。",
  "en": "The constant-speed middle part is a rectangle, base times height: 5 seconds times 10 meters per second, 50 meters."
 },
 {
  "id": "Q10_36",
  "row": "solveE",
  "duration": 6.9,
  "disp": "全程就是三塊面積加起來：25 加 50 再加 50，等於 125 公尺。",
  "en": "The whole trip is the three areas added up: 25 + 50 + 50 = 125 meters."
 },
 {
  "id": "Q10_37",
  "row": "solveE",
  "duration": 6.7,
  "disp": "選 E 的 200 公尺，是把整段都當成每秒 10 公尺、跑了 20 秒，所以 E 錯。",
  "en": "E's 200 meters treats the whole trip as 10 meters per second for 20 seconds, so E is wrong."
 },
 {
  "id": "Q10_38",
  "row": "solveE",
  "duration": 1.3,
  "disp": "答案是 C。",
  "en": "The answer is C."
 },
 {
  "id": "Q10_39",
  "row": "altB",
  "duration": 10.5,
  "disp": "回頭用另一種方法驗算 B：因為減速段是等加速度，所以阻力是固定的，f 等於 m a，1000×1，等於 1000 牛頓。",
  "en": "Now check B another way: the slowing down has constant acceleration, so the resistance is constant. f = ma = 1000 × 1 = 1000 newtons."
 },
 {
  "id": "Q10_40",
  "row": "altB",
  "duration": 9.9,
  "disp": "減速段走了 50 公尺，阻力和位移方向相反，所以作功是−1000×50，一樣是−\\(5\\times10^{4}\\) 焦耳。",
  "en": "The car travels 50 meters while slowing down, and the resistance opposes the motion, so the work is −1000 × 50, again −\\(5\\times10^{4}\\) joules."
 },
 {
  "id": "Q10_41",
  "row": "altB",
  "duration": 6.1,
  "disp": "兩種方法對得起來，表示沒算錯；哪一種你用得順，就用哪一種。",
  "en": "Both methods agree, so the math is right. Use whichever feels easier."
 },
 {
  "id": "Q10_44",
  "row": "trick",
  "duration": 3.9,
  "disp": "秒殺口訣：斜率看加速度，面積看位移。",
  "en": "The shortcut: slope gives acceleration, area gives displacement."
 },
 {
  "id": "Q10_45",
  "row": "trick",
  "duration": 5.7,
  "disp": "這題還有更快的方法：加速段和減速段，都是高 10 的三角形。",
  "en": "There's an even faster way: the speeding-up and slowing-down parts are both triangles of height 10."
 },
 {
  "id": "Q10_46",
  "row": "trick",
  "duration": 5.9,
  "disp": "高一樣的時候，面積比就等於底的比，5 比 10，也就是 1 比 2。",
  "en": "With equal heights, the area ratio is the base ratio: 5 to 10, or 1 to 2."
 },
 {
  "id": "Q10_47",
  "row": "trick",
  "duration": 9.5,
  "disp": "注意喔，這是捷徑，老司機要提醒你：只有兩個三角形一樣高才能抄，高不一樣還硬抄，就會開進水溝。",
  "en": "Careful, this is a shortcut, and the old driver has a warning: it only works when the two triangles have the same height. Force it otherwise and you'll end up in a ditch."
 },
 {
  "id": "Q10_48",
  "row": "jokeT",
  "duration": 5.7,
  "disp": "就像比身高，要站在同一個地板上比，你站到椅子上，不算。",
  "en": "It's like comparing heights: you have to stand on the same floor. Standing on a chair doesn't count."
 }
];
/* tracks:end */
