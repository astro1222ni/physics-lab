/* 113 學測第 45 題：感應電流的大小（多選 BD，全對 48%）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const IMAX=-P.current(3);
  const ids=Array.from({length:10},(_,i)=>'Q45_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function shares(g,k){const Q=ExamPaper.questions[45],L='ABCDE';
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*2.2*seg(k,0,.6),col='BD'.includes(L[j])?C.green:C.red;
      box(g,x,214-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,236,C.white,16,'center');if(k>.4)label(g,v+'%',x+23,206-hh,col,15,'center');});}
  // 電流－時間小圖：每條 [opt, 顏色, 名稱]；縱軸以基準情況的峰值為 1
  function plot(g,box8,lines,upto=12){const {x,y,w,h}=box8,X=t=>x+t/12*w,Y=v=>y-v/IMAX*(h/2)/2.2;
    arrow(g,x,y,x+w+8,y,C.faint,1.5,7);arrow(g,x,y+h/2,x,y-h/2-8,C.faint,1.5,7);label(g,'I',x+6,y-h/2-2,C.faint,13);label(g,'t',x+w+4,y+16,C.faint,13);
    lines.forEach(([opt,col,name],j)=>{D.curve(g,t=>clamp(P.current(t,opt),-2.4*IMAX,2.4*IMAX),0,upto,X,Y,col,2.2,j?[6,4]:[],400);if(name)label(g,name,x+w,y-h/2+16+j*20,col,13,'right');});
    return {X,Y};}
  const peak=opt=>{let m=0;for(let t=0;t<=12;t+=.01)m=Math.max(m,Math.abs(P.current(t,opt)));return m;};
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    const B={x:40,y:130,w:390,h:200};
    switch(i){
      case 0:shares(g,k);label(g,T('全對 48%','48% got both'),440,30,C.gold,16,'right');return;
      case 1:{plot(g,B,[[{v:1},'#eef5f6',T('原本','Original')],[{v:2},C.red,T('變快','Faster')]]);label(g,T('C：變快 → 電流變小？','C: faster → smaller current?'),52,30,C.red,15);return;}
      case 2:{plot(g,B,[[{v:1},'#eef5f6',T('原本','Original')],[{v:2},C.gold,T('變快','Faster')]]);if(k>.3)label(g,T('同樣的變化、更短的時間 → 變化率大','Same change, shorter time → bigger rate'),52,30,C.gold,14);return;}
      case 3:{sci(g,'ε = N × ΔΦ ÷ Δt',230,80,C.gold,22,'center');if(k>.3)sci(g,'I = ε ÷ R',230,130,C.teal,22,'center');
        if(k>.6){D.chip(g,40,170,120,T('圈數 N','Turns N'),C.white,true);D.chip(g,170,170,120,T('變化率','Rate'),C.gold,true);D.chip(g,300,170,120,T('電阻 R','R'),C.teal,true);}return;}
      case 4:{const r=plot(g,B,[[{v:1},'#eef5f6',T('原本','Original')],[{v:2},C.green,T('變快','Faster')]]);const p1=peak({v:1}),p2=peak({v:2});
        if(k>.3){line(g,r.X(3),r.Y(-p1),r.X(3),r.Y(0),'#eef5f6',1.5,[4,3]);line(g,r.X(1.5),r.Y(-p2),r.X(1.5),r.Y(0),C.green,1.5,[4,3]);label(g,T('峰值 × ','Peak × ')+(p2/p1).toFixed(1),r.X(1.5)+8,r.Y(-p2)+14,C.green,14);}
        label(g,T('D：變快 → 電流變大','D: faster → bigger current'),52,30,C.green,15);return;}
      case 5:{const rb=52+28*ease(seg(k,0,.5));D.fig18(g,{t:2.9,rb,bx:330+(rb-52)*.4,flow:t*2});label(g,T('乙裡面沒有磁力線','No field lines through B'),452,36,C.white,14,'right');
        if(k>.5){sci(g,T('ΔΦ_{乙} = 0','ΔΦ_{B} = 0'),452,62,C.teal,15,'right');label(g,T('B 對：電流不變','B is right: same current'),452,236,C.green,14,'right');}return;}
      case 6:{const a=.55*(1+.5*ease(seg(k,0,.5)));D.fig18(g,{t:2.9,a,ra:62*(1+.25*ease(seg(k,0,.5))),flow:t*2});
        if(k>.4)label(g,T('A 錯：圈住的磁力線變了','A is wrong: the enclosed flux changes'),452,36,C.red,14,'right');return;}
      case 7:{plot(g,B,[[{turns:1},'#eef5f6',T('1 圈','1 turn')],[{turns:2},C.red,T('2 圈','2 turns')]]);if(k>.4)label(g,T('E 錯：總電動勢加倍、R 不變 → 電流加倍','E is wrong: twice the emf, same R → twice the current'),52,30,C.red,13);return;}
      case 8:label(g,T('答案 B、D','Answer: B and D'),230,130,C.green,30,'center');return;
      default:D.chip(g,40,60,380,T('電流看三件事','The current depends on three things'),C.gold,true);D.chip(g,40,110,120,T('圈數','Turns'),C.white,k>.2);D.chip(g,170,110,120,T('變多快','How fast'),C.gold,k>.35);D.chip(g,300,110,120,T('電阻','Resistance'),C.teal,k>.5);
        D.chip(g,40,170,380,T('只改乙，其他不變 → 電流不變','Change only B → no change in current'),C.green,k>.7);
    }
  }
  // 能動手：改速度、圈數、乙的大小，跟原本的電流曲線比；三樣都改過就完成
  function hands(g,s){const opt={v:s.v,turns:s.n};plot(g,{x:40,y:130,w:390,h:200},[[{v:1},'#eef5f6',T('原本','Original')],[opt,C.gold,T('現在','Now')]]);
    label(g,T('乙的面積 × ','Area of B × ')+s.b+T('（不影響）',' (no effect)'),52,30,C.faint,13);
    label(g,T('峰值電流 × ','Peak current × ')+(peak(opt)/peak({v:1})).toFixed(2),440,236,C.gold,15,'right');}
  ExamScene.add(45,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,v:1,n:1,b:1,changed:{}}),
    paint,
    preview(g){D.fig18(g,{t:0});label(g,T('哪些改變會影響電流？','What changes the current?'),452,36,C.faint,13,'right');},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;const mark2=k=>{s.changed[k]=true;if(s.changed.v&&s.changed.n&&s.changed.b)complete();};
      const a=range(T('磁鐵速度','Magnet speed'),10,30,10,v=>{s.v=v/10;a.val.textContent='× '+s.v.toFixed(1);mark2('v');});a.val.textContent='× 1.0';
      const b=range(T('圈數','Turns'),1,2,1,v=>{s.n=v;b.val.textContent=v+T(' 圈',' turns');mark2('n');});b.val.textContent='1'+T(' 圈',' turn');
      const c=range(T('乙的面積','Area of B'),10,30,10,v=>{s.b=(v/10).toFixed(1);c.val.textContent='× '+s.b;mark2('b');});c.val.textContent='× 1.0';
      return {};
    },
    read(s,output){output.textContent=T('峰值電流是原本的 ','Peak current: ')+(peak({v:s.v,turns:s.n})/peak({v:1})).toFixed(2)+T(' 倍',' × the original')+T('（速度 × ',' (speed × ')+s.v.toFixed(1)+T('、圈數 ',', turns ')+s.n+T('）',')');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(45,{groups:{wrong:["越快不是越小", "Faster is not smaller"],solve:["電流看三件事", "Three things set the current"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\Delta t\downarrow\ \Rightarrow\ \varepsilon\uparrow`,solve:String.raw`|I|=\dfrac{|\varepsilon|}{R}=\dfrac{N}{R}\left|\dfrac{\Delta\Phi}{\Delta t}\right|`,trick:String.raw`v\uparrow\Rightarrow I\uparrow,\quad N\times2\Rightarrow I\times2`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q45=[
 {
  "id": "Q45_01",
  "row": "wrong",
  "duration": 8.03,
  "disp": "這題全對 48%；B 有 67%、D 有 72% 的人勾，錯的選項各有 15% 到 18%。",
  "en": "48% got it fully right. B drew 67% and D 72%; each wrong choice drew 15% to 18%."
 },
 {
  "id": "Q45_02",
  "row": "wrong",
  "duration": 5.16,
  "disp": "C：磁鐵跑得比較快，作用時間比較短，電流就比較小？剛好相反。",
  "en": "C: the magnet goes faster, the interaction is shorter, so the current is smaller? Exactly backwards."
 },
 {
  "id": "Q45_03",
  "row": "wrong",
  "duration": 6.49,
  "disp": "同樣多的磁通量變化，在比較短的時間裡發生，變化率比較大，感應電動勢就比較大。",
  "en": "The same change in flux in less time means a bigger rate of change, so a bigger induced emf."
 },
 {
  "id": "Q45_04",
  "row": "solve",
  "duration": 6.88,
  "disp": "法拉第定律：感應電動勢等於圈數乘以磁通量的變化率；感應電動勢再除以電阻 R，就是電流。",
  "en": "Faraday’s law: the emf equals the number of turns times the rate of change of flux. Divide the emf by R to get the current."
 },
 {
  "id": "Q45_05",
  "row": "solve",
  "duration": 4.99,
  "disp": "D：同一個位置、迴路不變，磁鐵變快，磁通量變化率變大，電流變大。對。",
  "en": "D: at the same position with the same loop, a faster magnet means a bigger rate of change of flux, so a bigger current. Right."
 },
 {
  "id": "Q45_06",
  "row": "solve",
  "duration": 8.38,
  "disp": "B：題目說磁力線只穿過環圈甲，乙裡面根本沒有磁通量；乙再大，磁通量的變化還是零，電阻也還是 R，電流不變。對。",
  "en": "B: the field lines pass only through loop A, so loop B has no flux at all. Make B bigger and its flux change is still zero, the resistance is still R, and the current is unchanged. Right."
 },
 {
  "id": "Q45_07",
  "row": "solve",
  "duration": 6.08,
  "disp": "A：甲的面積變大，圈住的磁力線跟著變，磁通量就變了，不能保證電流不變。錯。",
  "en": "A: enlarging loop A changes which field lines it encloses, so the flux changes. The current is not guaranteed to stay the same. Wrong."
 },
 {
  "id": "Q45_08",
  "row": "solve",
  "duration": 6.69,
  "disp": "E：圈數加倍，每一圈都產生一份電動勢，總電動勢加倍；電阻還是 R，電流也加倍。錯。",
  "en": "E: doubling the turns means each turn adds its own emf, so the total doubles. With R unchanged, the current doubles too. Wrong."
 },
 {
  "id": "Q45_09",
  "row": "solve",
  "duration": 1.17,
  "disp": "答案 B、D。",
  "en": "The answer is B and D."
 },
 {
  "id": "Q45_10",
  "row": "trick",
  "duration": 7.11,
  "disp": "秒殺口訣：電流看三件事，圈數、磁通量變得多快、電阻；這題只改乙，其他都不變，電流就不變。",
  "en": "The quick rule: the current depends on the turns, how fast the flux changes and the resistance. Here only loop B changes, everything else stays, so the current stays."
 }
];
/* tracks:end */
