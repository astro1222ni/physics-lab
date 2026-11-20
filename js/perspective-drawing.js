(function () {
  'use strict';
  const C=window.PerspectiveDrawingCore, D=window.LabDraw, N=window.LabNum, T=window.LabSettings.t;
  const $=id=>document.getElementById(id), cv=$('cv'), ctx=cv.getContext('2d'), host=$('paper');
  const keys=Object.keys(C.defaults), names={
    base:['正面牆腳','front base'],eave:['正面屋簷','front eave'],left:['正面左牆角','front left upright'],
    right:['正面右牆角','front right upright'],sideBase:['側面牆腳','side base'],sideEave:['側面屋簷','side eave'],
    west:['左路緣','left curb'],east:['右路緣','right curb']};
  let params, r, main, geometryKey, edges=[], ref=null, log=[], tracing=false, picked=[], result=null;
  let drag=null, hover=null, placing=false, viewer=null, token=0, loading=false, eye=false, frame=0;
  const shortScreen=matchMedia('(orientation:landscape) and (max-height:600px)');
  const compactType=()=>shortScreen.matches&&window.LabSettings.get('fs')>1.05;
  const families=new Set(), pages=new Map();
  let activeKey='',lastPaper='',undo=null,progress=[false,false,false,false];
  const sheetKey=p=>keys.map(k=>p[k]).join('|');
  function currentPage(){
    if(!pages.has(activeKey))pages.set(activeKey,{params:{...params},marks:new Map()});
    return pages.get(activeKey);
  }
  const markCount=()=>Array.from(pages.values()).reduce((sum,page)=>sum+page.marks.size,0);
  function latestOther(){return [...pages.entries()].reverse().find(([key,page])=>key!==activeKey&&page.marks.size);}
  let cornerChosen=false,compareRecorded=false;
  let rigState={available:0,target:null,closed:false,dots:0};
  let palette, grain, back=null, paintVersion='', width=1,height=1, scale=1;
  const num=(v,n=2)=>Number.isFinite(v)?Number(v.toFixed(n)).toFixed(n):'—';
  const setPressed=(el,v)=>el.setAttribute('aria-pressed',String(v));
  const point=q=>[width/2+scale*q[0],height/2-scale*q[1]];
  const uv=(x,y)=>[(x-width/2)/scale,(height/2-y)/scale];
  function paletteForPaper() {
    const c=D.c, m=D.mix, css=getComputedStyle(document.documentElement), token=k=>css.getPropertyValue(k).trim();
    const tan=token('--pea-tan'), copper=token('--r-cu'), blue=token('--b-mapping');
    const paper=D.dark?m(c['canvas-bg'],c.accent,.055):m(c.surface,tan,.22);
    const ink=D.dark?m(c.text,tan,.27):m(c.text,c.equi,.17);
    const tint=(a,l,d)=>m(paper,a,D.dark?d:l);
    return {paper,ink, sky:tint(blue,.14,.10),hatch:m(ink,paper,.43),studio:tint(c.accent,.46,.32),
      ochre:tint(copper,.48,.39),stone:tint(tan,.40,.27),brick:tint(c.pos,.30,.28),
      trim:tint(tan,.10,.58),roof:tint(c.field,.63,.22),roofTop:tint(c.field,.42,.34),
      roofLine:m(ink,paper,.43),glass:D.dark?m(paper,blue,.17):m(c.field,blue,.16),door:tint(c.accent,.72,.23),
      glint:D.dark?tint(blue,.4,.40):tint(blue,.40,.45),wood:tint(copper,.84,.53),brass:tint(c.equi,.76,.75),
      awning:tint(c.accent,.72,.55),walk:tint(tan,.28,.11),road:tint(c.field,.24,.10),
      stripe:tint(tan,.11,.59),curb:tint(tan,.60,.47),paving:tint(c.muted,.47,.28),
      iron:D.dark?m(c.muted,c.field,.24):m(c.field,c.accent,.12),lampGlass:tint(c.equi,.43,.77),
      guide:[c.pos,c.probe,c.neg],trace:c.equi, hLine:c.accent };
  }
  function texture() {
    const tile=document.createElement('canvas'); tile.width=tile.height=128;
    const g=tile.getContext('2d'), image=g.createImageData(128,128);
    let seed=763;
    for(let i=0;i<image.data.length;i+=4){
      seed=(Math.imul(1664525,seed)+1013904223)>>>0;
      const white=(seed & 0x200000)?255:0;
      image.data[i]=image.data[i+1]=image.data[i+2]=white; image.data[i+3]=2+((seed>>>23)%13);
    }
    g.putImageData(image,0,0);
    g.strokeStyle=D.alpha(palette.ink,.055); g.lineWidth=.55;
    for(let i=0;i<32;i++){
      const x=(i*53)%128,y=(i*37)%128;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+4+(i%5),y-1);g.stroke();
    }
    return tile;
  }
  function path(g,pts,fill,stroke,lineWidth=1,dash=[]) {
    if(pts.length<2) return;
    g.beginPath();g.moveTo(...pts[0]);
    for(let i=1;i<pts.length;i++)g.lineTo(...pts[i]);
    if(fill){g.closePath();g.fillStyle=fill;g.fill();}
    if(stroke){g.strokeStyle=stroke;g.lineWidth=lineWidth;g.setLineDash(dash);g.stroke();g.setLineDash([]);}
  }
  function sheetLine(g,a,b,color,weight=1,dash=[],lo=0,hi=1) {
    const line=C.clipLine(a,b,r.sheet,lo,hi);
    if(line)path(g,line.map(point),null,color,weight,dash);
  }
  function localShape(g,s) {
    if(s.normal && C.dot(s.normal,C.sub(r.cam.eye,s.v[0]))<=0) return;
    if(!s.mat && s.v.length>2){
      for(let i=1;i<s.v.length;i++)localShape(g,{...s,v:[s.v[i-1],s.v[i]]});
      return;
    }
    const v=C.projectShape(s.v,r.cam,!!s.mat);
    if(v.length<2 || v.every(p=>p[0]<-r.sheet.u) || v.every(p=>p[0]>r.sheet.u) ||
      v.every(p=>p[1]<-r.sheet.v) || v.every(p=>p[1]>r.sheet.v)) return;
    let fill=s.mat && palette[s.mat];
    if(fill && s.normal && s.normal[0])fill=D.mix(fill,palette.ink,s.normal[0]>0?.075:.13);
    path(g,v.map(point),fill,s.outline && palette[s.outline],s.weight*(width<425?.83:1));
  }
  function composeStreet() {
    const bg=document.createElement('canvas'); bg.width=cv.width;bg.height=cv.height;
    const g=bg.getContext('2d'), ratio=cv.width/width;
    g.setTransform(ratio,0,0,ratio,0,0);g.lineCap='round';g.lineJoin='round';
    const sky=g.createLinearGradient(0,0,0,height);
    sky.addColorStop(0,palette.sky);sky.addColorStop(.52,palette.paper);sky.addColorStop(1,palette.walk);
    g.fillStyle=sky;g.fillRect(0,0,width,height);
    const [ground,...city]=C.streetscape;
    ground.shapes.forEach(s=>localShape(g,s));
    const buildings=[...city,main].sort((a,b)=>Math.hypot(b.center[0],b.center[2])-Math.hypot(a.center[0],a.center[2]));
    // 輕薄的接觸陰影貼在地面，與所有建築共用投影。
    for(const b of buildings.filter(b=>b.edges.length)){
      const {a,b:c}=b.edges[0];
      const dx=(c[0]-a[0])*.42, dz=-dx*.48;
      const footprint=[a,c,[c[0]+dx,-.01,c[2]+dz],[a[0]+dx,-.01,a[2]+dz]];
      path(g,C.projectShape(footprint,r.cam,true).map(point),D.alpha(palette.ink,.14),null);
    }
    for(const b of buildings)b.shapes.forEach(s=>localShape(g,s));
    g.fillStyle=g.createPattern(grain,'repeat');g.fillRect(0,0,width,height);
    // 紙張的套準角線只標示紙面邊界。
    const inset=7;
    for(const [x,sx] of [[inset,1],[width-inset,-1]])for(const [y,sy] of [[inset,1],[height-inset,-1]])
      path(g,[[x+14*sx,y],[x,y],[x,y+14*sy]],null,D.alpha(palette.ink,.46),.8);
    return bg;
  }
  const occupied=[];
  function tag(text,x,y,color) {
    // 點數換算為 CSS 像素，標籤完整跟隨本站字級設定。
    const font='650 '+(13*.75*window.LabSettings.get('fs'))+'pt '+D.FONT;ctx.font=font;
    const w=ctx.measureText(text).width+12, h=Math.ceil(ctx.measureText('Mg').fontBoundingBoxAscent || 15)+8;
    const xx=Math.max(w/2+3,Math.min(width-w/2-3,x));
    const clampY=v=>Math.max(h+4,Math.min(height-4,v));
    let yy=clampY(y);
    const tries=[0,-1,1,-2,2,-3,3].map(n=>clampY(y+n*(h+3)));
    for(const v of tries)if(!occupied.some(b=>Math.abs(b.x-xx)<(b.w+w)/2+4 && Math.abs(b.y-v)<h+2)){yy=v;break;}
    occupied.push({x:xx,y:yy,w}); D.pill(ctx,text,xx,yy,color,'center',font);
  }
  function marker(q,label,color,baseline=false) {
    const p=point(q), outside=!C.inside(q,r.sheet);
    let x=p[0],y=p[1];
    if(outside){
      const k=Math.min((width/2-16)/Math.max(1,Math.abs(x-width/2)),(height/2-15)/Math.max(1,Math.abs(y-height/2)));
      x=width/2+k*(x-width/2);y=height/2+k*(y-height/2);
      const a=Math.atan2(p[1]-y,p[0]-x);
      if(baseline){
        x-=8*Math.cos(a);y-=8*Math.sin(a);
        const tip=[x,y],wing=t=>[x-11*Math.cos(a+t),y-11*Math.sin(a+t)];
        path(ctx,[wing(-.54),tip,wing(.54)],null,color,2,[3,2]);
      }else D.arrow(ctx,x-14*Math.cos(a),y-14*Math.sin(a),x,y,color,1.9);
    } else {
      ctx.beginPath();ctx.arc(x,y,baseline?9:5,0,Math.PI*2);
      if(baseline){ctx.setLineDash([4,3]);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);}
      else{ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1.6;ctx.strokeStyle=palette.paper;ctx.stroke();}
    }
    tag(label,x+(baseline?-25:19),y+(baseline?23:-13),color);
  }
  function drawGuides() {
    const color=palette.guide,h=r.horizon;
    if(h!==null && Math.abs(h)<=r.sheet.v){
      sheetLine(ctx,[-r.sheet.u,h],[r.sheet.u,h],D.alpha(palette.hLine,.77),1.2,[9,5,2,5]);
      tag(T('視平線','Horizon'),42,point([0,h])[1]-5,palette.hLine);
    }
    for(const e of edges.filter(e=>e.owner==='A' && ['base','eave','left','right','sideEave','sideBase'].includes(e.name))){
      const end=r.vanishing[e.axis];
      if(end){
        const towards=e.line.reduce((best,p)=>Math.hypot(...C.sub(p,end))<Math.hypot(...C.sub(best,end))?p:best);
        sheetLine(ctx,towards,end,D.alpha(color[e.axis],.70),1.15,[[3,4],[7,3,2,3],[9,5]][e.axis]);
      }
    }
    const labels=[T('寬','Width'),T('高','Vertical'),T('深','Depth')];
    r.vanishing.forEach((v,i)=>{if(v)marker(v,labels[i],color[i]);});
  }
  function paperDraw() {
    if(!back)return;
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(back,0,0);
    ctx.setTransform(cv.width/width,0,0,cv.height/height,0,0);ctx.lineCap='round';ctx.lineJoin='round';
    occupied.length=0;
    if(ref) {
      const factor=r.sheet.u/ref.sheet.u;
      const ghost=D.dark?D.mix(D.c.equi,palette.paper,.22):D.mix(palette.ink,D.c.equi,.42);
      for(const e of ref.outline)for(const span of e.segments)
        sheetLine(ctx,...span.map(q=>q.map(x=>x*factor)),ghost,1.65,[5,4]);
      const names=[T('寬','width'),T('高','height'),T('深','depth')];
      ref.vanishing.forEach((p,k)=>{if(p)marker(p.map(x=>x*factor),T('基準','Ref')+' '+names[k],ghost,true);});
    }
    if($('guides').checked)drawGuides();
    for(const id of ['A','B']){
      const edge=edges.find(e=>e.owner===id&&e.name==='eave')??edges.find(e=>e.owner===id);
      if(!edge)continue;
      const [x,y]=point(C.mix(...edge.segment,.33));
      tag(id==='A'?T('A 畫室','A Studio'):T('B 書店','B Books'),x+12,y-11,id==='A'?D.c.accent:palette.ink);
    }
    if(hover==='A' || drag?.kind==='building') {
      for(const e of edges.filter(e=>e.owner==='A'))for(const span of e.segments)path(ctx,span.map(point),null,D.alpha(D.c.accent,.86),2.4);
    }
    if(tracing) {
      const hot=edges.find(e=>e.id===hover);
      if(hot)for(const span of hot.segments)path(ctx,span.map(point),null,D.alpha(palette.trace,.63),5);
      for(const [index,id] of picked.entries()){
        const e=edges.find(x=>x.id===id);
        if(!e)continue;
        const color=index?D.c.pos:palette.trace;
        sheetLine(ctx,...e.line,color,1.6,[6,4],-Infinity,0);
        sheetLine(ctx,...e.line,color,1.6,[6,4],1,Infinity);
        for(const span of e.segments)path(ctx,span.map(point),null,color,3);
      }
      if(result?.kind==='finite')marker(result.uv,T('交點','Crossing'),palette.trace);
    }
    viewer?.paperChanged();
  }
  function labelEdge(e){return (e.owner==='street'?'':e.owner+' · ')+T(...names[e.name]);}
  function updateEdges() {
    edges=C.traceable(r,main);
    const selected=$('edgeList').value;
    $('edgeList').replaceChildren(...edges.map(e=>new Option(labelEdge(e),e.id)));
    if(edges.some(e=>e.id===selected))$('edgeList').value=selected;
    $('pickEdge').disabled=!edges.length;
  }
  function traceMessage() {
    let message=T('點第一條屋簷、牆角或路緣。也可以從清單選邊。','Pick the first eave, upright or curb. You can also use the edge list.');
    if(picked.length===1)message=labelEdge(edges.find(e=>e.id===picked[0]))+' · '+T('再點另一條邊。','Choose a different edge.');
    if(result){
      if(result.kind==='finite'){
        message=(result.onPaper?T('交點在紙內','The lines meet on the paper'):T('交點在紙外','The lines meet beyond the paper'))+
          '  ('+num(result.uv[0])+', '+num(result.uv[1])+')'+T('。','.');
        if(result.axis!=null)message+=' '+T('這是這組平行邊的消失點。','This is the vanishing point of this family of parallel edges.');
        else message+=' '+T('兩條邊的空間方向不同。','These edges run in different spatial directions.');
      } else if(result.kind==='parallel')message=T('兩條投影平行，交點在無限遠。','The projected edges are parallel. Their intersection is at infinity.');
      else message=T('兩條投影重合或縮成一點。請換一對邊。','The images coincide or one collapses to a point. Try another pair.');
    }
    const status=$('traceStatus');status.setAttribute('aria-label',message);
    if(compactType()&&result?.kind==='finite'){
      const family=[T('寬向消失點','Width vanishing point'),T('垂直消失點','Vertical vanishing point'),T('深向消失點','Depth vanishing point')];
      message=(family[result.axis]||T('稜線交點','Edge intersection'))+' · '+(result.onPaper?T('紙內','on paper'):T('紙外','off paper'))+' ('+num(result.uv[0])+', '+num(result.uv[1])+')';
    }
    status.textContent=message;
  }
  function snapshot() {return {...C.measure(r),prior:ref?C.measure(ref):null,trace:result,families:[...families]};}
  function emit(type){window.LabMission?.emit(type,snapshot());}
  function pick(id) {
    if(!tracing || !edges.some(e=>e.id===id))return;
    if(picked.length===2){picked=[];result=null;}
    if(picked.includes(id))return;
    picked.push(id);
    if(picked.length===2){
      result=C.trace(...picked.map(key=>edges.find(e=>e.id===key)),r);
      progress[1]=true;
      if(result.kind==='finite'&&result.onPaper&&[0,2].includes(result.axis))families.add(result.axis);
      if(result.kind==='finite' && window.LabSound.enabled())
        window.LabSound.tone({freq:result.onPaper?660:392,dur:.12,gain:.09});
      emit('traced');
    }else{
      const other=edges.find(edge=>edge.id!==id);
      if(other)$('edgeList').value=other.id;
      emit('preview');
    }
    traceMessage();paperDraw();
  }
  function readParams(){return Object.fromEntries(keys.map(k=>[k,N.value($(k))]));}
  function detailRows() {
    const m=C.measure(r), vals=[
      [T('A 實際牆高','A · actual height'),num(m.realHeight)+' m'],
      [T('A 牆高／紙寬','A · height / paper width'),num(m.apparent==null?null:m.apparent/(2*r.sheet.u),3)+' ×'],
      [T('B 牆高／紙寬','B · height / paper width'),num(m.otherHeight==null?null:m.otherHeight/(2*r.sheet.u),3)+' ×'],
      [T('垂直視野','Vertical field of view'),num(m.verticalFov,1)+'°'],
      [T('紙內水平消失點','Horizontal points on paper'),String(m.horizontalInside)],
      [T('垂直消失點','Vertical vanishing point'),m.vanishing[1]?(m.verticalInside?T('紙內','On paper'):T('紙外','Off paper')):T('無限遠','At infinity')]];
    const [wide,,deep]=m.vanishing;
    if(wide&&deep){
      const a=Math.abs(wide[0]),b=Math.abs(deep[0]);
      vals.push([T('寬／深消失點距中線（單位焦距）','Width / depth offsets (unit focal lengths)'),num(a,3)+' / '+num(b,3)]);
      vals.push([T('兩點距中線的距離差','Difference between offsets'),num(Math.abs(a-b),3)]);
    }
    for(const id of ['A','B'])if(m['visibility'+id]==='partial'){
      vals.push([id+' · '+T('量測範圍','measured span'),T('僅計未被遮住的稜線','Exposed segments only')]);
    }
    if(ref){
      const fmt=p=>p?'('+num(p[0])+', '+num(p[1])+')':T('無限遠','Infinity');
      const axes=[T('寬','Width'),T('高','Vertical'),T('深','Depth')];
      axes.forEach((axis,k)=>vals.push([axis+' · '+T('基準 → 目前','reference → current'),fmt(ref.vanishing[k])+' → '+fmt(m.vanishing[k])]));
      const a=m.apparent,b=ref.apparent,oldCorner=ref.projected[0];
      vals.push([T('A 紙上長／基準','A / reference on paper'),num(a!=null&&b>0?a*ref.sheet.u/(b*r.sheet.u):null)+' ×']);
      vals.push([T('牆腳橫移（單位焦距）','Corner shift (unit focal lengths)'),num(m.anchor&&oldCorner?Math.abs(m.anchor[0]-oldCorner[0]):null,3)]);
    }
    $('readout').replaceChildren(...vals.flatMap(([k,v])=>{
      const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;return [dt,dd];}));
    $('count').textContent=String(m.count);const absent=['A','B'].filter(id=>['occluded','outside'].includes(m['visibility'+id]));
    $('ratio').toggleAttribute('data-status',!!absent.length);
    $('ratio').textContent=absent.length?absent.map(id=>id+' '+(m['visibility'+id]==='occluded'?T('被遮住','occluded'):T('在紙外','off paper'))).join(' · '):num(m.heightRatio)+' ×';$('lens').textContent=num(params.fov,1)+'°';
    keys.forEach(k=>{$(k+'o').textContent=num(params[k],['x','z','size'].includes(k)?2:1)+(['x','z','size'].includes(k)?' m':'°');});
    $('modes').querySelectorAll('button').forEach(b=>setPressed(b,({one:1,two:2,three:3})[b.dataset.mode]===m.count));
  }
  function feedback() {
    const text=[];
    if(ref)text.push(T('已保留基準','Reference saved'));
    if(log.length)text.push(T('記錄','Recorded')+' '+log.length+' · A/B '+num(log.at(-1).heightRatio));
    $('feedback').textContent=text.join(' ｜ ');
    const count=markCount(),other=latestOther();
    $('clearReference').disabled=!(ref || log.length || picked.length || count);
    $('dropRef').disabled=!ref;
    $('undoClear').hidden=!undo;
    $('markNotice').hidden=!count;
    $('recoverSheet').hidden=!other;
    const select=$('markedSheets'),others=[...pages.entries()].filter(([key,p])=>key!==activeKey&&p.marks.size).reverse();
    const signature=others.map(([key])=>key).join('/');
    if(select.dataset.sheets!==signature){
      const previous=select.value;
      select.replaceChildren(...others.map(([key,p])=>new Option(
        T('取景 ','View ')+p.params.yaw+'° / '+p.params.pitch+'° · '+p.params.fov+'° · A ('+p.params.x+', '+p.params.z+', '+p.params.size+')',key)));
      if(others.some(([key])=>key===previous))select.value=previous;
      select.dataset.sheets=signature;
    }
    select.hidden=others.length<2;
    $('sheetNotice').textContent=other?T('新構圖另開一張；之前的留點已存入畫冊。','A new composition uses a new sheet. Earlier marks are in your sketchbook.'):
      T('留點已存入畫冊；改構圖會另開一張。','Marks are saved in your sketchbook. Changing the composition starts another sheet.');
  }
  // 牆角的白話名稱，例如「A 樓右屋簷角」（corner 0–3 是牆腳、4–7 是屋簷；0、3 在左）
  function cornerName(t,lang){
    const en=lang?lang==='en':window.LabSettings.lang==='en';
    const left=[0,3].includes(t.corner%4),eave=t.corner>=4;
    return en?'building '+t.owner+' '+(left?'left ':'right ')+(eave?'eave corner':'wall foot')
      :t.owner+' 樓'+(left?'左':'右')+(eave?'屋簷角':'牆腳');
  }
  function updateRig(state){
    rigState=state;
    $('nextCorner').disabled=state.available<2 || state.closed;
    $('foldBoard').disabled=!state.available;
    const boardLabel=state.closed?T('翻開畫板','Open the board'):T('蓋上畫板打點','Close board and mark');
    $('foldBoard').setAttribute('aria-label',boardLabel);
    $('foldBoard').textContent=compactType()?(state.closed?T('翻開畫板','Open board'):T('蓋板打點','Mark board')):boardLabel;
    setPressed($('foldBoard'),state.closed);
    const t=state.target;
    let status=T('框內沒有牆角。請轉頭或調整視野。','No corner is inside the frame. Turn or change the field of view.');
    if(t){
        status=cornerName(t)+' · '+T('已打 ','Marks: ')+state.dots+T(' 點','');
    }
    $('rigStatus').textContent=status;feedback();
  }
  function stageLabels() {
    $('trace').hidden=!!viewer; $('traceBox').hidden=!tracing || !!viewer;
    setPressed($('trace'),tracing);cv.toggleAttribute('data-trace',tracing);
    $('stageTitle').textContent=viewer?T('杜勒透視繪圖機','Dürer’s drawing frame'):T('街角寫生','Street sketch');
    $('navRow').hidden=!viewer;$('cameraBank').hidden=!viewer;$('rigNav').hidden=!viewer||eye;
    $('overlayControl').hidden=!viewer || !eye;
    $('rigControls').hidden=!viewer || eye;
    $('stageHint').textContent=viewer?(eye?T('從釘環看桌上街景。可疊上四成濃度的素描，比對路緣、門窗與屋簷。','Look through the eyelet at the tabletop street. Overlay the sketch at 40% opacity to compare curbs, windows and eaves.'):
      T('桌上街景為 1 比 16。拉線從牆角連到眼睛，十字滑線會停在拉線穿過木框的位置。按「蓋上畫板打點」把這個位置記在畫板上，再按「翻開畫板」看點落在哪裡。','The tabletop street is at 1:16 scale. A thread runs from the corner to the eye, and the cross cords stop where it passes through the frame. Press Close board and mark to record that spot, then Open the board to see where the dot lands.')):
      (tracing?T('點兩條邊，把它們延長。箭頭指向紙外的交點。','Select two edges to extend them. An arrow points toward an off-paper crossing.'):
      T('拖畫室 A 換位置。拖空白處左右轉頭、上下仰俯。','Drag studio A to move it. Drag the background to turn or tilt your head.'));
    const sound=window.LabSound.enabled();setPressed($('soundBtn'),sound);
    const concise=compactType();document.querySelector('.stage').toggleAttribute('data-compact-type',concise);
    const short=(el,full,brief)=>{el.textContent=concise?brief:full;el.setAttribute('aria-label',full);};
    short($('view2d'),T('2D 畫紙','2D paper'),'2D');
    short($('view3d'),T('3D 畫框','3D frame'),'3D');
    short($('pickEdge'),T('描這條邊','Trace this edge'),T('描這條邊','Trace edge'));
    if(concise&&viewer)$('stageTitle').textContent=T('杜勒畫框','Dürer frame');
    short($('soundBtn'),sound?T('音效開','Sound on'):T('音效關','Sound off'),T('音效','Sound'));
    short($('trace'),T('描圖模式','Trace edges'),T('描圖','Trace'));
    short($('reference'),T('保留基準','Save reference'),T('存基準','Save'));
    short($('record'),T('記錄讀數','Record readings'),T('記錄','Record'));
    short($('resetCam'),T('重設視角','Reset view'),T('重設','Reset'));
    const captions=$('meters').querySelectorAll('dt');
    short(captions[0],T('消失點數','Vanishing points'),T('消失點','Points'));
    short(captions[1],T('紙上樓高 A／B','A / B on paper'),T('紙高比','A / B'));
    short(captions[2],T('水平視野','View angle'),T('視野','Field'));
  }
  function render(notify=false) {
    const w=host.clientWidth,h=host.clientHeight;if(!w || !h)return;
    const previous=params;params=readParams();const next=sheetKey(params);
    if(activeKey!==next || lastPaper!==w/h){
      if(previous&&['yaw','pitch','fov'].some(k=>previous[k]!==params[k]))progress[0]=true;
      cornerChosen=false;
      picked=[];result=null;families.clear();activeKey=next;lastPaper=w/h;
    }
    width=w;height=h;r=C.view(params,w/h);scale=w/(2*r.sheet.u);
    const dpr=Math.min(devicePixelRatio||1,2);
    const v=[...Object.values(params),w,h,dpr,D.ver].join('|');
    if(v!==paintVersion){
      if(cv.width!==Math.round(w*dpr) || cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}
      const key=[params.x,params.z,params.size].join(',');
      if(key!==geometryKey){main=C.mainBuilding(params);geometryKey=key;}
      updateEdges();
      if(picked.some(id=>!edges.some(e=>e.id===id))){picked=[];result=null;}
      else if(picked.length===2)result=C.trace(...picked.map(id=>edges.find(e=>e.id===id)),r);
      back=composeStreet();paintVersion=v;
    }
    detailRows();feedback();stageLabels();traceMessage();paperDraw();
    viewer?.sync(r,main,palette,$('guides').checked);
    if(notify)emit('preview');
  }
  function change(values) {
    placing=true;
    try {Object.entries(values).forEach(([k,v])=>N.set($(k),v));}
    finally {placing=false;}
    picked=[];result=null;render(true);
  }
  function queueRender(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;render();});}
  function mode3D(enabled) {
    $('view3').hidden=!enabled;$('view2').hidden=enabled;$('cameraControls').hidden=!enabled;
    setPressed($('view2d'),!enabled);setPressed($('view3d'),enabled);
  }
  function close3D(msg=''){
    token++;loading=false;const last=viewer;viewer=null;last?.dispose();eye=false;rigState={available:0,target:null,closed:false,dots:0};
    mode3D(false);$('viewMsg').hidden=!msg;$('viewMsg').textContent=msg;render();
  }
  async function open3D() {
    if(viewer || loading)return;
    const serial=++token;loading=true;$('viewMsg').hidden=false;$('viewMsg').textContent=T('正在架設畫框…','Setting up the frame…');
    try {
      const {makeViewer}=await import('./perspective-drawing-3d.js');
      const [THREE,{OrbitControls}]=await Promise.all([import('../vendor/three/three.module.min.js'),import('../vendor/three/OrbitControls.js')]);
      if(serial!==token)return;
      mode3D(true);
      viewer=makeViewer({THREE,OrbitControls,host:$('view3'),paperCanvas:cv,navHost:$('rigNav'),T,getMarks:write=>write?currentPage().marks:pages.get(activeKey)?.marks??new Map(),onRigState:updateRig,
        onLost:()=>close3D(T('立體畫面中斷，已回到畫紙。','The 3D context was lost. The paper view is active.'))});
      loading=false;$('viewMsg').hidden=true;setCamera(false);render();
    } catch(error) {
      if(serial===token)close3D(T('目前無法開啟立體畫框，已回到畫紙。','The 3D frame is unavailable. The paper view is active.'));
    }
  }
  function setCamera(toEye){
    eye=toEye;$('sketchOverlay').checked=false;viewer?.overlay(false);viewer?.preset(eye);
    setPressed($('sideCam'),!eye);setPressed($('eyeCam'),eye);stageLabels();
  }
  function pxy(e){const rect=cv.getBoundingClientRect();return [e.clientX-rect.left,e.clientY-rect.top];}
  function closestEdge(x,y){
    let best=null,distance=22;
    const q=uv(x,y);
    for(const e of edges){
      const d=C.edgeDistance(e,q)*scale;
      if(d<distance){best=e.id;distance=d;}
    }
    return best;
  }
  function hitMain(x,y) {
    if(!edges.some(e=>e.owner==='A'))return false;
    const corners=r.projected.filter(Boolean).map(point);if(!corners.length)return false;
    // 兩個可見牆面及屋頂的凸包；小尺寸仍保留一指寬的點選區。
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const sorted=corners.concat(main.shapes.filter(s=>s.mat==='roofTop').flatMap(s=>C.projectShape(s.v,r.cam,true).map(point))).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const half=points=>{const pile=[];for(const p of points){while(pile.length>1 && cross(pile.at(-2),pile.at(-1),p)<=0)pile.pop();pile.push(p);}return pile.slice(0,-1);};
    const hull=half(sorted).concat(half([...sorted].reverse()));
    if(hull.length<3)return false;
    const xs=hull.map(p=>p[0]),ys=hull.map(p=>p[1]);
    const pad=Math.max(3,(44-Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)))/2);
    return hull.every((a,i)=>{const b=hull[(i+1)%hull.length];return cross(a,b,[x,y])>=-pad*Math.hypot(b[0]-a[0],b[1]-a[1]);});
  }
  cv.addEventListener('pointerdown',e=>{
    if(drag || e.button!==0)return;
    const [x,y]=pxy(e);
    const kind=tracing?'trace':hitMain(x,y)?'building':'turn';
    const baseUV=C.project([params.x,0,-params.z],r.cam);
    drag={id:e.pointerId,x,y,kind,p:{...params},cam:r.cam,baseUV};cv.setPointerCapture(e.pointerId);
    if(kind!=='trace')cv.setAttribute('data-drag','');paperDraw();
  });
  cv.addEventListener('pointermove',e=>{
    const [x,y]=pxy(e);
    if(!drag){const next=tracing?closestEdge(x,y):hitMain(x,y)?'A':null;if(next!==hover){hover=next;paperDraw();}return;}
    if(drag.id!==e.pointerId || drag.kind==='trace')return;
    const dx=x-drag.x,dy=y-drag.y;
    if(drag.kind==='turn')change({yaw:drag.p.yaw-dx/width*95,pitch:drag.p.pitch+dy/height*85});
    else if(drag.baseUV){
      const q=[drag.baseUV[0]+dx/scale,drag.baseUV[1]-dy/scale];
      const ground=C.groundAt(drag.cam,q);
      if(ground)change({x:ground[0],z:-ground[2]});
    }
  });
  function endDrag(e){
    if(drag?.id!==e.pointerId)return;
    if(e.type==='pointerup' && drag.kind==='trace'){
      const [x,y]=pxy(e);if(Math.hypot(x-drag.x,y-drag.y)<14)pick(closestEdge(x,y));
    }
    drag=null;hover=null;cv.removeAttribute('data-drag');if(cv.hasPointerCapture(e.pointerId))cv.releasePointerCapture(e.pointerId);
    feedback();paperDraw();
  }
  for(const type of ['pointerup','pointercancel','lostpointercapture'])cv.addEventListener(type,endDrag);
  cv.addEventListener('pointerleave',()=>{if(!drag){hover=null;paperDraw();}});
  for(const k of keys)$(k).addEventListener('input',()=>{if(!placing){picked=[];result=null;render(true);}});
  $('modes').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    const angles={one:[0,0],two:[18,0],three:[18,12]}[b.dataset.mode];change({yaw:angles[0],pitch:angles[1]});
  }));
  $('guides').addEventListener('change',()=>render());
  $('trace').addEventListener('click',()=>{tracing=!tracing;hover=null;render();});
  $('pickEdge').addEventListener('click',()=>{pick($('edgeList').value);feedback();});
  $('newTrace').addEventListener('click',()=>{picked=[];result=null;render(true);});
  $('reference').addEventListener('click',()=>{compareRecorded=false;ref={...r,outline:edges.filter(e=>e.owner==='A')};render(true);});
  $('record').addEventListener('click',()=>{
    if(ref&&keys.some(k=>params[k]!==ref.p[k])){compareRecorded=true;progress[2]=true;}
    const measurement=C.measure(r);log.push(measurement);
    const item=document.createElement('li');
    item.textContent=T('左右轉向 ','Turn ')+num(params.yaw,1)+'° · '+T('仰俯 ','Tilt ')+num(params.pitch,1)+'° · A/B '+num(measurement.heightRatio);
    $('history').append(item);$('historyBox').hidden=false;emit('recorded');feedback();
  });
  $('dropRef').addEventListener('click',()=>{ref=null;families.clear();render(true);});
  $('recoverSheet').addEventListener('click',()=>{const prior=pages.get($('markedSheets').value);if(prior)change(prior.params);});
  $('clearReference').addEventListener('click',()=>{
    $('clearPrompt').hidden=false;
    $('clearSummary').textContent=T('將清除基準、描線、記錄與留點。留點共 ','Clear the reference, traces, records and all marks? Marks: ')+markCount()+T(' 個。可復原。','. You can undo this.');
    $('cancelClear').focus();
  });
  $('cancelClear').addEventListener('click',()=>{$('clearPrompt').hidden=true;$('clearReference').focus();});
  $('confirmClear').addEventListener('click',()=>{
    undo={ref,log,picked,result,progress:[...progress],compareRecorded,families:[...families],pages:new Map(pages),rows:[...$('history').children],key:activeKey};
    pages.clear();ref=null;log=[];picked=[];result=null;families.clear();
    progress=[progress[0],false,false,false];compareRecorded=false;cornerChosen=false;
    $('history').replaceChildren();$('historyBox').hidden=true;$('clearPrompt').hidden=true;viewer?.refreshMarks();render(true);$('undoClear').focus();
  });
  $('undoClear').addEventListener('click',()=>{
    if(!undo)return;
    for(const [key,page] of undo.pages){
      const active=pages.get(key);
      if(active)for(const [id,q] of active.marks)page.marks.set(id,q);
      pages.set(key,page);
    }
    progress=progress.map((done,i)=>done||undo.progress[i]);compareRecorded ||= undo.compareRecorded;
    ref=undo.ref??ref;log=undo.log.concat(log);$('history').prepend(...undo.rows);$('historyBox').hidden=!log.length;
    if(activeKey===undo.key){picked=undo.picked;result=undo.result;undo.families.forEach(k=>families.add(k));}
    undo=null;viewer?.refreshMarks();render(true);
  });
  $('soundBtn').addEventListener('click',()=>window.LabSettings.set('sound',!window.LabSound.enabled()));
  window.addEventListener('lab:settingschange',()=>{stageLabels();queueRender();});
  $('view3d').addEventListener('click',open3D);$('view2d').addEventListener('click',()=>close3D());
  $('sideCam').addEventListener('click',()=>setCamera(false));$('eyeCam').addEventListener('click',()=>setCamera(true));
  $('nextCorner').addEventListener('click',()=>{cornerChosen=true;viewer?.nextCorner();});
  $('foldBoard').addEventListener('click',()=>{
    if(!viewer||!rigState.target)return;
    cornerChosen=true;
    if(rigState.closed&&rigState.dots)progress[3]=true;
    viewer.toggleBoard();
  });
  $('sketchOverlay').addEventListener('change',()=>viewer?.overlay($('sketchOverlay').checked));
  $('resetCam').addEventListener('click',()=>setCamera(eye));
  function theme(){palette=paletteForPaper();grain=texture();paintVersion='';render();}
  window.addEventListener('lab:themechange',theme);
  const lesson=[
    ['換一個取景，觀察消失點。','Change the view and watch the vanishing points.'],
    ['描兩條街景邊線，檢查它們的交點。','Trace two street edges and inspect their crossing.'],
    ['保留基準，改動街景再記錄。','Save a reference, change the scene and record.'],
    ['在 3D 畫框按「蓋上畫板打點」，再按「翻開畫板」看點落在哪裡。','In the 3D frame, press Close board and mark, then Open the board to see where the dot lands.']
  ];
  function targetFor(i){
    const target=(id,zh,en)=>({el:$(id),zh,en});
    if(i===0){
      const two=$('modes').querySelector('[data-mode="two"]');
      return two.getAttribute('aria-pressed')==='true'?{el:$('modes').querySelector('[data-mode="three"]'),zh:'三點透視',en:'Three-point view'}:{el:two,zh:'兩點透視',en:'Two-point view'};
    }
    if(i===1){
      if(viewer)return target('view2d','2D 畫紙','2D paper');
      if(!tracing)return target('trace','描圖模式','Trace edges');
      if(picked.includes($('edgeList').value)||!edges.length)return target('edgeList','選另一條街景邊線','Choose a different edge');
      return target('pickEdge',picked.length?'描第二條邊':'描第一條邊',picked.length?'Trace the second edge':'Trace the first edge');
    }
    if(i===2){
      if(!ref)return target('reference','保留基準','Save reference');
      if(keys.every(k=>params[k]===ref.p[k]))return target('x','畫室左右位置','Studio lateral position');
      return target('record','記錄讀數','Record readings');
    }
    if(!viewer)return target('view3d','3D 畫框','3D frame');
    if(eye)return target('sideCam','從旁邊看','From the side');
    if(!rigState.available)return target('yaw','左右轉向','Turn left / right');
    if(rigState.closed)return target('foldBoard','翻開畫板','Open the board');
    const marks=pages.get(activeKey)?.marks,marked=marks?.has(rigState.target.owner+rigState.target.corner);
    if(progress.every(Boolean)&&marks?.size>=rigState.available)return target('yaw','左右轉向，換一張畫紙','Turn to start a new sketch');
    if(marked&&rigState.available>1)return target('nextCorner','換一個牆角，再打一點','Next corner, then mark again');
    return target('foldBoard','按「蓋上畫板打點」','Press Close board and mark');
  }
  function checklist(i){
    const counts=(label,en,value)=>[label+' · '+value,en+' · '+value];
    let conditions;
    if(i===0)conditions=[[progress[0],...counts('改變取景，讀取有限消失點數','Change the view and count finite vanishing points',r?.count??0)]];
    if(i===1)conditions=[
      [tracing&&!viewer,'在畫紙開啟描圖','Enable tracing on the paper'],
      [picked.length===2,...counts('選兩條不同的邊','Select two different edges',picked.length+' / 2')],
      [!!result,result?'已讀取交點 · '+$('traceStatus').textContent:'讀取延長後的交點 · 尚未描完',result?'Intersection · '+$('traceStatus').textContent:'Read the intersection · pair incomplete']
    ];
    if(i===2){
      const different=!!ref&&keys.some(k=>params[k]!==ref.p[k]);
      conditions=[[!!ref,ref?'比較基準 · 已保留':'比較基準 · 未保留',ref?'Reference · saved':'Reference · unsaved'],
        [different,...counts('改動構圖，基準 → 目前的 A/B','Change the composition, reference → current A/B',num(ref?C.measure(ref).heightRatio:null)+' → '+num(r?C.measure(r).heightRatio:null))],
        [compareRecorded,...counts('記錄改動後的讀數，累計筆數','Record the changed readings, total entries',log.length)]];
    }
    if(i===3)conditions=[
      [!!viewer&&!eye,'從旁邊觀察畫框','Observe the frame from the side'],
      [!!viewer&&!eye&&!!rigState.target,rigState.target?'十字滑線對準 · '+cornerName(rigState.target,'zh'):'框內沒有牆角 · 轉頭或拉寬視野',rigState.target?'Cross cords on · '+cornerName(rigState.target,'en'):'No corner in the frame · turn or widen the view'],
      [rigState.dots>0,...counts('蓋上畫板打點','Close the board and mark it',rigState.dots)],
      [progress[3],'翻開畫板查看留點','Open the board to inspect the mark']
    ];
    const next=targetFor(i);return [...conditions,[null,next.zh,next.en]];
  }
  function nextStep(i){
    if(!progress[i])return i;
    const unfinished=progress.indexOf(false);
    return unfinished>=0?unfinished:3;
  }
  function guide(i){
    const index=nextStep(i),target=targetFor(index).el;
    window.LabDeck?.reveal(target);window.LabStepGuide?.show(index);
  }
  window.LabStepGuide?.define(lesson.map((_,i)=>({
    target:()=>targetFor(nextStep(i)).el,hint:()=>{const t=targetFor(nextStep(i));return T(t.zh,t.en);}
  })));
  window.LabSide?.mount({module:'perspective-drawing',steps:()=>lesson.map(([zh,en],i)=>({
    html:T(zh,en),done:progress[i],current:i===progress.indexOf(false),need:checklist(i)
  })),guide});
  new ResizeObserver(queueRender).observe(host);theme();
  // 任務元件在本站控制器之後載入。第一張畫紙也要能讀到目前條件。
  window.addEventListener('DOMContentLoaded',()=>{if(r)emit('preview');},{once:true});
})();
