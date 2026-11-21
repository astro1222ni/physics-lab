/* 114 學測第 25 題：電子雙狹縫（單選 D，答對率 74%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg}=K, C=K.colors, P=ExamPhysics;
  const CLOUD=P.electrons(4000,7); // 固定的一群電子落點（u：條紋單位、v：0..1 高度）
  // 五種圖樣，畫在 (x,y,w,h) 的黑框裡；n＝要畫幾顆電子（只對 D、E 有用）
  function pattern(g,i,x,y,w,h,n=2600){
    g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.fillStyle='#03080c';g.fillRect(x,y,w,h);
    const cx=x+w/2,cy=y+h/2;
    if(i===0){ // 規則點陣＋擋板
      for(let a=-6;a<=6;a++)for(let b=-6;b<=6;b++){const px=cx+a*w*.07+b*w*.035,py=cy+b*h*.11;const r=Math.max(.8,3.2-Math.hypot(a,b)*.35);K.dot(g,px,py,r,'#e8f0f2');}
      line(g,cx,cy,x+w*.95,y+h*.95,'#03080c',4);line(g,cx,cy,x+w*.95,y+h*.95,'#9aa',1);
    }else if(i===1){ // 十字形點陣
      for(let a=-9;a<=9;a++)for(let b=-1;b<=1;b++){K.dot(g,cx+a*w*.05,cy+b*h*.06,Math.max(.7,2.4-Math.abs(a)*.18),'#ff5a6a');K.dot(g,cx+b*w*.035,cy+a*h*.06,Math.max(.7,2.4-Math.abs(a)*.18),'#ff5a6a');}
      K.dot(g,cx,cy,5,'#ffd0d5');
    }else if(i===2){ // 同心圓環
      const glow=g.createRadialGradient(cx,cy,0,cx,cy,h*.18);glow.addColorStop(0,'#ffffff');glow.addColorStop(1,'#ffffff00');g.fillStyle=glow;g.fillRect(x,y,w,h);
      for(const [r,a] of [[.2,.9],[.29,.6],[.36,.75],[.46,.4],[.56,.3]]){g.beginPath();g.arc(cx,cy,h*r,0,Math.PI*2);g.strokeStyle='rgba(235,240,245,'+a+')';g.lineWidth=1.6;g.stroke();}
    }else if(i===3){ // 顆粒狀亮點排成平行條紋
      for(const [u,v] of CLOUD.slice(0,n))K.dot(g,cx+u/4.6*w/2,y+v*h,.9,'#e8f0f2');
    }else{ // 單一亮帶
      const r=P.random(3);for(let j=0;j<n*.6;j++){const u=(r()+r()+r()-1.5)*.5;K.dot(g,cx+u*w*.35,y+r()*h,.9,'#e8f0f2');}
    }
    g.restore();
  }
  Exam114.add(25,{
    lab:'slit-interference',labName:['雙狹縫干涉與單狹縫繞射','Double-slit interference and single-slit diffraction'],
    ask:['科學家進行電子雙狹縫實驗，成功觀測到電子經過雙狹縫後產生干涉分布，其圖樣與光通過雙狹縫後的干涉圖樣類似，證明了粒子也具有波動性。下列何者最可能為科學家觀察到大量電子經過雙狹縫後的干涉分布？','Scientists performed the electron double-slit experiment and observed an interference distribution similar to that of light through a double slit, showing that particles also behave as waves. Which is most likely the distribution observed after a large number of electrons pass through the double slit?'],
    choices:[['規則排列的亮點（中央有擋板）','A regular array of spots (with a beam stop)'],['十字形排列的亮點','Spots arranged in a cross'],['同心圓環','Concentric rings'],['顆粒狀亮點排成平行條紋','Grainy dots forming parallel fringes'],['單一條亮帶','A single bright band']],
    choiceArt(canvas,i){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);const g=canvas.getContext('2d');g.scale(d,d);pattern(g,i,0,0,r.width,r.height,1800);},
    key:'D',rate:74,shares:[3,11,8,74,5],
    hint:['雙狹縫只有「一個方向」排著兩條縫，條紋該長什麼樣子？電子又是一顆一顆打到屏上的。','A double slit has two slits side by side in one direction. What shape should the fringes have? And electrons arrive one at a time.'],
    hands:['一顆一顆發射電子','Fire electrons one by one'],mid:'solve',
    caption:['電子一顆一顆打上屏幕','Electrons arriving one at a time'],
    focus:/雙狹縫|干涉|繞射|二維|平行|一顆一顆|亮點|條紋|粒子|波動性|波的|物質波|明暗相間|double slit|interference|diffraction|two-dimensional|parallel|one (?:at a time|by one)|dots?|fringes|particles?|wave\w*|matter wave/i,
    groups:{wrong:['整齊的亮點不是雙狹縫','Neat spots are not a double slit'],solve:['一顆一顆打上去','One electron at a time'],dual:['波粒二象性','Wave–particle duality'],joke:['一群才看得出規矩','Only a crowd shows the pattern'],trick:['口訣','The rule']},
    board:{wrong:S`A,\,B,\,C:\ \text{2-D}`,solve:S`\boxed{D}`,dual:S`\lambda=\dfrac{h}{p}`,trick:S`1\ e^-\ \to\ \bullet,\qquad N\ e^-\ \to\ \|\;\|\;\|`},
    specific:{}
  });
  function slits(g,x,top,bottom){
    g.fillStyle='#6f8a96';g.fillRect(x-4,top,8,bottom-top);g.fillStyle='#081c2c';const mid=(top+bottom)/2;g.fillRect(x-5,mid-18,10,8);g.fillRect(x-5,mid+10,10,8);
  }
  function gun(g,x,y){box(g,x-30,y-12,32,24,5,'#4c8fd1');g.fillStyle='#9cc8f0';g.fillRect(x,y-4,8,8);}
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){
      if(id==='Q25_08'){pattern(g,1,150,30,220,190);label(g,T('一格一格很整齊……','Neat and regular…'),260,240,C.white,15,'center');label(g,T('像干涉？','interference?'),390,60,C.red,18);return;}
      if(id==='Q25_09'){[0,1,2].forEach(i=>{pattern(g,i,14+i*148,52,136,110);label(g,'ABC'[i],82+i*148,182,C.red,20,'center');});
        label(g,T('晶體、網格這類二維結構的繞射','Diffraction by 2-D structures: crystals, grids'),230,226,C.white,15,'center');return;}
      gun(g,40,125);slits(g,170,40,210);arrow(g,52,125,150,125,C.faint,1.5,7);
      pattern(g,3,290,36,140,180,3200);label(g,T('一條一條平行','parallel fringes'),360,236,C.teal,15,'center');label(g,T('雙狹縫','double slit'),170,232,C.faint,13,'center');
      return;
    }
    if(r==='solve'){
      if(id==='Q25_14'){pattern(g,4,110,30,160,180,2600);mark(g,320,96,false,16);label(g,T('E：只有一條亮帶','E: one bright band'),296,148,C.red,17);label(g,T('沒有明暗相間','no light-dark pattern'),296,176,C.faint,15);return;}
      if(id==='Q25_15'){pattern(g,3,150,30,160,180,3600);label(g,T('答案 D','Answer D'),326,120,C.green,26);mark(g,438,112,true,11);return;}
      const n=id==='Q25_11'?Math.round(1+30*k):id==='Q25_12'?Math.round(30+3500*k*k):3600;
      gun(g,40,125);slits(g,120,40,210);
      // 正在飛的一顆
      const fly=(s.t*1.7)%1;K.dot(g,52+(260-52)*fly,125+(CLOUD[Math.floor(s.t*1.7)%400][1]-.5)*120*fly,3,'#cfe4ff');
      pattern(g,3,260,30,170,190,n);label(g,n+T(' 顆',' electrons'),345,240,C.faint,14,'center');
      if(id==='Q25_12'){label(g,n<200?T('一個亮點＝粒子','a dot = a particle'):T('聚成條紋＝波','fringes = a wave'),140,24,n<200?C.gold:C.teal,16,'center');}
      if(id==='Q25_13'){label(g,T('D 就是這樣','That is D'),140,24,C.green,17,'center');}
      return;
    }
    if(r==='dual'){
      const col=(x,title,a,b,c)=>{label(g,title,x,52,c,22,'center');label(g,a,x,96,C.white,17,'center');label(g,'+',x,126,C.faint,17,'center');label(g,b,x,156,C.gold,17,'center');};
      col(120,T('光','Light'),T('原本以為是波','thought a wave'),T('也有粒子性','also a particle'),'#ffe27a');
      col(340,T('電子','Electron'),T('原本以為是粒子','thought a particle'),T('也有波動性','also a wave'),'#7fb6ff');
      line(g,230,30,230,170,'#35505f');
      if(id==='Q25_17'){pattern(g,3,150,182,160,56,1200);label(g,T('證據','evidence'),326,216,C.teal,15);}
      return;
    }
    if(r==='joke'||r==='trick'){
      box(g,40,40,150,170,8,'#03080c');K.dot(g,118,126,2,'#e8f0f2');label(g,T('一顆','one'),115,232,C.gold,17,'center');
      pattern(g,3,260,40,160,170,3200);label(g,T('一群','a crowd'),340,232,C.teal,17,'center');
      if(r==='trick'){label(g,T('粒子','particle'),115,28,C.gold,16,'center');label(g,T('波','wave'),340,28,C.teal,16,'center');}
      else if(id==='Q25_19'){box(g,214,96,32,32,16,'#ffd17e22','#ffd17e');line(g,230,112,230,101,C.gold,2);line(g,230,112,238,116,C.gold,2);label(g,T('第一節','1st period'),230,150,C.gold,12,'center');}
      return;
    }
  }
  function hands(g,s){
    gun(g,36,125);slits(g,106,40,210);
    const x0=150,w=290;box(g,x0,22,w,206,4,'#03080c','#35505f');
    for(const [u,v] of s.hits)K.dot(g,x0+w/2+u/4.6*w/2,22+v*206,s.hits.length>800?.9:1.6,'#e8f0f2');
    // 11/21 站長：「疊上理論曲線對比不清楚」→ 疊曲線時先把亮點壓暗，曲線加粗、加黑色外框、拉高到幾乎滿框
    if(s.curve){g.fillStyle='#03080ca6';g.fillRect(x0+1,23,w-2,204);
      g.beginPath();for(let i=0;i<=240;i++){const u=-4.6+9.2*i/240,x=x0+w/2+u/4.6*w/2,y=224-P.slit(u)*150;i?g.lineTo(x,y):g.moveTo(x,y);}
      g.lineJoin='round';g.strokeStyle='#03080c';g.lineWidth=7;g.stroke();g.strokeStyle='#7dffe0';g.lineWidth=3.2;g.stroke();
      label(g,T('理論：亮紋在這裡','Theory: bright fringes here'),x0+8,44,'#7dffe0',13);}
    {const txt=s.hits.length+T(' 顆',' electrons');g.font='700 15px system-ui,sans-serif';const tw=g.measureText(txt).width;
      box(g,x0+w-14-tw,28,tw+12,24,6,'#03080cd9','#03080cd9');label(g,txt,x0+w-8,45,C.gold,15,'right');}
    if(s.last){const [u,v]=s.last;K.dot(g,x0+w/2+u/4.6*w/2,22+v*206,5,'#ffd17e88');}
  }
  ExamScene.add(25,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,hits:[],last:null,curve:false,rng:P.random(11)}),
    paint,
    preview(g){g.save();g.translate(28,125);g.scale(1.5,1.5);g.translate(-28,-125);gun(g,40,125);g.restore();slits(g,140,30,220);arrow(g,62,125,124,125,C.faint,2,9);box(g,236,20,200,200,6,'#03080c','#35505f');
      label(g,'?',336,150,C.gold,72,'center');label(g,T('電子','electrons'),46,172,C.faint,LabSettings.lang==='en'?18:20,'center');label(g,T('雙狹縫','double slit'),140,244,C.faint,20,'center');label(g,T('屏幕','screen'),336,244,C.faint,20,'center');},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,btn,toggle,complete}){
      s.hands=true;
      function fire(n){for(let j=0;j<n;j++){let u,v;do{u=(s.rng()*2-1)*4.6;}while(s.rng()>P.slit(u));v=s.rng();s.hits.push([u,v]);s.last=[u,v];}
        if(LabSettings.get('sound'))LabSound.tone({freq:880,dur:.04,type:'square',gain:.06});if(s.hits.length>=2000)complete();}
      btn(T('發射 1 顆','Fire 1'),()=>fire(1));btn(T('連發 100 顆','Fire 100'),()=>fire(100));btn(T('連發 1000 顆','Fire 1000'),()=>fire(1000));
      toggle('疊上理論曲線','Show theory curve',v=>s.curve=v);
      btn(T('全部清除','Clear all'),()=>{s.hits=[];s.last=null;});
      return {};
    },
    read(s,output){const n=s.hits.length;output.textContent=n===0?T('按「發射 1 顆」：每顆電子只在屏上留下一個點。','Press “Fire 1”: each electron leaves a single dot.'):n<300?T('現在 '+n+' 顆：還看不出規律，像一顆顆粒子。','Now '+n+': no pattern yet, just particles.'):T('現在 '+n+' 顆：亮點聚成明暗相間的平行條紋，這是波的干涉。','Now '+n+': the dots build parallel bright and dark fringes, a wave pattern.');}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q25=[
 {
  "id": "Q25_08",
  "row": "wrong",
  "duration": 5.04,
  "disp": "選 B 的人，看到一格一格很整齊的亮點，覺得很像干涉。",
  "en": "Those who chose B saw neat rows of bright dots and thought it looked like interference."
 },
 {
  "id": "Q25_09",
  "row": "wrong",
  "duration": 8.72,
  "disp": "可是 A、B、C 這種二維的點陣、圓環，是電子或光碰到晶體、網格這類二維結構，才會出現的繞射圖。",
  "en": "But 2D dot grids and rings like A, B, and C are diffraction patterns, appearing when electrons or light hit 2D structures like crystals or meshes."
 },
 {
  "id": "Q25_10",
  "row": "wrong",
  "duration": 4.93,
  "disp": "雙狹縫只有一個方向有兩條縫，條紋應該是一條一條平行的。",
  "en": "A double slit has two slits in one direction only, so the fringes should be parallel lines."
 },
 {
  "id": "Q25_11",
  "row": "solve",
  "duration": 2.88,
  "disp": "而且電子是一顆一顆打上去的。",
  "en": "And electrons land one at a time."
 },
 {
  "id": "Q25_12",
  "row": "solve",
  "duration": 8.44,
  "disp": "每一顆在屏上只留下一個小亮點，這是粒子的樣子；打得夠多，亮點聚集成明暗相間的條紋，這是波的樣子。",
  "en": "Each leaves a single dot on the screen, which is particle-like; with enough of them, the dots build bright and dark fringes, which is wave-like."
 },
 {
  "id": "Q25_13",
  "row": "solve",
  "duration": 4.04,
  "disp": "D 就是這樣：一顆一顆的亮點，排出一條一條的條紋。",
  "en": "That's D: dots, one by one, forming fringes, line by line."
 },
 {
  "id": "Q25_14",
  "row": "solve",
  "duration": 3.92,
  "disp": "E 只有一條亮帶，沒有明暗相間，不是干涉，錯。",
  "en": "E has only one bright band, no alternating bright and dark, so it's not interference. Wrong."
 },
 {
  "id": "Q25_15",
  "row": "solve",
  "duration": 0.92,
  "disp": "答案 D。",
  "en": "The answer is D."
 },
 {
  "id": "Q25_16",
  "row": "dual",
  "duration": 6.64,
  "disp": "我上課講物質波的時候說過：原本以為是波的光，有粒子性；原本以為是粒子的電子，也有波的特性。",
  "en": "When I teach matter waves, I say: light, once thought a wave, has particle properties; electrons, once thought particles, have wave properties too."
 },
 {
  "id": "Q25_17",
  "row": "dual",
  "duration": 3.66,
  "disp": "這一題的圖，就是電子有波動性的證據。",
  "en": "The pattern in this question is evidence that electrons behave like waves."
 },
 {
  "id": "Q25_18",
  "row": "joke",
  "duration": 3.63,
  "disp": "一顆電子看不出什麼，一群電子才看得出規矩。",
  "en": "One electron shows you nothing; a crowd of them shows the rules."
 },
 {
  "id": "Q25_19",
  "row": "joke",
  "duration": 4.71,
  "disp": "就像一個學生遲到看不出什麼，全班都遲到，就知道是第一節物理課。",
  "en": "Like one student being late tells you nothing, but the whole class late? Must be first-period physics."
 },
 {
  "id": "Q25_21",
  "row": "trick",
  "duration": 2.88,
  "disp": "秒殺口訣：一顆看粒子，一群看波。",
  "en": "The shortcut: one shows a particle, a crowd shows a wave."
 }
];
/* tracks:end */
