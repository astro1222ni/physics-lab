/* 114 學測第 50 題：光觸媒的能隙（多選 BE，得分率 57%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg}=K, C=K.colors, P=ExamPhysics;
  const GAP=3.2, EV_PER_THZ=4.1357e-3;
  const PASSAGE=[[S`奈米級的二氧化鈦（\(\mathrm{TiO_2}\)）為一種光觸媒材料，當此光觸媒照光之後，可將周遭環境中的汙染物質分解，達到去汙與除臭的效果。而其原理主要是二氧化鈦光觸媒照光後，電子會從價帶躍遷到導電帶，使得二氧化鈦表面生成氫氧自由基（\(\cdot\mathrm{OH}\)）與超氧離子（\(\cdot\mathrm{O_2^-}\)），此兩者的活性很大可以將有機物分解成二氧化碳和水，達到淨化效果。`,S`Nanoscale titanium dioxide (\(\mathrm{TiO_2}\)) is a photocatalyst. Under light it decomposes pollutants in its surroundings, cleaning and deodorizing. When it is illuminated, electrons jump from the valence band to the conduction band, producing hydroxyl radicals (\(\cdot\mathrm{OH}\)) and superoxide ions (\(\cdot\mathrm{O_2^-}\)) at the surface. Both are highly reactive and break organic matter down into carbon dioxide and water.`],
    [S`此外，二氧化鈦光觸媒亦可在光的照射下催化水裂解產生氫氣和氧氣，為綠色能源與永續發展的重要觸媒。由於二氧化鈦光觸媒的導電帶與價帶的能階差（亦稱為能隙）大約為 \(3.20\ \mathrm{eV}\)，故所照的光源中光子能量必須高於此能量才能啟動催化反應，為了提升其催化活性與效率，許多研究利用不同的金屬摻雜來改善材料特性。`,S`Under illumination, titanium dioxide can also catalyze the splitting of water into hydrogen and oxygen, making it an important catalyst for green energy and sustainability. The energy difference between its conduction band and valence band (the band gap) is about \(3.20\ \mathrm{eV}\), so photons in the light must have more energy than this to start the reaction. To improve its activity and efficiency, many studies dope it with different metals.`],
    [S`某研究團隊發現於二氧化鈦奈米材料中摻雜少量的鋅離子（\(\mathrm{Zn^{2+}}\)）後，會改變能隙，並提升催化水裂解的效率。根據上述資訊及所學，回答下列問題。`,S`A research team found that doping titanium dioxide nanomaterial with a small amount of zinc ions (\(\mathrm{Zn^{2+}}\)) changes the band gap and improves the efficiency of water splitting. Use this information and what you have learned to answer the questions.`]];
  Exam114.add(50,{
    lab:'photoelectric',labName:['光電效應','The photoelectric effect'],
    group:['第 50–54 題題組（物理是第 50、51 題）','Passage for questions 50–54 (physics: 50 and 51)'],passage:PASSAGE,open:true,
    ask:['下列與上文相關的敘述，哪些正確？（應選 2 項）','Which statements related to the passage are correct? Choose two.'],
    choices:[['提供電子能量必可使電子由價帶跳到導電帶','Giving an electron energy always lets it jump from the valence band to the conduction band.'],
      ['電子位於價帶的能量比位於導電帶低','An electron in the valence band has lower energy than in the conduction band.'],
      ['可利用改變光的入射角來調變光源中光子的能量','Changing the angle of incidence can tune the energy of the photons.'],
      ['加大照光強度與面積可能促使無法躍遷的電子躍遷','Increasing the light’s intensity and illuminated area may let electrons that could not jump make the transition.'],
      ['增高照射的光頻率可能促使無法躍遷的電子躍遷','Raising the light’s frequency may let electrons that could not jump make the transition.']],
    key:'BE',rate:57,shares:[15,72,20,24,64],
    hint:[S`一顆光子打一顆電子。光子能量 \(E=hf\) 跟什麼有關？光開得更亮，改變的是什麼？`,S`One photon excites one electron. What does a photon’s energy \(E=hf\) depend on? What does brighter light change?`],
    hands:['頻率、強度、入射角','Frequency, intensity and angle'],mid:'solve',
    caption:['價帶、導電帶與 3.2 eV 的能隙','Valence band, conduction band and the 3.2 eV gap'],
    focus:/光子|一顆|頻率|強度|能隙|價帶|導電帶|跳高|拔河|入射角|顏色|瓦數|photons?|one|frequency|intensity|band gap|valence band|conduction band|high jump|tug of war|angle|colou?r|watt\w*/i,
    groups:{wrong:['開亮一點？','Just make it brighter?'],flip:['一顆光子打一顆電子','One photon, one electron'],solve:['光子能量 E = hf','Photon energy E = hf'],others:['其他選項','The other choices'],trick:['口訣','The rule']},
    board:{wrong:S`I\uparrow\ \Rightarrow\ ?`,flip:[S`I\uparrow\ \Rightarrow\ N_\gamma\uparrow,\quad E_\gamma\ \text{不變}`,S`I\uparrow\ \Rightarrow\ N_\gamma\uparrow,\quad E_\gamma\ \text{const.}`],solve:S`E=hf,\quad E_{\rm v}<E_{\rm c}`,others:S`\boxed{B,\ E}`,trick:S`hf\ge E_g\ ?\quad N_\gamma\propto I`},
    specific:{Q50_17:S`E=hf\ \Rightarrow\ f\uparrow,\ E\uparrow\quad(\mathrm E)`,Q50_18:[S`E_{\text{價帶}}<E_{\text{導電帶}}\quad(\mathrm B)`,S`E_{\rm valence}<E_{\rm conduction}\quad(\mathrm B)`]}
  });
  // 能帶：導電帶在上、價帶在下
  const YC=80,YV=190;
  function bands(g,x0,x1,{jumped=0,below=false}={}){
    box(g,x0,26,x1-x0,YC-26,6,'#7fb6ff22','#7fb6ff');label(g,T('導電帶','conduction band'),x0+8,48,C.blue,14);
    box(g,x0,YV,x1-x0,226-YV,6,'#ffd17e22','#ffd17e');label(g,T('價帶','valence band'),x0+8,below?245:220,C.gold,14);
    for(let i=0;i<10;i++){const x=x0+20+i*(x1-x0-40)/9;K.dot(g,x,YV+12,4,i<jumped?'#ffd17e33':'#cfe4ff');if(i<jumped)K.dot(g,x,YC-14,4,'#cfe4ff');}
    const rx=x0-12;line(g,rx,YC,rx,YV,C.faint,1.2);arrow(g,rx,YC+20,rx,YC,C.faint,1.2,6);arrow(g,rx,YV-20,rx,YV,C.faint,1.2,6);label(g,'3.2',rx-4,(YC+YV)/2-2,C.white,14,'right');label(g,'eV',rx-4,(YC+YV)/2+14,C.white,13,'right');
  }
  const hue=nm=>nm<380?'#a99ad8':nm<450?'#7d4dd6':nm<495?'#4d63ff':nm<570?'#4fe06a':nm<590?'#f2e64a':nm<620?'#ff9a3a':'#ff4a3a';
  function photon(g,x,y,len,nm,ang=0){g.save();g.translate(x,y);g.rotate(ang);g.beginPath();for(let i=0;i<=len;i++){const yy=Math.sin(i/3)*4;i?g.lineTo(i,yy):g.moveTo(0,yy);}g.strokeStyle=hue(nm);g.lineWidth=2;g.stroke();arrow(g,len,0,len+9,0,hue(nm),2,8);g.restore();}
  // 一顆光子給一顆電子的能量：箭頭長度 ∝ E
  function kick(g,x,E,ok){const len=(YV-YC)*E/GAP;arrow(g,x,YV,x,YV-Math.min(len,YV-YC+6),ok?C.green:C.red,2.5,8);if(!ok)mark(g,x,YV-len-10,false,6);}
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){bands(g,70,330);for(let i=0;i<8;i++)photon(g,400+(i%2)*30,30+i*22,24,620,Math.PI*.8);
      for(let i=0;i<5;i++)kick(g,100+i*50,2.2,false);label(g,T('開亮一點？','brighter?'),360,236,C.red,16);return;}
    if(r==='flip'){
      if(id==='Q50_09'){label(g,T('不行','No'),230,130,C.red,40,'center');return;}
      if(id==='Q50_12'){// 跳高
        line(g,40,90,420,90,C.gold,3);label(g,T('能隙這根竿','the bar: the gap'),300,80,C.gold,15);
        for(let i=0;i<9;i++){const x=60+i*40,h=40+((i*37)%30);K.dot(g,x,212-h,6,'#cfe4ff');line(g,x,218-h,x,226,'#cfe4ff',2);}
        line(g,30,226,440,226,C.faint,1.5);label(g,T('一個一個跳：一顆不夠高，排再多也沒用','one at a time: too low is too low'),230,30,C.white,15,'center');
        label(g,T('不是拔河','not a tug of war'),40,60,C.red,15);return;}
      if(id==='Q50_13'){label(g,T('要換顏色','change the color'),230,90,C.green,26,'center');label(g,T('不是換瓦數','not the wattage'),230,150,C.red,24,'center');photon(g,120,200,60,400);photon(g,260,200,60,650);return;}
      bands(g,70,330,{jumped:0});const n=id==='Q50_10'?1:id==='Q50_11'?Math.round(1+6*seg(k,0,.6)):1;
      for(let i=0;i<n;i++){photon(g,430,36+i*24,30,620,Math.PI*.8);kick(g,100+i*40,2.2,false);}
      label(g,id==='Q50_10'?T('一顆光子 → 一顆電子','1 photon → 1 electron'):T('光子變多，每顆能量一樣','more photons, same energy each'),230,246,C.white,14,'center');
      return;
    }
    if(r==='solve'){
      if(id==='Q50_17'){bands(g,70,330,{jumped:seg(k,.4,.8)>.5?3:0});for(let i=0;i<3;i++){photon(g,430,36+i*30,30,360,Math.PI*.8);kick(g,100+i*40,3.6,true);}
        sci(g,'E = h f',350,170,C.gold,22);label(g,T('f↑ → E↑','f↑ → E↑'),350,200,C.white,16);label(g,T('E 對','E is right'),350,232,C.green,16);mark(g,420,226,true,8);return;}
      bands(g,70,330);arrow(g,372,YV,372,YC,C.gold,2.5,10);label(g,T('能量高','higher'),382,YC+16,C.white,14);label(g,T('能量低','lower'),382,YV-2,C.white,14);
      label(g,T('B 對：價帶比較低','B: valence band is lower'),230,246,C.green,15,'center');return;
    }
    if(r==='others'){
      if(id==='Q50_19'){bands(g,70,330);kick(g,120,2.4,false);label(g,T('A：能量不夠能隙','A: not enough for the gap'),230,246,C.red,15,'center');return;}
      if(id==='Q50_20'){line(g,40,170,420,170,C.faint,2);for(const [a,x] of [[.45,150],[1.2,330]]){const sx=x-Math.cos(a)*130,sy=170-Math.sin(a)*130;photon(g,sx,sy,118,450,a);label(g,T('同一個 f','same f'),sx+(a<1?-4:16),sy+(a<1?-10:4),C.white,14);}
        label(g,T('C：入射角變了，頻率不變','C: angle changes, frequency does not'),230,220,C.red,15,'center');return;}
      label(g,T('答案 B、E','Answer B, E'),230,130,C.green,32,'center');mark(g,350,118,true,13);return;
    }
    if(r==='trick'){
      box(g,30,40,190,150,10,'#6fe0a81c','#6fe0a8',2);label(g,T('能不能跳','can it jump?'),125,80,C.green,19,'center');label(g,T('看頻率','frequency'),125,130,C.white,24,'center');
      box(g,240,40,190,150,10,'#7fb6ff1c','#7fb6ff',2);label(g,T('跳出來多少個','how many?'),335,80,C.blue,19,'center');label(g,T('看強度','intensity'),335,130,C.white,24,'center');
      if(id==='Q50_23')label(g,T('就是光電效應那一套','the photoelectric effect again'),230,226,C.gold,16,'center');
      return;
    }
  }
  function hands(g,s){
    const E=s.f*EV_PER_THZ,nm=299792/s.f,ok=E>=GAP,n=s.n;
    bands(g,62,300,{jumped:ok?Math.min(10,n):0});
    for(let i=0;i<Math.min(n,8);i++){photon(g,320+(i%2)*26,30+i*24,22,nm,Math.PI*.72+s.ang*Math.PI/180*.4);}
    for(let i=0;i<Math.min(n,10);i++)kick(g,82+i*198/9,E,ok);
    label(g,'E = '+E.toFixed(2)+' eV',318,226,ok?C.green:C.red,15);label(g,Math.round(nm)+' nm',318,246,hue(nm),13);
  }
  ExamScene.add(50,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,f:600,n:2,ang:0,triedBright:false}),
    paint,
    preview(g){K.boost(1.4,()=>bands(g,70,330,{below:true}));photon(g,384,58,54,360,Math.PI*.78);photon(g,400,142,54,620,Math.PI*.78);
      label(g,T('紫外','UV'),394,62,'#a99ad8',22);label(g,T('紅光','Red'),410,146,'#ff4a3a',22);},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;const check=()=>{const E=s.f*EV_PER_THZ;if(E<GAP&&s.n>=8)s.triedBright=true;if(s.triedBright&&E>=GAP)complete();};
      range(T('頻率 f（THz）','Frequency f (THz)'),400,1000,600,v=>{s.f=v;check();});
      range(T('強度（光子數）','Intensity (photons)'),1,10,2,v=>{s.n=v;check();});
      range(T('入射角（度）','Angle of incidence (°)'),0,80,0,v=>{s.ang=v;});
      return {};
    },
    read(s,output){const E=s.f*EV_PER_THZ;output.innerHTML='E = h f = '+E.toFixed(2)+' eV　'+(E>=GAP?'<b>'+T('≥ 3.2 eV：電子跳上導電帶','≥ 3.2 eV: electrons jump')+'</b>':T('< 3.2 eV：光子再多也跳不上去','< 3.2 eV: no number of photons helps'))+(s.triedBright?'':'<br>'+T('先別調頻率：把強度拉到最大看看。','Before changing the frequency, try maximum intensity.'));}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q50=[
 {
  "id": "Q50_08",
  "row": "wrong",
  "duration": 4.78,
  "disp": "選 D 的人想：光不夠力，那就開亮一點、照大一點，總跳得上去吧？",
  "en": "Those who chose D thought: if the light isn't strong enough, make it brighter or bigger, and the electrons will make it up eventually?"
 },
 {
  "id": "Q50_09",
  "row": "flip",
  "duration": 0.66,
  "disp": "不行。",
  "en": "Nope."
 },
 {
  "id": "Q50_10",
  "row": "flip",
  "duration": 4.2,
  "disp": "我上課講光電效應說過：一顆光子，打出一顆電子。",
  "en": "When I teach the photoelectric effect, I say: one photon knocks out one electron."
 },
 {
  "id": "Q50_11",
  "row": "flip",
  "duration": 6.58,
  "disp": "教室的燈全部打開，光強度變強，只是光子變多，每一顆光子的能量還是一樣。",
  "en": "Turn on every light in the classroom and the intensity goes up, but that's just more photons; each photon's energy stays the same."
 },
 {
  "id": "Q50_12",
  "row": "flip",
  "duration": 7.07,
  "disp": "這不是拔河，大家一起拉就拉得動；這是跳高，一個一個跳，一顆不夠高，一百萬顆來排隊也沒用。",
  "en": "This isn't tug-of-war, where everyone pulls together; it's the high jump, one at a time. If one can't clear the bar, a million in line won't help."
 },
 {
  "id": "Q50_13",
  "row": "flip",
  "duration": 2.24,
  "disp": "要換顏色，不是換瓦數。",
  "en": "Change the color, not the wattage."
 },
 {
  "id": "Q50_17",
  "row": "solve",
  "duration": 8.74,
  "disp": "光子能量等於 h 乘以頻率 f，所以頻率越高，每一顆光子的能量越大，就可能讓原本跳不上去的電子跳上去，E 對。",
  "en": "Photon energy is h times frequency f, so higher frequency means more energy per photon, which can lift electrons that couldn't make it before. E is right."
 },
 {
  "id": "Q50_18",
  "row": "solve",
  "duration": 6.5,
  "disp": "價帶在下、導電帶在上，電子在價帶的能量比較低，要吸收能量才跳得上去，B 對。",
  "en": "The valence band is below and the conduction band above; electrons in the valence band have lower energy and must absorb energy to jump up. B is right."
 },
 {
  "id": "Q50_19",
  "row": "others",
  "duration": 8.77,
  "disp": "A，講能階那一課我說過：躍遷是有條件的，不是隨隨便便的；給的能量不夠能隙，電子就跳不上去，錯。",
  "en": "A: as I said in the energy-level lesson, transitions come with conditions, not just any old way; if the energy given is less than the band gap, the electron can't jump. Wrong."
 },
 {
  "id": "Q50_20",
  "row": "others",
  "duration": 4.4,
  "disp": "C，改變入射角，光子的頻率不變，能量也不變，錯。",
  "en": "C: changing the angle of incidence doesn't change the photon's frequency, so its energy stays the same. Wrong."
 },
 {
  "id": "Q50_21",
  "row": "others",
  "duration": 1.2,
  "disp": "答案 B、E。",
  "en": "The answer is B and E."
 },
 {
  "id": "Q50_22",
  "row": "trick",
  "duration": 4.1,
  "disp": "秒殺口訣：能不能跳，看頻率；跳出來多少個，看強度。",
  "en": "The shortcut: whether they jump depends on frequency; how many jump depends on intensity."
 },
 {
  "id": "Q50_23",
  "row": "trick",
  "duration": 3.38,
  "disp": "這就是光電效應那一套，換一個場景再考一次。",
  "en": "It's the photoelectric effect all over again, just in a new setting."
 }
];
/* tracks:end */
