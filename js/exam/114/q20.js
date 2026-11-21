/* 114 學測第 20 題：比特幣的電能融冰山（單選 B，答對率 63%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,cube,seg,sciText,sciHTML}=K, C=K.colors, P=ExamPhysics;
  const ENERGY=4.3e17, ICE=917; // 冰的密度 917 kg/m³（只用來估冰山大小，題目沒給）
  Exam114.add(20,{
    lab:'specific-heat',labName:['比熱與熱平衡','Specific heat and thermal equilibrium'],
    group:['第 20–21 題題組','Passage for questions 20–21'],open:true,
    passage:[[S`比特幣是一種虛擬貨幣，運作時需消耗大量的電能。全球每年因比特幣運作所消耗的電能估計約達 \(1.2\times10^{11}\) 度（約 \(4.3\times10^{17}\ \mathrm J\)）。依據以上資料，回答下列問題。`,S`Bitcoin is a virtual currency whose operation uses a great deal of electrical energy. Worldwide, Bitcoin is estimated to use about \(1.2\times10^{11}\) kWh (about \(4.3\times10^{17}\ \mathrm J\)) per year. Use this information to answer the questions.`]],
    ask:[S`已知冰的融化熱為 \(80\ \mathrm{kcal/kg}\) 且 \(1\ \mathrm{kcal}\) 約為 \(4\ \mathrm{kJ}\)。全球比特幣一年運作所消耗的電能若完全轉換為熱能，約可融化多少公斤 \(0\ ^\circ\mathrm C\) 的冰山？`,S`The heat of fusion of ice is \(80\ \mathrm{kcal/kg}\), and \(1\ \mathrm{kcal}\) is about \(4\ \mathrm{kJ}\). If one year of Bitcoin’s electrical energy were converted entirely into heat, about how many kilograms of ice at \(0\ ^\circ\mathrm C\) could it melt?`],
    choices:['10','12','16','20','24'].map(e=>[S`\(10^{`+e+S`}\)`,S`\(10^{`+e+S`}\)`]),
    key:'B',rate:63,shares:[4,64,23,8,2],
    hint:['融化熱的單位是 kcal/kg，電能的單位是 J。先把兩個換成同一個單位，才能相除。','The heat of fusion is in kcal/kg, the energy in joules. Put them in the same unit before dividing.'],
    hands:['冰山有多大','How big is the iceberg'],mid:'feel',
    caption:['比特幣一年的電能，拿來融冰山','A year of Bitcoin’s electricity, used to melt ice'],
    focus:/融化熱|焦耳|大卡|kcal|數量級|根號 10|次方|臺北 101|heat of fusion|joules|order of magnitude|√10|powers? of 10|Taipei 101/i,
    groups:{wrong:['單位沒換','Units not converted'],solve:['Q = mL','Q = mL'],feel:['冰山有多大','How big is it'],trick:['數量級秒殺','Order-of-magnitude shortcut'],weight:['體重的數量級','Your weight’s order of magnitude']},
    board:{wrong:S`4.3\times10^{17}\div80\approx5\times10^{15}\;?`,solve:S`Q=mL\;\Rightarrow\;m=\dfrac{Q}{L}`,feel:S`V\approx1.5\ \mathrm{km^3},\quad a\approx1.1\ \mathrm{km}`,trick:S`10^{17}\div10^{5}=10^{12},\quad 1.3<\sqrt{10}\approx3.16`,weight:S`31.6\ \mathrm{kg}=\sqrt{10}\times10\ \mathrm{kg}`},
    specific:{Q20_12:S`L=80\times4\ \mathrm{kJ/kg}=3.2\times10^{5}\ \mathrm{J/kg}`,Q20_13:S`m=\dfrac{4.3\times10^{17}}{3.2\times10^{5}}\approx1.3\times10^{12}\ \mathrm{kg}\quad\boxed{B}`}
  });
  // 臺北 101 的剪影：底座＋八節＋塔尖，高 h（px）
  function tower(g,x,ground,h){
    const w=h*.12;g.fillStyle='#4f7f86';g.fillRect(x-w*.62,ground-h*.16,w*1.24,h*.16);
    for(let i=0;i<8;i++){const y0=ground-h*.16-i*h*.083,y1=y0-h*.083;g.beginPath();g.moveTo(x-w*.42,y0);g.lineTo(x-w*.56,y1);g.lineTo(x+w*.56,y1);g.lineTo(x+w*.42,y0);g.closePath();g.fillStyle=i%2?'#6aa0a4':'#5d9297';g.fill();}
    const top=ground-h*.83;g.fillStyle='#7fb3b5';g.fillRect(x-w*.22,top-h*.06,w*.44,h*.06);line(g,x,top-h*.06,x,ground-h,'#a8d2d2',1.5);
  }
  function ice(g,x,y,a,melt=0){
    cube(g,x,y,a*(1-melt*.35),'#bfe9ff','#e8f8ff','#8fcbe6','#ffffffaa');
    if(melt){g.beginPath();g.ellipse(x+a*.45,y+3,a*(.55+melt*.6),5+melt*4,0,0,Math.PI*2);g.fillStyle='#5fb7e888';g.fill();}
  }
  const seq=(id,list)=>list.indexOf(id);
  function paint(g,s){
    const r=s.row,k=s.part;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){
      label(g,T('選 C 的算法','How choice C happens'),20,34,C.red,17);
      sci(g,'Q = 4.3×10^{17} J',36,82,C.white,21);sci(g,'L = 80 kcal/kg',36,122,C.white,21);
      if(s.id==='Q20_09'&&k>.35||s.id==='Q20_10'){g.beginPath();g.ellipse(138,115,32,16,0,0,Math.PI*2);g.strokeStyle=C.red;g.lineWidth=2.5;g.stroke();arrow(g,150,150,140,134,C.red,2,9);label(g,T('kcal 沒換成 J','kcal never became J'),120,168,C.red,17);}
      if(s.id==='Q20_10'){sci(g,'m = Q ÷ 80 ≈ 5×10^{15}',36,204,C.gold,21);if(k>.45){sci(g,T('→ 最接近 10^{16}（C）','→ nearest is 10^{16} (C)'),60,238,C.red,17);mark(g,300,232,false,10);}}
      ice(g,368,128,62);return;
    }
    if(r==='solve'){
      const i=seq(s.id,['Q20_11','Q20_12','Q20_13']);
      ice(g,30,200,96,i===2?seg(k,.3,1):0);
      if(i===0){arrow(g,4,112,44,136,'#ff9f5a',4,14);arrow(g,196,104,150,128,'#ff9f5a',4,14);label(g,T('每 1 kg 的冰','Each 1 kg of ice'),228,90,C.white,17);label(g,T('融化要吸 L 的熱','absorbs L to melt'),228,122,C.gold,19);sci(g,'Q = m L',228,176,C.teal,26);return;}
      if(i===1){sci(g,'L = 80 kcal/kg',214,62,C.white,19);sci(g,'× 4 kJ/kcal',232,98,C.white,19);
        if(k>.3)sci(g,'= 320 kJ/kg',214,138,C.white,19);if(k>.55)sci(g,'= 3.2×10^{5} J/kg',214,180,C.gold,22);return;}
      sci(g,'m = Q ÷ L',200,58,C.white,20);sci(g,'= 4.3×10^{17} ÷ 3.2×10^{5}',200,98,C.white,18);
      if(k>.45)sci(g,'≈ 1.3×10^{12} kg',200,144,C.gold,24);if(k>.75){label(g,T('答案 B','Answer B'),200,196,C.green,22);mark(g,300,190,true,12);}
      return;
    }
    if(r==='feel'){
      const ground=226,px=132/1136,a=1136*px*(s.id==='Q20_14'?seg(k,0,.5):1);
      line(g,10,ground,450,ground,'#5d7c88',1.5);
      tower(g,86,ground,508*px);tower(g,86,ground-508*px,508*px);
      label(g,T('臺北 101 × 2','Taipei 101 × 2'),86,ground+18,C.faint,13,'center');label(g,'1016 m',100,ground-1016*px+4,C.faint,13);
      if(a>2)ice(g,196,ground,a);
      if(a>100){label(g,T('邊長 ≈ 1.1 km','side ≈ 1.1 km'),196+a/2,ground-a/2+6,'#174a63',16,'center');sci(g,'m ≈ 1.3×10^{12} kg',16,38,C.gold,17);sci(g,'V ≈ 1.5 km^{3}',16,64,C.white,17);}
      if(s.id!=='Q20_14'){g.strokeStyle='#ffb17a';g.lineWidth=2;for(let j=0;j<4;j++){const x=222+j*34,o=(s.t*28+j*9)%22;g.beginPath();g.moveTo(x,76-o);g.bezierCurveTo(x+8,68-o,x-8,60-o,x,52-o);g.stroke();}
        label(g,s.id==='Q20_16'?'……':T('「挖礦」很熱門','“Mining” is hot'),444,36,s.id==='Q20_16'?C.faint:'#ffb17a',18,'right');}
      return;
    }
    if(r==='trick'){
      const i=seq(s.id,['Q20_19','Q20_20','Q20_21','Q20_22','Q20_23']);
      label(g,T('秒殺：先看 10 的次方','Shortcut: powers of 10 first'),20,34,C.gold,18);
      sci(g,'10^{17} ÷ 10^{5} = 10^{12}',36,86,i>=1?C.white:C.faint,24);
      if(i<2)return;
      sci(g,'4.3 ÷ 3.2 ≈ 1.3',36,128,C.white,20);
      const X=v=>40+Math.log10(v)*380;line(g,X(1),186,X(10),186,C.white,2);
      for(const v of [1,2,3,5,10]){line(g,X(v),180,X(v),192,C.white,1.5);label(g,String(v),X(v),210,C.faint,13,'center');}
      if(i>=3){line(g,X(Math.sqrt(10)),164,X(Math.sqrt(10)),198,C.gold,2.5);label(g,'√10 ≈ 3.16',X(Math.sqrt(10)),156,C.gold,15,'center');
        label(g,T('不進位','stay'),X(1.7),236,C.teal,14,'center');label(g,T('進位','round up'),X(5.6),236,C.red,14,'center');}
      if(i>=4){K.dot(g,X(1.34),186,7,C.teal);sci(g,'→ 10^{12}',X(1.34)+14,172,C.teal,17);}
      return;
    }
    if(r==='weight'){
      const X=v=>40+(Math.log10(v)-1)*190;line(g,X(10),170,X(1000),170,C.white,2);
      for(const [v,t] of [[10,'10'],[100,'100'],[1000,'1000']]){line(g,X(v),163,X(v),177,C.white,1.5);label(g,t+' kg',X(v),196,C.faint,13,'center');}
      g.fillStyle='#8ae6d726';g.fillRect(X(31.6),120,X(316)-X(31.6),62);sci(g,T('數量級都是 10^{2} kg','order of magnitude 10^{2} kg'),(X(31.6)+X(316))/2,234,C.teal,17,'center');
      const hl=s.id==='Q20_26';line(g,X(31.6),112,X(31.6),182,hl?C.gold:C.faint,hl?3:1.5,[4,3]);label(g,'31.6 kg',X(31.6),104,hl?C.gold:C.faint,hl?18:14,'center');
      line(g,X(316),112,X(316),182,C.faint,1.5,[4,3]);label(g,'316 kg',X(316),104,C.faint,14,'center');
      // 一個學生，約 60 kg
      const x=X(60);g.fillStyle=C.gold;g.beginPath();g.arc(x,52,8,0,Math.PI*2);g.fill();box(g,x-8,63,16,22,5,C.gold);g.fillRect(x-7,84,5,16);g.fillRect(x+2,84,5,16);label(g,'60 kg',x+16,64,C.gold,15);arrow(g,x,106,x,164,C.gold,2,9);
      return;
    }
  }
  // 能動手的圖：L 用錯單位時，冰山有多大
  function hands(g,s){
    const {mass}=s.unitJ?P.melt(s.energy):{mass:s.energy/80},side=Math.cbrt(mass/ICE),ground=226,px=170/1136,a=side*px;
    line(g,10,ground,300,ground,'#5d7c88',1.5);tower(g,40,ground,508*px);label(g,'101',40,ground+16,C.faint,12,'center');
    g.save();g.beginPath();g.rect(0,0,300,250);g.clip();ice(g,92,ground,Math.min(a,1e4));g.restore();
    if(a>200){arrow(g,150,40,150,12,C.red,3);label(g,T('衝出畫面','off the top'),160,30,C.red,14);}
    line(g,302,20,302,230,'#35505f');
    sci(g,'Q = '+sciText(s.energy)+' J',314,44,C.white,15);
    sci(g,s.unitJ?'L = 3.2×10^{5} J/kg':'L = 80（kcal/kg）',314,74,s.unitJ?C.teal:C.red,15);
    sci(g,'m = '+sciText(mass)+' kg',314,112,C.gold,16);
    label(g,T('冰山邊長','Iceberg side'),314,150,C.faint,13);label(g,side>=1000?(side/1000).toFixed(1)+' km':Math.round(side)+' m',314,176,C.white,20);
    if(!s.unitJ&&side>8848)label(g,T('比聖母峰還高','taller than Everest'),314,206,C.red,14);
    if(s.unitJ)label(g,T('約 '+(side/508).toFixed(1)+' 棟 101 高','≈ '+(side/508).toFixed(1)+' × Taipei 101'),314,206,C.teal,14);
  }
  ExamScene.add(20,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,unitJ:false,energy:ENERGY}),
    paint,
    preview(g){
      K.stars(g);
      g.beginPath();g.moveTo(30,190);g.lineTo(70,120);g.lineTo(98,140);g.lineTo(126,96);g.lineTo(170,190);g.closePath();g.fillStyle='#d9f3ff';g.fill();
      g.beginPath();g.moveTo(98,140);g.lineTo(126,96);g.lineTo(170,190);g.lineTo(120,190);g.closePath();g.fillStyle='#9fd3ea';g.fill();
      g.fillStyle='#1f5d80';g.fillRect(0,190,200,60);
      label(g,T('比特幣一年的電能','One year of Bitcoin'),204,50,C.gold,23);
      sci(g,T('1.2×10^{11} 度','1.2×10^{11} kWh'),204,94,C.white,29);sci(g,'≈ 4.3×10^{17} J',204,134,C.white,29);
      label(g,T('冰的融化熱','Heat of fusion'),204,182,C.faint,20);sci(g,'80 kcal/kg，1 kcal ≈ 4 kJ',204,216,C.teal,19);
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,controls,range,btn,complete,output,render}){
      s.hands=true;
      const wrong=btn(T('L 用 80（不換單位）','L = 80 (no conversion)'),()=>{s.unitJ=false;sync();}),right=btn(T('L 換成 J/kg','Convert L to J/kg'),()=>{s.unitJ=true;sync();complete();});
      function sync(){wrong.setAttribute('aria-pressed',!s.unitJ);right.setAttribute('aria-pressed',s.unitJ);}sync();
      range(T('一年耗電（億度）','Yearly use (100 million kWh)'),200,2000,1200,v=>s.energy=v*1e8*3.6e6);
      return {};
    },
    read(s,output){const m=s.unitJ?P.melt(s.energy).mass:s.energy/80;output.innerHTML='m = Q ÷ L = '+sciHTML(m)+' kg　'+T('數量級','Order of magnitude')+' 10<sup>'+P.magnitude(m)+'</sup>'+(s.unitJ?'':'　<b>'+T('（L 沒換成 J/kg）','(L not in J/kg)')+'</b>');}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q20=[
 {
  "id": "Q20_09",
  "row": "wrong",
  "duration": 5.62,
  "disp": "選 C 的人，多半是把 80 大卡直接拿來除，忘了大卡要換成焦耳。",
  "en": "Most who chose C divided by 80 kcal directly, forgetting to convert kcal to joules."
 },
 {
  "id": "Q20_10",
  "row": "wrong",
  "duration": 8.22,
  "disp": "\\(4.3\\times10^{17}\\)÷80，大約 \\(5\\times10^{15}\\)，最接近 \\(10^{16}\\)，就掉進去了。",
  "en": "\\(4.3\\times10^{17}\\)÷80 is about \\(5\\times10^{15}\\), closest to \\(10^{16}\\), and in they fall."
 },
 {
  "id": "Q20_11",
  "row": "solve",
  "duration": 4.21,
  "disp": "因為融化熱的意思是：每公斤的冰，融化要吸多少熱。",
  "en": "Heat of fusion means how much heat each kilogram of ice absorbs to melt."
 },
 {
  "id": "Q20_12",
  "row": "solve",
  "duration": 7.84,
  "disp": "所以先把它換成焦耳：80×4 千，等於 32 萬，也就是每公斤 \\(3.2\\times10^{5}\\) 焦耳。",
  "en": "So convert it to joules first: 80 × 4,000 = 320,000, or \\(3.2\\times10^{5}\\) joules per kilogram."
 },
 {
  "id": "Q20_13",
  "row": "solve",
  "duration": 11.82,
  "disp": "能融化的質量，就是總能量除以每公斤要的熱：\\(4.3\\times10^{17}\\)，除以 \\(3.2\\times10^{5}\\)，大約 \\(1.3\\times10^{12}\\) 公斤，答案 B。",
  "en": "The mass melted is total energy divided by heat per kilogram: \\(4.3\\times10^{17}\\) ÷ \\(3.2\\times10^{5}\\), about \\(1.3\\times10^{12}\\) kg. The answer is B."
 },
 {
  "id": "Q20_14",
  "row": "feel",
  "duration": 8.32,
  "disp": "\\(10^{12}\\) 公斤的冰，大約 1.5 立方公里；堆成一個正方體，邊長大約 1.1 公里，比 2 棟臺北 101 疊起來還高。",
  "en": "\\(10^{12}\\) kg of ice is about 1.5 cubic kilometers; as a cube, each side is about 1.1 km, taller than 2 Taipei 101s stacked up."
 },
 {
  "id": "Q20_15",
  "row": "feel",
  "duration": 3.34,
  "disp": "比特幣這個礦，挖得真的很熱門。",
  "en": "Bitcoin mining really is a hot topic."
 },
 {
  "id": "Q20_16",
  "row": "feel",
  "duration": 1.42,
  "disp": "……不好笑，很不好笑。",
  "en": "...Not funny. Not funny at all."
 },
 {
  "id": "Q20_19",
  "row": "trick",
  "duration": 3.48,
  "disp": "秒殺：數量級的題目，先看 10 的次方。",
  "en": "The shortcut: for order-of-magnitude questions, look at the powers of 10 first."
 },
 {
  "id": "Q20_20",
  "row": "trick",
  "duration": 3.0,
  "disp": "17 次方減 5 次方，剩 12 次方。",
  "en": "17 minus 5 leaves the 12th power."
 },
 {
  "id": "Q20_21",
  "row": "trick",
  "duration": 1.22,
  "disp": "前面的數字呢？",
  "en": "And the leading numbers?"
 },
 {
  "id": "Q20_22",
  "row": "trick",
  "duration": 7.29,
  "disp": "我上課講過，四捨五入要在次方那邊做；換成前面的數字，就是看它有沒有超過根號 10，大約 3.16。",
  "en": "As I said in class, rounding happens on the exponent; for the leading number, check whether it's above √10, about 3.16."
 },
 {
  "id": "Q20_23",
  "row": "trick",
  "duration": 5.78,
  "disp": "4.3÷3.2 大約 1.3，沒有超過，所以是 \\(10^{12}\\)。",
  "en": "4.3÷3.2 is about 1.3, not above it, so it's \\(10^{12}\\)."
 },
 {
  "id": "Q20_24",
  "row": "weight",
  "duration": 5.82,
  "disp": "說到數量級，我上課問過學生：各位體重的數量級是多少公斤？",
  "en": "Speaking of orders of magnitude, I once asked my class: what's the order of magnitude of your weight in kilograms?"
 },
 {
  "id": "Q20_25",
  "row": "weight",
  "duration": 3.11,
  "disp": "不要懷疑，大家都是 \\(10^{2}\\)。",
  "en": "No doubt about it: everyone's is \\(10^{2}\\)."
 },
 {
  "id": "Q20_26",
  "row": "weight",
  "duration": 3.0,
  "disp": "有沒有人比 31.6 公斤還輕的？",
  "en": "Anyone here lighter than 31.6 kg?"
 }
];
/* tracks:end */
