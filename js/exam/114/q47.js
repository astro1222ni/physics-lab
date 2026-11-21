/* 114 學測第 47 題：神經細胞膜的單位（多選 AE，得分率 39%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg}=K, C=K.colors, P=ExamPhysics;
  const Q49=Exam114.questions[49];
  // 五個選項的單位推導（[kg, m, s, A, K] 由 ExamPhysics.units 驗算）
  const OPTS=[['A','e E',[['e',1],['E',1]],'C × V = J'],['B','T',[['T',1]],'K'],['C','α / e',[['alpha',1],['e',-1]],'(J/K) ÷ C = V/K'],['D','T / e',[['T',1],['e',-1]],'K / C'],['E','α T',[['alpha',1],['T',1]],'(J/K) × K = J']];
  Exam114.add(47,{
    lab:'ohms-law',labName:['歐姆定律','Ohm’s law'],
    group:Q49.group,passage:Q49.passage,figs:'fig12-14',open:true,
    ask:['下列選項的單位，哪些與能量相同？（應選 2 項）','Which of the following have the same unit as energy? Choose two.'],
    choices:[S`\(eE\)`,S`\(T\)`,S`\(\alpha/e\)`,S`\(T/e\)`,S`\(\alpha T\)`].map(x=>[x,x]),
    key:'AE',rate:39,shares:[65,18,35,31,41],
    hint:[S`\(E\) 是電壓（伏特），\(e\) 是電量（庫侖）。\(\log\) 裡面是濃度除以濃度，還有單位嗎？`,S`\(E\) is a voltage (volts) and \(e\) a charge (coulombs). Inside the log is a ratio of concentrations: does it have a unit?`],
    hands:['檢查每個選項的單位','Check each choice’s unit'],mid:'solve',
    caption:['平衡電壓的式子：先看單位','The equilibrium-voltage formula: check the units first'],
    focus:/單位|伏特|焦耳|庫侖|電量|電壓|能量|log|沒有單位|克耳文|電子伏特|units?|volts?|joules?|coulombs?|charge|voltage|energy|no unit|kelvins?|electron ?volts?/i,
    groups:{ai:['會考試與會指揮','Taking tests and directing AI'],wrong:['式子很嚇人','A scary formula'],solve:['先看單位','Look at the units'],others:['其他選項','The other choices'],trick:['電量乘電壓','Charge times voltage']},
    board:{ai:S`E=-\dfrac{\alpha T}{e}\log\dfrac{n_{\rm in}}{n_{\rm out}}`,wrong:S`E=-\dfrac{\alpha T}{e}\log\dfrac{n_{\rm in}}{n_{\rm out}}`,solve:S`[eE]=\mathrm{C\cdot V}=\mathrm J`,others:S`[T]=\mathrm K,\quad[\alpha/e]=\mathrm{V/K},\quad[T/e]=\mathrm{K/C}`,trick:S`1\ \mathrm{eV}=e\times1\ \mathrm V`},
    specific:{Q47_11:S`C:\ 35\%,\quad D:\ 31\%`,Q47_15:S`[E]=\mathrm V`,Q47_16:S`V=\dfrac{W}{q}`,Q47_18:S`\left[\log\dfrac{n_{\rm in}}{n_{\rm out}}\right]=1`,Q47_19:S`[\alpha T]=[eE]=\mathrm J\quad\boxed{A,\ E}`,Q47_27:S`\boxed{A,\ E}`}
  });
  // 畫布上的平衡電壓式：E = −(αT / e) log(n內 / n外)
  function formula(g,x,y,size=26,hl=''){
    const c=key=>hl.includes(key)?C.gold:C.white,w=(t,n)=>{g.font='600 '+n+'px system-ui,sans-serif';return g.measureText(t).width;};
    let px=x;label(g,'E',px,y+size*.36,c('E'),size);px+=w('E',size)+size*.3;label(g,'=',px,y+size*.36,C.white,size);px+=w('=',size)+size*.3;
    label(g,'−',px,y+size*.36,C.white,size);px+=w('−',size)+size*.25;
    const fw=w('αT',size*.9)+size*.4;label(g,'αT',px+fw/2,y-size*.22,c('aT'),size*.9,'center');line(g,px,y,px+fw,y,C.white,2);label(g,'e',px+fw/2,y+size*.98,c('e'),size*.9,'center');px+=fw+size*.3;
    label(g,'log',px,y+size*.36,c('log'),size*.9);px+=w('log',size*.9)+size*.15;
    label(g,'(',px,y+size*.42,C.faint,size*1.5);px+=w('(',size*1.5)+2;
    const nw=size*1.55;sci(g,T('n_{內}','n_{in}'),px+nw/2,y-size*.22,c('log'),size*.8,'center');line(g,px,y,px+nw,y,C.white,2);sci(g,T('n_{外}','n_{out}'),px+nw/2,y+size*.98,c('log'),size*.8,'center');px+=nw+2;
    label(g,')',px,y+size*.42,C.faint,size*1.5);
  }
  function robot(g,x,y){box(g,x-30,y-26,60,46,10,'#3b5566','#8ae6d7',2);K.dot(g,x-12,y-6,5,'#8ae6d7');K.dot(g,x+12,y-6,5,'#8ae6d7');line(g,x-10,y+8,x+10,y+8,'#8ae6d7',2);line(g,x,y-26,x,y-38,'#8ae6d7',2);K.dot(g,x,y-40,4,C.gold);}
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='ai'){robot(g,110,120);label(g,T('很會考試','great at tests'),110,190,C.faint,15,'center');
      if(id==='Q47_06'){arrow(g,170,110,250,110,C.gold,2.5,10);label(g,T('會不會指揮它？','can you direct it?'),262,116,C.gold,18);}
      else{label(g,T('今天先把這題考好','today: ace this one'),262,116,C.white,18);}return;}
    if(r==='wrong'){
      if(id==='Q47_11'){for(const [i,l,v,c] of [[0,'C',35,C.red],[1,'D',31,C.red]]){label(g,l,40,90+i*50,c,20);box(g,70,74+i*50,v*9,22,5,c+'88');label(g,v+'%',80+v*9,92+i*50,C.white,16);}label(g,T('各有 3 成多','over 30% each'),40,200,C.white,16);return;}
      formula(g,40,110,id==='Q47_12'?30:26);
      if(id==='Q47_13'){label(g,T('不被嚇到，出題老師就輸了','unafraid, you win'),230,200,C.gold,18,'center');}
      return;
    }
    if(r==='solve'){
      if(id==='Q47_14'){formula(g,40,96,24);label(g,T('一個字都不用背：看單位','Nothing to memorize: units'),230,196,C.gold,18,'center');return;}
      formula(g,30,64,20,id==='Q47_15'?'E':id==='Q47_18'?'log':id==='Q47_19'?'aTe':'');
      if(id==='Q47_15'){sci(g,T('[E] = V（伏特）','[E] = V (volts)'),40,160,C.gold,24);return;}
      if(id==='Q47_16'){// 電荷通過電池獲得能量
        box(g,60,120,90,60,8,'#2b3540','#8ae6d7',2);label(g,'1 V',105,158,C.white,18,'center');K.dot(g,40,150,7,C.blue);arrow(g,48,150,58,150,C.blue,2,7);K.dot(g,180,150,9,C.gold);
        label(g,T('每 1 C 通過，得到 1 J','each coulomb gains 1 J'),210,140,C.white,16);sci(g,'V = J / C',210,176,C.gold,22);return;}
      if(id==='Q47_17'){sci(g,'[e E] = C × V = J',40,150,C.white,24);label(g,T('A 對','A is right'),40,200,C.green,20);mark(g,110,194,true,10);return;}
      if(id==='Q47_18'){sci(g,T('n_{內} / n_{外}：濃度 ÷ 濃度','n_{in} / n_{out}: ratio'),40,150,C.white,19);label(g,T('→ log 沒有單位','→ log has no unit'),40,190,C.gold,20);return;}
      sci(g,'[E] = [αT] / [e]',40,140,C.white,20);sci(g,'[αT] = [e E] = J',40,176,C.gold,22);label(g,T('E 對','E is right'),40,216,C.green,20);mark(g,110,210,true,10);return;
    }
    if(r==='others'){
      [OPTS[1],OPTS[2],OPTS[3]].forEach(([l,expr,,u],i)=>{const y=60+i*48;label(g,l,40,y,C.red,20);sci(g,expr,80,y,C.white,19);sci(g,'→ '+u,180,y,C.faint,18);mark(g,400,y-6,false,10);});
      if(id==='Q47_25')box(g,28,38,420,34,8,null,C.red,2);
      if(id==='Q47_27'){label(g,T('答案 A、E','Answer A, E'),40,224,C.green,22);mark(g,190,218,true,10);}
      return;
    }
    if(r==='trick'){
      sci(g,T('電量 × 電壓 = 能量','charge × voltage = energy'),40,70,C.gold,22);sci(g,'1 eV = e × 1 V',40,116,C.white,22);sci(g,'= 1.6×10^{−19} J',100,150,C.faint,18);
      if(id==='Q47_29')label(g,T('式子越長，越先看單位','the longer the formula, the sooner you check units'),40,210,C.teal,16);
      return;
    }
  }
  function hands(g,s){
    formula(g,20,40,16);
    if(s.pick<0){label(g,T('按下方的 A～E，看它的單位','Press A–E below to see each unit'),230,150,C.faint,16,'center');}
    else{const [l,expr,terms,u]=OPTS[s.pick],ok=P.isEnergy(terms);
      label(g,l,30,130,ok?C.green:C.red,30);sci(g,'['+expr+']',76,130,C.white,24);sci(g,'= '+u,76,172,ok?C.green:C.white,22);
      label(g,ok?T('和能量相同','same as energy'):T('不是能量','not energy'),300,130,ok?C.green:C.red,18);mark(g,430,124,ok,11);}
    label(g,T('找到能量：','Energy found: ')+[...s.found].sort().join('、')+(s.found.size?'':'—'),20,232,s.found.size===2?C.green:C.white,15);
  }
  ExamScene.add(47,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,pick:-1,found:new Set()}),
    paint,
    preview(g){formula(g,30,104,26);label(g,T('哪些單位和能量相同？','Which have energy units?'),230,206,C.gold,18,'center');},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,btn,complete}){
      s.hands=true;const bs=[];
      OPTS.forEach(([l],i)=>bs.push(btn(l,()=>{s.pick=i;bs.forEach((b,j)=>b.setAttribute('aria-pressed',j===i));if(P.isEnergy(OPTS[i][2]))s.found.add(l);if(s.found.size===2)complete();})));
      return {};
    },
    read(s,output){output.textContent=T('提示：α 的單位由 E 的式子倒推，[α] = J/K。','Hint: from the formula, [α] = J/K.');}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q47=[
 {
  "id": "Q47_06",
  "row": "ai",
  "duration": 7.72,
  "disp": "我最近常在想：以後很會考試的能力，可能越來越不值錢，因為人工智慧也很會考；重點是你會不會指揮它。",
  "en": "Lately I keep thinking: being great at exams may be worth less and less, since AI aces exams too; what matters is whether you can direct it."
 },
 {
  "id": "Q47_07",
  "row": "ai",
  "duration": 2.64,
  "disp": "不過今天，我們還是先把這題考好。",
  "en": "But today, let's ace this question first."
 },
 {
  "id": "Q47_11",
  "row": "wrong",
  "duration": 1.97,
  "disp": "選 C、D 的人，各有 3 成多。",
  "en": "C and D each drew over 30%."
 },
 {
  "id": "Q47_12",
  "row": "wrong",
  "duration": 1.88,
  "disp": "式子長得很嚇人，對不對？",
  "en": "Scary-looking formula, right?"
 },
 {
  "id": "Q47_13",
  "row": "wrong",
  "duration": 5.11,
  "disp": "題目的式子越長，出題老師越希望你被嚇到；你不被嚇到，他就輸了。",
  "en": "The longer the formula, the more the examiner hopes you'll panic; if you don't, they lose."
 },
 {
  "id": "Q47_14",
  "row": "solve",
  "duration": 2.69,
  "disp": "這題一個字都不用背，只要會看單位。",
  "en": "You don't need to memorize anything here, just read the units."
 },
 {
  "id": "Q47_15",
  "row": "solve",
  "duration": 2.41,
  "disp": "第一步：E 是電壓，單位是伏特。",
  "en": "Step 1: E is a voltage, in volts."
 },
 {
  "id": "Q47_16",
  "row": "solve",
  "duration": 7.0,
  "disp": "我上課講單位的時候說過：電壓，就是每單位電量通過電池，可以獲得多少能量。",
  "en": "When I teach units, I say: voltage is how much energy each unit of charge gains passing through the battery."
 },
 {
  "id": "Q47_17",
  "row": "solve",
  "duration": 6.49,
  "disp": "所以電量乘以電壓就是能量，1 庫侖乘以 1 伏特，等於 1 焦耳，所以 e 乘以 E，單位是焦耳，A 對。",
  "en": "So charge times voltage is energy: 1 coulomb times 1 volt is 1 joule. So e times E is in joules. A is right."
 },
 {
  "id": "Q47_18",
  "row": "solve",
  "duration": 4.46,
  "disp": "第二步：log 裡面是濃度除以濃度，單位消掉了，log 沒有單位。",
  "en": "Step 2: inside the log is concentration over concentration; the units cancel, so the log has no units."
 },
 {
  "id": "Q47_19",
  "row": "solve",
  "duration": 6.58,
  "disp": "所以 E 的單位，就是 α T 除以 e 的單位；α T 的單位，就等於 e 乘以 E，也是焦耳，E 對。",
  "en": "So E's units are those of αT over e; αT has the units of e times E, also joules. E is right."
 },
 {
  "id": "Q47_25",
  "row": "others",
  "duration": 3.77,
  "disp": "B，T 是絕對溫度，單位是克耳文，不是能量。",
  "en": "B: T is absolute temperature, in kelvins, not energy."
 },
 {
  "id": "Q47_26",
  "row": "others",
  "duration": 6.73,
  "disp": "C，α 除以 e，單位是伏特每克耳文；D，T 除以 e，是克耳文除以庫侖，都不是焦耳。",
  "en": "C: α over e is in volts per kelvin; D: T over e is kelvins per coulomb. Neither is joules."
 },
 {
  "id": "Q47_27",
  "row": "others",
  "duration": 1.15,
  "disp": "答案 A、E。",
  "en": "The answer is A and E."
 },
 {
  "id": "Q47_28",
  "row": "trick",
  "duration": 7.17,
  "disp": "秒殺：電量乘電壓就是能量，這也是電子伏特的由來：1 個基本電量，乘以 1 伏特，就是 1 電子伏特。",
  "en": "The shortcut: charge times voltage is energy, which is where the electron volt comes from: 1 elementary charge times 1 volt is 1 eV."
 },
 {
  "id": "Q47_29",
  "row": "trick",
  "duration": 4.42,
  "disp": "式子越長，越要先看單位，單位會幫你刪掉一半的選項。",
  "en": "The longer the formula, the more you should check units first; units will cross out half the options for you."
 }
];
/* tracks:end */
