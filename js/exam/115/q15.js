/* 115 學測第 15 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,dot}=K,C=K.colors,D=Exam113Draw,P=Exam115Core;
  const TAU=2*Math.PI;
  // 單位積木的顏色：力 N 金、電量 C 藍綠、電位 V 紫、長度 m 白、電流 A 紅、能量 J 綠（全頁同色）
  const COL={N:C.gold,C:C.teal,V:C.violet,m:C.white,A:C.red,J:C.green};
  const TILES=['N','C','V','m','A','J'];
  function tile(g,x,y,txt,o={}){const w=o.w||52,h=o.h||42,col=o.col||COL[txt]||C.white;box(g,x-w/2,y-h/2,w,h,8,col+'2a',col,2);sci(g,txt,x,y+(o.size||24)*.36,col,o.size||24,'center');}
  // 分數（積木版）
  function tfrac(g,x,y,num,den,o={}){if(num)tile(g,x,y-30,num,o);line(g,x-34,y,x+34,y,C.white,2.5);if(den)tile(g,x,y+30,den,o);}
  function chip(g,x,y,txt,col,on=true){g.font='600 18px system-ui,sans-serif';const w=g.measureText(txt).width+18;box(g,x,y-22,w,32,8,on?col+'2e':'#ffffff0d',on?col:'#ffffff30',1.6);label(g,txt,x+w/2,y,on?col:C.faint,18,'center');return w;}
  function resistor(g,x,y,w,col){g.beginPath();g.moveTo(x,y);for(let i=1;i<8;i++)g.lineTo(x+i*w/8,y+(i%2?-8:8));g.lineTo(x+w,y);g.strokeStyle=col;g.lineWidth=2.4;g.stroke();line(g,x-24,y,x,y,col,2.4);line(g,x+w,y,x+w+24,y,col,2.4);}
  // 點電荷與電力線，測試電荷 +1 C 受力 F
  function fieldScene(g,cx,cy,tx,ty,o={}){
    for(let i=0;i<12;i++){const a=i/12*TAU;arrow(g,cx+Math.cos(a)*18,cy+Math.sin(a)*18,cx+Math.cos(a)*62,cy+Math.sin(a)*62,'#8ae6d755',1.4,7);}
    D.ball(g,cx,cy,15,'#e8705f');label(g,'+',cx,cy+7,'#fff',20,'center');
    D.ball(g,tx,ty,10,'#f0c27a');label(g,'+',tx,ty+5,'#3a2a10',15,'center');
    const a=Math.atan2(ty-cy,tx-cx);arrow(g,tx+Math.cos(a)*12,ty+Math.sin(a)*12,tx+Math.cos(a)*60,ty+Math.sin(a)*60,C.gold,3.4,11);
    if(o.labels!==false){label(g,'F',tx+Math.cos(a)*62+8,ty+Math.sin(a)*62-6,C.gold,20);label(g,o.q||T('單位正電荷 +1 C','Unit charge +1 C'),tx,ty+32,C.teal,16,'center');}
  }
  function plates(g,x1,x2,y1,y2){
    box(g,x1-6,y1,8,y2-y1,2,'#e8705f',null);box(g,x2-2,y1,8,y2-y1,2,'#6f9fd6',null);
    for(let i=0;i<5;i++){label(g,'+',x1-16,y1+16+i*(y2-y1-20)/4,'#ffb0a6',16,'center');label(g,'−',x2+18,y1+16+i*(y2-y1-20)/4,'#a9cdf5',16,'center');
      arrow(g,x1+8,y1+12+i*(y2-y1-24)/4,x2-8,y1+12+i*(y2-y1-24)/4,'#8ae6d7aa',1.6,8);}
  }
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const id=s.id,k=s.part,t=s.t;
    switch(id){
      case 'Q15_07':{const a=ease(seg(k,0,.35)),b=ease(seg(k,.2,.55));if(a>0)tile(g,140,120-30-60*(1-a),'V');line(g,106,120,174,120,C.white,2.5);if(b>0)tile(g,140,150+60*(1-b),'A');
        label(g,T('伏特 ÷ 安培','Volt ÷ ampere'),140,214,C.white,17,'center');if(k>.55)label(g,T('很有「電」的感覺？','Sounds “electric” enough?'),330,124,C.gold,20,'center');return;}
      case 'Q15_08':{tfrac(g,100,120,'V','A');label(g,'=',172,132,C.white,30,'center');label(g,'Ω',222,136,C.red,40,'center');
        resistor(g,300,120,90,C.red);label(g,T('電阻的單位','Unit of resistance'),345,170,C.red,18,'center');
        if(k>.4){label(g,T('不是電場','Not electric field'),345,212,C.red,18,'center');mark(g,430,206,false,10);}return;}
      case 'Q15_09':{let x=20;x+=chip(g,x,44,T('電場','Field'),C.white)+6;label(g,'＝',x+10,44,C.white,18,'center');x+=26;x+=chip(g,x,44,T('單位正電荷','unit charge'),C.teal)+6;
        label(g,T('所受的','feels'),x+4,44,C.white,17);g.font='600 17px system-ui,sans-serif';x+=g.measureText(T('所受的','feels')).width+12;chip(g,x,44,T('靜電力','force'),C.gold);
        fieldScene(g,110,160,280,160);return;}
      case 'Q15_10':{chip(g,24,52,T('單位正電荷','unit positive charge'),C.teal);label(g,'→',236,52,C.white,20,'center');label(g,T('每 1 C → 除以 C','per 1 C → divide by C'),260,52,C.teal,18);
        chip(g,24,112,T('靜電力','electric force'),C.gold);label(g,'→',236,112,C.white,20,'center');label(g,T('單位 N','unit: N'),260,112,C.gold,18);
        fieldScene(g,80,188,200,188,{labels:false});tile(g,340,188,'N',{w:44,h:36,size:20});label(g,'÷',380,196,C.white,22,'center');tile(g,420,188,'C',{w:44,h:36,size:20});return;}
      case 'Q15_11':{sci(g,'E =',96,128,C.white,28,'right');sci(g,'F',140,104,C.gold,26,'center');line(g,118,116,162,116,C.white,2.5);sci(g,'q',140,148,C.teal,26,'center');
        if(k>.3){label(g,'→',200,128,C.white,26,'center');tfrac(g,262,118,'N','C');}
        label(g,T('力 ÷ 電量','force ÷ charge'),140,204,C.white,17,'center');if(k>.6){label(g,T('答案 B','Answer: B'),390,128,C.green,26,'center');mark(g,390,170,true,12);}return;}
      case 'Q15_12':{plates(g,80,250,50,190);dim(g,80,214,250,'d');label(g,'V',165,36,C.violet,22,'center');
        sci(g,'E = V / d',360,90,C.white,24,'center');if(k>.3){label(g,'→',306,150,C.white,22,'center');tfrac(g,360,150,'V','m',{w:44,h:34,size:20});}
        label(g,T('也是電場的單位','Also a unit of field'),360,232,C.green,17,'center');return;}
      case 'Q15_13':{tfrac(g,70,125,'V','m',{w:44,h:34,size:20});label(g,'=',122,135,C.white,26,'center');
        const a=k>.2;if(a){sci(g,'J / C',190,90,C.green,22,'center');line(g,150,125,230,125,C.white,2.5);sci(g,'m',190,165,C.white,22,'center');label(g,'=',258,135,C.white,26,'center');}
        if(k>.55){sci(g,'J',330,108,C.green,24,'center');line(g,290,125,370,125,C.white,2.5);sci(g,'C · m',330,160,C.teal,24,'center');}
        label(g,T('伏特＝焦耳 ÷ 庫侖','Volt = joule ÷ coulomb'),230,224,C.violet,18,'center');return;}
      case 'Q15_14':{sci(g,'J',70,108,C.green,24,'center');line(g,36,125,104,125,C.white,2.5);sci(g,'C · m',70,160,C.teal,24,'center');label(g,'=',128,135,C.white,26,'center');
        sci(g,'N · m',200,108,C.gold,24,'center');line(g,158,125,242,125,C.white,2.5);sci(g,'C · m',200,160,C.teal,24,'center');
        if(k>.35){line(g,214,98,240,110,C.red,3);line(g,214,150,240,162,C.red,3);}
        if(k>.6){label(g,'=',266,135,C.white,26,'center');tfrac(g,320,125,'N','C');}
        label(g,T('焦耳＝牛頓 × 公尺；公尺消掉','Joule = newton × metre; metres cancel'),230,226,C.white,17,'center');return;}
      case 'Q15_15':{box(g,40,60,380,110,14,'#ffd17e1f',C.gold,2);label(g,T('定義怎麼寫，','Write the unit the way'),230,104,C.gold,24,'center');label(g,T('單位就怎麼除','the definition reads'),230,144,C.gold,24,'center');return;}
      default:{ // Q15_16：「每」什麼，就除以什麼
        const rows=[[T('每秒走幾公尺','metres per second'),'m / s',C.white],[T('每庫侖受幾牛頓','newtons per coulomb'),'N / C',C.gold],[T('單位面積受的力','force per unit area'),'N / m^{2}',C.teal]];
        label(g,T('看到「每」、「單位」→ 放到分母','“Per” or “unit” → it goes below'),230,34,C.white,18,'center');
        rows.forEach(([a,b,col],i)=>{const y=86+i*56;if(k<i*.25)return;label(g,a,40,y,C.white,18);label(g,'→',282,y,C.white,20,'center');sci(g,b,320,y,col,22);});
      }
    }
  }
  function dim(g,x1,y,x2,txt){line(g,x1,y,x2,y,C.white,1.6);line(g,x1,y-6,x1,y+6,C.white,1.6);line(g,x2,y-6,x2,y+6,C.white,1.6);label(g,txt,(x1+x2)/2,y-8,C.white,18,'center');}
  // ── 動手：把單位積木拖（或點）進分子、分母
  const NUM={x:150,y:54},DEN={x:150,y:122},TX=i=>40+i*64,TY=212;
  const NOTE={'N/C':['電場：每庫侖受的力','Field: force per coulomb'],'V/m':['電場：每公尺的電位差','Field: volts per metre'],'C/N':['倒過來了','Upside down'],'V/A':['＝Ω，電阻的單位','= Ω, unit of resistance'],
    'A/V':['電阻的倒數','Reciprocal of resistance'],'J/C':['＝V，電位差的單位','= V, unit of potential difference'],'J/m':['＝N，力的單位','= N, unit of force'],'m/V':['倒過來了','Upside down'],'N/m':['不是電場（像彈力常數）','Not a field (like a spring constant)']};
  function hands(g,s){
    label(g,'E =',96,96,C.white,24,'right');
    for(const [slot,v] of [[NUM,s.num],[DEN,s.den]]){if(v)tile(g,slot.x,slot.y,v,{w:60,h:46,size:26});else box(g,slot.x-30,slot.y-23,60,46,8,'#ffffff08','#ffffff66',1.5);}
    line(g,112,88,188,88,C.white,2.5);
    TILES.forEach((u,i)=>{tile(g,TX(i),TY,u,{w:54,h:44});if(s.focus)label(g,u.toUpperCase(),TX(i)+20,TY-16,C.faint,11,'center');});
    if(s.drag)tile(g,s.drag.x,s.drag.y,s.drag.u,{w:60,h:46,size:26});
    const key=s.num&&s.den?s.num+'/'+s.den:null;
    if(key){const ok=P.FIELD_UNITS[key]===true,n=NOTE[key]||(s.num===s.den?['＝1，沒有單位','= 1, no unit']:['不是電場的單位','Not a field unit']);
      sci(g,'= '+s.num+' / '+s.den,236,80,ok?C.green:C.red,24);mark(g,400,72,ok,12);label(g,T(...n),236,116,ok?C.green:C.red,16);}
    else label(g,T('拖積木到分子、分母','Drag units up and down'),236,86,C.faint,16);
    label(g,T('找到：','Found:'),236,160,C.white,16);['N/C','V/m'].forEach((u,i)=>{const f=s.found.includes(u);sci(g,(f?'✓ ':'○ ')+u,300+i*76,160,f?C.green:C.faint,18);});
  }
  function pointer(canvas,h){
    const pt=e=>{const r=canvas.getBoundingClientRect(),k=Math.min(r.width/460,r.height/250);return [(e.clientX-r.left-(r.width-460*k)/2)/k,(e.clientY-r.top-(r.height-250*k)/2)/k];};
    let on=false;canvas.addEventListener('pointerdown',e=>{if(h.down(...pt(e))===false)return;on=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();});
    canvas.addEventListener('pointermove',e=>{if(on)h.move(...pt(e));});const end=e=>{if(!on)return;on=false;h.up?.(...pt(e));};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  }
  ExamScene.add(15,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,num:null,den:null,found:[],drag:null,focus:false}),
    paint,
    preview(g){fieldScene(g,130,128,300,128,{labels:false});K.boost(1.1,()=>{label(g,T('單位正電荷','Unit positive charge'),300,170,C.teal,17,'center');label(g,'+1 C',300,194,C.teal,17,'center');
      label(g,T('靜電力 F','Electric force F'),368,96,C.gold,17,'center');label(g,T('電場的單位＝？','Unit of field = ?'),230,30,C.white,18,'center');});},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,btn,complete,render}){
      s.hands=true;canvas.tabIndex=0;canvas.style.touchAction='none';let done=false;
      const snd=(f,d=.07,type='triangle')=>{if(LabSettings.get('sound'))LabSound.tone({freq:f,dur:d,type,gain:.1});};
      function evaluate(){if(!s.num||!s.den)return;const key=s.num+'/'+s.den,ok=P.FIELD_UNITS[key]===true;
        if(ok&&!s.found.includes(key)){s.found.push(key);if(LabSettings.get('sound'))LabSound.sweep({from:520,to:980,dur:.25,gain:.12});}else snd(ok?880:240,.14,ok?'sine':'square');
        if(!done&&s.found.length>=2){done=true;complete();}}
      function place(u,where){if(where==='num')s.num=u;else if(where==='den')s.den=u;else{if(!s.num)s.num=u;else if(!s.den)s.den=u;else{s.num=u;s.den=null;}}snd(560);evaluate();render();}
      const over=(x,y,c)=>Math.abs(x-c.x)<40&&Math.abs(y-c.y)<32;
      let start=null;
      pointer(canvas,{
        down(x,y){const i=TILES.findIndex((u,j)=>Math.abs(x-TX(j))<30&&Math.abs(y-TY)<26);
          if(i>=0){s.drag={u:TILES[i],x,y};start=[x,y];render();return;}
          if(over(x,y,NUM)&&s.num){s.drag={u:s.num,x,y};s.num=null;start=null;snd(330);render();return;}
          if(over(x,y,DEN)&&s.den){s.drag={u:s.den,x,y};s.den=null;start=null;snd(330);render();return;}
          return false;},
        move(x,y){if(s.drag){s.drag.x=x;s.drag.y=y;render();}},
        up(x,y){const d=s.drag;s.drag=null;if(!d){render();return;}
          if(over(x,y,NUM))place(d.u,'num');else if(over(x,y,DEN))place(d.u,'den');else if(start&&Math.hypot(x-start[0],y-start[1])<8)place(d.u);else render();}});
      canvas.addEventListener('keydown',e=>{const u=TILES.find(t=>t.toLowerCase()===e.key.toLowerCase());
        if(u){e.preventDefault();place(u);return;}
        if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();if(s.den)s.den=null;else s.num=null;snd(330);render();}});
      canvas.addEventListener('focus',()=>{s.focus=true;render();});canvas.addEventListener('blur',()=>{s.focus=false;render();});
      btn(T('清除','Clear'),()=>{s.num=s.den=null;snd(330);});
      btn(T('上下對調','Flip'),()=>{[s.num,s.den]=[s.den,s.num];snd(480);evaluate();});
      return {};
    },
    read(s,output){const key=s.num&&s.den?s.num+'/'+s.den:null;
      output.innerHTML=(key?'E = '+s.num+'/'+s.den+'：'+(P.FIELD_UNITS[key]===true?T('是電場的單位','a unit of electric field'):T('不是電場的單位','not a unit of electric field')):T('點積木或拖進分子、分母（鍵盤：按 N、C、V、M、A、J，Backspace 刪除）','Tap or drag units into the fraction (keys N, C, V, M, A, J; Backspace deletes)'))+
        '<br>'+T('找到 ','Found ')+s.found.length+' / 2：'+(s.found.join('、')||'—');}
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(15,{groups:{wrong:["V/A 是電阻", "V/A is resistance"],solve:["電場的定義", "Definition of electric field"],also:["V/m 也可以", "V/m works too"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\mathrm{V/A}=\Omega`,solve:String.raw`E=\dfrac{F}{q}\ \Rightarrow\ \mathrm{N/C}`,also:String.raw`\dfrac{\mathrm{V}}{\mathrm{m}}=\dfrac{\mathrm{J}}{\mathrm{C\cdot m}}=\dfrac{\mathrm{N\cdot m}}{\mathrm{C\cdot m}}=\dfrac{\mathrm{N}}{\mathrm{C}}`,trick:[String.raw`\text{「每」什麼}\ \Rightarrow\ \text{除以什麼}`,String.raw`\text{“per” something}\ \Rightarrow\ \text{divide by it}`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q15=[
 {
  "id": "Q15_07",
  "row": "wrong",
  "duration": 7.84,
  "disp": "看到電場，腦袋就浮出伏特，跟電有關的單位，湊一湊，伏特除以安培，看起來很有電的感覺，對不對？",
  "en": "You see \"electric field,\" volts pop into your head, you mix up a few electrical units, and volts per ampere sounds very electric, right?"
 },
 {
  "id": "Q15_08",
  "row": "wrong",
  "duration": 5.49,
  "disp": "你相信了就太傻了，伏特除以安培，是電阻的單位：歐姆。",
  "en": "Fall for that and you've been fooled: volts per ampere is the unit of resistance: the ohm."
 },
 {
  "id": "Q15_09",
  "row": "solve",
  "duration": 5.28,
  "disp": "題目第一句話就是答案：電場，是單位正電荷所受的靜電力。",
  "en": "The first sentence of the question is the answer: the electric field is the electrostatic force per unit positive charge."
 },
 {
  "id": "Q15_10",
  "row": "solve",
  "duration": 4.5,
  "disp": "單位正電荷，就是每 1 庫侖；靜電力，單位是牛頓。",
  "en": "Per unit positive charge means per 1 coulomb; electrostatic force is measured in newtons."
 },
 {
  "id": "Q15_11",
  "row": "solve",
  "duration": 6.43,
  "disp": "所以電場 E，等於靜電力 F 除以電量 q，力除以電量，單位就是牛頓除以庫侖，答案 B。",
  "en": "So electric field E equals electrostatic force F over charge q. Force over charge gives newtons per coulomb. Answer B."
 },
 {
  "id": "Q15_12",
  "row": "also",
  "duration": 4.78,
  "disp": "另一個常見的寫法是伏特除以公尺，這兩個其實一樣。",
  "en": "Another common form is volts per meter; the two are actually the same."
 },
 {
  "id": "Q15_13",
  "row": "also",
  "duration": 6.12,
  "disp": "因為伏特是焦耳除以庫侖，所以伏特除以公尺，就是焦耳除以庫侖、再除以公尺。",
  "en": "A volt is a joule per coulomb, so volts per meter is joules per coulomb, divided again by meters."
 },
 {
  "id": "Q15_14",
  "row": "also",
  "duration": 5.78,
  "disp": "焦耳是牛頓乘以公尺，公尺上下消掉，剩下牛頓除以庫侖。",
  "en": "A joule is a newton times a meter; the meters cancel, leaving newtons per coulomb."
 },
 {
  "id": "Q15_15",
  "row": "trick",
  "duration": 3.09,
  "disp": "秒殺：定義怎麼寫，單位就怎麼除。",
  "en": "The shortcut: however the definition is written, that's how you divide the units."
 },
 {
  "id": "Q15_16",
  "row": "trick",
  "duration": 3.18,
  "disp": "看到「每」什麼、「單位」什麼，就除以什麼。",
  "en": "When you see \"per\" something or \"unit\" something, divide by it."
 }
];
/* tracks:end */
