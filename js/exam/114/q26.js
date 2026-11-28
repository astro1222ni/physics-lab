/* 114 學測第 26 題：四種基本交互作用（單選 B，答對率 56%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg}=K, C=K.colors;
  Exam114.add(26,{
    lab:'electric-field',labName:['電場與等位線','Electric fields and equipotentials'],
    ask:['有關物質間的基本交互作用的敘述，下列何者正確？','Which statement about the fundamental interactions between matter is correct?'],
    choices:[['強力作用範圍涵蓋於整個原子','The strong force acts over the whole atom.'],
      ['地板支撐體重的接觸力，其來源是電磁力的作用','The contact force with which the floor supports your weight comes from the electromagnetic force.'],
      ['兩物體接觸時極為靠近，故萬有引力為摩擦力的主要來源','Because touching objects are extremely close, gravitation is the main source of friction.'],
      ['原子中電子繞行原子核類似於行星繞行地球，是靠萬有引力的束縛','Electrons orbit the nucleus like planets orbiting the Earth, bound by gravitation.'],
      ['強力仍不足以克服質子間的相斥靜電力，須加上弱力才能使質子束縛於原子核中','The strong force alone cannot overcome the electrostatic repulsion between protons; the weak force is needed to bind protons in the nucleus.']],
    key:'B',rate:56,shares:[8,56,8,11,17],
    hint:['把腳底和地板放大到原子：靠得太近時，是哪一種力把你往上推？','Zoom into the atoms of your sole and the floor. When they get very close, which force pushes you up?'],
    hands:['把力分到四種交互作用','Sort forces into the four interactions'],mid:'solve',
    caption:['重力、電磁力、強力、弱力','Gravity, electromagnetism, strong and weak forces'],
    focus:/強力|弱力|電磁力|電力|萬有引力|靜電|庫侖|正向力|接觸力|摩擦力|β 衰變|核融合|原子核|strong (?:force|interaction)|weak (?:force|interaction)|electromagnetic|electric|gravit\w*|electrostatic|Coulomb|normal force|contact forces?|friction|beta decay|fusion|nucleus/i,
    groups:{wrong:['強力撐不住？','Is the strong force too weak?'],flip:['剛好相反','Exactly the opposite'],solve:['接觸力的本質','What contact forces really are'],joke:['原子互相嫌棄','Atoms that keep their distance'],others:['其他選項','The other choices'],trick:['日常的力','Everyday forces']},
    board:{wrong:[S`F_{\text{強}}<F_{\text{電}}\;?`,S`F_{\rm strong}<F_{\rm e}\;?`],flip:[S`F_{\text{強}}\gg F_{\text{電}}\quad(r\sim10^{-15}\ \mathrm m)`,S`F_{\rm strong}\gg F_{\rm e}\quad(r\sim10^{-15}\ \mathrm m)`],solve:[S`N,\ f\ \Rightarrow\ F_{\text{電磁}}`,S`N,\ f\ \Rightarrow\ F_{\rm EM}`],others:[S`r_{\text{原子核}}\sim10^{-15}\ \mathrm m,\quad r_{\text{原子}}\sim10^{-10}\ \mathrm m`,S`r_{\rm nucleus}\sim10^{-15}\ \mathrm m,\quad r_{\rm atom}\sim10^{-10}\ \mathrm m`],trick:[S`F_{\text{電磁}}:\ N,\ f,\ T,\ \dots`,S`F_{\rm EM}:\ N,\ f,\ T,\ \dots`]},
    specific:{Q26_09:S`n\to p+e^-+\bar\nu`,Q26_24:S`\boxed{B}`}
  });
  const nucleon=(g,x,y,p,r=9)=>{const grad=g.createRadialGradient(x-r/3,y-r/3,1,x,y,r);grad.addColorStop(0,p?'#ffb0a8':'#e4eef2');grad.addColorStop(1,p?'#c4463c':'#7d8f98');K.dot(g,x,y,r,grad);if(p)label(g,'+',x,y+r*.45,'#3a0d0a',r*1.2,'center');};
  function nucleus(g,cx,cy,sc=1){
    const pts=[[0,0,1],[15,4,0],[-14,6,1],[4,-15,0],[-6,15,0],[16,-11,1],[-15,-10,0],[10,15,1]];
    for(const [x,y,p] of pts)nucleon(g,cx+x*sc,cy+y*sc,p,9.5*sc);
  }
  function atomRow(g,y,n,x0,dx,color){for(let i=0;i<n;i++){const x=x0+i*dx;K.dot(g,x,y,16,color+'33');K.dot(g,x,y,4,color);}}
  const ITEMS=[['地板撐住你（正向力）','The floor holding you up (normal force)',1],['推箱子時的摩擦力','Friction on a box you push',1],['月球繞地球','The Moon orbiting Earth',0],['電子繞原子核','Electrons around the nucleus',1],['質子、中子綁在原子核裡','Protons and neutrons bound in a nucleus',2],['β 衰變：中子變質子','Beta decay: a neutron becomes a proton',3],['繩子的張力','Tension in a rope',1],['蘋果落地','An apple falling',0]];
  const FORCES=[['重力','Gravity','#c7a4ff'],['電磁力','Electromagnetic','#7fb6ff'],['強力','Strong','#ff8a80'],['弱力','Weak','#6fe0a8']];
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){nucleus(g,120,125,1.6);arrow(g,98,135,58,152,C.red,2.5,9);arrow(g,140,150,184,172,C.red,2.5,9);
      label(g,T('質子互相排斥','protons repel'),120,230,C.red,15,'center');label(g,T('強力撐不住？','strong force not enough?'),246,90,C.white,17);label(g,T('→ 找弱力來幫？','→ call the weak force?'),246,128,C.red,18);return;}
    if(r==='flip'){
      if(id==='Q26_07'){label(g,T('剛好相反','Exactly the opposite'),230,130,C.gold,32,'center');return;}
      if(id==='Q26_08'){nucleus(g,110,120,1.6);g.beginPath();g.arc(110,120,46,0,Math.PI*2);g.strokeStyle='#ff8a80';g.lineWidth=3;g.setLineDash([6,4]);g.stroke();g.setLineDash([]);
        label(g,T('原子核尺度','at nuclear distance'),246,40,C.faint,14);
        for(const [i,zh,en,w,c] of [[0,'強力','strong',190,'#ff8a80'],[1,'電力','electric',190/137*6,'#7fb6ff']]){label(g,T(zh,en),246,78+i*44,c,16);box(g,246,86+i*44,Math.max(3,w*seg(k,.1,.6)),14,4,c);}
        label(g,T('強力 ≫ 電力','strong ≫ electric'),246,186,C.gold,20);return;}
      if(id==='Q26_09'||id==='Q26_10'){
        const u=id==='Q26_09'?seg(k,.2,.8):1;nucleon(g,100,110,u>.5);label(g,u>.5?'p':'n',100,90,C.faint,14,'center');
        if(u>.5){arrow(g,112,114,112+90*u,150,C.blue,2,8);K.dot(g,112+90*u,150,4,'#cfe4ff');sci(g,'e^{−}',124+90*u,160,C.blue,15);}
        label(g,T('弱力：β 衰變','Weak force: beta decay'),246,60,C.green,18);sci(g,T('n → p + e^{−} + 反微中子','n → p + e^{−} + antineutrino'),246,100,C.white,16);
        if(id==='Q26_10'){const grad=g.createRadialGradient(360,180,4,360,180,40);grad.addColorStop(0,'#fff3b0');grad.addColorStop(1,'#ff9a3a00');g.fillStyle=grad;g.fillRect(310,130,100,100);label(g,T('沒有弱力就沒有太陽的核融合','no weak force, no fusion in the Sun'),230,236,C.gold,15,'center');}
        return;}
      label(g,T('E 錯','E is false'),230,124,C.red,32,'center');mark(g,320,112,false,14);return;
    }
    if(r==='solve'){
      if(id==='Q26_17'){label(g,T('B 為什麼對？','Why is B right?'),230,128,C.gold,30,'center');return;}
      // 腳底的原子在上、地板的原子在下，靠近時電子雲互斥
      const gap=id==='Q26_18'?42-18*seg(k,.2,.7):24;
      box(g,0,0,460,64,0,'#c99a6e22');label(g,T('腳底','sole'),12,26,C.faint,13);atomRow(g,96-gap/2,7,70,52,'#ffd17e');
      label(g,T('地板','floor'),12,236,C.faint,13);atomRow(g,150+gap/2,7,70,52,'#8ae6d7');
      for(let i=0;i<7;i++){const x=70+i*52;arrow(g,x,118-gap/2,x,106-gap/2-6,C.blue,2,7);}
      arrow(g,430,170,430,90,C.gold,4,12);label(g,'N',440,140,C.gold,18);
      label(g,T('庫侖排斥','Coulomb repulsion'),230,124,C.blue,15,'center');
      if(id==='Q26_19'){box(g,120,212,220,32,8,'#0b2233','#7fb6ff');label(g,T('接觸力 → 電磁力','contact force → EM'),230,234,C.white,17,'center');}
      return;
    }
    if(r==='joke'){atomRow(g,90,6,80,60,'#ffd17e');atomRow(g,150,6,80,60,'#8ae6d7');
      for(let i=0;i<6;i++){const x=80+i*60;label(g,'≠',x,126,C.red,18,'center');}label(g,T('互相嫌棄','mutual dislike'),230,220,C.gold,20,'center');return;}
    if(r==='others'){
      if(id==='Q26_21'){g.beginPath();g.arc(120,125,90,0,Math.PI*2);g.strokeStyle='#7fb6ff55';g.lineWidth=1.5;g.stroke();K.dot(g,120,125,3,'#ff8a80');
        sci(g,T('原子 ~ 10^{−10} m','atom ~ 10^{−10} m'),246,70,C.blue,17);sci(g,T('原子核 ~ 10^{−15} m','nucleus ~ 10^{−15} m'),246,104,'#ff8a80',17);
        label(g,T('小了約 10 萬倍','about 100,000 times smaller'),246,146,C.gold,16);label(g,T('A：強力只在核裡','A: strong force stays in the nucleus'),246,200,C.red,14);mark(g,440,194,false,9);return;}
      if(id==='Q26_22'){atomRow(g,90,5,70,60,'#ffd17e');atomRow(g,140,5,100,60,'#8ae6d7');for(let i=0;i<5;i++)arrow(g,70+i*60,104,92+i*60,128,C.blue,2,7);
        label(g,T('C：摩擦力也是電磁力','C: friction is electromagnetic too'),230,200,C.white,16,'center');label(g,T('萬有引力小到可以忽略','gravity is negligible here'),230,226,C.faint,14,'center');return;}
      if(id==='Q26_23'){nucleon(g,120,125,1);g.beginPath();g.arc(120,125,60,0,Math.PI*2);g.strokeStyle='#7fb6ff88';g.stroke();const a=s.t*1.4;K.dot(g,120+60*Math.cos(a),125+60*Math.sin(a),5,'#cfe4ff');
        label(g,T('D：靠靜電吸引力','D: electrostatic attraction'),246,110,C.white,16);label(g,T('不是萬有引力','not gravitation'),246,140,C.red,16);return;}
      label(g,T('答案 B','Answer B'),230,124,C.green,32,'center');mark(g,326,112,true,13);return;
    }
    if(r==='trick'){
      FORCES.forEach(([zh,en,c],i)=>{const x=20+(i%2)*222,y=26+Math.floor(i/2)*110;box(g,x,y,206,96,10,c+'1f',c,2);label(g,T(zh,en),x+12,y+28,c,19);});
      label(g,T('蘋果落地、月球','apples, the Moon'),32,90,C.white,14);label(g,T('推、拉、摩擦、張力…','push, friction, tension…'),254,90,C.white,14);
      label(g,T('只在原子核裡上班','works only in nuclei'),32,200,C.white,14);label(g,T('只在原子核裡上班','works only in nuclei'),254,200,C.white,14);
      return;
    }
  }
  function hands(g,s){
    if(s.i>=ITEMS.length){label(g,T('全部分好了！','All sorted!'),230,90,C.green,26,'center');label(g,T('對了 ','Correct: ')+s.right+' / '+ITEMS.length,230,130,C.white,18,'center');
      label(g,s.right===ITEMS.length?T('日常的力幾乎都是電磁力','Everyday forces: nearly all EM'):T('按「重來」再分一次','Press “Restart” to try again'),230,170,C.gold,16,'center');return;}
    const [zh,en]=ITEMS[s.i];label(g,(s.i+1)+' / '+ITEMS.length,20,30,C.faint,14);
    box(g,40,48,380,56,12,'#0b2233','#35505f');label(g,T(zh,en),230,84,C.white,19,'center');
    FORCES.forEach(([fz,fe,c],j)=>{const x=20+j*108;box(g,x,138,100,70,10,c+(s.flash===j?'55':'18'),c,2);label(g,T(fz,fe),x+50,180,c,15,'center');});
    if(s.msg)label(g,s.msg,230,236,s.ok?C.green:C.red,14,'center');
  }
  ExamScene.add(26,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,i:0,right:0,msg:'',ok:false,flash:-1,missed:false}),
    paint,
    preview(g){FORCES.forEach(([zh,en,c],i)=>{const x=24+(i%2)*218,y=30+Math.floor(i/2)*104;box(g,x,y,196,88,10,c+'1f',c,2);label(g,T(zh,en),x+98,y+54,c,LabSettings.lang==='en'?21:28,'center');});},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,btn,complete,render}){
      s.hands=true;
      function pick(j){if(s.i>=ITEMS.length)return;const ok=ITEMS[s.i][2]===j;s.flash=j;s.ok=ok;
        if(ok){if(!s.missed)s.right++;s.msg=T('對！','Right!');s.i++;s.missed=false;if(s.i>=ITEMS.length&&s.right===ITEMS.length)complete();}
        else{s.missed=true;s.msg=T('再想想：放大到原子看看','Think again: zoom into the atoms');}
        if(LabSettings.get('sound'))LabSound.tone({freq:ok?740:300,dur:.12,type:'triangle',gain:.12});}
      FORCES.forEach(([zh,en],j)=>btn(T(zh,en),()=>pick(j)));
      btn(T('重來','Restart'),()=>{s.i=0;s.right=0;s.msg='';s.flash=-1;s.missed=false;});
      return {hit:(x,y)=>{if(y>=138&&y<=208){const j=Math.floor((x-20)/108);if(j>=0&&j<4&&x-20-j*108<=100){pick(j);render();}}return null;},move:()=>{}};
    },
    read(s,output){output.textContent=T('一次就分對的：','Right on the first try: ')+s.right+' / '+ITEMS.length;}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q26=[
 {
  "id": "Q26_06",
  "row": "wrong",
  "duration": 7.94,
  "disp": "選 E 的人想：原子核裡的質子都帶正電，互相排斥，光靠強力應該撐不住，再找弱力來幫忙吧？",
  "en": "Those who chose E thought: protons in the nucleus are all positive and repel each other, so the strong force alone can't hold them, and the weak force must help?"
 },
 {
  "id": "Q26_07",
  "row": "flip",
  "duration": 1.27,
  "disp": "剛好相反。",
  "en": "It's exactly the opposite."
 },
 {
  "id": "Q26_08",
  "row": "flip",
  "duration": 10.11,
  "disp": "強力是 4 種力裡面最強的，在原子核那麼小的距離裡，它比質子之間的電力強得多，一個就撐得住，不用弱力幫忙。",
  "en": "The strong force is the strongest of the 4; at nuclear distances it's far stronger than the electric force between protons, so it holds on alone, no help needed."
 },
 {
  "id": "Q26_09",
  "row": "flip",
  "duration": 5.34,
  "disp": "弱力管的是另一件事：β 衰變，讓中子變成質子。",
  "en": "The weak force handles something else: beta decay, turning a neutron into a proton."
 },
 {
  "id": "Q26_10",
  "row": "flip",
  "duration": 6.84,
  "disp": "弱力那一課我講過，沒有弱交互作用，就沒有 β 衰變，也就沒有太陽的核融合。",
  "en": "As I said in the weak-force lesson: without the weak interaction, there's no beta decay, and no fusion in the Sun."
 },
 {
  "id": "Q26_11",
  "row": "flip",
  "duration": 0.95,
  "disp": "所以 E 錯。",
  "en": "So E is wrong."
 },
 {
  "id": "Q26_17",
  "row": "solve",
  "duration": 1.04,
  "disp": "B 為什麼對？",
  "en": "Why is B right?"
 },
 {
  "id": "Q26_18",
  "row": "solve",
  "duration": 13.63,
  "disp": "我在課堂上是這樣講的：把尺度縮小到原子來看：腳底的原子和地板的原子靠太近，靜電庫侖排斥力就會變大，把你往上推，這就是正向力，本質是電磁力。",
  "en": "In class I put it this way: zoom down to atoms. When your sole's atoms get too close to the floor's, the Coulomb repulsion grows and pushes you up. That's the normal force, electromagnetic at heart."
 },
 {
  "id": "Q26_19",
  "row": "solve",
  "duration": 4.39,
  "disp": "所以接觸力打破砂鍋問到底，追本溯源都是電磁力。",
  "en": "So dig all the way down, and contact forces all come from electromagnetism."
 },
 {
  "id": "Q26_20",
  "row": "joke",
  "duration": 4.73,
  "disp": "你站在地板上沒掉下去，是兩邊的原子在互相嫌棄。",
  "en": "You don't fall through the floor because the atoms on both sides can't stand each other."
 },
 {
  "id": "Q26_21",
  "row": "others",
  "duration": 9.22,
  "disp": "A，強力只在原子核的範圍，大約 \\(10^{-15}\\) 公尺，比原子小了大約 10 萬倍，不會涵蓋整個原子，錯。",
  "en": "A: the strong force acts only within the nucleus, about \\(10^{-15}\\) m, roughly 100,000 times smaller than an atom, so it doesn't cover the whole atom. Wrong."
 },
 {
  "id": "Q26_22",
  "row": "others",
  "duration": 9.56,
  "disp": "C，萬有引力在原子之間小到可以忽略；摩擦力是兩邊的原子伸出友誼的手、拉來拉去，那隻手也是電磁力，錯。",
  "en": "C: gravity between atoms is negligible; friction is atoms on both sides reaching out friendly hands and tugging, and those hands are electromagnetic too. Wrong."
 },
 {
  "id": "Q26_23",
  "row": "others",
  "duration": 4.63,
  "disp": "D，電子繞原子核，靠的是靜電吸引力，不是萬有引力，錯。",
  "en": "D: electrons orbit the nucleus by electrostatic attraction, not gravity. Wrong."
 },
 {
  "id": "Q26_24",
  "row": "others",
  "duration": 0.94,
  "disp": "答案 B。",
  "en": "The answer is B."
 },
 {
  "id": "Q26_25",
  "row": "trick",
  "duration": 9.7,
  "disp": "秒殺：日常生活摸得到、推得動的力，除了重力，追本溯源幾乎都是電磁力；強力和弱力，只在原子核裡面上班。",
  "en": "The shortcut: everyday forces you can touch and push, apart from gravity, almost all come down to electromagnetism; the strong and weak forces only clock in inside the nucleus."
 }
];
/* tracks:end */
