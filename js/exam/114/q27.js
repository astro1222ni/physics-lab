/* 114 學測第 27 題：手機無線充電（單選 D，答對率 83%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg}=K, C=K.colors, P=ExamPhysics;
  Exam114.add(27,{
    lab:'faraday',labName:['法拉第定律與冷次定律','Faraday’s law and Lenz’s law'],
    stem:['如圖 5 所示，目前許多手機可以進行無線充電。充電時，手機和充電器上各自的線圈系統對齊靠近、靜止置放，而充電器上的線圈電流會隨時間快速變化。','As shown in figure 5, many phones can be charged wirelessly. While charging, the coil systems in the phone and the charger are aligned, close together and at rest, and the current in the charger’s coil changes rapidly with time.'],
    ask:['在充電的過程中，下列敘述何者正確？','During charging, which statement is correct?'],
    choices:[['電流經由導線從充電器流向手機','Current flows through a wire from the charger to the phone.'],
      ['手機上之線圈系統四周的磁場始終保持不變','The magnetic field around the phone’s coil system stays constant.'],
      ['手機電池所獲得的能量等於充電器所輸出的能量','The energy gained by the phone battery equals the energy output by the charger.'],
      ['手機和充電器上的兩個線圈系統之間會有磁力線通過','Magnetic field lines pass between the two coil systems.'],
      ['充電器上的線圈會隨時間漸漸發熱，手機上的線圈不會','The charger’s coil gradually warms up, but the phone’s coil does not.']],
    key:'D',rate:83,shares:[6,3,5,83,2],
    hint:['充電器的電流一直在變，它的磁場會怎樣？手機的線圈要靠什麼才會有電流？','The charger’s current keeps changing. What happens to its magnetic field? What makes a current flow in the phone’s coil?'],
    hands:['交流與直流比一比','AC versus DC'],mid:'solve',
    caption:['圖 5　手機與充電器的線圈對齊、靜止放置','Figure 5 · The phone and charger coils aligned and at rest'],
    focus:/電磁感應|磁場|磁力線|磁通量|感應出?電流|熱效應|發熱|交流電|線圈|有變化|變動|electromagnetic induction|magnetic field|field lines|magnetic flux|induced current|heating effect|heat\w*|alternating current|coils?|chang\w*/i,
    groups:{wrong:['無線還有導線？','A wire in wireless?'],solve:['電磁感應','Electromagnetic induction'],others:['其他選項','The other choices'],life:['你每天都在用','You use it every day'],trick:['有變化，才有感應','Only change induces']},
    board:{solve:S`\varepsilon=-\dfrac{\Delta\Phi_B}{\Delta t}`,others:[S`E_{\text{充電器輸出}}=E_{\text{電池}}+Q_{\text{熱}}`,S`E_{\rm out}=E_{\rm battery}+Q_{\rm heat}`],life:S`\Delta I\neq0\ \Rightarrow\ \varepsilon\neq0`,trick:S`\Delta\Phi_B=0\ \Rightarrow\ \varepsilon=0`},
    specific:{Q27_17:S`\varepsilon=-\dfrac{\Delta\Phi_B}{\Delta t}`,Q27_18:S`\Delta I\Rightarrow\Delta B\Rightarrow\Delta\Phi_B\Rightarrow\varepsilon`,Q27_19:S`\boxed{D}`,Q27_24:S`\boxed{D}`}
  });
  const copper='#d98a4e';
  // 側視：充電座在下、手機在上；I＝充電座電流（−1..1），e＝手機感應電動勢（−1..1）
  function rig(g,cx,y1,y2,I,e,{field=true,heat=0,cable=false}={}){
    // 磁力線：從充電座中心往上穿過手機，再從兩側繞回來
    if(field&&Math.abs(I)>.02){g.save();g.globalAlpha=Math.min(1,Math.abs(I)*1.1);
      for(const sgn of [-1,1])for(let j=0;j<3;j++){const w=34+j*20;g.beginPath();g.moveTo(cx+sgn*(8+j*7),y1);g.bezierCurveTo(cx+sgn*(8+j*7),y2-50-j*14,cx+sgn*w*1.6,y2-60-j*18,cx+sgn*w*1.7,(y1+y2)/2);g.bezierCurveTo(cx+sgn*w*1.8,y1+30+j*10,cx+sgn*(8+j*7),y1+44+j*10,cx+sgn*(8+j*7),y1);
        g.strokeStyle='#7fb6ff';g.lineWidth=1.5;g.stroke();}
      const dir=I>0?-1:1;for(const sgn of [-1,1])arrow(g,cx+sgn*8,(y1+y2)/2+dir*6,cx+sgn*8,(y1+y2)/2-dir*8,'#7fb6ff',2,8);
      g.restore();}
    // 充電座
    g.beginPath();g.ellipse(cx,y1+12,100,20,0,0,Math.PI*2);g.fillStyle='#26323c';g.fill();g.beginPath();g.ellipse(cx,y1,100,20,0,0,Math.PI*2);g.fillStyle=heat?'rgb('+(58+heat*90)+',62,70)':'#3a4650';g.fill();
    for(let r=18;r<=70;r+=13){g.beginPath();g.ellipse(cx,y1,r,r*.2,0,0,Math.PI*2);g.strokeStyle=copper;g.lineWidth=2.2;g.globalAlpha=.55+.45*Math.abs(I);g.stroke();g.globalAlpha=1;}
    // 手機
    box(g,cx-118,y2-14,236,20,7,heat?'rgb('+(40+heat*90)+',44,52)':'#1d2830','#5b6d78');
    for(let r=18;r<=60;r+=14){g.beginPath();g.ellipse(cx,y2+8,r,r*.16,0,0,Math.PI*2);g.strokeStyle=copper;g.lineWidth=2;g.stroke();}
    if(Math.abs(e)>.05){g.save();g.globalAlpha=Math.min(1,Math.abs(e));const d=e>0?1:-1;arrow(g,cx-d*28,y2+16,cx+d*28,y2+16,'#ffd17e',2.5,9);g.restore();}
    if(heat){g.strokeStyle='#ff9f5a';g.lineWidth=2;for(const [x,y] of [[cx-60,y2-20],[cx+60,y2-20],[cx-70,y1-26],[cx+70,y1-26]]){g.globalAlpha=heat;g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x+6,y-8,x-6,y-14,x,y-22);g.stroke();}g.globalAlpha=1;}
    if(cable){g.beginPath();g.moveTo(cx+100,y1+6);g.bezierCurveTo(cx+160,y1+10,cx+170,y2-40,cx+118,y2-4);g.strokeStyle='#d7dee2';g.lineWidth=3;g.stroke();}
  }
  function scope(g,x,y,w,h,t,{freq=1,ac=true,showE=true}={}){
    box(g,x,y,w,h,6,'#081621','#35505f');line(g,x+4,y+h/2,x+w-4,y+h/2,'#35505f',1);
    for(const [key,c] of [['current','#d98a4e'],...(showE?[['emf','#ffd17e']]:[])]){g.beginPath();for(let i=0;i<=80;i++){const tt=t-2+2*i/80,v=P.induction(tt,{freq,ac})[key]/(key==='emf'?2*Math.PI*freq:1);const px=x+4+(w-8)*i/80,py=y+h/2-v*(h/2-6);i?g.lineTo(px,py):g.moveTo(px,py);}g.strokeStyle=c;g.lineWidth=2;g.stroke();}
    label(g,'I',x+8,y+16,'#d98a4e',13);if(showE)label(g,'ε',x+22,y+16,'#ffd17e',13);
  }
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id,t=s.t,{current:I,emf}=P.induction(t,{freq:.7}),e=emf/(2*Math.PI*.7);
    if(s.hands)return hands(g,s);
    if(r==='wrong'){rig(g,150,196,96,0,0,{field:false,cable:true});label(g,T('A：靠導線？','A: through a wire?'),300,56,C.red,18);
      if(id==='Q27_09'){mark(g,330,150,false,16);label(g,T('那就不叫無線充電','that would not be wireless'),300,210,C.white,15);}return;}
    if(r==='solve'){
      rig(g,150,200,92,id==='Q27_17'?0:I,id==='Q27_17'?0:e);
      if(id==='Q27_17'){label(g,T('電磁感應','Electromagnetic induction'),300,60,C.gold,20);return;}
      const steps=[T('電流變','I changes'),T('磁場變','B changes'),T('磁通量變','Φ changes'),T('感應電流','induced I')];
      const n=id==='Q27_18'?Math.min(4,Math.floor(k*5)):4;steps.slice(0,n).forEach((t2,i)=>{label(g,(i?'→ ':'')+t2,310,40+i*28,i===3?C.gold:C.white,16);});
      scope(g,300,160,150,72,t,{freq:.7});
      if(id==='Q27_19'){box(g,10,10,226,58,8,'#0b2233ee','#7fb6ff',1.5);label(g,T('磁力線穿過兩個線圈','field lines pass through both'),20,32,'#7fb6ff',15);label(g,T('D 對','D is right'),20,56,C.green,18);mark(g,80,50,true,9);}
      return;
    }
    if(r==='others'){
      if(id==='Q27_20'){rig(g,150,200,92,.8,0,{});label(g,T('B：磁場不變','B: constant field'),300,50,C.white,16);sci(g,'ΔΦ = 0 → ε = 0',300,84,C.gold,17);label(g,T('沒有感應電流','no induced current'),300,114,C.red,15);mark(g,420,150,false,12);return;}
      if(id==='Q27_21'){label(g,T('C：能量全部到手機？','C: all the energy reaches the phone?'),20,40,C.white,16);
        box(g,30,70,400,26,6,'#ffd17e44','#ffd17e');label(g,T('充電器輸出','charger output'),40,89,C.gold,14);
        box(g,30,110,300,26,6,'#6fe0a855','#6fe0a8');label(g,T('電池得到','battery gains'),40,129,C.green,14);box(g,330,110,100,26,6,'#ff9f5a44','#ff9f5a');label(g,T('變成熱','heat'),340,129,'#ff9f5a',14);
        label(g,T('一定比較少','always less'),30,180,C.red,17);mark(g,150,174,false,10);return;}
      rig(g,150,200,92,I,e,{heat:id==='Q27_22'?.4+.6*seg(k,0,.6):1});
      label(g,T('E：兩邊都有電流','E: both coils carry current'),300,50,C.white,15);label(g,T('→ 兩邊都會熱','→ both get warm'),300,80,'#ff9f5a',16);
      if(id>='Q27_23'){mark(g,420,130,false,12);}
      if(id==='Q27_24'){label(g,T('答案 D','Answer D'),300,200,C.green,24);mark(g,410,192,true,10);}
      return;
    }
    if(r==='life'){
      if(id==='Q27_25'){label(g,T('同樣的原理，你每天都在用','The same idea, every day'),230,124,C.gold,20,'center');return;}
      if(id==='Q27_26'){// 電磁爐
        box(g,60,170,300,28,8,'#1d2830','#5b6d78');for(let r2=20;r2<=90;r2+=14){g.beginPath();g.ellipse(210,184,r2,r2*.12,0,0,Math.PI*2);g.strokeStyle=copper;g.globalAlpha=.4+.6*Math.abs(I);g.stroke();g.globalAlpha=1;}
        const glow=Math.abs(e);box(g,120,110,180,58,10,'rgb('+(90+glow*120)+',80,70)','#b0bcc2');g.fillStyle='#b0bcc2';g.fillRect(110,106,200,8);
        g.save();g.globalAlpha=glow;for(let r2=16;r2<=60;r2+=14){g.beginPath();g.ellipse(210,164,r2,r2*.14,0,0,Math.PI*2);g.strokeStyle='#ffd17e';g.lineWidth=2;g.stroke();}g.restore();
        label(g,T('鍋底感應出電流 → 發熱','induced current in the pot → heat'),230,40,C.white,16,'center');label(g,T('一定要用交流電','must be AC'),230,68,C.gold,16,'center');scope(g,330,90,120,60,t,{freq:.7,showE:false});return;}
      // 悠遊卡
      box(g,80,120,140,90,10,'#1f6f66','#8ae6d7');label(g,T('讀卡機','reader'),150,232,C.faint,13,'center');
      g.save();g.translate(250,80);g.rotate(-.15);box(g,0,0,140,86,10,'#e8f0f2');for(let r2=10;r2<=34;r2+=8){g.strokeStyle=copper;g.lineWidth=1.5;g.strokeRect(70-r2*1.6,43-r2,r2*3.2,r2*2);}g.restore();
      label(g,T('嗶！','Beep!'),330,60,C.gold,20);label(g,T('卡片線圈感應到電','the card’s coil is induced'),20,40,C.white,15);return;
    }
    if(r==='trick'){
      label(g,T('有變化，才有感應','Only change induces'),230,40,C.gold,22,'center');
      scope(g,20,70,200,110,t,{freq:.7});label(g,T('交流：一直變','AC: always changing'),120,206,C.green,15,'center');
      box(g,240,70,200,110,6,'#081621','#35505f');line(g,244,100,436,100,'#d98a4e',2);line(g,244,125,436,125,'#ffd17e',2);label(g,'I',250,92,'#d98a4e',13);label(g,'ε = 0',250,145,'#ffd17e',13);
      label(g,T('直流：不變','DC: steady'),340,206,C.red,15,'center');
      if(id==='Q27_29')label(g,T('動磁生電的「動」＝變動','“moving” = changing'),230,236,C.white,15,'center');
      return;
    }
  }
  function hands(g,s){
    const {current:I,emf}=P.induction(s.time,{freq:s.freq,ac:s.ac}),e=Math.max(-1,Math.min(1,emf/(2*Math.PI*1.5)));
    rig(g,130,204,96,s.ac?I:.9,e);
    scope(g,272,24,176,90,s.time,{freq:s.freq,ac:s.ac});
    // 手機電量
    box(g,290,140,120,40,6,null,C.white,2);g.fillStyle=C.white;g.fillRect(410,152,6,16);box(g,294,144,112*s.battery/100,32,4,s.battery>=100?C.green:'#6fe0a888');
    label(g,Math.round(s.battery)+'%',350,166,C.white,16,'center');
    label(g,s.ac?T('交流 ','AC ')+s.freq.toFixed(1)+' Hz':T('直流：磁場不變','DC: steady field'),272,206,s.ac?C.green:C.red,15);
    label(g,s.ac?(s.battery>=100?T('充飽了','fully charged'):T('充電中','charging')):T('ε = 0，充不了電','ε = 0, no charging'),272,232,s.ac?C.white:C.red,14);
  }
  ExamScene.add(27,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,ac:true,freq:1,time:0,battery:0,dc:0}),
    paint,
    preview(g){rig(g,204,200,96,.8,.8);label(g,T('手機','Phone'),338,92,C.white,22);label(g,T('充電器','Charger'),338,208,C.white,22);label(g,T('線圈','Coils'),22,154,copper,LabSettings.lang==='en'?17:19);},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,toggle,btn,complete,render,root}){
      s.hands=true;let frame=0,prev;
      const dc=toggle('改成直流電','Switch to DC',v=>{s.ac=!v;});
      const fq=range(T('交流頻率（示意 Hz）','AC frequency (illustrative Hz)'),2,30,10,v=>{s.freq=v/10;fq.val.textContent=s.freq.toFixed(1);});fq.val.textContent='1.0';
      btn(T('電量歸零','Empty the battery'),()=>{s.battery=0;s.dc=0;});
      function tick(now){
        const details=root.closest('details');if(!details||!details.open||document.hidden){prev=undefined;frame=requestAnimationFrame(tick);return;}
        const dt=prev===undefined?0:Math.min(.1,(now-prev)/1000);prev=now;s.time+=dt;
        if(s.ac){const {emf}=P.induction(s.time,{freq:s.freq});s.battery=Math.min(100,s.battery+Math.abs(emf)/(2*Math.PI)*dt*25);}else s.dc+=dt;
        if(s.battery>=100&&s.dc>=1.5)complete();
        render();frame=requestAnimationFrame(tick);
      }
      frame=requestAnimationFrame(tick);addEventListener('pagehide',()=>cancelAnimationFrame(frame));
      return {};
    },
    read(s,output){output.innerHTML=s.ac?T('交流：電流一直變 → 磁通量一直變 → 手機線圈有感應電流。','AC: the current keeps changing → flux changes → current is induced in the phone.'):T('直流：電流不變 → 磁通量不變 → ε = 0，電量不動。','DC: steady current → steady flux → ε = 0, the battery stays put.');output.innerHTML+=s.dc>=1.5&&s.battery>=100?'<br><b>'+T('交流充飽、直流充不了：都看到了。','Seen both: AC charges, DC does not.')+'</b>':'';}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q27=[
 {
  "id": "Q27_08",
  "row": "wrong",
  "duration": 4.26,
  "disp": "A 說電流經由導線，從充電器流到手機。",
  "en": "A says current flows through a wire from the charger to the phone."
 },
 {
  "id": "Q27_09",
  "row": "wrong",
  "duration": 3.17,
  "disp": "要是真的有電線，那就不叫無線充電了。",
  "en": "If there were a wire, it wouldn't be called wireless charging."
 },
 {
  "id": "Q27_17",
  "row": "solve",
  "duration": 2.3,
  "disp": "無線充電靠的是電磁感應。",
  "en": "Wireless charging works by electromagnetic induction."
 },
 {
  "id": "Q27_18",
  "row": "solve",
  "duration": 12.49,
  "disp": "充電器的電流一直在變，它產生的磁場就一直在變；這些磁力線穿過手機的線圈，手機線圈的磁通量跟著變，就感應出電流，幫電池充電。",
  "en": "The charger's current keeps changing, so its magnetic field keeps changing; those field lines pass through the phone's coil, its flux changes, and that induces a current to charge the battery."
 },
 {
  "id": "Q27_19",
  "row": "solve",
  "duration": 3.76,
  "disp": "所以兩個線圈之間，一定有磁力線通過，D 對。",
  "en": "So magnetic field lines must pass between the two coils. D is right."
 },
 {
  "id": "Q27_20",
  "row": "others",
  "duration": 5.09,
  "disp": "B，磁場如果始終不變，磁通量不變，就不會有感應電流，錯。",
  "en": "B: if the magnetic field never changed, the flux wouldn't change, and there'd be no induced current. Wrong."
 },
 {
  "id": "Q27_21",
  "row": "others",
  "duration": 6.91,
  "disp": "C，能量在傳的過程中，有一部分變成熱散掉了，手機拿到的一定比充電器輸出的少，錯。",
  "en": "C: some energy is lost as heat along the way, so the phone always gets less than the charger puts out. Wrong."
 },
 {
  "id": "Q27_22",
  "row": "others",
  "duration": 8.99,
  "disp": "E，兩邊的線圈都有電流流過，電流的熱效應讓兩邊都會發熱；你充電充一陣子，手機背面是不是也熱熱的？",
  "en": "E: current flows in both coils, and its heating effect warms both sides; after charging a while, isn't the back of your phone warm too?"
 },
 {
  "id": "Q27_23",
  "row": "others",
  "duration": 0.47,
  "disp": "錯。",
  "en": "Wrong."
 },
 {
  "id": "Q27_24",
  "row": "others",
  "duration": 1.05,
  "disp": "答案 D。",
  "en": "The answer is D."
 },
 {
  "id": "Q27_25",
  "row": "life",
  "duration": 2.16,
  "disp": "同樣的原理，你每天都在用。",
  "en": "You use the same principle every day."
 },
 {
  "id": "Q27_26",
  "row": "life",
  "duration": 13.15,
  "disp": "去火鍋店，桌上那台電磁爐，磁場一直在變，不鏽鋼鍋底就感應出電流，電流在金屬裡流動就會發熱，這叫電流的熱效應；所以電磁爐一定要用交流電。",
  "en": "At a hot pot place, the induction cooker's field keeps changing, inducing current in the steel pot's base; current in metal heats it up, the heating effect of current. That's why induction cookers need AC."
 },
 {
  "id": "Q27_27",
  "row": "life",
  "duration": 5.46,
  "disp": "悠遊卡嗶一下，卡片裡的線圈從讀卡機感應到電，才有辦法回傳資料。",
  "en": "Tap your EasyCard, and its coil picks up power by induction from the reader, so it can send data back."
 },
 {
  "id": "Q27_28",
  "row": "trick",
  "duration": 2.81,
  "disp": "秒殺口訣：有變化，才有感應。",
  "en": "The shortcut: no change, no induction."
 },
 {
  "id": "Q27_29",
  "row": "trick",
  "duration": 7.21,
  "disp": "我上課講過，動磁生電的「動」，是變動、變化的意思；磁通量不變，什麼都不會發生。",
  "en": "As I said in class, the \"moving\" in \"a moving magnet makes electricity\" means changing; if the flux doesn't change, nothing happens."
 }
];
/* tracks:end */
