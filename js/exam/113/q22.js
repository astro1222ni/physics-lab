/* 113 學測第 22 題：射束的粒子與光子（多選 CE，全對 31%）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const BETA=P.protonBeta(150);
  function proton(g,x,y,r=10){D.ball(g,x,y,r,'#e8705f');label(g,'p',x,y+5,'#fff',13,'center');}
  function neutron(g,x,y,r=10){D.ball(g,x,y,r,'#a9b8c2');label(g,'n',x,y+5,'#0c2535',13,'center');}
  // 光子：一小段波包（cycles 個週期），往右跑
  function photon(g,x,y,len,cycles,col,amp=9){g.beginPath();for(let i=0;i<=80;i++){const u=i/80,env=Math.sin(Math.PI*u);const px=x-len+u*len,py=y-Math.sin(u*cycles*Math.PI*2)*amp*env;i?g.lineTo(px,py):g.moveTo(px,py);}g.strokeStyle=col;g.lineWidth=2.2;g.stroke();}
  const BOX={x:40,y:214,w:246,h:176},NAMES={electron:['電子 4 MeV','Electron 4 MeV'],x4:['X 光 4 MeV','X-ray 4 MeV'],x20:['X 光 20 MeV','X-ray 20 MeV'],proton:['質子 150 MeV','Proton 150 MeV']};
  // 右欄圖例：線型樣本＋名稱（＋探針處劑量）；dim 的射束變淡
  function legend(g,x,y,probe,dim){['x20','x4','proton','electron'].forEach((k2,j)=>{const [col,dash]=D.BEAM_STYLE[k2],yy=y+j*30,a=dim&&dim.includes(k2)?'55':'';
    g.setLineDash(dash);line(g,x,yy-5,x+24,yy-5,col+a,2.4);g.setLineDash([]);label(g,T(...NAMES[k2]),x+30,yy,col+a,13);
    if(probe!=null){const d=P.dose(k2,probe);label(g,d>.004?(d*100).toFixed(0)+'%':'0',452,yy,d>.004?C.white:C.faint,14,'right');}});}
  const ids=Array.from({length:14},(_,i)=>'Q22_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function shares(g,k,hot,good=''){const Q=ExamPaper.questions[22],L='ABCDE';
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*2.2*seg(k,0,.6),col=good.includes(L[j])?C.green:hot.includes(L[j])?C.red:'#5f7480';
      box(g,x,214-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,236,C.white,16,'center');if(k>.4)label(g,v+'%',x+23,206-hh,col,15,'center');});}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:shares(g,k,'ABD','CE');label(g,T('全對只有 31%','Only 31% got both'),440,34,C.gold,16,'right');return;
      case 1:case 2:{const L=330,x0=60,u=(t*.35)%1;line(g,x0,92,x0+L,92,'#ffffff22',1,[4,4]);line(g,x0,172,x0+L,172,'#ffffff22',1,[4,4]);
        photon(g,x0+L*u+30,92,46,3,'#ffe9a6');proton(g,x0+L*u*BETA+12,172,12);
        label(g,T('光子（4 MeV）','Photon (4 MeV)'),x0,70,'#ffe9a6',15);label(g,T('質子（150 MeV）','Proton (150 MeV)'),x0,150,'#ff8a80',15);
        if(i===1){label(g,'?',420,140,C.red,30,'center');label(g,T('D：速率一樣？','D: the same speed?'),440,232,C.red,15,'right');return;}
        sci(g,'v = c',420,98,'#ffe9a6',17,'right');sci(g,'v ≈ '+BETA.toFixed(2)+' c',420,178,'#ff8a80',17,'right');
        if(k>.5)label(g,T('有質量：只能接近光速','Has mass: can only approach c'),230,226,C.white,15,'center');return;}
      case 3:shares(g,k,'AB');label(g,T('A、B 各 22%','A and B: 22% each'),440,34,C.red,16,'right');return;
      case 4:{proton(g,110,120,18);label(g,T('質子','Proton'),110,166,'#ff8a80',15,'center');sci(g,'m',110,196,C.white,18,'center');
        const a=seg(k,.2,.6);const pts=[[-11,-11,'p'],[11,-11,'n'],[-11,11,'n'],[11,11,'p']];for(const [dx,dy,c] of pts)(c==='p'?proton:neutron)(g,320+dx*(1+.4*(1-a)),120+dy*(1+.4*(1-a)),14);
        label(g,T('α 粒子＝氦原子核','Alpha = helium nucleus'),320,166,C.gold,15,'center');sci(g,'≈ 4m',320,196,C.white,18,'center');
        if(k>.6){mark(g,215,120,false,14);label(g,T('A 錯','A is wrong'),215,226,C.red,16,'center');}return;}
      case 5:{sci(g,'150 ÷ 4 = 37.5',230,90,C.white,24,'center');label(g,T('B：粒子數密度是 37.5 倍？','B: 37.5 times the number density?'),230,140,C.red,17,'center');return;}
      case 6:{const row=(y,n,r,col,txt)=>{for(let j=0;j<n;j++){const x=40+((j*53+t*60)%220);K.dot(g,x,y+((j*37)%30)-15,r,col);}label(g,txt,440,y+5,col,15,'right');};
        row(80,4,7,'#ff8a80',T('一顆能量大、顆數少','Big energy, few'));row(170,26,3,'#7fb6ff',T('一顆能量小、顆數多','Small energy, many'));
        if(k>.4)label(g,T('圖上只寫「一顆」的能量 → 顆數推不出來','The graph gives energy per particle → no count'),230,232,C.gold,14,'center');return;}
      case 7:{const f4=P.photonFrequency(4),f20=P.photonFrequency(20);photon(g,420,80,360,1.4,'#7fb6ff',16);photon(g,420,170,360,7,'#c7a4ff',16);
        sci(g,'E = 4 MeV',40,52,'#7fb6ff',15);sci(g,'f ≈ '+(f4/1e20).toFixed(1)+'×10^{20} Hz',420,52,'#7fb6ff',15,'right');
        sci(g,'E = 20 MeV',40,142,'#c7a4ff',15);sci(g,'f ≈ '+(f20/1e21).toFixed(1)+'×10^{21} Hz',420,142,'#c7a4ff',15,'right');
        if(k>.5){sci(g,'E = hf ⇒ f ∝ E：× 5',230,232,C.green,17,'center');mark(g,440,226,true,10);}return;}
      case 8:case 9:{const pr=i===8?2+13*seg(k,0,.8):15,dim=i===9&&k>.3?['electron','proton']:null;D.fig8(g,{box:BOX,probe:pr,labels:false,only:dim?['x4','x20']:null});legend(g,300,52,pr,dim);
        if(i===9&&k>.5){label(g,T('電子：2 cm 就沒了','Electrons: gone by 2 cm'),300,190,'#7fb6ff',13);label(g,T('質子：13 cm 歸零','Protons: zero by 13 cm'),300,210,'#ff8a80',13);label(g,T('只剩 X 光 → E 對','Only X-rays → E is right'),300,234,C.green,14);}return;}
      case 10:label(g,T('答案 C、E','Answer: C and E'),230,130,C.green,30,'center');return;
      case 11:case 12:{const panel=(x,n,txt)=>{box(g,x,40,190,150,12,'#0b2233','#35505f');for(let j=0;j<n;j++){const yy=60+(j*41)%110,xx=x+10+((j*67+t*90)%160);photon(g,xx+20,yy,22,2,'#7fb6ff',5);}label(g,txt,x+95,214,C.white,14,'center');};
        panel(30,3,T('同頻率、光子少：暗','Same f, few photons: dim'));panel(240,18,T('同頻率、光子多：亮','Same f, many photons: bright'));
        if(i===12&&k>.3){label(g,T('B 把「一顆多少」和「總共幾顆」混在一起','B mixes “energy per one” with “how many”'),230,240,C.red,14,'center');}return;}
      default:D.chip(g,40,80,170,T('一顆','One particle'),C.gold,true);arrow(g,220,95,250,95,C.white,2,9);D.chip(g,260,80,160,T('看能量','Energy'),C.gold,k>.2);
        D.chip(g,40,140,170,T('一束','A beam'),C.teal,k>.4);arrow(g,220,155,250,155,C.white,2,9);D.chip(g,260,140,160,T('還要看幾顆','Also: how many'),C.teal,k>.6);
    }
  }
  // 能動手：拉探針深度，讀四條射束在那個深度的劑量；拉到 15 cm 完成
  function hands(g,s){D.fig8(g,{box:BOX,probe:s.x,labels:false});legend(g,300,52,s.x);label(g,T('探針處的劑量','Dose at the probe'),300,26,C.faint,13);
    if(s.x>=14.9)label(g,T('15 cm：只剩兩條 X 光','15 cm: only the two X-rays'),300,190,C.green,14);}
  ExamScene.add(22,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,x:5}),
    paint,
    preview(g){K.boost(1.35,()=>D.fig8(g,{box:{...BOX,y:BOX.y-12},labels:false}));K.boost(1.35,()=>legend(g,300,52));},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;const r=range(T('探針深度','Probe depth'),0,150,50,v=>{s.x=v/10;r.val.textContent=s.x.toFixed(1)+' cm';if(v>=149)complete();});r.val.textContent='5.0 cm';return {};
    },
    read(s,output){const alive=Object.keys(D.BEAM_STYLE).filter(k2=>P.dose(k2,s.x)>.004).length;
      output.textContent=s.x.toFixed(1)+T(' 公分處還有 ',' cm: ')+alive+T(' 條射束有劑量',' beams still deliver dose')+(s.x>=14.9?T('：只剩兩條 X 光','; only the two X-rays'):'');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(22,{groups:{wrong:["有質量追不上光", "Mass cannot reach light speed"],wrong2:["一顆的能量不是顆數", "Energy per particle is not a count"],solve:["讀圖與 E = hf", "Read the graph, use E = hf"],story:["能量與數量", "Energy versus number"],trick:["口訣", "The rule"]},board:{wrong:String.raw`v_{p}<c,\qquad v_{\gamma}=c`,wrong2:String.raw`\alpha={}^{4}_{2}\text{He}\neq p`,solve:String.raw`\dfrac{f_{20}}{f_{4}}=\dfrac{20\,\text{MeV}}{4\,\text{MeV}}=5`,story:String.raw`E=hf,\quad I=\dfrac{N\,hf}{t\,A}`,trick:[String.raw`E\ \text{看每顆光子},\ \ N\ \text{看整束}`,String.raw`E\ \text{per photon},\ N\ \text{per beam}`]}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q22=[
 {
  "id": "Q22_01",
  "row": "wrong",
  "duration": 6.33,
  "disp": "這題全對只有 31%，三個錯的選項，每個都有兩成以上的人勾。",
  "en": "Only 31% got this fully right, and each of the three wrong choices drew at least 20%."
 },
 {
  "id": "Q22_02",
  "row": "wrong",
  "duration": 5.25,
  "disp": "D 有 26%：150 MeV 的質子，能量那麼大，速率會不會跟光一樣快？",
  "en": "D drew 26%: a 150 MeV proton has so much energy, could it be as fast as light?"
 },
 {
  "id": "Q22_03",
  "row": "wrong",
  "duration": 7.57,
  "disp": "不會。質子有質量，再怎麼加速，都只能接近光速；光子沒有質量，在真空中一定是光速。",
  "en": "No. A proton has mass, so however hard you push it, it only approaches light speed. A photon has no mass and always moves at light speed in vacuum."
 },
 {
  "id": "Q22_04",
  "row": "wrong2",
  "duration": 5.11,
  "disp": "A、B 各 22%。A：質子跟 α 射線的粒子一樣？",
  "en": "A and B each drew 22%. A: are protons the same particles as alpha rays?"
 },
 {
  "id": "Q22_05",
  "row": "wrong2",
  "duration": 5.96,
  "disp": "α 粒子是氦原子核，兩個質子加兩個中子，質量大約是質子的 4 倍。",
  "en": "An alpha particle is a helium nucleus, two protons and two neutrons, about 4 times the proton’s mass."
 },
 {
  "id": "Q22_06",
  "row": "wrong2",
  "duration": 4.62,
  "disp": "B：150 除以 4 等於 37.5，所以粒子數密度是 37.5 倍？",
  "en": "B: 150 divided by 4 is 37.5, so the number density is 37.5 times larger?"
 },
 {
  "id": "Q22_07",
  "row": "wrong2",
  "duration": 5.13,
  "disp": "圖上標的是「一顆」粒子的能量；光看一顆的能量，推不出一束裡面有幾顆。",
  "en": "The graph labels the energy of one particle. From that alone you cannot tell how many particles are in the beam."
 },
 {
  "id": "Q22_08",
  "row": "solve",
  "duration": 7.17,
  "disp": "C：光子的能量 E 等於 h f，能量跟頻率成正比；20 除以 4 等於 5，頻率也是 5 倍。對。",
  "en": "C: a photon’s energy is E = hf, proportional to frequency. 20 divided by 4 is 5, so the frequency is 5 times larger. Right."
 },
 {
  "id": "Q22_09",
  "row": "solve",
  "duration": 3.06,
  "disp": "E：看圖 8 最右邊，15 公分的地方。",
  "en": "E: look at the far right of figure 8, at 15 cm."
 },
 {
  "id": "Q22_10",
  "row": "solve",
  "duration": 7.9,
  "disp": "電子束 2 公分就沒了，質子束 13 公分左右也掉到零，只剩兩條 X 光的曲線還在。對。",
  "en": "The electron beam is gone by 2 cm and the proton beam drops to zero near 13 cm. Only the two X-ray curves are still there. Right."
 },
 {
  "id": "Q22_11",
  "row": "solve",
  "duration": 1.18,
  "disp": "答案 C、E。",
  "en": "The answer is C and E."
 },
 {
  "id": "Q22_12",
  "row": "story",
  "duration": 9.11,
  "disp": "我上光電效應的時候說過：光子的能量看頻率；同樣頻率的光，強度看每秒打過來的光子有多少，這兩件事不要搞混。",
  "en": "When I taught the photoelectric effect I said: a photon’s energy depends on frequency; for light of one frequency, intensity depends on how many photons arrive each second. Don’t mix them up."
 },
 {
  "id": "Q22_13",
  "row": "story",
  "duration": 4.34,
  "disp": "B 就是把「一顆有多少能量」跟「總共有幾顆」混在一起了。",
  "en": "B mixes up “how much energy one has” with “how many there are.”"
 },
 {
  "id": "Q22_14",
  "row": "trick",
  "duration": 3.17,
  "disp": "秒殺口訣：一顆看能量，一束還要看有幾顆。",
  "en": "The quick rule: one particle tells you energy; for the beam you also need the count."
 }
];
/* tracks:end */
