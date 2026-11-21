/* 113 學測第 46 題：畫出離開時的應電流（非選）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const FB={x:40,y:150,w:390,h:150};
  const ids=Array.from({length:10},(_,i)=>'Q46_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function tag9(g,X,b,k=1){const x=X(9);arrow(g,x+60,b.y-b.h/2-8,x+4,b.y-b.h/2+16,C.gold,2,9);label(g,T('N 極恰脫離環圈甲中心','N pole just leaves the centre of A'),Math.min(452,x+64),b.y-b.h/2-12,C.gold,13,'right');}
  // 磁鐵時間軸：t 秒時磁鐵在哪（小圖，橫放）
  function strip(g,x,y,w,t){line(g,x,y,x+w,y,C.faint,1);const X=tt=>x+tt/12*w;for(const tt of [0,3,6,9,12]){line(g,X(tt),y-4,X(tt),y+4,C.faint,1);label(g,tt+' s',X(tt),y+18,C.faint,12,'center');}
    for(const [tt,txt,col] of [[3,T('S 到中心','S at centre'),'#9cc7ef'],[6,T('中心','Middle'),C.white],[9,T('N 到中心','N at centre'),'#ffb3a1']])label(g,txt,X(tt),y-10,col,12,'center');
    if(t!=null)K.dot(g,X(t),y,5,C.gold);}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:{D.fig19(g,{box:FB,upto:6});label(g,T('題目給 0–6 s，畫出 6–12 s','Given 0–6 s; draw 6–12 s'),452,36,C.gold,14,'right');return;}
      case 1:{const r=D.fig19(g,{box:FB,upto:6*seg(k,0,.8)});if(k>.6){K.dot(g,r.X(3),r.Y(P.current(3)),5,'#ff9f8a');label(g,T('3 s 最負','Most negative at 3 s'),r.X(3)+8,r.Y(P.current(3))+4,'#ff9f8a',13);}return;}
      case 2:{const r=D.fig19(g,{box:FB,upto:6,ghost:k>.3});label(g,T('等速、兩端對稱：倒著放、方向相反','Steady and symmetric: played backwards, reversed'),452,36,C.teal,13,'right');return;}
      case 3:{const u=6+6*ease(seg(k,0,.8)),r=D.fig19(g,{box:FB,upto:u});K.dot(g,r.X(6),FB.y,5,C.gold);if(k>.6)label(g,T('以 (6 s, 0) 為中心點對稱','Point-symmetric about (6 s, 0)'),452,36,C.gold,14,'right');return;}
      case 4:{strip(g,40,120,390,12*((t*.12)%1));label(g,T('半根磁鐵走 3 秒','Half the magnet passes in 3 s'),230,200,C.white,15,'center');return;}
      case 5:{const r=D.fig19(g,{box:FB,upto:12});tag9(g,r.X,FB);K.dot(g,r.X(9),r.Y(P.current(9)),5,C.gold);return;}
      case 6:{D.fig18(g,{t:9.4,flow:t*2,showI:false});label(g,T('離開：磁通量變少','Leaving: flux falls'),452,40,C.teal,14,'right');if(k>.4)label(g,T('冷次定律：少了就補','Lenz: make up what is lost'),452,66,C.gold,14,'right');return;}
      case 7:{D.fig18(g,{t:k<.45?2.9:9.1,flow:t*2});label(g,k<.45?T('進來：負（順時針）','In: negative (clockwise)'):T('出去：正（逆時針）','Out: positive (counterclockwise)'),452,40,k<.45?'#ff9f8a':C.teal,15,'right');return;}
      case 8:{const r=D.fig19(g,{box:FB,upto:12});for(const tt of [2,3,4]){const a=r.X(tt),b=r.X(12-tt);line(g,a,r.Y(P.current(tt)),b,r.Y(P.current(12-tt)),'#ffffff33',1,[3,3]);}
        label(g,T('對稱位置：變化率大小相等、正負相反','Mirror times: same size, opposite sign'),452,36,C.white,13,'right');return;}
      default:D.chip(g,40,60,180,T('進來負','In: negative'),'#ff9f8a',true);D.chip(g,240,60,180,T('出去正','Out: positive'),C.teal,k>.2);
        D.chip(g,40,115,380,T('對中心點對稱','Point-symmetric about the centre'),C.gold,k>.45);D.chip(g,40,170,380,T('尖峰在磁極經過中心時','Peaks when a pole passes the centre'),C.white,k>.7);
    }
  }
  // 能動手：拉時間播放磁鐵穿過，曲線跟著畫；在你認為「N 極恰脫離環圈甲中心」的時刻按「標記」
  function hands(g,s){const r=D.fig19(g,{box:{x:40,y:70,w:390,h:100},upto:Math.max(6,s.t)});line(g,r.X(s.t),20,r.X(s.t),120,C.gold,1.5,[4,3]);
    if(s.mark!=null){const ok=Math.abs(s.mark-9)<=.3;arrow(g,r.X(s.mark),26,r.X(s.mark),58,ok?C.green:C.red,2,9);label(g,s.mark.toFixed(1)+' s',r.X(s.mark)+6,34,ok?C.green:C.red,13);}
    strip(g,40,214,390,s.t);}
  ExamScene.add(46,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,mark:null}),
    paint,
    preview(g){D.fig19(g,{box:FB,upto:6});label(g,T('圖 19（0–6 s）','Figure 19 (0–6 s)'),452,36,C.faint,13,'right');},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,btn,complete}){
      s.hands=true;const r=range(T('時間','Time'),0,120,60,v=>{s.t=v/10;r.val.textContent=s.t.toFixed(1)+' s';});r.val.textContent='6.0 s';s.t=6;
      btn(T('在這裡標記','Mark here'),()=>{s.mark=s.t;if(Math.abs(s.t-9)<=.3)complete();});return {};
    },
    read(s,output){const I=P.current(s.t),Imax=-P.current(3);output.textContent=s.t.toFixed(1)+' s：'+(Math.abs(I)/Imax<.02?T('電流幾乎是零','almost no current'):(I>0?T('正（逆時針）','positive (counterclockwise)'):T('負（順時針）','negative (clockwise)')))+(s.mark!=null?(Math.abs(s.mark-9)<=.3?T('　標對了：9 s','　Correct mark: 9 s'):T('　再找找：尖峰在哪？','　Try again: where is the peak?')):'');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(46,{groups:{solve:["出去跟進來點對稱", "Leaving mirrors entering"],why:["為什麼是正的", "Why it is positive"],mark:["標出 9 秒", "Mark 9 seconds"],trick:["口訣", "The rule"]},board:{solve:String.raw`I(6+\tau)=-I(6-\tau)`,why:String.raw`\Phi\downarrow\ \Rightarrow\ I>0\ \text{(CCW)}`,mark:String.raw`t=9\,\text{s}:\ N\ \text{leaves center}`,trick:String.raw`\text{point symmetry about }(6,\,0)`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q46=[
 {
  "id": "Q46_01",
  "row": "solve",
  "duration": 4.0,
  "disp": "這題是非選，統計表沒有列得分率，我們直接來畫。",
  "en": "This is a constructed-response item and the statistics list no score rate, so let’s just draw it."
 },
 {
  "id": "Q46_02",
  "row": "solve",
  "duration": 6.4,
  "disp": "0 到 6 秒，磁鐵 S 極從上面進來，電流是負的，在 3 秒左右最負，6 秒回到零。",
  "en": "From 0 to 6 s the magnet’s S pole comes in from above. The current is negative, most negative around 3 s, back to zero at 6 s."
 },
 {
  "id": "Q46_03",
  "row": "solve",
  "duration": 6.29,
  "disp": "磁鐵等速，而且兩端對稱；6 秒以後離開的過程，就是進來過程倒著放，方向相反。",
  "en": "The magnet moves at constant speed and its two ends are symmetric. Leaving after 6 s is entering played backwards, with the direction flipped."
 },
 {
  "id": "Q46_04",
  "row": "solve",
  "duration": 7.7,
  "disp": "所以 6 到 12 秒，畫一個正的尖峰，形狀跟前半段一樣，以 6 秒、電流為零的那一點為中心，點對稱。",
  "en": "So from 6 to 12 s draw a positive peak with the same shape, point-symmetric about the point at 6 s, zero current."
 },
 {
  "id": "Q46_05",
  "row": "mark",
  "duration": 5.92,
  "disp": "S 極在 3 秒到中心，磁鐵中心在 6 秒到中心，所以半根磁鐵走 3 秒。",
  "en": "The S pole reaches the center at 3 s and the magnet’s center at 6 s, so half a magnet takes 3 s."
 },
 {
  "id": "Q46_06",
  "row": "mark",
  "duration": 9.45,
  "disp": "再過 3 秒，也就是 9 秒，N 極剛好離開環圈中心；在 9 秒這裡畫箭頭、寫上「N 極恰脫離環圈甲中心」，電流的尖峰大約就在這裡。",
  "en": "Three seconds later, at 9 s, the N pole just leaves the loop’s center. Draw an arrow at 9 s labeled “N pole just leaves the center of loop A”; the current peak is about there."
 },
 {
  "id": "Q46_07",
  "row": "why",
  "duration": 5.47,
  "disp": "方向的理由：磁鐵離開，穿過環圈甲的磁通量變少；冷次定律，少了就補。",
  "en": "Why that direction: as the magnet leaves, the flux through loop A decreases. By Lenz’s law, a decrease gets made up."
 },
 {
  "id": "Q46_08",
  "row": "why",
  "duration": 8.87,
  "disp": "進來的時候磁通量變多，感應電流反抗，是負的；離開的時候磁通量變少，感應電流要補，方向反過來，變成逆時針，也就是正的。",
  "en": "On the way in the flux increases and the induced current opposes it: negative. On the way out the flux decreases and the current makes up for it, so it reverses to counterclockwise, which is positive."
 },
 {
  "id": "Q46_09",
  "row": "why",
  "duration": 6.47,
  "disp": "形狀的理由：等速、兩端對稱，對稱位置的磁通量一樣，變化率大小相等、正負相反。",
  "en": "Why that shape: constant speed and symmetric ends mean equal flux at mirror positions, so equal rates of change with opposite signs."
 },
 {
  "id": "Q46_10",
  "row": "trick",
  "duration": 7.05,
  "disp": "秒殺口訣：這題進來負、出去正，對中心點對稱，尖峰大約在磁極經過中心的時候。",
  "en": "The quick rule: here, in negative and out positive, symmetric about the center point, with the peaks about when a pole crosses the center."
 }
];
/* tracks:end */
