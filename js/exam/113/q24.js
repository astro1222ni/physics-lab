/* 113 學測第 24 題：冰箱的冷卻循環（多選 AC，全對 36%）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const COLD='#7fb6ff',HOT='#ff8a80';
  // 冰箱剖面：內室＋蒸發器（裡面上方）、壓縮機（右下）、背後散熱片（右側）、膨脹閥（右上）；冷媒小點沿迴路跑，顏色看溫度
  function fridge(g,x,y,w,h,t,o={}){
    const sh=g.createLinearGradient(x,y,x+w,y);sh.addColorStop(0,'#dfe7ec');sh.addColorStop(1,'#b9c6ce');
    box(g,x,y,w,h,10,sh,'#8fa1ab',1.5);box(g,x+8,y+10,w-40,h-60,6,'#cfe9f6','#9cc3d6',1);           // 內室
    box(g,x+8,y+h-44,w-40,34,6,'#9aa9b2','#7d8d97',1);label(g,T('食物','Food'),x+8+(w-40)/2,y+h-22,'#33464f',12,'center');
    if(o.door){g.save();g.globalAlpha=.9;box(g,x-o.door*w*.45,y+2,10+o.door*w*.42,h-4,8,'#e9eef2','#8fa1ab',1.5);g.restore();}
    const ex=x+w-14,P0=[[x+20,y+26],[x+w-52,y+26],[x+w-52,y+44],[x+20,y+44],[x+20,y+62],[x+w-52,y+62]],                  // 蒸發器
      P1=[[x+w-52,y+62],[ex,y+62],[ex,y+h-24]],P2=[[ex,y+h-24],[ex+16,y+h-24]],                                             // 到壓縮機
      coil=[];for(let i=0;i<=8;i++)coil.push([ex+16+(i%2?14:0),y+h-24-i*((h-40)/8)]);                                     // 散熱片
    const P3=[[ex+16,y+16],[x+w-60,y+8],[x+20,y+8],[x+20,y+26]];                                                           // 膨脹閥回到蒸發器
    const legs=[[P0,COLD],[P1,COLD],[P2,HOT],[coil,HOT],[P3,'#ffd17e']],segs=[];
    for(const [pts,col] of legs)for(let i=1;i<pts.length;i++)segs.push([pts[i-1],pts[i],col]);
    const L=segs.reduce((a,[p,q])=>a+Math.hypot(q[0]-p[0],q[1]-p[1]),0);
    for(const [p,q,col] of segs)line(g,p[0],p[1],q[0],q[1],col+'88',3);
    box(g,ex-8,y+h-34,26,22,5,'#36434c','#5c6c76',1.2);label(g,'M',ex+5,y+h-18,'#cfd8dd',11,'center');            // 壓縮機
    if(o.run!==false){const n=22;for(let j=0;j<n;j++){let d=((j/n+t*.08)%1)*L;for(const [p,q,col] of segs){const l=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<=l){const u=d/l,cx=p[0]+(q[0]-p[0])*u,cy=p[1]+(q[1]-p[1])*u;
      const c2=col===HOT?(cy<y+h*.45?'#ffb37a':HOT):col===COLD?COLD:'#ffd17e';K.dot(g,cx,cy,3,c2);break;}d-=l;}}}
    if(o.tags){label(g,T('壓縮機','Compressor'),ex+5,y+h+16,C.faint,12,'center');label(g,T('散熱片','Coils'),ex+38,y+h*.5,C.faint,12);label(g,T('蒸發器','Evaporator'),x+20,y+82,'#3b6c86',11);}
    return {ex,cx:x+w/2};
  }
  function therm(g,x,y,h,frac,col,txt){box(g,x-5,y,10,h,5,'#ffffff18','#ffffff55',1);const hh=clamp(frac,0,1)*(h-8);box(g,x-3,y+h-4-hh,6,hh,3,col);K.dot(g,x,y+h+6,8,col);if(txt)label(g,txt,x,y-8,col,14,'center');}
  function roomBox(g,x,y,w,h,sealed){box(g,x,y,w,h,8,'#ffffff08',sealed?'#c2a27a':'#ffffff33',sealed?9:1.5);if(sealed){label(g,T('密閉、隔熱','Sealed, insulated'),x+w/2,y-10,'#c2a27a',13,'center');}}
  const ids=Array.from({length:12},(_,i)=>'Q24_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function shares(g,k,hot,good){const Q=ExamPaper.questions[24],L='ABCDE';
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*2.2*seg(k,0,.6),col=good.includes(L[j])?C.green:hot.includes(L[j])?C.red:'#5f7480';
      box(g,x,214-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,236,C.white,16,'center');if(k>.4)label(g,v+'%',x+23,206-hh,col,15,'center');});}
  function flow(g,x1,y,x2,col,txt,on=true){if(!on)return;arrow(g,x1,y,x2,y,col,3,11);if(txt)label(g,txt,(x1+x2)/2,y-10,col,13,'center');}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:shares(g,k,'E','AC');label(g,T('E：冷媒比室溫低也能放熱？','E: cold refrigerant gives off heat?'),440,34,C.red,15,'right');return;
      case 1:{const hot=k>.45;box(g,40,70,130,90,12,(hot?HOT:COLD)+'33',hot?HOT:COLD,2);label(g,T('冷媒','Refrigerant'),105,100,hot?HOT:COLD,15,'center');label(g,hot?'50 °C':'5 °C',105,136,hot?HOT:COLD,22,'center');
        box(g,290,70,130,90,12,'#ffd17e22','#ffd17e',2);label(g,T('室內空氣','Room air'),355,100,'#ffd17e',15,'center');label(g,'26 °C',355,136,'#ffd17e',22,'center');
        if(hot){flow(g,180,115,280,HOT,T('熱','heat'));mark(g,230,190,true,12);label(g,T('先壓到比室溫熱，才放得出去','Compress it hotter than the room first'),230,232,C.green,14,'center');}
        else{flow(g,280,115,180,'#ffd17e',T('熱','heat'));label(g,T('熱只會自己往冷的跑','Heat flows only to the colder side'),230,232,C.white,14,'center');}return;}
      case 2:{fridge(g,60,40,180,180,t,{tags:true});box(g,62,48,170,44,8,'#7fb6ff22',COLD,2);
        label(g,T('D：低溫「高壓」？','D: cold and HIGH pressure?'),440,60,C.red,14,'right');if(k>.35){label(g,T('裡面吸熱時：','While absorbing heat inside:'),440,110,C.white,14,'right');label(g,T('已經降壓 → 低溫低壓','already depressurized: cold, low pressure'),440,134,COLD,14,'right');label(g,T('壓力低才會汽化吸熱','Low pressure lets it boil and absorb heat'),440,166,C.faint,13,'right');}return;}
      case 3:{const u=ease(seg(k,.1,.7)),px=90+70*u;box(g,60,80,200,80,8,'#ffffff10','#ffffff55',1.5);box(g,px,82,12,76,3,'#9aa9b2','#c8d2d8',1);line(g,px+12,120,300,120,'#9aa9b2',6);
        for(let j=0;j<18;j++){const xx=px+16+((j*37)%Math.max(8,(255-px-16))),yy=90+(j*23)%62;K.dot(g,xx,yy,3,u>.5?HOT:COLD);}
        therm(g,360,60,110,.2+.6*u,u>.5?HOT:COLD,u>.5?T('升溫','heats up'):'');label(g,T('B：壓縮會降溫？','B: compression cools?'),230,40,C.red,15,'center');
        if(k>.7)label(g,T('壓縮氣體，溫度升高','Compressing a gas raises its temperature'),230,226,C.white,14,'center');return;}
      case 4:{fridge(g,150,30,150,170,t,{tags:true});arrow(g,80,110,152,110,COLD,3,10);sci(g,T('Q_{C}（裡面的熱）','Q_{C} (heat inside)'),20,96,COLD,14);
        arrow(g,60,206,170,186,'#ffd17e',3,10);sci(g,T('W（電能）','W (electricity)'),20,226,'#ffd17e',14);
        arrow(g,350,110,440,110,HOT,3,11);sci(g,'Q_{H} = Q_{C} + W',452,94,HOT,15,'right');
        if(k>.5){mark(g,330,196,true,10);label(g,T('A 對','A is right'),350,202,C.green,15);}return;}
      case 5:{roomBox(g,30,40,400,190,false);fridge(g,190,90,120,130,t,{door:.8,run:true});for(let j=0;j<5;j++){const yy=110+j*20,xx=170-((t*30+j*17)%60);g.beginPath();g.arc(xx,yy,6,0,Math.PI*2);g.strokeStyle=COLD+'99';g.lineWidth=2;g.stroke();}
        label(g,T('打開冰箱門，房間會變涼？','Open the door: does the room cool?'),230,30,C.white,15,'center');label(g,'39% '+T('沒勾 C','missed C'),420,224,C.red,14,'right');return;}
      case 6:roomBox(g,40,50,380,170,true);fridge(g,200,100,110,110,t,{door:.8});for(const [x1,y1,x2,y2] of [[120,100,48,100],[260,90,260,58],[400,140,412,140]]){arrow(g,x1,y1,x2,y2,'#ffd17e',2.5,9);mark(g,x2,y2,false,8);}
        label(g,T('熱跑不出去','Heat cannot leave'),110,200,'#ffd17e',14,'center');return;
      case 7:{roomBox(g,40,50,380,170,true);fridge(g,180,96,110,114,t,{door:.8});const a=(t*.6)%1;
        arrow(g,150,150,175,150,COLD,3,10);sci(g,'Q_{C}',150,132,COLD,15,'center');arrow(g,300,150,360,150,HOT,3,10);sci(g,'Q_{H}',384,140,HOT,15,'center');
        g.beginPath();g.moveTo(370,170);g.quadraticCurveTo(250,240,140,170);g.strokeStyle='#ffffff55';g.setLineDash([5,5]);g.lineWidth=2;g.stroke();g.setLineDash([]);
        label(g,T('從房間搬走，又丟回同一個房間','Taken from the room, dumped back into it'),230,240,C.white,14,'center');return;}
      case 8:{roomBox(g,40,50,300,170,true);fridge(g,140,96,110,114,t,{door:.8});box(g,60,170,40,30,5,'#36434c','#5c6c76');arrow(g,80,170,140,150,'#ffd17e',3,10);sci(g,'W',70,160,'#ffd17e',16);
        const r=P.room(8*seg(k,0,.8));therm(g,390,70,120,(r.T-24)/6,HOT,r.T.toFixed(1)+' °C');label(g,T('電能 → 熱，留在房間','Electrical energy → heat, stays'),190,240,HOT,14,'center');
        if(k>.85)label(g,T('答案 A、C','Answer: A and C'),390,236,C.green,15,'center');return;}
      case 9:{box(g,40,70,120,90,12,HOT+'33',HOT,2);label(g,T('高溫','Hot'),100,122,HOT,18,'center');box(g,300,70,120,90,12,COLD+'33',COLD,2);label(g,T('低溫','Cold'),360,122,COLD,18,'center');
        arrow(g,170,100,290,100,'#ffd17e',3,11);label(g,T('自然而然','naturally'),230,88,'#ffd17e',13,'center');if(k>.4){arrow(g,290,140,170,140,C.white,3,11);label(g,T('違反自然：要付代價','Against nature: there is a price'),230,176,C.white,14,'center');}return;}
      case 10:{box(g,150,60,160,110,14,'#0b2233','#35505f',2);label(g,T('電費單','Electricity bill'),230,92,C.faint,14,'center');label(g,'NT$ '+Math.round(300+400*seg(k,0,.8)),230,138,'#ffd17e',26,'center');
        label(g,T('冰箱付的代價','The price the fridge pays'),230,206,C.white,15,'center');return;}
      default:D.chip(g,40,70,380,T('冰箱在搬熱，不是在造冷','A fridge moves heat; it does not make cold'),C.teal,true);D.chip(g,40,130,380,T('搬熱要付電費','Moving heat costs electricity'),'#ffd17e',k>.4);
    }
  }
  // 能動手：密閉隔熱房間、冰箱開門插電；拉運轉時數，看室溫與三種能量
  function hands(g,s){const r=P.room(s.h,{on:s.on});roomBox(g,20,40,260,190,true);fridge(g,100,92,110,124,s.t,{door:.8,run:s.on});
    therm(g,312,60,130,(r.T-24)/8,HOT,r.T.toFixed(2)+' °C');label(g,T('平均室溫','Avg. room temp'),312,222,C.faint,12,'center');
    const bars=[['W',r.W,'#ffd17e'],['Q_{C}',r.Qc,COLD],['Q_{H}',r.Qh,HOT]],mx=P.room(24).Qh;
    bars.forEach(([n,v,col],j)=>{const y=70+j*46,w=v/mx*90;sci(g,n,350,y+14,col,15);box(g,350,y+20,90,10,4,'#ffffff12');if(w>0)box(g,350,y+20,w,10,4,col);label(g,(v/1e6).toFixed(1)+' MJ',448,y+14,C.white,12,'right');});}
  ExamScene.add(24,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,h:0,on:true}),
    paint,
    preview(g){K.boost(1.6,()=>{fridge(g,140,18,180,188,0,{tags:true});arrow(g,20,150,128,150,COLD,4,12);label(g,T('裡面的熱','Heat inside'),20,134,COLD,13);arrow(g,362,178,448,178,HOT,4,12);label(g,T('丟到外面','Heat out'),448,162,HOT,13,'right');});},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,toggle,complete,render}){
      s.hands=true;let raf=0;const tick=now=>{s.t=now/1000;render();raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);addEventListener('pagehide',()=>cancelAnimationFrame(raf));
      const r=range(T('運轉時間','Running time'),0,240,0,v=>{s.h=v/10;r.val.textContent=s.h.toFixed(1)+' h';if(s.h>=2&&s.on)complete();});r.val.textContent='0.0 h';
      const b=toggle('拔掉插頭','Unplug',off=>{s.on=!off;});return {};
    },
    read(s,output){const r=P.room(s.h,{on:s.on});output.innerHTML=s.on?T('送進來的電能 W = ','Electrical energy in W = ')+(r.W/1e6).toFixed(2)+' MJ'+T('，全部變成房間裡的熱：室溫升高 ',', all ends up as heat in the room: up ')+(r.T-26).toFixed(2)+' °C':T('沒插電：搬不了熱，室溫不變','Unplugged: no heat is moved; the room stays at 26 °C');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(24,{groups:{wrong:["熱不會自己往高溫跑", "Heat does not flow uphill"],solve:["冰箱是搬熱", "A fridge moves heat"],room:["打開冰箱門", "Leave the door open"],story:["違反自然要付代價", "Going against nature costs"],trick:["口訣", "The rule"]},board:{wrong:String.raw`T_{\text{coolant}}>T_{\text{room}}\ \text{to release heat}`,solve:String.raw`Q_H=Q_C+W`,room:String.raw`\Delta E_{\text{room}}=W>0`,story:String.raw`Q:\ T_{\text{high}}\to T_{\text{low}}`,trick:String.raw`W\ \text{moves}\ Q`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q24=[
 {
  "id": "Q24_01",
  "row": "wrong",
  "duration": 7.08,
  "disp": "錯最多的是 E，有 31%：冷媒的溫度比室溫低，也可以把熱直接傳給外面的空氣？",
  "en": "The top wrong pick is E, at 31%: even though the refrigerant is colder than the room, it can pass heat straight to the air?"
 },
 {
  "id": "Q24_02",
  "row": "wrong",
  "duration": 8.06,
  "disp": "沒有外界作功，熱只會自己從高溫流向低溫；冷媒要把熱丟出去，得先被壓縮機壓到比室溫還熱。",
  "en": "Without outside work, heat flows on its own only from hot to cold. To dump heat, the refrigerant must first be compressed until it is hotter than the room."
 },
 {
  "id": "Q24_03",
  "row": "wrong",
  "duration": 9.8,
  "disp": "D 有 23%：冷媒冷卻食物時是低溫高壓？在冰箱裡面吸熱的時候，冷媒已經降壓，是低溫低壓，這樣才會汽化吸熱。",
  "en": "D drew 23%: is the refrigerant cold and high-pressure while cooling food? Inside the fridge it has already been depressurized, cold and low-pressure, so it vaporizes and absorbs heat."
 },
 {
  "id": "Q24_04",
  "row": "wrong",
  "duration": 6.3,
  "disp": "B：壓縮機是把冷媒降溫？壓縮氣體，溫度是升高的，題目自己也寫了「提高其溫度」。",
  "en": "B: does the compressor cool the refrigerant? Compressing a gas heats it, and the passage itself says “raise its temperature.”"
 },
 {
  "id": "Q24_05",
  "row": "solve",
  "duration": 6.2,
  "disp": "A：冰箱通電，壓縮機作功，把冰箱裡面的熱搬到背後的散熱片丟出去。對。",
  "en": "A: plugged in, the compressor does work and carries heat from inside the fridge out to the coils at the back. Right."
 },
 {
  "id": "Q24_06",
  "row": "room",
  "duration": 7.27,
  "disp": "C 是對的，可是有 39% 的人沒勾：打開冰箱門，冷氣跑出來，房間不是會變涼嗎？",
  "en": "C is correct, yet 39% left it blank: with the fridge door open and cold air pouring out, shouldn’t the room cool down?"
 },
 {
  "id": "Q24_07",
  "row": "room",
  "duration": 4.68,
  "disp": "想想能量守恆。這個房間密閉又隔熱，熱跑不出去。",
  "en": "Think about energy conservation. The room is sealed and insulated, so heat cannot escape."
 },
 {
  "id": "Q24_08",
  "row": "room",
  "duration": 5.88,
  "disp": "冰箱從房間這頭把熱搬走，又從背後把熱丟回同一個房間，等於白搬。",
  "en": "The fridge takes heat from the room at the front and dumps it back into the same room at the back. It moves heat in a circle."
 },
 {
  "id": "Q24_09",
  "row": "room",
  "duration": 9.04,
  "disp": "可是插頭一直有電能送進來，這些電能最後都變成熱，留在房間裡，所以平均室溫會比原來高。對。答案 A、C。",
  "en": "But the plug keeps feeding in electrical energy, and it all ends up as heat that stays in the room. So the average room temperature ends up higher. Right. The answer is A and C."
 },
 {
  "id": "Q24_10",
  "row": "story",
  "duration": 6.04,
  "disp": "我上課說過：自然而然，熱是從高溫流向低溫；你要違反自然的趨勢，就要付出代價。",
  "en": "As I said in class: on its own, heat flows from hot to cold. If you want to go against nature, you have to pay."
 },
 {
  "id": "Q24_11",
  "row": "story",
  "duration": 2.72,
  "disp": "冰箱付的代價，就是你家的電費。",
  "en": "For a fridge, the price is your electricity bill."
 },
 {
  "id": "Q24_12",
  "row": "trick",
  "duration": 4.07,
  "disp": "秒殺口訣：冰箱是在搬熱，不是在造冷；搬熱要付電費。",
  "en": "The quick rule: a fridge moves heat, it does not make cold. Moving heat costs electricity."
 }
];
/* tracks:end */
