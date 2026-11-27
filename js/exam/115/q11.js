/* 115 學測第 11 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,dot}=K,C=K.colors,P=Exam115Core;
  // 顏色：位移 D 青、速度 v 藍、加速度 a 紫、合力 F 紅、張力 T 金、重力 mg 白
  const CD=C.teal,CV=C.blue,CA=C.violet,CF=C.red,CT=C.gold,CG=C.white;
  const GY=228,HP=168,PX=95,hy=h=>GY-h*HP,NAMES=[['甲','P1'],['乙','P2'],['丙','P3'],['丁','P4']],STAGE=[['甲→乙','P1→P2'],['乙→丙','P2→P3'],['丙→丁','P3→P4']];
  const nm=i=>T(...NAMES[i]),st=i=>T(...STAGE[i]);
  // 三段的時間比例（照 Exam115Core.crane：先加速、等速、再減速）
  const S1=2*P.CRANE.b/(2*P.CRANE.b+(P.CRANE.c-P.CRANE.b)+2*(1-P.CRANE.c)),S2=(2*P.CRANE.b+P.CRANE.c-P.CRANE.b)/(2*P.CRANE.b+(P.CRANE.c-P.CRANE.b)+2*(1-P.CRANE.c));
  const MID=[S1/2,(S1+S2)/2,(S2+1)/2];
  // 箭頭長度 ∝ 力：mg 畫 54 px；加速度的比例取 g ≈ 6.6（模型單位），所以 |a| 約 0.4 g，T、F 都照 F = T − mg = m a 算
  const MG=54,GE=6.6,forcesOf=a=>({T:MG*(1+a/GE),F:MG*a/GE});
  const snd=o=>{if(LabSettings.get('sound'))LabSound.tone(o);};
  function load(g,x,y,k=1){g.beginPath();g.moveTo(x-5*k,y-8*k);g.lineTo(x+5*k,y-8*k);g.lineTo(x+11*k,y+8*k);g.lineTo(x-11*k,y+8*k);g.closePath();g.fillStyle='#1b2329';g.fill();g.strokeStyle='#9fb3bf';g.lineWidth=1.4;g.stroke();}
  // 圖 5：塔式起重機。h＝重物高度（甲 0 → 丁 1），fs＝甲乙丙丁的字級
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
  // 自由體圖：重物＋T、mg（長度 ∝ 力）＋合力 F（在右邊）
  function fbd(g,cx,cy,a,o={}){
    const {T:Tl,F}=forcesOf(a),fx=o.fx??26;
    load(g,cx,cy,1.7);
    arrow(g,cx,cy-14,cx,cy-14-Tl,CT,3,10);label(g,'T',cx-7,cy-14-Tl+16,CT,17,'right');
    arrow(g,cx,cy+14,cx,cy+14+MG,CG,3,10);label(g,'mg',cx-7,cy+14+MG-4,CG,16,'right');
    if(Math.abs(F)>1.5){arrow(g,cx+fx,cy,cx+fx,cy-F,CF,3.5,10);label(g,'F',cx+fx+6,cy-F*.55+6,CF,17);}
    else if(o.zero!==false)label(g,'F = 0',cx+fx-6,cy+5,CF,16);
    return {Tl,F};
  }
  function vecArrow(g,x,y,len,col,name,zero=true){if(Math.abs(len)<2){if(zero)label(g,name+' = 0',x-8,y+5,col,15);else dot(g,x,y,3.5,col);return;}arrow(g,x,y+len/2,x,y-len/2,col,3,10);label(g,name,x+7,y-len/2+(len>0?12:-2),col,16);}
  // 搭電梯往上、快到樓層（減速）
  function elevator(g,cy){
    line(g,60,14,60,236,'#5f7480',2);line(g,180,14,180,236,'#5f7480',2);
    box(g,70,cy-45,100,90,6,'#2c3d4a','#9fb3bf',2);line(g,120,14,120,cy-45,'#e2e8eb',1.4);
    dot(g,120,cy-20,8,'#f1c9a5');box(g,111,cy-11,18,28,5,'#d36b5c');line(g,114,cy+17,111,cy+44,'#3c4d63',4);line(g,126,cy+17,129,cy+44,'#3c4d63',4);
  }
  function chip(g,x,y,w,h,txt,col,size=17){box(g,x,y,w,h,10,col+'1f',col,2);label(g,txt,x+w/2,y+h/2+size*.36,col,size,'center');}
  function car(g,x,y,dir=1){g.save();g.translate(x,y);g.scale(dir,1);box(g,-22,-16,44,12,4,'#4f86b8');box(g,-12,-25,22,10,4,'#78acdc');for(const wx of [-12,12]){dot(g,wx,-3,5,'#1d2328');dot(g,wx,-3,2,'#a7b1b8');}g.restore();}
  const OPTS=[['甲乙、丙丁：F 都向上','P1–P2 & P3–P4: F up'],['甲乙、丙丁：F 都向下','P1–P2 & P3–P4: F down'],['丙丁：D 與 F 同向','P3–P4: D, F same'],['丙丁：v 與 F 相反','P3–P4: v, F opposite'],['丙丁：a 與 F 同向','P3–P4: a, F same']];
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const n=+s.id.slice(4),k=s.part;
    if(n<=11){const u=seg(k,0,.92),c=P.crane(u),ly=crane(g,{h:c.y});
      if(n<=10){arrow(g,128,ly+28,128,ly-18,CF,4,12);label(g,'F',136,ly-2,CF,18);
        label(g,T('F 一直向上？','F always up?'),336,104,CF,24,'center');if(n>=9)label(g,T('不然怎麼會往上？','How else would it rise?'),336,144,C.white,18,'center');}
      if(n>=10){chip(g,232,n===10?176:40,218,48,T('亞里斯多德：力 → 速度','Aristotle: force → velocity'),C.faint,16);}
      if(n===11){line(g,244,64,438,64,CF,2.5);chip(g,232,110,218,48,T('牛頓：合力 → 加速度','Newton: net force → a'),C.green,17);
        sci(g,'F = m a',341,196,C.green,22,'center');vecArrow(g,124,ly,40*c.v,CV,'v',false);vecArrow(g,150,ly,forcesOf(c.a).F,CA,'a',false);}
      return;}
    if(n<=13){const u=seg(k,0,.9),v=1-u*.6,cy=150-60*(1-(1-u)*(1-u));elevator(g,cy);
      vecArrow(g,206,cy,40*v,CV,'v');vecArrow(g,238,cy,-26,CA,'a');
      if(n===12)label(g,T('往上、快到樓層：減速','Going up, nearly there: slowing'),336,60,C.white,17,'center');
      if(n===13){vecArrow(g,270,cy,-26,CF,'F');label(g,T('不是練成輕功','Not a superpower'),360,52,C.faint,16,'center');
        label(g,T('電梯在減速','The lift is slowing'),360,96,C.white,18,'center');label(g,T('合力向下','Net force down'),360,128,CF,20,'center');label(g,T('→ 輕飄飄','→ you feel light'),360,160,CF,18,'center');}
      return;}
    if(n===14){const c=P.crane(.5);crane(g,{h:c.y});fbd(g,320,128,0,{zero:false});
      sci(g,'F = T − mg',320,236,CF,20,'center');label(g,T('受力圖','Free-body diagram'),320,24,C.faint,16,'center');return;}
    if(n<=17){const i=n-15,c=P.crane(i===0?seg(k,0,.9)*S1:i===1?S1+(S2-S1)*seg(k,0,.9):S2+(1-S2)*seg(k,0,.9));crane(g,{h:c.y,hot:null});
      const cols=[256,334,412];
      for(let j=0;j<=i;j++){const cx=cols[j],a=P.crane(MID[j]).a;label(g,st(j),cx,22,j===i?C.gold:C.faint,16,'center');fbd(g,cx-8,124,a,{fx:22});
        label(g,['T > mg','T = mg','T < mg'][j],cx,222,CT,17,'center');label(g,[T('a 向上','a up'),'a = 0',T('a 向下','a down')][j],cx,244,CA,15,'center');}
      vecArrow(g,124,hy(c.y),40*c.v,CV,'v',false);vecArrow(g,150,hy(c.y),forcesOf(c.a).F,CA,'a',false);
      return;}
    if(n<=23){const c=P.crane(S2+(1-S2)*.5),ly=crane(g,{h:c.y});label(g,st(2),114,ly+5,C.gold,15);
      const vs=[['D',CD,40],['v',CV,40],['F',CF,-34],['a',CA,-34]];vs.forEach(([nmv,col,len],j)=>vecArrow(g,248+j*52,56,len,col,nmv));
      const res=[n>=22?false:null,n>=22?false:null,n>=21?false:null,n>=20?true:null,n>=19?true:null];
      OPTS.forEach((o,j)=>{const y=108+j*25,on=res[j]!==null;label(g,'ABCDE'[j],236,y,on?(res[j]?C.green:CF):C.faint,16,'center');label(g,T(...o),252,y,on?C.white:C.faint,15);if(on)mark(g,440,y-5,res[j],8);});
      if(n===23)label(g,T('答案 D、E','Answer: D, E'),340,236,C.green,18,'center');
      return;}
    // 口訣
    chip(g,20,20,420,50,T('合力跟著加速度走，不跟著速度走','Net force follows a, not v'),CF,19);
    if(n===24)return;
    if(n===25){label(g,T('速率變大？還是變小？','Is the speed growing or shrinking?'),230,140,C.white,20,'center');return;}
    if(n===26){line(g,30,170,210,170,'#5f7480',2);car(g,110,170);arrow(g,140,130,190,130,CV,3,10);label(g,'v',196,135,CV,16);arrow(g,140,108,182,108,CA,3,10);label(g,'a',188,113,CA,16);
      label(g,T('變快：同向','Faster: same way'),120,204,C.green,17,'center');
      line(g,250,170,430,170,'#5f7480',2);car(g,330,170);arrow(g,360,130,410,130,CV,3,10);label(g,'v',416,135,CV,16);arrow(g,402,108,360,108,CA,3,10);label(g,'a',342,113,CA,16);
      label(g,T('變慢：反向','Slower: opposite'),340,204,CF,17,'center');return;}
    // 27：轉彎
    g.beginPath();g.arc(230,250,150,Math.PI*1.12,Math.PI*1.88);g.strokeStyle='#5f7480';g.lineWidth=14;g.stroke();
    const ang=Math.PI*1.38,x=230+150*Math.cos(ang),y=250+150*Math.sin(ang),tx=-Math.sin(ang),ty=Math.cos(ang),ix=-Math.cos(ang),iy=-Math.sin(ang);
    g.save();g.translate(x,y);g.rotate(Math.atan2(ty,tx));car(g,0,4);g.restore();
    const ax=x,ay=y-10;arrow(g,ax,ay,ax+tx*62,ay+ty*62,CV,3,10);label(g,'v',ax+tx*62+6,ay+ty*62-4,CV,16);
    const bx=ix*44+tx*18,by=iy*44+ty*18;arrow(g,ax,ay+8,ax+bx,ay+8+by,CA,3,10);label(g,'a',ax+bx+8,ay+8+by+4,CA,16);
    line(g,ax,ay+8,ax+ix*44,ay+8+iy*44,CA+'88',1.5,[4,3]);
    label(g,T('轉彎：a 有一部分指向彎道內側','On a curve, part of a points inward'),230,236,C.gold,17,'center');
    label(g,T('只看快慢不夠','Speed alone is not enough'),400,110,C.white,16,'center');
  }
  // 動手：拖重物（或滑桿、方向鍵）走完三段，看合力箭頭轉向
  function hands(g,s){
    const c=P.crane(s.u),ly=crane(g,{h:c.y,hot:c.stage+1});
    if(c.y>.06){arrow(g,PX+20,hy(0)-2,PX+20,ly+6,CD,2.5,9);label(g,'D',PX+26,(hy(0)+ly)/2+6,CD,16);}
    vecArrow(g,140,ly,40*c.v,CV,'v',false);
    const {F}=forcesOf(c.a);label(g,st(c.stage),282,24,C.gold,19,'center');
    fbd(g,276,124,c.a,{fx:30});
    vecArrow(g,342,124,F,CA,'a');
    label(g,c.a>0.01?'T > mg':c.a<-0.01?'T < mg':'T = mg',282,234,CT,19,'center');
    [['加速','Speed up'],['等速','Steady'],['減速','Slowing']].forEach((z,i)=>{const y=86+i*34,on=s.seen[i],cur=c.stage===i;
      if(cur)box(g,366,y-22,88,30,7,'#ffd17e22','#ffd17e88',1.5);label(g,(on?'✓ ':'○ ')+T(...z),372,y,on?C.green:C.faint,LabSettings.lang==='en'?15:17);});
    if(s.done)label(g,T('三段都看過','All three seen'),410,206,C.green,15,'center');
  }
  function heightToU(h){let a=0,b=1;for(let i=0;i<30;i++){const m=(a+b)/2;if(P.crane(m).y<h)a=m;else b=m;}return b;}
  ExamScene.add(11,{
    state:()=>({row:'',id:'Q11_08',part:0,t:0,hands:false,u:0,seen:[false,false,false]}),
    paint,
    preview(g){g.save();g.translate(110,0);crane(g,{h:1,fs:24,big:1.5});g.restore();},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,btn,complete,render}){
      s.hands=true;let frame=0,gen=0,playB,last=-1;
      const R=range(T('時間進度','Time'),0,100,0,v=>{stop();set(v/100);});R.val.textContent='0%';
      function set(u){s.u=clamp(u,0,1);R.input.value=Math.round(s.u*100);R.val.textContent=Math.round(s.u*100)+'%';
        const c=P.crane(s.u);if(s.u>0&&s.u<1)s.seen[c.stage]=true;else if(s.u>=1)s.seen[2]=true;
        if(c.stage!==last){last=c.stage;snd({freq:[523,392,330][c.stage],dur:.12,type:'triangle',gain:.12});}
        if(s.seen.every(Boolean)&&!s.done){s.done=true;if(LabSettings.get('sound'))LabSound.sweep({from:440,to:880,dur:.25,gain:.12});complete();}}
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
      const at=(x,y)=>{if(mode==='load')set(heightToU(clamp((GY-y)/HP,0,1)));else set((x-232)/218);render();};
      return {hit:(x,y)=>{stop();mode=x<220?'load':'time';at(x,y);return 0;},move:(_,x,y)=>at(x,y)};
    },
    read(s,output){const c=P.crane(s.u),dir=c.a>.01?T('向上','up'):c.a<-.01?T('向下','down'):T('是 0','zero');
      output.innerHTML=st(c.stage)+'：'+T('速度向上，加速度與合力 ','velocity up; acceleration and net force ')+'<b>'+dir+'</b>　'+T('三段：','Stages: ')+
        ['加速','等速','減速'].map((z,i)=>(s.seen[i]?'✓ ':'○ ')+T(z,['speeding up','steady','slowing'][i])).join('　')+
        (s.done?'<br>'+T('合力一直跟著加速度：向上 → 0 → 向下；速度一路都向上','The net force follows a: up → 0 → down, while v stays up'):'<br>'+T('拖重物上下移動，或按「自動播放」','Drag the load up and down, or press Play'));}
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(11,{groups:{wrong:["往上跑，力就往上？", "Moving up means force up?"],flip:["合力跟著加速度", "Net force follows acceleration"],solve:["三段的合力", "Net force in the three stages"],judge:["逐項判斷", "Check each choice"],trick:["口訣", "The rule"]},board:{wrong:[String.raw`\vec v\uparrow\ \overset{?}{\Rightarrow}\ \vec F\uparrow`,String.raw`\vec v\uparrow\ \overset{?}{\Rightarrow}\ \vec F\uparrow`],flip:[String.raw`\vec F\parallel\vec a,\quad \vec F\ \text{不一定}\parallel\vec v`,String.raw`\vec F\parallel\vec a,\quad \vec F\ \text{not always}\parallel\vec v`],solve:String.raw`F=T-mg:\ \ a\uparrow,\ \ a=0,\ \ a\downarrow`,judge:[String.raw`\vec F=m\vec a\ \Rightarrow\ \vec F\ \text{與}\ \vec a\ \text{同向}`,String.raw`\vec F=m\vec a\ \Rightarrow\ \vec F\ \text{along}\ \vec a`],trick:[String.raw`\text{變快：}\vec a\parallel\vec v\quad \text{變慢：}\vec a\ \text{反}\ \vec v`,String.raw`\text{speeding up: }\vec a\parallel\vec v\quad \text{slowing: opposite}`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q11=[
 {
  "id": "Q11_08",
  "row": "wrong",
  "duration": 6.1,
  "disp": "選 A 的人，直覺是這樣：東西一直往上跑，那力應該一直往上吧？",
  "en": "People who chose A thought: the load keeps going up, so the force must keep pointing up, right?"
 },
 {
  "id": "Q11_09",
  "row": "wrong",
  "duration": 2.1,
  "disp": "不然它怎麼會往上？",
  "en": "Otherwise how could it go up?"
 },
 {
  "id": "Q11_10",
  "row": "flip",
  "duration": 6.5,
  "disp": "恭喜你，這個想法跟 2000 多年前的亞里斯多德一模一樣，很有歷史感。",
  "en": "Congratulations: that's exactly what Aristotle thought over 2000 years ago. Very historic of you."
 },
 {
  "id": "Q11_11",
  "row": "flip",
  "duration": 5.1,
  "disp": "可是牛頓告訴我們，合力決定的是加速度，不是速度。",
  "en": "But Newton tells us the net force decides the acceleration, not the velocity."
 },
 {
  "id": "Q11_12",
  "row": "flip",
  "duration": 5.7,
  "disp": "你搭電梯往上，快到樓層的時候，身體是不是有一點輕飄飄？",
  "en": "When you ride an elevator up, don't you feel a little floaty just before your floor?"
 },
 {
  "id": "Q11_13",
  "row": "flip",
  "duration": 4.7,
  "disp": "那不是你練成輕功了，是電梯在減速，合力向下。",
  "en": "You haven't mastered kung fu. The elevator is slowing down, and the net force points down."
 },
 {
  "id": "Q11_14",
  "row": "solve",
  "duration": 8.3,
  "disp": "我們先把重物的受力畫出來：繩子的張力 T 向上，重力 m g 向下，合力 F 就是 T 減掉 m g。",
  "en": "First draw the forces on the load: tension T up, gravity mg down, so the net force F is T minus mg."
 },
 {
  "id": "Q11_15",
  "row": "solve",
  "duration": 7.3,
  "disp": "甲到乙在加速往上，速度越來越快，加速度向上，所以合力向上，T 比 m g 大。",
  "en": "From P1 to P2 it speeds up going upward: acceleration up, so net force up, and T is greater than mg."
 },
 {
  "id": "Q11_16",
  "row": "solve",
  "duration": 5.1,
  "disp": "乙到丙等速，加速度是 0，合力也是 0，T 等於 m g。",
  "en": "From P2 to P3 the speed is constant: acceleration zero, net force zero, T equals mg."
 },
 {
  "id": "Q11_17",
  "row": "solve",
  "duration": 7.3,
  "disp": "丙到丁在減速，往上跑卻越來越慢，加速度向下，所以合力向下，T 比 m g 小。",
  "en": "From P3 to P4 it slows down: still going up but slower, so acceleration down, net force down, and T is less than mg."
 },
 {
  "id": "Q11_18",
  "row": "judge",
  "duration": 1.7,
  "disp": "現在來對選項。",
  "en": "Now let's check the options."
 },
 {
  "id": "Q11_19",
  "row": "judge",
  "duration": 7.1,
  "disp": "因為 F 等於 m a，質量 m 一定是正的，所以合力和加速度一定同方向，E 對。",
  "en": "Because F equals ma and the mass m is always positive, net force and acceleration always point the same way. E is right."
 },
 {
  "id": "Q11_20",
  "row": "judge",
  "duration": 4.7,
  "disp": "丙到丁，速度向上、合力向下，方向相反，D 對。",
  "en": "From P3 to P4, velocity up, net force down: opposite directions. D is right."
 },
 {
  "id": "Q11_21",
  "row": "judge",
  "duration": 5.1,
  "disp": "丙到丁的位移也是向上，和合力方向相反，所以 C 錯。",
  "en": "From P3 to P4 the displacement is also up, opposite to the net force, so C is wrong."
 },
 {
  "id": "Q11_22",
  "row": "judge",
  "duration": 6.7,
  "disp": "甲到乙合力向上，丙到丁合力向下，一個上、一個下，所以 A、B 都錯。",
  "en": "Net force is up from P1 to P2 and down from P3 to P4, one up, one down, so A and B are both wrong."
 },
 {
  "id": "Q11_23",
  "row": "judge",
  "duration": 1.7,
  "disp": "答案是 D、E。",
  "en": "The answer is D and E."
 },
 {
  "id": "Q11_24",
  "row": "trick",
  "duration": 4.5,
  "disp": "秒殺口訣：合力跟著加速度走，不跟著速度走。",
  "en": "The shortcut: the net force follows the acceleration, not the velocity."
 },
 {
  "id": "Q11_25",
  "row": "trick",
  "duration": 4.9,
  "disp": "判斷加速度，只要問自己，速率在變大，還是變小？",
  "en": "To find the acceleration, just ask yourself: is the speed going up or down?"
 },
 {
  "id": "Q11_26",
  "row": "trick",
  "duration": 4.3,
  "disp": "變大，就跟速度同向；變小，就跟速度反向。",
  "en": "Going up: same direction as the velocity. Going down: opposite to the velocity."
 },
 {
  "id": "Q11_27",
  "row": "trick",
  "duration": 9.3,
  "disp": "注意喔，這招只能用在直線運動；如果是轉彎，加速度還有一部分指向彎道內側，就不能只看快慢了。",
  "en": "Careful: this only works for straight-line motion. On a curve, part of the acceleration points toward the inside of the bend, so speed alone won't tell you."
 }
];
/* tracks:end */
