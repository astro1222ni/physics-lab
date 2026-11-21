/* 113 學測第 27 題：碰撞中的定力（單選 B）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const M=50,V0=30,V1=15,DT=.030,R=P.crash(M,V0,V1,DT);
  // 汽車側面：車身、車窗、駕駛人、輪子；airbag 0–1 是氣囊膨脹程度
  function car(g,x,y,o={}){
    const body=g.createLinearGradient(0,y-40,0,y+12);body.addColorStop(0,'#5b8db8');body.addColorStop(1,'#2f5675');
    g.beginPath();g.moveTo(x-90,y+6);g.lineTo(x-92,y-16);g.quadraticCurveTo(x-86,y-24,x-60,y-26);g.lineTo(x-36,y-50);g.lineTo(x+30,y-50);g.lineTo(x+58,y-26);g.lineTo(x+84,y-22);g.quadraticCurveTo(x+94,y-18,x+92,y+6);g.closePath();g.fillStyle=body;g.fill();g.strokeStyle='#9cc3e0';g.lineWidth=1.2;g.stroke();
    g.beginPath();g.moveTo(x-30,y-45);g.lineTo(x+26,y-45);g.lineTo(x+50,y-26);g.lineTo(x-52,y-26);g.closePath();g.fillStyle='#bfe2f2aa';g.fill();
    for(const wx of [x-56,x+56]){D.ball(g,wx,y+8,13,'#30363b');K.dot(g,wx,y+8,5,'#9aa4ab');}
    const hx=x+8+(o.lean||0);D.ball(g,hx,y-34,7,'#f1c9a5');box(g,hx-6,y-28,12,18,4,'#d36b5c');                 // 駕駛人
    if(o.belt){line(g,hx-6,y-28,hx+6,y-12,'#222',3);}
    if(o.airbag){const r=4+12*o.airbag;g.beginPath();g.ellipse(x+30,y-32,r*.7,r,0,0,Math.PI*2);g.fillStyle='rgba(245,245,240,.9)';g.fill();g.strokeStyle='#cfcfc6';g.stroke();}
  }
  const ids=Array.from({length:11},(_,i)=>'Q27_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function shares(g,k){const Q=ExamPaper.questions[27],L='ABCDE',V=['150000','25000','8880','1000','250'];
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*2.6*seg(k,0,.6),col=L[j]==='B'?C.green:'CDE'.includes(L[j])?C.red:'#5f7480';
      box(g,x,200-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,222,C.white,16,'center');label(g,V[j]+' N',x+23,242,C.faint,11,'center');if(k>.4)label(g,v+'%',x+23,192-hh,col,15,'center');});}
  // F–t 長方形：面積＝動量變化（固定 750 kg·m/s）
  function rect(g,x0,y0,dt,col,showArea=true){const F=M*(V0-V1)/dt,w=dt/0.1*300,h=F/50000*150;box(g,x0,y0-h,w,h,3,col+'44',col,2);
    if(showArea&&w<90&&showArea!=='top')sci(g,'F Δt = 750',x0+w+6,y0-h/2+5,col,13,'left');else if(showArea)sci(g,'F Δt = 750',showArea==='right'?x0+w*.75:x0+w/2,showArea==='top'?y0-h+18:showArea==='right'?y0-h/2+5:y0-h/2+5,col,13,'center');label(g,Math.round(F)+' N',x0+w+6,y0-h+12,col,13);return {w,h,F};}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:shares(g,k);label(g,T('C、D、E 各 14%','C, D, E: 14% each'),440,30,C.red,16,'right');return;
      case 1:{sci(g,'50 × 15 = 750 kg·m/s',230,70,C.red,20,'center');label(g,T('這是動量的變化，不是力','That is the change in momentum, not a force'),230,110,C.white,15,'center');
        if(k>.4)sci(g,'750 ÷ 0.030 s = 25000 N',230,170,C.green,20,'center');label(g,T('D：1000 N','D: 1000 N'),440,232,C.red,14,'right');return;}
      case 2:{sci(g,'750 ÷ 3 s = 250 N',230,70,C.red,20,'center');label(g,T('E 把 30 毫秒當成 3 秒','E treats 30 ms as 3 s'),230,110,C.white,15,'center');
        if(k>.4)sci(g,'1 ms = 10^{-3} s　30 ms = 0.030 s',230,170,C.gold,19,'center');return;}
      case 3:{D.fig9(g,{box:{x:56,y:212,w:300,h:170},p:P.SAT/2});label(g,T('接第 26 題','From question 26'),452,60,C.gold,14,'right');label(g,'Δt = 30 ms',452,90,C.green,16,'right');return;}
      case 4:{car(g,230,130,{});const u=seg(k,0,.7);arrow(g,40,60,40+120,60,C.white,2,9);label(g,T('向東為正','East is +'),40,48,C.faint,13);
        sci(g,'v_{0} = 108 km/h = 30 m/s',40,200,'#7fb6ff',16);if(u>.4)sci(g,'v = 54 km/h = 15 m/s',40,232,'#c7a4ff',16);
        arrow(g,330,100,330+90*(u>.4?.5:1),100,u>.4?'#c7a4ff':'#7fb6ff',3,11);return;}
      case 5:{sci(g,'a = Δv ÷ Δt',230,70,C.white,20,'center');sci(g,'= (15 − 30) ÷ 0.030',230,120,C.white,20,'center');if(k>.4)sci(g,'= −500 m/s^{2}',230,170,C.gold,22,'center');return;}
      case 6:{sci(g,'F = m a = 50 × (−500)',230,70,C.white,20,'center');sci(g,'= −25000 N',230,120,C.gold,24,'center');
        if(k>.3){arrow(g,260,170,180,170,C.red,4,13);label(g,T('向西','West'),280,176,C.red,16);}if(k>.6)label(g,T('答案 B','Answer: B'),230,230,C.green,20,'center');return;}
      case 7:{box(g,150,70,160,100,10,'#6c7a84','#9aa9b2',2);label(g,'2.5 t',230,130,C.white,26,'center');arrow(g,230,172,230,220,C.red,3,10);sci(g,'≈ 2.5×10^{4} N',320,210,C.red,16);
        label(g,T('安全帶和車體一起擋住你','Seat belt and car body hold you'),230,40,C.white,14,'center');return;}
      case 8:{const y0=220;line(g,40,y0,440,y0,C.faint,1.5);line(g,40,y0,40,40,C.faint,1.5);label(g,'F',48,50,C.faint,14);label(g,'t',436,y0-6,C.faint,14,'right');
        rect(g,40,y0,.030,C.red,k>.4?'top':true);if(k>.4)rect(g,40,y0,.060,C.green,'right');if(k>.6)label(g,T('時間 × 2 → 平均力 ÷ 2','Time × 2 → average force ÷ 2'),440,60,C.green,15,'right');return;}
      case 9:{car(g,120,150,{airbag:1,lean:6});label(g,T('只有氣囊','Airbag only'),120,206,C.red,15,'center');mark(g,120,230,false,10);
        car(g,340,150,{airbag:1,belt:true});label(g,T('氣囊＋安全帶','Airbag + seat belt'),340,206,C.green,15,'center');mark(g,340,230,true,10);return;}
      default:sci(g,'F Δt = m Δv',230,90,C.gold,26,'center');label(g,T('毫秒記得換成秒','Remember: ms → s'),230,150,C.white,18,'center');
    }
  }
  // 能動手：拉緩衝時間 Δt，動量變化固定，看平均力怎麼變；30 ms 與 60 ms 都看過就完成
  function hands(g,s){const y0=220;line(g,40,y0,300,y0,C.faint,1.5);line(g,40,y0,40,40,C.faint,1.5);label(g,'F',48,50,C.faint,14);label(g,'Δt',296,y0-6,C.faint,14,'right');
    rect(g,40,y0,s.dt/1000,Math.abs(s.dt-30)<1?C.red:Math.abs(s.dt-60)<1?C.green:C.gold);
    label(g,T('試試看：','Try:'),452,36,C.faint,13,'right');label(g,(s.seen30?'✓ ':'○ ')+'Δt = 30 ms',452,60,s.seen30?C.green:C.white,14,'right');label(g,(s.seen60?'✓ ':'○ ')+'Δt = 60 ms',452,86,s.seen60?C.green:C.white,14,'right');
    sci(g,'Δp = −750 kg·m/s',452,130,C.white,13,'right');}
  ExamScene.add(27,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,dt:15,seen30:false,seen60:false}),
    paint,
    preview(g){car(g,150,140,{airbag:.8,belt:true});sci(g,'30 → 15 m/s',300,90,C.white,18);label(g,'Δt = 30 ms',300,130,C.gold,18);label(g,T('平均力多大？','Average force?'),300,170,C.white,16);},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;const r=range(T('緩衝時間 Δt','Stopping time Δt'),15,100,15,v=>{s.dt=v;r.val.textContent=v+' ms';if(v===30)s.seen30=true;if(v===60)s.seen60=true;if(s.seen30&&s.seen60)complete();});r.val.textContent='15 ms';return {};
    },
    read(s,output){const c=P.crash(M,V0,V1,s.dt/1000);output.textContent=T('平均力大小 ','Average force ')+Math.abs(Math.round(c.F))+' N'+T('（約 ',' (about ')+(Math.abs(c.F)/9.8/1000).toFixed(1)+T(' 公噸的重量）',' tonnes of weight)');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(27,{groups:{wrong:["毫秒換成秒", "Milliseconds to seconds"],solve:["速度變化除以時間", "Change in velocity over time"],story:["爭取時間", "Buying time"],trick:["口訣", "The rule"]},board:{wrong:String.raw`30\,\text{ms}=0.030\,\text{s}`,solve:String.raw`F=m\dfrac{\Delta v}{\Delta t}=50\times\dfrac{15-30}{0.030}=-2.5\times10^{4}\,\text{N}`,story:String.raw`\Delta t\times2\ \Rightarrow\ \bar F\div2`,trick:String.raw`F\Delta t=m\Delta v`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q27=[
 {
  "id": "Q27_01",
  "row": "wrong",
  "duration": 5.02,
  "disp": "這題答對 51%；C、D、E 各有 14%，A 只有 6%。",
  "en": "51% got this right; C, D and E drew 14% each, and A only 6%."
 },
 {
  "id": "Q27_02",
  "row": "wrong",
  "duration": 10.4,
  "disp": "D 是 1000 牛頓。如果只算 50 乘 15 等於 750，那是動量的變化，單位是公斤公尺每秒，還要再除以 0.03 秒，才是力。",
  "en": "D is 1000 N. Working out 50 × 15 = 750 gives the change in momentum, in kg·m/s. You still have to divide by 0.03 s to get a force."
 },
 {
  "id": "Q27_03",
  "row": "wrong",
  "duration": 7.38,
  "disp": "E 是 250 牛頓，如果把 30 毫秒誤當成 3 秒，就會算出這個數字；1 毫秒是千分之一秒。",
  "en": "E, 250 N, is what you get by mistaking 30 ms for 3 s. One millisecond is a thousandth of a second."
 },
 {
  "id": "Q27_04",
  "row": "solve",
  "duration": 7.4,
  "disp": "這題接著上一題：駕駛人碰到氣囊的時候，氣囊剛好充到飽和壓力的一半，就是 30 毫秒。",
  "en": "This builds on the last question: when the driver reaches the airbag it is at half the saturation pressure, which is 30 ms."
 },
 {
  "id": "Q27_05",
  "row": "solve",
  "duration": 8.49,
  "disp": "以向東為正，速度從 108 公里每小時，也就是 30 公尺每秒，降到 54 公里每小時，15 公尺每秒。",
  "en": "Take east as positive. The speed drops from 108 km/h, which is 30 m/s, to 54 km/h, which is 15 m/s."
 },
 {
  "id": "Q27_06",
  "row": "solve",
  "duration": 6.89,
  "disp": "力是定力，加速度就是速度變化除以時間：負 15 除以 0.030，等於負 500 公尺每秒平方。",
  "en": "The force is constant, so the acceleration is change in velocity over time: −15 ÷ 0.030 = −500 \\(\\mathrm{m/s}^{2}\\)."
 },
 {
  "id": "Q27_07",
  "row": "solve",
  "duration": 5.83,
  "disp": "再乘上質量 50 公斤，力的大小是 25000 牛頓，方向向西，答案 B。",
  "en": "Times the 50 kg mass gives 25,000 N, pointing west. The answer is B."
 },
 {
  "id": "Q27_08",
  "row": "story",
  "duration": 6.53,
  "disp": "25000 牛頓，大約是 2.5 公噸東西的重量，這是安全帶和車體一起在擋住你。",
  "en": "25,000 N is about the weight of 2.5 tonnes. That is the seat belt and the car body holding you back together."
 },
 {
  "id": "Q27_09",
  "row": "story",
  "duration": 9.46,
  "disp": "我上動量的時候說過：同樣的動量變化，只要多爭取一倍的時間，平均力就減半；安全帶、安全氣囊都有一點彈性，就是在幫你爭取時間。",
  "en": "When I taught momentum I said: for the same change in momentum, buy twice the time and the average force is halved. Seat belts and airbags both give a little, and that is them buying you time."
 },
 {
  "id": "Q27_10",
  "row": "story",
  "duration": 5.52,
  "disp": "所以只有安全氣囊、沒有綁安全帶，保護就差很多；兩個要一起用，一定要綁。",
  "en": "So an airbag without a seat belt protects far less. They work together. Always buckle up."
 },
 {
  "id": "Q27_11",
  "row": "trick",
  "duration": 4.34,
  "disp": "秒殺口訣：力乘時間等於動量變化，毫秒記得換成秒。",
  "en": "The quick rule: force times time equals change in momentum, and convert milliseconds to seconds."
 }
];
/* tracks:end */
