/* 115 學測第 53 題 */
(() => {
  const K=ExamScene.kit,{T,label,line,arrow,sci,box,mark,seg,clamp,ease}=K,C=K.colors,P=Exam115Core;
  // 顏色：I>0 青、I<0 珊瑚、磁鐵的磁場藍、線圈的感應磁場紫、磁力紅、速度金
  const POS=C.teal,NEG='#ff9f8a',BM=C.blue,BI=C.violet,FC=C.red,VC=C.gold,WIRE='#d8b072';
  const {TABLE10:TB}=P,ORDER=[-20,-15,-10,-5,5,10,15,20];
  // 表 10 的實測值：z<0 屬於下列（量值小、I<0）、z>0 屬於上列（量值大、I>0）；|z|<5 磁鐵一部分在線圈內，表上沒有
  const meas=z=>{const i=TB.z.indexOf(Math.abs(z));return i<0?null:z>0?TB.above[i]:-TB.below[i];};
  function interp(z){ // 表 10 之間用對數內插、20 cm 以外照 15→20 的比例外推（只給動手區的即時讀數）
    const a=Math.abs(z);if(a<5)return null;const row=z>0?TB.above:TB.below,sg=z>0?1:-1;
    let i=Math.min(2,Math.floor((a-5)/5));if(a>20)i=2;const u=(a-TB.z[i])/5;return sg*row[i]*Math.pow(row[i+1]/row[i],u);
  }
  // 磁鐵中心位置 m（cm，磁鐵長 10 cm）→ 題目的 z：在下方取 N 端、在上方取 S 端；兩端都在線圈外才有 z
  const zOf=m=>m+5<=-5?m+5:m-5>=5?m-5:null;
  // ── 圖 22 的場景：線圈（中點在 cy）、檢流計、細繩與手、N 極朝上的磁鐵
  function scene(g,o){
    const {cx,cy}=o,sc=o.sc||4,hh=o.hh??5*sc,R=o.R??30,ry=R*.28,len=o.len??10*sc,my=o.my??cy-(o.m??-20)*sc,a=o.alpha??1;
    g.save();g.globalAlpha=a;
    const gx=cx+R+40,turns=5,ty=i=>cy-hh*.8+i*hh*1.6/(turns-1);
    if(o.G!==false){
      g.strokeStyle=WIRE;g.lineWidth=2;g.beginPath();g.moveTo(cx+R,cy-hh+4);g.lineTo(gx,cy-hh+4);g.lineTo(gx,cy-12);g.stroke();
      g.beginPath();g.moveTo(gx,cy+12);g.lineTo(gx,cy+hh+16);g.lineTo(cx+R+8,cy+hh+16);g.lineTo(cx+R+8,cy+hh-4);g.lineTo(cx+R,cy+hh-4);g.stroke();
      K.dot(g,gx,cy,12,'#0c2535');g.beginPath();g.arc(gx,cy,12,0,2*Math.PI);g.strokeStyle=C.white;g.lineWidth=1.8;g.stroke();
      const I=o.I||0;if(Math.abs(I)>.05){const ang=clamp(I/4.5,-1,1)*.9;line(g,gx,cy+6,gx+11*Math.sin(ang),cy+6-11*Math.cos(ang),I>0?POS:NEG,2);}
      label(g,'G',gx,cy+(Math.abs(o.I||0)>.05?-1:5),C.white,13,'center');
      arrow(g,gx,cy+hh+14,gx,cy+16,o.glow?VC:C.white,2,8);if(o.Ilabel!==false)sci(g,'I > 0',gx+8,cy+hh+12,o.glow?VC:C.white,15);
    }
    // 線圈後半圈、筒身
    g.fillStyle='#ffffff10';g.fillRect(cx-R,cy-hh,2*R,2*hh);line(g,cx-R,cy-hh,cx-R,cy+hh,'#ffffff55',1);line(g,cx+R,cy-hh,cx+R,cy+hh,'#ffffff55',1);
    g.beginPath();g.ellipse(cx,cy-hh,R,ry,0,0,2*Math.PI);g.strokeStyle='#ffffff66';g.lineWidth=1;g.stroke();
    for(let i=0;i<turns;i++){g.beginPath();g.ellipse(cx,ty(i),R,ry,0,Math.PI,2*Math.PI);g.strokeStyle=WIRE+'77';g.lineWidth=2;g.stroke();}
    // 細繩與手、磁鐵
    const top=my-len/2;
    if(o.hand!==false){line(g,cx,top,cx,8,'#c9d1d4',1.5);g.beginPath();g.ellipse(cx+5,10,12,7,-.2,0,2*Math.PI);g.fillStyle='#e8c4a0';g.fill();}
    if(o.field&&top>cy-hh){const reach=Math.max(8,cy-hh-70);g.save();g.globalAlpha=a*.85;
      for(let i=-3;i<=3;i++){g.beginPath();for(let y=top;y>=reach;y-=4){const x=cx+i*(2.5+.2*(top-y));y===top?g.moveTo(x,y):g.lineTo(x,y);}g.strokeStyle=BM;g.lineWidth=1.4;g.stroke();
        const ya=Math.max(reach+6,cy-hh-30),xa=cx+i*(2.5+.2*(top-ya));arrow(g,xa,ya+6,xa+i*.8,ya-4,BM,1.4,7);}
      g.restore();}
    box(g,cx-8,top,16,len/2,2,'#20262c','#ffffff88',1);box(g,cx-8,my,16,len/2,2,'#e6edf1','#ffffff88',1);label(g,'N',cx,top+Math.min(15,len/2-2),C.white,Math.min(15,len/2),'center');
    if(o.v){arrow(g,cx-16,my+12,cx-16,my+12-o.v,VC,3,9);}
    // 線圈前半圈：定義的箭號（白）＋真正的電流（青或珊瑚）
    for(let i=0;i<turns;i++){const y=ty(i)+ry;g.beginPath();g.ellipse(cx,ty(i),R,ry,0,0,Math.PI);g.strokeStyle=WIRE;g.lineWidth=2.4;g.stroke();
      const fy=(i,dx)=>ty(i)+ry*Math.sqrt(Math.max(0,1-(dx/R)**2));if(o.def!==false){const x=cx-R*.55,y=fy(i,-R*.55);g.beginPath();g.moveTo(x+5,y);g.lineTo(x-3,y-4);g.lineTo(x-3,y+4);g.closePath();g.fillStyle=o.glow?VC:C.white;g.fill();}
      if(Math.abs(o.I||0)>.05&&o.flow!==false){const d=Math.sign(o.I),x0=cx+R*(d>0?.18:.92),x1=cx+R*(d>0?.92:.18);arrow(g,x0,fy(i,x0-cx),x1,fy(i,x1-cx),o.I>0?POS:NEG,3.2,10);}}
    if(o.induced){arrow(g,cx,cy-hh-8,cx,cy+hh+10,BI,4,12);label(g,T('感應','Induced'),cx-R-8,cy-4,BI,15,'right');label(g,T('磁場','field'),cx-R-8,cy+14,BI,15,'right');}
    if(o.poles){label(g,'S',cx+R+16,cy-hh+6,BI,17,'center');label(g,'N',cx-R-10,cy+hh+16,BI,18,'right');}
    if(o.force){const dir=o.force;arrow(g,cx+20,my,cx+20,my+dir*30,FC,3,10);if(o.forceText)label(g,o.forceText,cx+28,my+dir*18+5,FC,15);}
    g.restore();
    return {my,top,gx};
  }
  // ── I–z 圖（答題卷第 53 題的方格紙）：b={x0,y0,sx,sy}
  function graph(g,b,o={}){
    const X=z=>b.x0+z*b.sx,Y=I=>b.y0-I*b.sy,zs=o.zt||[-20,-15,-10,-5,5,10,15,20],is=o.it||[-4,-3,-2,-1,1,2,3,4];
    g.strokeStyle='#ffffff12';g.lineWidth=1;
    for(let z=-25;z<=25;z+=5){g.beginPath();g.moveTo(X(z),Y(5));g.lineTo(X(z),Y(-5));g.stroke();}
    for(let I=-5;I<=5;I++){g.beginPath();g.moveTo(X(-25),Y(I));g.lineTo(X(25),Y(I));g.stroke();}
    arrow(g,X(-25),b.y0,X(25)+12,b.y0,C.faint,1.5,7);arrow(g,b.x0,Y(-5),b.x0,Y(5)-12,C.faint,1.5,7);
    for(const z of zs){line(g,X(z),b.y0-3,X(z),b.y0+3,C.faint,1);label(g,String(z).replace('-','−'),X(z),z>0?b.y0+18:b.y0-8,C.faint,15,'center');}
    for(const I of is){line(g,b.x0-3,Y(I),b.x0+3,Y(I),C.faint,1);label(g,String(I).replace('-','−'),I>0?b.x0-6:b.x0+6,Y(I)+5,C.faint,15,I>0?'right':'left');}
    sci(g,T('I（mA）','I (mA)'),b.x0+8,Y(5)-2,C.white,15);sci(g,T('z（cm）','z (cm)'),X(25)+8,b.y0+38,C.white,15,'right');
    return {X,Y};
  }
  function pt(g,x,y,col,r=5){K.dot(g,x,y,r+3,col+'44');K.dot(g,x,y,r,col);}
  function table(g,x,y,o={}){
    const cw=40,lw=58,rh=28;sci(g,'|z|',x+lw/2,y,C.faint,15,'center');TB.z.forEach((z,i)=>label(g,String(z),x+lw+cw*i+cw/2,y,C.faint,15,'center'));
    [[TB.below,o.c1||C.white,o.l1],[TB.above,o.c2||C.white,o.l2]].forEach(([row,col,lab],r)=>{const yy=y+rh*(r+1);
      if(o.hi&&o.hi[r])box(g,x-4,yy-20,lw+cw*4+8,26,6,col+'26',col,1.4);
      sci(g,lab||'|I|',x+lw/2,yy,col,15,'center');row.forEach((v,i)=>label(g,v.toFixed(2),x+lw+cw*i+cw/2,yy,col,15,'center'));});
  }
  function chip(g,x,y,w,txt,col,on=true,size=16){box(g,x,y,w,36,8,on?col+'2e':'#ffffff0d',on?col:'#ffffff30',1.6);sci(g,txt,x+w/2,y+24,on?col:C.faint,size,'center');}
  const rows=(g,list,x=244)=>list.forEach(([txt,col,size,y])=>sci(g,txt,x,y,col,size||16));
  const SC={cx:110,cy:104,sc:4};
  function paint(g,s){
    if(s.hands)return hands(g,s);
    const k=s.part,t=s.t;
    switch(s.id){
      case 'Q53_07':{const u=ease(seg(k,0,.9)),m=-30+12*u*u;scene(g,{...SC,m,v:14+20*u});
        rows(g,[[T('磁鐵在線圈下方','The magnet is below'),C.white,16,56],[T('往上靠近：z < 0','rising toward it: z < 0'),C.white,16,82],[T('I > 0 還是 I < 0？','I > 0 or I < 0?'),VC,19,140]]);return;}
      case 'Q53_08':scene(g,{...SC,m:-18,glow:true});rows(g,[[T('直覺：照圖上的箭頭','Instinct: follow the arrows'),C.white,16,70],['I > 0 ?',NEG,22,116]]);return;
      case 'Q53_09':scene(g,{...SC,m:-18,glow:true});rows(g,[[T('箭頭 ＝ 定義','Arrow = the definition'),VC,18,70],[T('哪個方向叫「正」','of which way is positive'),VC,16,98],[T('不是電流真正的方向','not where it really flows'),C.white,16,140]]);return;
      case 'Q53_10':{scene(g,{...SC,m:-18,glow:true});
        line(g,300,72,300,210,'#9aa8b0',4);box(g,252,44,120,40,6,'#2e7d4f','#e6f2ea',2);label(g,T('往臺北 →','Taipei →'),312,70,'#ffffff',17,'center');
        const cx=430-120*ease(seg(k,.1,.9));box(g,cx-26,186,52,20,6,'#d0605a','#ffd0c8',1.5);K.dot(g,cx-14,208,5,'#111');K.dot(g,cx+14,208,5,'#111');arrow(g,cx-30,178,cx-58,178,NEG,2.5,9);
        label(g,T('路標 ≠ 車真正的方向','Sign ≠ where the car goes'),340,240,C.white,15,'center');return;}
      case 'Q53_11':scene(g,{...SC,m:-18});chip(g,240,60,210,T('冷次定律','Lenz’s law'),VC);chip(g,240,112,210,T('線圈討厭磁通量變化','The coil hates flux change'),C.white,true,15);return;
      case 'Q53_12':{const m=-30+14*ease(seg(k,0,.5)),r=scene(g,{...SC,m,field:true,induced:k>.45,poles:k>.7,force:k>.7?1:0,forceText:T('排斥','repel')});
        const top=r.top,n=[-3,-2,-1,0,1,2,3].filter(i=>Math.abs(i*(2.5+.2*(top-104)))<28).length;
        rows(g,[[T('穿過線圈向上的磁力線','Upward field lines in the coil'),BM,15,40],[n+T(' 條 → 越來越多',' → more and more'),BM,18,66]]);
        if(k>.45)rows(g,[[T('感應磁場向下來抵抗','Induced field points down'),BI,16,112]]);
        if(k>.7)rows(g,[[T('線圈下端變 N 極','Coil bottom becomes N'),BI,16,150],[T('N 對 N：互相排斥','N facing N: they repel'),FC,16,176]]);return;}
      case 'Q53_13':scene(g,{...SC,m:-16,induced:true,I:-2.4,poles:true});
        rows(g,[[T('要產生向下的磁場','A downward field needs'),C.white,16,60],[T('電流和箭號相反','current against the arrows'),NEG,17,90],['I < 0',NEG,26,150]]);return;
      case 'Q53_14':case 'Q53_17':{const hot=s.id==='Q53_17'&&k>.3;
        scene(g,{...SC,m:15,hand:false,G:false,alpha:.55,def:false});scene(g,{...SC,m:-15,G:false,def:false,hand:false});
        sci(g,'z = +10',64,52,hot?POS:C.white,15,'right');sci(g,'z = −10',64,176,hot?NEG:C.white,15,'right');
        if(!hot){label(g,T('上面？','Above?'),64,30,VC,15,'right');label(g,T('下面？','Below?'),64,200,VC,15,'right');}
        else{label(g,'4.30',172,48,POS,17);label(g,'3.40',172,176,NEG,17);}
        table(g,232,64,hot?{hi:[1,1],c1:NEG,c2:POS,l1:'z < 0',l2:'z > 0'}:{});
        rows(g,hot?[[T('大的一列：上方、離開','Bigger row: above, leaving'),POS,16,168],[T('4.30 那一列 → z > 0','4.30 row → z > 0'),POS,17,196]]:[[T('大的那一列在哪一邊？','Which side has the bigger row?'),VC,16,168]],232);return;}
      case 'Q53_15':{const u=seg(k,0,.9),m=-30+60*u*u,v=120*u;scene(g,{...SC,m,G:false,v:v*.45});
        const vin=1,vout=TB.above[1]/TB.below[1],W=170/vout; // 同一個 |z|，I ∝ v，所以速率比＝兩列電流比（約 1.3 倍）
        rows(g,[[T('一路加速','Speeding up all the way'),VC,17,40]],232);
        label(g,T('進來（z = −10）','In (z = −10)'),232,86,C.white,15);box(g,232,94,vin*W,16,4,VC+'66',VC);
        label(g,T('出去（z = +10）','Out (z = +10)'),232,140,C.white,15);box(g,232,148,vout*W*seg(k,.3,.7),16,4,VC+'aa',VC);
        if(k>.7)rows(g,[[T('出去比進來快','Faster on the way out'),VC,17,200],[T('（表 10：2.70 ÷ 2.10 ≈ ','(Table 10: 2.70 ÷ 2.10 ≈ ')+vout.toFixed(2)+T(' 倍）',' ×)'),C.faint,15,226]],232);return;}
      case 'Q53_16':scene(g,{...SC,m:15,hand:false,G:false,alpha:.55,def:false,v:34});scene(g,{...SC,m:-15,G:false,def:false,hand:false,v:24});
        rows(g,[[T('同一個距離','Same distance'),C.white,16,50],[T('速度越快','faster'),VC,17,82],['→ ΔΦ/Δt '+T('越大','bigger'),C.white,17,116],['→ |I| '+T('越大','bigger'),POS,19,152]],232);return;
      case 'Q53_18':case 'Q53_19':case 'Q53_20':{const b={x0:240,y0:125,sx:8,sy:21},{X,Y}=graph(g,b);
        const n=s.id==='Q53_18'?Math.floor(seg(k,.05,.95)*8.999):8;
        if(s.id==='Q53_20'){g.fillStyle=POS+'12';g.fillRect(X(0),Y(5),X(25)-X(0),Y(0)-Y(5));g.fillStyle=NEG+'12';g.fillRect(X(-25),Y(0),X(0)-X(-25),Y(-5)-Y(0));
          label(g,T('第 1 象限','Quadrant 1'),X(25),Y(4.6),POS,16,'right');label(g,T('第 3 象限','Quadrant 3'),X(-25)+4,Y(-4.4),NEG,16);
          if(k>.4)for(const z of [5,10,15,20]){const I=-meas(-z);g.beginPath();g.arc(X(z),Y(I),6,0,2*Math.PI);g.setLineDash([3,3]);g.strokeStyle=NEG;g.lineWidth=1.5;g.stroke();g.setLineDash([]);}
          if(k>.4)label(g,T('虛圈：下列翻上來比，上方較高','Dashed: lower row flipped up — above is higher'),X(25),Y(-4.6),C.white,15,'right');}
        ORDER.slice(0,n).forEach(z=>{const I=meas(z);pt(g,X(z),Y(I),I>0?POS:NEG,s.id==='Q53_19'&&I>0?6:5);});
        if(s.id==='Q53_18'&&n>0){const z=ORDER[n-1],I=meas(z);label(g,T('第 ','Point ')+n+T(' 點',''),44,34,C.white,15);sci(g,'('+String(z).replace('-','−')+', '+I.toFixed(2).replace('-','−')+')',44,58,I>0?POS:NEG,17);}
        if(s.id==='Q53_19'){label(g,T('離開：Φ 減少 → I > 0','Leaving: Φ falls → I > 0'),X(25)+12,Y(4.6),POS,16,'right');label(g,T('靠近：I < 0','Approaching: I < 0'),X(-25)+4,Y(-4.4),NEG,16);}
        return;}
      case 'Q53_21':{const L={cx:100,cy:120,sc:4},R={cx:330,cy:120,sc:4};
        scene(g,{...L,m:-14,G:false,def:false,v:24,force:1,forceText:T('排斥','repel')});scene(g,{...R,m:14,G:false,def:false,hand:false,v:30,force:1,forceText:T('吸引','attract')});
        label(g,T('來 → 拒','Coming → pushed'),146,70,FC,18);label(g,T('去 → 留','Going → held'),330,178,FC,18,'center');
        label(g,T('力都和運動方向相反','The force opposes the motion'),230,24,VC,16,'center');return;}
      case 'Q53_22':scene(g,{...SC,m:-12,induced:true,I:-2.8,poles:true,force:1,v:26});
        rows(g,[[T('天下沒有白吃的午餐','No free lunch'),VC,18,60],[T('要電流','To get a current'),C.white,16,104],[T('就得出力氣推','you must push'),C.white,16,130],[T('手做功 → 電能','Work by hand → electricity'),POS,16,176]]);return;
      default:chip(g,24,60,412,T('來拒去留：講的是力（線圈對磁鐵）','Oppose the approach, resist the leaving: forces'),FC,true,16);
        chip(g,24,120,412,T('電流方向：看磁通量怎麼變','Current direction: watch how the flux changes'),POS,k>.35,16);
        if(k>.6)label(g,T('Φ 增加 → I < 0　Φ 減少 → I > 0','Φ rises → I < 0 · Φ falls → I > 0'),230,210,C.white,17,'center');
    }
  }
  // 能動手：拖磁鐵往上（或拉桿、或按「從靜止加速上提」），經過 |z| = 5、10、15、20 就把表 10 的值描到 I–z 圖上
  const HS={cx:74,cy:112,sc:3.4},HB={x0:316,y0:118,sx:5.4,sy:20};
  function hands(g,s){
    const z=zOf(s.m),I=z==null?null:interp(z);
    scene(g,{...HS,m:s.m,I:I||0,v:s.anim?Math.min(40,s.v*2.6):0,Ilabel:false});
    label(g,'z = '+(z==null?T('（線圈內）','(inside)'):z.toFixed(1).replace('-','−')+' cm'),8,244,VC,15);
    const {X,Y}=graph(g,HB,{zt:[-20,-10,10,20],it:[-4,-2,2,4]});
    for(const zz of ORDER){const I0=meas(zz);if(s.got.has(zz))pt(g,X(zz),Y(I0),I0>0?POS:NEG);}
    if(z!=null){line(g,X(clamp(z,-25,25)),Y(5),X(clamp(z,-25,25)),Y(-5),VC+'88',1.2,[3,3]);if(I!=null&&Math.abs(z)<=25){g.beginPath();g.arc(X(z),Y(I),7,0,2*Math.PI);g.strokeStyle=VC;g.lineWidth=2;g.stroke();}}
    label(g,T('已描 ','Plotted ')+s.got.size+' / 8',452,244,s.got.size>=8?C.green:C.white,15,'right');
  }
  ExamScene.add(53,{
    state:()=>({row:'',id:'',part:0,t:0,hands:false,m:-30,got:new Set(),anim:false,v:0,warn:false}),
    paint,
    preview(g){
      // 圖 22：手提細繩、N 極朝上的磁鐵在線圈正下方；線圈正面的箭號＝正方向，電流由下往上流經檢流計為正
      scene(g,{cx:190,cy:100,hh:46,R:34,len:56,my:196,glow:false});
      label(g,T('線圈','Coil'),146,104,C.white,16,'right');label(g,T('檢流計','Galvanometer'),282,104,C.white,16);label(g,T('磁鐵','Magnet'),206,206,C.white,16);
      label(g,T('圖 22','Figure 22'),190,246,C.faint,15,'center');
      const ax=70;arrow(g,ax,226,ax,26,C.faint,1.5,8);line(g,ax-5,100,ax+5,100,C.white,2);label(g,'0',ax-8,105,C.white,15,'right');sci(g,'z',ax+8,32,C.white,17);
      label(g,T('z 向上為正','z up is +'),316,170,C.faint,15);label(g,T('原點：線圈中點','Origin: coil centre'),316,194,C.faint,15);label(g,T('箭號方向的電流為正','Arrow direction: I > 0'),316,218,C.faint,15);
    },
    lesson(s,p,part,t){s.row=p.row;s.id=p.id;s.part=part;s.t=t;},
    interactive({s,canvas,range,btn,complete,render}){
      s.hands=true;canvas.style.touchAction='none'; /* 手指往上拖磁鐵時不讓頁面捲走 */ let raf=0,prev=s.m;
      const tone=(f,d=.1,gain=.08,type='sine',delay=0)=>{if(LabSettings.get('sound'))LabSound.tone({freq:f,dur:d,type,gain,delay});};
      function setM(m){m=clamp(m,-30,30);
        if(m>prev){for(const zz of ORDER){const th=zz<0?zz-5:zz+5;if(prev<th&&m>=th&&!s.got.has(zz)){s.got.add(zz);tone(300+110*Math.abs(meas(zz)),.12,.1,'triangle');
          if(s.got.size===8){tone(880,.2,.12,'triangle',.12);complete();}}}s.warn=false;}
        else if(m<prev-.5)s.warn=true;
        prev=m;s.m=m;r.input.value=Math.round(m);r.val.textContent=(m>0?'+':'')+m.toFixed(0).replace('-','−')+' cm';}
      const r=range(T('磁鐵中心的位置（cm）','Magnet centre position (cm)'),-30,30,-30,v=>{stop();setM(v);});r.val.textContent='−30 cm';
      function stop(){s.anim=false;cancelAnimationFrame(raf);}
      btn(T('清除重來','Clear and restart'),()=>{stop();s.got.clear();prev=-30;s.m=-30;s.v=0;setM(-30);});
      btn(T('▶ 從靜止加速上提','▶ Lift from rest, speeding up'),()=>{stop();s.got.clear();prev=-30;setM(-30);s.anim=true;const t0=performance.now(),acc=7.5;
        const tick=now=>{const t=(now-t0)/1000;s.v=acc*t;setM(-30+acc*t*t/2);render();if(s.m<30&&s.anim)raf=requestAnimationFrame(tick);else s.anim=false;};raf=requestAnimationFrame(tick);});
      addEventListener('pagehide',stop);
      return {hit:(x,y)=>{const my=HS.cy-s.m*HS.sc;return Math.abs(x-HS.cx)<30&&Math.abs(y-my)<34?0:null;},move:(i,x,y)=>{stop();setM((HS.cy-y)/HS.sc);render();}};
    },
    read(s,output){
      const z=zOf(s.m),I=z==null?null:interp(z);
      let txt=z==null?T('磁鐵有一部分在線圈內（表 10 沒有列這一段）','Part of the magnet is inside the coil (Table 10 skips this)'):
        'z = '+z.toFixed(1).replace('-','−')+' cm　I ≈ <b>'+I.toFixed(2).replace('-','−')+' mA</b>（'+(I>0?T('正：磁鐵離開，Φ 減少','positive: leaving, Φ falls'):T('負：磁鐵靠近，Φ 增加','negative: approaching, Φ rises'))+'）';
      txt+='<br>'+T('已描 ','Plotted ')+s.got.size+T(' / 8 點（表 10 實測值）',' / 8 points (Table 10)');
      if(s.warn)txt+=T('　要往上提，磁鐵往下不算。','　Lift upward; moving down does not count.');
      if(s.got.size>=8)txt+=T('　8 點都在第 1、3 象限；同一個 |z|，上方（離開、比較快）的點比較高 ✓','　All 8 points lie in quadrants 1 and 3; at the same |z| the point above (leaving, faster) is higher ✓');
      output.innerHTML=txt;
    }
  });
})();
/* script:start（build_tracks115.py 由 scripts115.py 產生，勿手改） */
Exam115.add(53,{groups:{askA:["(a) z < 0 時電流的正負", "(a) Sign of the current for z < 0"],wrongA:["箭頭只是定義正方向", "The arrow only defines positive"],solveA:["磁通量增加", "The flux increases"],solveB:["加速，出去比較快", "Speeding up, faster on the way out"],solveC:["8 個點畫在哪", "Where the 8 points go"],trick:["口訣", "The rule"]},board:{askA:String.raw`z<0:\ I\ ?`,wrongA:[String.raw`\text{箭頭}=\text{正方向的定義}`,String.raw`\text{arrow}=\text{definition of positive}`],solveA:String.raw`\Phi\uparrow\ \Rightarrow\ B_{\text{ind}}\downarrow\ \Rightarrow\ I<0`,solveB:String.raw`v_{\text{out}}>v_{\text{in}}\ \Rightarrow\ |I|_{z>0}>|I|_{z<0}`,solveC:[String.raw`z<0:\ I<0\ \text{（第三象限）}\quad z>0:\ I>0\ \text{（第一象限）}`,String.raw`z<0:\ I<0\ \text{(3rd quadrant)}\quad z>0:\ I>0\ \text{(1st quadrant)}`],trick:[String.raw`\text{來拒去留（講力）},\ \text{電流看}\ \Delta\Phi`,String.raw`\text{oppose the approach, resist the leaving};\ \text{current: watch}\ \Delta\Phi`]}});
/* script:end */
/* tracks:start（build_tracks115.py 產生，勿手改） */
ExamTracks.Q53=[
 {
  "id": "Q53_07",
  "row": "askA",
  "duration": 5.7,
  "disp": "第一小題：磁鐵還在線圈下面，正在靠近，電流是正還是負？",
  "en": "Part 1: the magnet is still below the coil, approaching. Is the current positive or negative?"
 },
 {
  "id": "Q53_08",
  "row": "wrongA",
  "duration": 3.5,
  "disp": "直覺：照圖上的箭頭，I 大於 0 嘛。",
  "en": "Instinct: follow the arrow in the figure, so I is greater than 0."
 },
 {
  "id": "Q53_09",
  "row": "wrongA",
  "duration": 6.9,
  "disp": "可是圖上的箭頭，只是定義哪個方向叫正，不是告訴你電流真的往那邊流。",
  "en": "But the arrow only defines which direction is called positive. It doesn't say the current really flows that way."
 },
 {
  "id": "Q53_10",
  "row": "wrongA",
  "duration": 4.9,
  "disp": "就像路標寫往臺北，不代表你的車就一定往臺北開。",
  "en": "Just as a sign pointing to Taipei doesn't mean your car is heading to Taipei."
 },
 {
  "id": "Q53_11",
  "row": "solveA",
  "duration": 3.3,
  "disp": "冷次定律：線圈討厭磁通量變化。",
  "en": "Lenz's law: a coil hates changes in magnetic flux."
 },
 {
  "id": "Q53_12",
  "row": "solveA",
  "duration": 12.3,
  "disp": "N 極往上靠近，穿過線圈向上的磁力線越來越多，線圈就要產生向下的磁場來抵抗，線圈下方變成 N 極，跟磁鐵互相排斥，不讓它進來。",
  "en": "As the N pole rises, more upward field lines pass through the coil, so the coil makes a downward field to resist. Its bottom becomes an N pole, repelling the magnet and keeping it out."
 },
 {
  "id": "Q53_13",
  "row": "solveA",
  "duration": 6.5,
  "disp": "要產生向下的磁場，電流方向剛好跟圖中的箭頭相反，所以 I 小於 0。",
  "en": "Making a downward field takes a current opposite to the arrow in the figure, so I is less than 0."
 },
 {
  "id": "Q53_14",
  "row": "solveB",
  "duration": 5.3,
  "disp": "第二小題：電流大的那一列，是在線圈上面，還是下面？",
  "en": "Part 2: is the row with larger current above the coil or below it?"
 },
 {
  "id": "Q53_15",
  "row": "solveB",
  "duration": 5.9,
  "disp": "因為磁鐵一路在加速，所以離開線圈的時候，比進來的時候快。",
  "en": "The magnet keeps accelerating, so it leaves the coil faster than it enters."
 },
 {
  "id": "Q53_16",
  "row": "solveB",
  "duration": 5.5,
  "disp": "同一個距離，速度越快，磁通量變化越快，感應電流越大。",
  "en": "At the same distance, higher speed means faster flux change and more induced current."
 },
 {
  "id": "Q53_17",
  "row": "solveB",
  "duration": 6.9,
  "disp": "所以大的那一列，4.30 那一列，是 z 大於 0，磁鐵在上面、正在離開。",
  "en": "So the larger row, the 4.30 row, is z greater than 0: the magnet is above, leaving."
 },
 {
  "id": "Q53_18",
  "row": "solveC",
  "duration": 2.9,
  "disp": "第三小題：把 8 個點畫上去。",
  "en": "Part 3: plot the 8 points."
 },
 {
  "id": "Q53_19",
  "row": "solveC",
  "duration": 6.9,
  "disp": "離開的時候，磁通量變少，線圈要補向上的磁場，電流反過來，I 大於 0。",
  "en": "On the way out, the flux shrinks, so the coil adds an upward field. The current reverses: I greater than 0."
 },
 {
  "id": "Q53_20",
  "row": "solveC",
  "duration": 11.3,
  "disp": "所以 z 小於 0 的 4 個點是負的，z 大於 0 的 4 個點是正的，分布在第 1、第 3 象限；而且同一個距離，第 1 象限的點比較高。",
  "en": "So the 4 points with z less than 0 are negative and the 4 with z greater than 0 are positive, in quadrants 3 and 1; at the same distance, the quadrant 1 points are higher."
 },
 {
  "id": "Q53_21",
  "row": "trick",
  "duration": 5.3,
  "disp": "冷次定律的口訣：來拒去留，靠近就排斥，離開就吸引。",
  "en": "The Lenz's law motto: resist the coming, hold the going. Repel what approaches, attract what leaves."
 },
 {
  "id": "Q53_22",
  "row": "trick",
  "duration": 7.9,
  "disp": "我上課常講，冷次定律就是天下沒有白吃的午餐，你要它產生電流，就得出力氣去推。",
  "en": "As I often say in class, Lenz's law means there's no free lunch: if you want current, you must push for it."
 },
 {
  "id": "Q53_23",
  "row": "trick",
  "duration": 8.1,
  "disp": "注意喔，來拒去留講的是線圈對磁鐵的力；要判斷電流方向，還是要回到磁通量怎麼變。",
  "en": "Careful: that motto describes the coil's force on the magnet; to find the current's direction, go back to how the flux changes."
 }
];
/* tracks:end */
