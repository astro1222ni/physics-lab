/* 115 學測第 12 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,dot}=K,C=K.colors,P=Exam115Core;
  // 顏色：動能 K 紫、位能 U 藍、力學能 K+U 與拉力作的功 金、速度 v 白
  const CK=C.violet,CU=C.blue,CE=C.gold;
  const GY=228,HP=168,PX=95,hy=h=>GY-h*HP,NAMES=[['甲','P1'],['乙','P2'],['丙','P3'],['丁','P4']];
  const SUB=[['甲乙','12'],['乙丙','23'],['丙丁','34']],sub=i=>T(...SUB[i]),STG=i=>T(NAMES[i][0]+'→'+NAMES[i+1][0],NAMES[i][1]+'→'+NAMES[i+1][1]);
  const nm=i=>T(...NAMES[i]);
  const TT=2*P.CRANE.b+(P.CRANE.c-P.CRANE.b)+2*(1-P.CRANE.c),S1=2*P.CRANE.b/TT,S2=(P.CRANE.b+P.CRANE.c)/TT;
  const EN=P.craneEnergy(),GG=10; // 模型單位：質量 1、g = 10、最大速率 1（同 Exam115Core.craneEnergy）
  const energy=u=>{const c=P.crane(u),Kk=c.v*c.v/2,U=GG*c.y;return {K:Kk,U,E:Kk+U,c};};
  const snd=o=>{if(LabSettings.get('sound'))LabSound.tone(o);};
  function load(g,x,y,k=1){g.beginPath();g.moveTo(x-5*k,y-8*k);g.lineTo(x+5*k,y-8*k);g.lineTo(x+11*k,y+8*k);g.lineTo(x-11*k,y+8*k);g.closePath();g.fillStyle='#1b2329';g.fill();g.strokeStyle='#9fb3bf';g.lineWidth=1.4;g.stroke();}
  // 圖 5：塔式起重機（同第 11 題）
  function crane(g,o={}){
    const h=o.h??1,fs=o.fs||17,ly=hy(h),steel='#c9d3d8',thin='#8fa3ae';
    box(g,22,GY,196,9,0,'#46545e');g.save();g.beginPath();g.rect(22,GY,196,9);g.clip();for(let x=16;x<226;x+=7)line(g,x,GY+9,x+9,GY,'#a9bac3',1);g.restore();
    const L=172,R=188,top=40;line(g,L,GY,L,top,steel,2);line(g,R,GY,R,top,steel,2);
    for(let y=GY;y>top+6;y-=12){line(g,L,y,R,y-12,thin,1);line(g,L,y-12,R,y-12,thin,1);}
    line(g,52,30,214,30,steel,2);line(g,52,40,214,40,steel,2);for(let x=52;x<212;x+=12)line(g,x,40,x+12,30,thin,1);
    line(g,180,14,62,30,thin,1.2);line(g,180,14,214,30,thin,1.2);line(g,L,30,180,14,steel,2);line(g,R,30,180,14,steel,2);
    box(g,200,41,16,13,2,'#7a8a94');box(g,167,42,26,14,2,'#3d4a54',steel,1);
    box(g,PX-8,40,16,6,1,'#9fb3bf');line(g,PX,46,PX,ly-8,'#e2e8eb',1.4);
    line(g,PX,GY,PX,ly+8,'#eef5f6cc',1.6,[6,5]);
    [0,P.CRANE.b,P.CRANE.c,1].forEach((v,i)=>{const y=hy(v);line(g,PX-12,y,PX+2,y,'#eef5f6',2);label(g,nm(i),PX-16,y+fs*.36,o.hot===i?C.gold:C.white,fs,'right');});
    load(g,PX,ly,o.big||1.3);
    return ly;
  }
  // 三條能量長條：K（放大 10 倍）、U、K+U（同一個尺度：1 單位 = 15 px）
  function bars(g,e,o={}){
    const base=200,sc=15,xs=[252,310,368],vals=[e.K*10,e.U,e.E],cols=[CK,CU,CE],names=[T('K ×10','K ×10'),'U','K + U'];
    line(g,226,base,396,base,C.faint,1.5);
    vals.forEach((v,i)=>{const h=v*sc;box(g,xs[i]-18,base-h,36,Math.max(h,1),4,cols[i]+'99',cols[i],1.5);label(g,names[i],xs[i],base+20,cols[i],o.fs||15,'center');});
    if(o.wt){const h=e.E*sc;line(g,394,base,394,base-h,CE,2);line(g,389,base-h,399,base-h,CE,2);line(g,389,base,399,base,CE,2);sci(g,'W_{T}',404,base-h/2+6,CE,17);}
  }
  function sign(g,x,y,w,h,crack){box(g,x,y,w,h,10,'#f3ead2','#b89a5a',3);label(g,T('力學能守恆！','Energy conserved!'),x+w/2,y+38,'#7a2a1a',22,'center');sci(g,'ΔU + ΔK = 0',x+w/2,y+72,'#3a2a1a',20,'center');
    if(crack){g.beginPath();g.moveTo(x+w*.42,y);[[.5,.2],[.4,.38],[.56,.56],[.46,.76],[.55,1]].forEach(([a,b])=>g.lineTo(x+w*a,y+h*b));g.strokeStyle='#3a2a1a';g.lineWidth=3*crack;g.stroke();}}
  // ΔK、ΔU 表格（右半邊）：kc／uc 是已填的列數，hot 是要強調的列
  function table(g,kc,uc,hot=-1,hotCol=-1){
    const x0=232,x1=452,cx=[262,350,420],rows=[94,142,190];
    label(g,T('路段','Stage'),cx[0],48,C.faint,15,'center');sci(g,'ΔK',cx[1],48,CK,19,'center');sci(g,'ΔU',cx[2],48,CU,19,'center');
    line(g,x0,62,x1,62,C.faint,1.5);
    rows.forEach((y,i)=>{if(i===hot)box(g,x0,y-28,x1-x0,42,6,'#ffd17e1c','#ffd17e88',1.5);label(g,STG(i),cx[0],y,C.white,15,'center');if(i<2)line(g,x0,y+20,x1,y+20,'#ffffff22',1);
      if(i<kc)label(g,['+','0','−'][i],cx[1],y+4,CK,28,'center');if(i<uc)label(g,'+',cx[2],y+4,CU,28,'center');});
    if(hotCol>=0)box(g,cx[hotCol+1]-32,28,64,186,8,null,'#ffd17e88',2);
  }
  function chip(g,x,y,w,h,txt,col,size=18){box(g,x,y,w,h,10,col+'1f',col,2);sci(g,txt,x+w/2,y+h/2+size*.36,col,size,'center');}
  function plaster(g,x,y){g.save();g.translate(x,y);g.rotate(-.35);box(g,-70,-22,140,44,8,'#e9cfa1','#b89a5a',2);g.fillStyle='#d8b98a';g.fillRect(-26,-22,52,44);
    for(let i=-60;i<=60;i+=12)for(let j=-16;j<=16;j+=10)dot(g,i,j,1.3,'#b89a5a');g.restore();}
  function stamp(g,x,y,txt){g.beginPath();g.arc(x,y,38,0,Math.PI*2);g.fillStyle='#6fe0a81f';g.fill();g.strokeStyle=C.green;g.lineWidth=3;g.stroke();
    label(g,T('答案','Answer'),x,y-10,C.green,15,'center');label(g,txt,x,y+20,C.green,24,'center');}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const n=+s.id.slice(4),k=s.part;
    if(n<=8){crane(g,{h:1});sign(g,236,40,206,96,n===7?seg(k,.6,.9):1);
      if(n===8){plaster(g,340,88);label(g,T('不是萬用膏藥','Not a cure-all'),340,190,C.red,20,'center');label(g,T('不能哪裡痛就貼哪裡','Don’t stick it everywhere'),340,220,C.faint,16,'center');}
      return;}
    if(n===9){chip(g,20,40,420,74,'',C.green);label(g,T('只有重力、彈力這類保守力作功','Only conservative forces (gravity, springs) do work'),230,70,C.green,18,'center');label(g,T('→ 力學能守恆','→ mechanical energy conserved'),230,98,C.green,18,'center');
      if(k>.45){chip(g,20,140,420,74,'',C.red);label(g,T('起重機的拉力 T 也在作功','The crane’s pull T also does work'),230,170,C.red,18,'center');label(g,T('→ 不守恆','→ not conserved'),230,198,C.red,18,'center');}
      return;}
    if(n<=11){const u=n===10?seg(k,0,.92):1,e=energy(u),ly=crane(g,{h:e.c.y});
      arrow(g,PX,ly-14,PX,ly-56,CE,3,10);label(g,'T',PX+8,ly-40,CE,17);
      bars(g,e,{wt:n===11});
      if(n===10)sci(g,T('拉力作正功 W_{T} > 0','The pull does work: W_{T} > 0'),340,24,CE,17,'center');
      else{label(g,T('多出來的能量 = 拉力作的功','The extra energy = work by the pull'),340,24,CE,16,'center');label(g,T('不是它自己很上進','It did not climb by itself'),340,240,C.faint,15,'center');}
      return;}
    if(n<=16){const i=n-14,u=n<14?.5:[S1,(S1+S2)/2,1][i],c=P.crane(n<14?0:u);crane(g,{h:c.y,hot:n>=14?i+1:null});
      if(n>=14&&c.v>.05){arrow(g,128,hy(c.y)+20,128,hy(c.y)+20-40*c.v,C.white,3,10);label(g,'v',134,hy(c.y)-8,C.white,16);}
      if(n>=14&&c.v<=.05)label(g,'v = 0',118,hy(c.y)+5,C.white,15);
      table(g,n>=14?i+1:0,0,n>=14?i:-1);
      if(n>=13)sci(g,'K = 1/2 m v^{2}',342,236,CK,19,'center');
      return;}
    if(n<=19){
      // ΔK 瀑布圖：0 → +ΔK甲乙 → 0 → 回到 0
      const base=160,sc=180,xs=[60,140,220],dk=EN.dK,u=seg(k,0,.7);let acc=0;
      line(g,30,base,280,base,C.faint,1.5);label(g,'K = 0',30,base+20,C.faint,15);
      dk.forEach((d,i)=>{const show=n>17||u>i/3;if(!show)return;const y0=base-acc*sc,y1=base-(acc+d)*sc;
        if(Math.abs(d)>1e-9){box(g,xs[i]-22,Math.min(y0,y1),44,Math.abs(y1-y0),4,CK+'99',CK,1.5);arrow(g,xs[i],d>0?y0-8:y0+8,xs[i],d>0?y1+8:y1-8,C.white,2.5,9);}else line(g,xs[i]-22,y0,xs[i]+22,y0,CK,3);
        if(i<2)line(g,xs[i]+22,y1,xs[i+1]-22,y1,'#ffffff55',1,[3,3]);
        label(g,['+','0','−'][i],xs[i],Math.min(y0,y1)-8,CK,22,'center');label(g,STG(i),xs[i],base+48,C.white,15,'center');acc+=d;});
      if(n===17){sci(g,T('甲、丁靜止：K = 0','At P1, P4: K = 0'),370,70,C.white,18,'center');if(k>.5)sci(g,T('三段總和 = 0 − 0 = 0','Sum of 3 = 0 − 0 = 0'),370,110,CK,18,'center');}
      if(n>=18){if(LabSettings.lang==='en')sci(g,'ΔK_{12} + ΔK_{34} = 0',370,70,CK,19,'center');else{label(g,'甲乙段 ΔK',370,56,CK,18,'center');label(g,'＋ 丙丁段 ΔK = 0',370,82,CK,18,'center');}label(g,'B',336,128,C.green,22,'center');mark(g,368,120,true,10);}
      if(n===19){sci(g,T('D：三段加起來 > 0','D: sum of 3 > 0'),370,170,C.red,18,'center');mark(g,370,206,false,11);}
      return;}
    if(n<=25){const ly=crane(g,{h:n===21?seg(k,0,.9):1});
      if(n===21){sci(g,'U = m g h',342,236,CU,19,'center');arrow(g,128,GY-2,128,ly+4,CU,2.5,9);label(g,'h',134,(GY+ly)/2+5,CU,17);}
      table(g,3,n>=22?3:0,n===23?0:n===24?1:-1,n===20||n===22?1:-1);
      if(n===22){sci(g,T('ΔU 總和 > 0 → E','Sum of ΔU > 0 → E'),342,236,CU,18,'center');mark(g,430,229,true,9);}
      if(n===23){label(g,T('A：正 + 正 ≠ 0','A: + plus + ≠ 0'),342,236,C.red,18,'center');mark(g,440,229,false,9);}
      if(n===24){label(g,T('C：0 + 正 > 0','C: 0 plus + > 0'),342,236,C.red,18,'center');mark(g,440,229,false,9);}
      if(n===25)label(g,T('答案 B、E','Answer: B, E'),342,240,C.green,20,'center');
      return;}
    chip(g,20,26,420,56,T('靜止 → 靜止：ΣΔK = 0','Rest → rest: ΣΔK = 0'),CK,20);
    chip(g,20,98,420,56,T('一路往上：ΣΔU > 0','Rising all the way: ΣΔU > 0'),CU,20);
    if(n===27)[false,true,false,false,true].forEach((ok,j)=>{const x=60+j*85;label(g,'ABCDE'[j],x-12,214,ok?C.green:C.red,22,'center');mark(g,x+14,206,ok,10);});
  }
  // 動手：拖重物走完三段，看 K、U、K+U 長條；三段都看過、停到丁，ΔK 加起來是 0
  function hands(g,s){
    const e=energy(s.u),ly=crane(g,{h:e.c.y,hot:e.c.stage+1});
    if(e.c.v>.05){arrow(g,128,ly+20,128,ly+20-40*e.c.v,C.white,3,10);label(g,'v',134,ly-6,C.white,16);}
    bars(g,e,{fs:17});
    label(g,STG(e.c.stage),310,24,C.gold,19,'center');
    label(g,'ΔK',226,243,CK,17);const xs=[256,316,376];[0,1,2].forEach(i=>{label(g,sub(i),xs[i],243,s.seen[i]?C.white:'#7a8f9b',17);label(g,s.seen[i]?['+','0','−'][i]:'?',xs[i]+(LabSettings.lang==='en'?22:37),244,s.seen[i]?CK:'#7a8f9b',20);});
    if(s.done)label(g,'Σ = 0',454,214,C.green,19,'right');
  }
  function heightToU(h){let a=0,b=1;for(let i=0;i<30;i++){const m=(a+b)/2;if(P.crane(m).y<h)a=m;else b=m;}return b;}
  ExamScene.add(12,{
    state:()=>({row:'',id:'Q12_07',part:0,t:0,hands:false,u:0,seen:[false,false,false],done:false}),
    paint,
    preview(g){g.save();g.translate(110,0);crane(g,{h:1,fs:24,big:1.5});g.restore();},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,btn,complete,render}){
      s.hands=true;let frame=0,gen=0,playB,last=-1;
      const R=range(T('時間進度','Time'),0,100,0,v=>{stop();set(v/100);});R.val.textContent='0%';
      function set(u){s.u=clamp(u,0,1);R.input.value=Math.round(s.u*100);R.val.textContent=Math.round(s.u*100)+'%';
        const c=P.crane(s.u);if(s.u>.001)s.seen[c.stage]=true;
        if(c.stage!==last){last=c.stage;snd({freq:[523,392,330][c.stage],dur:.12,type:'triangle',gain:.12});}
        if(s.seen.every(Boolean)&&s.u>=.999&&!s.done){s.done=true;if(LabSettings.get('sound'))LabSound.sweep({from:440,to:880,dur:.25,gain:.12});complete();}}
      function stop(){gen++;cancelAnimationFrame(frame);if(playB)playB.textContent=T('▶ 自動播放','▶ Play');}
      btn(T('重來','Reset'),()=>{stop();set(0);});
      playB=btn(T('▶ 自動播放','▶ Play'),b=>{if(b.textContent.startsWith('❚')){stop();return;}stop();if(s.u>=1)set(0);
        const tok=gen;let prev;b.textContent=T('❚❚ 暫停','❚❚ Pause');
        const tick=now=>{if(tok!==gen)return;if(!canvas.isConnected||document.hidden||!canvas.closest('details')?.open)return stop();
          const dt=prev===undefined?0:Math.min(.1,(now-prev)/1000);prev=now;set(s.u+dt/8);render();if(s.u<1)frame=requestAnimationFrame(tick);else stop();};
        frame=requestAnimationFrame(tick);});
      canvas.tabIndex=0;
      canvas.addEventListener('keydown',e=>{const d={ArrowUp:.02,ArrowRight:.02,ArrowDown:-.02,ArrowLeft:-.02}[e.key];
        if(e.key==='Home'){stop();set(0);}else if(e.key==='End'){stop();set(1);}else if(d==null)return;else{stop();set(s.u+d);}e.preventDefault();render();});
      let mode='load';
      const at=(x,y)=>{if(mode==='load')set(heightToU(clamp((GY-y)/HP,0,1)));else set((x-226)/170);render();};
      return {hit:(x,y)=>{stop();mode=x<220?'load':'time';at(x,y);return 0;},move:(_,x,y)=>at(x,y)};
    },
    read(s,output){const e=energy(s.u),f=x=>x.toFixed(2);
      output.innerHTML=STG(e.c.stage)+'：K = '+f(e.K)+'　U = '+f(e.U)+'　K + U = '+f(e.E)+T('（模型單位，K 長條放大 10 倍）',' (model units; K bar ×10)')+'<br>'+
        (s.done?T('三段 ΔK：+0.50、0、−0.50，加起來 = 0；ΔU 三段都是正的，加起來 > 0','ΔK for the stages: +0.50, 0, −0.50, sum = 0; every ΔU is positive, so the sum > 0'):
          T('拖重物從甲拉到丁（或按「自動播放」），三段都要看到','Drag the load from P1 to P4 (or press Play) through all three stages'));}
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(12,{groups:{wrong:["力學能守恆嗎？", "Is mechanical energy conserved?"],jokeW:["起重機不是白做工", "The crane is not working for free"],flip:["拉力作正功", "The cable does positive work"],solveK:["動能的變化", "Changes in kinetic energy"],solveB:["三段加起來", "Add the three stages"],solveU:["位能一路增加", "Potential energy keeps rising"],trick:["口訣", "The rule"]},board:{wrong:[String.raw`K+U\ \text{守恆？}`,String.raw`K+U\ \text{conserved?}`],jokeW:String.raw`W_T>0`,flip:[String.raw`W_T>0\ \Rightarrow\ \Delta(K+U)>0`,String.raw`W_T>0\ \Rightarrow\ \Delta(K+U)>0`],solveK:String.raw`K=\tfrac12mv^2:\quad \Delta K_{1}>0,\ \ \Delta K_{2}=0,\ \ \Delta K_{3}<0`,solveB:String.raw`\Delta K_{1}+\Delta K_{2}+\Delta K_{3}=K_{\text{end}}-K_{\text{start}}=0`,solveU:String.raw`U=mgh:\quad \Delta U_{1},\ \Delta U_{2},\ \Delta U_{3}>0`,trick:[String.raw`\text{靜止}\to\text{靜止}:\ \textstyle\sum\Delta K=0`,String.raw`\text{rest}\to\text{rest}:\ \textstyle\sum\Delta K=0`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q12=[
 {
  "id": "Q12_07",
  "row": "wrong",
  "duration": 6.5,
  "disp": "很多人一看到動能加位能，就反射動作：力學能守恆，加起來等於 0！",
  "en": "Many people see kinetic plus potential energy and react instantly: mechanical energy is conserved, so it adds up to 0!"
 },
 {
  "id": "Q12_08",
  "row": "jokeW",
  "duration": 6.1,
  "disp": "力學能守恆很好用，可是它不是萬用膏藥，不能哪裡痛就貼哪裡。",
  "en": "Conservation of mechanical energy is useful, but it isn't a cure-all you can stick on wherever it hurts."
 },
 {
  "id": "Q12_09",
  "row": "flip",
  "duration": 6.7,
  "disp": "可是力學能守恆有條件：只有重力、彈力這類保守力作功的時候才成立。",
  "en": "It has a condition: it only holds when conservative forces like gravity and spring forces do the work."
 },
 {
  "id": "Q12_10",
  "row": "flip",
  "duration": 9.9,
  "disp": "這題繩子的拉力一直往上拉，重物也一直往上走，所以拉力一直在作正功，力學能就一直增加，根本不守恆。",
  "en": "Here the cable keeps pulling up and the load keeps moving up, so the tension keeps doing positive work. Mechanical energy keeps increasing, so it isn't conserved at all."
 },
 {
  "id": "Q12_11",
  "row": "flip",
  "duration": 7.5,
  "disp": "不然你想想看，重物從靜止升到高處，多出來的位能，總不會是它自己很上進吧？",
  "en": "Think about it: the load rises from rest to a high place. That extra potential energy didn't come from self-improvement, did it?"
 },
 {
  "id": "Q12_12",
  "row": "solveK",
  "duration": 2.7,
  "disp": "我們先看三段的動能變化。",
  "en": "First, the change in kinetic energy over the three stages."
 },
 {
  "id": "Q12_13",
  "row": "solveK",
  "duration": 9.1,
  "disp": "動能 K，等於 1/2 乘以質量 m，再乘以速度 v 的平方；動能的變化量，就是末動能減掉初動能。",
  "en": "Kinetic energy K equals one half times mass m times velocity v squared; the change is final kinetic energy minus initial kinetic energy."
 },
 {
  "id": "Q12_14",
  "row": "solveK",
  "duration": 6.1,
  "disp": "甲點靜止，乙點有速度，甲到乙，動能從 0 變大，變化量是正的。",
  "en": "At rest at P1, moving at P2: from P1 to P2 the kinetic energy grows from 0, so the change is positive."
 },
 {
  "id": "Q12_15",
  "row": "solveK",
  "duration": 4.9,
  "disp": "乙到丙等速，速度不變，動能也不變，變化量是 0。",
  "en": "From P2 to P3 the speed is constant, so kinetic energy stays the same and the change is 0."
 },
 {
  "id": "Q12_16",
  "row": "solveK",
  "duration": 5.1,
  "disp": "丙到丁從有速度到停下來，動能減少，變化量是負的。",
  "en": "From P3 to P4 it goes from moving to stopped: kinetic energy decreases, so the change is negative."
 },
 {
  "id": "Q12_17",
  "row": "solveB",
  "duration": 10.7,
  "disp": "因為甲和丁都是靜止，頭尾的動能都是 0，所以三段加起來的總變化量，等於丁的動能減掉甲的動能，0 減 0 等於 0。",
  "en": "Because it's at rest at both P1 and P4, kinetic energy is 0 at both ends. The total change is the kinetic energy at P4 minus at P1: 0 minus 0 is 0."
 },
 {
  "id": "Q12_18",
  "row": "solveB",
  "duration": 5.1,
  "disp": "乙到丙那段是 0，所以甲乙加丙丁，就等於 0，B 對。",
  "en": "The P2-to-P3 stage is 0, so P1-to-P2 plus P3-to-P4 equals 0. B is right."
 },
 {
  "id": "Q12_19",
  "row": "solveB",
  "duration": 3.9,
  "disp": "D 說三段加起來大於 0，錯，是等於 0。",
  "en": "D says the three stages add up to more than 0. Wrong: it's exactly 0."
 },
 {
  "id": "Q12_20",
  "row": "solveU",
  "duration": 1.1,
  "disp": "位能呢？",
  "en": "What about potential energy?"
 },
 {
  "id": "Q12_21",
  "row": "solveU",
  "duration": 7.1,
  "disp": "地表附近的重力位能 U，等於 m g h，h 是高度，所以高度越高，位能越大。",
  "en": "Near the Earth's surface, gravitational potential energy U equals mgh, where h is height, so the higher it goes, the more potential energy it has."
 },
 {
  "id": "Q12_22",
  "row": "solveU",
  "duration": 7.5,
  "disp": "一路往上，三段的高度都在增加，位能變化都是正的，加起來當然大於 0，E 對。",
  "en": "It goes up all the way, so height increases in all three stages. Every potential energy change is positive, so the sum is surely more than 0. E is right."
 },
 {
  "id": "Q12_23",
  "row": "solveU",
  "duration": 6.9,
  "disp": "A，甲到乙，位能增加，動能也增加，兩個正的加起來，不可能是 0，錯。",
  "en": "A: from P1 to P2, potential energy rises and kinetic energy rises too. Two positives can't add to 0. Wrong."
 },
 {
  "id": "Q12_24",
  "row": "solveU",
  "duration": 5.5,
  "disp": "C，乙到丙，動能不變，位能增加，加起來大於 0，也錯。",
  "en": "C: from P2 to P3, kinetic energy stays the same and potential energy rises, so the sum is more than 0. Also wrong."
 },
 {
  "id": "Q12_25",
  "row": "solveU",
  "duration": 1.5,
  "disp": "答案 B、E。",
  "en": "The answer is B and E."
 },
 {
  "id": "Q12_26",
  "row": "trick",
  "duration": 7.9,
  "disp": "秒殺：看到靜止到靜止，先寫動能總變化等於 0；一路往上，位能總變化一定大於 0。",
  "en": "The shortcut: rest to rest, write total kinetic energy change equals 0; going up all the way, total potential energy change must be more than 0."
 },
 {
  "id": "Q12_27",
  "row": "trick",
  "duration": 3.7,
  "disp": "這 2 句寫下來，5 個選項就判斷完了。",
  "en": "Write those 2 lines and all 5 options are settled."
 }
];
/* tracks:end */
