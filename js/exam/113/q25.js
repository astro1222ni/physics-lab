/* 113 學測第 25 題：性能係數與度電（單選 C）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const COLD='#7fb6ff',HOT='#ff8a80',GOLD='#ffd17e';
  const ids=Array.from({length:9},(_,i)=>'Q25_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  const VAL=['3.6×10^{6}','7.2×10^{6}','9.0×10^{6}','1.1×10^{7}','1.4×10^{7}'];
  function shares(g,k){const Q=ExamPaper.questions[25],L='ABCDE';
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*2.6*seg(k,0,.6),col=L[j]==='C'?C.green:'AB'.includes(L[j])?C.red:'#5f7480';
      box(g,x,200-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,222,C.white,16,'center');sci(g,VAL[j],x+23,242,C.faint,12,'center');if(k>.4)label(g,v+'%',x+23,192-hh,col,15,'center');});}
  // 能量方塊：每塊 1 份（1 度電＝3.6×10^6 J），n 可以是小數
  function blocks(g,x,y,n,col,txt,size=26){const full=Math.floor(n+1e-9);for(let j=0;j<Math.ceil(n-1e-9);j++){const w=j<full?size:size*(n-full);box(g,x+j*(size+6),y,w,size,5,col+'99',col,1.5);}if(txt)sci(g,txt,x,y-8,col,14);}
  function meter(g,x,y,kwh){box(g,x,y,120,80,12,'#0b2233','#35505f',2);label(g,'kWh',x+60,y+22,C.faint,12,'center');box(g,x+14,y+30,92,30,6,'#071520','#2c4a59');label(g,kwh.toFixed(1),x+60,y+52,GOLD,20,'center');}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:shares(g,k);label(g,T('B 18%、A 14%','B 18%, A 14%'),440,30,C.red,16,'right');return;
      case 1:{sci(g,'1 '+T('度','kWh')+' = 3.6×10^{6} J',230,80,GOLD,22,'center');label(g,T('A 只換了單位','A only converts units'),230,130,C.red,17,'center');if(k>.4){sci(g,T('還沒乘性能係數 2.5','Not yet multiplied by COP 2.5'),230,176,C.white,16,'center');mark(g,230,214,false,12);}return;}
      case 2:{sci(g,'7.2×10^{6} = 2 × 3.6×10^{6}',230,80,C.red,20,'center');label(g,T('B 把 2.5 當成 2','B uses 2 instead of 2.5'),230,130,C.red,17,'center');if(k>.4)sci(g,T('題目給 2.5，就乘 2.5','The question says 2.5: multiply by 2.5'),230,180,C.white,16,'center');return;}
      case 3:{meter(g,30,60,ease(seg(k,0,.5)));const u=seg(k,.3,.9);
        sci(g,'1 kW × 1 h',180,90,C.white,19);if(u>0)sci(g,'= 1000 W × 3600 s',180,130,C.white,19);if(u>.5)sci(g,'= 3.6×10^{6} J',180,172,GOLD,22);return;}
      case 4:{sci(g,T('性能係數 = ','COP = '),60,80,C.white,19);sci(g,T('搬走的熱 Q_{C}','heat removed Q_{C}'),210,66,COLD,17);line(g,205,76,400,76,C.white,1.5);sci(g,T('輸入的功 W','work input W'),230,100,GOLD,17);
        if(k>.4){sci(g,'Q_{C} = 2.5 × 3.6×10^{6} J',230,170,COLD,21,'center');}return;}
      case 5:{sci(g,'Q_{C} = 9.0×10^{6} J',230,100,C.green,28,'center');label(g,T('答案 C','Answer: C'),230,170,C.green,22,'center');return;}
      case 6:{const u=seg(k,0,.7);blocks(g,40,60,1,GOLD,T('付的電能 W：1 J','Electricity paid W: 1 J'),30);blocks(g,40,130,2.5*u,COLD,T('搬走的熱 Q_{C}：2.5 J','Heat removed Q_{C}: 2.5 J'),30);
        if(k>.75)label(g,T('比 1 還多：冰箱、冷氣厲害的地方','More than 1: what makes fridges and air conditioners clever'),230,226,C.green,14,'center');return;}
      case 7:{meter(g,30,60,1);sci(g,'1 '+T('度','kWh')+' = 3.6×10^{6} J',190,90,GOLD,18);
        const bx=320,by=170;g.save();g.translate(bx,by);g.beginPath();g.moveTo(0,-14);g.lineTo(-12,4);g.lineTo(-2,4);g.lineTo(-8,22);g.lineTo(12,-2);g.lineTo(2,-2);g.lineTo(8,-14);g.closePath();g.fillStyle=GOLD;g.fill();g.restore();
        label(g,T('用電安全：帥哥美女少看一點，就不會被電到','Safety tip: look less at good-looking people, and you won’t get a shock'),230,226,C.white,14,'center');return;}
      default:sci(g,T('度 × 3.6×10^{6} → 焦耳','kWh × 3.6×10^{6} → J'),230,90,GOLD,20,'center');arrow(g,230,110,230,140,C.white,2,9);sci(g,T('× 性能係數 → 搬走的熱','× COP → heat removed'),230,170,COLD,20,'center');
    }
  }
  // 能動手：性能係數計算器（度數、COP），把 1 度、2.5 調出來就完成
  function hands(g,s){const {W,Q}=P.heatMoved(s.kwh,s.cop);meter(g,20,20,s.kwh);
    sci(g,'W = '+s.kwh.toFixed(1)+' × 3.6×10^{6} = '+(W/1e6).toFixed(1)+'×10^{6} J',160,48,GOLD,15);
    sci(g,'Q_{C} = '+s.cop.toFixed(1)+' × W = '+(Q/1e6).toFixed(1)+'×10^{6} J',160,84,COLD,15);
    const sc=Math.min(1,10/Math.max(s.kwh*(1+s.cop),1));blocks(g,20,140,s.kwh*sc,GOLD,'W',22);blocks(g,20,196,s.kwh*s.cop*sc,COLD,'Q_{C}',22);
    if(Math.abs(s.kwh-1)<1e-9&&Math.abs(s.cop-2.5)<1e-9){mark(g,420,200,true,12);label(g,T('就是第 25 題','That is question 25'),440,236,C.green,14,'right');}}
  ExamScene.add(25,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,kwh:2,cop:2}),
    paint,
    preview(g){K.boost(1.7,()=>{blocks(g,36,70,1,GOLD,T('付 1 份電','Pay 1 unit'),58);blocks(g,36,168,2.5,COLD,T('搬 2.5 份熱','Move 2.5 units'),58);});sci(g,'COP = 2.5',340,128,C.white,42,'center');label(g,T('搬的熱 ÷ 付的電','heat moved ÷ energy paid'),340,190,C.faint,19,'center');},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;const ok=()=>{if(Math.abs(s.kwh-1)<1e-9&&Math.abs(s.cop-2.5)<1e-9)complete();};
      const a=range(T('用電度數','Energy used'),1,40,20,v=>{s.kwh=v/10;a.val.textContent=s.kwh.toFixed(1)+T(' 度',' kWh');ok();});a.val.textContent='2.0'+T(' 度',' kWh');
      const b=range(T('性能係數 COP','COP'),10,50,20,v=>{s.cop=v/10;b.val.textContent=s.cop.toFixed(1);ok();});b.val.textContent='2.0';return {};
    },
    read(s,output){output.innerHTML=T('付 1 焦耳電能，搬走 ','Pay 1 J of electricity, remove ')+s.cop.toFixed(1)+T(' 焦耳的熱；丟到外面的熱 = ',' J of heat; heat dumped outside = ')+(1+s.cop).toFixed(1)+T(' 焦耳',' J');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(25,{groups:{wrong:["只換單位就停了", "Stopped after converting units"],solve:["先換單位再乘", "Convert, then multiply"],joke:["一度電", "One kilowatt-hour"],trick:["口訣", "The rule"]},board:{wrong:String.raw`1\ \text{kWh}=3.6\times10^{6}\,\text{J}`,solve:String.raw`Q=\text{COP}\times W=2.5\times3.6\times10^{6}=9.0\times10^{6}\,\text{J}`,joke:String.raw`1000\,\text{W}\times3600\,\text{s}`,trick:String.raw`Q_C=\text{COP}\cdot W`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q25=[
 {
  "id": "Q25_01",
  "row": "wrong",
  "duration": 4.88,
  "disp": "錯最多的是 B，18%，A 也有 14%。",
  "en": "The top wrong picks are B at 18% and A at 14%."
 },
 {
  "id": "Q25_02",
  "row": "wrong",
  "duration": 7.43,
  "disp": "A 是 3.6 乘以 10 的 6 次方焦耳，那只是把 1 度電換成焦耳，還沒乘上性能係數。",
  "en": "A, \\(3.6\\times10^{6}\\) J, is just one kilowatt-hour in joules, before multiplying by the coefficient of performance."
 },
 {
  "id": "Q25_03",
  "row": "wrong",
  "duration": 8.52,
  "disp": "B 是 7.2 乘以 10 的 6 次方焦耳，等於把 2.5 當成 2 來算；題目給 2.5，就乘 2.5。",
  "en": "B, \\(7.2\\times10^{6}\\) J, is what you get if 2.5 is taken as 2. The question gives 2.5, so multiply by 2.5."
 },
 {
  "id": "Q25_04",
  "row": "solve",
  "duration": 7.87,
  "disp": "先換單位：1 度電就是 1 千瓦用 1 小時，1000 瓦乘 3600 秒，3.6 乘以 10 的 6 次方焦耳。",
  "en": "Convert first: one kilowatt-hour is 1000 watts for one hour, 1000 W × 3600 s = \\(3.6\\times10^{6}\\) J."
 },
 {
  "id": "Q25_05",
  "row": "solve",
  "duration": 8.86,
  "disp": "性能係數等於從冰箱裡面搬走的熱，除以輸入的功，所以搬走的熱等於 2.5 乘以 3.6 乘以 10 的 6 次方。",
  "en": "COP is the heat taken out of the fridge divided by the work input, so the heat moved is 2.5 × \\(3.6\\times10^{6}\\)."
 },
 {
  "id": "Q25_06",
  "row": "solve",
  "duration": 3.35,
  "disp": "等於 9.0 乘以 10 的 6 次方焦耳，答案 C。",
  "en": "That is \\(9.0\\times10^{6}\\) J. The answer is C."
 },
 {
  "id": "Q25_07",
  "row": "solve",
  "duration": 11.13,
  "disp": "你看，性能係數 2.5，表示付 1 焦耳的電能，可以從冰箱裡搬走 2.5 焦耳的熱，比 1 還多，這就是冰箱、冷氣厲害的地方。",
  "en": "A COP of 2.5 means 1 J of electrical energy moves 2.5 J of heat out of the fridge, more than 1. That is what makes fridges and air conditioners so clever."
 },
 {
  "id": "Q25_08",
  "row": "joke",
  "duration": 10.05,
  "disp": "我上電功率的時候說過，一度電是 3.6 乘以 10 的 6 次方焦耳，然後講到用電安全：帥哥美女少看一點，就不會被電到。",
  "en": "When I taught electric power, I said one kilowatt-hour is \\(3.6\\times10^{6}\\) J, and then for electrical safety: look at good-looking people less, and you won’t get zapped."
 },
 {
  "id": "Q25_09",
  "row": "trick",
  "duration": 7.09,
  "disp": "秒殺口訣：度換焦耳乘 3.6 乘以 10 的 6 次方，再乘性能係數。",
  "en": "The quick rule: kilowatt-hours to joules, times \\(3.6\\times10^{6}\\), then times the COP."
 }
];
/* tracks:end */
