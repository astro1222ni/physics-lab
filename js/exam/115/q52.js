/* 115 學測第 52 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,sciText,sciHTML}=K,C=K.colors,P=Exam115Core;
  // 顏色：海水藍、位能 ΔU 青、電能綠、潮差 h 金、次數紫
  const SEA='#2f7fa8',SEA2='#4aa3c9',DAM='#5d6a73',FLOOR='#3e4a52',UC=C.teal,EC=C.green,HC=C.gold,NC=C.violet;
  const TD=P.tide(),E1=TD.U*.25,YEAR=E1*TD.perYear; // 每次 10^11 J、每次電能 2.5×10^10 J、一年 3.65×10^13 J、約 10^7 度
  const pow=x=>{const [m,e]=K.sciParts(x,1);return +m===1?'10^{'+e+'}':sciText(x,1);};
  function hollow(g,x,y,len,col='#ffffff'){ // 向左的空心箭頭（海水流入）
    g.beginPath();g.moveTo(x,y-4);g.lineTo(x-len+12,y-4);g.lineTo(x-len+12,y-9);g.lineTo(x-len,y);g.lineTo(x-len+12,y+9);g.lineTo(x-len+12,y+4);g.lineTo(x,y+4);g.closePath();
    g.fillStyle='#ffffff22';g.fill();g.strokeStyle=col;g.lineWidth=1.6;g.stroke();
  }
  function turbine(g,x,y,a=0,sc=1){
    line(g,x,y-28*sc,x,y-10*sc,'#9aa8b0',3);g.beginPath();g.ellipse(x,y,26*sc,10*sc,0,0,2*Math.PI);g.fillStyle='#1d2a32';g.fill();g.strokeStyle='#9aa8b0';g.lineWidth=1.5;g.stroke();
    for(const k of [0,1]){const c=Math.cos(a+k*Math.PI);g.beginPath();g.ellipse(x+30*sc,y+c*7*sc,3*sc,8*sc*Math.abs(c)+1,0,0,2*Math.PI);g.fillStyle='#9aa8b0';g.fill();}
  }
  // 圖 20：海灣口堤壩剖面（漲潮：外海高、海水經壩底通道流入海灣）
  function fig20(g,o={}){
    const bay=o.bay??118,sea=o.sea??70,xL=o.xL??0,dx=o.dx??0;
    g.fillStyle=SEA;g.fillRect(xL,bay,192-xL,100);g.fillRect(268,sea,460-268+460,148);g.fillRect(186,158,90,60);
    g.fillStyle=FLOOR;g.fillRect(-460,218,1380,40);
    g.beginPath();g.moveTo(186,14);g.lineTo(270,14);g.lineTo(270,158);g.lineTo(186,158);g.closePath();g.fillStyle=DAM;g.fill();
    label(g,T('海灣口','Bay-mouth'),228,58,C.white,16,'center');label(g,T('堤壩','dam'),228,80,C.white,16,'center');
    turbine(g,224,188,o.spin||0);
    for(const yy of [172,188,204]){hollow(g,356-dx,yy,58);hollow(g,180-dx,yy,58);}
    label(g,T('↑ 水車發電機','↑ Turbine generator'),228,241,C.white,15,'center');
    label(g,T('海灣內蓄水','Water inside the bay'),94,24,C.white,16,'center');label(g,T('海灣外海洋','Open sea'),366,24,C.white,16,'center');
    line(g,0,46,184,46,'#ffffff77',1.5,[5,4]);line(g,0,bay,184,bay,C.white,2,[6,4]);line(g,272,sea,460,sea,C.white,2,[6,4]);
    arrow(g,150,bay-4,150,52,C.white,4,12);label(g,T('海面','Rising'),140,84,C.white,15,'right');label(g,T('漸升','surface'),140,102,C.white,15,'right');
    arrow(g,312,sea+6,312,sea+56,C.white,4,12);label(g,T('海面','Falling'),324,96,C.white,15);label(g,T('漸低','surface'),324,114,C.white,15);
    label(g,T('海水流入','Sea flows in'),60,196,C.white,15,'center');
  }
  const lines=(g,rows,x=30)=>rows.forEach(([txt,col,size,y,al])=>sci(g,txt,x,y,col,size||17,al||'left'));
  function cubeScene(g,k,lift){
    const h=lift?40*ease(seg(k,.1,.6)):0;
    if(lift){g.strokeStyle='#ffffff55';g.setLineDash([4,3]);g.strokeRect(52,158,44,44);g.setLineDash([]);
      arrow(g,36,202,36,202-h,HC,2.5,9);if(h>10)sci(g,'h',30,202-h/2+5,HC,17,'right');}
    K.cube(g,52,202-h,44,SEA2,'#7cc6e4','#2f7fa8');sci(g,'1 m^3',74,226,C.white,16,'center');sci(g,'ρgh',86,140-h,HC,18,'center');
    g.fillStyle=SEA+'cc';g.fillRect(190,108,250,94);g.strokeStyle='#ffffff20';g.lineWidth=1;for(let x=190;x<=440;x+=22){g.beginPath();g.moveTo(x,108);g.lineTo(x,202);g.stroke();}
    for(let y=108;y<=202;y+=22){g.beginPath();g.moveTo(190,y);g.lineTo(440,y);g.stroke();}
    sci(g,'V = 2.5×10^6 m^3',315,146,C.white,18,'center');label(g,T('一整座海灣的水','The whole bay of water'),315,174,C.white,15,'center');
  }
  function tideCurve(g,k){
    const X=h=>40+h*11,Y=v=>104-v*46;arrow(g,40,150,320,150,C.faint,1.5,7);
    for(const h of [0,6,12,18,24]){line(g,X(h),150,X(h),155,C.faint,1);label(g,h+' h',X(h),172,C.faint,15,'center');}
    const f=h=>-Math.cos(2*Math.PI*h/12),up=24*seg(k,0,.6);
    for(let i=0;i<240;i++){const a=i/10,b=(i+1)/10;if(b>up)break;const rising=Math.sin(2*Math.PI*a/12)>0;line(g,X(a),Y(f(a)),X(b),Y(f(b)),rising?UC:'#6f8a99',rising?3:2);}
    for(const [h,n] of [[3,1],[15,2]])if(up>h+3)label(g,T('漲潮 ','Flood ')+n,X(h),Y(f(h))-14,UC,15,'center');
    label(g,T('一天','One day'),X(12),196,C.white,15,'center');
  }
  function chip(g,x,y,w,txt,col,on=true,size=16){box(g,x,y,w,34,8,on?col+'2e':'#ffffff0d',on?col:'#ffffff30',1.6);sci(g,txt,x+w/2,y+23,on?col:C.faint,size,'center');}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const k=s.part,t=s.t;
    switch(s.id){
      case 'Q52_09':cubeScene(g,k,false);sci(g,T('A：位能增加 ρgh？','A: energy gain ρgh?'),230,40,C.red,20,'center');return;
      case 'Q52_10':cubeScene(g,k,true);sci(g,T('ρgh ＝ 每 1 m^3 海水的位能','ρgh = energy per 1 m^3 of seawater'),230,40,HC,18,'center');
        if(k>.55)sci(g,T('還沒乘體積 V','Not yet multiplied by V'),315,236,C.red,17,'center');return;
      case 'Q52_11':case 'Q52_12':case 'Q52_13':{
        const lift=s.id==='Q52_11'?ease(seg(k,.1,.6)):1;g.fillStyle=FLOOR;g.fillRect(14,206,160,8);
        g.strokeStyle='#ffffff55';g.setLineDash([4,3]);g.strokeRect(30,152,120,54);g.setLineDash([]);g.fillStyle=SEA+'dd';g.fillRect(30,152-48*lift,120,54);
        sci(g,'V',90,186-48*lift,C.white,20,'center');if(lift>.3){arrow(g,162,206,162,206-48*lift,HC,2.5,9);sci(g,'h = 4 m',90,236,HC,17,'center');}
        const rows=[['m = ρV',C.white,18,50],['ΔU = mgh = ρVgh',UC,18,86]];
        if(s.id!=='Q52_11')rows.push(['= 10^3 × 2.5×10^6 × 10 × 4',C.white,17,124],['= '+pow(TD.U)+' J',UC,22,166]);
        lines(g,rows,200);
        if(s.id==='Q52_13'){lines(g,[[T('百萬 ＝ 10^6 J','A million = 10^6 J'),C.red,16,206],[T('A：沒乘 V　B：不是百萬','A: no V · B: not a million'),C.red,16,236]],200);mark(g,430,200,false,10);}
        return;}
      case 'Q52_14':case 'Q52_15':tideCurve(g,s.id==='Q52_14'?k:1);
        lines(g,[[T('每天 2 次漲潮','2 flood tides a day'),UC,17,56],[T('一年：','A year:'),C.white,16,104],['2 × 365',NC,19,134],['= '+TD.floods+T(' 次',' tides'),NC,22,172]],330);
        if(s.id==='Q52_15'){label(g,T('海水一天上兩次班','The sea clocks in twice a day'),180,232,C.gold,17,'center');sci(g,T('C：365 次 ✗','C: 365 ✗'),330,232,C.red,17);}
        return;
      case 'Q52_16':case 'Q52_17':case 'Q52_18':case 'Q52_19':{
        const n=['Q52_16','Q52_17','Q52_18','Q52_19'].indexOf(s.id),dim=i=>i<n?'#ffffff99':null;
        const rows=[[T('每次：','Each: ')+pow(TD.U)+' J × 25% = '+sciText(E1,1)+' J',dim(0)||EC,17,44],
          [T('一天：漲 2 次 ＋ 退 2 次 ＝ 4 次','A day: 2 floods + 2 ebbs = 4'),dim(1)||NC,17,92],
          [T('一年：','A year: ')+sciText(E1,1)+' × 4 × 365 ≈ '+sciText(YEAR,2)+' J',dim(2)||EC,17,140],
          [T('÷ 3.6×10^6 J／度 ≈ ','÷ 3.6×10^6 J/kWh ≈ ')+sciText(TD.kWh,1)+T(' 度',' kWh'),EC,19,188]];
        lines(g,rows.slice(0,n+1));
        if(n===1){const u=seg(k,.1,.8);['↑','↑','↓','↓'].forEach((a,i)=>{if(u>i/4)label(g,a,300+i*30,128,i<2?UC:'#6f8a99',24,'center');});
          label(g,T('漲','in'),315,154,UC,15,'center');label(g,T('退','out'),375,154,'#6f8a99',15,'center');}
        if(n===3&&k>.6){sci(g,T('≈ 10^7 度 → D 對','≈ 10^7 kWh → D is right'),30,232,EC,19);mark(g,300,226,true,10);}
        return;}
      case 'Q52_20':case 'Q52_21':{
        K.earth(g,96,118,40);g.beginPath();g.ellipse(96,118,56,44,0,0,2*Math.PI);g.fillStyle='#8ae6d722';g.fill();g.strokeStyle=UC;g.lineWidth=1.5;g.stroke();
        K.dot(g,14,118,14,'#ffd17e');label(g,T('太陽','Sun'),16,152,C.faint,15,'center');arrow(g,30,118,36,118,C.gold,2.5,8);K.dot(g,214,118,13,'#c9ced2');arrow(g,198,118,160,118,C.gold,2.5,9);label(g,T('月球','Moon'),214,152,C.faint,15,'center');
        label(g,T('萬有引力 → 潮汐','Gravitation → tides'),120,40,C.gold,17,'center');
        turbine(g,300,118,t*4,.9);g.strokeStyle=C.gold;g.lineWidth=2;for(let i=0;i<5;i++){g.beginPath();g.ellipse(390,96+i*10,22,6,0,0,Math.PI);g.stroke();}
        box(g,382,86,16,52,3,'#c4cdd2','#ffffff66',1);label(g,'N',390,104,'#0c2535',13,'center');label(g,'S',390,132,'#0c2535',13,'center');
        arrow(g,330,118,362,118,C.white,2,8);label(g,T('電磁感應 → 發電','Induction → electricity'),352,40,EC,17,'center');
        if(s.id==='Q52_21'){box(g,140,180,180,48,10,EC+'2e',EC,2.5);label(g,T('答案 D、E','Answer: D, E'),230,212,EC,24,'center');}
        else if(k>.5){mark(g,230,214,true,12);label(g,T('E 對','E is right'),254,220,EC,18);}
        return;}
      case 'Q52_22':label(g,T('先抓數量級','Order of magnitude first'),230,74,C.gold,24,'center');sci(g,'10^3 × 2.5×10^6 × 10 × 4',230,140,C.white,21,'center');return;
      case 'Q52_23':{const xs=[62,104,140,176,218,260,292,324,352],ch=['10^3','×','2.5','×','10^6','×','10','×','4'];
        ch.forEach((c,i)=>{const hot=(i===2||i===8)&&k>.15;if(hot)box(g,xs[i]-18,58,36,34,8,HC+'2e',HC,1.6);sci(g,c,xs[i],82,hot?HC:C.white,20,'center');});
        if(k>.3)sci(g,'2.5 × 4 = 10',230,140,HC,20,'center');
        if(k>.6)sci(g,'10^3 × 10^6 × 10 × 10 = '+pow(TD.U),230,200,UC,21,'center');return;}
      default:{const X=e=>40+e*34;arrow(g,40,150,X(11)+16,150,C.faint,1.5,7);
        for(let e=0;e<=11;e++){line(g,X(e),146,X(e),154,C.faint,1);if(e%2===1||e===0)sci(g,'10^{'+e+'}',X(e),176,C.faint,15,'center');}
        K.dot(g,X(6),150,8,C.red);sci(g,T('B：百萬 ＝ 10^6','B: a million = 10^6'),X(6),126,C.red,17,'center');
        K.dot(g,X(11),150,8,UC);sci(g,pow(TD.U)+' J',X(11),126,UC,17,'center');
        const u=seg(k,.2,.7);if(u>0){arrow(g,X(6)+10,100-0,X(6)+10+(X(11)-X(6)-20)*u,100,HC,3,10);}
        if(k>.6)sci(g,T('差 10^5 倍','Off by 10^5'),(X(6)+X(11))/2,84,HC,20,'center');
        label(g,T('數量級（對數尺）','Orders of magnitude (log scale)'),230,214,C.faint,15,'center');}
    }
  }
  // 能動手：拖海灣水面（h）、拖海灣左岸（V），或拉桿；右邊一路算到一年幾度
  const H0=70,PXM=12,xLeft=V=>144-V*26;
  function hands(g,s){
    const bay=H0+s.h*PXM,sea=H0,xL=xLeft(s.V);
    g.fillStyle='#6b5a44';g.fillRect(-460,40,460+xL,178);
    g.fillStyle=SEA;g.fillRect(xL,bay,152-xL,100);g.fillRect(194,sea,54,148);g.fillRect(140,158,66,60);
    g.fillStyle=FLOOR;g.fillRect(-460,218,708,40);g.fillStyle=DAM;g.fillRect(150,18,46,140);
    turbine(g,170,190,s.spin,.75);{const len=Math.min(34,136-xL);if(len>18)for(const yy of [178,202])hollow(g,138-(s.spin*6)%4,yy,len);}
    line(g,xL,bay,150,bay,C.white,2.5);line(g,194,sea,248,sea,C.white,2.5);line(g,132,sea,196,sea,HC+'aa',1,[3,3]);
    box(g,xL-6,bay+6,12,70,4,HC+'55',HC,1.5);label(g,'⟷',xL,bay+98,HC,16,'center');
    arrow(g,140,bay,140,sea+2,HC,2.5,9);arrow(g,140,sea,140,bay-2,HC,2.5,9);
    sci(g,'h = '+s.h.toFixed(1)+' m',134,(sea+bay)/2+5,HC,16,'right');
    sci(g,'V = '+sciText(s.V*1e6,1)+' m^3',8,242,C.white,15);
    label(g,T('海灣','Bay'),8,30,C.faint,15);label(g,T('外海','Sea'),221,30,C.faint,15,'center');
    const td=P.tide(s.V*1e6,s.h,s.eff/100),per=s.ebb?td.perYear:td.floods,J=td.U*s.eff/100*per,kwh=J/3.6e6,hit=Math.abs(Math.log10(kwh)-7)<.15;
    lines(g,[[T('每次漲潮','Each tide'),C.faint,15,26],['ΔU = ρVgh',UC,16,50],['= '+sciText(td.U,1)+' J',UC,16,72],
      ['× '+s.eff+'% = '+sciText(td.U*s.eff/100,1)+' J',EC,16,102],['× '+per+T(' 次／年',' / year'),NC,16,132],[s.ebb?T('（每天 2 漲 ＋ 2 退）','(2 floods + 2 ebbs a day)'):T('（只算漲潮）','(floods only)'),C.faint,15,154],
      ['≈ '+sciText(kwh,1)+T(' 度',' kWh'),hit?EC:C.white,20,192],[T('目標：約 10^7 度','Target: about 10^7 kWh'),C.faint,15,224]],262);
    if(s.done)mark(g,440,186,true,9);
  }
  const target=s=>s.V===2.5&&s.h===4&&s.eff===25&&s.ebb;
  ExamScene.add(52,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,V:1,h:2,eff:40,ebb:true,spin:0,done:false}),
    paint,
    preview(g){fig20(g);},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,toggle,complete,render}){
      s.hands=true;canvas.style.touchAction='none'; /* 上下拖水面時不讓頁面捲走 */ let raf=0,last=0;const tick=now=>{s.spin=now/1000*(1+s.h*.6);render();raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);addEventListener('pagehide',()=>cancelAnimationFrame(raf));
      const beep=()=>{if(!LabSettings.get('sound'))return;const n=performance.now();if(n-last<70)return;last=n;const td=P.tide(s.V*1e6,s.h,s.eff/100);LabSound.tone({freq:160+40*Math.log10(td.kWh*(s.ebb?1:.5)),dur:.06,type:'sine',gain:.05});};
      const check=()=>{beep();if(target(s)&&!s.done){s.done=true;if(LabSettings.get('sound'))LabSound.tone({freq:880,dur:.2,type:'triangle',gain:.12,delay:.08});complete();}};
      const rv=range(T('每次漲潮水量 V','Volume per tide V'),5,50,10,v=>{s.V=v/10;sync();check();});rv.input.previousElementSibling.innerHTML=T('每次漲潮水量 V（m<sup>3</sup>）','Volume per tide V (m<sup>3</sup>)');
      const rh=range(T('潮差 h（公尺）','Tide height h (m)'),10,80,20,v=>{s.h=v/10;sync();check();});
      const re=range(T('效率（%）','Efficiency (%)'),5,60,40,v=>{s.eff=v;sync();check();});
      function sync(){rv.input.value=Math.round(s.V*10);rv.val.innerHTML=s.V.toFixed(1)+'×10<sup>6</sup>';rh.input.value=Math.round(s.h*10);rh.val.textContent=s.h.toFixed(1)+' m';re.input.value=s.eff;re.val.textContent=s.eff+'%';}
      sync();
      const eb=toggle('退潮也發電','Ebb tides generate too',v=>{s.ebb=v;check();});eb.setAttribute('aria-pressed','true');
      let mode=0;
      return {hit:(x,y)=>{if(x>250)return null;const bay=H0+s.h*PXM,xL=xLeft(s.V);if(Math.abs(x-xL)<16&&y>bay-20&&y<bay+90)return 1;if(x<152&&Math.abs(y-bay)<22)return 0;return null;},
        move:(i,x,y)=>{if(i===0)s.h=clamp(Math.round((y-H0)/PXM*2)/2,1,8);else s.V=clamp(Math.round((144-x)/26*10)/10,.5,5);sync();check();render();}};
    },
    read(s,output){
      const td=P.tide(s.V*1e6,s.h,s.eff/100),per=s.ebb?td.perYear:td.floods,J=td.U*s.eff/100*per,kwh=J/3.6e6;
      output.innerHTML=T('每次 ΔU = ρVgh = ','Each tide ΔU = ρVgh = ')+sciHTML(td.U,1)+' J　'+T('一年 ','A year: ')+per+T(' 次','')+(s.ebb?T('（每天 2 漲＋2 退）',' tides (2 floods + 2 ebbs a day)'):T('（只算漲潮，少了退潮那一半）',' tides (floods only: the ebb half is missing)'))+
        '<br>'+T('一年電能 ','Electricity per year ')+sciHTML(J,2)+' J ≈ <b>'+sciHTML(kwh,1)+T(' 度</b>',' kWh</b>')+(target(s)?T('　題目的數值 ✓ 約 10<sup>7</sup> 度，D 對','　The exam’s numbers ✓ about 10<sup>7</sup> kWh: D is right'):T('　把 V、h、效率調成題目的 2.5×10<sup>6</sup> m<sup>3</sup>、4 m、25%','　Set V, h and efficiency to 2.5×10<sup>6</sup> m<sup>3</sup>, 4 m, 25%'));
    }
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(52,{groups:{wrong:["ρgh 是什麼", "What ρgh means"],solveB:["一次抬升的位能", "Energy of one lift"],solveC:["一年幾次", "How many tides a year"],solveD:["一年發幾度電", "Kilowatt-hours per year"],solveE:["能量從哪裡來", "Where the energy comes from"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\rho g h=\dfrac{mgh}{V}`,solveB:String.raw`\Delta U=\rho Vgh=10^{3}\times2.5\times10^{6}\times10\times4=10^{11}\ \mathrm{J}`,solveC:String.raw`2\times365=730`,solveD:String.raw`\dfrac{2.5\times10^{10}\times4\times365}{3.6\times10^{6}}\approx10^{7}\ \mathrm{kWh}`,solveE:[String.raw`\text{潮汐：萬有引力，發電：電磁感應}`,String.raw`\text{tides: gravitation; generator: induction}`],trick:String.raw`10^{3}\times10^{6}\times10\times10=10^{11}`}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q52=[
 {
  "id": "Q52_09",
  "row": "wrong",
  "duration": 8.34,
  "disp": "選項 A 說，位能增加 ρ g h，ρ 是海水的密度，看起來很像公式，很多人就選了。",
  "en": "Option A says the potential energy gained is rho g h, rho being seawater's density. It looks like a formula, so many people picked it."
 },
 {
  "id": "Q52_10",
  "row": "wrong",
  "duration": 5.16,
  "disp": "可是 ρ g h，是每 1 立方公尺的海水增加的位能，你還沒乘上體積。",
  "en": "But rho g h is the energy gained per 1 cubic meter of seawater. You haven't multiplied by volume yet."
 },
 {
  "id": "Q52_11",
  "row": "solveB",
  "duration": 7.59,
  "disp": "因為質量等於密度乘以體積，所以位能增加 m g h，就等於 ρ 乘以 V 乘以 g 乘以 h。",
  "en": "Mass equals density times volume, so the gain, m g h, equals rho times V times g times h."
 },
 {
  "id": "Q52_12",
  "row": "solveB",
  "duration": 6.74,
  "disp": "1000×\\(2.5\\times10^{6}\\)，乘以 10，再乘以 4，等於 \\(10^{11}\\) 焦耳。",
  "en": "1000×\\(2.5\\times10^{6}\\), times 10, times 4, equals \\(10^{11}\\) joules."
 },
 {
  "id": "Q52_13",
  "row": "solveB",
  "duration": 2.58,
  "disp": "這是千億焦耳，不是百萬，B 錯。",
  "en": "That's 100 billion joules, not a million. B is wrong."
 },
 {
  "id": "Q52_14",
  "row": "solveC",
  "duration": 7.5,
  "disp": "C，每天漲潮 2 次，一年是 365×2，730 次，不是 365 次，錯。",
  "en": "C: 2 rising tides a day means 365×2, or 730 a year, not 365. Wrong."
 },
 {
  "id": "Q52_15",
  "row": "solveC",
  "duration": 5.11,
  "disp": "選 C 的同學，大概以為海水跟人一樣，一天只上一次班。",
  "en": "People who chose C must think the sea, like us, only clocks in once a day."
 },
 {
  "id": "Q52_16",
  "row": "solveD",
  "duration": 10.09,
  "disp": "D，每次漲潮的位能 \\(10^{11}\\) 焦耳，效率 25%，乘以 0.25，變成 \\(2.5\\times10^{10}\\) 焦耳的電。",
  "en": "D: each rising tide holds \\(10^{11}\\) joules; at 25% efficiency, multiply by 0.25 to get \\(2.5\\times10^{10}\\) joules of electricity."
 },
 {
  "id": "Q52_17",
  "row": "solveD",
  "duration": 7.19,
  "disp": "因為題目說漲潮、退潮發電量相同，所以一天是 2 次漲加 2 次退，4 次。",
  "en": "The question says rising and falling tides generate the same, so each day is 2 rises plus 2 falls, 4 times."
 },
 {
  "id": "Q52_18",
  "row": "solveD",
  "duration": 7.62,
  "disp": "一年：\\(2.5\\times10^{10}\\)，乘以 4，乘以 365，大約 \\(3.65\\times10^{13}\\) 焦耳。",
  "en": "A year: \\(2.5\\times10^{10}\\), times 4, times 365, about \\(3.65\\times10^{13}\\) joules."
 },
 {
  "id": "Q52_19",
  "row": "solveD",
  "duration": 11.05,
  "disp": "1 度電是 \\(3.6\\times10^{6}\\) 焦耳，所以焦耳換成度，要除以 \\(3.6\\times10^{6}\\)，大約 \\(10^{7}\\) 度，D 對。",
  "en": "1 kWh is \\(3.6\\times10^{6}\\) joules, so divide by \\(3.6\\times10^{6}\\) to convert, about \\(10^{7}\\) kWh. D is correct."
 },
 {
  "id": "Q52_20",
  "row": "solveE",
  "duration": 8.15,
  "disp": "E，潮汐是月球和太陽的萬有引力造成的；水車帶動發電機，靠電磁感應發電，E 對。",
  "en": "E: tides come from the gravity of the Moon and Sun; the turbine drives a generator through electromagnetic induction. E is correct."
 },
 {
  "id": "Q52_21",
  "row": "solveE",
  "duration": 1.59,
  "disp": "答案 D、E。",
  "en": "Answer D and E."
 },
 {
  "id": "Q52_22",
  "row": "trick",
  "duration": 2.28,
  "disp": "秒殺：先抓數量級。",
  "en": "The shortcut: get the order of magnitude first."
 },
 {
  "id": "Q52_23",
  "row": "trick",
  "duration": 7.98,
  "disp": "2.5×4 剛好是 10，所以 \\(10^{3}\\)，乘以 \\(10^{6}\\)，乘以 10，再乘以 10，等於 \\(10^{11}\\)。",
  "en": "2.5×4 is exactly 10, so \\(10^{3}\\), times \\(10^{6}\\), times 10, times 10, equals \\(10^{11}\\)."
 },
 {
  "id": "Q52_24",
  "row": "trick",
  "duration": 4.19,
  "disp": "B 說百萬，是 \\(10^{6}\\)，一眼就差了 10 萬倍。",
  "en": "B says a million, \\(10^{6}\\), off by 100,000 times at a glance."
 }
];
/* tracks:end */
