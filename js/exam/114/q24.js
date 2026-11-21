/* 114 學測第 24 題：原子能階（單選 D，答對率 64%）。內容由 compose.py 和 tracks 合併。 */
(() => {
  const S=String.raw, K=ExamScene.kit, {T,sci,label,line,arrow,box,mark,seg}=K, C=K.colors, P=ExamPhysics;
  Exam114.add(24,{
    lab:'hydrogen-spectrum',labName:['氫原子能階與光譜','Hydrogen energy levels and spectra'],
    ask:['下列關於原子能階的敘述，何者錯誤？','Which statement about atomic energy levels is incorrect?'],
    choices:[['原子中的電子可能處在不同的能階','Electrons in an atom can be in different energy levels.'],
      ['一個氫原子雖然只有一個電子，但能階躍遷時可能發射不同波長的光子','Although a hydrogen atom has only one electron, its transitions can emit photons of different wavelengths.'],
      ['原子中的電子吸收能量後，可能從較低的能階躍遷到較高的能階','After absorbing energy, an electron can jump from a lower level to a higher level.'],
      ['為了使處於穩定狀態之原子的電子維持在特定的能階上，外界必須持續提供特定能量的光子','To keep an electron of a stable atom at a particular level, photons of a specific energy must be supplied continuously.'],
      ['原子中的電子從一個能階躍遷到另一個能量較低的能階時，會放出光子','When an electron jumps to a lower energy level, it emits a photon.']],
    key:'D',rate:64,shares:[6,15,7,65,9],
    hint:['電子停在某一個能階上的時候，需要外界一直給它能量嗎？能量只有在「跳」的時候才進出。','Does an electron resting on a level need a steady energy supply? Energy goes in or out only when it jumps.'],
    hands:['點能階讓電子跳','Click levels to make the electron jump'],mid:'flip',
    caption:['氫原子的能階與光譜','Energy levels and spectrum of hydrogen'],
    focus:/能階|光子|波長|定態|不穩定|往上跳|往下跳|吸收|放出|輻射|energy levels?|photons?|wavelengths?|stationary|unstable|absorb\w*|emit\w*|radiat\w*/i,
    groups:{wrong:['一個電子只有一種光？','One electron, one color?'],flip:['好多種跳法','Many ways to jump'],cold:['高處不勝寒','Cold at the top'],solve:['定態','Stationary states'],joke:['不是寵物','Not a pet'],others:['其他選項','The other choices'],trick:['口訣','The rule']},
    board:{wrong:S`1\ e^-\ \Rightarrow\ 1\ \lambda\;?`,flip:S`E_{\gamma}=E_{\rm high}-E_{\rm low}=\dfrac{hc}{\lambda}`,cold:S`E_n=-\dfrac{13.6}{n^2}\ \mathrm{eV}`,solve:S`n=\mathrm{const.}\ \Rightarrow\ \Delta E=0`,others:S`\boxed{D}`,trick:S`\uparrow\,{+E},\quad\downarrow\,{-E}=h f,\quad\to\ 0`},
    specific:{Q24_08:S`3\to2:\ 656\ \mathrm{nm},\quad 3\to1:\ 103\ \mathrm{nm},\quad 2\to1:\ 122\ \mathrm{nm}`}
  });
  const LV=n=>36+190*Math.sqrt(13.6/(n*n)/13.6); // 能階的畫面高度（壓縮上方，好點選）
  // 波長→顏色（可見光照色，紫外、紅外用灰紫、暗紅）
  function hue(nm){
    if(nm<380)return '#a99ad8';if(nm>750)return '#a8584c';
    const stops=[[380,'#7d4dd6'],[440,'#4d63ff'],[490,'#35c4e0'],[530,'#4fe06a'],[580,'#f2e64a'],[620,'#ff9a3a'],[700,'#ff4a3a'],[750,'#c22a24']];
    for(let i=1;i<stops.length;i++)if(nm<=stops[i][0])return stops[i][1];return '#c22a24';
  }
  function levels(g,x0,x1,{hi=0}={}){
    for(let n=1;n<=5;n++){const y=LV(n);line(g,x0,y,x1,y,n===hi?C.gold:n===5?'#48606c':'#9fc3cf',n===hi?3:2);
      if(n<5)label(g,'n='+n,x0-6,y+(n===4?1:5),n===hi?C.gold:C.faint,13,'right');}
    label(g,'0 eV',x1+4,26,C.faint,11);
  }
  const electron=(g,x,y)=>{K.dot(g,x,y,8,'#7fb6ff55');K.dot(g,x,y,5,'#cfe4ff');};
  function photon(g,x,y,len,nm,dir=1){
    g.beginPath();for(let i=0;i<=len;i++){const yy=y+Math.sin(i/3.2)*4;i?g.lineTo(x+i*dir,yy):g.moveTo(x,yy);}g.strokeStyle=hue(nm);g.lineWidth=2;g.stroke();
    arrow(g,x+len*dir,y,x+(len+9)*dir,y,hue(nm),2,8);
  }
  function jump(g,x,a,b,u,nm){ // a→b，u 0..1
    const ya=LV(a),yb=LV(b);arrow(g,x,ya,x,ya+(yb-ya)*Math.max(.05,u),b<a?hue(nm):C.gold,2.5,9);
    if(u>=1&&b<a)photon(g,x+8,(ya+yb)/2,34,nm);
  }
  // 光譜條：對數波長 90–2000 nm
  const SX=nm=>250+(Math.log(nm)-Math.log(90))/(Math.log(2000)-Math.log(90))*196;
  function strip(g,y,lines){
    const grad=g.createLinearGradient(SX(380),0,SX(750),0);[[0,'#7d4dd6'],[.3,'#35c4e0'],[.5,'#4fe06a'],[.65,'#f2e64a'],[.82,'#ff9a3a'],[1,'#c22a24']].forEach(([o,c])=>grad.addColorStop(o,c));
    box(g,248,y,200,22,4,'#0a1620','#35505f');g.globalAlpha=.25;g.fillStyle=grad;g.fillRect(SX(380),y+1,SX(750)-SX(380),20);g.globalAlpha=1;
    label(g,T('紫外','UV'),SX(130),y+40,C.faint,12,'center');label(g,T('可見光','visible'),SX(530),y+40,C.faint,12,'center');label(g,T('紅外','IR'),SX(1400),y+40,C.faint,12,'center');
    for(const nm of lines){line(g,SX(nm),y+2,SX(nm),y+20,hue(nm),3);}
  }
  function paint(g,s){
    const r=s.row,k=s.part,id=s.id;
    if(s.hands)return hands(g,s);
    if(r==='wrong'){levels(g,70,210,{hi:3});electron(g,140,LV(3));
      label(g,T('氫原子：只有 1 個電子','Hydrogen: only 1 electron'),246,70,C.white,16);sci(g,T('→ 只能放 1 種光？','→ only 1 color?'),246,108,C.red,20);strip(g,150,[656]);return;}
    if(r==='flip'){
      levels(g,60,200,{hi:id==='Q24_07'?0:3});
      if(id==='Q24_07'){for(let n=1;n<=4;n++)electron(g,90+n*22,LV(n));label(g,T('同一個電子，好多層可以跳','One electron, many levels'),246,80,C.gold,16);strip(g,150,[]);return;}
      const u=id==='Q24_08'?k:1,shown=[];
      if(u>.02){jump(g,86,3,2,seg(u,0,.25),656);shown.push(656);}
      if(u>.3){jump(g,130,3,1,seg(u,.3,.55),103);shown.push(103);}
      if(u>.6){jump(g,170,3,2,seg(u,.6,.75),656);if(u>.78){jump(g,184,2,1,seg(u,.78,.95),122);shown.push(122);}}
      strip(g,150,shown);
      label(g,T('3 → 2：656 nm','3 → 2: 656 nm'),252,40,hue(656),15);label(g,T('3 → 1：103 nm','3 → 1: 103 nm'),252,64,hue(103),15);label(g,T('2 → 1：122 nm','2 → 1: 122 nm'),252,88,hue(122),15);
      if(id==='Q24_09'){label(g,T('能量差不同 → 波長不同','Different gaps → different λ'),252,122,C.white,15);label(g,T('B 對','B is true'),400,226,C.green,17);mark(g,440,220,true,9);}
      return;
    }
    if(r==='cold'){
      levels(g,60,200);
      const u=id==='Q24_10'?k:id==='Q24_11'?1:k,top=LV(4),y=id==='Q24_10'?LV(1)+(top-LV(1))*seg(u,.1,.7):id==='Q24_11'?top:top+(LV(1)-top)*seg(u,.25,.6);
      if(id==='Q24_10'){photon(g,46,LV(1)-14,62,97);if(u>.1)arrow(g,130,LV(1),130,y,C.gold,2.5,9);}
      if(id==='Q24_12'&&u>.25)arrow(g,130,top,130,y,'#a99ad8',2.5,9);
      electron(g,130,y);
      label(g,T('高處不勝寒','Cold at the top'),252,id==='Q24_11'?110:60,C.gold,id==='Q24_11'?26:18);
      if(id==='Q24_12'){label(g,T('能量越高越不穩定','Higher means less stable'),252,96,C.white,16);if(u>.6)photon(g,150,(top+LV(1))/2,40,97);label(g,T('很快掉回來、放出光子','falls back fast, emits a photon'),252,124,C.white,15);}
      return;
    }
    if(r==='solve'){
      if(id==='Q24_15'){label(g,T('錯的是 D','D is false'),230,120,C.red,34,'center');mark(g,348,108,false,14);return;}
      // 波耳模型：電子沿 n=2 軌道走，不輻射
      const cx=118,cy=128;for(const [n,rr] of [[1,26],[2,58],[3,96]]){g.beginPath();g.arc(cx,cy,rr,0,Math.PI*2);g.strokeStyle=n===2?C.teal:'#48606c';g.lineWidth=n===2?2:1.2;g.stroke();}
      K.dot(g,cx,cy,9,'#ff9c96');label(g,'+',cx,cy+5,'#3a0d0a',13,'center');const a=s.t*1.6;electron(g,cx+58*Math.cos(a),cy+58*Math.sin(a));
      label(g,T('定態','Stationary state'),246,52,C.teal,22);
      label(g,T('不輻射電磁波','emits no EM waves'),246,86,C.white,16);label(g,T('也不吸收','absorbs none either'),246,112,C.white,16);
      if(id!=='Q24_16'){sci(g,T('待著：不用補能量','Staying: no energy needed'),246,160,C.gold,16);}
      if(id==='Q24_18'){sci(g,T('光子 → 跳上去用的','Photons → for jumping'),246,196,C.white,15);photon(g,246,214,40,486);}
      return;
    }
    if(r==='joke'){
      levels(g,60,200,{hi:2});electron(g,130,LV(2));
      g.save();g.translate(300,120);photon(g,-40,0,50,486);g.restore();mark(g,290,120,false,16);
      label(g,T('不用一直餵','No feeding required'),250,180,C.gold,18);label(g,T('它又不是寵物','It is not a pet'),250,208,C.faint,15);
      return;
    }
    if(r==='others'){
      const rows=[['A',T('電子可在不同能階','different levels'),true],['C',T('吸收能量往上跳','absorb → jump up'),true],['E',T('往下跳放出光子','jump down → photon'),true],['D',T('待著也要一直補光子','needs photons to stay'),false]];
      rows.forEach(([l,t,ok],i)=>{const y=52+i*44;label(g,l,40,y,ok?C.green:C.red,22);label(g,t,74,y,C.white,17);mark(g,410,y-6,ok,11);});
      if(id==='Q24_21')box(g,26,160,420,38,8,null,C.red,2);
      return;
    }
    if(r==='trick'){
      levels(g,60,170);
      arrow(g,90,LV(1),90,LV(3),C.gold,3,10);label(g,T('↑ 吸收能量','↑ absorb'),190,170,C.gold,18);
      arrow(g,130,LV(3),130,LV(1),'#ff9a3a',3,10);photon(g,140,190,24,656);label(g,T('↓ 放出光子','↓ emit a photon'),190,206,'#ff9a3a',18);
      electron(g,155,LV(2));label(g,T('待著：不用付錢','stay: free'),190,108,C.teal,18);
      return;
    }
  }
  // 能動手的圖：點能階（或按鈕）讓電子跳；往下跳放出的光記在光譜條上
  function hands(g,s){
    levels(g,62,200,{hi:s.n});electron(g,131,LV(s.n));
    if(s.last){const [a,b,nm]=s.last;jump(g,96,a,b,1,nm);}
    label(g,T('往下跳放出的光','Emitted lines'),250,104,C.white,14);strip(g,114,[...s.lines]);
    if(s.last){const [a,b,nm]=s.last,E=Math.abs(P.level(a)-P.level(b));label(g,a+' → '+b+'：'+E.toFixed(2)+' eV',250,40,b<a?hue(nm):C.gold,16);label(g,(b<a?T('放出 ','emits '):T('吸收 ','absorbs '))+Math.round(nm)+' nm',250,66,b<a?hue(nm):C.gold,16);}
    else label(g,T('點一條能階','Click a level'),250,52,C.faint,16);
    label(g,T('不同的線：','Distinct lines: ')+s.lines.size+' / 3',250,206,s.lines.size>=3?C.green:C.white,16);
  }
  ExamScene.add(24,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,n:1,last:null,lines:new Set()}),
    paint,
    preview(g){levels(g,64,200);electron(g,132,LV(1));jump(g,100,1,3,1,0);jump(g,160,3,1,1,103);
      label(g,T('氫原子','Hydrogen'),246,46,C.gold,18);sci(g,'E_{n} = −13.6 / n^{2} eV',246,82,C.white,17);strip(g,130,[656,486,122,103]);},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,btn,complete,render,controls}){
      s.hands=true;
      function go(n){if(n===s.n)return;const {wavelength}=P.emission(Math.max(n,s.n),Math.min(n,s.n));s.last=[s.n,n,wavelength];if(n<s.n)s.lines.add(Math.round(wavelength));s.n=n;
        if(LabSettings.get('sound'))LabSound.tone({freq:n<s.last[0]?660:420,dur:.12,type:'sine',gain:.12});
        if(s.lines.size>=3)complete();buttons.forEach((b,i)=>b.setAttribute('aria-pressed',i+1===n));}
      const buttons=[1,2,3,4].map(n=>btn(T('到 n='+n,'To n='+n),()=>go(n)));buttons[0].setAttribute('aria-pressed','true');
      btn(T('清除光譜','Clear lines'),()=>{s.lines.clear();s.last=null;});
      return {hit:(x,y)=>{if(x<40||x>220)return null;let best=1;for(let n=2;n<=4;n++)if(Math.abs(LV(n)-y)<Math.abs(LV(best)-y))best=n;go(best);render();return null;},move:()=>{}};
    },
    read(s,output){output.innerHTML=s.lines.size?T('已放出：','Emitted: ')+[...s.lines].sort((a,b)=>b-a).map(nm=>nm+' nm').join('、'):T('先點高一點的能階吸收能量，再點低的放出光子。','Click a higher level to absorb, then a lower one to emit.');}
  });
})();
/* tracks:start（build_tracks.py 產生，勿手改） */
ExamTracks.Q24=[
 {
  "id": "Q24_06",
  "row": "wrong",
  "duration": 5.44,
  "disp": "選 B 的人想：氫原子只有 1 個電子，那它一次只能放出一種光吧？",
  "en": "Those who chose B thought: hydrogen has only 1 electron, so it can only emit one kind of light at a time, right?"
 },
 {
  "id": "Q24_07",
  "row": "flip",
  "duration": 3.4,
  "disp": "電子只有一個沒錯，可是它有好多層能階可以跳。",
  "en": "Yes, just one electron, but it has many levels to jump between."
 },
 {
  "id": "Q24_08",
  "row": "flip",
  "duration": 9.24,
  "disp": "從第 3 層跳到第 2 層，放出一種顏色；從第 3 層直接跳到第 1 層，又是另一種；也可以先 3 到 2、再 2 到 1，連放兩顆。",
  "en": "Level 3 to level 2 gives one color; 3 straight to 1 gives another; or 3 to 2, then 2 to 1, emitting two photons in a row."
 },
 {
  "id": "Q24_09",
  "row": "flip",
  "duration": 5.0,
  "disp": "每一種跳法，能量差不一樣，光子的波長就不一樣，所以 B 是對的。",
  "en": "Each jump has a different energy difference, so a different photon wavelength. B is right."
 },
 {
  "id": "Q24_10",
  "row": "cold",
  "duration": 3.08,
  "disp": "那電子跳上去以後，為什麼又會掉下來？",
  "en": "So once an electron jumps up, why does it fall back down?"
 },
 {
  "id": "Q24_11",
  "row": "cold",
  "duration": 2.03,
  "disp": "我上課講過：高處不勝寒。",
  "en": "As I said in class: it's cold up at the top."
 },
 {
  "id": "Q24_12",
  "row": "cold",
  "duration": 6.8,
  "disp": "能量越高的狀態越不穩定，電子跳上去以後，很快又掉回比較低的能階，掉下來就放出光子。",
  "en": "Higher-energy states are less stable; after jumping up, the electron soon drops to a lower level, emitting a photon as it falls."
 },
 {
  "id": "Q24_15",
  "row": "solve",
  "duration": 1.0,
  "disp": "錯的是 D。",
  "en": "The wrong one is D."
 },
 {
  "id": "Q24_16",
  "row": "solve",
  "duration": 9.24,
  "disp": "我上課講波耳模型，第一個假設的關鍵字叫做定態：電子在特定的軌道上，不會輻射出電磁波，當然也不會吸收電磁波。",
  "en": "When I teach the Bohr model, the key word in the first postulate is stationary state: in an allowed orbit, the electron neither radiates nor absorbs electromagnetic waves."
 },
 {
  "id": "Q24_17",
  "row": "solve",
  "duration": 4.08,
  "disp": "所以電子待在能階上，不需要外界一直補充能量。",
  "en": "So an electron sitting on a level needs no constant energy supply from outside."
 },
 {
  "id": "Q24_18",
  "row": "solve",
  "duration": 4.16,
  "disp": "外界給光子，是讓它跳上去用的，不是讓它待著用的。",
  "en": "Photons from outside are for jumping up, not for staying put."
 },
 {
  "id": "Q24_19",
  "row": "joke",
  "duration": 4.62,
  "disp": "電子待在能階上，不用一直餵它光子，它又不是寵物。",
  "en": "You don't have to keep feeding it photons. It's not a pet."
 },
 {
  "id": "Q24_20",
  "row": "others",
  "duration": 6.15,
  "disp": "A、C、E 都是對的：電子可以在不同能階；吸收能量往上跳；往下跳放出光子。",
  "en": "A, C, and E are all right: electrons can sit on different levels, absorb energy to jump up, and emit photons coming down."
 },
 {
  "id": "Q24_21",
  "row": "others",
  "duration": 1.32,
  "disp": "答案 D。",
  "en": "The answer is D."
 },
 {
  "id": "Q24_22",
  "row": "trick",
  "duration": 4.98,
  "disp": "秒殺口訣：往上跳要吸能量，往下跳放光子，待著不用付錢。",
  "en": "The shortcut: jumping up costs energy, dropping down releases a photon, and staying put is free."
 }
];
/* tracks:end */
