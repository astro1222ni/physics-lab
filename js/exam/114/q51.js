/* 114 學測第 51 題：光觸媒的最長波長（非選 4 分，未公布得分率）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg}=K, C=K.colors, P=ExamPhysics;
  const PASSAGE=[[S`奈米級的二氧化鈦（\(\mathrm{TiO_2}\)）為一種光觸媒材料，當此光觸媒照光之後，可將周遭環境中的汙染物質分解，達到去汙與除臭的效果。而其原理主要是二氧化鈦光觸媒照光後，電子會從價帶躍遷到導電帶，使得二氧化鈦表面生成氫氧自由基（\(\cdot\mathrm{OH}\)）與超氧離子（\(\cdot\mathrm{O_2^-}\)），此兩者的活性很大可以將有機物分解成二氧化碳和水，達到淨化效果。`,S`Nanoscale titanium dioxide (\(\mathrm{TiO_2}\)) is a photocatalyst. Under light it decomposes pollutants in its surroundings, cleaning and deodorizing. When it is illuminated, electrons jump from the valence band to the conduction band, producing hydroxyl radicals (\(\cdot\mathrm{OH}\)) and superoxide ions (\(\cdot\mathrm{O_2^-}\)) at the surface. Both are highly reactive and break organic matter down into carbon dioxide and water.`],
    [S`此外，二氧化鈦光觸媒亦可在光的照射下催化水裂解產生氫氣和氧氣，為綠色能源與永續發展的重要觸媒。由於二氧化鈦光觸媒的導電帶與價帶的能階差（亦稱為能隙）大約為 \(3.20\ \mathrm{eV}\)，故所照的光源中光子能量必須高於此能量才能啟動催化反應，為了提升其催化活性與效率，許多研究利用不同的金屬摻雜來改善材料特性。`,S`Under illumination, titanium dioxide can also catalyze the splitting of water into hydrogen and oxygen, making it an important catalyst for green energy and sustainability. The energy difference between its conduction band and valence band (the band gap) is about \(3.20\ \mathrm{eV}\), so photons in the light must have more energy than this to start the reaction. To improve its activity and efficiency, many studies dope it with different metals.`],
    [S`某研究團隊發現於二氧化鈦奈米材料中摻雜少量的鋅離子（\(\mathrm{Zn^{2+}}\)）後，會改變能隙，並提升催化水裂解的效率。根據上述資訊及所學，回答下列問題。`,S`A research team found that doping titanium dioxide nanomaterial with a small amount of zinc ions (\(\mathrm{Zn^{2+}}\)) changes the band gap and improves the efficiency of water splitting. Use this information and what you have learned to answer the questions.`]];
  Exam114.add(51,{
    lab:'photoelectric',labName:['光電效應','The photoelectric effect'],
    group:['第 50–54 題題組（物理是第 50、51 題）','Passage for questions 50–54 (physics: 50 and 51)'],passage:PASSAGE,open:true,
    ask:[S`（a）欲啟動未摻雜二氧化鈦光觸媒的催化反應，可允許之最長波長約為多少 nm？（普朗克常數 \(h=6.63\times10^{-34}\ \mathrm{J\cdot s}\)，\(1\ \mathrm{eV}=1.6\times10^{-19}\ \mathrm J\)，真空中光速 \(3.0\times10^{8}\ \mathrm{m/s}\)）
（b）摻雜少量鋅離子後，恰可用波長 \(400\ \mathrm{nm}\) 的光激發催化。摻雜後的能隙應大於、小於或等於 \(3.20\ \mathrm{eV}\)？說明理由。`,
      S`(a) To start the reaction on undoped titanium dioxide, about what is the longest usable wavelength, in nm? (Planck constant \(h=6.63\times10^{-34}\ \mathrm{J\cdot s}\), \(1\ \mathrm{eV}=1.6\times10^{-19}\ \mathrm J\), speed of light in vacuum \(3.0\times10^{8}\ \mathrm{m/s}\).)
(b) After doping with a little zinc, light of wavelength \(400\ \mathrm{nm}\) can just start the reaction. Is the band gap after doping greater than, less than or equal to \(3.20\ \mathrm{eV}\)? Explain.`],
    points:4,
    fields:[{label:['(a) 最長波長','(a) Longest wavelength'],units:['nm','μm','m']},
      {label:['(b) 摻雜後的能隙','(b) Band gap after doping'],options:[['>',['大於 3.20 eV','Greater than 3.20 eV']],['<',['小於 3.20 eV','Less than 3.20 eV']],['=',['等於 3.20 eV','Equal to 3.20 eV']]]},
      {label:['(b) 理由：400 nm 比 (a) 的波長','(b) Reason: compared with (a), 400 nm is'],options:[['longer',['較長，每顆光子能量較小','Longer, so each photon has less energy']],['shorter',['較短，每顆光子能量較大','Shorter, so each photon has more energy']],['same',['一樣長，能量相同','The same, so the energy is the same']]]}],
    fieldNote:['(a) 可寫 390，也可寫 3.9×10^-7，再選單位。','(a) Write 390 or 3.9×10^-7, then choose a unit.'],
    grade:P.gradeCatalyst,
    marking:['參考答案：(a) 約 390 nm（λ = hc/E ≈ 3.9×10^-7 m；用 1240 ÷ 3.2 算是 388 nm）。(b) 小於 3.20 eV：400 nm 比 (a) 的最長波長還長，每顆光子只有約 3.1 eV，卻能激發，表示能隙變小了。本站批改：(a) 380–400 nm 給 2 分，單位要選；(b) 能隙與理由都對給 2 分。',
      'Reference answer: (a) about 390 nm (λ = hc/E ≈ 3.9×10^-7 m; 1240 ÷ 3.2 gives 388 nm). (b) Less than 3.20 eV: 400 nm is longer than the longest wavelength in (a), so each photon has only about 3.1 eV, yet it still works, so the gap has shrunk. On this site, (a) earns 2 points for 380–400 nm with a unit, and (b) earns 2 points when both the gap and the reason are right.'],
    hint:[S`（a）光子能量 \(E=\dfrac{hc}{\lambda}\)：波長越長，能量越小；能量剛好等於能隙的那一顆，波長最長。（b）\(400\ \mathrm{nm}\) 和 (a) 的答案比，哪個長？`,S`(a) Photon energy is \(E=\dfrac{hc}{\lambda}\): the longer the wavelength, the lower the energy, so the photon whose energy just equals the gap has the longest wavelength. (b) Which is longer: \(400\ \mathrm{nm}\) or your answer to (a)?`],
    hands:['調能隙，讓 400 nm 剛好能用','Tune the gap so 400 nm just works'],mid:'solveB',
    caption:['光子能量與波長：E = hc/λ','Photon energy and wavelength: E = hc/λ'],
    focus:/波長|最長|能隙|光子|能量|焦耳|電子伏特|奈米|1240|功函數|摻雜|紫外|wavelength|longest|band gap|photons?|energy|joules?|electron ?volts?|nanomet\w*|work function|dop\w*|ultraviolet/i,
    groups:{wrong:['為什麼是最長波長','Why the longest wavelength'],solveA:['(a) λ = hc/E','(a) λ = hc/E'],solveB:['(b) 能隙變小','(b) The gap shrinks'],work:['像功函數','Like the work function'],trick:['1240 口訣','The 1240 rule'],why:['為什麼要摻雜','Why dope it'],joke:['默默加班','Overtime in the sun']},
    board:{wrong:S`\lambda\uparrow\ \Rightarrow\ E\downarrow`,solveA:S`\lambda=\dfrac{hc}{E}\approx3.9\times10^{-7}\ \mathrm m=390\ \mathrm{nm}`,solveB:S`400\ \mathrm{nm}>390\ \mathrm{nm}\ \Rightarrow\ E_g<3.20\ \mathrm{eV}`,
      work:S`hf\ge W,\qquad hf\ge E_g`,trick:S`E\,(\mathrm{eV})=\dfrac{1240}{\lambda\,(\mathrm{nm})}`,why:S`\lambda_{\max}=\dfrac{1240}{E_g}`,joke:S`388\ \mathrm{nm}:\ \mathrm{UV}`},
    specific:{Q51_14:S`E=hf=\dfrac{hc}{\lambda}\ \Rightarrow\ \lambda=\dfrac{hc}{E}`,Q51_15:S`E=3.2\times1.6\times10^{-19}\approx5.1\times10^{-19}\ \mathrm J`,Q51_16:S`hc=(6.63\times10^{-34})(3.0\times10^{8})\approx2.0\times10^{-25}\ \mathrm{J\cdot m}`,
      Q51_20:S`\dfrac{1240}{400}\approx3.1\ \mathrm{eV}<3.2\ \mathrm{eV}`,Q51_26:S`\dfrac{1240}{3.2}\approx388\ \mathrm{nm}`}
  });
  const hue=nm=>nm<380?'#a99ad8':nm<450?'#7d4dd6':nm<495?'#4d63ff':nm<570?'#4fe06a':nm<590?'#f2e64a':nm<620?'#ff9a3a':'#ff4a3a';
  // E–λ 圖：λ 300–700 nm、E 1.6–4.4 eV
  const X=l=>50+(l-300)*360/400,Y=E=>214-(E-1.6)*180/2.8,eV=l=>P.photonEV(l);
  function axes(g){
    for(let l=300;l<700;l+=4){g.fillStyle=hue(l);g.fillRect(X(l),222,X(l+4)-X(l)+.5,8);}
    line(g,50,214,410,214,C.faint,1.2);line(g,50,214,50,24,C.faint,1.2);
    for(const l of [300,400,500,600,700])label(g,String(l),Math.min(X(l),402),246,C.faint,12,'center');
    label(g,'λ (nm)',408,188,C.faint,13,'right');label(g,'E (eV)',58,28,C.faint,13);
    for(const E of [2,3,4]){label(g,String(E),44,Y(E)+4,C.faint,12,'right');line(g,46,Y(E),50,Y(E),C.faint,1);}
  }
  function curve(g,upto=1){g.beginPath();for(let l=300;l<=300+400*upto;l+=2){const x=X(l),y=Y(Math.max(eV(l),1.6));l===300?g.moveTo(x,y):g.lineTo(x,y);}g.strokeStyle=C.white;g.lineWidth=2.5;g.stroke();}
  function gap(g,eg){line(g,50,Y(eg),410,Y(eg),C.gold,2,[6,4]);sci(g,'E_{g} = '+eg.toFixed(2)+' eV',406,Y(eg)-8,C.gold,14,'right');}
  function cut(g,eg){const lc=P.cutoff(eg);line(g,X(lc),Y(eg),X(lc),214,C.teal,1.5,[4,4]);K.dot(g,X(lc),Y(eg),5,C.teal);sci(g,'λ_{max} ≈ '+Math.round(lc)+' nm',X(lc)+8,200,C.teal,14);}
  function zones(g,eg){const x=X(P.cutoff(eg));g.fillStyle='#6fe0a814';g.fillRect(51,24,x-51,190);g.fillStyle='#ff8a8012';g.fillRect(x,24,410-x,190);
    label(g,T('能量夠','enough'),56,196,C.green,14);label(g,T('能量不夠','not enough'),300,60,C.red,14);}
  function point(g,l,eg,tag=true){const E=eV(l),ok=E>=eg-1e-9;line(g,X(l),Y(E),X(l),214,ok?C.green:C.red,1.2,[2,3]);K.dot(g,X(l),Y(E),6,ok?C.green:C.red);
    if(tag)sci(g,l+' nm → '+E.toFixed(2)+' eV',406,Y(eg)+24,ok?C.green:C.red,15,'right');}
  function wave(g,x,y,len,period,color){g.beginPath();for(let i=0;i<=len;i++){const yy=y+Math.sin(i/period*Math.PI*2)*7;i?g.lineTo(x+i,yy):g.moveTo(x,yy);}g.strokeStyle=color;g.lineWidth=2.5;g.stroke();arrow(g,x+len,y,x+len+10,y,color,2.5,8);}
  // 光譜長條（為什麼要摻雜）
  const XS=l=>40+(l-300)*370/400;
  function strip(g,y){for(let l=300;l<700;l+=2){g.fillStyle=hue(l);g.fillRect(XS(l),y,XS(l+2)-XS(l)+.5,26);}
    label(g,T('紫外線','UV'),XS(338),y+44,'#a99ad8',14,'center');label(g,T('可見光','visible light'),XS(540),y+44,C.white,14,'center');}
  const ROWS=[[T('E = h f = h c / λ　⇒　λ = h c / E','E = h f = h c / λ　⇒　λ = h c / E')],['E = 3.2 × 1.6×10^{−19} ≈ 5.1×10^{−19} J'],['h c = 6.63×10^{−34} × 3.0×10^{8} ≈ 2.0×10^{−25} J·m'],['λ ≈ 3.9×10^{−7} m = 390 nm']];
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){
      if(id==='Q51_11'){label(g,T('為什麼問「最長」波長？','Why the longest wavelength?'),230,50,C.gold,22,'center');
        [[300,8],[388,11],[500,15]].forEach(([l,p],i)=>{const y=100+i*48;wave(g,60,y,240,p,hue(l));label(g,l+' nm',330,y+5,C.white,16);});return;}
      axes(g);curve(g,id==='Q51_12'?seg(k,0,.7):1);
      if(id==='Q51_12'){sci(g,'λ↑　→　E↓',240,80,C.white,24);return;}
      zones(g,3.2);gap(g,3.2);cut(g,3.2);return;
    }
    if(r==='solveA'){
      const at={Q51_14:0,Q51_15:1,Q51_16:2,Q51_17:3}[id]??3;
      ROWS.slice(0,at+1).forEach(([t],i)=>{const now=i===at,last=i===3;sci(g,t,30,50+i*56,last&&now?C.green:now?C.gold:C.faint,i===2?17:19);});
      if(id==='Q51_17'){box(g,22,194,300,34,8,null,C.green,2);mark(g,350,206,true,10);}
      return;
    }
    if(r==='solveB'){
      const eg=id==='Q51_18'?3.2:id==='Q51_19'?3.2-.15*seg(k,.3,.8):3.05;
      axes(g);curve(g);gap(g,eg);if(id==='Q51_18')cut(g,3.2);point(g,400,eg);
      if(id==='Q51_18')label(g,T('摻雜後：400 nm 也能用','after doping: 400 nm works'),240,52,C.white,16);
      if(id==='Q51_19'&&eg<3.1)label(g,T('能隙變小：< 3.2 eV','gap shrinks: < 3.2 eV'),240,52,C.gold,17);
      if(id==='Q51_20')sci(g,'1240 / 400 ≈ 3.1 eV',230,52,C.gold,22);
      return;
    }
    if(r==='work'){
      // 左：光電效應的金屬；右：光觸媒的能帶
      label(g,T('光電效應','Photoelectric effect'),120,30,C.white,16,'center');label(g,T('光觸媒','Photocatalyst'),330,30,C.white,16,'center');
      box(g,40,160,160,56,6,'#8fa3ad33','#8fa3ad',1.5);label(g,T('金屬','metal'),120,200,C.faint,14,'center');
      for(let i=0;i<5;i++)K.dot(g,60+i*30,160,5,'#cfe4ff');line(g,40,90,200,90,C.faint,1,[4,4]);label(g,T('自由','free'),44,84,C.faint,13);
      arrow(g,168,160,168,92,C.teal,2.5,9);sci(g,'W',176,132,C.teal,20);
      box(g,250,62,160,30,6,'#7fb6ff22','#7fb6ff');box(g,250,170,160,30,6,'#ffd17e22','#ffd17e');
      label(g,T('導電帶','conduction'),258,82,C.blue,13);label(g,T('價帶','valence'),258,190,C.gold,13);
      arrow(g,380,170,380,92,C.teal,2.5,9);sci(g,'E_{g}',344,136,C.teal,20);
      if(id!=='Q51_21'){label(g,T('掙脫的最小能量','min. energy to escape'),120,236,C.white,14,'center');label(g,T('跳上去的最小能量','min. energy to jump'),330,236,C.white,14,'center');}
      if(id==='Q51_23'){g.fillStyle='#071722';g.fillRect(40,220,370,30);sci(g,'h f ≥ W　　　h f ≥ E_{g}',225,242,C.gold,20,'center');}
      return;
    }
    if(r==='trick'){
      const small=id==='Q51_27';
      sci(g,'E (eV) = 1240 / λ (nm)',230,small?44:100,C.gold,small?20:26,'center');
      if(id==='Q51_26')sci(g,'1240 / 3.2 ≈ 388 nm',230,170,C.white,24,'center');
      if(small){box(g,40,70,380,150,12,'#ff8a8014','#ff8a80',1.5);label(g,T('1240 只配 eV 和 nm','1240 only pairs with eV and nm'),60,112,C.red,18);
        label(g,T('非選題：寫出','On written answers, show'),60,156,C.white,16);sci(g,'λ = h c / E',60,192,C.white,20);label(g,T('← 1240 拿來驗算','← check with 1240'),200,192,C.faint,15);}
      return;
    }
    if(r==='why'){
      if(id==='Q51_28'){label(g,T('為什麼要摻雜？','Why dope it?'),230,56,C.gold,24,'center');strip(g,110);return;}
      strip(g,96);const y=96;
      // 室內燈光（白光 LED）光譜：藍峰＋黃綠寬峰，幾乎沒有紫外
      g.beginPath();for(let l=380;l<=700;l+=2){const v=Math.exp(-(((l-452)/13)**2))*.9+Math.exp(-(((l-575)/60)**2))*.7;const yy=y-4-v*50;l===380?g.moveTo(XS(l),yy):g.lineTo(XS(l),yy);}g.strokeStyle=C.white;g.lineWidth=2;g.stroke();
      label(g,T('室內燈光','indoor light'),XS(560),y-50,C.white,14,'center');
      line(g,XS(388),y-6,XS(388),y+30,C.red,2);label(g,'388',XS(388),y-12,C.red,13,'center');
      const u=seg(k,.3,.8);if(u>0){line(g,XS(400),y-6,XS(400),y+30,C.teal,2);label(g,'400',XS(400)+4,y+60,C.teal,13);arrow(g,XS(300),y+70,XS(388+12*u),y+70,C.teal,3,10);label(g,T('摻雜後能用到這裡','usable after doping'),XS(300),y+98,C.teal,15);}
      return;
    }
    if(r==='joke'){
      const cx=80,cy=66;for(let i=0;i<12;i++){const a=i*Math.PI/6;line(g,cx+Math.cos(a)*34,cy+Math.sin(a)*34,cx+Math.cos(a)*46,cy+Math.sin(a)*46,C.gold,3);}K.dot(g,cx,cy,28,'#ffd17e');
      for(let i=0;i<4;i++)line(g,110+i*12,90+i*6,190+i*50,186,'#a99ad866',1.5,[5,6]);
      box(g,150,186,260,26,6,'#cfe4ff26','#cfe4ff',1.5);sci(g,'TiO_{2}',280,204,C.white,14,'center');
      label(g,T('388 nm：人眼看不到','388 nm: invisible to us'),180,60,C.faint,15);label(g,T('默默加班中…','quietly on overtime…'),250,150,C.gold,19);
      return;
    }
  }
  function hands(g,s){
    axes(g);curve(g);zones(g,s.eg);gap(g,s.eg);cut(g,s.eg);point(g,s.lam,s.eg);
  }
  ExamScene.add(51,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,eg:3.2,lam:500}),
    paint,
    preview(g){K.boost(1.45,()=>{axes(g);curve(g);gap(g,3.2);});line(g,X(388),Y(3.2),X(388),214,C.teal,1.5,[4,4]);K.dot(g,X(388),Y(3.2),6,C.teal);sci(g,'λ_{max} = ?',X(388)+10,198,C.teal,24);},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,range,complete}){
      s.hands=true;const ok=()=>{const E=eV(s.lam);if(s.lam===400&&s.eg<=E&&E-s.eg<=.1)complete();};
      const g1=range(T('能隙（eV）','Band gap (eV)'),260,360,320,v=>{s.eg=v/100;g1.val.textContent=s.eg.toFixed(2);ok();});g1.val.textContent='3.20';
      const g2=range(T('光的波長 λ（nm）','Wavelength λ (nm)'),300,700,500,v=>{s.lam=v;ok();});g2.input.step=5;
      return {};
    },
    read(s,output){const E=eV(s.lam),ok=E>=s.eg;output.innerHTML=T('光子能量 E = 1240 / λ = ','Photon energy E = 1240 / λ = ')+'<b>'+E.toFixed(2)+' eV</b>　'+(ok?T('≥ 能隙：能用','≥ gap: it works'):T('< 能隙：不夠','< gap: not enough'))+'<br>'+T('把波長調到 400 nm，再把能隙調到 400 nm 的光剛好能用。','Set the wavelength to 400 nm, then lower the gap until 400 nm just works.');}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q51=[
 {
  "id": "Q51_11",
  "row": "wrong",
  "duration": 3.56,
  "disp": "第一小題，很多人會卡在：為什麼問最長波長？",
  "en": "In Part 1, many people get stuck on: why the longest wavelength?"
 },
 {
  "id": "Q51_12",
  "row": "wrong",
  "duration": 2.96,
  "disp": "因為波長越長，光子能量越小。",
  "en": "Because the longer the wavelength, the lower the photon energy."
 },
 {
  "id": "Q51_13",
  "row": "wrong",
  "duration": 5.98,
  "disp": "能量剛好等於能隙的那一顆，波長就是最長的；再長一點，能量就不夠了。",
  "en": "The photon whose energy exactly equals the band gap has the longest wavelength; any longer, and the energy falls short."
 },
 {
  "id": "Q51_14",
  "row": "solveA",
  "duration": 5.82,
  "disp": "光子能量 E 等於 h f，也等於 h c 除以 λ，所以 λ 等於 h c 除以 E。",
  "en": "Photon energy E = hf, which is also hc/λ, so λ = hc/E."
 },
 {
  "id": "Q51_15",
  "row": "solveA",
  "duration": 9.38,
  "disp": "能隙 3.2 電子伏特，先換成焦耳：3.2×\\(1.6\\times10^{-19}\\)，大約 \\(5.1\\times10^{-19}\\) 焦耳。",
  "en": "Convert the 3.2 eV band gap to joules first: 3.2 × \\(1.6\\times10^{-19}\\), about \\(5.1\\times10^{-19}\\) joules."
 },
 {
  "id": "Q51_16",
  "row": "solveA",
  "duration": 8.02,
  "disp": "h c 是 \\(6.63\\times10^{-34}\\)，乘以 \\(3\\times10^{8}\\)，大約 \\(2.0\\times10^{-25}\\)。",
  "en": "hc is \\(6.63\\times10^{-34}\\) times \\(3\\times10^{8}\\), about \\(2.0\\times10^{-25}\\)."
 },
 {
  "id": "Q51_17",
  "row": "solveA",
  "duration": 5.2,
  "disp": "相除，大約 \\(3.9\\times10^{-7}\\) 公尺，也就是 390 奈米。",
  "en": "Divide: about \\(3.9\\times10^{-7}\\) m, or 390 nm."
 },
 {
  "id": "Q51_18",
  "row": "solveB",
  "duration": 3.84,
  "disp": "第二小題：摻雜以後，400 奈米的光就能用了。",
  "en": "Part 2: after doping, 400 nm light works."
 },
 {
  "id": "Q51_19",
  "row": "solveB",
  "duration": 9.88,
  "disp": "400 比 390 長，波長越長、光子能量越小；連能量比較小的光子都跳得過去，表示能隙變小了，小於 3.2 電子伏特。",
  "en": "400 is longer than 390, and longer wavelength means lower photon energy; if even lower-energy photons can jump it, the band gap has shrunk below 3.2 eV."
 },
 {
  "id": "Q51_20",
  "row": "solveB",
  "duration": 3.96,
  "disp": "算一下，1240÷400，大約 3.1 電子伏特。",
  "en": "Quick check: 1240÷400 is about 3.1 eV."
 },
 {
  "id": "Q51_21",
  "row": "work",
  "duration": 3.72,
  "disp": "能隙這個概念，跟光電效應的功函數很像。",
  "en": "The band gap is a lot like the work function in the photoelectric effect."
 },
 {
  "id": "Q51_22",
  "row": "work",
  "duration": 8.79,
  "disp": "講光電效應的時候我說過，功函數是電子掙脫束縛，需要的最小能量；能隙是電子從價帶跳到導電帶，需要的最小能量。",
  "en": "As I said about the photoelectric effect, the work function is the minimum energy for an electron to break free; the band gap is the minimum energy to jump from the valence to the conduction band."
 },
 {
  "id": "Q51_23",
  "row": "work",
  "duration": 3.05,
  "disp": "光子的能量要超過它，事情才會發生。",
  "en": "The photon's energy must exceed it for anything to happen."
 },
 {
  "id": "Q51_25",
  "row": "trick",
  "duration": 6.84,
  "disp": "秒殺公式：光子能量的電子伏特數，等於 1240 除以波長的奈米數。",
  "en": "The shortcut formula: photon energy in eV equals 1240 divided by the wavelength in nanometers."
 },
 {
  "id": "Q51_26",
  "row": "trick",
  "duration": 4.44,
  "disp": "1240÷3.2，大約 388，一步到位。",
  "en": "1240÷3.2 is about 388, in one step."
 },
 {
  "id": "Q51_27",
  "row": "trick",
  "duration": 10.36,
  "disp": "注意喔，1240 只能配電子伏特和奈米；非選擇題還是要把 h c 除以 λ 的式子寫出來，1240 拿來驗算。",
  "en": "Careful: 1240 only pairs with eV and nm; on written-answer items, still write out λ = hc/E, and use 1240 to check."
 },
 {
  "id": "Q51_28",
  "row": "why",
  "duration": 1.28,
  "disp": "為什麼要摻雜？",
  "en": "Why dope it?"
 },
 {
  "id": "Q51_29",
  "row": "why",
  "duration": 9.88,
  "disp": "因為 390 奈米已經是紫外線，室內的燈光裡幾乎沒有；能隙變小以後，可見光邊邊的紫光也能用，光觸媒在室內就比較有用武之地。",
  "en": "Because 390 nm is already ultraviolet, which indoor lighting barely has; with a smaller band gap, violet light at the edge of the visible spectrum works too, so photocatalysts become more useful indoors."
 },
 {
  "id": "Q51_30",
  "row": "joke",
  "duration": 8.02,
  "disp": "388 奈米是紫外線，人眼看不到；所以光觸媒在太陽底下默默工作，你完全不知道它在加班。",
  "en": "388 nm is ultraviolet, invisible to us; so the photocatalyst quietly works in the sunshine, and you have no idea it's putting in overtime."
 }
];
/* tracks:end */
