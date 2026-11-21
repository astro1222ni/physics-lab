(function () {
  'use strict';
  const C = window.BasketballShotCore, D = window.LabDraw, N = window.LabNum, T = window.LabSettings.t;
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d'), layer = document.createElement('canvas');
  const brush = layer.getContext('2d'), keys = ['speed', 'angle', 'height', 'distance', 'bearing'];
  const history = [], settings = {};
  let mode = 'shot', state, reference = null, completed = null, bestKey = '', best = null, bestPath = null;
  let palette, layout, frozen = null, grab = null, hover = false, batching = false, bgValid = false;
  let world = null, viewToken = 0, flight = null, frame = 0, ball = null, clock = 0, stamp = 0, eventIndex = 0;
  let impactMark = null, compared = null, replaying = false, fontScale = 1;
  const pointsPerCssPixel = 72 / 96;
  const font = (size, weight = 400) => weight+' '+(size*Math.max(1,fontScale)*pointsPerCssPixel)+'pt '+D.FONT;
  const comparedHere=()=>compared?.current===state && compared.reference===reference;
  const matchingTrials=()=>comparedHere() && reference.p.mode===mode && state.p.height===reference.p.height &&
    (mode==='shot' ? !state.p.drag && !reference.p.drag && state.p.distance===reference.p.distance && state.data.bearing===reference.data.bearing :
      state.p.drag===reference.p.drag && state.p.speed===reference.p.speed);
  const rad = Math.PI / 180, num = (x, n = 2) => x == null ? '—' : x.toFixed(n);
  const unit = (x, u, n = 2) => x == null ? '—' : num(x, n) + u;
  const alpha = D.alpha, mix = D.mix, shade = D.shade;
  function colors() {
    const c = D.c, dark = D.dark, style = getComputedStyle(document.documentElement);
    const orange = style.getPropertyValue('--b-mech').trim(), teal = style.getPropertyValue('--b-wave').trim();
    const wood = mix(orange, c.equi, .59);
    return { dark, orange: dark ? orange : shade(orange, .15), ball: dark ? orange : shade(orange, .18),
      path: dark ? c.accent : teal, ref: c.neg, best: c.probe, ink: c.text, muted: c.muted, bg: c['canvas-bg'],
      wall: mix(c.surface, c.accent, dark ? .16 : .09),
      timber: dark ? mix(c.surface, wood, .46) : shade(wood, .56),
      pad: dark ? mix(c.surface, c.accent, .17) : mix(c.field, c.accent, .45),
      metal: dark ? shade(c.field, -.50) : shade(c.field, .13),
      white: shade(c['canvas-bg'], .94), deep: shade(dark ? c.surface : c.field, -.47),
      skin: dark ? shade(wood, .23) : mix(shade(orange, .46), c.equi, .12),
      jersey: dark ? mix(teal, c.accent, .30) : teal, softball: mix(shade(c.equi, .66), shade(c.probe, .74), .22) };
  }
  const outcome = r => ({
    swish: T('空心進球','Swish'), bank: T('打板進球','Bank shot'), front: T('碰前框','Front rim'),
    back: T('碰後框','Back rim'), miss: r.board ? T('打板未進','Bank miss') : T('未進框','Miss'),
    land: T('壘球落地','Softball lands')
  })[r.outcome];
  function finalLabel(d){
    const labels={swish:['空心進','Swish'],bank:['打板進','Banked in'],'rim-in':['碰框彈進','Rimmed in'],'bank-rim-in':['打板碰框進','Bank and rim in'],
      'rim-out':['碰框彈出','Rimmed out'],'board-out':['打板彈出','Banked out'],airball:['籃外空心','Airball']};
    return T(...labels[d.final.how]);
  }
  function projected(r,pt){
    const [x,y,z,t]=pt,{c,s}=r.station;
    return [r.distance+x*c-z*s,y,t,x*s+z*c,x,z];
  }
  function playback(r){
    return r.path?r.path.map(pt=>projected(r,pt)):r.points;
  }
  function compute() {
    const p = { mode, drag: $('drag').checked };
    keys.forEach(k => { p[k] = N.value($(k)); });
    if(mode==='throw')p.bearing=0;
    const result = C.launch(p);
    if (mode === 'throw') {
      const key = [p.speed, p.height, p.drag].join('/');
      if (bestKey !== key) {
        best = C.bestRange(p);
        bestPath = C.launch({ ...p, angle: best.theta });
        bestKey = key;
      }
    }
    return { p, result, data: C.measurement(p, result, mode === 'throw' ? best : null) };
  }
  function tracks() {
    const tracks = history.filter(s => s.p.mode === mode && s !== state)
      .map((s, i) => ({ result: s.result, ink: palette.muted, dash: [2, 5], opacity: .30 + .15 * i }));
    if (reference?.p.mode === mode && reference !== state)
      tracks.push({ result: reference.result, ink: palette.ref, dash: [8, 5], opacity: .86 });
    if (mode === 'throw' && matchingTrials()) tracks.push({ result: bestPath, ink: palette.best, dash: [7, 5], opacity: .90 });
    tracks.push({ result: state.result, ink: palette.path, dash: null, opacity: 1 });
    return tracks;
  }
  function readings(id, entries) {
    const list = [];
    for (const [title, value] of entries) {
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = title; dd.textContent = value; list.push(dt, dd);
    }
    $(id).replaceChildren(...list);
  }
  function canCompare(){
    return completed===state && state.data.trialRole==='comparison' && reference &&
      state.against===reference && !!changedSetting(reference);
  }
  function updateDisplay() {
    const d = state.data, isShot = mode === 'shot';
    const present = completed === state;
    const items = [[T('最高點','Apex height'), unit(d.H,' m')], [T('飛行時間','Flight time'), unit(d.T,' s')]];
    const virtual=d.rimHit?T('若沒碰框 · ','Without rim contact · '):'';
    if (isShot) {
      items.push([T('實際站位角度','Court bearing'),unit(d.bearing,'°',1)], [T('最後結果','Final result'),finalLabel(d)], [virtual+T('穿越框高的位置','Crossing position'),unit(d.crossing?.x,' m',3)],
        [T('球面至框緣最小間隙','Closest ball-to-rim clearance'),unit(100*d.margin,' cm',2)]);
      if(d.envelope!=null){
        const deficit=C.rimHeight-d.envelope;
        items.push([deficit>0?T('可達上限還差多少到框高','Reachable height falls short by'):T('可達上限超過框高','Reachable height exceeds rim by'),unit(Math.abs(deficit),' m',3)]);
      }
      if(matchingTrials())items.push([T('無阻力到框心的最小速率','Minimum speed to centre'),unit(d.minimum.speed,' m/s',3)],
        [T('最小速率時的出手角','Release angle at minimum speed'),unit(d.minimum.angle,'°',2)]);
    } else {
      items.push([T('落地角','Landing angle'),unit(d.landingAngle,'°')],[T('落地速率','Landing speed'),unit(d.vLand,' m/s',3)]);
      if(matchingTrials())items.push([T('最遠射程','Maximum range'),unit(d.bestRange,' m')],[T('最遠射程的角度','Maximum-range angle'),unit(d.bestAngle,'°')]);
    }
    $('resultFormula').querySelector('summary').textContent=isShot?T('到達框心的最小出手速率','Minimum speed to reach the centre'):T('壘球的最遠射程','Maximum softball range');
    $('resultFormula').hidden=!matchingTrials();if(!matchingTrials())$('resultFormula').open=false;
    $('shotFormula').hidden=!isShot;$('throwFormula').hidden=isShot;$('formulaHint').hidden=matchingTrials();
    readings('readout', items);
    $('strip').replaceChildren(...[
      [present?T('本球結果','Result'):T('預測結果','Prediction'),isShot?outcome(d):unit(d.R,' m')],
      isShot?[d.rimHit?T('若沒碰框 · 下降角','No rim · descent'):T('下降角','Descent angle'),unit(d.crossing?.angle,'°',2)]:[T('落地角','Landing angle'),unit(d.landingAngle,'°',2)],
      isShot?[d.rimHit?T('若沒碰框 · 開口','No rim · opening'):T('有效開口','Opening'),unit(d.opening==null?null:100*d.opening,' cm',1)]:[T('最高點','Apex'),unit(d.H,' m')]
    ].map(([lab,val]) => {
      const box = document.createElement('div'), name = document.createElement('span'), v = document.createElement('strong');
      box.className = 'court-stat'; name.textContent = lab; v.textContent = val; box.append(name,v); return box;
    }));
    const prev = reference?.p.mode === mode ? reference.data : null;
    $('refStatus').textContent = prev ? T('基準球','Reference') + ' · ' + num(prev.speed,3) + ' m/s · ' + num(prev.angle,2) + '° · ' + outcome(prev) : T('尚未保留本項目的基準球。','No reference for this sport yet.');
    const delta = (a,b,suffix,n=2) => (a-b>0?'+':'')+unit(a-b,suffix,n);
    readings('comparison', !prev ? [] : [
      [T('出手速率差','Release speed change'),delta(d.speed,prev.speed,' m/s',3)],
      ...(isShot ? [[T('站位角度差','Bearing change'),delta(d.bearing,prev.bearing,'°',1)],[T('下降角（基準 → 本球）','Descent (reference → current)'),(prev.rimHit?T('若沒碰框 ','Without rim contact '):'')+unit(prev.crossing?.angle,'°')+' → '+virtual+unit(d.crossing?.angle,'°')]] :
        [[T('射程差','Range change'),delta(d.R,prev.R,' m')]]),
      [T('最高點差','Apex change'),delta(d.H,prev.H,' m')] ]);
    $('reference').disabled = !!flight;
    $('play').title=flight?T('跳到這球的結束位置','Skip to the end of this release'):T('出手','Release');
    $('record').disabled = !present || d.trialRole!=='single';
    $('compare').disabled = !canCompare();
    $('clearReference').disabled = !reference;
    $('clearAll').disabled = !history.length && !reference && !flight && !completed;
    const recent=history.filter(s=>s.p.mode===mode);
    $('recentBox').hidden=!recent.length;
    $('recent').replaceChildren(...recent.map(({data:r})=>{
      const row=document.createElement('li');
      row.textContent=num(r.angle,2)+'° · '+num(r.speed,3)+' m/s · '+
        (isShot?outcome(r)+' ('+num(r.distance)+' m)':unit(r.R,' m'));
      return row;
    }));
    for(const id of ['distanceRow','bearingRow','spots','bearingHint','courtMap','focusRow'])$(id).hidden=!isShot;
    if(isShot){
      const limited=Math.abs(d.bearing-state.p.bearing)>.001;
      $('bearingHint').textContent=T('從中場面向籃框，正角在右手邊。','Face the hoop from midcourt. Positive angles are to your right.')+
        (limited?T(' 已靠近邊線，實際站位 ',' Sideline limit. Actual bearing ')+unit(d.bearing,'°',1):'');
    }
    keys.forEach(k => { if (!$(k+'o').dataset.editing) $(k+'o').textContent = unit(state.p[k], {bearing:'°',speed:' m/s',angle:'°',height:' m',distance:' m'}[k],k==='speed'?3:k==='bearing'?0:2); });
    const legend = [[palette.path,T('本球','Current'), 'solid'],
      ...(isShot&&state.result.path.some(([x,,z])=>Math.abs(x*state.result.station.s+z*state.result.station.c)>.02)?[[palette.path,T('離開投籃平面','Out of shot plane'),'dashed']]:[]),
      ...(mode==='throw'&&matchingTrials()?[[palette.best,T('最遠軌跡','Optimal throw'),'dashed']]:[]),
      ...(history.some(s=>s.p.mode===mode)?[[palette.muted,T('最近三球','Last three'),'dotted']]:[]),
      ...(prev?[[palette.ref,T('基準球','Reference'),'dashed']]:[])];
    $('legend').replaceChildren(...legend.map(([ink,name,style])=>{
      const el=document.createElement('span'), mark=document.createElement('i');
      mark.style.borderColor=ink; mark.style.borderTopStyle=style; el.append(mark,name); return el;
    }));
    const canSeeEntry=!isShot||!!d.crossing;
    $('ballCam').disabled=!canSeeEntry;
    if(world&&!canSeeEntry&&$('ballCam').getAttribute('aria-pressed')==='true')camera('side');
    let hint=T('拖箭頭改方向，拉長就投得更快。動畫以 0.6 倍速播放。','Drag the arrow to aim. Pull farther for more speed. Playback runs at 0.6×.');
    if(world){
      if(!canSeeEntry)hint=T('這一球未達框高。提高出手角度或速率，即可從球的視角看籃框。','This shot falls below hoop height. Raise its angle or speed to see the hoop from the ball.');
      else if(isShot)hint=T('按「球的視角」沿球落下的方向看框。拖動畫面可旋轉或平移。','Choose Ball view to look along the descending velocity. Drag to rotate or pan.');
      else hint=T('按「球的視角」沿壘球落下的方向看落點。','Choose Ball view to look along the descending softball toward its landing spot.');
    }
    $('stageHint').textContent=!world&&D.reducedMotion()?T('拖箭頭改方向與速率。出手後立即顯示結果，可選擇播放這球。','Drag to aim and set speed. Release shows the result immediately. Replay is optional.'):hint;
    $('replay').hidden=!D.reducedMotion()||!present||!!flight;
    $('instruments').hidden=!isShot;
    if(isShot){
      $('gapValue').textContent=unit(d.margin*100,' cm',2);
      $('lensNote').textContent=d.rimHit?T('虛線球顯示若沒碰框時的落點。','Dashed ball shows the crossing without rim contact.'):
        d.crossing?T('十字為框心，圓點為球心。','Cross marks the hoop centre. Dot marks the ball centre.'):
        T('球心未從上方穿越框高。','The centre never descends through hoop height.');
    }
    window.LabSide?.instance?.refresh?.();
    updateProcedureGuide();
  }
  function line(c, pts, ink, width=1, dash=[]) {
    c.beginPath(); pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y)); c.lineJoin=c.lineCap='round';
    c.strokeStyle=ink; c.lineWidth=width; c.setLineDash(dash); c.stroke(); c.setLineDash([]);
  }
  function shape(c,pts,fill,edge=null,width=1) {
    c.beginPath(); pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y)); c.closePath();
    c.fillStyle=fill; c.fill(); if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}
  }
  function ellipse(c,x,y,rx,ry,fill,edge=null,width=1) {
    c.beginPath();c.ellipse(x,y,rx,Math.max(.01,ry),0,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill();}
    if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}
  }
  function gradient(c,y1,y2,a,b) {const g=c.createLinearGradient(0,y1,0,y2);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
  function frameFor(w,h) {
    const shot=mode==='shot', d=state.p.distance;
    let left=shot?Math.min(-1.15,d-C.court.threePoint-.45):-1.35, right=shot?d+1.9:4, top=shot?4.55:2.3;
    for(const {result:r} of tracks()){
      top=Math.max(top,r.H+.28); left=Math.min(left,r.R-.35); right=Math.max(right,r.R+.45);
      if(r.path){for(const pt of r.path){const [x,y]=projected(state.result,pt);left=Math.min(left,x-.2);right=Math.max(right,x+.2);top=Math.max(top,y+.25);}}
      if(r.board) right=Math.max(right,r.board.x+.5);
    }
    const baseline=h*.77, roof=h<250?29:52;
    const scale=Math.min((w-20)/(right-left),(baseline-roof)/top);
    const ox=(w-(right-left)*scale)/2-left*scale;
    return {w,h,scale,baseline,ox, at:(x,y,z=0)=>[ox+(x+z*.26)*scale,baseline+(-y+z*.12)*scale],
      arrowScale:Math.min(w*.018,h*.021,8.4)};
  }
  function courtView(f){
    const d=state.p.distance,{s,c}=state.result.station;
    return (along,y,z=0)=>f.at(d+(along-d)*c-z*s,y,(along-d)*s+z*c);
  }
  function room(c,f) {
    const {w,h,baseline:b,scale:s,at}=f, p=palette, horizon=b-h*.105;
    c.fillStyle=gradient(c,0,horizon,shade(p.wall,p.dark?.10:-.08),p.wall);c.fillRect(0,0,w,h);
    const sill=horizon*.39, top=horizon*.11, span=Math.max(46,w/8);
    for(let i=-1;i<Math.ceil(w/span)+1;i++){
      const x=i*span;
      c.fillStyle=gradient(c,top,sill,mix(p.wall,p.white,p.dark?.13:.76),mix(p.wall,p.path,p.dark?.12:.19));
      c.fillRect(x+4,top,span-9,sill-top);
      shape(c,[[x+span*.22,top],[x+span*.34,top],[x+span*.13,sill],[x+span*.045,sill]],alpha(p.white,p.dark?.04:.20));
      line(c,[[x+4,top],[x+4,sill],[x+span-5,sill]],alpha(p.metal,.30),1.4);
      line(c,[[x+span*.51,top],[x+span*.51,sill]],alpha(p.metal,.27),1.2);
      line(c,[[x+4,(top+sill)/2],[x+span-5,(top+sill)/2]],alpha(p.metal,.20));
      shape(c,[[x-5,0],[x+1,0],[x+span*.48,top],[x+span*.39,top]],alpha(p.metal,.24));
    }
    line(c,[[0,top],[w,top]],alpha(p.metal,.44),2);
    line(c,[[0,sill+2],[w,sill+2]],alpha(p.metal,.36),2.2);
    const padTop=horizon*.73, boardHt=horizon-padTop;
    const slatTop=sill+4,slatBottom=padTop-3;
    c.fillStyle=gradient(c,slatTop,slatBottom,mix(p.wall,p.timber,.13),mix(p.wall,p.timber,.26));
    c.fillRect(0,slatTop,w,slatBottom-slatTop);
    for(let x=0;x<w;x+=Math.max(5,s*.13))line(c,[[x,slatTop],[x,slatBottom]],alpha(p.metal,p.dark?.13:.09),1);
    line(c,[[0,padTop-3],[w,padTop-3]],alpha(p.orange,.71),2);
    c.fillStyle=gradient(c,padTop,horizon,shade(p.pad,.12),shade(p.pad,-.16));c.fillRect(0,padTop,w,boardHt);
    for(let x=0;x<w;x+=Math.max(24,s*.65)){
      line(c,[[x,padTop+2],[x,horizon-1]],alpha(p.deep,.46),2);
      line(c,[[x+1.7,padTop+2],[x+1.7,horizon-1]],alpha(p.white,.15));
    }
    c.fillStyle=gradient(c,horizon,h,shade(p.timber,p.dark?-.24:-.11),shade(p.timber,p.dark?.18:.23));
    c.fillRect(0,horizon,w,h-horizon);
    for(let j=0;j<11;j++){
      const y=horizon+(h-horizon)*(j/10)**1.42, y1=horizon+(h-horizon)*((j+1)/10)**1.42;
      const plank=Math.max(41,(y1-y)*8);
      for(let i=-1;i<Math.ceil(w/plank)+1;i++){
        const x=(i+(j%3)*.30)*plank, k=Math.sin(i*71+j*43);
        c.fillStyle=alpha(k>0?p.white:p.deep,.04+Math.abs(k)*.045);c.fillRect(x,y,plank,y1-y);
        line(c,[[x,y],[x+plank,y],[x+plank,y1]],alpha(p.deep,.14),.7);
        if(y1-y>5) line(c,[[x+3,y+(y1-y)*.63],[x+plank*.80,y+(y1-y)*.67]],alpha(p.deep,.10),.7);
      }
    }
    const marking=alpha(p.white,.85);
    if(mode==='shot'){
      const at=courtView(f),d=state.p.distance,ft=d-4.225,base=d+1.575;
      const quad=(x0,x1,z0,z1)=>[at(x0,0,z0),at(x1,0,z0),at(x1,0,z1),at(x0,0,z1)];
      shape(c,quad(ft,base,-2.45,2.45),alpha(p.pad,.26),marking,1.6);
      const arc=(center,r,a,zSpan,beta)=>Array.from({length:71},(_,i)=>{
        const t=a+(beta-a)*i/70;return at(center-r*Math.cos(t),0,r*Math.sin(t)*zSpan);
      });
      const join=Math.asin(6.6/6.75);
      line(c,[at(base,0,-6.6),...arc(d,6.75,-join,1,join),at(base,0,6.6)],marking,Math.max(1.45,s*.045));
      line(c,arc(d,1.275,-Math.PI/2,1,Math.PI/2),marking,1.2);
      line(c,arc(ft,1.8,-Math.PI/2,1,Math.PI/2),marking,1.35);
      line(c,arc(ft,1.8,Math.PI/2,1,Math.PI*1.5),alpha(p.white,.65),1,[3,4]);
      line(c,[at(base,0,-7.5),at(base,0,7.5)],marking,1.5);
    }
    const beam=c.createLinearGradient(0,0,w,h);beam.addColorStop(0,alpha(p.white,0));beam.addColorStop(.5,alpha(p.white,p.dark?.035:.09));beam.addColorStop(1,alpha(p.white,0));
    shape(c,[[w*.24,sill],[w*.48,sill],[w*.20,h],[-w*.20,h]],beam);
    line(c,[[0,horizon],[w,horizon]],alpha(p.deep,.37),1.5);
    // A pair of sideline benches sits behind the shooting plane.
    const benchW=Math.min(w*.14,s*1.65),bh=Math.max(5,s*.21);
    for(const left of [w*.05,w*.66]){
      const by=horizon+bh*.13;
      for(const q of [.16,.84])line(c,[[left+q*benchW,by-bh*.45],[left+q*benchW,by+bh*.21]],alpha(p.metal,.82),Math.max(1,bh*.12));
      for(const by2 of [by-bh,by-bh*.44]) {
        line(c,[[left,by2],[left+benchW,by2]],shade(p.timber,-.35),Math.max(1.6,bh*.22));
        line(c,[[left,by2-bh*.075],[left+benchW,by2-bh*.075]],shade(p.timber,.29),Math.max(.7,bh*.07));
      }
    }
  }

  function courtRig(c,f) {
    const at=courtView(f),s=f.scale, d=state.p.distance, board=d+C.court.boardOffset,p=palette;
    const rod=(a,b,w,col)=>{line(c,[at(...a),at(...b)],p.deep,w+1.6);line(c,[at(...a),at(...b)],col,w);};
    const feet=at(board+1.02,0);
    D.contactShadow(c,...feet,s*.75,0);
    shape(c,[[board+.4,.04],[board+1.42,.04],[board+1.35,.37],[board+.66,.43]].map(v=>at(...v)),p.pad,p.deep);
    rod([board+1.03,.38],[board+.94,2.74],Math.max(3,s*.14),p.metal);
    rod([board+.95,2.35],[board+.04,3.45],Math.max(2,s*.085),p.metal);
    rod([board+.95,2.72],[board+.04,3.48],Math.max(1.8,s*.07),shade(p.metal,.22));
    for(const [x,y] of [[board+.95,2.72],[board+.05,3.45],[board+1.02,.40]]){
      ellipse(c,...at(x,y),Math.max(1,s*.043),Math.max(1,s*.043),shade(p.metal,.52),p.deep,.8);
    }
    const panel=(y,dy,half)=>[at(board,y,-half),at(board,y,half),at(board,y+dy,half),at(board,y+dy,-half)];
    shape(c,panel(C.court.boardBottom,C.court.boardHeight,C.court.boardWidth/2),alpha(shade(p.path,.60),.43),p.metal,Math.max(2,s*.055));
    const spot=state.result.station;
    if(Math.abs(C.court.boardOffset*spot.s/spot.c)<=C.court.boardWidth/2){
      const cut=d+C.court.boardOffset/spot.c;
      line(c,[f.at(cut,C.court.boardBottom),f.at(cut,C.court.boardBottom+C.court.boardHeight)],alpha(p.white,.8),1,[3,3]);
    }
    const outside=panel(C.court.boardBottom+.04,C.court.boardHeight-.08,.86);
    line(c,[...outside,outside[0]],p.white,1.3);
    const target=panel(C.rimHeight,.45,.295);line(c,[...target,target[0]],p.white,1.4);
    line(c,[at(d+.21,C.rimHeight),at(board,C.rimHeight)],p.orange,Math.max(2,s*.04));
    const loop=(phi,y,r)=>at(d+r*Math.cos(phi),y,r*Math.sin(phi));
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;
      for(const twist of [-1,1]) {
        const net=[loop(a,C.rimHeight,.225),loop(a+twist*.27,2.88,.190),loop(a+twist*.58,2.71,.144),loop(a+twist*.80,2.64,.128)];
        line(c,net,alpha(p.deep,.48),1.8);line(c,net,alpha(p.white,.92),.95);
      }
    }
    const hoop=Array.from({length:45},(_,i)=>loop(i*Math.PI/22,C.rimHeight,C.rimRadius));
    line(c,hoop,p.deep,Math.max(3,s*.06));line(c,hoop,p.orange,Math.max(2,s*.045));
  }
  function player(c,f) {
    const h=state.p.height,s=f.scale,p=palette,at=f.at;
    const hip=Math.min(.88,.39+h*.27), shoulder=Math.min(1.52,.68+h*.36), head=shoulder+.20;
    const limb=(pts,ink,metres)=>line(c,pts.map(v=>at(...v)),ink,Math.max(1.4,s*metres));
    const poly=(pts,ink,edge)=>shape(c,pts.map(v=>at(...v)),ink,edge,1);
    const foot=at(-.48,0);D.contactShadow(c,...foot,.48*s,0);
    limb([[-.55,hip],[-.76,hip*.45],[-.84,.105]],shade(p.skin,-.22),.115);
    limb([[-.37,hip],[-.21,hip*.48],[-.32,.09]],p.skin,.14);
    for(const x of [-.84,-.32]){
      poly([[x-.10,.03],[x+.19,.03],[x+.19,.071],[x+.04,.13],[x-.07,.115]],p.white,p.deep);
      limb([[x-.05,.12],[x-.045,.22]],p.white,.088);
    }
    poly([[-.61,hip+.13],[-.30,hip+.13],[-.22,hip-.14],[-.39,hip-.20],[-.48,hip-.06],[-.56,hip-.21],[-.72,hip-.13]],p.deep,p.deep);
    limb([[-.69,hip-.13],[-.58,hip-.18]],p.white,.024);
    limb([[-.55,shoulder-.04],[-.77,shoulder-.31],[-.45,shoulder-.43]],shade(p.skin,-.24),.103);
    const torso=[[-.63,hip+.03],[-.64,shoulder-.09],[-.55,shoulder+.035],[-.44,shoulder+.015],[-.34,shoulder-.08],[-.33,hip+.035]];
    poly(torso,p.jersey,p.deep);
    poly([[-.63,hip+.04],[-.62,shoulder-.14],[-.54,shoulder-.24],[-.50,hip+.04]],shade(p.jersey,-.17));
    limb([[-.58,hip+.06],[-.58,shoulder-.17]],shade(p.jersey,.40),.038);
    limb([[-.52,shoulder+.025],[-.44,shoulder-.07],[-.39,shoulder-.025]],p.white,.030);
    const neck=at(-.48,shoulder+.07);ellipse(c,...neck,.073*s,.11*s,p.skin);
    const face=at(-.48,head);
    ellipse(c,...face,.115*s,.144*s,p.skin,p.deep,.8);
    poly([[-.60,head-.01],[-.61,head+.085],[-.55,head+.15],[-.44,head+.15],[-.36,head+.08],[-.40,head+.041],[-.50,head+.06],[-.56,head-.045]],p.deep);
    poly([[-.385,head+.034],[-.34,head-.008],[-.39,head-.021]],p.skin);
    ellipse(c,...at(-.52,head-.015),s*.028,s*.038,shade(p.skin,-.15));
    ellipse(c,...at(-.39,head+.021),Math.max(.48,s*.009),Math.max(.45,s*.008),p.deep);
    const elbow=[-.19,shoulder+(h-shoulder)*.36-.09], hand=[-.025,Math.max(.025,h-.09)];
    limb([[-.39,shoulder-.075],elbow,hand],p.deep,.13);limb([[-.39,shoulder-.075],elbow,hand],p.skin,.101);
    limb([[-.095,hand[1]-.12],[-.058,hand[1]-.055]],p.white,.105);
    limb([hand,[.02,h-.047]],p.skin,.064);
  }
  function ballArt(c,x,y,r,angle=0) {
    const p=palette,soft=mode==='throw', ink=p.deep;
    const shell=soft?p.softball:p.ball;
    const g=c.createRadialGradient(x-r*.34,y-r*.44,r*.06,x,y,r);
    g.addColorStop(0,shade(shell,.5));g.addColorStop(.47,shell);g.addColorStop(1,shade(shell,-.43));
    ellipse(c,x,y,r,r,g,alpha(p.deep,.67),.85);
    c.save();c.beginPath();c.arc(x,y,r,0,2*Math.PI);c.clip();c.translate(x,y);c.rotate(angle);
    c.strokeStyle=soft?p.orange:p.deep;c.lineWidth=Math.max(.65,r*.085);
    if(soft)c.setLineDash([Math.max(1,r*.24),Math.max(.75,r*.11)]);
    for(const sign of [-1,1]){
      c.beginPath();c.moveTo(-r*.8,sign*r*.77);
      c.bezierCurveTo(-r*.3,sign*r*.14,r*.32,sign*r*.14,r*.83,sign*r*.77);c.stroke();
    }
    if(!soft){
      line(c,[[-r,-r*.08],[r,r*.08]],ink,Math.max(.65,r*.082));
      c.beginPath();c.ellipse(-r*.01,0,r*.18,r*1.04,-.20,0,2*Math.PI);c.stroke();
    }
    c.restore();
  }
  function instrument(id,paint) {
    const canvas=$(id),w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2),pw=Math.round(w*dpr),ph=Math.round(h*dpr);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
    paint(c,w,h);
  }
  let closeTrace=null,closeResult=null;
  function instruments(){
    if(!state || mode!=='shot'||document.hidden)return;
    const d=state.data,p=palette;
    instrument('projection',(c,w,h)=>{
      const r=Math.min(w*.37,h*.42),cx=w/2,cy=h/2,scale=r/C.rimRadius;
      c.fillStyle=p.bg;c.fillRect(0,0,w,h);
      if(!d.crossing){line(c,[[cx-6,cy],[cx+6,cy]],p.muted,2);return;}
      const b=d.opening*scale/2, y=cy-d.viewOffset*scale,br=C.ballRadius*scale;
      const cross=d.crossing, horizontal=Math.hypot(cross.worldVx||0,cross.worldVz||0);
      const x=cx+(horizontal?(cross.worldZ*cross.worldVx-cross.worldX*cross.worldVz)/horizontal*scale:0);
      ellipse(c,cx,cy,r,Math.max(.5,b),alpha(p.orange,.12),p.orange,2.3);
      line(c,[[cx-4,cy],[cx+4,cy]],p.ink);line(c,[[cx,cy-4],[cx,cy+4]],p.ink);
      if(y+br>=0&&y-br<=h){
        c.setLineDash(d.rimHit?[3,3]:[]);ellipse(c,x,y,br,br,alpha(p.path,.24),p.path,1.8);c.setLineDash([]);
        ellipse(c,x,y,2.2,2.2,p.path);
      }else{
        const edge=y<0?7:h-7,sign=y<0?-1:1;
        line(c,[[cx-4,edge-sign*4],[cx,edge],[cx+4,edge-sign*4]],p.path,2);
      }
    });
    instrument('closeCam',(c,w,h)=>{
      const scale=w*.72,mid=w*.47,ry=h*.47,X=x=>mid+(x-d.distance)*scale,Y=y=>ry-(y-C.rimHeight)*scale;
      c.fillStyle=gradient(c,0,h,p.wall,p.pad);c.fillRect(0,0,w,h);
      const x0=X(d.distance-C.rimRadius),x1=X(d.distance+C.rimRadius),board=X(d.distance+C.court.boardOffset/d.station.c);
      line(c,[[board,Y(3.82)],[board,Y(C.court.boardBottom)]],p.white,4);
      line(c,[[x1,ry+2],[board,ry+2]],p.orange,3);
      // The crossed cords taper from the rim to the narrow bottom of the net.
      for(let j=0;j<12;j++){
        for(const sign of [-1,1]){
          const path=[[C.rimRadius,0],[.196,.105],[.164,.215],[.134,.325],[.125,.39]].map(([r,drop],i)=>{
            const theta=j*Math.PI/6+sign*i*Math.PI/12;
            return [mid+r*Math.cos(theta)*scale,ry+drop*scale];
          });
          line(c,path,alpha(p.white,j<6?.88:.46),j<6?1.1:.8);
        }
      }
      if(closeResult!==state.result){
        closeResult=state.result;closeTrace=C.displayPath(closeResult,320).map(q=>projected(closeResult,q));
      }
      const pts=closeTrace.filter(q=>Math.abs(X(q[0])-mid)<w*.70&&Math.abs(Y(q[1])-ry)<h*.9);
      line(c,pts.map(q=>[X(q[0]),Y(q[1])]),alpha(p.path,.85),1.5);
      line(c,[[x0,ry],[x1,ry]],p.orange,3);
      const sample=d.rimHit||d.crossing||{x:d.R,y:0};
      const pos=flight&&clock>=0?ball:[sample.x,sample.y];
      if(pos)ballArt(c,X(pos[0]),Y(pos[1]),C.ballRadius*scale,.24);
      for(const x of [x0,x1])ellipse(c,x,ry,2.5,2.5,p.orange,p.deep,1);
      if(d.rimHit&&(!flight||clock>=d.rimHit.t)){
        const x=d.rimHit.side==='front'?x0:x1;
        for(const sign of [-1,1])line(c,[[x-4,ry+sign*4],[x+4,ry-sign*4]],p.white,1.5);
      }
    });
  }
  function outlineTrack(c,f,track) {
    if(track.result.path){
      const r=track.result,pts=C.displayPath(r,400);
      let linePoints=[],outside=false;
      function stroke(){if(linePoints.length>1)line(c,linePoints,alpha(track.ink,track.opacity*(outside?.50:1)),outside?1.8:2.3,outside?[5,4]:track.dash||[]);}
      for(let i=0;i<pts.length;i++){
        const q=projected(state.result,pts[i]),xy=f.at(q[0],q[1]),away=Math.abs(q[3])>.02;
        if(away!==outside){linePoints.push(xy);stroke();linePoints=[xy];outside=away;}else linePoints.push(xy);
      }
      stroke();return;
    }
    const pts=track.result.points, str=Math.max(1,Math.floor(pts.length/420)), xy=[];
    for(let i=0;i<pts.length;i++) if(i%str===0||i===pts.length-1||Math.abs(pts[i][2]-(track.result.board?.t??-9))<1e-8)xy.push(f.at(pts[i][0],pts[i][1]));
    c.save();c.globalAlpha=track.opacity;
    if(!track.dash)line(c,xy,alpha(palette.bg,.85),4.6);
    line(c,xy,track.ink,track.dash?1.8:2.65,track.dash||[]);c.restore();
  }
  function scaleMarks(c,f) {
    const {w,h,at,scale:s}=f, d=state.p.distance,p=palette;
    if(mode==='shot'){
      const textSize=font(Math.max(11,Math.min(13,h*.055)),600);
      const marks=[[d-C.court.threePoint,T('三分','3PT')+' 6.75 m'],[d-C.court.freeThrow,T('罰球','FT')+' 4.23 m']];
      let previous=null;
      for(const [distance,name] of marks){
        const [x,y]=distance===d-C.court.freeThrow?courtView(f)(distance,0):at(distance,0);
        c.font=textSize;
        const metrics=c.measureText(name),width=metrics.width+12;
        const left=Math.max(previous?previous.x+previous.w+5:4,Math.min(w-4-width,x-width/2));
        const bottom=h-4;
        const top=bottom-D.textHeight(metrics,15*fontScale)-3;
        const anchor=Math.max(left+5,Math.min(left+width-5,x));
        line(c,[[x,y+1],[anchor,y>bottom?bottom:top]],alpha(p.deep,.62),1,[2,3]);
        previous=D.pill(c,name,left,bottom,p.ink,'left',textSize);
      }
    } else {
      const step=s>44?1:s>18?2:5;
      for(let v=0;at(v,0)[0]<w-18;v+=step){
        const [x,y]=at(v,0);
        line(c,[[x,y+2],[x,y+7]],p.deep,1.2);
        D.haloText(c,v+' m',x,y+20,p.ink,'center','middle',font(13));
      }
    }
  }
  function drawStatic(f) {
    const c=brush,{w,h}=f,p=palette;
    room(c,f);if(mode==='shot')courtRig(c,f);
    player(c,f);scaleMarks(c,f);
    for(const tr of tracks())outlineTrack(c,f,tr);
    const d=state.data, hit=d.rimHit||d.board;
    if(mode==='shot'){
      const left=7,interval=f.scale>=31?1:f.scale>=16?2:5;
      const maxY=(f.baseline-24)/f.scale;
      for(let y=0;y<=maxY;y+=interval){
        const py=f.at(0,y)[1];
        line(c,[[left,py],[left+5,py]],alpha(p.ink,.65));
        D.haloText(c,y+' m',left+8,py,p.muted,'left','middle',font(13));
      }
      if(d.crossing && Math.abs(d.crossing.x-d.distance)<.42){
        const [x,y]=f.at(d.crossing.x,C.rimHeight),r=w<480?15:23;
        const fromBoard=d.crossing.vx<0,sign=fromBoard?1:-1;
        const a=d.crossing.angle*rad;
        line(c,[[x+sign*r*1.5,y],[x,y],[x+sign*r*1.4*Math.cos(a),y-r*1.4*Math.sin(a)]],alpha(p.ink,.70),1,[3,3]);
        c.beginPath();c.arc(x,y,r,fromBoard?-a:Math.PI,fromBoard?0:Math.PI+a);
        c.strokeStyle=p.orange;c.lineWidth=1.8;c.stroke();
      }
    }
    if(hit){
      const xy=f.at(hit.x,hit.y);ellipse(c,...xy,4.2,4.2,p.bg,p.orange,2);
    }
    if(mode==='throw'){
      const lw=138*fontScale,lx=w-lw-8;
      D.roundRect(c,lx,8,lw,46*fontScale,9);c.fillStyle=alpha(p.bg,.94);c.fill();c.strokeStyle=alpha(p.metal,.42);c.lineWidth=1;c.stroke();
      ballArt(c,lx+22,31,13,-.43);
      D.haloText(c,T('壘球直徑','Softball size'),lx+43,22,p.muted,'left','middle',font(13,600));
      D.haloText(c,'9.7 cm',lx+43,40*fontScale,p.ink,'left','middle',font(15,700));
      const x=f.at(d.R,0)[0], y=f.baseline;
      line(c,[[x,y],[x,y-15]],p.path,2);
      shape(c,[[x,y-15],[x+10,y-13],[x,y-9]],p.path);
      D.pill(c,T('落點 ','Landing ')+num(d.R)+' m',Math.min(w-4,Math.max(110,x+9)),Math.max(32,y-22),p.path,'right',font(13,600));
    }
  }
  function arrowXY(f) {
    const d=state.p, [x,y]=f.at(0,d.height), len=d.speed*f.arrowScale;
    return {x,y,tx:x+Math.cos(d.angle*rad)*len,ty:y-Math.sin(d.angle*rad)*len};
  }
  function draw() {
    instruments();
    if(world||!state||document.hidden)return;
    const w=cv.clientWidth,h=cv.clientHeight;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2),px=Math.round(w*dpr),py=Math.round(h*dpr);
    if(cv.width!==px||cv.height!==py){cv.width=layer.width=px;cv.height=layer.height=py;bgValid=false;}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if(!bgValid){
      layout=frozen||frameFor(w,h);brush.setTransform(dpr,0,0,dpr,0,0);drawStatic(layout);bgValid=true;
    }
    ctx.drawImage(layer,0,0,w,h);
    const f=layout, a=arrowXY(f);
    D.arrow(ctx,a.x,a.y,a.tx,a.ty,palette.orange,hover||grab?3.2:2.6);
    ellipse(ctx,a.tx,a.ty,hover||grab?10:8,hover||grab?10:8,alpha(palette.bg,.85),palette.orange,2);
    ellipse(ctx,a.tx,a.ty,2.8,2.8,palette.orange);
    $('aim').style.left=a.tx+'px';$('aim').style.top=a.ty+'px';
    const pos=ball||[0,state.p.height],xy=f.at(pos[0],pos[1]);
    const radius=C.balls[mode].diameter*f.scale/2;
    const lateral=pos[3]||0;
    ballArt(ctx,...xy,radius*Math.max(.83,Math.min(1.17,1+.055*lateral)),clock*5*Math.PI);
    if(Math.abs(lateral)>.02)D.pill(ctx,T('離開投籃平面','Out of shot plane'),w-5,h-5,palette.ink,'right',font(11,600));
    if(impactMark && !D.reducedMotion()){
      const u=(performance.now()-impactMark.start)/260;
      D.ripple(ctx,...f.at(impactMark.x,impactMark.y),Math.max(7,radius),u,palette.orange);
      if(u>=1)impactMark=null;
    }
  }
  function redraw(geometry=true) {
    bgValid=false;drawMap();
    if(world){if(geometry)world.refresh(state,tracks(),palette);if(flight&&clock<0)world.prepare(1+clock/.32);else if(ball)world.move(ball,clock);else world.prepare(0);instruments();}
    else draw();
  }
  function stop() {
    cancelAnimationFrame(frame);frame=0;flight=null;ball=null;impactMark=null;clock=stamp=eventIndex=0;replaying=false;
  }
  function update() {
    if(batching)return;
    stop();completed=null;compared=null;state=compute();$('feedback').textContent='';
    updateDisplay();redraw();
    settings[mode]={...state.p};
    try{localStorage.setItem(prefsKey,JSON.stringify({mode,settings}));}catch{}
  }
  function cue(type,speedIn=0) {
    if(!window.LabSound.enabled())return;
    if(type==='net')LabSound.noise({filter:3300,q:.75,dur:.15,gain:.38,attack:.018});
    if(type==='floor')LabSound.tone({type:'sine',freq:270,dur:.08,gain:Math.min(.38,speedIn*.04)});
    if(type==='rim')LabSound.tone({type:'triangle',freq:1140,dur:.24,gain:.26});
    if(type==='board')LabSound.tone({type:'triangle',freq:285,dur:.09,gain:.42});
  }
  function animate(now) {
    if(!flight||document.hidden)return;
    clock=Math.min(flight.T,clock+(stamp?Math.min((now-stamp)/1000,1/30):0)*.60);stamp=now;
    if(clock<0){world?.prepare(1+clock/.32);frame=requestAnimationFrame(animate);return;}
    while(eventIndex<flight.events.length && flight.events[eventIndex].t<=clock+.000001){
      const e=flight.events[eventIndex++],type=e.type;
      cue(type,e.speedIn);
      if(world)world.contact(e);
      const hit=flight.station?{x:projected(flight,[e.x,e.y,e.z,e.t])[0],y:e.y}:null;
      if(hit&&!world&&!D.reducedMotion())impactMark={x:hit.x,y:hit.y,start:performance.now()};
    }
    const pts=flight.points;
    while(flight.i<pts.length-1 && pts[flight.i][2]<clock)flight.i++;
    const b=pts[flight.i],a=pts[Math.max(0,flight.i-1)],dt=b[2]-a[2],u=dt?Math.max(0,Math.min(1,(clock-a[2])/dt)):0;
    ball=a.map((v,i)=>v+(b[i]-v)*u);
    if(world){world.move(ball,clock);instruments();}else draw();
    if(clock>=flight.T){
      finish();
      if(impactMark)frame=requestAnimationFrame(function fade(){
        if(document.hidden||world||D.reducedMotion()){impactMark=null;return;}
        draw();if(impactMark)frame=requestAnimationFrame(fade);
      });
    } else frame=requestAnimationFrame(animate);
  }
  function finish(){
    flight=null;completed=state;
    if(!replaying){
      if(state.data.trialRole==='reference')reference=state;
      history.push(state);if(history.length>3)history.shift();
    }
    replaying=false;updateDisplay();redraw();
    let next=T('可以記錄這一球。','Record this result.');
    if(state.data.trialRole==='reference')next=T('改變條件，再出手比較。','Change a condition, then release for comparison.');
    if(state.data.trialRole==='comparison')next=canCompare()?T('可以比較兩球。','Compare the two releases.'):
      T('先投基準球，再用不同條件出手。','Shoot a reference, then release under different conditions.');
    const r=state.result;
    let ending='';
    if(mode==='shot'){
      const floors=r.contacts.filter(e=>e.type==='floor').length;
      const passage=r.final.made?T('球穿過籃網','The ball went through the net'):T('球沒有進網','The ball missed the basket');
      const floorText=floors?T('，落地 '+floors+' 次',', with '+floors+(floors===1?' floor contact':' floor contacts')):'';
      const reason={rest:T('球已停下','The ball came to rest'),out:T('球已越過半場外的界限','The ball left the half-court buffer'),
        time:T('已播放到首次接觸後 6 秒','Playback reached six seconds after first contact')}[r.final.reason];
      ending=passage+floorText+T('。','. ')+reason+T('。','. ');
    }
    $('feedback').textContent=outcome(state.data)+T('。','. ')+(ending?'\n'+ending:'')+next;
  }
  function release(action='release') {
    const replay=action==='replay';
    if(flight){if(action==='release')skipFlight();return;}
    if(replay && completed!==state)return;
    stop();replaying=replay;completed=null;
    if(!replay){
      const trialRole=action==='reference'?'reference':reference?'comparison':'single';
      state={...state,data:{...state.data,trialRole},recordFocus:null,against:trialRole==='comparison'?reference:null};
      compared=null;
    }
    world?.frameRelease();
    if(!replay && D.reducedMotion()){
      skipFlight();return;
    }
    const r=state.result;
    flight={station:r.station,distance:r.distance,T:r.final?.tEnd??r.T,events:r.contacts??r.events,points:playback(r),i:0};clock=world?-.32:0;world?.prepare(0);updateDisplay();
    $('feedback').textContent=T('球已出手。','Ball in flight.');frame=requestAnimationFrame(animate);
  }
  function skipFlight(){
    cancelAnimationFrame(frame);const r=state.result;
    ball=r.path?projected(r,r.path.at(-1)):r.points.at(-1);clock=r.final?.tEnd??r.T;finish();
  }
  function record(pair) {
    if(completed!==state || (pair?!canCompare():state.data.trialRole!=='single'))return;
    if(pair){compared={current:state,reference};updateDisplay();redraw();}
    state.recordFocus??=pair||mode!=='shot'?'auto':$('recordFocus').value;
    window.LabMission?.emit('recorded',{...state.data,focus:state.recordFocus,prior:pair?reference.data:null});
    $('feedback').textContent=pair?T('已記錄這一組比較。','Comparison recorded.'):T('已記錄這一球。','Result recorded.');
  }
  function soundButton(){
    const on=LabSound.enabled();$('soundBtn').setAttribute('aria-pressed',String(on));
    $('soundBtn').textContent=on?T('音效開','Sound on'):T('音效關','Sound off');
  }
  function close3D(message='') {
    viewToken++;world?.dispose();world=null;
    $('view3').hidden=$('cameraControls').hidden=true;$('view2').hidden=false;
    $('view2d').setAttribute('aria-pressed','true');$('view3d').setAttribute('aria-pressed','false');
    $('viewMsg').textContent=message;$('viewMsg').hidden=!message;updateDisplay();redraw();
  }
  async function open3D(){
    if(world)return;
    const id=++viewToken;$('viewMsg').hidden=false;$('viewMsg').textContent=T('載入體育館…','Loading the gym…');
    try{
      const {createGym}=await import('./basketball-shot-3d.js');
      if(id!==viewToken)return;
      $('view2').hidden=true;$('view3').hidden=$('cameraControls').hidden=false;
      world=createGym($('view3'),T,()=>close3D(T('3D 顯示中斷，已切回側面圖。','3D context lost. Side view restored.')),$('navigation3d'));
      $('view2d').setAttribute('aria-pressed','false');$('view3d').setAttribute('aria-pressed','true');
      $('viewMsg').hidden=true;redraw();camera('side');updateDisplay();
    }catch{
      if(id===viewToken)close3D(T('目前無法載入體育館，已切回側面圖。','The gym could not open. Side view restored.'));
    }
  }
  function camera(name) {
    world?.preset(name);
    $('resetCam').setAttribute('aria-pressed',String(name==='side'));
    $('backCam').setAttribute('aria-pressed',String(name==='back'));
    $('ballCam').setAttribute('aria-pressed',String(name==='ball'));
  }
  function changeMode(next) {
    if(next===mode)return;
    settings[mode]={...state.p};mode=next;reference=null;
    const saved=settings[next]||{speed:next==='shot'?7.3:11,angle:next==='shot'?55:38,height:next==='shot'?2:1.6,distance:4.23,bearing:0,drag:false};
    batching=true;keys.forEach(k=>N.set($(k),saved[k]));$('drag').checked=saved.drag;batching=false;
    document.querySelectorAll('#modes button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    update();
  }
  function setSpot(distance,bearing){
    batching=true;
    N.set($('distance'),Math.round(Math.min(9,Math.max(2,distance))*100)/100);
    N.set($('bearing'),Math.max(-80,Math.min(80,Math.round(bearing))));
    batching=false;update();
  }
  const mapScale=8.4;
  function mapPoint(x,z){return [75+z*mapScale,11+(1.575-x)*mapScale];}
  function drawMap(){
    const canvas=$('mapCanvas'),p=palette;
    if(mode!=='shot'||canvas.hidden)return;
    const c=canvas.getContext('2d'),spot=state.result.station;
    c.setTransform(2,0,0,2,0,0);
    c.fillStyle=p.pad;c.fillRect(0,0,150,140);
    const mark=(pts,ink=p.white,width=1)=>line(c,pts.map(([x,z])=>mapPoint(x,z)),ink,width);
    const arc=(cx,r,angle)=>Array.from({length:61},(_,i)=>[cx-r*Math.cos((i/30-1)*angle),r*Math.sin((i/30-1)*angle)]);
    mark([[1.575,-7.5],[-12.425,-7.5],[-12.425,7.5],[1.575,7.5],[1.575,-7.5]]);
    shape(c,[[1.575,-2.45],[-4.225,-2.45],[-4.225,2.45],[1.575,2.45]].map(v=>mapPoint(...v)),alpha(p.timber,.75),p.white,1);
    mark([[1.575,-6.6],...arc(0,6.75,Math.asin(6.60/6.75)),[1.575,6.6]]);
    mark(arc(0,1.275,Math.PI/2));mark(arc(-4.225,1.8,Math.PI/2));
    mark([[.375,-.9],[.375,.9]],p.white,2);ellipse(c,...mapPoint(0,0),2.2,2.2,p.orange);
    if(completed===state){
      const landing=state.result.contacts.find(e=>e.type==='floor');
      if(landing)ellipse(c,...mapPoint(landing.x,landing.z),3,3,null,p.white,1.5);
      const [x,z]=state.result.final.restAt,[mx,my]=mapPoint(x,z);
      line(c,[[mx-3,my-3],[mx+3,my+3]],p.ref,2);line(c,[[mx+3,my-3],[mx-3,my+3]],p.ref,2);
    }
    mark([[spot.x,spot.z],[0,0]],alpha(p.path,.8),1);
    ellipse(c,...mapPoint(spot.x,spot.z),4.3,4.3,p.path,p.deep,1.6);
  }
  $('mapCanvas').width=300;$('mapCanvas').height=280;
  function dragSpot(e){
    const rect=$('mapCanvas').getBoundingClientRect();
    const z=((e.clientX-rect.left)*150/rect.width-75)/mapScale, x=1.575-((e.clientY-rect.top)*140/rect.height-11)/mapScale;
    setSpot(Math.hypot(x,z),Math.atan2(z,-x)/rad);
  }
  $('mapCanvas').onpointerdown=e=>{if(e.button===0){e.currentTarget.setPointerCapture(e.pointerId);dragSpot(e);}};
  $('mapCanvas').onpointermove=e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))dragSpot(e);};
  $('toggleMap').onclick=()=>{const map=$('mapCanvas');map.hidden=!map.hidden;$('toggleMap').setAttribute('aria-expanded',String(!map.hidden));drawMap();};
  $('spots').onclick=e=>{const spot=e.target.closest('[data-spot]');if(spot)setSpot(...spot.dataset.spot.split(',').map(Number));};
  const prefsKey='basketball-shot-settings-v2';
  function applyRelease(saved){
    if(!saved||!['shot','throw'].includes(saved.mode))return;
    batching=true;mode=saved.mode;
    for(const k of keys){
      const el=$(k),value=Number(saved[k]??el.defaultValue);
      if(Number.isFinite(value))N.set(el,Math.min(+el.max,Math.max(+el.min,value)));
    }
    $('drag').checked=saved.drag===true;batching=false;
    document.querySelectorAll('#modes button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
  }
  (window.LAB_SHARE_EXTRAS=window.LAB_SHARE_EXTRAS||[]).push({get:()=>({...state.p}),set:p=>{applyRelease(p);update();}});
  function setAim(angle,speed) {
    batching=true;N.set($('angle'),angle);N.set($('speed'),speed);batching=false;update();
  }
  $('aim').addEventListener('pointerdown',e=>{
    if(grab||e.button!==0||!layout)return;
    const a=arrowXY(layout),r=cv.getBoundingClientRect();
    grab={id:e.pointerId,dx:e.clientX-r.left-a.tx,dy:e.clientY-r.top-a.ty};frozen=layout;
    $('aim').setPointerCapture(e.pointerId);draw();e.preventDefault();
  });
  $('aim').addEventListener('pointermove',e=>{
    if(!grab||grab.id!==e.pointerId)return;
    const r=cv.getBoundingClientRect(),[x,y]=frozen.at(0,state.p.height);
    const dx=e.clientX-r.left-grab.dx-x,dy=y-(e.clientY-r.top-grab.dy);
    setAim(Math.atan2(dy,dx)/rad,Math.hypot(dx,dy)/frozen.arrowScale);
  });
  function endDrag(e){if(grab?.id===e.pointerId){grab=frozen=null;bgValid=false;draw();}}
  $('aim').addEventListener('lostpointercapture',endDrag);
  $('aim').addEventListener('pointerup',endDrag);$('aim').addEventListener('pointercancel',endDrag);
  $('aim').addEventListener('pointerenter',()=>{hover=true;draw();});
  $('aim').addEventListener('pointerleave',()=>{hover=false;draw();});
  $('aim').addEventListener('keydown',e=>{
    const delta={ArrowUp:[1,0],ArrowDown:[-1,0],ArrowRight:[0,.1],ArrowLeft:[0,-.1]}[e.key];
    if(delta){e.preventDefault();setAim(state.p.angle+delta[0],state.p.speed+delta[1]);}
  });
  keys.forEach(k=>$(k).addEventListener('input',update));$('drag').addEventListener('input',update);
  document.querySelectorAll('#modes button').forEach(b=>b.addEventListener('click',()=>changeMode(b.dataset.mode)));
  $('play').addEventListener('click',()=>release());$('replay').addEventListener('click',()=>release('replay'));$('record').addEventListener('click',()=>record(false));
  $('compare').addEventListener('click',()=>record(true));
  $('reference').addEventListener('click',()=>release('reference'));
  $('clearReference').addEventListener('click',()=>{reference=null;compared=null;updateDisplay();redraw();});
  $('clearAll').addEventListener('click',()=>{stop();history.length=0;reference=completed=compared=null;updateDisplay();redraw();$('feedback').textContent=T('軌跡和基準球已清除。','Trails and reference cleared.');});
  $('view2d').addEventListener('click',()=>close3D());$('view3d').addEventListener('click',open3D);
  $('resetCam').addEventListener('click',()=>camera('side'));
  $('backCam').addEventListener('click',()=>camera('back'));
  $('ballCam').addEventListener('click',()=>camera('ball'));
  $('soundBtn').addEventListener('click',()=>LabSettings.set('sound',!LabSound.enabled()));
  function applySettings(){
    soundButton();fontScale=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||1;
    const preview=document.querySelector('.lab-set-preview');
    if(preview&&document.documentElement.lang==='en'){
      preview.textContent='Sample text Physics';
      for(const [lang,name] of [['zh-Hant','Traditional Chinese'],['zh-Hans','Simplified Chinese']]){
        const choice=document.querySelector('.lab-settings [data-set="lang"][data-val="'+lang+'"]');
        if(choice){choice.textContent=name;choice.lang='en';}
      }
    }
    if(state){updateDisplay();redraw();}
  }
  window.addEventListener('lab:settingschange',applySettings);
  const procedureKey='basketball-shot';
  const releaseHint=['出手','Release'];
  function steps(){
    const base=reference?.p.mode===mode && reference.data.trialRole==='reference'?reference:null;
    const setting=base && changedSetting(base);
    const second=!!base && !!canCompare();
    const comparedPair=second && comparedHere();
    const aimText=trial=>num(trial.p.speed,3)+' m/s · '+num(trial.p.angle,2)+'°';
    const setupTab=()=>{
      const pane=$('angle').closest('.labdeck-pane[inert]');
      return pane?$(pane.getAttribute('aria-labelledby')):null;
    };
    const sliderGuide=(id,zh,en)=>({
      target:()=>setupTab()||$(id),
      hint:()=>setupTab()?T('投籃設定','Setup'):T(zh,en),
      action:()=>setupTab()?'tap':'drag'
    });
    const resultNeed=(trial,available)=>{
      if(trial){
        const result=mode==='shot'?outcome(trial.data):unit(trial.data.R,' m');
        return [true,'出手結果 · '+result,'Release result · '+result];
      }
      if(!available)return [null,'出手結果 · 待前一步完成','Release result · waiting for the previous step'];
      return flight?[null,'出手結果 · 球在空中','Release result · ball in flight']:
        [false,'出手結果 · 尚未出手','Release result · awaiting release'];
    };
    const refNeed=[base?true:flight?null:false,
      base?'本項目的基準球 · '+aimText(base):'本項目的基準球 · 0 球',
      base?'Reference for this sport · '+aimText(base):'References for this sport · 0'];
    const rows=[
      {html:T('選定速率和角度，投出基準球。','Choose a speed and angle, then shoot a reference.'),
        done:!!base,target:'#reference',hint:['投基準球','Shoot reference'],
        need:[[true,'出手速率與角度 · '+aimText(base||state),'Release speed and angle · '+aimText(base||state)],refNeed]},
      {html:T('調整出手條件，觀察它與基準球的差異。','Change a release condition and check it against the reference.'),
        done:!!setting,...sliderGuide('angle','出手角','Release angle'),need:[refNeed,changeNeed(base,setting)]},
      {html:T('用新條件出手，取得這一球的結果。','Release with the new settings to get a second result.'),
        done:second,target:'#play',hint:releaseHint,need:[changeNeed(base,setting),resultNeed(second?completed:null,!!setting)]},
      {html:T('比較這次出手與基準球的結果。','Compare the new release with the reference.'),
        done:comparedPair,target:'#compare',hint:['比較兩球','Compare'],
        need:[resultNeed(second?completed:null,!!setting),[comparedPair?true:second?false:null,
          '本組已記錄的比較 · '+Number(comparedPair)+'/1','Comparison recorded for this pair · '+Number(comparedPair)+'/1']]}
    ];
    if(mode==='shot'){
      const moved=!!base&&(base.data.distance!==state.data.distance||base.data.bearing!==state.data.bearing);
      rows.splice(1,0,{html:T('換個站位，觀察人與籃板的相對位置。','Try another court spot and observe the board.'),
        done:moved,...sliderGuide('bearing','站位角度','Court bearing'),
        need:[[!!base,'已投基準球','Reference shot released'],[moved,'距離或角度已改變','Distance or bearing changed']]});
    }
    const current=rows.findIndex(step=>!step.done);
    rows.forEach((step,index)=>{step.current=index===current;});
    return rows;
  }
  function learningPanel(){
    if(!window.LabModeGate?.studying)return;
    const panel=window.LabPanel;
    panel.mount({tabs:['concept','examples']});
    const concept=document.createElement('p');
    concept.textContent=T('先從正面投一球，再把站位轉到 45°，保持出手速率和仰角。看看直接進球的路徑有什麼變化，再試打板球，觀察球往哪一側彈。','Release from the front, then move to 45° with the same speed and elevation. Compare the direct paths. Try a bank shot and watch which way the ball rebounds.');
    panel.setContent('concept',concept);
    const examples=[['正面打板','Bank from the front',7.81,44,0],['斜向打板','Bank from the wing',7.81,44,45],['前框彈進','In off the front rim',7.22,55,0]];
    const makeExample=([zh,en,speed,angle,bearing])=>{
      const b=document.createElement('button');b.type='button';b.textContent=T(zh,en);
      b.onclick=()=>{applyRelease({mode:'shot',speed,angle,bearing,distance:4.23,height:2,drag:false});update();panel.close();};
      return b;
    };
    $('learnExamples').replaceChildren(...examples.map(makeExample));
    panel.setContent('examples',examples.map(makeExample));panel.setStrip(T('比較正面與斜向打板','Compare a front and a wing bank shot'),'concept');
    panel.close();
  }
  function changedSetting(base){
    return ['angle','speed','height','distance','bearing','drag'].find(key=>
      (mode==='shot'||(key!=='distance'&&key!=='bearing')) && base.data[key]!==state.data[key]);
  }
  function changeNeed(base,setting){
    if(!base)return [null,'出手條件 · 待投基準球','Release conditions · waiting for a reference'];
    const key=setting||'angle';
    const [zh,en,suffix,places]={
      angle:['出手角','Release angle','°',2],speed:['出手速率','Release speed',' m/s',3],
      height:['出手高度','Release height',' m',2],distance:['距籃框中心','Distance to hoop centre',' m',2],
      bearing:['站位角度','Court bearing','°',0],drag:['空氣阻力','Air resistance','',0]
    }[key];
    const values=(on,off)=>[base.data[key],state.data[key]].map(val=>key==='drag'?(val?on:off):unit(val,suffix,places)).join(' → ');
    return [!!setting,zh+'（基準 → 本球）· '+values('開','關'),en+' (reference → current) · '+values('on','off')];
  }
  function updateProcedureGuide(manual=false,selected){
    const guide=window.LabStepGuide;
    if(!guide||(!manual&&(!guide.state.showing||guide.state.key!==procedureKey)))return;
    const rows=steps(),index=Number.isInteger(selected)?selected:rows.findIndex(step=>step.current);
    if(index<0||flight){guide.hide();return;}
    guide.define(rows,{key:procedureKey});
    if(manual){guide.update(rows.findIndex(step=>step.current),{key:procedureKey,auto:true});guide.update(index,{key:procedureKey});}
    else guide.update(index,{key:procedureKey,auto:true});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    applySettings();
    learningPanel();
    const side=LabSide.mount({module:procedureKey,steps,guide:i=>requestAnimationFrame(()=>updateProcedureGuide(true,i))});
    const root=document.documentElement;
    const context=()=>[root.dataset.labsideTab||'',side.railOpen].join('/');
    let lastContext=context();
    function syncPanel(){
      const next=context();
      if(next!==lastContext){lastContext=next;LabStepGuide.hide();}
      else updateProcedureGuide();
    }
    window.addEventListener('resize',syncPanel);
    new MutationObserver(()=>{
      if(context()!==lastContext)syncPanel();
    }).observe(root,{attributes:true,attributeFilter:['class','data-labside-tab']});
    document.querySelector('.labside-panel').addEventListener('click',e=>{
      if(!e.target.closest('.labside-guide-head .sg-toggle'))return;
      e.stopImmediatePropagation();
      side.close();updateProcedureGuide(true);
    },true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')LabStepGuide.hide();});
  });
  window.addEventListener('lab:themechange',()=>{palette=colors();updateDisplay();redraw();});
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change',()=>{
    if(motion.matches&&flight&&!replaying){skipFlight();}
    else{updateDisplay();redraw();}
  });
  document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(frame);stamp=0;if(!document.hidden){if(flight)frame=requestAnimationFrame(animate);else draw();}});
  const resize=new ResizeObserver(()=>{bgValid=false;draw();});resize.observe(cv);resize.observe($('instruments'));
  try{
    const saved=JSON.parse(localStorage.getItem(prefsKey));if(saved?.settings&&!window.LAB_SHARE_HASH){Object.assign(settings,saved.settings);applyRelease(settings[saved.mode]);}
  }catch{}
  palette=colors();soundButton();update();
})();
