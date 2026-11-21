/* 113 學測第 44 題：磁鐵穿越環圈的磁力（單選 E）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const ids=Array.from({length:12},(_,i)=>'Q44_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function shares(g,k){const Q=ExamPaper.questions[44],L='ABCDE';
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*4*seg(k,0,.6),col=L[j]==='E'?C.green:'CD'.includes(L[j])?C.red:'#5f7480';
      box(g,x,214-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,236,C.white,16,'center');if(k>.4)label(g,v+'%',x+23,206-hh,col,15,'center');});}
  // 右側磁通量計：穿過環圈甲、向上的磁通量（0–1）
  function fluxMeter(g,x,y,t){const f=P.fluxUp(t)/P.fluxUp(6);box(g,x,y,26,120,6,'#ffffff10','#ffffff44',1);box(g,x+3,y+117-f*114,20,f*114,4,'#8ae6d7');
    label(g,T('磁通量','Flux'),x+13,y-8,C.faint,12,'center');const d=P.fluxUp(t+.05)-P.fluxUp(t-.05);
    if(Math.abs(d)>.002)label(g,d>0?T('變多','rising'):T('變少','falling'),x+13,y+140,d>0?'#ff9f8a':C.teal,13,'center');}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:shares(g,k);label(g,T('答對只有 34%','Only 34% correct'),440,30,C.gold,16,'right');return;
      case 1:D.fig18(g,{t:2.6,showI:false});label(g,T('C：恆為順時針？','C: always clockwise?'),452,40,C.red,14,'right');label(g,T('D：恆為逆時針？','D: always counterclockwise?'),452,64,C.red,14,'right');label(g,'25% + 19% = 44%',452,92,C.red,14,'right');return;
      case 2:case 3:{const tt=i===2?12*seg(k,0,.9):(k<.5?3:9);D.fig18(g,{t:tt,flow:t*2,showI:i===3});fluxMeter(g,420,50,tt);
        if(i===3&&k>.6)label(g,T('方向一定會反過來','The direction must reverse'),300,236,C.gold,15,'center');return;}
      case 4:{const r=D.fig19(g,{box:{x:40,y:130,w:390,h:150},upto:12});const ex=(tt,txt,col)=>{label(g,txt,r.X(tt),tt<6?232:36,col,13,'center');};
        ex(3,T('先往負的變大','grows negative'),'#ff9f8a');ex(6,T('回到零','back to zero'),C.white);ex(9,T('離開時變正','positive on leaving'),C.teal);
        if(k>.5){label(g,T('A、B 錯：不是一直變大或變小','A, B wrong: not steadily up or down'),440,232,C.red,13,'right');}return;}
      case 5:D.chip(g,40,70,380,T('冷次定律：感應電流反抗磁通量的變化','Lenz: the induced current opposes the change in flux'),C.gold,true);
        D.chip(g,40,130,180,T('多的就退','Too much: push back'),'#ff9f8a',k>.3);D.chip(g,240,130,180,T('少的就補','Too little: make up'),C.teal,k>.5);return;
      case 6:{D.fig18(g,{t:3,force:true,flow:t*2});fluxMeter(g,420,50,2.8);label(g,T('靠近：推開','Approaching: push away'),300,40,'#ff9f8a',15,'center');label(g,T('力向上','Force up'),300,64,C.red,15,'center');return;}
      case 7:{D.fig18(g,{t:9,force:true,flow:t*2});fluxMeter(g,420,50,9.2);label(g,T('離開：拉回來','Leaving: pull back'),300,40,C.teal,15,'center');label(g,T('磁鐵在下面 → 也是向上','Magnet below → also up'),300,64,C.red,15,'center');return;}
      case 8:{D.fig18(g,{t:k<.5?3:9,force:true,flow:t*2});label(g,T('進來推、出去拉','Push in, pull out'),300,40,C.white,15,'center');label(g,T('答案 E','Answer: E'),300,76,C.green,22,'center');return;}
      case 9:{const bar=(y,w,col,txt)=>{box(g,150,y,w,24,6,col+'aa',col);label(g,txt,140,y+17,col,14,'right');};
        bar(70,200,'#ffd17e',T('磁鐵動能減少','Magnet KE lost'));bar(120,200*seg(k,.2,.7),C.teal,T('變成電能','Becomes electrical'));label(g,T('天下沒有白吃的午餐','No free lunch'),230,200,C.gold,18,'center');return;}
      case 10:{const bar=(y,w,col,txt)=>{box(g,150,y,w,24,6,col+'aa',col);label(g,txt,140,y+17,col,14,'right');};const u=seg(k,0,.7);
        bar(70,120+120*u,'#ffd17e',T('磁鐵動能','Magnet KE'));bar(120,40+160*u,C.teal,T('電能','Electrical'));
        if(k>.5){mark(g,410,100,false,16);label(g,T('如果幫磁鐵前進 → 永動機','If it helped → perpetual motion'),230,200,C.red,15,'center');}return;}
      default:D.chip(g,40,70,180,T('來者推','Coming: push'),'#ff9f8a',true);D.chip(g,240,70,180,T('去者拉','Going: pull'),C.teal,k>.25);
        D.chip(g,40,130,380,T('這題磁力都跟磁鐵的運動方向相反','Here the force always opposes the motion'),C.gold,k>.5);
    }
  }
  // 能動手：拖磁鐵（拉桿或直接在圖上拖）從上面完整穿過環圈甲；看電流方向與磁力
  function hands(g,s){const r=D.fig18(g,{t:s.t,force:true,flow:s.anim*2});fluxMeter(g,420,50,s.t);
    label(g,s.passed?T('完整穿過了！','All the way through!'):T('把磁鐵拖下去，穿過環圈甲','Drag the magnet down through loop A'),300,236,s.passed?C.green:C.white,14,'center');return r;}
  ExamScene.add(44,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,anim:0,minT:0,maxT:0,passed:false}),
    paint,
    preview(g){g.save();g.translate(230,126);g.scale(1.08,1.08);g.translate(-230,-113);K.boost(1.3,()=>D.fig18(g,{t:0}));g.restore();K.boost(1.6,()=>label(g,T('S 極朝下，等速往下穿過環圈甲','S pole down, moving steadily through loop A'),452,34,C.faint,13,'right'));},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete,render}){
      s.hands=true;let raf=0;const tick=now=>{s.anim=now/1000;render();raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);addEventListener('pagehide',()=>cancelAnimationFrame(raf));
      const set=v=>{s.t=clamp(v,0,12);s.minT=Math.min(s.minT,s.t);s.maxT=Math.max(s.maxT,s.t);if(s.minT<=1&&s.maxT>=11&&!s.passed){s.passed=true;complete();}r.input.value=Math.round(s.t*10);r.val.textContent=s.t.toFixed(1)+' s';};
      const r=range(T('磁鐵位置（時間）','Magnet position (time)'),0,120,0,v=>set(v/10));r.val.textContent='0.0 s';
      return {hit:(x,y)=>{const yy=176-(6-s.t)*13;return Math.abs(x-112)<26&&Math.abs(y-yy)<45?0:null;},move:(i,x,y)=>set(6-(176-y)/13)};
    },
    read(s,output){const I=P.current(s.t),F=P.forceUp(s.t),Imax=-P.current(3);
      output.textContent=(Math.abs(I)/Imax<.02?T('電流幾乎是零','Almost no current'):(I>0?T('逆時針（正）','Counterclockwise (+)'):T('順時針（負）','Clockwise (−)')))+T('　磁力：','　Force: ')+(F/P.forceUp(3)<.01?T('幾乎是零','almost zero'):T('向上','upward'));}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(44,{groups:{wrong:["進來跟出去相反", "In and out are opposite"],solve:["冷次定律：多退少補", "Lenz’s law: oppose the change"],energy:["天下沒有白吃的午餐", "No free lunch"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\Phi\uparrow\ \text{then}\ \Phi\downarrow`,solve:String.raw`\varepsilon=-N\dfrac{\Delta\Phi}{\Delta t}`,energy:String.raw`\vec F_{\text{loop on magnet}}\ \text{opposes}\ \vec v`,trick:String.raw`\vec F\uparrow\ \ \text{while}\ \ \vec v\downarrow`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q44=[
 {
  "id": "Q44_01",
  "row": "wrong",
  "duration": 5.83,
  "disp": "這題答對只有 34%，是這一份考卷物理最難的單選題之一。",
  "en": "Only 34% got this right, one of the hardest physics single-choice items on the paper."
 },
 {
  "id": "Q44_02",
  "row": "wrong",
  "duration": 5.35,
  "disp": "C、D 加起來有 44%，都在說電流方向「恆為」順時針或逆時針。",
  "en": "C and D together drew 44%. Both claim the current is always clockwise, or always counterclockwise."
 },
 {
  "id": "Q44_03",
  "row": "wrong",
  "duration": 5.88,
  "disp": "可是磁鐵是穿過去的：靠近的時候，穿過環圈的磁通量變多；離開的時候，變少。",
  "en": "But the magnet passes right through: while it approaches, the flux through the loop increases; while it leaves, it decreases."
 },
 {
  "id": "Q44_04",
  "row": "wrong",
  "duration": 5.13,
  "disp": "一個多、一個少，感應電流的方向一定會反過來，所以不會「恆為」同一個方向。",
  "en": "One increases, one decreases, so the induced current must reverse. It cannot always flow one way."
 },
 {
  "id": "Q44_05",
  "row": "wrong",
  "duration": 6.62,
  "disp": "A、B 也錯：電流先往負的方向變大，再回到零，離開時又變正，不是一直變大或一直變小。",
  "en": "A and B are wrong too. The current first grows in the negative direction, returns to zero, then turns positive as the magnet leaves. It neither keeps growing nor keeps shrinking."
 },
 {
  "id": "Q44_06",
  "row": "solve",
  "duration": 6.55,
  "disp": "那磁力呢？冷次定律說，感應電流要反抗磁通量的變化，多的就退，少的就補。",
  "en": "What about the force? Lenz’s law says the induced current opposes the change in flux: too much, push it back; too little, make up for it."
 },
 {
  "id": "Q44_07",
  "row": "solve",
  "duration": 5.95,
  "disp": "磁鐵靠近，磁通量變多，環圈的感應磁場要反抗，就把磁鐵推開，力向上。",
  "en": "As the magnet approaches, the flux increases. The loop’s induced field opposes it and pushes the magnet away: the force is upward."
 },
 {
  "id": "Q44_08",
  "row": "solve",
  "duration": 7.16,
  "disp": "磁鐵離開，磁通量變少，感應磁場要補回來，就把磁鐵拉回來；磁鐵在下面，拉回來也是向上。",
  "en": "As the magnet leaves, the flux decreases. The induced field makes up for it and pulls the magnet back. The magnet is below now, so pulling it back is also upward."
 },
 {
  "id": "Q44_09",
  "row": "solve",
  "duration": 2.56,
  "disp": "進來推、出去拉，力都向上，答案 E。",
  "en": "Push on the way in, pull on the way out: the force is upward both times. The answer is E."
 },
 {
  "id": "Q44_10",
  "row": "energy",
  "duration": 7.57,
  "disp": "為什麼一定是反抗？我上課講過，冷次定律是能量守恆的結果，天下沒有白吃的午餐。",
  "en": "Why must it oppose? As I said in class, Lenz’s law follows from energy conservation. There is no free lunch."
 },
 {
  "id": "Q44_11",
  "row": "energy",
  "duration": 7.68,
  "disp": "如果感應的磁力反而幫磁鐵前進，電能跟磁鐵的動能就會一起憑空變多，那就變成永動機了，這不可能。",
  "en": "If the induced force helped the magnet along, electrical energy and the magnet’s kinetic energy would both grow out of nothing. That would be a perpetual motion machine. Impossible."
 },
 {
  "id": "Q44_12",
  "row": "trick",
  "duration": 5.1,
  "disp": "秒殺口訣：來者推、去者拉，這題的磁力都跟磁鐵的運動方向相反。",
  "en": "The quick rule: push what comes, pull what goes. Here the magnetic force always opposes the magnet’s motion."
 }
];
/* tracks:end */
