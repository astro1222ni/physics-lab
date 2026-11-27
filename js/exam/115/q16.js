/* 115 學測第 16 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease,dot}=K,C=K.colors,D=Exam113Draw,P=Exam115Core;
  // 位置 x 用任意單位（x＝1 時的力大小當 1），F 全部由 electronForce 算（質子在原點、+x 為正）
  const Fx=x=>P.electronForce(x),XMIN=1,XMAX=4;
  const X=x=>230+x*50,SY=44,GY=160,KF=55,KA=40; // 上：x 軸與電荷；下：F–x 圖；KA：力箭頭每單位幾 px（長度 ∝ |F|）
  const FCOL=C.gold,CURVE=C.teal;
  function charge(g,x,y,r,pos){D.ball(g,x,y,r,pos?'#e8705f':'#7fb6ff');label(g,pos?'+':'−',x,y+r*.45,pos?'#fff':'#0d2238',r*1.3,'center');}
  // 上方的 x 軸：質子在原點、電子在 xe，力箭頭指向原點、長度 ∝ |F|
  function strip(g,xe,o={}){
    arrow(g,14,SY,450,SY,C.faint,1.5,8);label(g,'x',450,SY+22,C.white,17,'right');label(g,'0',X(0)-14,SY+6,C.white,15,'right');
    charge(g,X(0),SY,11,true);
    if(xe!=null){charge(g,X(xe),SY,9,false);if(o.force!==false){const f=Fx(xe),L=Math.abs(f)*KA,dir=Math.sign(f),y=SY-19;
      if(L>2)arrow(g,X(xe),y,X(xe)+dir*L,y,o.col||FCOL,3,Math.min(10,L*.6));label(g,'F',X(xe)+dir*(L+8),y+5,o.col||FCOL,16,dir>0?'left':'right');}}
  }
  function graph(g,o={}){
    arrow(g,14,GY,450,GY,C.faint,1.5,8);arrow(g,X(0),246,X(0),74,C.faint,1.5,8);
    label(g,'F',X(0)+10,88,C.white,18);label(g,'x',450,GY+22,C.white,17,'right');label(g,'0',X(0)-6,GY+18,C.white,15,'right');
    if(o.curve){const up=o.upto??1;g.save();g.beginPath();g.rect(0,64,460,184);g.clip();
      for(const sgn of [1,-1]){g.beginPath();let first=true;for(let i=0;i<=120;i++){const x=sgn*(.75+(XMAX-.75)*i/120);if(Math.abs(x)>.75+(XMAX-.75)*up)break;const px=X(x),py=GY-Fx(x)*KF;first?g.moveTo(px,py):g.lineTo(px,py);first=false;}
        g.strokeStyle=o.curveCol||CURVE;g.lineWidth=o.lw||3;g.setLineDash(o.dash||[]);g.stroke();g.setLineDash([]);}g.restore();}
    for(const x of o.pts||[])dot(g,X(x),GY-Fx(x)*KF,5,FCOL);
  }
  // 原卷五張 F–x 小圖
  const SHAPES=[
    x=>Math.sign(x)*.035/(x*x),x=>-Math.sign(x)*.035/(x*x),
    x=>x<0?.9+(x+.12)*(.65/.88):-.9+(x-.12)*(.65/.88),x=>x<0?-.9-(x+.12)*(.65/.88):.9-(x-.12)*(.65/.88),x=>-.035/(x*x)];
  function mini(g,i,x,y,w,h,o={}){
    const fs=o.font||11,ox=x+w*.5,oy=y+h*.56,sx=w*.44,sy=Math.min(oy-y-fs*.4,y+h-oy)-2,col=o.color||'#eef5f6';
    arrow(g,x+3,oy,x+w-3,oy,'#92aeba',1.1,Math.max(5,fs*.5));arrow(g,ox,y+h-1,ox,y+2,'#92aeba',1.1,Math.max(5,fs*.5));
    label(g,'F',ox+4,y+fs+1,'#c9d8de',fs);label(g,'x',x+w-3,oy+fs+1,'#c9d8de',fs,'right');label(g,'0',ox+3,oy+fs+1,'#c9d8de',fs*.9);
    const lines=i===2||i===3,lo=lines?.12:.19;
    g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
    for(const sgn of [-1,1]){g.beginPath();for(let j=0;j<=60;j++){const u=sgn*(lo+(1-lo)*j/60),v=SHAPES[i](u),px=ox+u*sx,py=oy-clamp(v,-1.2,1.2)*sy;j?g.lineTo(px,py):g.moveTo(px,py);}g.strokeStyle=col;g.lineWidth=o.lw||1.8;g.stroke();}
    g.restore();
  }
  function choiceArt(canvas,i){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);const g=canvas.getContext('2d');g.scale(d,d);mini(g,i,0,0,r.width,r.height,{font:r.width<130?11:12});}
  // 電子由右滑到左（跳過原點附近）的位置
  const slide=u=>{const L=2*(XMAX-XMIN),d=u*L;return d<=XMAX-XMIN?XMAX-d:-(XMIN+(d-(XMAX-XMIN)));};
  const sampled=u=>{const out=[];for(let j=0;j<=24;j++){const v=j/24;if(v>u)break;out.push(slide(v));}return out;};
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const id=s.id,k=s.part,t=s.t;
    switch(id){
      case 'Q16_07':{mini(g,0,40,30,220,190,{font:17,color:C.red,lw:3});const fl=.5+.5*Math.sin(t*6);
        g.save();g.globalAlpha=fl;g.beginPath();g.arc(40+220*.5+220*.44*.4,30+190*.56-60,34,0,2*Math.PI);g.strokeStyle=C.gold;g.lineWidth=3;g.stroke();g.restore();
        label(g,T('A（32%）','A (32%)'),150,244,C.white,17,'center');label(g,T('電子在右邊','Electron on the right'),370,100,C.white,18,'center');label(g,T('→ F > 0 ？','→ F > 0 ?'),370,136,C.gold,22,'center');return;}
      case 'Q16_08':{strip(g,1.3);arrow(g,300,110,380,110,C.white,2.4,10);label(g,T('+x 方向為正','+x is positive'),340,96,C.white,17,'center');
        label(g,T('力往左 → F < 0','Force to the left → F < 0'),230,180,FCOL,22,'center');label(g,T('力有方向，不是看電子在哪一邊','Force has a direction: not which side the electron is on'),230,226,C.faint,15,'center');return;}
      case 'Q16_09':case 'Q16_10':{const u=seg(k,.03,.95),xe=slide(u);strip(g,Math.abs(xe)>=XMIN?xe:null);graph(g,{pts:sampled(u)});
        label(g,id==='Q16_09'?T('異性相吸：永遠被拉向原點','Opposites attract: always pulled to the origin'):T('質子很黏：跑去哪都拉回來','A clingy proton: it always pulls back'),448,96,C.white,16,'right');return;}
      case 'Q16_11':{strip(g,1.3);strip(g,-1.3);graph(g,{pts:[1.3,-1.3]});label(g,T('右邊：往左拉，F < 0','Right: pulled left, F < 0'),448,226,FCOL,16,'right');label(g,T('左邊：往右拉，F > 0','Left: pulled right, F > 0'),12,96,FCOL,16);return;}
      case 'Q16_12':{strip(g,1);charge(g,X(2),SY,9,false);const f2=Fx(2),L=Math.abs(f2)*KA;arrow(g,X(2),SY-19,X(2)-L,SY-19,FCOL,3,Math.min(10,L*.6));
        label(g,'x = 1',X(1),SY+30,C.white,15,'center');label(g,'x = 2',X(2),SY+30,C.white,15,'center');
        label(g,T('大小呢？','How big?'),230,112,C.white,22,'center');sci(g,T('x 加倍 → F 變成 ','x doubled → F becomes ')+Math.round(Fx(1)/Fx(2))+T(' 分之 1','× smaller'),230,156,FCOL,20,'center');label(g,T('箭頭長度 ∝ 力的大小','Arrow length ∝ force'),230,200,C.faint,15,'center');return;}
      case 'Q16_13':{strip(g,null);graph(g,{curve:true,upto:seg(k,0,.8)});if(k>.5){label(g,T('靠近原點 → ∞','Near 0 → ∞'),X(.7),92,CURVE,16);label(g,T('遠離 → 0','Far → 0'),X(3.2),GY+34,CURVE,16,'center');}
        sci(g,'|F| ∝ 1/x^{2}',20,232,C.white,18);return;}
      case 'Q16_14':{strip(g,null);graph(g,{curve:true});label(g,T('x > 0：在下面','x > 0: below'),X(1.4),GY+70,CURVE,17);label(g,T('x < 0：在上面','x < 0: above'),X(-1.4),GY-50,CURVE,17,'right');return;}
      case 'Q16_15':{strip(g,null);graph(g,{curve:true});label(g,T('這就是 B','That is B'),448,96,C.green,22,'right');mark(g,436,130,true,11);return;}
      case 'Q16_16':{mini(g,0,30,30,190,170,{font:17,color:C.red,lw:3});mini(g,1,250,30,190,170,{font:17,color:C.teal,lw:3});mark(g,125,214,false,11);mark(g,345,214,true,11);
        label(g,T('A：畫成相斥','A: drawn as repulsion'),125,244,C.red,16,'center');label(g,T('B：相吸','B: attraction'),345,244,C.green,16,'center');return;}
      case 'Q16_17':{mini(g,2,30,30,190,170,{font:17,color:C.red,lw:3});mini(g,3,250,30,190,170,{font:17,color:C.red,lw:3});label(g,'C',125,214,C.white,17,'center');label(g,'D',345,214,C.white,17,'center');
        label(g,T('直線：不是平方反比','Straight lines: not inverse-square'),230,242,C.red,17,'center');return;}
      case 'Q16_18':{mini(g,4,20,34,190,170,{font:17,color:C.red,lw:3});label(g,'E',115,226,C.white,17,'center');
        strip(g,-2,{force:false});arrow(g,X(-2),SY-19,X(-2)-40,SY-19,C.red,3,10);label(g,T('左邊也往左？','Pulled left on the left too?'),340,112,C.red,17,'center');label(g,T('被推離質子，不合理','Pushed away: impossible'),340,146,C.red,17,'center');mark(g,340,186,false,12);return;}
      case 'Q16_19':{box(g,30,40,400,64,12,'#ffd17e1f',C.gold,2);label(g,T('① 吸引或排斥 → 決定正負','① Attract or repel → sign'),230,80,C.gold,20,'center');
        if(k>.4){box(g,30,130,400,64,12,'#8ae6d71f',CURVE,2);sci(g,T('② 平方反比 1/r^{2} → 決定形狀','② Inverse square 1/r^{2} → shape'),230,170,CURVE,20,'center');}return;}
      default:{charge(g,150,110,6,true);charge(g,330,110,5,false);line(g,158,110,323,110,'#ffffff55',1.5,[4,4]);label(g,T('質子、電子都非常小 → 當成點電荷','Proton and electron are tiny → point charges'),230,60,C.white,17,'center');
        sci(g,'F = k e^{2} / r^{2}',230,170,C.white,24,'center');label(g,T('只對點電荷成立','Holds for point charges'),230,212,C.gold,18,'center');}
    }
  }
  function hands(g,s){
    strip(g,s.x);graph(g,{pts:s.pts,curve:s.curve,dash:[6,5],lw:2});
    const f=Fx(s.x);line(g,X(s.x),SY+12,X(s.x),GY-f*KF,'#ffffff40',1,[3,4]);g.beginPath();g.arc(X(s.x),GY-f*KF,7,0,2*Math.PI);g.strokeStyle=FCOL;g.lineWidth=1.6;g.stroke();
    if(s.focus){g.beginPath();g.arc(X(s.x),SY,15,0,2*Math.PI);g.strokeStyle=C.gold;g.setLineDash([3,3]);g.lineWidth=1.5;g.stroke();g.setLineDash([]);}
    const L=s.pts.filter(x=>x<0).length,R=s.pts.length-L,ok=s.pts.length>=6&&L&&R;
    label(g,(ok?T('完成！','Done! '):'')+T('已描 ','Plotted ')+s.pts.length+T(' 點（左 ',' (left ')+L+T('、右 ',', right ')+R+T('）',')'),448,240,ok?C.green:C.white,15,'right');
    label(g,T('箭頭長度 ∝ |F|','Arrow length ∝ |F|'),448,96,C.faint,15,'right');
  }
  function pointer(canvas,h){
    const pt=e=>{const r=canvas.getBoundingClientRect(),k=Math.min(r.width/460,r.height/250);return [(e.clientX-r.left-(r.width-460*k)/2)/k,(e.clientY-r.top-(r.height-250*k)/2)/k];};
    let on=false;canvas.addEventListener('pointerdown',e=>{if(h.down(...pt(e))===false)return;on=true;canvas.setPointerCapture(e.pointerId);e.preventDefault();});
    canvas.addEventListener('pointermove',e=>{if(on)h.move(...pt(e));});const end=e=>{if(!on)return;on=false;h.up?.(...pt(e));};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
  }
  ExamScene.add(16,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,x:1.5,pts:[],curve:false,focus:false}),
    paint,choiceArt,
    preview(g){const y=120;arrow(g,20,y,445,y,C.faint,2,10);charge(g,X(0),y,15,true);charge(g,X(2),y,11,false);
      K.boost(1.1,()=>{label(g,'0',X(0),y+40,C.white,17,'center');label(g,'x',445,y+30,C.white,18,'right');label(g,T('質子（原點）','Proton (origin)'),X(0),y-30,'#ff9c8f',17,'center');label(g,T('電子','Electron'),X(2),y-26,'#9cc8ff',17,'center');
        arrow(g,300,206,380,206,C.white,2.4,10);label(g,T('F 朝 +x 為正','F > 0 toward +x'),290,212,C.white,16,'right');});},
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,btn,toggle,complete,render}){
      s.hands=true;canvas.tabIndex=0;let done=false;
      const set=x=>{x=clamp(x,-XMAX,XMAX);if(Math.abs(x)<XMIN)x=(x<0||(x===0&&s.x<0)?-1:1)*XMIN;s.x=Math.round(x*20)/20;};
      function record(){if(s.pts.some(p=>Math.abs(p-s.x)<.15)){render();return;}s.pts.push(s.x);
        if(LabSettings.get('sound'))LabSound.tone({freq:Math.round(330+180*Math.min(2,Math.abs(Fx(s.x)))),dur:.09,type:'triangle',gain:.11});
        const L=s.pts.some(x=>x<0),R=s.pts.some(x=>x>0);if(!done&&s.pts.length>=6&&L&&R){done=true;complete();if(LabSettings.get('sound'))LabSound.sweep({from:520,to:1040,dur:.3,gain:.12});}render();}
      pointer(canvas,{down(x,y){if(y<10||y>248)return false;set((x-230)/50);render();},move(x){set((x-230)/50);render();},up(){record();}});
      canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const d=e.key==='ArrowLeft'?-.1:.1;let n=s.x+d;if(Math.abs(n)<XMIN)n=d<0?-XMIN:XMIN;set(n);render();}
        else if(e.key==='Enter'||e.key===' '){e.preventDefault();record();}});
      canvas.addEventListener('focus',()=>{s.focus=true;render();});canvas.addEventListener('blur',()=>{s.focus=false;render();});
      btn(T('清除','Clear'),()=>{s.pts=[];});
      btn(T('記錄這一點','Record this point'),()=>record());
      toggle('疊上平方反比曲線','Show the inverse-square curve',v=>s.curve=v);
      return {};
    },
    read(s,output){const f=Fx(s.x);output.innerHTML='x = '+(s.x>0?'+':'')+s.x.toFixed(2)+'　F = <b>'+(f>0?'+':'−')+Math.abs(f).toFixed(2)+'</b>（'+T('以 x = 1 時的力為 1','force at x = 1 taken as 1')+'）　'+(f<0?T('往左拉，指向原點','pulled left, toward the origin'):T('往右拉，指向原點','pulled right, toward the origin'))+
      '<br>'+T('放開或按 Enter 記錄一點；左右兩側合計至少 6 點','Release or press Enter to record; at least 6 points on both sides');}
  });
  Exam115.add(16,{choiceArt});
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(16,{groups:{wrong:["電子在右邊，力就向右？", "Electron on the right, force to the right?"],flip:["力永遠指向原點", "The force always points to the origin"],solve:["畫出 F–x 圖", "The F–x graph"],others:["其他選項", "The other choices"],trick:["口訣", "The rule"]},board:{wrong:String.raw`x>0\ \overset{?}{\Rightarrow}\ F>0`,flip:String.raw`x>0\Rightarrow F<0,\quad x<0\Rightarrow F>0`,solve:String.raw`F=-\dfrac{ke^{2}}{x^{2}}\ (x>0),\quad F=+\dfrac{ke^{2}}{x^{2}}\ (x<0)`,others:[String.raw`\text{A：相斥}\quad \text{C、D：直線}\quad \text{E：不合理}`,String.raw`\text{A: repulsive}\quad \text{C, D: straight lines}\quad \text{E: impossible}`],trick:[String.raw`\text{吸或斥}\to\text{正負},\quad \tfrac{1}{r^2}\to\text{形狀}`,String.raw`\text{attract or repel}\to\text{sign},\quad \tfrac{1}{r^2}\to\text{shape}`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q16=[
 {
  "id": "Q16_07",
  "row": "wrong",
  "duration": 5.7,
  "disp": "選 A 的直覺是：電子在右邊，曲線就畫在右邊上面，往上翹。",
  "en": "The instinct behind A: the electron is on the right, so the curve goes on the upper right, bending upward."
 },
 {
  "id": "Q16_08",
  "row": "wrong",
  "duration": 3.1,
  "disp": "可是力有方向，往右才是正的。",
  "en": "But force has direction: only rightward is positive."
 },
 {
  "id": "Q16_09",
  "row": "flip",
  "duration": 9.5,
  "disp": "質子在原點，因為質子帶正電、電子帶負電，異性相吸，所以電子不管跑到哪裡，都被拉向原點的質子。",
  "en": "The proton sits at the origin. Proton positive, electron negative, opposites attract, so wherever the electron goes, it's pulled toward the proton at the origin."
 },
 {
  "id": "Q16_10",
  "row": "flip",
  "duration": 4.3,
  "disp": "這個質子很黏，電子跑去哪，它都要拉回來。",
  "en": "This proton is clingy: wherever the electron runs, it pulls it back."
 },
 {
  "id": "Q16_11",
  "row": "flip",
  "duration": 6.9,
  "disp": "電子在右邊，就被往左拉，力是負的；電子在左邊，被往右拉，力是正的。",
  "en": "Electron on the right, pulled left, force negative; electron on the left, pulled right, force positive."
 },
 {
  "id": "Q16_12",
  "row": "solve",
  "duration": 1.1,
  "disp": "大小呢？",
  "en": "And the magnitude?"
 },
 {
  "id": "Q16_13",
  "row": "solve",
  "duration": 10.1,
  "disp": "庫侖定律說，靜電力跟距離平方成反比，所以越靠近原點越大，靠到原點附近，衝向無限大；離遠了，趨近 0。",
  "en": "Coulomb's law says the electrostatic force goes as the inverse square of distance: bigger near the origin, shooting to infinity right next to it, and approaching 0 far away."
 },
 {
  "id": "Q16_14",
  "row": "solve",
  "duration": 9.5,
  "disp": "所以 x 大於 0，曲線在 x 軸下面，越靠近原點越往下衝；x 小於 0，在 x 軸上面，越靠近原點越往上衝。",
  "en": "So for x greater than 0, the curve lies below the axis and plunges near the origin; for x less than 0, it lies above the axis and shoots up near the origin."
 },
 {
  "id": "Q16_15",
  "row": "solve",
  "duration": 1.3,
  "disp": "這就是 B。",
  "en": "That's B."
 },
 {
  "id": "Q16_16",
  "row": "others",
  "duration": 4.1,
  "disp": "A 剛好上下顛倒，那是把相吸畫成相斥了。",
  "en": "A is exactly upside down: it draws attraction as repulsion."
 },
 {
  "id": "Q16_17",
  "row": "others",
  "duration": 4.7,
  "disp": "C、D 是直線，明顯不是距離平方反比關係，錯。",
  "en": "C and D are straight lines, clearly not an inverse square relation, so they are wrong."
 },
 {
  "id": "Q16_18",
  "row": "others",
  "duration": 5.7,
  "disp": "E 兩邊都往下，表示電子不管在哪裡，都被往左拉，不合理。",
  "en": "In E both sides go down, meaning the electron is always pulled left wherever it is. That makes no sense."
 },
 {
  "id": "Q16_19",
  "row": "trick",
  "duration": 7.7,
  "disp": "秒殺兩步：第一步，看吸引還是排斥，決定正負；第二步，看平方反比，決定形狀。",
  "en": "The two-step shortcut: step 1, attraction or repulsion sets the sign; step 2, the inverse square sets the shape."
 },
 {
  "id": "Q16_20",
  "row": "trick",
  "duration": 6.9,
  "disp": "注意喔，平方反比是點電荷才成立；質子、電子這麼小，可以當成點電荷。",
  "en": "Careful: the inverse-square law holds for point charges; a proton and an electron are so small they count as point charges."
 }
];
/* tracks:end */
