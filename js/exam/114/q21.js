/* 114 學測第 21 題：把水庫抬上玉山（單選 A，答對率 43%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,cube,seg,sciText,sciHTML}=K, C=K.colors, P=ExamPhysics;
  const ENERGY=4.3e17, ONE=P.lift(ENERGY);
  Exam114.add(21,{
    lab:'energy-coaster',labName:['雲霄飛車與力學能守恆','Roller coaster and conservation of mechanical energy'],
    group:['第 20–21 題題組','Passage for questions 20–21'],open:true,
    passage:[[S`比特幣是一種虛擬貨幣，運作時需消耗大量的電能。全球每年因比特幣運作所消耗的電能估計約達 \(1.2\times10^{11}\) 度（約 \(4.3\times10^{17}\ \mathrm J\)）。依據以上資料，回答下列問題。`,S`Bitcoin is a virtual currency whose operation uses a great deal of electrical energy. Worldwide, Bitcoin is estimated to use about \(1.2\times10^{11}\) kWh (about \(4.3\times10^{17}\ \mathrm J\)) per year. Use this information to answer the questions.`]],
    ask:[S`烏山頭水庫有效蓄水量約為 \(8.0\times10^{7}\ \mathrm{m^3}\)，玉山高度約 \(4000\ \mathrm m\)。若將全球比特幣運作一年所消耗的電能完全轉換為力學能，且忽略水庫深度的影響，則約可將多少座烏山頭水庫的有效蓄水量從海平面抬升至玉山山頂？（水的密度為 \(1000\ \mathrm{kg/m^3}\)、重力加速度為 \(10\ \mathrm{m/s^2}\)）`,S`The effective storage of the Wushantou Reservoir is about \(8.0\times10^{7}\ \mathrm{m^3}\), and Yushan is about \(4000\ \mathrm m\) high. If one year of Bitcoin’s electrical energy were converted entirely into mechanical energy, ignoring the depth of the reservoir, about how many reservoirs’ worth of water could be lifted from sea level to the summit of Yushan? (Density of water \(1000\ \mathrm{kg/m^3}\), \(g=10\ \mathrm{m/s^2}\).)`],
    choices:['2','5','8','11','14'].map(e=>[S`\(10^{`+e+S`}\)`,S`\(10^{`+e+S`}\)`]),
    key:'A',rate:43,shares:[43,20,19,12,6],
    hint:['1 立方公尺的水有多少公斤？把水抬高 h，要給它多少能量？','How many kilograms is a cubic meter of water? How much energy does lifting it a height h take?'],
    hands:['抬幾座水庫剛好用完','How many reservoirs use it all'],mid:'check',
    caption:['把一整座水庫的水，抬上玉山','Lifting a whole reservoir up Yushan'],
    focus:/立方公尺|1000 公斤|1000 倍|重力位能|m g h|密度|130 座|1\/8|8 倍|1 公噸|cubic met\w*|1,000 kg|1,000 times|potential energy|mgh|density|130|1\/8|8 times|tonne/i,
    groups:{wrong:['立方公尺不是公斤','A cubic meter is not a kilogram'],solve:['位能的增加 mgh','The rise in potential energy, mgh'],check:['和上一題互相驗算','Cross-check with question 20'],joke:['山頂的登山客','Hikers at the summit'],trick:['1 立方公尺的水 = 1 公噸','A cubic meter of water = 1 tonne']},
    board:{wrong:S`1\ \mathrm{m^3}\ \to\ 1000\ \mathrm{kg}`,solve:S`\Delta U=mgh`,check:S`\dfrac{3.2\times10^{5}}{4\times10^{4}}=8`,joke:S`N\approx130`,trick:S`1\ \mathrm{m^3}=1000\ \mathrm{kg}=1\ \mathrm t`},
    specific:{Q21_13:S`m=\rho V=1000\times8\times10^{7}=8\times10^{10}\ \mathrm{kg}`,Q21_14:S`U_1=mgh=8\times10^{10}\times10\times4000=3.2\times10^{15}\ \mathrm J`,Q21_15:S`N=\dfrac{4.3\times10^{17}}{3.2\times10^{15}}\approx130\approx10^{2}\quad\boxed{A}`,Q21_18:S`1.3\times10^{12}\times8\approx1\times10^{13}\ \mathrm{kg},\quad \div8\times10^{10}\approx130`}
  });
  // 玉山：x0 山腳左、x1 山腳右、海平面 base、山頂 top
  function mountain(g,x0,x1,base,top){
    const mid=(x0+x1)/2,pts=[[x0,base],[x0+(mid-x0)*.35,base-(base-top)*.42],[x0+(mid-x0)*.55,base-(base-top)*.36],[mid-12,top+14],[mid,top],[mid+16,top+18],[x1-(x1-mid)*.4,base-(base-top)*.45],[x1,base]];
    const grad=g.createLinearGradient(0,top,0,base);grad.addColorStop(0,'#5f7f74');grad.addColorStop(1,'#2a4a3e');
    g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.fillStyle=grad;g.fill();
    g.beginPath();g.moveTo(mid-12,top+14);g.lineTo(mid,top);g.lineTo(mid+16,top+18);g.lineTo(mid+6,top+13);g.lineTo(mid-3,top+19);g.closePath();g.fillStyle='#e8f3f2';g.fill();
    g.fillStyle='#1f5d80';g.fillRect(0,base,460,250-base);line(g,0,base,460,base,'#6fb6d8',1.5);
  }
  const water=(g,x,y,a)=>cube(g,x,y,a,'#3f9fd8','#7fd0f5','#2a76a8','#bfe9ff88');
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){
      if(id==='Q21_10'){
        sci(g,'V = 8×10^{7} m^{3}',30,70,C.white,22);sci(g,T('選 B：當成 8×10^{7} kg','Choice B: treated as 8×10^{7} kg'),30,116,C.red,19);if(k>.4){mark(g,240,110,false,11);label(g,T('差了 1000 倍','off by 1,000 times'),30,160,C.red,18);}
        water(g,330,236,60);return;
      }
      water(g,60,206,96);sci(g,'1 m^{3}',108,160,'#0b2a40',22,'center');
      arrow(g,206,150,262,150,C.gold,3,12);label(g,'1000 kg',276,158,C.gold,30);
      if(k>.4){label(g,T('一下差了 1000 倍','off by 1,000 times'),276,206,C.red,19);}
      return;
    }
    if(r==='solve'){
      mountain(g,250,460,214,40);label(g,T('玉山 ≈ 4000 m','Yushan ≈ 4000 m'),326,26,C.white,15,'right');
      const lift=id==='Q21_12'?seg(k,.05,.7):1;water(g,236+(344-236)*lift,214-(214-42)*lift,22);
      if(id==='Q21_12'){line(g,226,214,226,40,C.faint,1.5,[4,3]);label(g,'h',216,134,C.gold,18,'right');
        sci(g,'ΔU = m g h',20,70,C.teal,28);label(g,T('抬高要給的能量','energy to lift it'),20,108,C.white,16);label(g,T('＝位能的「變化量」','= the change in U'),20,136,C.gold,16);return;}
      if(id==='Q21_13'){sci(g,'m = ρV',20,60,C.white,20);sci(g,'= 1000 × 8×10^{7}',20,96,C.white,18);sci(g,'= 8×10^{10} kg',20,134,C.gold,21);return;}
      if(id==='Q21_14'){sci(g,'m = 8×10^{10} kg',20,52,C.white,18);sci(g,'U_{1} = m g h',20,96,C.white,19);sci(g,'= 8×10^{10}×10×4000',20,128,C.white,16);sci(g,'= 3.2×10^{15} J',20,164,C.gold,21);return;}
      sci(g,'U_{1} = 3.2×10^{15} J',20,52,C.white,18);sci(g,'N = 4.3×10^{17} ÷ 3.2×10^{15}',20,96,C.white,16);
      if(k>.35)sci(g,T('≈ 130 座','≈ 130'),20,136,C.gold,22);if(k>.6)sci(g,T('→ 10^{2}（A）','→ 10^{2} (A)'),20,172,C.green,20);if(k>.75)mark(g,150,166,true,11);
      return;
    }
    if(r==='check'){
      label(g,T('每 1 kg 要的能量','Energy per kilogram'),20,32,C.gold,17);
      const X0=150,scale=270/3.2e5;
      label(g,T('融化冰','Melt ice'),20,82,C.white,16);box(g,X0,66,3.2e5*scale,22,4,'#bfe9ff');sci(g,'3.2×10^{5} J',X0+6,83,'#0b2a40',15);
      label(g,T('抬上 4000 m','Lift 4000 m'),20,126,C.white,16);box(g,X0,110,4e4*scale,22,4,'#3f9fd8');sci(g,'4×10^{4} J',X0+4e4*scale+8,127,C.white,15);
      if(id==='Q21_17'&&k>.6||id>'Q21_17'){label(g,T('剛好 1/8','exactly 1/8'),X0+4e4*scale+120,127,C.teal,16);}
      if(id>='Q21_18'){sci(g,T('能抬的水 ≈ 8 × 1.3×10^{12} ≈ 10^{13} kg','Water lifted ≈ 8 × 1.3×10^{12} ≈ 10^{13} kg'),20,180,C.white,16);sci(g,T('÷ 8×10^{10} kg ≈ 130 座','÷ 8×10^{10} kg ≈ 130'),20,212,C.gold,18);}
      if(id==='Q21_19'){mark(g,330,206,true,12);label(g,T('對得起來','they agree'),350,213,C.green,17);}
      return;
    }
    if(r==='joke'){
      mountain(g,120,420,226,70);
      for(let i=0;i<9;i++)water(g,234+(i%3)*24,72-Math.floor(i/3)*20-(i%2)*2,18);
      label(g,'× 130',330,46,C.gold,18);
      // 登山客
      const x=318,y=96;g.fillStyle='#ffd17e';g.beginPath();g.arc(x,y-14,4,0,Math.PI*2);g.fill();line(g,x,y-10,x,y,'#ffd17e',2.5);line(g,x,y,x-4,y+8,'#ffd17e',2);line(g,x,y,x+4,y+8,'#ffd17e',2);
      if(id==='Q21_23')label(g,'？！',x+8,y-18,C.red,18);
      label(g,T('題目要的是數量級','It asks for the order of magnitude'),20,40,C.white,16);
      return;
    }
    if(r==='trick'){
      water(g,40,200,120);sci(g,'1 m^{3}',100,130,'#0b2a40',26,'center');
      sci(g,'= 1000 kg',230,110,C.white,26);label(g,T('= 1 公噸','= 1 tonne'),230,156,C.gold,28);
      if(id==='Q21_25')sci(g,T('先 × 1000 變公斤','× 1000 first'),230,206,C.teal,18);
      return;
    }
  }
  // 能動手的圖：選幾座水庫，需要的能量和比特幣一年的電能比一比
  function hands(g,s){
    const N=10**s.logN,per=s.wrongUnit?ONE.perReservoir/1000:ONE.perReservoir,need=N*per,ratio=need/ENERGY;
    mountain(g,10,250,226,40);
    for(let i=0;i<Math.min(12,Math.max(1,Math.round(Math.log10(N)*2)));i++)water(g,108+(i%4)*14,52-Math.floor(i/4)*11,12);
    line(g,262,16,262,234,'#35505f');
    label(g,T('抬 N 座的能量','Energy for N'),274,40,C.faint,14);
    const X0=274,len=v=>Math.min(170,150*v);
    box(g,X0,52,150,16,4,'#ffd17e55','#ffd17e');label(g,T('比特幣一年','Bitcoin, 1 yr'),X0,88,C.gold,13);
    box(g,X0,100,len(ratio),16,4,ratio>1.12?'#ff8a8088':ratio<.88?'#8ae6d755':'#6fe0a8aa');if(ratio>1.13)arrow(g,X0+150,108,X0+176,108,C.red,2,8);
    sci(g,'N = '+(N<1e4?Math.round(N).toLocaleString('en-US'):sciText(N)),X0,150,C.white,20);
    label(g,ratio>1.12?T('電不夠','not enough'):ratio<.88?T('還有剩','energy left'):T('剛好用完','uses it all'),X0,184,ratio>1.12?C.red:ratio<.88?C.teal:C.green,18);
    if(s.wrongUnit)sci(g,T('把 m^{3} 當 kg','m^{3} taken as kg'),X0,214,C.red,14);
  }
  ExamScene.add(21,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,logN:0,wrongUnit:false}),
    paint,
    preview(g){
      K.stars(g);mountain(g,210,460,206,46);label(g,T('玉山 ≈ 4000 m','Yushan ≈ 4000 m'),335,34,C.white,20,'center');
      box(g,24,170,150,36,6,'#2f8fc8');g.fillStyle='#7fd0f5';g.fillRect(24,170,150,6);
      label(g,T('烏山頭水庫','Wushantou Reservoir'),24,80,C.gold,LabSettings.lang==='en'?19:22);sci(g,'8.0×10^{7} m^{3}',24,128,C.white,28);
      arrow(g,180,172,262,70,C.gold,3.5,13);label(g,'?',198,112,C.gold,32);
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,toggle,complete}){
      s.hands=true;
      const r=range(T('水庫座數 N（對數）','Reservoirs N (log)'),0,600,0,v=>{s.logN=v/100;r.val.textContent=Math.round(10**s.logN).toLocaleString('en-US');
        const ratio=10**s.logN*ONE.perReservoir/ENERGY;if(!s.wrongUnit&&Math.abs(ratio-1)<=.12)complete();});
      r.val.textContent='1';
      toggle('把立方公尺當公斤（選 B）','Cubic meters as kilograms (choice B)',v=>s.wrongUnit=v);
      return {};
    },
    read(s,output){const N=10**s.logN,per=s.wrongUnit?ONE.perReservoir/1000:ONE.perReservoir;output.innerHTML=T('一座','One reservoir')+' U<sub>1</sub> = '+sciHTML(per)+' J　'+T('需要','Needed')+' = '+sciHTML(N*per)+' J　'+T('可用','Available')+' = 4.3×10<sup>17</sup> J';}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q21=[
 {
  "id": "Q21_10",
  "row": "wrong",
  "duration": 5.5,
  "disp": "選 B 的人，是把 \\(8\\times10^{7}\\) 立方公尺，直接當成公斤用了。",
  "en": "Those who chose B used \\(8\\times10^{7}\\) cubic meters as if it were kilograms."
 },
 {
  "id": "Q21_11",
  "row": "wrong",
  "duration": 4.82,
  "disp": "可是 1 立方公尺的水，有 1000 公斤，一下就差了 1000 倍。",
  "en": "But 1 cubic meter of water is 1,000 kg, so they're off by 1,000 times right away."
 },
 {
  "id": "Q21_12",
  "row": "solve",
  "duration": 10.9,
  "disp": "因為把東西抬高，要給它的能量，就是重力位能的增加量 m g h；上課我也提醒過，嚴格說起來，m g h 是位能的變化量。",
  "en": "Lifting something takes energy equal to its gain in gravitational potential energy, mgh; as I noted in class, strictly speaking mgh is the change in potential energy."
 },
 {
  "id": "Q21_13",
  "row": "solve",
  "duration": 7.3,
  "disp": "一座水庫的水，質量等於密度乘以體積：1000×\\(8\\times10^{7}\\)，是 \\(8\\times10^{10}\\) 公斤。",
  "en": "One reservoir's water has mass equal to density times volume: 1,000 × \\(8\\times10^{7}\\), or \\(8\\times10^{10}\\) kg."
 },
 {
  "id": "Q21_14",
  "row": "solve",
  "duration": 7.83,
  "disp": "抬到 4000 公尺：\\(8\\times10^{10}\\)，乘以 10，再乘以 4000，等於 \\(3.2\\times10^{15}\\) 焦耳。",
  "en": "Lifted 4,000 m: \\(8\\times10^{10}\\) × 10 × 4,000 = \\(3.2\\times10^{15}\\) joules."
 },
 {
  "id": "Q21_15",
  "row": "solve",
  "duration": 11.92,
  "disp": "總能量除以一座要的能量：\\(4.3\\times10^{17}\\)，除以 \\(3.2\\times10^{15}\\)，大約 130 座，數量級是 \\(10^{2}\\)，答案 A。",
  "en": "Total energy over energy per reservoir: \\(4.3\\times10^{17}\\) ÷ \\(3.2\\times10^{15}\\), about 130 reservoirs, order of magnitude \\(10^{2}\\). The answer is A."
 },
 {
  "id": "Q21_16",
  "row": "check",
  "duration": 2.5,
  "disp": "驗算一下，可以拿上一題來比。",
  "en": "Let's check it against the last question."
 },
 {
  "id": "Q21_17",
  "row": "check",
  "duration": 10.83,
  "disp": "融化 1 公斤的冰，要 \\(3.2\\times10^{5}\\) 焦耳；把 1 公斤的水抬高 4000 公尺，只要 \\(4\\times10^{4}\\) 焦耳，剛好是 1/8。",
  "en": "Melting 1 kg of ice takes \\(3.2\\times10^{5}\\) joules; lifting 1 kg of water 4,000 m takes only \\(4\\times10^{4}\\) joules, exactly 1/8."
 },
 {
  "id": "Q21_18",
  "row": "check",
  "duration": 8.05,
  "disp": "所以能抬的水，是能融的冰的 8 倍，大約 \\(10^{13}\\) 公斤，除以一座水庫，一樣大約 130 座。",
  "en": "So you can lift 8 times as much water as you can melt ice, about \\(10^{13}\\) kg; divided by one reservoir, again about 130."
 },
 {
  "id": "Q21_19",
  "row": "check",
  "duration": 2.24,
  "disp": "兩題互相驗算，對得起來。",
  "en": "The two questions check each other, and they agree."
 },
 {
  "id": "Q21_22",
  "row": "joke",
  "duration": 5.54,
  "disp": "題目要的是數量級，不是叫你真的把 130 座水庫搬上玉山。",
  "en": "The question wants an order of magnitude; it's not asking you to actually haul 130 reservoirs up Yushan."
 },
 {
  "id": "Q21_23",
  "row": "joke",
  "duration": 2.81,
  "disp": "山頂的登山客應該會很困擾。",
  "en": "The hikers at the summit would be pretty annoyed."
 },
 {
  "id": "Q21_25",
  "row": "trick",
  "duration": 4.4,
  "disp": "秒殺：看到幾立方公尺的水，先乘 1000 變公斤。",
  "en": "The shortcut: see cubic meters of water, multiply by 1,000 to get kilograms first."
 },
 {
  "id": "Q21_26",
  "row": "trick",
  "duration": 4.23,
  "disp": "1 立方公尺的水就是 1 公噸，記這一句，就不會漏。",
  "en": "1 cubic meter of water is 1 metric ton. Remember that line and you won't miss it."
 }
];
/* tracks:end */
