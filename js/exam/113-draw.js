/* 113 學測各題共用的畫法（畫布 460×250 邏輯座標，用 ExamScene.kit 的 label、line、arrow…）。 */
window.Exam113Draw=(()=>{
  'use strict';
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,clamp}=K,C=K.colors,P=Exam113Core;
  // 立體小球（質子紅、中子灰、電子藍…）
  function ball(g,x,y,r,color,rim='#00000055'){
    const gr=g.createRadialGradient(x-r*.35,y-r*.4,r*.1,x,y,r);gr.addColorStop(0,'#ffffffcc');gr.addColorStop(.25,color);gr.addColorStop(1,shade(color,-.45));
    g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle=gr;g.fill();g.strokeStyle=rim;g.lineWidth=.8;g.stroke();
  }
  function shade(hex,k){const n=parseInt(hex.slice(1,7),16),f=c=>clamp(Math.round(c+(k<0?c*k:(255-c)*k)),0,255);return '#'+[n>>16,n>>8&255,n&255].map(f).map(v=>v.toString(16).padStart(2,'0')).join('');}
  // 原子核：n 顆核子排成一團（質子、中子交錯），固定排法不會每格亂跳
  function nucleus(g,x,y,R,n,glow=0){
    if(glow){const gl=g.createRadialGradient(x,y,R*.3,x,y,R*2.2);gl.addColorStop(0,'rgba(255,190,110,'+(.45*glow)+')');gl.addColorStop(1,'rgba(255,190,110,0)');g.fillStyle=gl;g.beginPath();g.arc(x,y,R*2.2,0,Math.PI*2);g.fill();}
    const r=R/Math.sqrt(n)*1.05,pts=[];for(let i=0;i<n;i++){const a=i*2.39996,d=Math.sqrt((i+.5)/n)*(R-r*.6);pts.push([x+d*Math.cos(a),y+d*Math.sin(a),i]);}
    pts.sort((a,b)=>a[1]-b[1]).forEach(([px,py,i])=>ball(g,px,py,r,i%5<2?'#e8705f':'#a9b8c2'));
  }
  // 座標軸：回傳 X(v)、Y(v)
  function axes(g,o){
    const {x,y,w,h,xmax,ymax,xmin=0,ymin=0}=o,X=v=>x+(v-xmin)/(xmax-xmin)*w,Y=v=>y-(v-ymin)/(ymax-ymin)*h;
    if(o.grid){g.strokeStyle='#ffffff14';g.lineWidth=1;for(const v of o.grid.x||[]){g.beginPath();g.moveTo(X(v),y);g.lineTo(X(v),y-h);g.stroke();}for(const v of o.grid.y||[]){g.beginPath();g.moveTo(x,Y(v));g.lineTo(x+w,Y(v));g.stroke();}}
    arrow(g,x,y,x+w+12,y,C.faint,1.5,7);arrow(g,x,y,x,y-h-12,C.faint,1.5,7);
    for(const [v,t] of o.xt||[]){line(g,X(v),y,X(v),y+4,C.faint,1);label(g,t,X(v),y+16,C.faint,13,'center');}
    for(const [v,t] of o.yt||[]){line(g,x-4,Y(v),x,Y(v),C.faint,1);label(g,t,x-7,Y(v)+4,C.faint,13,'right');}
    if(o.xl)label(g,o.xl,x+w+10,y+30,C.faint,13,'right');if(o.yl)label(g,o.yl,x+4,y-h-6,C.faint,12);
    return {X,Y};
  }
  function curve(g,f,a,b,X,Y,color,width=2,dash=[],steps=220){
    g.beginPath();g.setLineDash(dash);g.strokeStyle=color;g.lineWidth=width;g.lineJoin='round';
    for(let i=0;i<=steps;i++){const v=a+(b-a)*i/steps,px=X(v),py=Y(f(v));i?g.lineTo(px,py):g.moveTo(px,py);}g.stroke();g.setLineDash([]);
  }
  // ── 圖 8：四種射束的吸收劑量
  const BEAM_STYLE={electron:['#7fb6ff',[2,3]],x4:['#eef5f6',[]],x20:['#ffd17e',[9,3,2,3]],proton:['#ff8a80',[7,4]]};
  function fig8(g,o={}){
    const box8=o.box||{x:46,y:214,w:300,h:178},{X,Y}=axes(g,{...box8,xmax:15,ymax:1.05,xt:(box8.w<280?[0,3,6,9,12,15]:[0,2,4,6,8,10,12,14,15]).map(v=>[v,String(v)]),xl:T('深度（公分）','Depth (cm)'),yl:T('吸收劑量','Absorbed dose')});
    if(o.band){g.fillStyle='#8ae6d726';g.fillRect(X(o.band[0]),box8.y-box8.h,X(o.band[1])-X(o.band[0]),box8.h);line(g,X(o.band[0]),box8.y,X(o.band[0]),box8.y-box8.h,'#8ae6d788',1,[3,3]);line(g,X(o.band[1]),box8.y,X(o.band[1]),box8.y-box8.h,'#8ae6d788',1,[3,3]);}
    for(const k of ['x4','x20','proton','electron']){
      const [col,dash]=BEAM_STYLE[k],dim=o.only&&!o.only.includes(k),hot=o.hot===k;
      curve(g,x=>P.dose(k,x),0,o.upto??15,X,Y,dim?col+'40':col,hot?3.4:2,dash);
    }
    if(o.labels!==false){const L=[['x20',2.6,1.02,'X 20 MeV'],['x4',4.6,.66,'X 4 MeV'],['electron',1.9,.2,T('電子 4 MeV','Electron 4 MeV')],['proton',12.3,.98,T('質子 150 MeV','p 150 MeV')]];
      for(const [k,v,d,t] of L){const dim=o.only&&!o.only.includes(k);label(g,t,X(v)+4,Y(d)-4,dim?BEAM_STYLE[k][0]+'55':BEAM_STYLE[k][0],14);}}
    if(o.probe!=null){const px=X(o.probe);line(g,px,box8.y,px,box8.y-box8.h-4,C.teal,2);label(g,o.probe.toFixed(1)+' cm',px,box8.y-box8.h-8,C.teal,14,'center');
      for(const k of Object.keys(BEAM_STYLE)){const d=P.dose(k,o.probe);if(d>.004)K.dot(g,px,Y(d),4.5,BEAM_STYLE[k][0]);}}
    return {X,Y};
  }
  // ── 圖 9：安全氣囊的充氣壓力
  function fig9(g,o={}){
    const b=o.box||{x:56,y:212,w:300,h:170},{X,Y}=axes(g,{...b,xmax:80,ymax:300,grid:{x:[10,20,30,40,50,60,70,80],y:[50,100,150,200,250,300]},xt:[0,10,20,30,40,50,60,70,80].map(v=>[v,String(v)]),yt:[0,50,100,150,200,250,300].map(v=>[v,String(v)]),xl:T('時間（ms）','Time (ms)'),yl:T('壓力（kPa）','Pressure (kPa)')});
    curve(g,P.pressure,0,Math.min(60,o.upto??60),X,Y,'#eef5f6',2.4);
    if((o.upto??60)>=60)label(g,T('飽和壓力','Saturation'),X(61),Y(268),C.faint,12);
    if(o.p!=null){const t=P.timeFor(o.p),hl=o.color||C.gold;line(g,X(0),Y(o.p),X(t),Y(o.p),hl,2,[5,4]);line(g,X(t),Y(o.p),X(t),b.y,hl,2,[5,4]);K.dot(g,X(t),Y(o.p),5,hl);
      label(g,Math.round(o.p)+' kPa',X(0)+6,Y(o.p)-6,hl,14);label(g,Math.round(t)+' ms',X(t)+5,b.y-6,hl,14);}
    return {X,Y};
  }
  // ── 圖 18：線圈迴路（甲、R、乙）與磁鐵棒；z：磁鐵中心高度（單位＝磁鐵半長 3 的同一單位），I：電流（逆時針正）
  function circuit(g,o={}){
    const ax=o.ax??112,ay=o.ay??150,ra=o.ra??62,bx=o.bx??330,rb=o.rb??52,squash=.36,I=o.I||0,flow=o.flow||0;
    const ell=(x,r,color,w)=>{g.beginPath();g.ellipse(x,ay,r,r*squash,0,0,Math.PI*2);g.strokeStyle=color;g.lineWidth=w;g.stroke();};
    // 導線：甲右側 → 電阻 → 乙左側（上、下兩條）
    const wire='#d8b072';
    line(g,ax+ra*.92,ay-8,bx-rb*.92,ay-8,wire,3);line(g,ax+ra*.92,ay+8,bx-rb*.92,ay+8,wire,3);
    const rx=(ax+bx)/2;g.fillStyle='#0c2535';g.fillRect(rx-24,ay-14,48,12);g.beginPath();for(let i=0;i<=8;i++){const xx=rx-22+i*5.5,yy=ay-8+(i%2?-5:5)*(i&&i<8?1:0);i?g.lineTo(xx,yy):g.moveTo(xx,yy);}g.strokeStyle='#f0c47a';g.lineWidth=2;g.stroke();
    label(g,'R',rx,ay-20,C.gold,15,'center');
    ell(ax,ra,wire,3.2);ell(bx,rb,wire,3.2);
    label(g,T('甲','A'),ax-ra-4,ay+30,C.white,15,'right');label(g,T('乙','B'),bx+rb+6,ay+30,C.white,15);
    // 電流方向（由上往下看：逆時針＝畫面上前緣往右）
    if(Math.abs(I)>.02){const n=6,dir=Math.sign(I),col=dir>0?C.teal:'#ff9f8a';
      for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2-flow*dir,x=ax+ra*Math.cos(a),y=ay+ra*squash*Math.sin(a),
        tx=ra*Math.sin(a)*dir,ty=-ra*squash*Math.cos(a)*dir,L=Math.hypot(tx,ty);arrow(g,x-tx/L*5,y-ty/L*5,x+tx/L*7,y+ty/L*7,col,2,8);}
      label(g,dir>0?T('逆時針（正）','Counterclockwise (+)'):T('順時針（負）','Clockwise (−)'),ax-14,ay+ra*squash+24,col,13,'right');}
    return {ax,ay,ra,squash};
  }
  // 磁鐵棒：中心在畫面 (x, y)，長 len，S 在下；傳回兩端位置
  function magnet(g,x,y,len,w=16){
    const top=y-len/2,bot=y+len/2,gr=g.createLinearGradient(x-w/2,0,x+w/2,0);gr.addColorStop(0,'#5e6f7c');gr.addColorStop(.45,'#dfe8ee');gr.addColorStop(1,'#4b5966');
    g.fillStyle=gr;g.fillRect(x-w/2,top,w,len/2);
    const gs=g.createLinearGradient(x-w/2,0,x+w/2,0);gs.addColorStop(0,'#3e5c7a');gs.addColorStop(.45,'#9cc7ef');gs.addColorStop(1,'#33506b');g.fillStyle=gs;g.fillRect(x-w/2,y,w,len/2);
    g.strokeStyle='#ffffff66';g.lineWidth=1;g.strokeRect(x-w/2,top,w,len);
    label(g,'N',x,top+15,'#ffe1d6',13,'center');label(g,'S',x,bot-5,'#dceeff',13,'center');
    return {top,bot};
  }
  // ── 圖 19：應電流對時間（0–12 s）；upto：畫到幾秒；from：從幾秒開始畫（只畫後半用 6）
  function fig19(g,o={}){
    const b=o.box||{x:40,y:150,w:390,h:110},X=t=>b.x+t/12.6*b.w,Ymax=P.current(3)*-1.15,Y=i=>b.y-i/Ymax*(b.h/2);
    arrow(g,b.x,b.y,b.x+b.w+8,b.y,C.faint,1.5,7);arrow(g,b.x,b.y+b.h/2+6,b.x,b.y-b.h/2-12,C.faint,1.5,7);
    for(let t=1;t<=12;t++){line(g,X(t),b.y-3,X(t),b.y+3,C.faint,1);label(g,String(t),X(t),b.y-7,C.faint,13,'center');}
    label(g,T('時間（秒）','Time (s)'),b.x+b.w+6,b.y+18,C.faint,13,'right');label(g,T('應電流','Current'),b.x+6,b.y-b.h/2-6,C.faint,12);
    const from=o.from??0,upto=o.upto??6;
    if(upto>from)curve(g,t=>P.current(t),Math.max(0,from),Math.min(12,upto),X,v=>Y(v),o.color||'#eef5f6',2.4,[],260);
    if(o.ghost)curve(g,t=>-P.current(12-t),6,12,X,v=>Y(v),'#8ae6d755',2,[5,4]);
    return {X,Y,b};
  }
  // ── 圖 18 動起來：磁鐵依模型在 t 秒的位置（中心離環圈 6−vt 單位、半長 3），電流箭頭照 current() 的正負；
  // o={t,v,turns,a,ra,rb,flow,force,sc,ay}；磁鐵穿過環圈時，環圈前緣補畫在磁鐵前面
  function fig18(g,o={}){
    const t=o.t??0,v=o.v??1,opt={v,turns:o.turns??1,a:o.a},sc=o.sc??13,ax=o.ax??112,ay=o.ay??176,ra=o.ra??62;
    const Imax=-P.current(3),I=o.I??P.current(t,opt);
    circuit(g,{ax,ay,ra,bx:o.bx??330,rb:o.rb??52,I:o.showI===false?0:I/Imax,flow:o.flow||0});
    const y=ay-(6-v*t)*sc,len=6*sc;
    if(y-len/2<260&&y+len/2>-10){magnet(g,ax,y,len);
      if(Math.abs(y-ay)<len/2+6){g.beginPath();g.ellipse(ax,ay,ra,ra*.36,0,0,Math.PI);g.strokeStyle='#d8b072';g.lineWidth=3.2;g.stroke();}}
    if(o.force){const F=P.forceUp(t,opt)/P.forceUp(3),L=Math.min(60,F*46);if(L>3){arrow(g,ax+26,y,ax+26,y-L,C.red,3,10);label(g,T('磁力','Force'),ax+32,y>ay?y+18:y-L+4,C.red,13);}}
    return {y,I,Imax,ax,ay};
  }
  // 能量卡片（第 19 題能量鏈）
  function chip(g,x,y,w,text,color,on=true){box(g,x,y,w,30,8,on?color+'2e':'#ffffff0d',on?color:'#ffffff30',1.6);label(g,text,x+w/2,y+20,on?color:C.faint,14,'center');}
  return {ball,nucleus,axes,curve,fig8,fig9,circuit,magnet,fig18,fig19,chip,BEAM_STYLE,shade};
})();
