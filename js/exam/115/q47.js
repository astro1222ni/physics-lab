/* 115 學測第 47 題 */
(() => {
  // 畫面與動手（Claude 11/27）：汞原子能階（縱軸照 eV 比例）。365 nm／3.4 eV 一律紫色，能量差金色。
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,P=Exam115Core;
  const HG=P.HG,UV=C.violet,GAP=C.gold,TARGET=365;
  const beep=(f,d=.08,type='sine',gain=.1)=>{if(LabSettings.get('sound')&&window.LabSound)LabSound.tone({freq:f,dur:d,type,gain});};
  const LY=E=>22+(-E)*20.7; // 0 eV → 22、−10.4 eV → 237：照比例
  const ev=v=>v===0?'0':(v<0?'−':'')+Math.abs(v).toFixed(1);
  const hcEvNm=P.h*P.c/P.e*1e9, lam=dE=>1240/Math.abs(dE); // 畫面上的波長照 1240/ΔE（和字幕一致） // ≈ 1243
  // 波長→顏色（紫外用紫、紅外用暗紅）
  function hue(nm){
    if(nm<380)return UV;if(nm>750)return '#d9776b';
    const st=[[440,'#7d6bff'],[490,'#35c4e0'],[530,'#4fe06a'],[580,'#f2e64a'],[620,'#ff9a3a'],[750,'#ff5a4a']];
    for(const [w,c] of st)if(nm<=w)return c;return '#ff5a4a';
  }
  const band=nm=>nm<380?T('紫外光','UV'):nm>750?T('紅外光','IR'):T('可見光','visible');
  // 能階圖：名稱在左、數值在右
  function levels(g,{x0=62,x1=150,hi=[],dim=false,size=15}={}){
    HG.forEach((E,n)=>{const y=LY(E),on=hi.includes(n),col=on?C.gold:dim?'#6d8796':C.white;
      line(g,x0,y,x1,y,col,on?3.5:2.5);sci(g,'E_{'+n+'}',x0-6,y+5,on?C.gold:C.faint,size,'right');label(g,ev(E)+' eV',x1+6,y+5,on?C.gold:dim?'#6d8796':C.faint,size);});
  }
  const electron=(g,x,y)=>{K.dot(g,x,y,8,'#7fb6ff55');K.dot(g,x,y,5,'#cfe4ff');};
  function jump(g,x,a,b,u=1,color){const ya=LY(HG[a]),yb=LY(HG[b]);arrow(g,x,ya,x,ya+(yb-ya)*Math.max(.06,u),color||(b>a?hue(P.transition(a,b).lambda):C.gold),3,10);}
  function photon(g,x,y,len,nm,amp=6){
    const per=8+Math.min(26,Math.log10(nm/50)*14),col=hue(nm);g.beginPath();
    for(let i=0;i<=len;i++){const yy=y+Math.sin(i/per*Math.PI*2)*amp;i?g.lineTo(x+i,yy):g.moveTo(x,yy);}g.strokeStyle=col;g.lineWidth=2.5;g.stroke();arrow(g,x+len,y,x+len+12,y,col,2.5,9);
  }
  // 3.4 eV 的尺：上緣在能量 top
  function ruler(g,x,top,color=UV){const y0=LY(top),y1=LY(top-3.4);box(g,x-7,y0,14,y1-y0,4,color+'44',color,1.5);line(g,x-12,y0,x+12,y0,color,2);line(g,x-12,y1,x+12,y1,color,2);}
  // 光譜條（對數 100–2000 nm）
  const SX=nm=>232+(Math.log10(nm)-2)/Math.log10(20)*216;
  function strip(g,y,marks){
    box(g,230,y,220,18,4,'#0a1620','#35505f');
    const gr=g.createLinearGradient(SX(380),0,SX(750),0);[[0,'#7d6bff'],[.3,'#35c4e0'],[.5,'#4fe06a'],[.65,'#f2e64a'],[.82,'#ff9a3a'],[1,'#ff5a4a']].forEach(([o,c])=>gr.addColorStop(o,c));
    g.globalAlpha=.35;g.fillStyle=gr;g.fillRect(SX(380),y+1,SX(750)-SX(380),16);g.globalAlpha=1;
    label(g,T('紫外','UV'),SX(190),y-6,C.faint,15,'center');label(g,T('可見','vis.'),SX(530),y-6,C.faint,15,'center');label(g,T('紅外','IR'),SX(1300),y-6,C.faint,15,'center');
    for(const [nm,col,dash] of marks)line(g,SX(nm),y-1,SX(nm),y+19,col,3,dash||[]);
  }
  function frac(g,num,den,x,y,color,size=24){
    g.font='600 '+size+'px system-ui,sans-serif';const w=Math.max(g.measureText(num).width,g.measureText(den).width)+12;
    sci(g,num,x,y-size*.35,color,size,'center');line(g,x-w/2,y,x+w/2,y,color,2);sci(g,den,x,y+size*.95,color,size,'center');return w;
  }
  const TX=232; // 右側文字區起點
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const n=+s.id.slice(4),k=s.part,t=s.t;
    if(n<=10){
      levels(g,{dim:true});
      if(n===8){sci(g,'E = hc / λ',TX,46,C.white,20);
        if(k>.2)sci(g,'= 6.63×10^{−34} × 3×10^{8}',TX,82,C.white,16);if(k>.4)sci(g,'÷ (365×10^{−9})',TX+14,112,C.white,16);if(k>.6)sci(g,'÷ (1.6×10^{−19}) = ……',TX+14,142,C.white,16);
        if(k>.75)label(g,T('時間不夠用！','Out of time!'),TX,196,C.red,22);return;}
      if(n===9){const pulse=.6+.4*Math.sin(t*4);box(g,TX,74,212,94,14,UV+Math.round(40+40*pulse).toString(16),UV,2);
        label(g,T('題目已經給了','Already given'),TX+106,60,C.white,17,'center');label(g,'3.4 eV',TX+106,134,UV,36,'center');label(g,'365 nm ↔ 3.4 eV',TX+106,200,UV,18,'center');return;}
      g.beginPath();g.ellipse(TX+106,140,100,30,0,0,Math.PI*2);g.fillStyle='#e9eef2';g.fill();g.beginPath();g.ellipse(TX+106,136,70,18,0,0,Math.PI*2);g.strokeStyle='#b8c6cf';g.lineWidth=2;g.stroke();
      label(g,'3.4 eV',TX+106,143,'#5b3a9e',24,'center');label(g,T('菜已經上桌了','Dinner is served'),TX+106,70,C.gold,20,'center');label(g,T('不用自己進廚房炒','No need to cook it yourself'),TX+106,212,C.faint,16,'center');return;
    }
    if(n===11){
      levels(g,{hi:[3,4]});const u=seg(k,.1,.45),y=LY(HG[3])+(LY(HG[4])-LY(HG[3]))*u;if(u>0)jump(g,106,3,4,u);electron(g,124,y);
      label(g,T('電子往下掉','Electron drops'),TX,44,C.white,18);label(g,T('少掉的能量 → 光子','lost energy → photon'),TX,72,C.white,17);
      if(u>=1)photon(g,TX,112,150,P.transition(3,4).lambda);
      if(k>.55)sci(g,T('E_{光子} = E_{高} − E_{低}','E_{photon} = E_{high} − E_{low}'),TX,170,GAP,19);
      if(k>.75)sci(g,'E_{3} → E_{4}：'+P.transition(3,4).dE.toFixed(1)+' eV',TX,206,C.white,17);
      return;
    }
    if(n===12){
      levels(g,{hi:[1,4]});arrow(g,20,232,20,30,C.gold,2,9);label(g,T('高','high'),16,20,C.gold,15,'center');
      label(g,T('能階都是負的','All levels are negative'),TX,52,C.white,18);label(g,T('越接近 0 越高','Closer to 0 is higher'),TX,92,GAP,20);
      if(k>.45)label(g,'−1.6 > −5.0',TX,154,C.white,28);
      return;
    }
    if(n===13){
      levels(g);const top=-2.6*(.5-.5*Math.cos(t*1.4));ruler(g,128,top);
      label(g,T('找差 3.4 eV 的兩層','Find a 3.4 eV gap'),TX,56,UV,20);label(g,T('紫色＝3.4 eV 的尺','Violet bar = 3.4 eV'),TX,92,C.faint,16);
      return;
    }
    const opt=[[1,3,'A'],[1,4,'B'],[2,4,'C'],[2,5,'D'],[3,4,'E']];
    if(n===14||n===15||n===17){
      const [a,b,L]=n===14?opt[0]:opt[1],tr=P.transition(a,b),u=n===17?1:seg(k,.05,.4);
      levels(g,{hi:[a,b]});jump(g,96,a,b,u);ruler(g,126,HG[1],n===14?'#c7a4ff':UV);
      if(n===17){label(g,T('答案 B','Answer: B'),TX+100,110,C.green,34,'center');mark(g,TX+196,98,true,13);sci(g,'E_{1} → E_{4}：3.4 eV',TX+100,170,UV,20,'center');return;}
      sci(g,L+'：E_{'+a+'} → E_{'+b+'}',TX,46,C.white,21);
      if(k>.3)sci(g,ev(HG[a])+' − ('+ev(HG[b])+') = '+tr.dE.toFixed(1)+' eV',TX,84,GAP,18);
      if(k>.5){photon(g,TX,128,140,tr.lambda);label(g,Math.round(lam(tr.dE))+' nm '+band(tr.lambda),TX,170,hue(tr.lambda),18);}
      if(k>.6)mark(g,TX+190,40,n===15,11);
      if(n===15&&k>.7)label(g,T('就是它！','That’s it!'),TX,210,C.green,20);
      return;
    }
    if(n===16){
      levels(g,{hi:[2,3,4,5]});opt.slice(2).forEach(([a,b],j)=>jump(g,84+j*26,a,b,seg(k,j*.25,j*.25+.25)));
      opt.slice(2).forEach(([a,b,L],j)=>{if(k<j*.25)return;const y=64+j*56,d=P.transition(a,b).dE;sci(g,L+'：E_{'+a+'} → E_{'+b+'}',TX,y,C.white,18);label(g,d.toFixed(1)+' eV',TX+138,y,GAP,18);mark(g,442,y-6,false,8);});
      return;
    }
    // 18–21：秒殺公式（全畫面）
    if(n===18||n===19){
      label(g,T('秒殺公式','Shortcut'),230,40,C.gold,20,'center');
      sci(g,'E (eV) =',148,118,C.white,28,'right');frac(g,'1240','λ (nm)',224,112,C.white,28);
      if(n===19){box(g,300,64,150,74,10,null,C.red,2.5);label(g,T('eV、nm','eV and nm'),375,94,C.red,18,'center');label(g,T('才能用','only'),375,124,C.red,18,'center');
        if(k>.35){sci(g,'1240 = hc = 6.63×10^{−34} × 3×10^{8} J·m',230,186,C.white,17,'center');sci(g,'≈ '+Math.round(hcEvNm)+' eV·nm',230,222,GAP,19,'center');}}
      return;
    }
    if(n===20){sci(g,'1240 ÷ 365 ≈ '+(1240/TARGET).toFixed(1),230,110,C.white,32,'center');if(k>.3)label(g,'= 3.4 eV',230,170,UV,30,'center');return;}
    box(g,110,44,240,120,18,'#ffd17e22',C.gold,2.5);label(g,'1240',230,128,C.gold,64,'center');
    for(let j=0;j<6;j++){const a=j*1.05+t*.8;K.dot(g,230+150*Math.cos(a),104+78*Math.sin(a),3,'#ffd17eaa');}
    label(g,T('背起來！','Memorize it!'),230,218,C.white,22,'center');
  }
  // 能動手：點兩個能階（先起點、再終點），看放出的光
  function hands(g,s){
    const hi=[s.a,s.b].filter(v=>v!=null);levels(g,{hi});
    if(s.a!=null&&s.b==null){electron(g,124,LY(HG[s.a]));label(g,T('再點終點','Now pick the end'),TX,48,C.gold,18);}
    if(s.b!=null){
      const tr=P.transition(s.a,s.b),up=!tr.emits;jump(g,104,s.a,s.b,1,up?C.gold:hue(tr.lambda));electron(g,124,LY(HG[s.b]));
      sci(g,'E_{'+s.a+'} → E_{'+s.b+'}',TX,40,C.white,20);sci(g,'ΔE = '+Math.abs(tr.dE).toFixed(1)+' eV',TX+104,40,GAP,19);
      if(up)label(g,T('往上跳：要吸收光子','Up: a photon is absorbed'),TX,80,C.gold,17);
      else{photon(g,TX,78,120,tr.lambda);label(g,Math.round(lam(tr.dE))+' nm '+band(tr.lambda),TX,124,hue(tr.lambda),18);}
      if(s.a===1&&s.b===4)label(g,T('找到了：365 nm 紫外光','Found it: 365 nm UV'),TX,156,C.green,18);
    }
    if(s.a==null)label(g,T('點一個能階當起點','Pick a starting level'),TX,48,C.faint,17);
    strip(g,194,[[TARGET,UV,[4,3]],...(s.b!=null&&s.b>s.a?[[P.transition(s.a,s.b).lambda,hue(P.transition(s.a,s.b).lambda)]]:[])]);
    label(g,T('目標 365 nm','Target 365 nm'),SX(TARGET),236,UV,15,'center');
  }
  ExamScene.add(47,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,a:null,b:null,done:false}),
    paint,
    preview(g){
      // 原卷標籤都在右邊；這裡左右交錯，相鄰能階的字才放得大（高度照 eV 比例不變）
      HG.forEach((E,n)=>{const y=LY(E),left=n%2===1;line(g,176,y,286,y,C.white,3);sci(g,'E_{'+n+'} = '+ev(E)+' eV',left?168:294,y+7,C.white,19,left?'right':'left');});
      label(g,T('汞原子','Mercury'),452,196,C.gold,20,'right');label(g,T('高度照 eV 比例','Heights to scale'),452,224,C.faint,16,'right');
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,btn,complete,render}){
      s.hands=true;
      function pick(n){
        if(s.a==null||s.b!=null){s.a=n;s.b=null;beep(520,.06,'triangle',.07);return;}
        if(n===s.a){s.a=null;return;}
        s.b=n;const tr=P.transition(s.a,s.b);beep(tr.emits?250+Math.abs(tr.dE)*90:200,.16,tr.emits?'sine':'triangle',.11);
        if(s.a===1&&s.b===4&&!s.done){s.done=true;complete();beep(1047,.2,'sine',.1);}
      }
      btn(T('清除','Clear'),()=>{s.a=s.b=null;});
      HG.forEach((E,n)=>{const b=btn('',()=>pick(n));b.innerHTML='E<sub>'+n+'</sub>';b.setAttribute('aria-label',T('能階 E'+n+'（'+ev(E)+' eV）','Level E'+n+' ('+ev(E)+' eV)'));});
      canvas.setAttribute('aria-label',T('點兩條能階：先點起點，再點終點','Click two levels: start, then end'));
      return {hit:(x,y)=>{if(x>226)return null;let best=0;HG.forEach((E,n)=>{if(Math.abs(LY(E)-y)<Math.abs(LY(HG[best])-y))best=n;});if(Math.abs(LY(HG[best])-y)<14){pick(best);render();}return null;},move:()=>{}};
    },
    read(s,output){
      if(s.b==null){output.textContent=s.a==null?T('點起點和終點兩個能階','Pick a start level and an end level'):T('起點 E','Start E')+s.a+T('，再點終點',', now pick the end');return;}
      const tr=P.transition(s.a,s.b);
      output.innerHTML='E<sub>'+s.a+'</sub> → E<sub>'+s.b+'</sub>：ΔE = '+ev(HG[s.a])+' − ('+ev(HG[s.b])+') = <b>'+tr.dE.toFixed(1)+' eV</b>　'+
        (tr.emits?T('放出 ','emits ')+'λ = 1240 / '+tr.dE.toFixed(1)+' ≈ <b>'+Math.round(lam(tr.dE))+' nm</b>'+(s.a===1&&s.b===4?T('　就是 365 nm：答案 B','　365 nm: answer B'):''):T('往上跳要吸收能量，不會放光','Jumping up absorbs energy; no light is emitted'));
    }
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(47,{groups:{wrong:["題目已經給了 3.4 eV", "The 3.4 eV is already given"],solve:["能階相減", "Subtract the levels"],trick:["口訣", "The rule"]},board:{wrong:String.raw`h f=3.4\ \mathrm{eV}`,solve:String.raw`E_1-E_4=-1.6-(-5.0)=3.4\ \mathrm{eV}`,trick:String.raw`E\,(\mathrm{eV})=\dfrac{1240}{\lambda\,(\mathrm{nm})}=\dfrac{1240}{365}\approx3.4`}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q47=[
 {
  "id": "Q47_08",
  "row": "wrong",
  "duration": 8.3,
  "disp": "有人一看到 365 奈米，就開始用 h c 除以 λ 換算，算了半天，時間都不夠用了。",
  "en": "Some people see 365 nm and start converting with hc over lambda, and run out of time."
 },
 {
  "id": "Q47_09",
  "row": "wrong",
  "duration": 2.7,
  "disp": "其實題目已經幫你換好了。",
  "en": "The question already did the conversion for you."
 },
 {
  "id": "Q47_10",
  "row": "wrong",
  "duration": 5.1,
  "disp": "這就像餐廳已經把菜端上桌了，你還衝進廚房自己炒。",
  "en": "It's like the restaurant has served your dish and you run into the kitchen to cook it yourself."
 },
 {
  "id": "Q47_11",
  "row": "solve",
  "duration": 9.5,
  "disp": "電子從高能階掉到低能階，少掉的能量，變成一顆光子跑出來，所以光子的能量，就等於兩層的能量差。",
  "en": "When an electron drops from a high level to a low one, the lost energy leaves as a photon, so the photon's energy equals the gap between the two levels."
 },
 {
  "id": "Q47_12",
  "row": "solve",
  "duration": 6.7,
  "disp": "注意，能階都是負的，越接近 0 能量越高，所以−1.6 比−5.0 高。",
  "en": "Careful: the levels are all negative, and closer to 0 means higher energy, so −1.6 is above −5.0."
 },
 {
  "id": "Q47_13",
  "row": "solve",
  "duration": 2.7,
  "disp": "我們要找差 3.4 的兩層。",
  "en": "We need two levels 3.4 apart."
 },
 {
  "id": "Q47_14",
  "row": "solve",
  "duration": 2.9,
  "disp": "A，\\(E_{1}\\) 到 \\(E_{3}\\)，差 2.1。",
  "en": "A, E1 to E3: a gap of 2.1."
 },
 {
  "id": "Q47_15",
  "row": "solve",
  "duration": 5.7,
  "disp": "B，\\(E_{1}\\) 到 \\(E_{4}\\)，−1.6 減−5.0，差 3.4，就是它。",
  "en": "B, E1 to E4: −1.6 minus −5.0 is 3.4. That's the one."
 },
 {
  "id": "Q47_16",
  "row": "solve",
  "duration": 3.9,
  "disp": "C 差 2.5，D 差 7.9，E 差 1.3。",
  "en": "C's gap is 2.5, D's is 7.9, E's is 1.3."
 },
 {
  "id": "Q47_17",
  "row": "solve",
  "duration": 1.1,
  "disp": "答案 B。",
  "en": "Answer B."
 },
 {
  "id": "Q47_18",
  "row": "trick",
  "duration": 7.7,
  "disp": "送你一個秒殺公式：光子能量的電子伏特數，等於 1240 除以波長的奈米數。",
  "en": "Here's a shortcut formula: photon energy in eV equals 1240 divided by the wavelength in nanometers."
 },
 {
  "id": "Q47_19",
  "row": "trick",
  "duration": 12.5,
  "disp": "注意喔，這個 1240，只能在能量用電子伏特、波長用奈米的時候用，它其實就是 h 乘以 c，換成這兩個單位剛好是 1240。",
  "en": "Careful: this 1240 only works with energy in eV and wavelength in nm. It's really h times c, which comes to 1240 in those units."
 },
 {
  "id": "Q47_20",
  "row": "trick",
  "duration": 4.3,
  "disp": "1240÷365，剛好 3.4。",
  "en": "1240÷365 is exactly 3.4."
 },
 {
  "id": "Q47_21",
  "row": "trick",
  "duration": 6.9,
  "disp": "這個 1240 很好用，建議你像背暗戀對象的生日一樣，把它背起來。",
  "en": "This 1240 is so handy, I suggest memorizing it like your crush's birthday."
 }
];
/* tracks:end */
