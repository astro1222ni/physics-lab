/* 115 學測第 17 題 */
(() => {
  // 畫面與動手（Claude 11/27）：月球日夜的分子平均動能。日間金色、夜間藍色、克氏溫度青色，全頁一致。
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,P=Exam115Core,Q=Exam115.questions[17];
  const DAY=121,NIGHT=-133,EARTH=[31,23],DC=C.gold,NC=C.blue,KC=C.teal;
  const kv=c=>P.kelvin(c), cel=c=>(c<0?'−':'')+Math.abs(c)+' °C', ratio=(a,b)=>P.keRatio(a,b);
  const beep=(f,d=.08,type='sine',gain=.1)=>{if(LabSettings.get('sound')&&window.LabSound)LabSound.tone({freq:f,dur:d,type,gain});};
  // 分子的方均根速率 ∝ √T（克氏）；回傳每秒走過幾個「盒寬」
  const speed=c=>.42*Math.sqrt(Math.max(0,kv(c))/300);
  const tri=u=>{u=((u%2)+2)%2;return u<1?u:2-u;}, dtri=u=>(((u%2)+2)%2<1?1:-1);
  // 分子盒：phase＝累積走過的路；arrows 畫速度箭頭（長度 ∝ 速率）；rev 讓箭頭反向（倒退嚕）
  function gas(g,x,y,w,h,phase,color,{n=14,spd=null,rev=false}={}){
    box(g,x,y,w,h,8,'#ffffff0d',color,1.5);
    for(let i=0;i<n;i++){
      const a=i*2.39996+.4,vx=Math.cos(a),vy=Math.sin(a)*.8,x0=(i*.618+.07)%1,y0=(i*.382+.21)%1,ux=x0+vx*phase,uy=y0+vy*phase;
      const px=x+8+tri(ux)*(w-16),py=y+8+tri(uy)*(h-16);
      if(spd!=null&&spd>.01){const dx=vx*dtri(ux)*(rev?-1:1),dy=vy*dtri(uy)*(rev?-1:1),L=Math.hypot(dx,dy),len=6+spd*22;
        arrow(g,px,py,px+dx/L*len,py+dy/L*len,color+'cc',1.5,5);}
      Exam113Draw.ball(g,px,py,4.5,color);
    }
  }
  // 溫度計：攝氏 −273～150 對應 top～bot
  const TY=(c,top,bot)=>bot-(c+273)/423*(bot-top);
  function thermo(g,x,top,bot,c,color,hot=false){
    if(hot)box(g,x-11,top-11,22,bot-top+36,11,null,C.white+'88',1.5);
    box(g,x-6,top-6,12,bot-top+12,6,'#ffffff14','#ffffffaa',1.5);
    const y=TY(clamp(c,-273,150),top,bot);g.fillStyle=color;g.fillRect(x-3,y,6,bot+8-y);K.dot(g,x,bot+12,9,color);
    for(const v of [-273,0,100])line(g,x+6,TY(v,top,bot),x+11,TY(v,top,bot),C.faint,1.5);
  }
  // 雙刻度尺：左攝氏、右克氏
  function dual(g,x,top,bot,marks,{gap=null}={}){
    line(g,x,top-4,x,bot+4,C.white,2);label(g,'°C',x-12,top-14,C.white,16,'right');label(g,'K',x+12,top-14,KC,16);
    for(const [c,col] of marks){const y=TY(c,top,bot);line(g,x-8,y,x+8,y,col,2.5);label(g,cel(c),x-14,y+5,col,16,'right');label(g,kv(c)+' K',x+14,y+5,KC,16);}
  }
  function moon(g,x,y,r){
    g.save();g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.clip();
    const gr=g.createRadialGradient(x-r*.45,y-r*.35,r*.1,x,y,r*1.05);gr.addColorStop(0,'#f1eee4');gr.addColorStop(1,'#99958a');g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r);
    for(let i=0;i<11;i++){const a=i*2.4,d=Math.sqrt((i+.5)/11)*r*.85;g.beginPath();g.arc(x+d*Math.cos(a),y+d*Math.sin(a),r*(.06+.05*(i%3)),0,Math.PI*2);g.fillStyle='#7f7b7066';g.fill();}
    const sh=g.createLinearGradient(x-8,0,x+12,0);sh.addColorStop(0,'#0a182400');sh.addColorStop(1,'#0a1824ee');g.fillStyle=sh;g.fillRect(x-8,y-r,r+8,2*r);
    g.restore();g.strokeStyle='#d8d3c4';g.lineWidth=1;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.stroke();
    line(g,x-r,y,x+r,y,'#ffffff66',1,[4,4]);
  }
  function sunGlow(g){const gl=g.createRadialGradient(-30,125,10,-30,125,170);gl.addColorStop(0,'#fff3c4');gl.addColorStop(.3,'#ffc34d88');gl.addColorStop(1,'#ff8a0000');g.fillStyle=gl;g.fillRect(-300,-50,480,350);}
  // 分數：分子、分母置中
  function frac(g,num,den,x,y,color,size=24){
    g.font='600 '+size+'px system-ui,sans-serif';const w=Math.max(g.measureText(num).width,g.measureText(den).width)+10;
    sci(g,num,x,y-size*.35,color,size,'center');line(g,x-w/2,y,x+w/2,y,color,2);sci(g,den,x,y+size*.95,color,size,'center');return w;
  }
  const ids=['Q17_07','Q17_08','Q17_09','Q17_10','Q17_11','Q17_12','Q17_13','Q17_14','Q17_15'],I=id=>ids.indexOf(id);
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:{ // 直接拿攝氏相除
        gas(g,20,30,150,92,speed(DAY)*t,DC);label(g,T('日間 121 °C','Day 121 °C'),26,144,DC,17);
        gas(g,20,156,150,70,speed(NIGHT)*t,NC);label(g,T('夜間 −133 °C','Night −133 °C'),178,214,NC,17);
        sci(g,'E ∝ T',300,56,C.white,22,'center');
        if(k>.35){frac(g,'121','133',300,128,C.red,30);label(g,'?',344,140,C.red,34);}
        if(k>.6)label(g,T('選 C 的有 '+Q.shares[2]+'%','C was picked by '+Q.shares[2]+'%'),448,236,C.faint,15,'right');
        return;}
      case 1:{ // 克氏溫度＝絕對溫度
        dual(g,120,46,220,[[121,DC],[0,C.white],[-133,NC],[-273,C.red]].slice(0,1+Math.floor(seg(k,0,.7)*3.99)));
        label(g,T('克氏溫度','Kelvin temperature'),250,70,KC,22);label(g,T('＝絕對溫度','= absolute temperature'),250,102,KC,20);
        if(k>.4)sci(g,'T (K) = t (°C) + 273',250,160,C.gold,20);
        return;}
      case 2:{ // 0 °C 還在動；−273 °C 才停
        const Tc=u=>-273*ease(seg(u,.15,.8));let ph=0;for(let j=0;j<40;j++)ph+=speed(Tc((j+.5)/40*k))*t/40;
        const c=Math.round(Tc(k));gas(g,16,30,220,190,ph,c>-270?C.white:C.faint,{spd:speed(c)});
        thermo(g,290,40,196,c,c>-270?KC:C.red);
        label(g,cel(c),312,72,C.white,22);label(g,kv(c)+' K',312,104,KC,22);
        label(g,c>-5?T('0 °C：分子還在動','0 °C: still moving'):c>-270?T('越冷越慢……','colder, slower…'):T('0 K：真正的零','0 K: the true zero'),312,156,c>-270?C.white:C.red,17);
        if(c<=-270)label(g,T('分子停住','molecules stop'),312,184,C.red,17);
        return;}
      case 3:{ // 夜間 −133 °C 拿 +133 去除：分子倒退嚕？
        gas(g,16,30,200,190,-speed(NIGHT)*t,NC,{spd:speed(NIGHT),rev:true});
        label(g,'−133 °C',250,70,NC,30);g.beginPath();g.arc(258,60,12,0,Math.PI*2);g.strokeStyle=C.red;g.lineWidth=2;g.stroke();
        if(k>.25){arrow(g,262,90,262,118,C.red,2,8);label(g,T('拿 +133 去除？','divide by +133?'),250,146,C.red,20);}
        if(k>.55){label(g,T('◀◀ 分子倒退嚕？','◀◀ molecules in reverse?'),250,190,C.white,18);label(g,T('動能不會是負的','KE is never negative'),250,222,C.faint,16);}
        return;}
      case 4:{ // 換成克氏
        const a=seg(k,.05,.35),b=seg(k,.5,.8);
        dual(g,92,46,220,[[121,DC],[0,C.white],[-133,NC]]);
        if(a>0){sci(g,'T_{日} = 121 + 273',196,72,DC,20);if(a>=1)sci(g,'= 394 K',236,104,KC,22);}
        if(b>0){sci(g,'T_{夜} = −133 + 273',196,156,NC,20);if(b>=1)sci(g,'= 140 K',236,188,KC,22);}
        return;}
      case 5:{ // 平均動能 ∝ 絕對溫度 → 394/140
        const base=214,sc=160/400,u=seg(k,0,.4),hd=kv(DAY)*sc*u,hn=kv(NIGHT)*sc*u;
        line(g,54,base,204,base,C.white,1.5);label(g,'0 K',48,base+5,C.faint,15,'right');
        box(g,66,base-hd,52,hd,4,DC+'cc');box(g,140,base-hn,52,hn,4,NC+'cc');
        if(u>=1){label(g,'394 K',92,base-hd-8,DC,17,'center');label(g,'140 K',166,base-hn-8,NC,17,'center');}
        label(g,T('平均動能 ∝ T','avg KE ∝ T'),129,240,C.faint,16,'center');
        if(k>.35){sci(g,'E_{日} / E_{夜}',320,62,C.white,20,'center');frac(g,'394','140',290,124,C.white,26);sci(g,'≈ '+ratio(DAY,NIGHT).toFixed(1),360,138,C.gold,26,'center');}
        if(k>.75){label(g,T('答案 E','Answer: E'),310,214,C.green,24,'center');mark(g,380,206,true,11);}
        return;}
      case 6:{ // B 是地球的數字
        K.earth(g,92,92,44);moon(g,340,92,44);
        frac(g,'304','296',92,184,C.red,22);mark(g,150,190,false,10);label(g,T('B：地球','B: Earth'),92,240,C.red,17,'center');
        frac(g,'394','140',340,184,C.green,22);mark(g,398,190,true,10);label(g,T('E：月球','E: the Moon'),340,240,C.green,17,'center');
        if(k>.5)label(g,T('這題問月球','The question asks about the Moon'),216,34,C.gold,17,'center');
        return;}
      case 7:{ // 口訣：相乘相除先加 273
        box(g,40,40,380,96,12,'#ffd17e1f',C.gold,2);label(g,T('相乘、相除','Multiply or divide'),230,78,C.white,20,'center');sci(g,T('→ 先 + 273','→ add 273 first'),230,116,C.gold,26,'center');
        if(k>.4){sci(g,'121 °C → 394 K',130,190,DC,20,'center');sci(g,'−133 °C → 140 K',330,190,NC,20,'center');}
        return;}
      default:{ // 溫差：攝氏和克氏一樣
        const top=46,bot=220,yd=TY(DAY,top,bot),yn=TY(NIGHT,top,bot);
        dual(g,92,top,bot,[[121,DC],[-133,NC]]);
        if(k>.2){line(g,170,yd,184,yd,C.white,2);line(g,184,yd,184,yn,C.white,2);line(g,170,yn,184,yn,C.white,2);}
        if(k>.3){sci(g,'121 − (−133) = '+(DAY-NIGHT)+' °C',200,96,C.white,19);sci(g,'394 − 140 = '+(kv(DAY)-kv(NIGHT))+' K',200,136,KC,19);}
        if(k>.65)label(g,T('溫差：一樣，不用加','Differences: same, no need'),200,190,C.green,19);
        return;}
    }
  }
  // 能動手：拖兩支溫度計（或拉滑桿）設日夜溫度，看分子速率與動能比
  const TT=30,TB=184;
  function hands(g,s){
    [[0,s.day,26,DC,T('日間','Day')],[1,s.night,246,NC,T('夜間','Night')]].forEach(([i,c,x,col,name])=>{
      thermo(g,x,TT,TB,c,col,s.sel===i);gas(g,x+24,28,160,136,s.ph[i],col,{n:12,spd:speed(c)});
      label(g,name+' '+cel(c),x+24,188,col,17);sci(g,'= '+kv(c)+' K',x+24,212,KC,17);
    });
    const ok=s.day===DAY&&s.night===NIGHT;
    if(kv(s.night)<=0)label(g,T('夜間 0 K：分子不動，比值沒有意義','Night at 0 K: no motion, no ratio'),230,242,C.red,16,'center');
    else sci(g,'E_{日} / E_{夜} = '+kv(s.day)+' / '+kv(s.night)+' ≈ '+ratio(s.day,s.night).toFixed(2),230,242,ok?C.green:C.white,18,'center');
    if(s.wrong)label(g,T('攝氏相除：','Celsius ratio: ')+s.day+' / '+s.night+(s.night?' = '+(s.day/s.night).toFixed(2):''),230,18,C.red,16,'center');
  }
  ExamScene.add(17,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,day:20,night:20,ph:[0,.37],sel:0,wrong:false,done:false}),
    paint,
    preview(g){
      sunGlow(g);moon(g,230,122,80);
      K.dot(g,180,122,6,DC);K.dot(g,280,122,6,NC);
      label(g,T('太陽光','Sunlight'),16,30,C.gold,17);
      label(g,T('日間','Day'),20,96,DC,22);label(g,'121 °C',20,136,DC,30);
      label(g,T('夜間','Night'),330,96,NC,22);label(g,'−133 °C',330,136,NC,30);
      line(g,140,128,174,124,DC,1.5,[3,3]);line(g,326,128,286,124,NC,1.5,[3,3]);
      label(g,T('月球赤道的日夜均溫','Moon equator: day and night'),230,238,C.faint,17,'center');
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,btn,toggle,complete,render,root}){
      s.hands=true;const ctl=[];let lastTone=[20,20];
      function set(i,v){
        v=clamp(Math.round(v),-273,150);const key=i?'night':'day';if(s[key]===v)return;s[key]=v;s.sel=i;
        ctl[i].input.value=v;ctl[i].val.textContent=cel(v);
        if(Math.abs(v-lastTone[i])>=10||v===DAY||v===NIGHT){lastTone[i]=v;beep(300+Math.sqrt(kv(v))*30,.05,'triangle',.06);}
        if(!s.done&&s.day===DAY&&s.night===NIGHT){s.done=true;complete();beep(784,.14,'sine',.12);beep(1175,.2,'sine',.1);}
      }
      ctl[0]=range(T('日間溫度','Day temperature'),-273,150,20,v=>set(0,v));ctl[1]=range(T('夜間溫度','Night temperature'),-273,150,20,v=>set(1,v));
      ctl.forEach(c=>c.val.textContent='20 °C');
      btn(T('換成地球的日夜（B）','Earth day/night (B)'),()=>{set(0,EARTH[0]);set(1,EARTH[1]);});
      toggle('顯示攝氏直接相除（C 的錯法）','Show the Celsius ratio (C)',v=>s.wrong=v);
      // 鍵盤：方向鍵上下調溫度（Shift 一次 10 度），左右換日夜
      canvas.tabIndex=0;canvas.setAttribute('aria-label',T('拖曳溫度計設定日夜溫度；方向鍵上下調整、左右切換日夜','Drag the thermometers; arrow keys adjust, left/right switch day and night'));
      canvas.addEventListener('keydown',e=>{const d={ArrowUp:1,ArrowDown:-1}[e.key];
        if(d){set(s.sel,s[s.sel?'night':'day']+d*(e.shiftKey?10:1));e.preventDefault();render();}
        else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){s.sel=e.key==='ArrowLeft'?0:1;e.preventDefault();render();}});
      // 分子一直在動：打開動手區、頁面看得到時才跑
      let raf=0,last=0;const det=root.closest('details'),alive=()=>!document.hidden&&(!det||det.open);
      const loop=now=>{const dt=last?Math.min(.1,(now-last)/1000):0;last=now;s.ph[0]+=dt*speed(s.day);s.ph[1]+=dt*speed(s.night);render();if(alive())raf=requestAnimationFrame(loop);else{raf=0;last=0;}};
      const kick=()=>{if(!raf&&alive()){last=0;raf=requestAnimationFrame(loop);}};
      det?.addEventListener('toggle',kick);document.addEventListener('visibilitychange',kick);addEventListener('pagehide',()=>cancelAnimationFrame(raf));kick();
      const TYc=y=>-273+(TB-y)/(TB-TT)*423;
      return {hit:(x,y)=>y<12||y>222?null:(s.sel=x<236?0:1),move:(i,x,y)=>{set(i,TYc(y));render();}};
    },
    read(s,output){
      const d=kv(s.day),n=kv(s.night);
      output.innerHTML=T('日間 ','Day ')+cel(s.day)+' → <b>'+d+' K</b>　'+T('夜間 ','Night ')+cel(s.night)+' → <b>'+n+' K</b><br>'+
        (n>0?'E<sub>'+T('日','day')+'</sub> / E<sub>'+T('夜','night')+'</sub> = '+d+' / '+n+' = <b>'+(d/n).toFixed(2)+'</b>'+(s.day===DAY&&s.night===NIGHT?T('　月球的日夜：答案 E','　Moon day/night: answer E'):''):T('夜間 0 K：分子停住','Night at 0 K: molecules stop'));
    }
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(17,{groups:{wrong:["直接拿攝氏相除？", "Divide the Celsius readings?"],flip:["真正的零度", "The real zero"],solve:["換成克氏溫度", "Convert to kelvin"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\dfrac{121}{133}\ ?`,flip:String.raw`0\ \mathrm{K}=-273\ {}^{\circ}\mathrm{C}`,solve:String.raw`\dfrac{E_{\text{day}}}{E_{\text{night}}}=\dfrac{121+273}{-133+273}=\dfrac{394}{140}\approx2.8`,trick:[String.raw`\text{相除先加 }273,\ \text{溫差不用加}`,String.raw`\text{ratios: add }273;\ \text{differences: no need}`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q17=[
 {
  "id": "Q17_07",
  "row": "wrong",
  "duration": 6.06,
  "disp": "平均動能跟溫度成正比，那就把溫度相除嘛，121 比 133。",
  "en": "Average kinetic energy is proportional to temperature, so just divide the temperatures, 121 over 133."
 },
 {
  "id": "Q17_08",
  "row": "flip",
  "duration": 3.74,
  "disp": "注意喔，題目說的是克氏溫度，絕對溫度。",
  "en": "Careful: the question says Kelvin temperature, absolute temperature."
 },
 {
  "id": "Q17_09",
  "row": "flip",
  "duration": 5.83,
  "disp": "攝氏 0 度不是真的 0，分子還在動；真正的 0，在−273 度。",
  "en": "0 degrees Celsius isn't a true zero; molecules are still moving. True zero is at −273 degrees."
 },
 {
  "id": "Q17_10",
  "row": "flip",
  "duration": 6.95,
  "disp": "而且晚上是−133 度，你拿正 133 去除，那晚上的分子，是在倒退嚕嗎？",
  "en": "Besides, night is −133 degrees. Dividing by positive 133, are the night molecules moving in reverse?"
 },
 {
  "id": "Q17_11",
  "row": "solve",
  "duration": 10.63,
  "disp": "先換成克氏溫度：白天 121 加 273，等於 394 K；晚上−133 加 273，等於 140 K。",
  "en": "Convert to Kelvin first: day is 121 plus 273, or 394 K; night is −133 plus 273, or 140 K."
 },
 {
  "id": "Q17_12",
  "row": "solve",
  "duration": 10.99,
  "disp": "因為平均動能跟絕對溫度成正比，所以白天的平均動能除以晚上的平均動能，就等於 394÷140，大約 2.8 倍，答案 E。",
  "en": "Since average kinetic energy is proportional to absolute temperature, day over night equals 394÷140, about 2.8 times. Answer E."
 },
 {
  "id": "Q17_13",
  "row": "solve",
  "duration": 8.05,
  "disp": "B 那個 304 比 296，是地球的數字；你人在地球沒錯，可是這題問的是月球。",
  "en": "B's 304 over 296 uses Earth's numbers. You may be on Earth, but this question is about the Moon."
 },
 {
  "id": "Q17_14",
  "row": "trick",
  "duration": 8.54,
  "disp": "秒殺口訣：攝氏溫度要變成克氏溫標，拿來相乘或相除之前，記得一定先加 273。",
  "en": "The shortcut: Celsius has to become Kelvin. Before you multiply or divide, always add 273 first."
 },
 {
  "id": "Q17_15",
  "row": "trick",
  "duration": 7.7,
  "disp": "注意喔，如果只是算溫差，像白天比晚上高幾度，攝氏和克氏算出來一樣，就不用加。",
  "en": "Careful: if you only need a temperature difference, like how much hotter day is than night, Celsius and Kelvin give the same result, so no need to add."
 }
];
/* tracks:end */
