/* 113 學測第 26 題：安全氣囊的壓力門檻（單選 C）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const BOX={x:56,y:212,w:300,h:170};
  const ids=Array.from({length:8},(_,i)=>'Q26_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function shares(g,k){const Q=ExamPaper.questions[26],L='ABCDE',V=['10','20','30','40','50'];
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*2*seg(k,0,.6),col=L[j]==='C'?C.green:'DE'.includes(L[j])?C.red:'#5f7480';
      box(g,x,200-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,222,C.white,16,'center');label(g,V[j]+' ms',x+23,242,C.faint,12,'center');if(k>.4)label(g,v+'%',x+23,192-hh,col,15,'center');});}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:shares(g,k);label(g,T('D、E 各 9%','D and E: 9% each'),440,30,C.red,16,'right');return;
      case 1:{const {X,Y}=D.fig9(g,{box:BOX});const u=seg(k,.1,.6);line(g,X(0),BOX.y+2,X(80),BOX.y+2,'#ff8a80',3);if(u>0){line(g,X(40),BOX.y-8,X(40),BOX.y+8,C.red,3);label(g,'80 ÷ 2 = 40 ms',X(40),BOX.y-14,C.red,14,'center');}
        if(k>.55){label(g,T('一半的是壓力，','Half of the PRESSURE,'),452,60,C.white,14,'right');label(g,T('不是時間','not the time'),452,82,C.red,14,'right');mark(g,420,120,false,12);}return;}
      case 2:{const {X,Y}=D.fig9(g,{box:BOX});const p50=P.pressure(50);line(g,X(50),BOX.y,X(50),Y(p50),C.red,2,[5,4]);K.dot(g,X(50),Y(p50),5,C.red);label(g,'50 ms',X(50)+4,BOX.y-6,C.red,14);
        label(g,T('早就超過一半','already past half'),452,60,C.red,14,'right');if(k>.4){label(g,T('「至少」：找最早','“At least”: the earliest'),452,96,C.gold,14,'right');label(g,T('達到的時間','time it is reached'),452,118,C.gold,14,'right');}return;}
      case 3:{const {X,Y}=D.fig9(g,{box:BOX});const u=ease(seg(k,0,.6));line(g,X(0),Y(P.SAT),X(80*u),Y(P.SAT),C.gold,2.4,[6,4]);if(u>.9)label(g,'≈ 260 kPa',X(0)+6,Y(P.SAT)-8,C.gold,15);
        label(g,T('最後平平的','Where it levels off'),452,150,C.gold,14,'right');return;}
      case 4:{const p=P.SAT/2,u=seg(k,0,.8);const {X,Y}=D.fig9(g,{box:BOX});const tt=P.timeFor(p);
        line(g,X(0),Y(p),X(tt*clamp(u*2,0,1)),Y(p),C.gold,2,[5,4]);if(u>.5)line(g,X(tt),Y(p),X(tt),Y(p)+(BOX.y-Y(p))*clamp(u*2-1,0,1),C.gold,2,[5,4]);
        label(g,'130 kPa',X(0)+6,Y(p)-6,C.gold,14);sci(g,'260 ÷ 2 ≈ 130',452,60,C.gold,15,'right');return;}
      case 5:{D.fig9(g,{box:BOX,p:P.SAT/2});label(g,T('約 30 ms','About 30 ms'),452,70,C.green,18,'right');label(g,T('答案 C','Answer: C'),452,110,C.green,18,'right');return;}
      case 6:{const bar=(y,ms,col,txt)=>{const w=ms/150*300*seg(k,0,.7);box(g,120,y,Math.max(2,w),26,6,col+'aa',col);label(g,txt,110,y+18,col,15,'right');label(g,ms+' ms',126+Math.max(2,w),y+18,C.white,14);};
        bar(80,30,C.gold,T('安全氣囊','Airbag'));bar(140,120,'#7fb6ff',T('眨一下眼','A blink'));label(g,T('眨眼大約 100–150 ms','A blink: about 100–150 ms'),230,220,C.faint,13,'center');return;}
      default:D.chip(g,40,70,380,T('題目說一半的是什麼？','What does the question halve?'),C.gold,true);D.chip(g,40,120,380,T('就在那個軸上取一半','Halve it on that axis'),C.teal,k>.3);D.chip(g,40,170,380,T('再讀另一個軸','Then read the other axis'),C.green,k>.6);
    }
  }
  // 能動手：拉壓力游標，讀出時間；拉到飽和壓力的一半（125–137 kPa）就完成
  function hands(g,s){D.fig9(g,{box:BOX,p:s.p,color:Math.abs(s.p-P.SAT/2)<=6?C.green:C.gold});
    label(g,T('飽和約 262 kPa','Saturation ≈ 262 kPa'),452,40,C.faint,13,'right');label(g,(s.p/P.SAT*100).toFixed(0)+'% '+T('飽和','of saturation'),452,64,C.white,15,'right');}
  ExamScene.add(26,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,p:200}),
    paint,
    preview(g){D.fig9(g,{box:{...BOX,y:BOX.y-12}});label(g,T('圖 9','Figure 9'),452,40,C.faint,14,'right');},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;const r=range(T('壓力','Pressure'),10,260,200,v=>{s.p=v;r.val.textContent=v+' kPa';if(v>=125&&v<=137)complete();});r.val.textContent='200 kPa';return {};
    },
    read(s,output){output.textContent=s.p+' kPa → '+P.timeFor(s.p).toFixed(0)+' ms'+(Math.abs(s.p-P.SAT/2)<=6?T('：這就是飽和壓力的一半',': that is half the saturation pressure'):'');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(26,{groups:{wrong:["取一半的是壓力", "Halve the pressure, not the time"],solve:["橫著讀、往下讀", "Read across, then down"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\dfrac{80}{2}\ \text{ms}\ \ \times`,solve:String.raw`P_{\text{sat}}\approx260\,\text{kPa}\ \Rightarrow\ \tfrac12P\approx130\,\text{kPa}\ \Rightarrow\ t\approx30\,\text{ms}`,trick:String.raw`P\ \to\ t`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q26=[
 {
  "id": "Q26_01",
  "row": "wrong",
  "duration": 5.37,
  "disp": "這題 77% 的人答對，錯的人大多選 D 或 E，各 9%。",
  "en": "77% got this right. Most of the rest chose D or E, 9% each."
 },
 {
  "id": "Q26_02",
  "row": "wrong",
  "duration": 7.39,
  "disp": "D 是 40 毫秒，很像把橫軸 80 毫秒直接砍一半；可是題目要取一半的，是壓力，不是時間。",
  "en": "D, 40 ms, looks like halving the 80 ms axis. But the question halves the pressure, not the time."
 },
 {
  "id": "Q26_03",
  "row": "wrong",
  "duration": 6.22,
  "disp": "E 是 50 毫秒，那時候早就超過一半了；可是題目問「至少」要多久，要找最早達到的那個時間。",
  "en": "E, 50 ms, is well past half by then. But the question asks for the least time, so find the earliest moment it gets there."
 },
 {
  "id": "Q26_04",
  "row": "solve",
  "duration": 4.59,
  "disp": "先找飽和壓力：曲線最後平平的，大約 260 kPa。",
  "en": "First find the saturation pressure: the curve levels off at about 260 kPa."
 },
 {
  "id": "Q26_05",
  "row": "solve",
  "duration": 7.38,
  "disp": "一半大約 130 kPa。從縱軸 130 橫著畫過去，碰到曲線，再往下看時間。",
  "en": "Half is about 130 kPa. Draw across from 130 on the vertical axis to the curve, then read down to the time."
 },
 {
  "id": "Q26_06",
  "row": "solve",
  "duration": 2.36,
  "disp": "大約 30 毫秒，答案 C。",
  "en": "About 30 ms. The answer is C."
 },
 {
  "id": "Q26_07",
  "row": "solve",
  "duration": 4.2,
  "disp": "你看安全氣囊多拚，30 毫秒，比你眨一下眼睛還快。",
  "en": "Look how hard the airbag works: 30 ms, faster than a blink."
 },
 {
  "id": "Q26_08",
  "row": "trick",
  "duration": 4.78,
  "disp": "秒殺口訣：題目說一半的是什麼，就在那個軸上取一半，再讀另一個軸。",
  "en": "The quick rule: halve whichever quantity the question halves, on its own axis, then read the other axis."
 }
];
/* tracks:end */
