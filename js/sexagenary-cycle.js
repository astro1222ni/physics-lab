(function () {
  'use strict';
  const K=window.SexagenaryCore, D=window.LabDraw, T=(zh,en)=>LabSettings.t(zh,en);
  const $=id=>document.getElementById(id), slug='sexagenary-cycle', english=LabSettings.lang==='en';
  const canvas=$('wheelCanvas'), g=canvas.getContext('2d'), scene=$('scene');
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lo=K.serial(K.first), hi=K.serial(K.last);
  let year=K.initial, position=K.serial(year)-1984, view='flat', model=null, generation=0;
  let motion=0, timer=0, drag=null, anchor=null, checked=null;
  let layout, paintKey='', faces=[], geometry=[K.gearOutline(10),K.gearOutline(12)];
  const learned={moved:false,invalid:false,pinned:false,compared:false,model:false};
  const yearName=y=>y<0?T('西元前 '+(-y)+' 年',(-y)+' BC'):T('西元 '+y+' 年','AD '+y);
  const rocName=n=>n<0?T('民國前 '+(-n)+' 年',(-n)+(n===-1?' year':' years')+' before ROC 1'):
    n===1?T('民國元年','ROC 1'):T('民國 '+n+' 年','ROC '+n);
  const pairName=d=>T(d.name,d.en);
  const yearsText=n=>T(n+' 年',n+(n===1?' year':' years'));
  const eventType='calendar';
  function option(select,value,label){select.add(new Option(label,String(value)));}
  for(const n of [1,10,12,60])option($('stride'),n,yearsText(n));
  K.stems.forEach((s,i)=>option($('stemPick'),i,(i+1)+' · '+T(s,K.stemEn[i])));
  K.branches.forEach((b,i)=>option($('branchPick'),i,(i+1)+' · '+T(b,K.branchEn[i])));
  const entries=[...K.events.map(r=>[r.year,T(...r.title)]),
    [1912,T('民國元年','First year of the ROC')],[1984,T('甲子基準年','Jia-Zi reference year')],[-1,T('西元前最後一年','Last year BC')]];
  option($('eventSelect'),'',T('選擇紀錄…','Choose a record…'));
  entries.forEach(([y,title])=>option($('eventSelect'),y,(y<0?yearName(y):y)+' · '+title));
  $('branchPick').value='1';
  function sourceLink(a,key) {
    const [zh,en,url,enUrl]=K.sources[key];a.textContent=T(zh,en);a.href=english&&enUrl?enUrl:url;
  }
  for(const key of Object.keys(K.sources)){
    const li=document.createElement('li'),a=document.createElement('a');a.target='_blank';a.rel='noopener noreferrer';sourceLink(a,key);li.append(a);$('sources').append(li);
  }
  K.branches.forEach((b,i)=>{
    const li=document.createElement('li');li.textContent=T(b+' · '+K.animals[i],K.branchEn[i]+' · '+K.animalEn[i]);$('zodiacList').append(li);
  });
  function updateEntry(){
    const d=K.describe(year), roc=['roc','before'].includes($('era').value);
    $('era').value=roc?(d.roc<0?'before':'roc'):(year<0?'bc':'ad');
    $('yearInput').value=String(Math.abs(roc?d.roc:year));
  }
  function showYear(displayed){
    const d=K.describe(displayed);
    $('dialIndex').textContent=T('第 '+(d.k+1)+' / 60 格','Position '+(d.k+1)+' / 60');
    $('civilOut').textContent=displayed<0?T('前 '+(-displayed)+' 年',(-displayed)+' BC'):T(displayed+' 年','AD '+displayed);
    $('rocOut').textContent=rocName(d.roc);
    $('pairOut').textContent=pairName(d);$('animalOut').textContent=T(d.animal,d.animalEn);
    $('eventSelect').value=entries.some(e=>e[0]===displayed)?String(displayed):'';
    const ref=displayed===1984?'anchor':displayed===1912?'republic':displayed===-1?'bc':null;
    $('record').hidden=!d.record&&!ref;
    if(d.record||ref){
      $('recordTitle').textContent=d.record?T(...d.record.title):entries.find(e=>e[0]===displayed)[1];
      $('recordEra').textContent=(d.record?T(...d.record.era)+' · ':'')+pairName(d)+' · '+rocName(d.roc);
      sourceLink($('recordSource'),d.record?d.record.source:ref);
    }
  }
  function readings(){
    showYear(K.civil(Math.round(position)+1984));
    $('prev').disabled=year===K.first;$('next').disabled=year===K.last;
    $('pinned').textContent=anchor==null?T('尚未記錄','No year pinned'):yearName(anchor)+' · '+pairName(K.describe(anchor));
    $('checkGap').disabled=anchor==null;$('clear').disabled=anchor==null;
    if(checked?.possible){
      const next=K.nextOccurrence(year,checked.matches[0]);$('seek').disabled=next>K.last;
      $('seek').title=next>K.last?T('下次出現超出時間軸。','The next match is beyond the timeline.'):yearName(next);
    }
    $('play').textContent=timer?T('暫停','Pause'):T('逐年播放','Play years');$('play').setAttribute('aria-pressed',String(!!timer));
    $('soundBtn').textContent=LabSound.enabled()?T('音效開','Sound on'):T('音效關','Sound off');
    $('soundBtn').setAttribute('aria-pressed',String(LabSound.enabled()));
    $('gesture').textContent=view==='flat'?T('沿輪緣轉動，或左右拖時間軸。方向鍵可逐年微調。','Turn either rim or drag the timeline. Arrow keys step one year at a time.'):
      T('十齒主輪以連桿帶動小齒輪，再推動六十格轉盤。拖曳可旋轉或平移，雙指可縮放。','The ten-tooth wheel drives a pinion through the connecting rod. The pinion turns the sixty-position dial. Drag to orbit or pan, and pinch to zoom.');
  }
  function layoutFor(w,h){
    const compact=matchMedia('(orientation:landscape) and (max-height:600px)').matches;
    const rulerH=compact?32:clamp(h*.21,43,78), bodyH=h-rulerH;
    const top=compact?5:26, bottom=compact?8:9;
    const unit=Math.min((w-18)/24,(bodyH-top-bottom)/14);
    return {w,h,unit,cy:top+(bodyH-top-bottom)/2,left:w/2-6*unit,right:w/2+5*unit,
      compact,bodyH,rulerH,tick:clamp(w/9,32,75)};
  }
  function outline(ctx,pts,scale){
    ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x*scale,-y*scale):ctx.moveTo(x*scale,-y*scale));ctx.closePath();
  }
  function circle(ctx,r,fill,stroke,width=1){
    ctx.beginPath();ctx.arc(0,0,r,0,K.TAU);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
  }
  function makeFace(n,unit,dpr){
    const pitch=n/2, side=2*(pitch+1.12)*unit+4, off=document.createElement('canvas');
    off.width=off.height=Math.ceil(side*dpr);const c=off.getContext('2d');c.scale(dpr,dpr);c.translate(side/2,side/2);
    const a=n===10, r=pitch*unit, pts=geometry[a?0:1];
    const color=c.createLinearGradient(-r,-r,r,r);
    color.addColorStop(0,a?'#efd0a0':'#b78055');color.addColorStop(.55,a?'#d7a872':'#a57049');color.addColorStop(1,a?'#bb8751':'#805438');
    outline(c,pts,unit);c.fillStyle=color;c.fill();c.save();c.clip();
    c.save();c.beginPath();c.arc(0,0,(pitch-1.24)*unit,0,K.TAU);c.clip();
    for(let i=-74;i<75;i++){
      const y=i*r/60;c.beginPath();c.strokeStyle=i%3?'rgba(95,49,24,.18)':'rgba(255,236,190,.38)';c.lineWidth=i%7?.55:1.1;
      for(let x=-1.25*r;x<=1.3*r;x+=5){const yy=y+1.4*Math.sin(x/14+i*.12)+1.9*Math.sin(x/36+i*.2);if(x===-1.25*r)c.moveTo(x,yy);else c.lineTo(x,yy);}
      c.stroke();
    }
    c.restore();
    // Each tooth is a fitted wood blank with grain along its load-bearing length.
    for(let i=0;i<n;i++){
      c.save();c.rotate(-i*K.TAU/n);
      for(let j=-8;j<=8;j++){
        const start=(pitch-1.28)*unit, end=(pitch+1.08)*unit, y=j*.115*unit;
        c.beginPath();c.moveTo(start,y*.75);
        c.bezierCurveTo(start+.67*unit,y+.035*unit,end-.65*unit,y-.055*unit,end,y*.92);
        c.strokeStyle=j%3?'rgba(85,42,20,.26)':'rgba(255,232,179,.58)';
        c.lineWidth=Math.max(.48,unit*(j%3?.025:.044));c.stroke();
      }
      c.restore();
    }
    outline(c,pts,unit);c.strokeStyle=a?'#81542f':'#583922';c.lineWidth=Math.max(1.1,unit*.09);c.stroke();
    outline(c,pts,unit*.988);c.strokeStyle='rgba(255,230,179,.64)';c.lineWidth=Math.max(.55,unit*.04);c.stroke();
    c.restore();
    const face=(pitch-1.30)*unit;
    circle(c,face,null,'#684522',Math.min(2,unit*.08));
    circle(c,face*.79,null,a?'#f0d3a2':'#284d44',face*.35);
    circle(c,face*.96,null,'#e4bd79',1.4);circle(c,face*.61,null,'#e4bd79',1.3);
    const f=Math.max(layout.w<620?13:14,Math.min(25,unit*(english?.74:.88)));
    const labels=n===10?[K.stems,K.stemEn]:[K.branches,K.branchEn];
    for(let i=0;i<n;i++){
      const angle=K.labelAngle(n,i);c.save();c.rotate(Math.PI/2-angle);
      c.textAlign='center';c.textBaseline='middle';c.fillStyle=a?'#362815':'#fff0c9';
      c.font='bold '+f+'px Georgia, "Microsoft JhengHei", serif';c.fillText(T(labels[0][i],labels[1][i]),0,-face*.79);
      c.restore();
    }
    // Two inlaid circles and an off-centre rivet make rotation visible even from the hub.
    circle(c,face*.46,null,'rgba(74,45,24,.65)',1.1);
    circle(c,face*.30,'#37463a','#f0ce8d',1.4);
    const m=c.createRadialGradient(-face*.08,-face*.09,.1,0,0,face*.21);
    m.addColorStop(0,'#fff1b5');m.addColorStop(.53,'#ca9a54');m.addColorStop(1,'#885d31');
    circle(c,face*.21,m,'#6b4b29');c.fillStyle='#725337';c.fillRect(-face*.095,-1,face*.19,2);
    return {off,side};
  }
  // Project only the visible edge faces, below both top surfaces. At the mesh
  // each wheel thus occludes its own sidewall without painting over its mate.
  function sidewalls(points,cx,cy,angle,unit,which){
    const dropX=unit*.085, dropY=unit*.28, co=Math.cos(angle), si=Math.sin(angle);
    const screen=points.map(([x,y])=>[cx+(x*co-y*si)*unit,cy-(x*si+y*co)*unit]);
    const paths=Array.from({length:5},()=>new Path2D());
    for(let i=0;i<screen.length;i++){
      const a=screen[i],b=screen[(i+1)%screen.length],dx=b[0]-a[0],dy=b[1]-a[1];
      if(-dy*dropX+dx*dropY<=0)continue;
      const lighting=(dy*.88-dx*.36)/Math.hypot(dx,dy);
      const bin=Math.round(clamp((lighting+1)*2,0,4)),p=paths[bin];
      p.moveTo(a[0],a[1]);p.lineTo(b[0],b[1]);p.lineTo(b[0]+dropX,b[1]+dropY);
      p.lineTo(a[0]+dropX,a[1]+dropY);p.closePath();
    }
    const colors=which?['#45301f','#573b26','#6b492e','#825939','#9c6b45']:
      ['#67482d','#7b5634','#936942','#ad8154','#c29a66'];
    paths.forEach((p,i)=>{g.fillStyle=colors[i];g.fill(p);});
  }
  function paint(){
    if(view!=='flat'){model?.update(position);return;}
    const w=scene.clientWidth,h=scene.clientHeight;if(!w||!h)return;
    const dpr=Math.min(2,devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    g.setTransform(dpr,0,0,dpr,0,0);layout=layoutFor(w,h);
    const {unit,cy,left,right,bodyH,tick}=layout;
    const key=[w,h,dpr,D.ver,LabSettings.get('fs'),!!LabSettings.toHans].join('/');
    if(key!==paintKey){faces=[makeFace(10,unit,dpr),makeFace(12,unit,dpr)];paintKey=key;}
    const dark=D.dark, ink=dark?'#e4dbbd':'#594b35', line=dark?'#837758':'#ab9672';
    const bg=g.createLinearGradient(0,0,w,h);bg.addColorStop(0,dark?'#253d35':'#e6dec6');bg.addColorStop(.6,dark?'#1c302b':'#f5edda');bg.addColorStop(1,dark?'#152721':'#e1d4b8');
    g.fillStyle=bg;g.fillRect(0,0,w,h);
    g.strokeStyle=dark?'rgba(219,197,142,.08)':'rgba(106,89,53,.11)';g.lineWidth=1;
    const space=Math.max(15,unit*1.7);
    for(let x=w/2%space;x<w;x+=space){g.beginPath();g.moveTo(x,3);g.lineTo(x,bodyH-3);g.stroke();}
    for(let y=cy%space;y<bodyH;y+=space){g.beginPath();g.moveTo(4,y);g.lineTo(w-4,y);g.stroke();}
    g.strokeStyle=line;g.strokeRect(4.5,4.5,w-9,bodyH-6);g.lineWidth=1;
    for(const x of [10,w-10])for(const y of [11,bodyH-8]){g.save();g.translate(x,y);circle(g,2.4,line);g.strokeStyle=ink;g.beginPath();g.moveTo(-1,.7);g.lineTo(1,-.7);g.stroke();g.restore();}
    const angles=K.angles(position), rotations=[angles.stem,angles.branch], centers=[left,right];
    for(let i=0;i<2;i++){
      g.save();g.translate(centers[i]+unit*.09,cy+unit*.29);g.rotate(-rotations[i]);
      outline(g,geometry[i],unit);g.shadowColor='rgba(31,21,12,.36)';
      g.shadowBlur=unit*.25;g.shadowOffsetY=unit*.10;g.fillStyle='#563c2a';g.fill();g.restore();
    }
    for(let i=0;i<2;i++)sidewalls(geometry[i],centers[i],cy,rotations[i],unit,i);
    [10,12].forEach((n,i)=>{
      const x=centers[i],radius=(n/2+1)*unit;
      g.save();g.translate(x,cy);g.rotate(-rotations[i]);
      const f=faces[i];g.drawImage(f.off,-f.side/2,-f.side/2,f.side,f.side);g.restore();
      const labelX=layout.compact?x+(i?1:-1)*unit*4.6:x;
      const labelY=layout.compact?16:Math.max(13,cy-radius-9);
      g.font='bold 1em '+D.FONT;g.textAlign='center';g.textBaseline='middle';
      const label=i?T('地支 · 12','Branches · 12'):T('天干 · 10','Stems · 10');
      g.strokeStyle=dark?'#253a32':'#eee6d4';g.lineJoin='round';g.lineWidth=3;g.strokeText(label,labelX,labelY);
      g.fillStyle=ink;g.fillText(label,labelX,labelY);
      const py=cy-(n/2-1.1)*unit*.96;
      g.fillStyle=dark?'#ffd27e':'#923d26';g.strokeStyle=dark?'#624c30':'#fff1c8';g.lineWidth=1;
      g.beginPath();g.moveTo(x-5,py-9);g.lineTo(x+5,py-9);g.lineTo(x,py+2);g.closePath();g.fill();g.stroke();
    });
    const mid=w/2, base=bodyH+layout.rulerH*.34;
    g.fillStyle=dark?'#26362f':'#e9ddc4';g.fillRect(0,bodyH,w,h-bodyH);
    g.strokeStyle=line;g.lineWidth=1;g.beginPath();g.moveTo(0,base);g.lineTo(w,base);g.stroke();
    const current=position+1984, center=Math.round(current), span=Math.ceil(w/(2*tick))+1;
    for(let a=center-span;a<=center+span;a++){
      if(a<lo||a>hi)continue;const x=mid+(a-current)*tick, y=K.civil(a);
      const chosen=a===center;
      g.strokeStyle=chosen?(dark?'#ffd27e':'#994a25'):ink;g.lineWidth=chosen?3:1;
      g.beginPath();g.moveTo(x,base-(chosen?8:4));g.lineTo(x,base+5);g.stroke();
      if(chosen||Math.abs(a-center)%2===0){
        const txt=y<0?T('前'+(-y),(-y)+' BC'):String(y), f=w<620?13:14;
        g.font=(chosen?'bold ':'')+f+'px '+D.FONT;g.fillStyle=ink;g.textAlign='center';g.textBaseline='middle';
        if(x>g.measureText(txt).width/2+2&&x<w-g.measureText(txt).width/2-2)g.fillText(txt,x,base+Math.min(21,layout.rulerH*.36));
      }
    }
    g.fillStyle=dark?'#ffd27e':'#994a25';g.beginPath();g.moveTo(mid-5,bodyH+1);g.lineTo(mid+5,bodyH+1);g.lineTo(mid,bodyH+8);g.closePath();g.fill();
  }
  function stopPlay(){if(timer){clearInterval(timer);timer=0;readings();}}
  function soundStep(k,delay=0){
    if(!LabSound.enabled())return;
    LabSound.tone({freq:760,type:'triangle',gain:.17,dur:.044,attack:.002,delay});
    if(K.mod(k,60)===0){
      LabSound.tone({freq:523.25,gain:.25,dur:.64,attack:.004,delay});
      LabSound.tone({freq:1046.5,gain:.11,dur:.36,attack:.004,delay});
    }
  }
  function detents(from,to){
    if(!LabSound.enabled()||from===to)return;
    const dir=Math.sign(to-from),interval=Math.min(.018,.18/Math.abs(to-from));
    for(let i=from+dir;dir*(to-i)>=0;i+=dir)soundStep(i,(Math.abs(i-from)-1)*interval);
  }
  function animate(target,turn,dragging){
    cancelAnimationFrame(motion);motion=0;
    if(!turn||document.hidden||D.reducedMotion()||Math.abs(target-position)>60){
      if((turn||dragging)&&Math.abs(target-position)<=60)detents(Math.round(position),target);
      else if(target!==position&&K.mod(target,60)===0)soundStep(target);
      position=target;showYear(year);paint();return;
    }
    const start=position,t0=performance.now();
    const duration=Math.max(200,Math.abs(target-start)*85);
    let lastTooth=Math.round(start);
    function frame(now){
      const f=Math.min(1,(now-t0)/duration);
      position=start+(target-start)*f;
      const tooth=Math.round(position);
      if(tooth!==lastTooth){
        detents(lastTooth,tooth);
        lastTooth=tooth;showYear(K.civil(tooth+1984));
      }
      paint();
      if(f<1)motion=requestAnimationFrame(frame);else motion=0;
    }
    motion=requestAnimationFrame(frame);
  }
  function emit(act,extras={}){
    const d=K.describe(year);
    const data={act,year,k:d.k,s:d.s,b:d.b,record:!!d.record, ...extras};
    if(window.LabMission)LabMission.emit(eventType,data);
    LabStepGuide.update(stepList().findIndex(s=>!s.done),{key:slug,auto:true});
  }
  function move(y,act,extra={}){
    if(y==null||y<K.first||y>K.last||y===0)return;
    const prevYear=year, delta=K.distance(year,y);year=y;
    if(delta){learned.moved=true;$('comparison').textContent='';}
    if(delta&&act==='play'&&view==='model'&&model)learned.model=true;
    updateEntry();$('yearMessage').textContent='';readings();
    const target=K.serial(year)-1984;
    animate(target,delta!==0&&['step','play','seek'].includes(act),act==='drag');
    if(delta||['entry','event','seek'].includes(act))emit(act,{delta,prevYear,...extra});
  }
  function advance(n,act){move(K.civil(clamp(K.serial(year)+n,lo,hi)),act);}
  function errorYear(){
    $('yearMessage').textContent=T('請輸入正整數。可查西元前 3000 年到西元 3000 年，兩種紀年都沒有第 0 年。',
      'Enter a positive whole year between 3000 BC and AD 3000. Neither era has a year zero.');
  }
  $('yearInput').addEventListener('invalid',errorYear);
  $('yearForm').addEventListener('submit',e=>{
    e.preventDefault();stopPlay();const era=$('era').value,y=K.readYear(era,$('yearInput').valueAsNumber);
    if(y==null){errorYear();return;}move(y,'entry',{era});
  });
  $('era').addEventListener('change',()=>{$('yearMessage').textContent='';});
  $('eventSelect').addEventListener('change',()=>{if($('eventSelect').value){stopPlay();move(Number($('eventSelect').value),'event');}});
  $('prev').onclick=()=>{stopPlay();advance(-Number($('stride').value),'step');};
  $('next').onclick=()=>{stopPlay();advance(Number($('stride').value),'step');};
  $('play').onclick=()=>{
    if(timer){stopPlay();return;}if(year===K.last)return;
    function tick(){advance(1,'play');if(year===K.last)stopPlay();}
    timer=setInterval(tick,700);tick();readings();
  };
  $('soundBtn').onclick=()=>LabSettings.set('sound',!LabSound.enabled());
  function clearPair(){
    checked=null;$('strip').replaceChildren();$('seek').hidden=true;
    $('pairResult').textContent=T('選好兩輪的位置後，查驗整圈。','Select two positions, then check the full cycle.');
  }
  $('stemPick').onchange=clearPair;$('branchPick').onchange=clearPair;
  $('pairForm').onsubmit=e=>{
    e.preventDefault();stopPlay();const p=K.inspectPair(+$('stemPick').value,+$('branchPick').value);
    checked=p;const name=T(K.stems[p.s]+K.branches[p.b],K.stemEn[p.s]+'-'+K.branchEn[p.b]);
    const desc=p.possible?T(name+' 出現在第 '+(p.matches[0]+1)+' 格，六十格中只有這一格符合。',name+' occurs at position '+(p.matches[0]+1)+', exactly once in 60.'):
      T(name+' 在六十格中出現 0 次。兩輪序位一奇一偶，每走一年同時換奇偶，始終無法相遇。',name+' occurs 0 times in 60. The two positions have opposite parity. Both change parity together every year.');
    $('pairResult').textContent=desc+' '+T('每列 12 格。實心格標天干，框線標地支。','Each row has 12 positions. Fill marks the stem. Outlines mark the branch.');
    $('strip').replaceChildren();
    for(let k=0;k<60;k++){
      const cell=document.createElement('i');cell.textContent=String(k+1);
      if(k%10===p.s)cell.classList.add('gz-stem');
      if(k%12===p.b)cell.classList.add('gz-branch');
      if(p.matches.includes(k))cell.classList.add('gz-match');
      $('strip').append(cell);
    }
    $('seek').hidden=!p.possible;readings();if(!p.possible)learned.invalid=true;
    emit('pair',{pair:p});
  };
  $('seek').onclick=()=>{if(checked?.possible){stopPlay();move(K.nextOccurrence(year,checked.matches[0]),'seek');}};
  $('pin').onclick=()=>{
    stopPlay();anchor=K.civil(Math.round(position)+1984);learned.pinned=true;$('guess').value='';$('comparison').textContent='';readings();emit('pin');
  };
  $('compareForm').onsubmit=e=>{
    e.preventDefault();if(anchor==null)return;stopPlay();
    const displayed=K.civil(Math.round(position)+1984),guess=$('guess').valueAsNumber,c=K.compare(anchor,displayed,guess);
    const from=K.describe(anchor),to=K.describe(displayed);
    const matched=c.samePair?T('干支相同','same stem and branch'):c.sameStem?T('同干、異支','same stem, different branches'):
      c.sameBranch?T('同支、同生肖，天干不同','same branch and animal, different stems'):T('天干、地支均不同','different stems and branches');
    $('comparison').textContent=(c.correct?T('預測正確。','Correct. '):T('再對照時間軸。','Check the timeline. '))+
      yearName(anchor)+' → '+yearName(displayed)+T('，相隔 '+c.gap+' 年。',' are '+yearsText(c.gap)+' apart. ')+
      pairName(from)+' / '+pairName(to)+' · '+matched+T('。','.');
    if(c.correct&&c.gap>0)learned.compared=true;emit('compare',{comparison:c});
  };
  $('clear').onclick=()=>{anchor=null;$('guess').value='';$('comparison').textContent='';readings();};
  function point(e){const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
  canvas.addEventListener('pointerdown',e=>{
    if(!layout||e.button!==0||drag)return;
    const {x,y}=point(e),{left,right,cy,unit,bodyH,tick}=layout;
    let which=null,cx=0,n=0;
    if(y>=bodyH)which='ruler';else {
      for(const [x0,teeth] of [[left,10],[right,12]]){
        const r=Math.hypot(x-x0,y-cy);if(r>(teeth/2)*unit*.2&&r<=(teeth/2+1)*unit){which='wheel';cx=x0;n=teeth;break;}
      }
    }
    if(!which)return;e.preventDefault();stopPlay();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    drag={id:e.pointerId,which,cx,n,x,tick,cy,origin:K.serial(year),angle:Math.atan2(cy-y,x-cx),sweep:0};
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    const {x,y}=point(e);let steps;
    if(drag.which==='ruler')steps=Math.round((drag.x-x)/drag.tick);
    else {
      const a=Math.atan2(drag.cy-y,x-drag.cx),d=a-drag.angle;drag.sweep+=Math.atan2(Math.sin(d),Math.cos(d));drag.angle=a;
      steps=Math.round(drag.sweep*drag.n/K.TAU*(drag.n===10?1:-1));
    }
    const yNew=K.civil(clamp(drag.origin+steps,lo,hi));if(yNew!==year)move(yNew,'drag');
  });
  function endDrag(e){if(drag?.id===e.pointerId){drag=null;canvas.classList.remove('dragging');}}
  ['pointerup','pointercancel','lostpointercapture'].forEach(type=>canvas.addEventListener(type,endDrag));
  canvas.onkeydown=e=>{
    if(!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key))return;
    e.preventDefault();stopPlay();advance(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1,'step');
  };
  async function showView(v){
    if(v===view)return;view=v;const token=++generation;stopPlay();
    model?.dispose();model=null;canvas.hidden=v!=='flat';$('modelHost').hidden=v==='flat';$('home3d').hidden=v==='flat';
    $('flatBtn').setAttribute('aria-pressed',String(v==='flat'));$('modelBtn').setAttribute('aria-pressed',String(v==='model'));
    $('modelMsg').hidden=true;readings();
    if(v==='flat'){paint();return;}
    $('modelMsg').hidden=false;$('modelMsg').textContent=T('正在裝上木輪…','Mounting the wheels…');
    try{
      const m=await Sexagenary3D.create($('modelHost'),{T,english,position:()=>position,active:()=>view==='model'&&token===generation});
      if(token!==generation){m?.dispose();return;}
      model=m;$('modelMsg').hidden=true;emit('model');
    }catch(err){if(token!==generation)return;
      $('modelMsg').textContent=T('此裝置無法開啟 WebGL。請切回 2D 齒輪繼續操作。','WebGL is unavailable on this device. Switch to the 2D dial to continue.');
      $('home3d').hidden=true;
    }
  }
  $('flatBtn').onclick=()=>showView('flat');$('modelBtn').onclick=()=>showView('model');$('home3d').onclick=()=>model?.fit();
  const steps=[
    ['moved','next',['按前進鍵或轉動齒輪，讀出另一年的三種紀年。','Advance or turn a wheel to read another year in three calendars.'],['年份已改變。','Change the year.']],
    ['invalid','pairForm',['到「驗配對」各選一個序位奇偶不同的干、支，查驗六十格。','In Pairing, choose a stem and branch of opposite parity, then check all 60.'],['查得一組出現零次的配對。','Find a pairing with zero matches.']],
    ['pinned','pin',['到「比年份」把目前年份記為起點。','In Compare, pin the current year as your starting point.'],['記下起點。','Pin a starting year.']],
    ['compared','guess',['轉到另一年，在「比年份」輸入年距，再驗算。','Move to another year. In Compare, enter and check the interval.'],['正確預測非零年距。','Predict a nonzero interval correctly.']],
    ['model','modelBtn',['開啟 3D 木輪，逐年播放，追蹤六十格轉盤。','Open the 3D model. Play the years and follow the sixty-position dial.'],['在立體紀年儀逐年播放。','Play the years on the 3D mechanism.']]
  ];
  function target(i){const id=steps[i][1];if(id==='modelBtn'&&view==='model'&&model)return $('play');
    return id==='pairForm'?$(id).querySelector('button'):$(id);}
  function stepList(){const cur=steps.findIndex(x=>!learned[x[0]]);return steps.map(([key,id,words,need],i)=>({
    html:T(...words),target:target(i),done:learned[key],current:i===cur,need:[[learned[key],...need]]
  }));}
  LabStepGuide.define(steps.map((s,i)=>({hint:s[3],target:()=>target(i),action:'tap'})),{key:slug});
  function guide(i){LabDeck.reveal(target(i));LabStepGuide.show(i,{key:slug});}
  function refresh(){paintKey='';readings();paint();model?.theme();}
  window.addEventListener('lab:themechange',refresh);
  window.addEventListener('lab:settingschange',refresh);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPlay();cancelAnimationFrame(motion);position=K.serial(year)-1984;}else{readings();paint();}});
  window.addEventListener('pagehide',()=>{stopPlay();});
  new ResizeObserver(paint).observe(scene);
  updateEntry();clearPair();readings();paint();
  LabStepGuide.update(0,{key:slug,auto:true});LabSide.mount({module:slug,steps:stepList,guide});
})();
