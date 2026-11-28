/* 113 學測第 20 題：四種基本交互作用（多選 CD，全對 50%）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const F4=[['strong','強力','Strong','#ff8a80'],['em','電磁力','Electromagnetic','#7fb6ff'],['weak','弱力','Weak','#c7a4ff'],['grav','重力','Gravity','#ffd17e']];
  function galaxy(g,x,y,R,t){
    for(let i=0;i<260;i++){const arm=i%2,u=i/260,a=u*7+arm*Math.PI+t*.15,r=R*u;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*.55;K.dot(g,px,py,1.4-u*.7,u<.15?'#fff2c4':i%7?'#c1d5ff':'#ffd9a8');}
    const gl=g.createRadialGradient(x,y,1,x,y,R*.35);gl.addColorStop(0,'#fff6d8');gl.addColorStop(1,'#fff6d800');g.fillStyle=gl;g.beginPath();g.arc(x,y,R*.35,0,Math.PI*2);g.fill();
  }
  function proton(g,x,y,r=11){D.ball(g,x,y,r,'#e8705f');label(g,'p',x,y+5,'#fff',13,'center');}
  function neutron(g,x,y,r=11){D.ball(g,x,y,r,'#a9b8c2');label(g,'n',x,y+5,'#0c2535',13,'center');}
  function spring(g,x1,y1,x2,y2,col,t){const n=9,dx=(x2-x1)/n,dy=(y2-y1)/n,L=Math.hypot(x2-x1,y2-y1),nx=-(y2-y1)/L,ny=(x2-x1)/L;g.beginPath();g.moveTo(x1,y1);
    for(let i=1;i<n;i++){const w=(i%2?1:-1)*5*(1+.25*Math.sin(t*6));g.lineTo(x1+dx*i+nx*w,y1+dy*i+ny*w);}g.lineTo(x2,y2);g.strokeStyle=col;g.lineWidth=2;g.stroke();}
  const ids=Array.from({length:12},(_,i)=>'Q20_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part;
    if(s.row==='wrong'){
      if(i<=1){galaxy(g,150,128,110,s.t);label(g,T('A：只有重力能到無窮遠？','A: only gravity reaches infinity?'),440,40,C.red,15,'right');label(g,'21%',440,66,C.red,22,'right');
        if(i===1){label(g,T('星系：真的是重力聚起來的','Galaxies: really gravity'),440,120,C.gold,15,'right');label(g,T('錯在「只有」','The error: “only”'),440,160,C.white,18,'right');}return;}
      if(i===2){const {X,Y}=D.axes(g,{x:60,y:212,w:330,h:170,xmin:-15,xmax:-1,ymin:-66,ymax:6,xt:[],xl:T('距離 r（對數）','Distance r (log)'),yl:T('力（對數）','Force (log)')});
        for(const [key,,,col] of [F4[1],F4[3]]){const f=r=>Math.log10(P.forces(10**r)[key]);D.curve(g,f,-15,-1-14*(1-seg(k,0,.7)),X,Y,col,2.6);}
        label(g,T('電力','Electric'),X(-6),Y(Math.log10(P.forces(1e-6).em))-8,C.blue,15);label(g,T('重力','Gravity'),X(-6),Y(Math.log10(P.forces(1e-6).grav))-8,C.gold,15);
        if(k>.6){sci(g,'F ∝ 1/r^{2}',250,46,C.white,20);arrow(g,X(-2),Y(Math.log10(P.forces(1e-2).em)),X(-1)+20,Y(Math.log10(P.forces(1e-1).em))+6,C.blue,2,9);label(g,'→ ∞',440,240,C.faint,15,'right');}
        for(const e of [-15,-10,-5])sci(g,'10^{'+e+'}',X(e),232,C.faint,13,'center');return;}
      // i===3 電中性
      const n=6;for(let a=0;a<n;a++)for(let b=0;b<4;b++){const x=50+a*28,y=70+b*34;D.ball(g,x,y,9,(a+b)%2?'#7fb6ff':'#ff8a80');label(g,(a+b)%2?'−':'+',x,y+5,'#fff',14,'center');}
      label(g,T('正負電抵消','Charges cancel'),120,226,C.blue,15,'center');
      for(let a=0;a<4;a++)for(let b=0;b<4;b++)K.cube(g,280+a*26,180-b*26+0,22,'#c8a36a','#e2c48d','#9c7b48');
      label(g,T('質量只會累加','Mass only adds up'),340,226,C.gold,15,'center');if(k>.5)arrow(g,410,170,410,60,C.gold,3,12);return;
    }
    if(s.row==='wrong2'){
      if(i===4){neutron(g,180,120,18);neutron(g,280,120,18);label(g,'?',230,90,C.red,30,'center');label(g,T('E：中子跟中子沒有強力？','E: no strong force between neutrons?'),230,210,C.red,16,'center');label(g,'20%',230,236,C.red,15,'center');return;}
      const pts=[[180,96,'p'],[240,76,'n'],[290,110,'n'],[220,140,'p'],[270,158,'n']].map(([x,y,c])=>[230+(x-235)*1.6,40+(y-76)*1.6,c]);
      for(let a=0;a<pts.length;a++)for(let b=a+1;b<pts.length;b++){const [x1,y1]=pts[a],[x2,y2]=pts[b];if(Math.hypot(x2-x1,y2-y1)<128)spring(g,x1,y1,x2,y2,'#ff8a80aa',s.t+a);}
      for(const [x,y,c] of pts)(c==='p'?proton:neutron)(g,x,y,20);
      label(g,'p–p、p–n、n–n',230,210,C.white,17,'center');label(g,T('強力不管帶不帶電','The strong force ignores charge'),230,236,'#ff8a80',15,'center');return;
    }
    if(s.row==='solve'){
      if(i===6){D.nucleus(g,150,125,18,8);g.beginPath();g.ellipse(150,125,96,46,-.2,0,Math.PI*2);g.strokeStyle='#7fb6ff66';g.lineWidth=1.5;g.stroke();
        const a=s.t*1.6,ex=150+Math.cos(a)*96*Math.cos(-.2)-Math.sin(a)*46*Math.sin(-.2),ey=125+Math.cos(a)*96*Math.sin(-.2)+Math.sin(a)*46*Math.cos(-.2);D.ball(g,ex,ey,7,'#7fb6ff');arrow(g,ex,ey,ex+(150-ex)*.35,ey+(125-ey)*.35,C.blue,2.4,9);
        label(g,T('靠電的吸引力','Electric attraction'),300,92,C.blue,16);sci(g,T('重力只有它的 10^{-39} 倍','Gravity: 10^{-39} times as strong'),300,128,C.faint,14);label(g,T('B 錯','B is wrong'),300,176,C.red,18);mark(g,370,170,false,10);return;}
      if(i===7){const p=seg(k,.15,.6);if(p<1)neutron(g,150,120,22);if(p>0){proton(g,150,120,22*p+.01);const d=90*p;D.ball(g,150+d,120-d*.55,6,'#7fb6ff');label(g,'e',150+d+10,120-d*.55,C.blue,14);D.ball(g,150+d*.9,120+d*.6,5,'#c7a4ff');label(g,'ν',150+d*.9+10,124+d*.6,'#c7a4ff',14);}
        sci(g,'n → p + e^{−} + ν',300,70,C.white,18);label(g,T('（ν：反微中子）','(ν: antineutrino)'),300,92,C.faint,13);label(g,T('β 衰變：弱力','Beta decay: weak force'),300,118,'#c7a4ff',16);label(g,T('自由中子平均約 15 分鐘','Free neutron: ~15 min on average'),300,146,C.faint,14);if(k>.8){label(g,T('C 對','C is right'),300,186,C.green,18);mark(g,360,180,true,10);}return;}
      if(i===8){const X=e=>40+(e+19)/10*380;line(g,X(-19),150,X(-9),150,C.white,2);for(let e=-18;e<=-10;e+=2){line(g,X(e),144,X(e),156,C.white,1.5);sci(g,'10^{'+e+'}',X(e),176,C.faint,13,'center');}
        const bar=(a,b,y,col,t)=>{box(g,X(a),y,X(b)-X(a),18,5,col+'55',col);label(g,t,X(b)+6,y+14,col,14);};
        bar(-19,-18,70,'#c7a4ff',T('弱力','Weak'));bar(-19,-15,98,'#ff8a80',T('強力（原子核）','Strong (nucleus)'));if(k>.3)bar(-19,-10,122,C.blue,T('原子','Atom'));label(g,T('公尺','m'),440,196,C.faint,13,'right');
        if(k>.7){label(g,T('都比原子小得多：D 對','Far smaller than an atom: D is right'),230,226,C.green,15,'center');}return;}
      if(i===9){label(g,T('答案 C、D','Answer: C and D'),230,130,C.green,28,'center');return;}
      // i===10 比較表
      const rows=[['',T('作用範圍','Range'),T('相對強度','Relative strength')],[T('強力','Strong'),'10^{-15} m','1'],[T('電磁力','EM'),'∞','10^{-2}'],[T('弱力','Weak'),'10^{-18} m','10^{-6}'],[T('重力','Gravity'),'∞','10^{-38}']];
      rows.forEach((r,j)=>r.forEach((c,m)=>{const col=j===0?C.faint:m===0?F4[j-1][3]:C.white;sci(g,c,[70,220,360][m],46+j*38,col,j?17:14,'center');}));
      label(g,T('114 第 26 題也考','Also on the 2025 exam, Q26'),440,240,C.gold,13,'right');return;
    }
    // trick
    label(g,T('長程','Long range'),110,48,C.white,18,'center');label(g,T('短程','Short range'),340,48,C.white,18,'center');
    D.chip(g,40,70,140,T('重力','Gravity'),C.gold,k>.1);D.chip(g,40,110,140,T('電磁力','Electromagnetic'),C.blue,k>.2);
    D.chip(g,270,70,140,T('強力','Strong'),'#ff8a80',k>.4);D.chip(g,270,110,140,T('弱力','Weak'),'#c7a4ff',k>.5);
    if(k>.7){neutron(g,170,196,13);arrow(g,190,196,260,196,'#c7a4ff',2.4,10);proton(g,280,196,13);label(g,T('弱力','weak'),225,186,'#c7a4ff',14,'center');}
  }
  // 能動手：兩顆質子距離 r（對數），四種力的大小（對數長條）
  function hands(g,s){
    const r=10**s.lr,f=P.forces(r),X=v=>140+(v+62)/66*300;
    proton(g,30,46,10);proton(g,30+Math.min(80,8+Math.max(0,(s.lr+18)/17*72)),46,10);sci(g,'r = 10^{'+s.lr.toFixed(1).replace('-','−')+'} m',130,52,C.white,16);
    const scale=s.lr<-14?T('原子核大小','nucleus size'):s.lr<-9?T('原子大小','atom size'):s.lr<-2.5?T('看得到的距離','visible scale'):T('1 公分以上','over 1 cm');label(g,scale,440,52,C.faint,14,'right');
    F4.forEach(([key,z,e,col],j)=>{const y=86+j*38,v=f[key],lg=v>0?Math.log10(v):-Infinity;label(g,T(z,e),130,y+15,col,15,'right');
      const w=isFinite(lg)?clamp(X(lg)-140,0,300):0;box(g,140,y,300,20,5,'#ffffff0d','#ffffff22',1);if(w>0)box(g,140,y,w,20,5,col+'aa');
      // 寫成「有效數字 × 10 的次方」：只寫次方時 3.9×10³ 會被四捨五入成 10⁴，和下面「強力 ÷ 電磁力 = 17」對不上
      const n=Math.floor(lg),m=v/10**n,txt=Math.abs(n)<3?String(+v.toPrecision(2)):(m.toFixed(1)==='10.0'?'1.0×10^{'+(n+1)+'}':m.toFixed(1)+'×10^{'+n+'}');
      sci(g,isFinite(lg)&&lg>-62?txt+' N':T('幾乎是 0','≈ 0'),w>200?140+w-6:146+w,y+15,w>200?'#0c2535':C.white,13,w>200?'right':'left');});
    if(s.lr>=-2)label(g,T('剩下兩種：都是平方反比、範圍無限','Two remain: both inverse-square with infinite range'),230,240,C.green,14,'center');
  }
  ExamScene.add(20,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,lr:-15}),
    paint,
    preview(g){galaxy(g,118,135,100,0);D.nucleus(g,340,125,40,12);K.boost(1.55,()=>{label(g,T('星系','Galaxy'),118,238,C.faint,14,'center');label(g,T('原子核','Nucleus'),340,212,C.faint,14,'center');label(g,T('四種基本交互作用','Four fundamental interactions'),444,34,C.gold,16,'right');});},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;range(T('距離 r（10 的次方，公尺）','Distance r (power of 10, m)'),-18,-1,-15,v=>{s.lr=v;if(v>=-2)complete();});
      return {};
    },
    read(s,output){const f=P.forces(10**s.lr),e=v=>{if(!(v>0)||v<1e-60)return T('幾乎是 0','≈ 0');const n=Math.floor(Math.log10(v)),m=v/10**n;return Math.abs(n)<3?String(+v.toPrecision(2)):m.toFixed(1)+' × 10<sup>'+n+'</sup>';};
      output.innerHTML=T('強力 ÷ 電磁力 = ','Strong ÷ EM = ')+e(f.strong/f.em)+T('<br>電磁力 ÷ 重力 = ','<br>EM ÷ gravity = ')+e(f.em/f.grav);}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(20,{groups:{wrong:["不是只有重力", "Not only gravity"],wrong2:["中子之間也有強力", "Neutrons feel the strong force too"],solve:["逐項判斷", "Check each choice"],trick:["口訣", "The rule"]},board:{wrong:String.raw`F_g\propto\dfrac{1}{r^{2}},\quad F_e\propto\dfrac{1}{r^{2}}`,wrong2:String.raw`p\!-\!p,\ p\!-\!n,\ n\!-\!n`,solve:String.raw`n\to p+e^{-}+\bar{\nu}_e`,trick:[String.raw`r_{\text{強力}}\sim10^{-15}\,\text{m}`,String.raw`r_{\text{strong}}\sim10^{-15}\,\text{m}`]}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q20=[
 {
  "id": "Q20_01",
  "row": "wrong",
  "duration": 7.01,
  "disp": "錯最多的是 A，21%：只有重力可以到無窮遠，所以星系靠重力形成。",
  "en": "The top wrong pick is A, 21%: only gravity reaches to infinity, so galaxies form by gravity."
 },
 {
  "id": "Q20_02",
  "row": "wrong",
  "duration": 4.59,
  "disp": "星系確實是重力聚起來的，錯在「只有」兩個字。",
  "en": "Galaxies really are pulled together by gravity. The mistake is the word “only.”"
 },
 {
  "id": "Q20_03",
  "row": "wrong",
  "duration": 6.82,
  "disp": "兩個點電荷之間的電力，跟重力一樣，都跟距離平方成反比，作用範圍都可以到無窮遠。",
  "en": "The electric force between two point charges, like gravity, falls off as one over distance squared, and its range is also infinite."
 },
 {
  "id": "Q20_04",
  "row": "wrong",
  "duration": 6.81,
  "disp": "那為什麼大尺度是重力在管？因為天體幾乎是電中性，正負電抵消了；質量可不會抵消。",
  "en": "So why does gravity rule on large scales? Stars and planets are nearly neutral, so charges cancel. Mass never cancels."
 },
 {
  "id": "Q20_05",
  "row": "wrong2",
  "duration": 5.92,
  "disp": "E 也有 20%：中子不帶電，所以中子跟中子之間沒有強力？",
  "en": "E drew 20%: neutrons have no charge, so there is no strong force between two neutrons?"
 },
 {
  "id": "Q20_06",
  "row": "wrong2",
  "duration": 7.16,
  "disp": "強力不管你帶不帶電，質子跟質子、質子跟中子、中子跟中子都有，原子核才黏得住。",
  "en": "The strong force ignores charge. Proton–proton, proton–neutron and neutron–neutron all feel it. That is what holds the nucleus together."
 },
 {
  "id": "Q20_07",
  "row": "solve",
  "duration": 5.46,
  "disp": "B：電子繞著原子核轉，靠的是電的吸引力，重力小到可以忽略。錯。",
  "en": "B: an electron orbits the nucleus because of electric attraction. Gravity is negligible. Wrong."
 },
 {
  "id": "Q20_08",
  "row": "solve",
  "duration": 9.62,
  "disp": "C：單獨的中子平均大約十五分鐘就會衰變成質子、電子和反微中子，這是 β 衰變，靠的就是弱力。對。",
  "en": "C: a free neutron lives about fifteen minutes on average, then decays into a proton, an electron and an antineutrino. That is beta decay, caused by the weak force. Right."
 },
 {
  "id": "Q20_09",
  "row": "solve",
  "duration": 6.02,
  "disp": "D：強力大約只在原子核那麼大的範圍，弱力更短，都比原子小得多。對。",
  "en": "D: the strong force acts only over about the size of a nucleus, and the weak force over even less. Both are far smaller than an atom. Right."
 },
 {
  "id": "Q20_10",
  "row": "solve",
  "duration": 1.02,
  "disp": "答案 C、D。",
  "en": "The answer is C and D."
 },
 {
  "id": "Q20_11",
  "row": "solve",
  "duration": 7.37,
  "disp": "114 學測第 26 題也考四種基本交互作用，連續兩年都考，這張比較表一定要熟。",
  "en": "Question 26 of the 2025 exam also tested the four fundamental interactions. Two years in a row: know the comparison table cold."
 },
 {
  "id": "Q20_12",
  "row": "trick",
  "duration": 8.35,
  "disp": "秒殺口訣：長程兩個，重力、電磁力；短程兩個，強力、弱力；讓中子變質子的，是弱力。",
  "en": "The quick rule: two long-range forces, gravity and electromagnetism; two short-range, strong and weak; turning a neutron into a proton is the weak force."
 }
];
/* tracks:end */
