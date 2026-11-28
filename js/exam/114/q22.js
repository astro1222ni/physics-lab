/* 114 學測第 22 題：飛到火星的平均速率（單選 C，答對率 61%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg,sciText,sciHTML}=K, C=K.colors, P=ExamPhysics;
  Exam114.add(22,{
    lab:'doppler',labName:['都卜勒效應（下一題用到）','Doppler effect (used in question 23)'],
    group:['第 22–23 題題組','Passage for questions 22–23'],open:true,
    passage:Exam114.questions[23].passage,
    ask:[S`假設太空船飛行的距離與從火星傳訊到地球的距離大致相同，則該太空船的平均飛行速率約為多少？（真空中的光速約為 \(3\times10^{8}\ \mathrm{m/s}\)）`,S`Assume the distance the spacecraft flies is about the same as the distance a signal travels from Mars to Earth. About what is the spacecraft’s average speed? (Speed of light in vacuum \(\approx3\times10^{8}\ \mathrm{m/s}\).)`],
    choices:['10','10^{2}','10^{4}','10^{6}','10^{8}'].map(v=>[S`\(`+v+S`\ \mathrm{m/s}\)`,S`\(`+v+S`\ \mathrm{m/s}\)`]),
    key:'C',rate:61,shares:[3,9,61,18,9],
    hint:['距離：電磁波跑 10 分鐘的路。時間：200 天。兩個時間都要換成「秒」。','Distance: how far light goes in 10 minutes. Time: 200 days. Put both times in seconds.'],
    hands:['換算天數與光分鐘','Days and light-minutes'],mid:'path',
    caption:['電磁波 10 分鐘的路，太空船飛 200 天','Light covers it in 10 minutes; the spacecraft takes 200 days'],
    focus:/分鐘|秒|60 倍|光速|距離|平均速率|路徑長|位移|子彈|3 萬倍|數量級|86400|minutes?|seconds?|60 times|speed of light|distance|average speed|path length|displacement|bullet|30,000|order of magnitude/i,
    groups:{wrong:['只換到分鐘','Stopped at minutes'],solve:['距離與時間','Distance and time'],path:['速率還是速度','Speed or velocity'],feel:['這有多快','How fast is that'],trick:['一天約 8.64 萬秒','A day is 86,400 s']},
    board:{wrong:S`200\times24\times60=2.88\times10^{5}\;?`,solve:S`d=ct,\quad v=\dfrac{d}{t}`,path:S`\dfrac{s}{\Delta t}\ \ge\ \dfrac{|\Delta\vec x|}{\Delta t}`,feel:S`v\approx1\times10^{4}\ \mathrm{m/s}`,trick:S`86400\ \mathrm s\approx10^{5}\ \mathrm s`},
    specific:{Q22_10:S`\dfrac{1.8\times10^{11}}{2.88\times10^{5}}\approx6\times10^{5}\to10^{6}\;(\mathrm D)`,Q22_12:S`d=3\times10^{8}\times600=1.8\times10^{11}\ \mathrm m`,Q22_13:S`t=200\times24\times3600\approx1.7\times10^{7}\ \mathrm s`,Q22_14:S`v=\dfrac{1.8\times10^{11}}{1.7\times10^{7}}\approx1\times10^{4}\ \mathrm{m/s}\quad\boxed{C}`,Q22_24:S`200\times10^{5}\ \mathrm s=2\times10^{7}\ \mathrm s`}
  });
  function mars(g,x,y,r){
    const grad=g.createRadialGradient(x-r*.4,y-r*.4,r*.1,x,y,r);grad.addColorStop(0,'#ffb48a');grad.addColorStop(.6,'#c9563a');grad.addColorStop(1,'#5a1d14');
    g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle=grad;g.fill();
  }
  function signal(g,x0,x1,y,t,color=C.teal){
    g.beginPath();for(let x=x0;x<=x1;x+=2){const yy=y+Math.sin((x-t*60)/7)*4;x===x0?g.moveTo(x,yy):g.lineTo(x,yy);}g.strokeStyle=color;g.lineWidth=1.6;g.stroke();
  }
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){
      label(g,T('選 D 的算法','How choice D happens'),20,34,C.red,17);
      sci(g,T('200 天 × 24 × 60 = 2.88×10^{5} 分','200 d × 24 × 60 = 2.88×10^{5} min'),26,82,C.white,19);
      if(id==='Q22_09'&&k>.45||id==='Q22_10'){label(g,T('忘了再 × 60 變成秒','forgot × 60 to get seconds'),26,120,C.red,18);}
      if(id==='Q22_10'){sci(g,'v = 1.8×10^{11} ÷ 2.88×10^{5} ≈ 6×10^{5}',26,170,C.gold,18);if(k>.4){sci(g,T('→ 10^{6}（D），大了 60 倍','→ 10^{6} (D), 60 times too big'),26,210,C.red,18);mark(g,360,204,false,10);}}
      return;
    }
    if(r==='solve'){
      K.earth(g,38,58,20);mars(g,422,58,14);signal(g,62,404,58,s.t,C.teal);
      label(g,T('地球','Earth'),38,100,C.faint,13,'center');label(g,T('火星','Mars'),422,100,C.faint,13,'center');
      label(g,T('10 分鐘 = 600 s','10 min = 600 s'),230,40,C.teal,15,'center');
      if(id==='Q22_11'){label(g,T('先算距離','Distance first'),230,160,C.gold,24,'center');return;}
      sci(g,'d = c t = 3×10^{8} × 600',24,140,C.white,18);sci(g,'= 1.8×10^{11} m',60,170,id==='Q22_12'?C.gold:C.white,19);
      if(id==='Q22_12')return;
      sci(g,T('t = 200×24×3600 ≈ 1.7×10^{7} s','t = 200×24×3600 ≈ 1.7×10^{7} s'),24,206,id==='Q22_13'?C.gold:C.white,17);
      if(id==='Q22_13')return;
      sci(g,'v = d ÷ t ≈ 1×10^{4} m/s',24,240,C.green,19);if(k>.6){label(g,T('答案 C','Answer C'),330,240,C.green,18);mark(g,422,234,true,10);}
      return;
    }
    if(r==='path'){
      K.earth(g,60,170,20);mars(g,400,90,14);
      line(g,60,170,400,90,C.faint,2,[6,4]);label(g,T('位移','displacement'),236,152,C.faint,15,'center');
      const t=id==='Q22_15'?0:id==='Q22_16'?seg(k,0,.8):1;
      g.beginPath();for(let i=0;i<=60*t;i++){const u=i/60,x=60+340*u,y=170-80*u-Math.sin(Math.PI*u)*95;i?g.lineTo(x,y):g.moveTo(x,y);}g.strokeStyle=C.gold;g.lineWidth=3;g.stroke();
      if(t>.98)label(g,T('路徑長','path length'),230,92,C.gold,17,'center');
      if(id!=='Q22_15')sci(g,T('路徑長 ≥ |位移|','path ≥ |displacement|'),20,232,C.white,17);
      if(id==='Q22_17'){sci(g,T('速率 = 路徑長 ÷ t','speed = path ÷ t'),250,214,C.gold,15);sci(g,T('速度 = 位移 ÷ t','velocity = displacement ÷ t'),250,240,C.faint,15);}
      return;
    }
    if(r==='feel'){
      const X=v=>30+(Math.log10(v)-2)*58;line(g,X(100),196,X(1e9),196,C.white,2);
      for(let e=2;e<=9;e++){line(g,X(10**e),190,X(10**e),202,C.white,1.5);sci(g,'10^{'+e+'}',X(10**e),222,C.faint,13,'center');}
      label(g,'m/s',448,244,C.faint,13,'right');
      for(const [v,zh,en,c,y] of [[1e3,'步槍子彈','rifle bullet',C.faint,150],[1.04e4,'太空船','spacecraft',C.gold,110],[3e8,'光','light',C.teal,150]]){line(g,X(v),y+8,X(v),190,c,1.5,[3,3]);K.dot(g,X(v),196,6,c);label(g,T(zh,en),X(v),y,c,16,'center');}
      if(k>.3&&id==='Q22_20'){label(g,'× 10',(X(1e3)+X(1.04e4))/2,180,C.gold,14,'center');label(g,T('÷ 3 萬','÷ 30,000'),(X(1.04e4)+X(3e8))/2,180,C.teal,14,'center');}
      if(id==='Q22_21'){box(g,X(1.04e4)-24,36,190,40,10,'#ffd17e22','#ffd17e');label(g,T('我真的盡力了……','I really tried…'),X(1.04e4)-12,62,C.gold,17);}
      return;
    }
    if(r==='trick'){
      label(g,T('秒殺：估數量級','Shortcut for orders of magnitude'),20,34,C.gold,18);
      sci(g,T('1 天 = 86400 s ≈ 10^{5} s','1 day = 86400 s ≈ 10^{5} s'),26,86,C.white,22);
      if(id!=='Q22_23')sci(g,T('200 天 ≈ 2×10^{7} s','200 days ≈ 2×10^{7} s'),26,130,C.white,22);
      if(id==='Q22_25'){box(g,20,160,420,62,10,'#ff8a8022','#ff8a80');label(g,T('只能估數量級！','Only for orders of magnitude!'),34,186,C.red,17);label(g,T('要兩位有效數字 → 乘 86400','Need 2 sig. figs → use 86400'),34,212,C.white,16);}
      return;
    }
  }
  // 能動手的圖
  function hands(g,s){
    const {distance,time,speed}=P.trip(s.lm,s.days),v=s.minutes?speed*60:speed;
    K.earth(g,32,52,16);mars(g,250,52,11);signal(g,52,236,52,s.phase,C.teal);label(g,s.lm+T(' 光分鐘',' light-min'),144,30,C.teal,14,'center');
    line(g,270,16,270,234,'#35505f');
    sci(g,'d = '+sciText(distance)+' m',20,104,C.white,16);
    sci(g,'t = '+(s.minutes?sciText(s.days*1440)+T(' 分（錯）',' min (wrong)'):sciText(time)+' s'),20,136,s.minutes?C.red:C.white,16);
    sci(g,'v = '+sciText(v)+' m/s',20,176,C.gold,20);
    sci(g,T('數量級 10^{','order 10^{')+P.magnitude(v)+'}',20,212,P.magnitude(v)===4?C.green:C.red,17);
    const X=e=>284+(e-2)*22;line(g,X(2),200,X(9),200,C.faint,1.5);for(let e=2;e<=9;e++){line(g,X(e),195,X(e),205,C.faint,1);sci(g,'10^{'+e+'}',X(e),222,C.faint,10,'center');}
    K.dot(g,X(Math.log10(v)),200,6,C.gold);label(g,T('子彈','bullet'),X(3),182,C.faint,11,'center');label(g,T('光','light'),X(8.48),182,C.teal,11,'center');
  }
  ExamScene.add(22,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,lm:10,days:200,minutes:false,phase:0,seen:false}),
    paint,
    preview(g){
      K.stars(g);K.earth(g,60,106,40);mars(g,402,106,26);signal(g,106,372,106,0,C.teal);
      g.save();g.translate(190,162);g.scale(1.4,1.4);g.translate(-190,-162);K.spacecraft(g,190,162);g.restore();arrow(g,222,162,318,162,C.gold,2.5,11);
      label(g,T('電磁波約 10 分鐘','Signal ≈ 10 minutes'),238,72,C.teal,21,'center');label(g,T('太空船約 200 天','Spacecraft ≈ 200 days'),238,208,C.gold,21,'center');
      sci(g,'c ≈ 3×10^{8} m/s',238,240,C.faint,18,'center');
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,toggle,complete,render}){
      s.hands=true;
      const check=()=>{if(s.seen&&!s.minutes&&P.magnitude(P.trip(s.lm,s.days).speed)===4)complete();};
      range(T('傳訊時間（光分鐘）','Signal time (light-minutes)'),3,22,10,v=>{s.lm=v;check();});
      range(T('飛行天數','Flight days'),100,400,200,v=>{s.days=v;check();});
      toggle('只換成分鐘（選 D）','Minutes only (choice D)',v=>{s.minutes=v;if(v)s.seen=true;check();});
      return {};
    },
    read(s,output){const {distance,time,speed}=P.trip(s.lm,s.days);output.innerHTML='v = d ÷ t = '+sciHTML(distance)+' m ÷ '+(s.minutes?sciHTML(s.days*1440)+' min':sciHTML(time)+' s')+' = <b>'+sciHTML(s.minutes?speed*60:speed)+(s.minutes?'':' m/s')+'</b>';}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q22=[
 {
  "id": "Q22_09",
  "row": "wrong",
  "duration": 5.86,
  "disp": "選 D 的人，常常是把 200 天換成分鐘就停了，忘了再乘 60 變成秒。",
  "en": "Those who chose D often turned 200 days into minutes and stopped, forgetting to multiply by 60 for seconds."
 },
 {
  "id": "Q22_10",
  "row": "wrong",
  "duration": 5.43,
  "disp": "分鐘拿來除，答案就大了 60 倍，剛好跑到 \\(10^{6}\\)。",
  "en": "Divide by minutes and the answer is 60 times too big, landing right on \\(10^{6}\\)."
 },
 {
  "id": "Q22_11",
  "row": "solve",
  "duration": 1.17,
  "disp": "先算距離。",
  "en": "First, the distance."
 },
 {
  "id": "Q22_12",
  "row": "solve",
  "duration": 10.94,
  "disp": "因為電磁波在真空中跑光速，所以距離等於光速乘以時間：\\(3\\times10^{8}\\)，乘以 600 秒，等於 \\(1.8\\times10^{11}\\) 公尺。",
  "en": "Electromagnetic waves travel at light speed in a vacuum, so distance is light speed times time: \\(3\\times10^{8}\\) × 600 s = \\(1.8\\times10^{11}\\) m."
 },
 {
  "id": "Q22_13",
  "row": "solve",
  "duration": 7.51,
  "disp": "再算時間：200 天，每天 24 小時、每小時 3600 秒，大約 \\(1.7\\times10^{7}\\) 秒。",
  "en": "Then the time: 200 days, 24 hours a day, 3,600 seconds an hour, about \\(1.7\\times10^{7}\\) seconds."
 },
 {
  "id": "Q22_14",
  "row": "solve",
  "duration": 6.55,
  "disp": "平均速率等於路徑長除以時間：大約 \\(1\\times10^{4}\\) 公尺每秒，答案 C。",
  "en": "Average speed is path length over time: about \\(1\\times10^{4}\\) m/s. The answer is C."
 },
 {
  "id": "Q22_15",
  "row": "path",
  "duration": 1.58,
  "disp": "這裡用詞要小心。",
  "en": "Careful with the wording here."
 },
 {
  "id": "Q22_16",
  "row": "path",
  "duration": 4.41,
  "disp": "第 14 課我講過，路徑長一定大於等於位移的量值。",
  "en": "In lesson 14 I said: path length is always greater than or equal to the magnitude of displacement."
 },
 {
  "id": "Q22_17",
  "row": "path",
  "duration": 9.07,
  "disp": "平均速率用路徑長除以時間，平均速度用位移除以時間；題目問的是速率，所以用太空船實際飛過的距離。",
  "en": "Average speed is path length over time; average velocity is displacement over time. It asks for speed, so use the distance the spacecraft actually flew."
 },
 {
  "id": "Q22_20",
  "row": "feel",
  "duration": 6.61,
  "disp": "每秒 1 萬公尺，大概是步槍子彈的 10 倍快；可是跟光比，還是慢了 3 萬倍。",
  "en": "10,000 m/s is about 10 times as fast as a rifle bullet; next to light, it's still 30,000 times slower."
 },
 {
  "id": "Q22_21",
  "row": "feel",
  "duration": 2.21,
  "disp": "太空船表示：我真的盡力了。",
  "en": "The spacecraft says: I really did my best."
 },
 {
  "id": "Q22_23",
  "row": "trick",
  "duration": 5.34,
  "disp": "秒殺：一天大約 8 萬 6 千秒，估數量級就當成 \\(10^{5}\\)。",
  "en": "The shortcut: a day is about 86,400 seconds; for an order-of-magnitude estimate, call it \\(10^{5}\\)."
 },
 {
  "id": "Q22_24",
  "row": "trick",
  "duration": 4.57,
  "disp": "200 天就是 \\(2\\times10^{7}\\) 秒，一除就出來。",
  "en": "200 days is then \\(2\\times10^{7}\\) seconds; one division and you're done."
 },
 {
  "id": "Q22_25",
  "row": "trick",
  "duration": 7.67,
  "disp": "注意喔，這是估數量級才能這樣抄；題目要兩位有效數字，就要乘實在的 86400。",
  "en": "Careful: this shortcut is only for estimating orders of magnitude; if the question wants 2 significant figures, multiply by the real 86,400."
 }
];
/* tracks:end */
