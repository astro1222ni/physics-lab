/* 113 學測第 23 題：深度與吸收劑量（多選 BD，全對 45%）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,D=Exam113Draw,P=Exam113Core;
  const BOX={x:40,y:214,w:246,h:176},ORDER=['x20','x4','proton','electron'];
  const NAMES={electron:['電子 4 MeV','Electron 4 MeV'],x4:['X 光 4 MeV','X-ray 4 MeV'],x20:['X 光 20 MeV','X-ray 20 MeV'],proton:['質子 150 MeV','Proton 150 MeV']};
  // 右欄：每條射束「腫瘤平均劑量 ÷ 正常組織平均劑量」，越大越好
  function ratios(g,x,y,band,pick,showBest=true){
    const rs=ORDER.map(k=>[k,P.doseRatio(k,band[0],band[1]).ratio]),best=rs.reduce((a,b)=>b[1]>a[1]?b:a)[0];
    label(g,T('腫瘤 ÷ 正常','Tumor ÷ healthy'),x,y-22,C.faint,13);
    rs.forEach(([k,r],j)=>{const [col,dash]=D.BEAM_STYLE[k],yy=y+j*30,on=!pick||pick===k;
      g.setLineDash(dash);line(g,x,yy-5,x+22,yy-5,on?col:col+'55',2.4);g.setLineDash([]);label(g,T(...NAMES[k]),x+28,yy,on?col:col+'66',13);
      label(g,r.toFixed(2),452,yy,showBest&&k===best?C.green:C.white,14,'right');});
    return best;
  }
  // 在圖 8 上把某條曲線在 [a,b] 外的劑量塗紅（正常細胞被照到）
  function harm(g,X,Y,k,a,b,upto=1){g.save();g.globalAlpha=.32;g.fillStyle='#ff6b5e';
    for(const [p,q] of [[0,a],[b,15]]){if(q<=p)continue;const end=p+(q-p)*upto;g.beginPath();g.moveTo(X(p),Y(0));for(let i=0;i<=60;i++){const x=p+(end-p)*i/60;g.lineTo(X(x),Y(P.dose(k,x)));}g.lineTo(X(end),Y(0));g.closePath();g.fill();}
    g.restore();}
  function tumor(g,X,a,b){const y=BOX.y-BOX.h;for(let i=0;i<6;i++){const cx=X(a)+(X(b)-X(a))*(i%3+.5)/3,cy=y+18+Math.floor(i/3)*14;g.beginPath();g.arc(cx,cy,5,0,Math.PI*2);g.fillStyle='#c76bd6';g.fill();}}
  const ids=Array.from({length:13},(_,i)=>'Q23_'+String(i+1).padStart(2,'0')),I=id=>ids.indexOf(id);
  function shares(g,k){const Q=ExamPaper.questions[23],L='ABCDE';
    Q.shares.forEach((v,j)=>{const x=60+j*76,hh=v*2.1*seg(k,0,.6),col='BD'.includes(L[j])?C.green:L[j]==='C'?C.red:'#5f7480';
      box(g,x,214-hh,46,hh,6,col+'aa',col);label(g,L[j],x+23,236,C.white,16,'center');if(k>.4)label(g,v+'%',x+23,206-hh,col,15,'center');});}
  function scene(g,o){const r=D.fig8(g,{box:BOX,labels:false,band:o.band,only:o.only,hot:o.hot,upto:o.upto});if(o.band)tumor(g,r.X,...o.band);return r;}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part,t=s.t;
    switch(i){
      case 0:shares(g,k);label(g,T('C 錯最多：41%','Most common error: C, 41%'),440,34,C.red,16,'right');return;
      case 1:case 2:{const {X,Y}=scene(g,{band:[0,2],only:['x4'],hot:'x4'});if(i===2)harm(g,X,Y,'x4',0,2,seg(k,0,.7));
        label(g,T('C：0–2 cm','C: 0–2 cm,'),300,40,C.red,14);label(g,T('用 4 MeV X 光？','4 MeV X-ray?'),300,60,C.red,14);
        if(i===2&&k>.5){label(g,T('2 cm 後面','Beyond 2 cm,'),300,90,C.white,14);label(g,T('正常細胞也被照','healthy cells get dosed too'),300,112,'#ff8a80',14);mark(g,320,150,false,12);}return;}
      case 3:{const {X,Y}=scene(g,{band:[0,2],only:['electron'],hot:'electron'});label(g,T('電子束：過了 2 cm','Electron beam: past 2 cm'),300,60,'#7fb6ff',14);label(g,T('幾乎是零','almost zero'),300,82,'#7fb6ff',14);
        if(k>.4){label(g,T('後面的正常細胞','Healthy tissue behind'),300,124,C.green,14);label(g,T('幾乎照不到','is spared'),300,146,C.green,14);}return;}
      case 4:D.chip(g,40,70,380,T('① 癌細胞吸收得多','① Tumor absorbs a lot'),'#c76bd6',true);D.chip(g,40,120,380,T('② 旁邊的正常細胞吸收得少','② Healthy tissue absorbs little'),C.green,k>.3);
        if(k>.6)sci(g,T('比一比：腫瘤平均 ÷ 正常平均','Compare: tumor average ÷ healthy average'),230,200,C.gold,16,'center');return;
      case 5:{scene(g,{band:[10,10.6],only:['electron'],hot:'electron'});label(g,T('A：10 cm 用電子束','A: electrons at 10 cm'),300,40,C.red,14);label(g,T('早就到不了','never gets there'),300,64,'#7fb6ff',14);mark(g,330,110,false,12);return;}
      case 6:{const u=ease(seg(k,0,.8));D.fig8(g,{box:BOX,labels:false,only:['proton'],hot:'proton',upto:15*u});
        label(g,T('質子：前面吸收少','Protons: little at first'),300,40,'#ff8a80',14);if(u>.7)label(g,T('11 cm 多衝到最高','peak just past 11 cm'),300,64,'#ff8a80',14);if(u>.9)label(g,T('13 cm 左右歸零','zero near 13 cm'),300,88,'#ff8a80',14);return;}
      case 7:{const {X,Y}=scene(g,{band:[10,11],only:['proton'],hot:'proton'});harm(g,X,Y,'proton',10,11);ratios(g,300,68,[10,11],'proton');if(k>.5){mark(g,330,200,true,12);label(g,T('B 對','B is right'),350,206,C.green,16);}return;}
      case 8:{scene(g,{band:[2,10],only:['x20'],hot:'x20'});ratios(g,300,68,[2,10],'x20');if(k>.5){mark(g,330,200,true,12);label(g,T('D 對','D is right'),350,206,C.green,16);}return;}
      case 9:{scene(g,{band:[3,8],only:['electron'],hot:'electron'});label(g,T('E：3–8 cm 用電子束','E: electrons for 3–8 cm'),300,40,C.red,14);mark(g,330,84,false,12);
        if(k>.5)label(g,T('答案 B、D','Answer: B and D'),370,170,C.green,22,'center');return;}
      case 10:{// 質子走進組織，越走越慢，每公分丟的能量越多
        const X=x=>40+x/15*400,u=(t*.22)%1,x=13*Math.pow(u,.6),v=Math.sqrt(Math.max(0,1-x/13));
        box(g,40,70,400,90,10,'#f0b8a838','#f0b8a866');label(g,T('組織','Tissue'),48,62,C.faint,13);
        for(let j=0;j<40;j++){const xx=13*j/40;if(xx>x)break;const de=Math.min(1,P.dose('proton',xx));K.dot(g,X(xx),115,1.5+de*4,'rgba(255,138,128,'+(.25+de*.6)+')');}
        D.ball(g,X(x),115,9,'#e8705f');if(v>.05)arrow(g,X(x)+12,115,X(x)+12+v*40,115,C.white,2,8);
        sci(g,'v ≈ '+v.toFixed(2)+' v_{0}',230,200,C.white,16,'center');label(g,T('越慢 → 每公分丟的能量越多','Slower → more energy lost per cm'),230,228,'#ff8a80',15,'center');return;}
      case 11:{const {X,Y}=D.fig8(g,{box:BOX,labels:false,only:['proton'],hot:'proton'});const px=X(11.45),py=Y(.98);
        g.beginPath();g.arc(px,py,10+3*Math.sin(t*4),0,Math.PI*2);g.strokeStyle=C.gold;g.lineWidth=2;g.stroke();arrow(g,330,70,px+12,py-4,C.gold,2,9);
        label(g,T('布拉格峰','Bragg peak'),334,64,C.gold,18);label(g,T('快停下來的那一段','where the proton is about to stop'),300,110,C.white,13);return;}
      default:D.chip(g,30,60,120,T('淺','Shallow'),'#7fb6ff',true);arrow(g,160,75,190,75,C.white,2,9);D.chip(g,200,60,230,T('電子','Electrons'),'#7fb6ff',k>.15);
        D.chip(g,30,110,120,T('深','Deep'),'#ff8a80',k>.3);arrow(g,160,125,190,125,C.white,2,9);D.chip(g,200,110,230,T('質子','Protons'),'#ff8a80',k>.45);
        D.chip(g,30,160,120,T('一整段','A long span'),'#ffd17e',k>.6);arrow(g,160,175,190,175,C.white,2,9);D.chip(g,200,160,230,T('高能 X 光','High-energy X-rays'),'#ffd17e',k>.75);
    }
  }
  // 能動手：拉腫瘤深度（1 cm 厚）、選射束；選對射束打 10–11 cm 的腫瘤才完成
  function hands(g,s){const band=[s.c-.5,s.c+.5],{X,Y}=scene(g,{band,only:[s.beam],hot:s.beam});harm(g,X,Y,s.beam,...band);ratios(g,300,68,band,s.beam);
    label(g,T('紅色：正常組織挨的劑量','Red: dose to healthy tissue'),300,200,'#ff8a80',13);}
  ExamScene.add(23,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,c:5,beam:'x4'}),
    paint,
    preview(g){const {X}=D.fig8(g,{box:{...BOX,y:BOX.y-12},labels:false});tumor(g,X,10,11);label(g,T('腫瘤在哪一段？','Where is the tumor?'),300,40,'#c76bd6',15);
      ORDER.forEach((k,j)=>{const [col,dash]=D.BEAM_STYLE[k];g.setLineDash(dash);line(g,300,85+j*30,322,85+j*30,col,2.4);g.setLineDash([]);label(g,T(...NAMES[k]),328,90+j*30,col,13);});},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,btn,complete}){
      s.hands=true;const btns=[];
      const ok=()=>{if(s.beam==='proton'&&Math.abs(s.c-10.5)<=.3)complete();};
      const r=range(T('腫瘤深度（中心）','Tumor depth (center)'),5,145,50,v=>{s.c=v/10;r.val.textContent=s.c.toFixed(1)+' cm';ok();});r.val.textContent='5.0 cm';
      for(const k of ORDER){const b=btn(T(...NAMES[k]),()=>{s.beam=k;btns.forEach(x=>x.setAttribute('aria-pressed',x===b));ok();});b.setAttribute('aria-pressed',k===s.beam);btns.push(b);}
      return {};
    },
    read(s,output){const band=[s.c-.5,s.c+.5],r=P.doseRatio(s.beam,...band);
      output.textContent=T('腫瘤 ','Tumor ')+band[0].toFixed(1)+'–'+band[1].toFixed(1)+' cm：'+T('腫瘤平均 ','tumor avg ')+(r.tumor*100).toFixed(0)+'%、'+T('正常平均 ','healthy avg ')+(r.normal*100).toFixed(0)+'%、'+T('比 ','ratio ')+r.ratio.toFixed(2);}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(23,{groups:{wrong:["X 光不會停下來", "X-rays do not stop"],solve:["打癌細胞、放過正常細胞", "Hit the tumor, spare the rest"],story:["質子的最後一口氣", "The proton’s last gasp"],trick:["口訣", "The rule"]},board:{wrong:String.raw`D_{X}(15\,\text{cm})>0`,solve:String.raw`\text{tumor}\ \uparrow,\ \ \text{normal}\ \downarrow`,story:String.raw`p:\ \text{peak at}\ x\approx 11\,\text{cm}`,trick:String.raw`\text{shallow}\ e^{-},\ \ \text{deep}\ p`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q23=[
 {
  "id": "Q23_01",
  "row": "wrong",
  "duration": 2.92,
  "disp": "錯最多的是 C，有 41%。",
  "en": "The top wrong pick is C, at 41%."
 },
 {
  "id": "Q23_02",
  "row": "wrong",
  "duration": 5.25,
  "disp": "癌細胞在 0 到 2 公分，4 MeV 的 X 光在表面也很強啊，為什麼不行？",
  "en": "The tumor is 0 to 2 cm deep and the 4 MeV X-ray is strong near the surface. Why not use it?"
 },
 {
  "id": "Q23_03",
  "row": "wrong",
  "duration": 7.76,
  "disp": "因為 X 光不會在 2 公分停下來，它一路往深處走，雖然慢慢變弱，2 公分後面的正常細胞也一起被照。",
  "en": "Because X-rays do not stop at 2 cm. They keep going deeper, slowly weakening, so the healthy cells beyond 2 cm get dosed too."
 },
 {
  "id": "Q23_04",
  "row": "wrong",
  "duration": 5.86,
  "disp": "電子束在 0 到 2 公分很強，過了 2 公分就幾乎是零，後面的正常細胞幾乎照不到。",
  "en": "The electron beam is strong from 0 to 2 cm and nearly zero past 2 cm, so the healthy cells behind barely get any."
 },
 {
  "id": "Q23_05",
  "row": "solve",
  "duration": 4.68,
  "disp": "題目要的是兩件事：癌細胞吸收得多，旁邊的正常細胞吸收得少。",
  "en": "The question wants two things: a high dose in the tumor and a low dose in the healthy tissue around it."
 },
 {
  "id": "Q23_06",
  "row": "solve",
  "duration": 3.87,
  "disp": "A：10 公分深，電子束早就到不了了。錯。",
  "en": "A: at 10 cm the electron beam never arrives. Wrong."
 },
 {
  "id": "Q23_07",
  "row": "solve",
  "duration": 7.42,
  "disp": "B：質子束很特別，前面吸收得少，越深越高，大約 11 公分多衝到最高，13 公分左右就掉到零。",
  "en": "B: the proton beam is special. It deposits little at first, rises with depth, peaks a little past 11 cm, and drops to zero by about 13 cm."
 },
 {
  "id": "Q23_08",
  "row": "solve",
  "duration": 8.08,
  "disp": "腫瘤在 10 到 11 公分，正好在尖峰前面的高劑量區；前面的組織照得比較少，13 公分以後幾乎照不到。對。",
  "en": "The tumor at 10 to 11 cm sits in the high-dose region just before the peak. The tissue in front gets less, and past 13 cm almost nothing. Right."
 },
 {
  "id": "Q23_09",
  "row": "solve",
  "duration": 7.22,
  "disp": "D：2 到 10 公分這一整段，20 MeV 的 X 光一直維持高劑量，四條曲線裡面它最適合。對。",
  "en": "D: over the whole range from 2 to 10 cm, the 20 MeV X-ray stays at a high dose, the best fit of the four curves. Right."
 },
 {
  "id": "Q23_10",
  "row": "solve",
  "duration": 6.28,
  "disp": "E：3 到 8 公分，電子束根本到不了，結合電子束沒有用。錯。答案 B、D。",
  "en": "E: the electron beam cannot reach 3 to 8 cm, so adding it does nothing. Wrong. The answer is B and D."
 },
 {
  "id": "Q23_11",
  "row": "story",
  "duration": 6.69,
  "disp": "質子為什麼最後才爆發？質子跑得越慢，每走一公分，丟給組織的能量就越多。",
  "en": "Why does the proton peak at the end? The slower it goes, the more energy it hands to the tissue per centimeter."
 },
 {
  "id": "Q23_12",
  "row": "story",
  "duration": 5.71,
  "disp": "快停下來的那一段丟得最兇，就形成一個尖峰，這個尖峰叫做布拉格峰。",
  "en": "Just before it stops it hands over the most, forming a spike called the Bragg peak."
 },
 {
  "id": "Q23_13",
  "row": "trick",
  "duration": 5.53,
  "disp": "秒殺口訣：照這張圖，淺的用電子，深的用質子，一整段用高能 X 光。",
  "en": "The quick rule, from this graph: shallow, use electrons; deep, use protons; a long stretch, use high-energy X-rays."
 }
];
/* tracks:end */
