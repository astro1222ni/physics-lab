/* 115 學測第 48 題 */
(() => {
  // 畫面與動手（Claude 11/27）：EUV 光子的能量。波長 λ 青色、能量 E 金色、h 紫、c 藍，全頁一致。
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,sciText,sciHTML}=K,C=K.colors,P=Exam115Core;
  const LC=C.teal,EC=C.gold,HC=C.violet,CC=C.blue,RAY='#c7a4ff',EUV=13.5;
  const beep=(f,d=.08,type='sine',gain=.1)=>{if(LabSettings.get('sound')&&window.LabSound)LabSound.tone({freq:f,dur:d,type,gain});};
  const EJ=P.photonJ(EUV),EEV=P.photonEv(EUV),UVJ=P.photonJ(365),ANT=.5*3e-6*.03**2; // 螞蟻 3 mg、3 cm/s 的動能
  const nm=v=>v<100?v.toFixed(1):String(Math.round(v));
  function frac(g,num,den,x,y,color,size=24){
    g.font='600 '+size+'px system-ui,sans-serif';const w=Math.max(g.measureText(num.replace(/[\^_{}]/g,'')).width,g.measureText(den.replace(/[\^_{}]/g,'')).width)*.9+12;
    sci(g,num,x,y-size*.35,color,size,'center');line(g,x-w/2,y,x+w/2,y,color,2);sci(g,den,x,y+size*.95,color,size,'center');return w;
  }
  // 圖 18：EUV 微影光路
  function mirror(g,cx,cy,r,a0,a1,w=5){g.beginPath();g.arc(cx,cy,r,a0,a1);g.strokeStyle='#8fa3ae';g.lineWidth=w;g.stroke();g.beginPath();g.arc(cx,cy,r-w/2,a0,a1);g.strokeStyle='#d7e3e8';g.lineWidth=1.2;g.stroke();}
  function fig18(g,glow=0){
    const pts=[[62,202],[112,82],[176,170],[232,46],[250,196],[372,96],[352,214]];
    g.lineWidth=1.4;g.strokeStyle=RAY+(glow?'':'cc');g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.stroke();
    for(let i=1;i<pts.length;i++){const [x,y]=pts[i-1],[X,Y]=pts[i];arrow(g,x+(X-x)*.55-(X-x)*.02,y+(Y-y)*.55-(Y-y)*.02,x+(X-x)*.58,y+(Y-y)*.58,RAY,1.4,7);}
    mirror(g,74,190,28,Math.PI*.95,Math.PI*1.95,6);K.dot(g,62,202,4,'#fff3c4');for(let j=0;j<6;j++){const a=j*Math.PI/3;line(g,62,202,62+8*Math.cos(a),202+8*Math.sin(a),'#ffe9a8',1.5);}
    mirror(g,128,104,30,Math.PI*1.05,Math.PI*1.6);mirror(g,184,148,26,Math.PI*.2,Math.PI*.8);
    box(g,212,30,44,16,2,'#556a76','#c9d6dd',1.2);for(let j=1;j<6;j++)line(g,212+j*7.3,31,212+j*7.3,45,'#c9d6dd88',1);
    mirror(g,252,170,28,Math.PI*.25,Math.PI*.75);g.beginPath();g.arc(250,196,5,0,Math.PI*2);g.strokeStyle=C.white;g.lineWidth=1.5;g.stroke();
    mirror(g,330,118,48,Math.PI*1.75,Math.PI*2.25);
    g.beginPath();g.ellipse(352,218,36,11,0,0,Math.PI*2);g.fillStyle='#9fb2bd';g.fill();g.beginPath();g.ellipse(352,214,28,8,0,0,Math.PI*2);g.fillStyle='#d7e3e8';g.fill();
    label(g,T('EUV 光源','EUV source'),62,240,C.white,16,'center');label(g,T('反射鏡','Mirror'),98,58,C.faint,16,'center');label(g,T('反射鏡','Mirror'),170,200,C.faint,16,'center');
    label(g,T('積體電路模具','Photomask'),234,22,C.white,16,'center');label(g,T('反射鏡','Mirror'),262,236,C.faint,16,'center');label(g,T('反射鏡','Mirror'),410,64,C.faint,16,'center');label(g,T('晶片','Wafer'),400,240,C.white,16,'center');
  }
  // 數量級軸（能量，焦耳）
  const AX=v=>36+(Math.log10(v)+46)/40*388;
  function axis(g,marks){
    line(g,30,150,430,150,C.white,1.5);
    for(let e=-45;e<=-10;e+=5){line(g,AX(10**e),145,AX(10**e),155,C.faint,1.5);sci(g,'10^{'+String(e).replace('-','−')+'}',AX(10**e),178,C.faint,15,'center');}
    label(g,'J',446,155,C.faint,15,'right');
    for(const [v,col,txt,up] of marks){K.dot(g,AX(v),150,7,col);label(g,txt,AX(v),up?132:206,col,16,'center');}
  }
  function wave(g,x,y,len,per,amp,col){g.beginPath();for(let i=0;i<=len;i++){const yy=y-Math.sin(i/per*Math.PI*2)*amp;i?g.lineTo(x+i,yy):g.moveTo(x,yy);}g.strokeStyle=col;g.lineWidth=2.5;g.stroke();}
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const n=+s.id.slice(4),k=s.part,t=s.t;
    if(n===6||n===7){
      [['E = hλ'],['E = h / λ'],['E = hc / λ']].forEach(([f],j)=>{const x=85+j*145,dy=n===6?Math.sin(t*9+j*2)*3:0;box(g,x-66,62+dy,132,56,10,'#ffffff10',C.white+'66');sci(g,f,x,98+dy,C.white,21,'center');label(g,'?',x+54,80+dy,C.red,18);});
      if(n===7&&k>.3)label(g,T('看單位就分得出來','The units tell them apart'),230,190,EC,22,'center');
      return;
    }
    if(n===8){label(g,T('能量 E 的單位','Unit of energy E'),230,92,C.white,22,'center');label(g,T('J（焦耳）','J (joule)'),230,160,EC,36,'center');return;}
    if(n===9){
      [['h',T('普朗克常數','Planck constant'),'J·s',HC],['c',T('光速','speed of light'),'m/s',CC],['λ',T('波長','wavelength'),'m',LC]].forEach(([sym,name,u,col],j)=>{
        if(k<j*.28)return;const y=72+j*60;label(g,sym,60,y,col,30,'center');label(g,name,104,y-2,C.white,19);label(g,u,400,y-2,col,24,'right');});
      return;
    }
    if(n===10){
      let x=24;const y=118,sz=26,put=(str,col)=>{const w=sci(g,str,x,y,col,sz);const r=[x,w];x+=w;return r;};
      put('(J·',C.white);const s1=put('s',C.white);put(') × (',C.white);const m1=put('m',C.white);put('/',C.white);const s2=put('s',C.white);put(') ÷ ',C.white);const m2=put('m',C.white);
      if(k>.3)for(const [a,w] of [s1,s2])line(g,a-2,y+4,a+w+2,y-20,EC,2.5);
      if(k>.55)for(const [a,w] of [m1,m2])line(g,a-2,y+4,a+w+2,y-20,LC,2.5);
      if(k>.75){label(g,'= J',x+10,y,C.green,30);label(g,T('E = hc / λ 的單位剛好是焦耳','hc/λ comes out in joules'),230,200,C.green,19,'center');}
      return;
    }
    if(n===11){
      const per=72,x0=30;wave(g,x0,124,226,per,30,RAY);
      const c1=x0+per/4,c2=c1+per;line(g,c1,82,c2,82,LC,2);line(g,c1,76,c1,88,LC,2);line(g,c2,76,c2,88,LC,2);label(g,'λ',(c1+c2)/2,72,LC,20,'center');
      sci(g,'E = hf',290,58,C.white,22);if(k>.25)sci(g,'f = c / λ',290,104,C.white,22);if(k>.5)sci(g,'E = hc / λ',290,160,EC,26);
      if(k>.7){label(g,T('A 對','A is right'),290,214,C.green,20);mark(g,370,206,true,10);}
      return;
    }
    if(n>=12&&n<=15){
      if(n===15){label(g,T('所以','So'),230,60,C.white,18,'center');sci(g,'E ≈ '+sciText(EJ,1)+' J',230,130,C.green,36,'center');if(k>.3){label(g,T('D 對','D is right'),230,200,C.green,22,'center');mark(g,290,192,true,10);}return;}
      const f1=n===12?C.white:C.faint;
      sci(g,'E =',150,84,f1,22,'right');frac(g,'6.63×10^{−34} × 3×10^{8}','13.5×10^{−9}',275,78,f1,20);
      if(n>=13){const c=n===13?C.white:C.faint;sci(g,'6.63 × 3 ≈ '+(6.63*3).toFixed(1),24,150,c,19);sci(g,'10^{−34} × 10^{8} = 10^{−26}',214,150,c,19);if(n===13)label(g,T('次方相加：−34 + 8 = −26','add exponents: −34 + 8 = −26'),214,176,EC,15);}
      if(n===14){sci(g,'19.9 ÷ 13.5 ≈ '+(6.63*3/13.5).toFixed(2),24,206,C.white,19);sci(g,'10^{−26} ÷ 10^{−9} = 10^{−17}',214,206,C.white,19);label(g,T('次方相減：−26 − (−9) = −17','subtract: −26 − (−9) = −17'),214,232,EC,15);}
      return;
    }
    if(n===16){label(g,T('答案 A、D','Answer: A, D'),230,64,C.green,30,'center');
      sci(g,'A：E = hc / λ',90,130,C.white,22);mark(g,370,122,true,10);sci(g,'D：E ≈ 1.5×10^{−17} J',90,184,C.white,22);mark(g,370,176,true,10);return;}
    if(n===17){label(g,T('秒殺：E（eV）= 1240 / λ（nm）','Shortcut: E (eV) = 1240 / λ (nm)'),230,52,C.faint,17,'center');sci(g,'1240 ÷ 13.5 ≈ '+Math.round(1240/EUV)+' eV',230,130,EC,34,'center');return;}
    if(n===18){sci(g,'1 eV = 1.6×10^{−19} J',230,68,C.white,22,'center');sci(g,Math.round(1240/EUV)+' × 1.6×10^{−19}',230,128,C.white,24,'center');if(k>.4)sci(g,'≈ '+sciText(Math.round(1240/EUV)*1.6e-19,1)+' J',230,188,C.green,30,'center');return;}
    // 19–21：數量級
    const marks=[[5e-44,C.red,T('E 選項','choice E'),true],[UVJ,C.violet,'365 nm',false],[EJ,EC,'EUV',true]];
    if(n===21)marks.push([ANT,C.green,T('螞蟻','ant'),true]);
    axis(g,marks);
    if(n===19){sci(g,T('E：5×10^{−44} J？','E: 5×10^{−44} J?'),230,40,C.red,22,'center');if(k>.35)label(g,T('波長越短，能量越大','Shorter λ, more energy'),230,236,C.white,18,'center');}
    if(n===20)sci(g,T('10^{−44} J 有多小？','How small is 10^{−44} J?'),230,52,EC,24,'center');
    if(n===21){
      const d=Math.round(Math.log10(ANT/5e-44));
      if(k>.2){line(g,AX(5e-44),222,AX(ANT),222,EC,2);line(g,AX(5e-44),214,AX(5e-44),230,EC,2);line(g,AX(ANT),214,AX(ANT),230,EC,2);label(g,T('差約 '+d+' 個次方','about '+d+' powers of ten'),(AX(5e-44)+AX(ANT))/2,244,EC,17,'center');}
      label(g,T('螞蟻（3 mg）以 3 cm/s 爬行的動能','An ant (3 mg) crawling at 3 cm/s'),230,40,C.green,17,'center');sci(g,'mv^{2}/2 ≈ '+sciText(ANT,1)+' J',230,72,C.green,18,'center');
    }
  }
  // 能動手：在波長軸上拖（或滑桿、方向鍵），看光子能量
  const LX=l=>40+(Math.log10(l)-1)*190, XL=x=>10**(1+(x-40)/190), EMAX=P.photonJ(10);
  const snap=l=>{l=clamp(l,10,1000);return l<100?Math.round(l*10)/10:Math.round(l);};
  function hands(g,s){
    const l=s.lam,E=P.photonJ(l),ok=Math.abs(l-EUV)<=.05;
    sci(g,'λ = '+nm(l)+' nm',20,34,LC,22);sci(g,'E = hc / λ = '+sciText(E,2)+' J',20,66,ok?C.green:EC,19);sci(g,'= '+P.photonEv(l).toFixed(1)+' eV',20,94,EC,17);
    const col=l<121?RAY:l<380?C.violet:l<750?'#4fe06a':'#d9776b';wave(g,300,50,140,6+Math.log10(l)*8,10,col);
    // 波段
    [[10,121,T('極紫外 EUV','EUV'),'#c7a4ff'],[121,380,T('紫外','UV'),'#9f8cff'],[380,750,T('可見','vis.'),'#4fe06a'],[750,1000,T('紅外','IR'),'#d9776b']].forEach(([a,b,name,c])=>{g.fillStyle=c+'33';g.fillRect(LX(a),140,LX(b)-LX(a),20);label(g,name,(LX(a)+LX(b))/2,132,c,15,'center');});
    line(g,LX(10),150,LX(1000),150,C.white,1.5);
    for(const v of [10,100])label(g,String(v),LX(v),178,C.faint,15,'center');label(g,'1000 nm',446,178,C.faint,15,'right');
    line(g,LX(EUV),142,LX(EUV),160,EC,2,[3,2]);label(g,'13.5',LX(EUV)+6,178,EC,15);line(g,LX(365),142,LX(365),160,C.violet,2,[3,2]);label(g,'365',LX(365),178,C.violet,15,'center');
    K.dot(g,LX(l),150,12,LC+'55');K.dot(g,LX(l),150,7,LC);
    label(g,T('光子能量','Photon energy'),40,202,EC,15);box(g,40,208,Math.max(2,380*E/EMAX),14,4,EC+'cc');box(g,40,208,380,14,4,null,'#ffffff33',1);
    if(ok)sci(g,T('13.5 nm：E 約 1.5×10^{−17} J，D 對','13.5 nm: E ≈ 1.5×10^{−17} J, D is right'),230,244,C.green,16,'center');
    else label(g,T('波長越短，能量越大','Shorter λ, more energy'),230,244,C.faint,15,'center');
  }
  ExamScene.add(48,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,lam:550,done:false}),
    paint,
    preview(g){K.boost(1.15,()=>fig18(g));sci(g,'EUV λ = 13.5 nm',14,26,LC,16);},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,btn,complete,render}){
      s.hands=true;let r,last=null;
      function set(l){
        l=snap(l);if(l===s.lam)return;s.lam=l;r.input.value=Math.round((Math.log10(l)-1)*500);r.val.textContent=nm(l)+' nm';
        const b=Math.round(Math.log10(l)*20);if(b!==last){last=b;beep(1400-Math.log10(l)*380,.04,'triangle',.05);}
        if(Math.abs(l-EUV)<=.05&&!s.done){s.done=true;complete();beep(880,.14,'sine',.12);beep(1319,.2,'sine',.1);}
      }
      r=range(T('波長','Wavelength'),0,1000,Math.round((Math.log10(550)-1)*500),v=>set(10**(1+v/500)));r.val.textContent='550 nm';
      btn(T('365 nm（第 47 題）','365 nm (Q47)'),()=>set(365));btn(T('可見光 550 nm','Visible 550 nm'),()=>set(550));
      canvas.tabIndex=0;canvas.setAttribute('aria-label',T('沿波長軸拖曳青色點；方向鍵微調','Drag the teal dot along the wavelength axis; arrow keys fine-tune'));
      canvas.addEventListener('keydown',e=>{const d={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[e.key];if(!d)return;const step=(s.lam<100?.1:1)*(e.shiftKey?10:1);set(s.lam+d*step);e.preventDefault();render();});
      return {hit:(x,y)=>y>116&&y<190?0:null,move:(_,x)=>{set(XL(x));render();}};
    },
    read(s,output){
      const l=s.lam,E=P.photonJ(l),ok=Math.abs(l-EUV)<=.05;
      output.innerHTML='λ = '+nm(l)+' nm　E = hc/λ = 6.63×10<sup>−34</sup> × 3×10<sup>8</sup> ÷ ('+nm(l)+'×10<sup>−9</sup>) = <b>'+sciHTML(E,2)+' J</b> = '+P.photonEv(l).toFixed(1)+' eV'+
        (ok?T('<br>約 1.5×10<sup>−17</sup> J：D 對','<br>About 1.5×10<sup>−17</sup> J: D is right'):'');
    }
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(48,{groups:{wrong:["三個式子選哪個", "Which of the three formulas"],flip:["用單位檢查", "Check the units"],solve:["算出光子能量", "Compute the photon energy"],trick:["口訣", "The rule"]},board:{wrong:String.raw`h\lambda\ ?\quad \dfrac{h}{\lambda}\ ?\quad \dfrac{hc}{\lambda}\ ?`,flip:String.raw`\dfrac{(\mathrm{J\cdot s})(\mathrm{m/s})}{\mathrm{m}}=\mathrm{J}`,solve:String.raw`E=\dfrac{hc}{\lambda}=\dfrac{6.63\times10^{-34}\times3\times10^{8}}{13.5\times10^{-9}}\approx1.5\times10^{-17}\ \mathrm{J}`,trick:String.raw`\dfrac{1240}{13.5}\approx92\ \mathrm{eV}\approx1.5\times10^{-17}\ \mathrm{J}`}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q48=[
 {
  "id": "Q48_06",
  "row": "wrong",
  "duration": 5.68,
  "disp": "公式記不清楚的人，會寫成 h 乘以 λ，或 h 除以 λ。",
  "en": "People who half-remember the formula write h times lambda, or h over lambda."
 },
 {
  "id": "Q48_07",
  "row": "wrong",
  "duration": 5.9,
  "disp": "三個式子長得像三胞胎，分不出來沒關係，看單位就分得出來。",
  "en": "The three expressions look like triplets. If you can't tell them apart, the units can."
 },
 {
  "id": "Q48_08",
  "row": "flip",
  "duration": 1.7,
  "disp": "能量的單位要是焦耳。",
  "en": "Energy must come out in joules."
 },
 {
  "id": "Q48_09",
  "row": "flip",
  "duration": 8.39,
  "disp": "h 是普朗克常數，單位焦耳秒；c 是光速，單位公尺每秒；λ 是波長，單位公尺。",
  "en": "h is Planck's constant, in joule-seconds; c is the speed of light, in meters per second; lambda is wavelength, in meters."
 },
 {
  "id": "Q48_10",
  "row": "flip",
  "duration": 6.13,
  "disp": "h 乘以 c 除以 λ，焦耳秒乘以公尺每秒，再除以公尺，剛好剩下焦耳。",
  "en": "h times c over lambda: joule-seconds times meters per second, over meters, leaves exactly joules."
 },
 {
  "id": "Q48_11",
  "row": "solve",
  "duration": 8.49,
  "disp": "因為光子能量 E 等於 h 乘以頻率 f，頻率又等於光速除以波長，所以 E 等於 h c 除以 λ，A 對。",
  "en": "Photon energy E equals h times frequency f, and frequency is the speed of light over wavelength, so E equals hc over lambda. A is correct."
 },
 {
  "id": "Q48_12",
  "row": "solve",
  "duration": 9.2,
  "disp": "代數字：分子是 \\(6.63\\times10^{-34}\\)，乘以 \\(3\\times10^{8}\\)；分母是 \\(13.5\\times10^{-9}\\)。",
  "en": "Plug in the numbers: the numerator is \\(6.63\\times10^{-34}\\) times \\(3\\times10^{8}\\); the denominator is \\(13.5\\times10^{-9}\\)."
 },
 {
  "id": "Q48_13",
  "row": "solve",
  "duration": 6.88,
  "disp": "6.63×3 大約 19.9，次方相加，−34 加 8，等於−26。",
  "en": "6.63×3 is about 19.9; add the exponents, −34 plus 8, to get −26."
 },
 {
  "id": "Q48_14",
  "row": "solve",
  "duration": 9.62,
  "disp": "19.9÷13.5 大約 1.47；\\(10^{-26}\\)÷\\(10^{-9}\\)，次方相減，等於 \\(10^{-17}\\)。",
  "en": "19.9÷13.5 is about 1.47; \\(10^{-26}\\)÷\\(10^{-9}\\), subtracting exponents, gives \\(10^{-17}\\)."
 },
 {
  "id": "Q48_15",
  "row": "solve",
  "duration": 3.81,
  "disp": "所以 E 大約 \\(1.5\\times10^{-17}\\) 焦耳，D 對。",
  "en": "So E is about \\(1.5\\times10^{-17}\\) joules. D is correct."
 },
 {
  "id": "Q48_16",
  "row": "solve",
  "duration": 1.19,
  "disp": "答案 A、D。",
  "en": "Answer A and D."
 },
 {
  "id": "Q48_17",
  "row": "trick",
  "duration": 10.32,
  "disp": "用 1240 的秒殺公式檢查，一樣，能量用電子伏特、波長用奈米：1240÷13.5，大約 92 電子伏特。",
  "en": "Check with the 1240 shortcut, again energy in eV and wavelength in nm: 1240÷13.5 is about 92 eV."
 },
 {
  "id": "Q48_18",
  "row": "trick",
  "duration": 10.59,
  "disp": "1 電子伏特是 \\(1.6\\times10^{-19}\\) 焦耳，所以再乘以 \\(1.6\\times10^{-19}\\)，就是 \\(1.5\\times10^{-17}\\) 焦耳。",
  "en": "1 eV is \\(1.6\\times10^{-19}\\) joules, so multiply by \\(1.6\\times10^{-19}\\) to get \\(1.5\\times10^{-17}\\) joules."
 },
 {
  "id": "Q48_19",
  "row": "trick",
  "duration": 8.43,
  "disp": "E 那個 \\(10^{-44}\\)，比 365 奈米的光子還小得離譜，波長越短能量越大，用常識就刪掉了。",
  "en": "E's \\(10^{-44}\\) is absurdly smaller than even a 365 nm photon. Shorter wavelength means more energy, so common sense rules it out."
 },
 {
  "id": "Q48_20",
  "row": "trick",
  "duration": 3.37,
  "disp": "\\(10^{-44}\\) 焦耳有多小？",
  "en": "How small is \\(10^{-44}\\) joules?"
 },
 {
  "id": "Q48_21",
  "row": "trick",
  "duration": 3.76,
  "disp": "一隻螞蟻打個噴嚏，都比它大幾十個次方。",
  "en": "An ant's sneeze is dozens of orders of magnitude bigger."
 }
];
/* tracks:end */
