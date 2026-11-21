/* 113 學測第 19 題：核能發電（多選 ACE，全對 67%）。畫面與動手（Claude 11/21），字幕軌由 build_tracks113.py 產生。 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp}=K,C=K.colors,D=Exam113Draw;
  const CHAIN=[['fission','核分裂 Δm','Fission Δm',C.red],['heat','熱能','Heat',C.gold],['kinetic','動能（渦輪）','Kinetic (turbine)',C.teal],['elec','電能','Electrical',C.blue]];
  const DECOY=[['fusion','核融合','Fusion','#c7a4ff'],['sound','聲能','Sound','#92aeba']];
  function sun(g,x,y,r,k=0){
    const gl=g.createRadialGradient(x,y,r*.2,x,y,r*2);gl.addColorStop(0,'#fff3c4');gl.addColorStop(.35,'#ffc34d');gl.addColorStop(1,'#ff8a0000');g.fillStyle=gl;g.beginPath();g.arc(x,y,r*2,0,Math.PI*2);g.fill();
    D.ball(g,x,y,r,'#ffb43c','#ffd17e88');for(let i=0;i<12;i++){const a=i*Math.PI/6+k;line(g,x+Math.cos(a)*r*1.15,y+Math.sin(a)*r*1.15,x+Math.cos(a)*r*1.5,y+Math.sin(a)*r*1.5,'#ffd17e',2);}
  }
  // 核融合：兩個小核靠近、黏起來；k 0→1
  function fusion(g,x,y,k){
    const d=36*(1-seg(k,0,.6));
    if(k<.62){D.nucleus(g,x-d-6,y,9,2);D.nucleus(g,x+d+6,y,9,3);arrow(g,x-d-26,y,x-d-16,y,C.faint,1.5,6);arrow(g,x+d+26,y,x+d+16,y,C.faint,1.5,6);}
    else D.nucleus(g,x,y,13,5,seg(k,.6,.8)*(1-seg(k,.85,1)));
  }
  // 核分裂：中子撞鈾核 → 兩塊＋2、3 個中子；k 0→1
  function fission(g,x,y,k){
    const hit=seg(k,0,.35),fly=seg(k,.4,1);
    if(k<.38){D.nucleus(g,x,y,24,36);D.ball(g,x-90+hit*62,y,5,'#a9b8c2');label(g,'n',x-90+hit*62,y-9,C.faint,11,'center');}
    else{const s=8+fly*46;D.nucleus(g,x-s,y-s*.35,17,19,1-fly);D.nucleus(g,x+s,y+s*.3,16,17,1-fly);
      for(const [a,c] of [[-.4,1],[.6,1],[2.6,1]]){const r=18+fly*70;D.ball(g,x+Math.cos(a)*r,y+Math.sin(a)*r*.8,5,'#a9b8c2');}}
  }
  // 電廠：反應爐 → 蒸氣 → 渦輪 → 發電機 → 燈；hi：亮哪一段
  function plant(g,s,hi,x0=14,y0=200){
    const on=k=>hi===k||hi==='all',spin=s.t*(on('turbine')||on('gen')||hi==='all'?6:1.2);
    // 反應爐
    box(g,x0,y0-110,70,110,14,on('core')?'#3b2a2a':'#24333d','#ffb08a',1.5);for(let i=0;i<4;i++){const gl=on('core')?.6+.4*Math.sin(s.t*5+i):.35;box(g,x0+12+i*13,y0-80,7,62,3,'rgba(255,140,90,'+gl+')');}
    label(g,T('反應爐','Reactor'),x0+35,y0+18,C.faint,14,'center');
    // 水 → 蒸氣管
    line(g,x0+70,y0-92,x0+140,y0-92,on('heat')?'#ffd17e':'#5d7c88',5);
    if(on('heat'))for(let i=0;i<5;i++){const p=(s.t*.8+i/5)%1;g.fillStyle='rgba(235,245,255,'+(.75-p*.5)+')';g.beginPath();g.arc(x0+76+p*62,y0-92-Math.sin(p*9+i)*3,4+p*2,0,Math.PI*2);g.fill();}
    label(g,T('蒸氣','Steam'),x0+105,y0-102,on('heat')?C.gold:C.faint,14,'center');
    // 渦輪
    const tx=x0+168,ty=y0-92;g.save();g.translate(tx,ty);for(let i=0;i<8;i++){g.rotate(Math.PI/4);g.fillStyle=on('turbine')?'#8ae6d7':'#6f8c99';g.beginPath();g.ellipse(14,0,14,5,.4,0,Math.PI*2);g.fill();}g.restore();
    g.save();g.translate(tx,ty);g.rotate(spin);line(g,-26,0,26,0,'#ffffff33',1);g.restore();D.ball(g,tx,ty,6,'#c9d6dd');
    label(g,T('渦輪','Turbine'),tx,ty+44,on('turbine')?C.teal:C.faint,14,'center');
    // 發電機
    line(g,tx+30,ty,tx+60,ty,'#9fb2bd',4);box(g,tx+60,ty-24,52,48,10,on('gen')?'#1f3d5c':'#1c2d38',on('gen')?C.blue:'#5d7c88',1.6);
    g.save();g.translate(tx+86,ty);g.rotate(spin);for(let i=0;i<4;i++){g.rotate(Math.PI/2);g.fillStyle=on('gen')?'#7fb6ff':'#56707e';g.fillRect(-3,4,6,13);}g.restore();
    label(g,T('發電機','Generator'),tx+86,ty+44,on('gen')?C.blue:C.faint,14,'center');
    // 電線 → 燈泡
    line(g,tx+112,ty,tx+150,ty,on('gen')?'#ffd17e':'#5d7c88',2);const bx=tx+166,lit=on('gen')||hi==='all';
    if(lit){const gl=g.createRadialGradient(bx,ty-4,2,bx,ty-4,30);gl.addColorStop(0,'#fff6c8');gl.addColorStop(1,'#fff6c800');g.fillStyle=gl;g.beginPath();g.arc(bx,ty-4,30,0,Math.PI*2);g.fill();}
    D.ball(g,bx,ty-6,12,lit?'#ffe59a':'#56707e');box(g,bx-6,ty+5,12,9,2,'#8f9ea8');
  }
  const ids=['Q19_01','Q19_02','Q19_03','Q19_04','Q19_05','Q19_06','Q19_07','Q19_08','Q19_09','Q19_10','Q19_11','Q19_12','Q19_13'],I=id=>ids.indexOf(id);
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const i=I(s.id),k=s.part;
    if(s.row==='wrong'){
      if(i===0){label(g,T('錯最多：D 核融合','Top wrong pick: D, fusion'),20,34,C.red,18);
        const v=[93,3,88,29,86];v.forEach((p,j)=>{const y=62+j*34,on='ACE'.includes('ABCDE'[j]);label(g,'ABCDE'[j],28,y+14,C.white,15);box(g,48,y,300*p/100*seg(k,0,.6),20,5,on?'#6fe0a888':j===3?'#ff8a80aa':'#ffffff33');label(g,p+'%',56+300*p/100*seg(k,0,.6),y+15,on?C.green:j===3?C.red:C.faint,13);});
        label(g,T('全國選答率','National choice rates'),440,240,C.faint,14,'right');return;}
      sun(g,98,110,26,s.t*.3);label(g,T('太陽：核融合','The Sun: fusion'),98,190,'#c7a4ff',16,'center');
      line(g,230,30,230,226,'#35505f',1.5);
      box(g,300,70,96,84,10,'#24333d','#ffb08a');for(let j=0;j<4;j++)box(g,314+j*18,92,9,50,3,'rgba(255,140,90,.7)');
      label(g,T('核能電廠：核分裂','Nuclear plant: fission'),348,190,C.red,16,'center');
      if(i===2){g.fillStyle='#0c2535ee';g.fillRect(0,0,460,250);fusion(g,110,110,(s.t*.45)%1);label(g,T('小的黏成大的','Small join into big'),110,190,'#c7a4ff',15,'center');
        line(g,230,30,230,226,'#35505f',1.5);fission(g,340,110,(s.t*.45)%1);label(g,T('大的打成兩塊','Big splits in two'),340,190,C.red,15,'center');label(g,T('鈾','U'),340,62,C.faint,14,'center');}
      else mark(g,348,226,true,10);
      return;
    }
    if(s.row==='solve'){
      if(i===3){fission(g,230,118,k);sci(g,'^{235}U + n',40,46,C.white,20);if(k>.45)sci(g,T('→ 兩個較小的核 + 2～3 n','→ two smaller nuclei + 2–3 n'),40,226,C.gold,17);return;}
      if(i===4){label(g,T('反應前','Before'),110,48,C.faint,14,'center');label(g,T('反應後','After'),330,48,C.faint,14,'center');
        box(g,60,80,100,120,8,'#ffffff12','#ffffff40');box(g,280,80+12*seg(k,0,.4),100,120-12*seg(k,0,.4),8,'#ffffff12','#ffffff40');
        sci(g,'m_{1}',110,150,C.white,22,'center');sci(g,'m_{2} < m_{1}',330,150,C.white,20,'center');
        if(k>.4){sci(g,'Δm = m_{1} − m_{2}',40,226,C.gold,18);arrow(g,330,74,330,92,C.gold,2,8);}
        if(k>.65){sci(g,'E = Δm c^{2}',230,40,'#ffb08a',22,'center');label(g,T('質能轉換：A 對','Mass–energy: A is right'),450,226,C.green,15,'right');mark(g,420,150,true,10);}
        return;}
      if(i===5){plant(g,s,k<.45?'core':k<.75?'heat':'turbine');label(g,T('碎片動能 → 熱 → 蒸氣推渦輪','Fragments → heat → steam drives turbine'),20,30,C.gold,15);if(k>.8){label(g,T('熱能轉動能：C 對','Heat to kinetic: C is right'),440,240,C.green,14,'right');}return;}
      if(i===6){plant(g,s,'gen');label(g,T('動能 → 電能','Kinetic → electrical'),20,30,C.blue,16);return;}
      if(i===7){plant(g,s,'turbine');for(let j=0;j<3;j++){const r=16+((s.t*30+j*14)%42);g.beginPath();g.arc(182,108,r,-1.1,-.2);g.strokeStyle='rgba(199,164,255,'+(1-r/58)+')';g.lineWidth=2;g.stroke();}
        label(g,T('B 聲能轉電能？聲音是浪費掉的','B, sound to electricity? Sound is wasted'),20,30,'#c7a4ff',15);mark(g,420,40,false,10);return;}
      // i===8 答案
      const xs=[16,128,240,352];CHAIN.forEach(([,z,e,c],j)=>{if(k>j*.18){D.chip(g,xs[j],96,96,T(z,e),c);if(j<3)arrow(g,xs[j]+98,111,xs[j+1]-2,111,C.faint,1.5,7);}});
      if(k>.7){label(g,T('答案 A、C、E','Answer: A, C, E'),230,196,C.green,22,'center');}return;
    }
    if(s.row==='feel'){
      if(i===9){box(g,40,96,70,56,10,'#d9e3ea','#ffffff');label(g,'1 g',75,132,'#0c2535',20,'center');arrow(g,126,124,196,124,C.gold,3,12);
        sci(g,'E = mc^{2} = 0.001 × (3×10^{8})^{2}',210,96,C.white,15);if(k>.4)sci(g,'≈ 9×10^{13} J',210,140,C.gold,26);return;}
      if(i===10){for(const [x,y] of [[30,64],[30,140]]){box(g,x,y,120,40,8,'#e9eef2','#ffffff');for(let j=0;j<4;j++)line(g,x+12,y+26+j*3,x+108,y+26+j*3,'#9fb2bd',1);
          for(let j=0;j<3;j++){const p=(s.t*.6+j/3)%1;line(g,x+20+j*36,y+44+p*18,x+26+j*36,y+52+p*18,'rgba(127,182,255,'+(1-p)+')',2);}}
        label(g,T('兩台合計約 7 kW','About 7 kW together'),90,218,C.faint,14,'center');
        const yrs=Math.round(9e13/7000/3.156e7*seg(k,.1,.9));sci(g,'9×10^{13} J ÷ 7000 W',210,80,C.white,17);label(g,T('≈ '+yrs+' 年','≈ '+yrs+' years'),210,140,C.gold,34);
        if(k>.9)label(g,T('不停地吹','nonstop'),210,176,C.faint,14);return;}
      // i===11 總要放學
      box(g,150,60,160,110,14,'#24333d','#5d7c88');label(g,T('放學','Home time'),230,128,C.gold,32,'center');
      const a=s.t*2;line(g,230,190,230+Math.cos(a)*26,190+Math.sin(a)*26,C.white,2);g.beginPath();g.arc(230,190,32,0,Math.PI*2);g.strokeStyle=C.faint;g.lineWidth=1.5;g.stroke();
      return;
    }
    // trick
    const xs=[16,128,240,352];CHAIN.forEach(([,z,e,c],j)=>{D.chip(g,xs[j],100,96,T(z,e),c,k>j*.2);if(j<3)arrow(g,xs[j]+98,115,xs[j+1]-2,115,k>j*.2+.1?C.white:C.faint,1.5,7);});
    sci(g,'Δm → Q → K → E_{elec}',230,190,C.gold,20,'center');label(g,T('少一點質量，煮一鍋開水，轉一台發電機','Lose a little mass, boil water, spin a generator'),230,46,C.white,15,'center');
  }
  // 能動手：依序點能量卡，排出能量鏈
  function hands(g,s){
    label(g,T('從原子核排到插座','From the nucleus to the socket'),20,30,C.gold,16);
    const xs=[16,128,240,352];
    for(let j=0;j<4;j++){const c=s.chain[j],def=c&&CHAIN.find(x=>x[0]===c);
      if(def)D.chip(g,xs[j],80,96,T(def[1],def[2]),def[3]);else{box(g,xs[j],80,96,30,8,null,'#ffffff40',1.2);g.setLineDash([]);label(g,String(j+1),xs[j]+48,100,C.faint,14,'center');}
      if(j<3)arrow(g,xs[j]+98,95,xs[j+1]-2,95,C.faint,1.5,7);}
    if(s.wrong){label(g,T('這一步不對，重新排一次','Not that one. Start again.'),230,150,C.red,16,'center');}
    if(s.chain.length===4&&s.done){plant(g,{...s,t:s.t},'all',60,236);label(g,T('一次排對！','Right in one go!'),440,150,C.green,18,'right');}
    else label(g,T('核融合、聲能是陷阱','Fusion and sound are traps'),230,200,C.faint,14,'center');
  }
  ExamScene.add(19,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,chain:[],wrong:false,clean:true,done:false}),
    paint,
    preview(g){const s={t:1.2};plant(g,s,'all',20,214);label(g,T('核燃料 → 電','Nuclear fuel → electricity'),20,30,C.gold,17);label(g,T('哪些能量轉換？','Which conversions?'),440,30,C.faint,14,'right');},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,controls,btn,complete,render}){
      s.hands=true;let raf=0;const tick=now=>{s.t=now/1000;render();raf=requestAnimationFrame(tick);};
      const pick=id=>{if(s.done)return;const want=CHAIN[s.chain.length][0];
        if(id===want){s.chain.push(id);s.wrong=false;if(s.chain.length===4){s.done=true;if(s.clean)complete();cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}}
        else{s.chain=[];s.wrong=true;s.clean=false;}};
      for(const [id,z,e] of [...CHAIN.slice(1,3),DECOY[0],CHAIN[3],CHAIN[0],DECOY[1]])btn(T(z,e),()=>pick(id));
      btn(T('重排','Reset'),()=>{s.chain=[];s.wrong=false;s.clean=true;s.done=false;cancelAnimationFrame(raf);});
      addEventListener('pagehide',()=>cancelAnimationFrame(raf));
      return {};
    },
    read(s,output){output.textContent=s.done?T('質量 → 熱 → 動能 → 電能：A、C、E 都在鏈上','Mass → heat → kinetic → electrical: A, C and E are all on the chain'):T('已排 '+s.chain.length+' / 4','Placed '+s.chain.length+' / 4');}
  });
})();
/* script:start（build_tracks113.py 由 稿/scripts.py 產生，勿手改） */
Exam113.add(19,{groups:{wrong:["核分裂不是核融合", "Fission, not fusion"],solve:["一路換能量", "Follow the energy"],feel:["一公克有多大", "How big is one gram"],trick:["口訣", "The rule"]},board:{wrong:String.raw`\text{fission}\neq\text{fusion}`,solve:String.raw`E=\Delta m\,c^{2}`,feel:String.raw`1\,\text{g}\ \to\ 9\times10^{13}\,\text{J}`,trick:String.raw`\Delta m\to Q\to K\to E_{\text{elec}}`}});
/* script:end */
/* tracks:start（build_tracks113.py 產生，勿手改） */
ExamTracks.Q19=[
 {
  "id": "Q19_01",
  "row": "wrong",
  "duration": 4.92,
  "disp": "這題錯最多的是 D，有 29% 的人勾了核融合。",
  "en": "The top wrong pick is D: 29% chose nuclear fusion."
 },
 {
  "id": "Q19_02",
  "row": "wrong",
  "duration": 5.13,
  "disp": "核融合是太陽在用的；題目說的核能電廠，發電原理是核分裂。",
  "en": "Fusion is what the Sun uses. The nuclear plants in the question run on fission."
 },
 {
  "id": "Q19_03",
  "row": "wrong",
  "duration": 6.01,
  "disp": "融合是把小的原子核黏成大的，分裂是把很大的鈾原子核打成兩塊。",
  "en": "Fusion sticks small nuclei together; fission splits a big uranium nucleus in two."
 },
 {
  "id": "Q19_04",
  "row": "solve",
  "duration": 5.91,
  "disp": "鈾 235 吸收一個中子，分裂成兩個比較小的原子核，再放出兩、三個中子。",
  "en": "Uranium-235 absorbs a neutron, splits into two smaller nuclei and releases two or three neutrons."
 },
 {
  "id": "Q19_05",
  "row": "solve",
  "duration": 10.03,
  "disp": "反應完，產物的總質量比原來少了一點點；少掉的質量 Δm 變成釋放出來的能量，E 等於 Δm c 平方，這就是質能轉換，A 對。",
  "en": "Afterwards the products have a little less total mass. The missing mass Δm is released as energy, \\(E=\\Delta m\\,c^{2}\\). That is mass–energy conversion, so A is right."
 },
 {
  "id": "Q19_06",
  "row": "solve",
  "duration": 9.28,
  "disp": "這些能量先變成碎片的動能，碎片撞來撞去變成熱，把水煮成高溫高壓的水蒸氣，推著渦輪轉，熱能變成動能，C 對。",
  "en": "The energy first appears as motion of the fragments; their collisions turn it into heat, which boils water into high-pressure steam that spins a turbine: heat to kinetic energy, so C is right."
 },
 {
  "id": "Q19_07",
  "row": "solve",
  "duration": 3.39,
  "disp": "渦輪再帶著發電機轉，動能變成電能。",
  "en": "The turbine turns the generator, turning kinetic energy into electrical energy."
 },
 {
  "id": "Q19_08",
  "row": "solve",
  "duration": 6.09,
  "disp": "B 聲能轉電能？電廠運轉當然有聲音，可是那是浪費掉的能量，不是拿來發電的。",
  "en": "B, sound to electricity? A running plant is noisy, but that sound is wasted energy, not what makes the electricity."
 },
 {
  "id": "Q19_09",
  "row": "solve",
  "duration": 1.28,
  "disp": "答案 A、C、E。",
  "en": "The answer is A, C and E."
 },
 {
  "id": "Q19_10",
  "row": "feel",
  "duration": 5.84,
  "disp": "我上課算過，一公克的質量完全變成能量，大約 9 乘以 10 的 13 次方焦耳。",
  "en": "I worked it out in class: one gram of mass fully converted gives about \\(9\\times10^{13}\\) joules."
 },
 {
  "id": "Q19_11",
  "row": "feel",
  "duration": 5.49,
  "disp": "拿來開我們教室的兩台冷氣，加起來大約 7 千瓦，可以一直吹四百多年。",
  "en": "That would run the two air conditioners in our classroom, about 7 kW together, for over 400 years."
 },
 {
  "id": "Q19_12",
  "row": "feel",
  "duration": 4.24,
  "disp": "當然，你也不可能一整天都待在教室吹冷氣嘛，總是要放學。",
  "en": "Of course, nobody stays in the classroom with the AC on all day. You do go home eventually."
 },
 {
  "id": "Q19_13",
  "row": "trick",
  "duration": 4.39,
  "disp": "秒殺口訣：少一點質量，煮一鍋開水，轉一台發電機。",
  "en": "The quick rule: lose a little mass, boil some water, spin a generator."
 }
];
/* tracks:end */
