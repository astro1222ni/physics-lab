/* 114 學測第 48 題：平衡電壓與絕對溫度（單選 C，答對率 56%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg}=K, C=K.colors, P=ExamPhysics;
  const Q49=Exam114.questions[49];
  Exam114.add(48,{
    lab:'ideal-gas',labName:['理想氣體分子模擬','Ideal gas molecules'],
    group:Q49.group,passage:Q49.passage,figs:'fig12-14',open:true,
    ask:[S`假設 \(n_{內}\) 與 \(n_{外}\) 維持恆定，則在攝氏 27 度時的平衡電壓量值約是在攝氏 17 度時的多少倍？`,S`If \(n_{\rm in}\) and \(n_{\rm out}\) stay constant, the magnitude of the equilibrium voltage at 27 °C is about how many times that at 17 °C?`],
    choices:[S`\(27/17\)`,S`\(17/27\)`,S`\(300/290\)`,S`\(290/300\)`,S`\(38/36\)`].map(x=>[x,x]),
    key:'C',rate:56,shares:[17,12,56,10,4],
    hint:[S`式子裡的 \(T\) 是「絕對溫度」。攝氏溫度可以直接拿來相除嗎？`,S`The \(T\) in the formula is absolute temperature. Can Celsius temperatures be divided directly?`],
    hands:['兩個溫度比一比','Compare two temperatures'],mid:'solve',
    caption:['平衡電壓跟絕對溫度成正比','The equilibrium voltage is proportional to absolute temperature'],
    focus:/絕對溫度|攝氏|克耳文|273|成正比|相除|溫差|0 K|原點|absolute temperature|Celsius|kelvins?|proportional|divid\w*|temperature difference|origin/i,
    groups:{wrong:['攝氏不能相除','Celsius cannot be divided'],solve:['E 跟 T 成正比','E is proportional to T'],others:['其他選項','The other choices'],trick:['乘除用 K','Use kelvins to multiply or divide'],kelvin:['為什麼是 273','Why 273']},
    board:{wrong:S`\dfrac{27}{17}\;?`,solve:S`E\propto T,\quad T=t+273`,others:S`\boxed{C}`,trick:S`\Delta t\,(^\circ\mathrm C)=\Delta T\,(\mathrm K)`,kelvin:S`-273.15\ ^\circ\mathrm C=0\ \mathrm K`},
    specific:{Q48_12:S`27+273=300\ \mathrm K,\quad 17+273=290\ \mathrm K`,Q48_13:S`\dfrac{E_{27}}{E_{17}}=\dfrac{300}{290}\quad\boxed{C}`}
  });
  // 溫度計：x、底部 y、高 h；frac 0..1 是液柱高度
  function thermo(g,x,y,h,frac,color='#ff6a5a'){
    box(g,x-7,y-h,14,h,7,'#e8f0f2','#9fb3bb',1.5);K.dot(g,x,y+6,12,'#e8f0f2');K.dot(g,x,y+6,9,color);g.fillStyle=color;g.fillRect(x-3,y-(h-10)*frac,6,(h-10)*frac+4);
  }
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){
      if(id==='Q48_07'){label(g,T('選 A 的算法','How choice A happens'),30,40,C.red,17);sci(g,'27 ÷ 17 ≈ 1.59',40,110,C.white,30);mark(g,330,100,false,14);return;}
      if(id==='Q48_08'){sci(g,'E = −(αT / e) log(…)',40,90,C.white,24);g.font='600 24px system-ui,sans-serif';const tx=40+g.measureText('E = −(α').width+g.measureText('T').width/2;g.beginPath();g.ellipse(tx,82,12,18,0,0,Math.PI*2);g.strokeStyle=C.gold;g.lineWidth=2.5;g.stroke();label(g,T('T：絕對溫度','T: absolute temperature'),40,160,C.gold,22);return;}
      thermo(g,90,200,160,.25);label(g,'0 °C',120,160,C.white,20);
      if(id==='Q48_09'){sci(g,T('用攝氏代進 T：E = 0？','Plug in Celsius: E = 0?'),180,110,C.red,20);sci(g,T('電壓就消失了？','the voltage vanishes?'),180,150,C.faint,17);}
      else{box(g,170,70,270,70,14,'#ffd17e1c','#ffd17e');label(g,T('攝氏溫度：','Celsius:'),186,98,C.gold,16);label(g,T('我不是從零起跳的','I do not start from zero'),186,126,C.white,17);}
      return;
    }
    if(r==='solve'){
      if(id==='Q48_11'){sci(g,T('n_{內}、n_{外} 不變 → log 是定值','constant n → the log is fixed'),30,70,C.white,18);sci(g,'α、e：'+T('定值','constants'),30,112,C.white,18);sci(g,'E ∝ T',30,170,C.gold,32);return;}
      const u=id==='Q48_12'?seg(k,.2,.8):1;
      thermo(g,70,196,150,.62);thermo(g,170,196,150,.55,'#ff9a6a');
      label(g,'27 °C',70,34,C.white,16,'center');label(g,'17 °C',170,34,C.white,16,'center');
      if(u>0){label(g,'+273',120,120,C.gold,16,'center');label(g,Math.round(27+273*u)+' K',70,242,C.gold,17,'center');label(g,Math.round(17+273*u)+' K',170,242,C.gold,17,'center');}
      if(id==='Q48_13'){sci(g,'E_{27} / E_{17}',250,90,C.white,20);sci(g,'= 300 / 290',250,130,C.gold,24);sci(g,'≈ 1.034',250,166,C.faint,18);label(g,T('答案 C','Answer C'),250,216,C.green,22);mark(g,350,210,true,10);}
      return;
    }
    if(r==='others'){
      [['B','17/27',T('上下顛倒','upside down')],['D','290/300',T('上下顛倒','upside down')],['E','38/36',T('跟式子無關','unrelated')]].forEach(([l,v,why],i)=>{const y=70+i*50;label(g,l,40,y,C.red,22);label(g,v,80,y,C.white,20);label(g,why,200,y,C.faint,17);mark(g,400,y-6,false,10);});
      return;
    }
    if(r==='trick'){
      label(g,T('公式裡的 T 要相乘、相除','T multiplied or divided'),30,52,C.white,17);label(g,T('→ 一律用 K','→ always kelvins'),30,86,C.gold,24);
      label(g,T('只有算溫差','only for differences'),30,150,C.white,17);sci(g,'Δt（°C）= ΔT（K）',30,186,C.teal,22);
      return;
    }
    if(r==='kelvin'){
      // V–t 圖：三條氣體直線往左延伸交在 −273.15 °C
      const X=t=>40+(t+300)*380/420,Y=v=>220-v*150,shift=id==='Q48_21'?seg(k,.1,.8):id==='Q48_22'?1:0;
      line(g,20,220,450,220,C.white,1.5);line(g,X(0),40,X(0),224,C.faint,1,[3,3]);label(g,'0 °C',X(0),240,C.faint,13,'center');label(g,'t (°C)',446,240,C.faint,13,'right');label(g,'V',X(0)+6,48,C.faint,14);
      const ext=id==='Q48_19'?0:id==='Q48_20'?seg(k,.3,.9):1;
      for(const [m,c] of [[.0034,C.teal],[.0024,C.gold],[.0016,C.blue]]){const v=t=>m*(t+273.15);line(g,X(0),Y(v(0)),X(110),Y(v(110)),c,2.5);if(ext>0)line(g,X(0),Y(v(0)),X(-273.15*ext),Y(v(-273.15*ext)),c,1.6,[5,4]);}
      if(ext>=1){K.dot(g,X(-273.15),220,6,C.red);label(g,'−273.15 °C',X(-273.15)-10,240,C.red,14);}
      if(shift>0){g.globalAlpha=shift;line(g,X(-273.15),40,X(-273.15),224,C.red,2);label(g,'0 K',X(-273.15)+6,48,C.red,18);g.globalAlpha=1;}
      if(id==='Q48_22')label(g,T('乘、除要從真正的原點算','multiply/divide from the true origin'),130,40,C.gold,15);
      return;
    }
  }
  function hands(g,s){
    const K1=s.t1+273,K2=s.t2+273,ratio=K1/K2,naive=s.t2===0?Infinity:s.t1/s.t2;
    const fr=t=>(t+40)/100;thermo(g,50,194,150,fr(s.t1));thermo(g,130,194,150,fr(s.t2),'#ff9a6a');
    label(g,s.t1+' °C',50,30,C.white,15,'center');label(g,s.t2+' °C',130,30,C.white,15,'center');label(g,K1+' K',50,242,C.gold,14,'center');label(g,K2+' K',130,242,C.gold,14,'center');
    line(g,184,16,184,234,'#35505f');
    label(g,T('用 K 相除','Divide in K'),200,46,C.green,15);sci(g,K1+' / '+K2+' = '+ratio.toFixed(3),200,76,C.white,20);
    label(g,T('拿 °C 相除（錯）','Divide in °C (wrong)'),200,130,C.red,15);sci(g,s.t1+' / '+s.t2+' = '+(Number.isFinite(naive)?naive.toFixed(3):'∞ ?'),200,160,C.faint,20);
    if(s.t1===27&&s.t2===17)label(g,T('題目的情形：選 C','The question’s case: C'),200,210,C.gold,16);
  }
  ExamScene.add(48,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,t1:37,t2:20}),
    paint,
    preview(g){thermo(g,80,210,160,.67);thermo(g,170,210,160,.57,'#ff9a6a');label(g,'27 °C',80,34,C.white,17,'center');label(g,'17 °C',170,34,C.white,17,'center');
      sci(g,'E ∝ T',260,100,C.gold,30);sci(g,'E_{27} / E_{17} = ?',260,150,C.white,20);},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;const ok=()=>{if(s.t1===27&&s.t2===17)complete();};
      range(T('溫度 1（°C）','Temperature 1 (°C)'),-30,60,37,v=>{s.t1=v;ok();});
      range(T('溫度 2（°C）','Temperature 2 (°C)'),-30,60,20,v=>{s.t2=v;ok();});
      return {};
    },
    read(s,output){output.innerHTML=T('平衡電壓比 = 絕對溫度比 = ','Voltage ratio = kelvin ratio = ')+'<b>'+((s.t1+273)/(s.t2+273)).toFixed(3)+'</b>　'+T('（把兩個溫度調到 27 °C 與 17 °C 看看）','(try 27 °C and 17 °C)');}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q48=[
 {
  "id": "Q48_07",
  "row": "wrong",
  "duration": 3.16,
  "disp": "選 A 的人，直接拿 27÷17。",
  "en": "Those who chose A just did 27÷17."
 },
 {
  "id": "Q48_08",
  "row": "wrong",
  "duration": 3.44,
  "disp": "可是式子裡的 T，寫得清清楚楚：絕對溫度。",
  "en": "But the T in the formula is clearly labeled: absolute temperature."
 },
 {
  "id": "Q48_09",
  "row": "wrong",
  "duration": 4.78,
  "disp": "攝氏溫度不能拿來相除，不然攝氏 0 度的時候，電壓不就變成 0 了？",
  "en": "You can't divide Celsius temperatures; otherwise at 0 ℃, the voltage would be 0, wouldn't it?"
 },
 {
  "id": "Q48_10",
  "row": "wrong",
  "duration": 3.54,
  "disp": "攝氏溫度表示：我不是從零起跳的。",
  "en": "Celsius says: I don't start from zero."
 },
 {
  "id": "Q48_11",
  "row": "solve",
  "duration": 7.06,
  "disp": "因為濃度不變，log 那一項是定值，α 和 e 也是定值，所以 E 跟絕對溫度 T 成正比。",
  "en": "With concentrations fixed, the log term is constant, and so are α and e, so E is proportional to the absolute temperature T."
 },
 {
  "id": "Q48_12",
  "row": "solve",
  "duration": 11.98,
  "disp": "攝氏換成絕對溫度，數字要加 273.15，我上課講過，高中生記到 273 就可以了：27 度是 300 克耳文，17 度是 290 克耳文。",
  "en": "Converting Celsius to absolute temperature adds 273.15; as I said in class, 273 is enough for high schoolers: 27 ℃ is 300 K, 17 ℃ is 290 K."
 },
 {
  "id": "Q48_13",
  "row": "solve",
  "duration": 3.88,
  "disp": "所以電壓變成 300/290 倍，答案 C。",
  "en": "So the voltage becomes 300/290 times. The answer is C."
 },
 {
  "id": "Q48_16",
  "row": "others",
  "duration": 4.62,
  "disp": "B、D 是上下顛倒；E 的 38 比 36，跟這個式子沒有關係。",
  "en": "B and D are upside down; E's 38 over 36 has nothing to do with this formula."
 },
 {
  "id": "Q48_18",
  "row": "trick",
  "duration": 8.48,
  "disp": "秒殺口訣：公式裡的 T 只要拿來相乘、相除，一律用絕對溫度；只有算溫差的時候，攝氏和絕對溫度才一樣。",
  "en": "The shortcut: whenever T in a formula is multiplied or divided, use absolute temperature; only for temperature differences are Celsius and Kelvin the same."
 },
 {
  "id": "Q48_19",
  "row": "kelvin",
  "duration": 1.86,
  "disp": "為什麼是 273？",
  "en": "Why 273?"
 },
 {
  "id": "Q48_20",
  "row": "kelvin",
  "duration": 10.55,
  "disp": "課堂上我是這樣講的：科學家把氣體的體積對攝氏溫度畫圖，都是直線，往回延伸，總是交在−273.15 ℃。",
  "en": "In class I explain it like this: plot gas volume against Celsius temperature and you get straight lines that, extended back, always meet at −273.15 ℃."
 },
 {
  "id": "Q48_21",
  "row": "kelvin",
  "duration": 3.85,
  "disp": "克耳文就把那裡當成新的原點，叫做 0 K。",
  "en": "Kelvin made that point the new origin and called it 0 K."
 },
 {
  "id": "Q48_22",
  "row": "kelvin",
  "duration": 4.9,
  "disp": "所以溫度要拿來相乘、相除，一定要從這個真正的原點算起。",
  "en": "So to multiply or divide temperatures, you must count from this true origin."
 }
];
/* tracks:end */
