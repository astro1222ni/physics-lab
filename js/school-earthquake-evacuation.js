/* 樓層平面與人數曲線。所有移動、排隊與到齊時刻皆讀取同一次核心模擬。 */
(function () {
  'use strict';
  const C = window.SchoolEvacuationCore, D = window.LabDraw, T = window.LabSettings.t;
  const $ = id => document.getElementById(id);
  let canvasFontScale=Number(LabSettings.get('fs'))||1;
  const room = i => (i % 3 - 1) * 9;
  const sideName = side => side ? T('東梯', 'East') : T('西梯', 'West');
  const line = (g, x, y, X, Y, ink, width = 1) => {
    g.beginPath(); g.moveTo(x, y); g.lineTo(X, Y); g.strokeStyle = ink; g.lineWidth = width; g.stroke();
  };
  function box(g, x, y, w, h, fill, radius = 0, stroke) {
    D.roundRect(g, x, y, w, h, radius); g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  }
  function circle(g, x, y, r, ink) {
    g.beginPath(); g.arc(x, y, Math.max(.1, r), 0, Math.PI * 2); g.fillStyle = ink; g.fill();
  }
  function text(g, str, x, y, color, size = 13, bold = false, align = 'center') {
    g.font = (bold ? '700 ' : '500 ') + size*canvasFontScale + 'px system-ui, sans-serif';
    g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(str, x, y);
  }
  function pill(g, title, x, y, ink, surface, size = 13) {
    g.font = '700 ' + size*canvasFontScale + 'px system-ui';const w=g.measureText(title).width+10,h=22*canvasFontScale;
    box(g,x-w/2,y-h/2,w,h,surface,5);text(g,title,x,y,ink,size,true);
  }
  const palette = () => {
    const c = D.c, mix = D.mix;
    return { bg: c['canvas-bg'], paper: c.surface, ink: c.text, muted: c.muted, west: c.probe, east: c.equi,
      red: c.pos, blue: c.neg, edge: mix(c.text, c.probe, .43), tile: mix(c['canvas-bg'], c.probe, D.dark ? .17 : .11),
      wood: mix(c.surface, c.equi, D.dark ? .5 : .34), grass: mix(c['canvas-bg'], c.probe, .36),
      glass: mix(c.surface, c.neg, .35), surface: mix(c['canvas-bg'], c.text, .055), border: c.border };
  };
  function surface(canvas) {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const w = rect.width, h = rect.height;
    if (w < 1 || h < 1) return null;
    const width = Math.round(w * dpr), height = Math.round(h * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.lineJoin = 'round'; g.lineCap = 'round';
    return { g, w, h, dpr };
  }
  function geometry(w, h, floor) {
    const x = v => (v + 20.4) * w / 40.8;
    const z = floor === 1 ? v => 8 + (v + 5) * (h - 18) / 26 : v => h * .14 + (v + 5) * (h * .74) / 12;
    const flag = i => ({ x: x(room(i)), y: z(1.0) });
    const stair = side => ({ x: x(side ? 16.8 : -16.8), y: z(floor === 1 ? 4 : .7) });
    const handle = side => ({ x: x(side ? 16.8 : -16.8), y: floor === 1 ? z(8.5) : h * .887 });
    return { x, z, flag, stair, handle, w, h };
  }
  function tree(g, x, y, r, p) {
    g.save(); g.fillStyle = D.shadowInk(.14); g.beginPath(); g.ellipse(x + r * .28, y + r * .35, r, r * .76, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 7; i++) { const angle = i * 2.4; circle(g, x + Math.cos(angle) * r * .36, y + Math.sin(angle) * r * .28, r * (.64 - i * .029), D.mix(p.edge, p.west, .23 + i * .09)); }
    g.restore();
  }
  function bench(g, x, y, w, h, p) {
    box(g, x + 1, y + 2, w, h, D.shadowInk(.22), 1.3);
    const grain=g.createLinearGradient(x,y,x,y+h);grain.addColorStop(0,D.shade(p.wood,.24));grain.addColorStop(1,D.shade(p.wood,-.14));
    box(g, x, y, w, h, grain, 1.3); line(g, x + 1, y + 1, x + w - 1, y + 1, D.shade(p.wood, .32));
  }
  function track(g, geo, p) {
    const {x,z,w,h} = geo;
    box(g,x(-19),z(7.8),x(19)-x(-19),z(20)-z(7.8),D.mix(p.red,p.paper,.37),h*.24);
    for(let i=0;i<4;i++){const inset=i*1.6+2;D.roundRect(g,x(-19)+inset,z(7.8)+inset,x(19)-x(-19)-2*inset,z(20)-z(7.8)-2*inset,h*.23);g.lineWidth=.8;g.strokeStyle=D.alpha(p.paper,.82);g.stroke();}
    box(g,x(-14),z(9.6),x(14)-x(-14),z(18.1)-z(9.6),p.grass,h*.16);
    const fieldW=x(7)-x(-7);g.strokeStyle=D.alpha(p.paper,.65);g.lineWidth=1;g.strokeRect(x(-7),z(10.5),fieldW,z(17.5)-z(10.5));
    line(g,x(0),z(10.5),x(0),z(17.5),D.alpha(p.paper,.65));
    g.beginPath();g.ellipse(x(0),z(14),fieldW*.11,(z(17.5)-z(10.5))*.27,0,0,Math.PI*2);g.stroke();
    box(g,x(-8),z(-2),x(8)-x(-8),z(1.1)-z(-2),p.edge,3);
    for(let i=0;i<3;i++)line(g,x(-7.8),z(-1.6+i*.75),x(7.8),z(-1.6+i*.75),D.alpha(p.paper,.66),1.3);
    for (const side of [0,1]){const sign=side?1:-1;box(g,x(sign*16)-w*.044,z(-.8),w*.088,z(5.9)-z(-.8),p.tile,3,p.edge);}
    for (const [a,b,r] of [[-11,-1,8],[11,-1,9],[-19,7,6],[19,7,7],[-18.5,19,6],[18.5,19,8]])tree(g,x(a),z(b),r*w/470,p);
  }
  function rooms(g, geo, p, r, floor) {
    const q = r.q;
    const {x,z,h,w} = geo, left = x(-19.1), right = x(19.1), top = z(-5.0), bottom = z(6.7);
    g.save();g.shadowColor=D.shadowInk(.28);g.shadowBlur=10;g.shadowOffsetY=4;
    box(g,left+2,top+4,right-left,bottom-top,D.shadowInk(.22),5);g.restore();
    box(g,left,top,right-left,bottom-top,p.edge,4);
    box(g,left+3,top+3,right-left-6,bottom-top-6,p.tile,2);
    const thin=D.alpha(p.edge,.15);
    for(let a=-18;a<=18;a+=1.4)line(g,x(a),z(2),x(a),bottom-3,thin,.65);
    for(let a=2;a<6.7;a+=1.25)line(g,left+3,z(a),right-3,z(a),thin,.65);
    const inner=z(4-q.corridor/2),outer=z(4+q.corridor/2);
    box(g,x(-16),inner,x(16)-x(-16),outer-inner,D.alpha(p.paper,.32));
    for(const y of [inner,outer])line(g,x(-16),y,x(16),y,D.alpha(p.edge,.46),1);
    for(let c=0;c<3;c++){
      const cx=room(c),lx=x(cx-4.48),rx=x(cx+4.48),yt=z(-4.8),yb=z(2.1);
      const boards=g.createLinearGradient(lx,yt,rx,yb);boards.addColorStop(0,D.mix(p.surface,p.wood,.27));boards.addColorStop(1,p.surface);
      box(g,lx,yt,rx-lx,yb-yt,boards,0,p.edge);
      for(let j=0;j<13;j++)line(g,lx+2,yt+(yb-yt)*j/13,rx-2,yt+(yb-yt)*j/13,D.alpha(p.edge,.085),.7);
      const wallShade=g.createLinearGradient(0,yt,0,yt+13);wallShade.addColorStop(0,D.shadowInk(.19));wallShade.addColorStop(1,D.shadowInk(0));
      g.fillStyle=wallShade;g.fillRect(lx,yt,rx-lx,13);
      // Tall windows, mullions, chalk rail, paired desks, chairs and the classroom door swing.
      box(g,lx+(rx-lx)*.13,yt-1,(rx-lx)*.73,3.2,p.glass,0);
      for(let i=1;i<6;i++)line(g,lx+(rx-lx)*(.13+i*.12),yt-2,lx+(rx-lx)*(.13+i*.12),yt+3,p.edge,.8);
      box(g,lx+1,z(-3.9),2.6,z(-.8)-z(-3.9),p.west,1);
      for(let j=0;j<Math.ceil(r.people.sizes[q.origins.indexOf((floor-2)*3+c)]/8);j++)for(let i=0;i<4;i++){
        const dx=x(cx-3.45+i*1.84),dy=z(-4.25+j*1.04),dw=x(1.36)-x(0),dh=Math.max(3,z(.39)-z(0));
        for(const pos of [.16,.60])box(g,dx+dw*pos,dy+dh*1.25,dw*.27,dh*.67,p.edge,1);
        bench(g,dx,dy,dw,dh,p);
        if((i+j+c)%3===0){box(g,dx+dw*.12,dy+.5,dw*.36,dh*.7,p.paper,1);line(g,dx+dw*.3,dy+1,dx+dw*.3,dy+dh*.69,p.glass,.6);}
      }
      const door=x(cx+2);line(g,door,yb,door+w*.033,yb,p.tile,3.5);line(g,door,yb,door,yb-h*.07,p.edge,1.2);
      g.beginPath();g.arc(door,yb,Math.min(w*.032,h*.07),-Math.PI/2,0);g.strokeStyle=thin;g.stroke();
    }
    for(const side of [0,1]){
      const sign=side?1:-1,cx=x(sign*16.7),sw=(1.45+q[side?'east':'west']*.65)*w/40.8;
      const ty=z(-4.5),by=z(3.2);box(g,cx-sw*.78,ty,sw*1.56,by-ty,p.surface,1,p.edge);
      for(let lane=0;lane<2;lane++)for(let step=0;step<11;step++){
        const sy=ty+(by-ty)*(.1+step*.075),sx=cx+sw*(-.71+lane*.76),wide=sw*.675,dh=(by-ty)*.075;
        box(g,sx,sy,wide,dh,D.mix(p.surface,p.edge,.08+(lane?10-step:step)*.027));line(g,sx,sy,sx+wide,sy,D.alpha(p.edge,.50),1);
        line(g,sx,sy+1.2,sx+wide,sy+1.2,D.alpha(p.paper,.7),.8);
      }
      line(g,cx,ty+2,cx,by-3,p.edge,2.3);line(g,cx-.6,ty+2,cx-.6,by-3,p.paper,.8);
    }
    for(const sx of [-12,-4,4,12]){
      const bx=x(sx),by=z(5.85),bw=w*.037;bench(g,bx-bw/2,by,bw,3.8,p);
      const px=x(sx+1.45),py=z(5.92);box(g,px-3,py-2,6,5,p.wood,1);tree(g,px,py-2,3.6,p);
    }
    for(let i=0;i<6;i++){const ax=x(-11.7+i*4.65);box(g,ax,bottom-2,w*.069,3,p.glass);line(g,ax+w*.034,bottom-2,ax+w*.034,bottom+1,p.edge,.8);}
  }
  let backdrop = null, backdropKey = '';
  function background(geo, floor, r, p, dpr) {
    const {w,h,x,z} = geo;
    const key = [w,h,dpr,D.ver,floor,r.q.east,r.q.west,r.q.door,r.q.corridor,...r.people.sizes,...r.q.origins].join('/');
    if(key === backdropKey) return backdrop;
    backdropKey=key;backdrop=document.createElement('canvas');backdrop.width=Math.round(w*dpr);backdrop.height=Math.round(h*dpr);
    const g=backdrop.getContext('2d');g.scale(dpr,dpr);D.backdrop(g,w,h);
    D.grid(g,0,0,w,h,40,10,4,4);
    if(floor===1) track(g,geo,p); else rooms(g,geo,p,r,floor);
    if(floor!==1){const northX=x(-18.6), northY=z(-5)-10;line(g,northX,northY+4,northX,northY-4,p.muted,1.5);line(g,northX,northY-4,northX-2,northY-1,p.muted);text(g,'N',northX+10,northY,p.muted,13,true);}
    return backdrop;
  }
  let floor=2, q=C.config(), run=C.simulate(q), phase='plan', shelter=0, elapsed=0, playTime=0, running=false;
  let replayRate=8, selectedRoom=null;
  let notice='', baseline=null, logs=[], sampled=false, dangerous=false, startCount=0;
  let view=null, viewWanted=false, viewEpoch=0, fine=false, fineSide='west', pad=null, raf=0, lastFrame=0, nextBeep=0;
  let countSite='field',cursor=[30,60], drag=null, hot=null, mapGeo=null, chartGeo=null, flashClass=-1;
  const phases={
    plan:['路線規劃','Route planning'],warning:['預警倒數','Warning'],shaking:['搖晃中','Shaking'],
    waiting:['等候廣播','Awaiting announcement'],announced:['已廣播','Announced'],moving:['疏散中','Evacuating'],done:['點名完成','Roll call complete']
  };
  function paintMap() {
    if(viewWanted)return;
    const s=surface($('map'));if(!s)return;
    const {g,w,h,dpr}=s,p=palette(),geo=mapGeo=geometry(w,h,floor),{x,z}=geo;
    g.drawImage(background(geo,floor,run,p,dpr),0,0,w,h);
    // Solid westbound and dashed eastbound routes remain distinguishable without colour.
    const onFloor = C.classes.map((_,c)=>c).filter(c=>Math.floor(q.origins[c]/3)===floor-2);
    const traffic=[0,0];
    for(const side of [0,1]){
      const ink=side?p.east:p.west,sign=side?1:-1;
      const cx=x(sign*16),ly=z(floor===1?7:3.5+side*.9);
      const assigned=C.classes.map((_,i)=>i).filter(i=>q.routes[i]===side&&(floor===1||Math.floor(q.origins[i]/3)===(floor-2)));
      if(assigned.length && q.closed!==side){
        g.save();g.strokeStyle=D.alpha(ink,.80);g.lineWidth=2.5;g.setLineDash(side?[6,4]:[]);
        if(floor===1){g.beginPath();g.moveTo(cx,z(4));g.lineTo(cx,z(14));g.lineTo(x(0),z(14));g.stroke();}
        else for(const c of assigned){const from=x(room(q.origins[c]));g.beginPath();g.moveTo(from,z(1));g.lineTo(from,ly);g.lineTo(cx,ly);g.stroke();}
        g.restore();
      }
    }
    const t=phase==='done'?run.end:phase==='moving'?playTime:-1;
    const dotR=Math.max(1.45,Math.min(3.1,w/192));
    for(let id=0;id<run.total;id++){
      const pos=C.position(run,id,t);if(pos.floor!==floor)continue;
      const side=q.routes[run.people.classOf[id]],ink=side?p.east:p.west;
      const [px,,pz]=pos.p;
      if(pos.waiting&&['lower','upper','door'].includes(pos.kind))traffic[side]++;
      circle(g,x(px),z(pz),dotR+.45,D.shadowInk(.65));circle(g,x(px)-.28,z(pz)-.48,dotR,ink);
    }
    for(const side of [0,1]){
      const a=geo.stair(side),b=geo.handle(side),ink=side?p.east:p.west,closed=q.closed===side;
      if(traffic[side]){
        const edge=C.edge(floor===1?'door':'stair',1,floor===1?q.door:q[side?'east':'west']);
        const density=traffic[side]/(3*edge.effective),v=Math.min(1,density/(1.5*C.CRITICAL_D));
        const hotInk=D.mix(p.east,p.red,v),radius=Math.max(20,w*.067),heat=g.createRadialGradient(a.x,a.y+6,1,a.x,a.y+6,radius);
        heat.addColorStop(0,D.alpha(hotInk,.55*v));heat.addColorStop(1,D.alpha(hotInk,0));
        g.fillStyle=heat;g.fillRect(a.x-radius,a.y+6-radius,2*radius,2*radius);
        const bw=Math.min(52,w*.12);box(g,a.x-bw/2,a.y+14,bw,6,D.alpha(ink,.20),2);
        box(g,a.x-bw/2,a.y+14,bw*Math.min(1,traffic[side]/q.size),6,hotInk,2);
        pill(g,String(traffic[side]),a.x,a.y+30,p.ink,p.paper);
      }
      pill(g,closed?'× '+sideName(side):sideName(side),a.x,a.y,closed?p.red:ink,p.paper);
      const width=floor===1?q.door:q[side?'east':'west'];
      const focused=hot?.type==='handle'&&hot.side===side;
      const label='↔ '+Number(width.toFixed(2))+' m';g.font='700 '+13*canvasFontScale+'px system-ui';
      const half=Math.max(24,g.measureText(label).width/2+4),cx=C.clamp(b.x,half+2,w-half-2),height=22*canvasFontScale;
      box(g,cx-half,b.y-height/2,half*2,height,focused?p.tile:p.paper,8,ink);
      text(g,label,cx,b.y,ink,13,true);
    }
    if(floor!==1) for(const i of onFloor){
      if(drag?.type==='flag'&&drag.c===i)continue;
      paintFlag(g,i,geo.flag(q.origins[i]),p,hot?.c===i||flashClass===i);
    }
    if(drag?.type==='flag')paintFlag(g,drag.c,drag,p,true);
  }
  function paintFlag(g,c,point,p,active) {
    const side=q.routes[c],ink=side?p.east:p.west,w=57*canvasFontScale,h=26*canvasFontScale,x=point.x,y=point.y;
    line(g,x-w/2+4,y+4,x-w/2+4,y+20,p.edge,2);
    box(g,x-w/2+2,y-h/2+2,w,h,D.shadowInk(.23),5);box(g,x-w/2,y-h/2,w,h,active?ink:p.paper,5,ink);
    text(g,(side?'':'‹ ')+C.classes[c]+(side?' ›':''),x,y,active?p.paper:ink,14,true);
  }
  function paintChart() {
    const s=surface($('chart'));if(!s)return;
    const {g,w,h}=s,p=palette(),fs=Number(LabSettings.get('fs'))||1;
    const l=Math.round(27*fs),r=w-9,top=10,bottom=h-20*fs,end=run.chartEnd;
    const X=t=>l+(r-l)*t/end,Y=n=>bottom-(bottom-top)*n/run.total;
    chartGeo={X,Y,l,r,end,w,h};g.clearRect(0,0,w,h);
    for(const n of [0,run.total/2,run.total]){
      const y=Y(n);line(g,l,y,r,y,D.alpha(p.muted,.22));text(g,String(n),l-4,y,p.muted,12,false,'right');
    }
    text(g,'0',l,bottom+10*fs,p.muted,12);text(g,end+' s',r,bottom+10*fs,p.muted,12,false,'right');
    function trace(until,color,width,dashed,fill) {
      const counts=C.series(run,countSite),ticks=Math.min(counts.length-1,Math.floor(until/C.DT));g.beginPath();g.moveTo(l,Y(0));let prev=0;
      for(let i=1;i<=ticks;i++){const n=counts[i];if(n!==prev){g.lineTo(X(i*C.DT),Y(prev));g.lineTo(X(i*C.DT),Y(n));prev=n;}}
      g.lineTo(X(until),Y(prev));g.strokeStyle=color;g.lineWidth=width;g.setLineDash(dashed?[4,3]:[]);g.stroke();g.setLineDash([]);
      if(fill){g.lineTo(X(until),bottom);g.lineTo(l,bottom);g.closePath();g.fillStyle=D.alpha(p.west,.10);g.fill();}
    }
    trace(end,D.alpha(p.west,.78),1.8,true,phase==='plan');
    if(phase==='done'||phase==='moving')trace(phase==='done'?end:playTime,p.west,2.3,false,true);
    const a=cursor[0],b=cursor[1];
    for(const [i,t] of cursor.entries()){
      const px=X(t),py=Y(C.amount(run,t,countSite)),ink=i?p.east:p.blue;
      line(g,px,top+2,px,bottom,D.alpha(ink,.35));circle(g,px,py,4,ink);
      const half=9*fs,labY=i?top+half:bottom-half,labX=C.clamp(px,half+2,w-half-2);
      box(g,labX-half,labY-half,half*2,half*2,ink,4);text(g,i?'B':'A',labX,labY,p.paper,13,true);
    }
    g.save();g.setLineDash([3,3]);line(g,X(a),Y(C.amount(run,a,countSite)),X(b),Y(C.amount(run,b,countSite)),p.blue,1.4);g.restore();
  }
  function redraw() {
    paintMap();paintChart();
    view?.update(run,phase==='done'?run.end:phase==='moving'?playTime:-1,phase==='shaking',elapsed);
  }
  function relative(event,canvas) { const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top}; }
  function hit(pos) {
    if(!mapGeo)return null;
    if(floor!==1)for(let c=0;c<6;c++){if(Math.floor(q.origins[c]/3)!==floor-2)continue; const a=mapGeo.flag(q.origins[c]);if(Math.abs(pos.x-a.x)<=30&&Math.abs(pos.y-a.y)<=22)return {type:'flag',c};}
    for(const side of [0,1]){const a=mapGeo.handle(side);if(Math.abs(pos.x-a.x)<=27&&Math.abs(pos.y-a.y)<=22)return {type:'handle',side};}
    return null;
  }
  const canEdit=()=>phase==='plan'||phase==='done';
  let writingInputs=false;
  function writeNumber(el,value) {
    if(LabNum.value(el)===value)return;
    writingInputs=true;
    try{LabNum.set(el,value);}finally{writingInputs=false;}
  }
  function selectFloor(f) { floor=f;hot=null;flashClass=-1;sync(); }
  function setWidth(key,val) {
    const el=$(key),n=C.clamp(Math.round(val*100)/100,+el.min,+el.max);writeNumber(el,n);changePlan();
  }
  $('map').addEventListener('pointerdown',e=>{
    if(!canEdit())return;const a=relative(e,$('map')),h=hit(a);if(!h)return;
    e.preventDefault();$('map').setPointerCapture(e.pointerId);
    const key=floor===1?'door':h.side?'east':'west';
    drag={...a,...h,origin:a.x,width:q[key],key};$('map').style.cursor='grabbing';paintMap();
  });
  $('map').addEventListener('pointermove',e=>{
    const a=relative(e,$('map'));
    if(!drag){hot=canEdit()?hit(a):null;$('map').style.cursor=hot?.type==='handle'?'ew-resize':hot?'grab':'default';paintMap();return;}
    Object.assign(drag,a);
    if(drag.type==='handle') setWidth(drag.key,drag.width+(a.x-drag.origin)*1.4/Math.min(140,mapGeo.w*.32));
    else paintMap();
  });
  $('map').addEventListener('pointerup',e=>{
    if(drag?.type==='flag'){const a=relative(e,$('map'));const side=Number(a.x>mapGeo.w/2),target=mapGeo.stair(side);
      if(Math.abs(target.x-a.x)<=Math.max(34,mapGeo.w*.12)&&Math.abs(target.y-a.y)<mapGeo.h*.39)assign(drag.c,side);}
    drag=null;hot=null;$('map').style.cursor='grab';paintMap();
  });
  $('map').addEventListener('pointercancel',()=>{drag=null;hot=null;paintMap();});
  $('map').addEventListener('pointerleave',()=>{if(!drag){hot=null;paintMap();}});
  let chartIndex=-1;
  function cursorTo(e) {
    const x=relative(e,$('chart')).x,g=chartGeo;if(!g)return;
    const t=Math.round(C.clamp((x-g.l)/(g.r-g.l),0,1)*run.chartEnd*2)/2;
    if(chartIndex<0)chartIndex=Math.abs(x-g.X(cursor[0]))<Math.abs(x-g.X(cursor[1]))?0:1;
    setCursor(chartIndex,t);
  }
  $('chart').addEventListener('pointerdown',e=>{e.preventDefault();$('chart').setPointerCapture(e.pointerId);chartIndex=-1;cursorTo(e);});
  $('chart').addEventListener('pointermove',e=>{if(chartIndex>=0)cursorTo(e);});
  $('chart').addEventListener('pointerup',()=>{chartIndex=-1;});$('chart').addEventListener('pointercancel',()=>{chartIndex=-1;});
  function setCursor(i,t) {const key=i?'cursorB':'cursorA';cursor[i]=C.clamp(t,0,run.chartEnd);writeNumber($(key),cursor[i]);$(key+'o').textContent=cursor[i];updateMeasurement();paintChart();}
const slug = 'school-earthquake-evacuation';
  const formKeys = Object.keys(C.limits);
  const short = n => Number.isFinite(n) ? String(+n.toFixed(2)) : '—';
  const emit = (type,data) => { if(!dangerous) window.LabMission?.emit(type,{...data,observed:true}); };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const listen = (id,fn) => $(id).addEventListener('click',fn);
  const sideLetters = side => side ? T('東','E') : T('西','W');
  const info = (message) => { notice=message;caption(); };
  function assign(c,side) {
    if(!canEdit())return;q.routes[c]=side;flashClass=c;changePlan();
  }
  function changePlan() {
    if(writingInputs||!canEdit())return;
    const values=Object.fromEntries(formKeys.map(k=>[k,LabNum.value($(k))]));
    const settings = Object.fromEntries(modeKeys.map(k=>[k,$(k).value==='random']));
    q=C.config({...q,...values,...settings,seed:Number($('seed').value),merge:$('merge').value,closed:Number($('closure').value),push:$('push').checked});
    run=C.simulate(q);phase='plan';elapsed=0;playTime=0;shelter=0;dangerous=false;notice='';sampled=false;
    running=false;sync();
  }
  function fillForm() {
    for(const k of formKeys)writeNumber($(k),q[k]);
    $('closure').value=q.closed;$('push').checked=q.push;
    for(const k of modeKeys)$(k).value=q[k]?'random':'same';
    $('seed').value=q.seed;$('merge').value=q.merge;selectedRoom=null;
  }
  function clearRecords() {
    logs=[];baseline=null;sampled=false;startCount=0;
    phase='plan';shelter=0;elapsed=playTime=0;running=false;dangerous=false;notice=()=>T('紀錄已清除，通道與班級配置保留。','Records cleared. Passage and class settings are retained.');
    sync();
  }
  function applyExample(i) {
    const item=window.LAB_EXAMPLE_DATA[slug][i];
    q=C.config(item.state);phase='plan';fillForm();changePlan();
    info(()=>T(...item.q));
  }
  function addLog(message) {
    logs.unshift(message);
    renderLog();info(message);
  }
  function renderLog() {
    const nodes=logs.map(label=>{const li=document.createElement('li');li.textContent=label();return li;});
    $('log').replaceChildren(...nodes);
  }
  const protection=[['趴下','Drop'],['掩護 · 就近入桌下','Cover · under desk'],['穩住','Hold on']];
  function start() {
    phase=C.warning(q).blind?'shaking':'warning';shelter=0;elapsed=0;playTime=0;running=true;
    dangerous=false;sampled=false;notice='';fine=false;startCount++;floor=2;
    nextBeep=Math.ceil(C.warning(q).lead);sync();schedule();
  }
  function protectionAction() {
    if(!['warning','shaking','waiting','announced'].includes(phase)||shelter>=3)return;
    shelter++;notice='';
    if(shelter===3) {
      const warning=C.warning(q);
      emit('shelter',{lead:warning.lead,margin:warning.lead-elapsed,blind:warning.blind,shaking:phase==='shaking'});
    }
    sync();
  }
  function movePhase() {
    const lead=C.warning(q).lead;
    if(phase==='warning'){elapsed=lead;phase='shaking';}
    else if(phase==='shaking'){elapsed=lead+q.shaking;phase='waiting';running=false;}
    else if(phase==='waiting'){phase='announced';running=false;}
    notice='';sync();schedule();
  }
  function depart() {
    if(phase==='shaking'||phase==='warning'||phase==='waiting'){
      dangerous=true;running=false;
      info(()=>T('危險！先就地掩護。這輪已中止，請重新演練。','Unsafe departure. Take cover where you are. Start a new drill.'));
      sync();return;
    }
    if(phase!=='announced')return;
    if(shelter<3){info(()=>T('請先完成趴下、掩護、穩住。','Complete drop, cover and hold on first.'));return;}
    if(!run.complete){phase='plan';sync();info(()=>T('需要師長另行引導。有班級被派到封閉樓梯，請重新指派或使用安全分流。','Staff guidance needed. Reassign classes on the closed stair or use safe routing.'));return;}
    phase='moving';playTime=0;elapsed=0;running=true;notice='';floor=1;replayRate=8;sync();
    if(reduced())finish();else schedule();
  }
  function finish() {
    if(phase!=='moving')return;
    classSounds(playTime,run.end,true);playTime=run.end;phase='done';running=false;notice='';sync();
  }
  function beep(freq,delay=0){if(window.LabSound?.enabled())LabSound.tone({freq,dur:.12,gain:.065,delay,type:'sine'});}
  function classSounds(from,to,skip) {
    if(!LabSound.enabled())return;
    let n=0;run.classLast.forEach((time,i)=>{if(time>from&&time<=to){const note=330+i*34,offset=skip?n++*.13:0;
      [1,1.25,1.5].forEach((factor,j)=>beep(note*factor,offset+j*.035));}});
  }
  function step(now) {
    raf=0;if(document.hidden||!running||dangerous||reduced()){lastFrame=0;return;}
    const dt=lastFrame?Math.min((now-lastFrame)/1000,.12):0;lastFrame=now;
    if(phase==='warning'||phase==='shaking'){
      elapsed+=dt;
      const lead=C.warning(q).lead;
      if(phase==='warning'){
        const left=Math.ceil(lead-elapsed);if(left<nextBeep&&left>=0){nextBeep=left;beep(left<=3?740:523);}
        if(elapsed>=lead){phase='shaking';notice='';sync();}
      }
      if(phase==='shaking'&&elapsed>=lead+q.shaking){phase='waiting';running=false;notice='';sync();}
    }else if(phase==='moving'){
      const previous=playTime;playTime=Math.min(run.end,playTime+dt*replayRate);classSounds(previous,playTime,false);
      if(playTime>=run.end){finish();return;}
    }
    live();if(viewWanted)view?.update(run,phase==='moving'?playTime:-1,phase==='shaking',elapsed);
    else if(phase==='moving')paintMap();
    if(phase==='moving')paintChart();schedule();
  }
  function schedule() {if(!raf&&running&&!dangerous&&!document.hidden&&!reduced())raf=requestAnimationFrame(step);else if(!running||document.hidden||reduced())lastFrame=0;}
  function live() {
    const lead=C.warning(q).lead;
    const t=phase==='warning'?Math.max(0,Math.ceil(lead-elapsed)):phase==='shaking'?Math.max(0,Math.ceil(lead+q.shaking-elapsed)):
      phase==='done'?run.end:phase==='moving'?Math.floor(playTime):0;
    $('clock').textContent=short(t)+' s';
    $('attend').textContent=(phase==='done'?run.served:phase==='moving'?C.amount(run,playTime):0)+' / '+run.total;
  }
  function caption() {
    const node=$('caption');node.replaceChildren();
    if(notice){const b=document.createElement(dangerous?'em':'b');b.textContent=notice();node.append(b);return;}
    const first=document.createElement('b');
    const map={
      plan:run.stalled?[T('需要師長另行引導。','Staff guidance needed. '),T('有 ','')+run.stalled+T(' 人的班旗指向封閉樓梯。',' pupils are assigned to the closed stair.')]:
        [T('先排路線。','Plan the routes. '),T('拖班旗到樓梯，觀察哪一側得等更久。','Drag a class flag to a stair. Which side will wait longer?')],
      warning:[T('警報到了。','An alert arrived. '),T('立刻就地趴下、掩護、穩住。','Drop, cover and hold on where you are.')],
      shaking:[T('搖晃中。','Shaking. '),T('保護頭頸，握住桌腳，留在掩護處。','Protect your head and neck. Hold the desk leg and stay covered.')],
      waiting:[T('搖晃停止。','Shaking stopped. '),T('留意校內疏散廣播。','Listen for school evacuation instructions.')],
      announced:[T('疏散廣播已響。','Evacuation announced. '),T('不推、不跑、不語，依指示走樓梯到操場集合。','Walk without pushing, running or chatting. Follow instructions to the field.')],
      moving:[T('疏散播放 ×','Evacuation replay ×')+replayRate+' · ',T('注意樓梯前的人數和曲線上升的速度。','Compare the stair queues with the rise in the curve.')],
      done:[T('六班到齊。','All six classes are here. '),T('到讀數頁保存基準，改一項條件再演練。','Save a baseline in Readings, then change one condition and repeat.')]
    };
    const parts=map[phase];first.textContent=parts[0];node.append(first,document.createTextNode(parts[1]));
  }
  function updateMeasurement() {
    const m=C.measure(run,...cursor,countSite);
    const counter=k=>C.measure(run,...cursor,k).slope;
    $('measured').textContent=T('此處平均 ','Mean here: ')+short(m.slope)+T(' 人/s',' people/s')+(m.capacity===null?'':T('，該梯容量 ',' · Stair capacity: ')+short(m.capacity)+T(' 人/s',' people/s'));
    $('flowCompare').textContent=T('同一時段（人/s）　西梯 ','Same interval (people/s) · W ')+short(counter('west'))+T('／東梯 ',' / E ')+short(counter('east'))+T('／操場 ',' / Field ')+short(counter('field'));
    $('chartTitle').textContent=countSite==='field'?T('累積到齊人數','Cumulative field arrivals'):T('累積通過 · ','Cumulative · ')+sideName(Number(countSite==='east'));
  }
  function stats() {
    const list=[[T('疏散時間','Evacuation time'),phase==='done'?short(run.end)+' s':'—'],[T('全校人數','Enrolment'),String(run.total)],
      [T('西梯清空','West stair clear'),phase==='done'&&run.count[0]?short(run.clear[0])+' s':'—'],[T('東梯清空','East stair clear'),phase==='done'&&run.count[1]?short(run.clear[1])+' s':'—']];
    $('metrics').replaceChildren(...list.map(([name,v])=>{const d=document.createElement('div'),b=document.createElement('strong');b.textContent=v;d.append(name,b);return d;}));
    $('baselineInfo').textContent=baseline?T('基準疏散時間 ','Baseline time: ')+short(baseline.end)+' s':T('還沒有保存基準。','No baseline saved yet.');
    $('classTimes').textContent=phase==='done'?T('各班到齊（秒）　','Class completion (s): ')+C.classes.map((c,i)=>c+' · '+run.classLast[i]).join(' / '):T('各班到齊後顯示點名時刻。','Class completion times appear after the drill.');
    if(!logs.length)$('log').replaceChildren();
  }
  function stepData() {
    const isAfter=['moving','done'].includes(phase);
    const data=[
      [run.complete,T('確認六班都分到可通行的樓梯。','Assign every class to an open stair.'),'routeList',[run.complete,'仍有 '+run.stalled+' 人的路線封閉。',run.stalled+' pupils still have a blocked route.']],
      [shelter===3,T('聽到警報或感到搖晃，完成就地掩護。','At an alert or shaking, take cover where you are.'),phase==='plan'||dangerous?'startDrill':'protect',[shelter===3,'已完成 '+shelter+' 個動作。',shelter+' actions complete.']],
      [isAfter,T('搖晃停止並聽到廣播，再出發。','Wait for shaking to stop and the announcement, then depart.'),phase==='announced'?'depart':'advance',[isAfter,'目前為'+T(...phases[phase])+'。','Current phase: '+phases[phase][1]+'.']],
      [phase==='done',T('觀察隊伍，等六班到達操場。','Watch the queues until all six classes reach the field.'),'finish',[phase==='done','已到操場 '+(phase==='done'?run.served:phase==='moving'?C.amount(run,playTime):0)+' 人。','Pupils assembled: '+(phase==='done'?run.served:phase==='moving'?C.amount(run,playTime):0)+'.']],
      [sampled,T('調整兩個游標，在讀數頁記錄斜率。','Adjust the two cursors and record the slope in Readings.'),'recordSlope',[sampled,'本輪需要一筆曲線量測。','A curve measurement is needed in this drill.']]
    ];const current=data.findIndex(row=>!row[0]);
    return data.map(([done,html,id,need],i)=>({done,current:i===current,html,id,need:[need]}));
  }
  function sync() {
    canvasFontScale=Number(LabSettings.get('fs'))||1;
    for(const k of formKeys){$(k+'o').textContent=short(q[k]);$(k).disabled=!canEdit();}
    for(const k of ['closure','push','shortest','fineWidths'])$(k).disabled=!canEdit();
    $('safeRoutes').hidden=run.stalled===0;$('safeRoutes').disabled=!canEdit();
    for(const k of [...modeKeys,'seed','reroll','merge','nearPreset','farPreset'])$(k).disabled=!canEdit();
    $('spread').disabled=!canEdit()||!q.delaysVary;$('slowShare').disabled=!canEdit()||!q.speedsVary;
    $('seed').value=q.seed;
    updateRooms();
    const roster=C.classes.map((name,c)=>name+' · '+run.people.sizes[c]).join(' ／ ');
    $('populationSummary').textContent=T('各班人數　','Pupils per class: ')+roster+T('。較慢者 ',' · Slower group: ')+run.people.slowCount+T(' 人。',' pupils.');
    const startTimes=run.firstMove.map(t=>t===null?'—':short(run.people.safe+t)+' s');
    $('timingSummary').textContent=T('各班從首個警訊至起步（依班號）　','Cue to start by class: ')+startTimes.join(' ／ ')+T('。疏散指示至最後一人到齊 ',' · Instruction to last arrival: ')+(run.complete?run.end+' s':'—');
    const routeButtons=[...$('routeList').children];routeButtons.forEach((btn,c)=>{
      btn.disabled=!canEdit();btn.textContent=C.classes[c]+' · '+sideLetters(q.routes[c]);
      btn.style.borderInlineStart='3px solid var(--'+(q.routes[c]?'east':'west')+')';
      btn.setAttribute('aria-label',T('切換班級路線 ','Switch class route ')+C.classes[c]+' · '+sideName(q.routes[c]));});
    const warn=C.warning(q);$('lead').textContent=warn.blind?T('未提前收到警報（盲區）','No advance alert (blind zone)'):T('尚有 ','')+short(warn.lead)+T(' 秒',' s left');
    $('lead').classList.toggle('is-blind',warn.blind);
    $('waveTimes').textContent=T('發震後　','After origin: ')+'P '+short(warn.pArrival)+' s ／ S '+short(warn.sArrival)+' s · '+T('收到警報 ','Alert received ')+q.received+' s';
    $('floorTitle').textContent=viewWanted?T('校舍剖面','School cutaway'):floor===1?T('一樓與集合操場','Ground floor and field'):floor+'F · '+T('教室與疏散走廊','Classrooms and corridor');
    $('phaseName').textContent=dangerous?T('危險出發','Unsafe departure'):T(...phases[phase]);$('phaseName').classList.toggle('warn',dangerous||phase==='shaking');
    $('plotMode').textContent=phase==='done'?T('本輪紀錄','Recorded'):phase==='moving'?T('實線為目前到齊','Solid: actual'):T('虛線為試算','Dashed: preview');
    for(const f of [1,2,3]){$('floor'+f).setAttribute('aria-pressed',String(f===floor&&!viewWanted));}
    const visible=(id,val)=>{$(id).hidden=!val;};
    visible('startDrill',phase==='plan'||phase==='done'||dangerous);$('startDrill').textContent=startCount?T('重新演練','Restart drill'):T('開始演練','Start drill');
    visible('protect',!dangerous&&shelter<3&&['warning','shaking','waiting','announced'].includes(phase));$('protect').textContent=T(...protection[Math.min(2,shelter)]);
    visible('advance',!dangerous&&['warning','shaking','waiting'].includes(phase));$('advance').textContent=phase==='warning'?T('推進至搖晃','Advance to shaking'):phase==='shaking'?T('推進至停搖','Advance to stillness'):T('收聽疏散廣播','Hear announcement');
    visible('depart',!dangerous&&['warning','shaking','waiting','announced'].includes(phase));$('depart').classList.toggle('primary',phase==='announced');
    visible('pause',phase==='moving');$('pause').textContent=running?T('暫停','Pause'):T('繼續','Resume');
    visible('finish',phase==='moving'&&replayRate!==32);visible('resetCam',viewWanted);visible('stairCam',viewWanted);
    for(const id of ['recordRoll','recordStairs','recordFloors','recordSlope','recordIntervals','saveBase','compare'])$(id).disabled=phase!=='done'||(id==='compare'&&!baseline);
    for(const [i,k] of ['cursorA','cursorB'].entries()){cursor[i]=Math.min(run.chartEnd,cursor[i]);$(k).max=run.chartEnd;writeNumber($(k),cursor[i]);$(k+'o').textContent=short(cursor[i]);}
    $('soundBtn').textContent=LabSound.enabled()?T('音效開啟','Sound on'):T('音效關閉','Sound off');$('soundBtn').setAttribute('aria-pressed',String(LabSound.enabled()));
    live();caption();stats();updateMeasurement();redraw();
    const steps=stepData();LabStepGuide.define(steps.map((s,i)=>({target:()=>$(stepData()[i].id),hint:()=>stepData()[i].html,
      action:'tap',need:s.need})),{key:slug});
    LabStepGuide.update(steps.findIndex(s=>s.current),{key:slug,auto:true});
  }
  async function setView(on) {
    const epoch=++viewEpoch;viewWanted=on;fine=false;
    $('view2d').setAttribute('aria-pressed',String(!on));$('view3d').setAttribute('aria-pressed',String(on));
    $('model3d').hidden=!on;$('map').hidden=on;
    if(view){view.dispose();view=null;}
    sync();if(!on)return;
    try {
      const candidate=await window.SchoolEvacuation3D.create($('model3d'),()=>{setView(false);info(()=>T('3D 顯示中斷，已回到平面圖。','3D display was interrupted. The plan is available.'));});
      if(epoch!==viewEpoch){candidate.dispose();return;}
      view=candidate;redraw();
    }catch(error){if(epoch===viewEpoch){setView(false);info(()=>T('此裝置暫時無法顯示 3D，請使用平面圖。','3D is unavailable on this device. Use the floor plan.'));}}
  }
  function observe(type) {
    if(phase!=='done'||dangerous)return;
    const d=C.facts(run),m=C.measure(run,...cursor,countSite);
    const clear=run.clear.map((t,i)=>run.count[i]?t+' s':'—'),last=[...run.last];
    const messages={
      roll:()=>T('操場點名 ','Roll call: ')+d.served+'/'+d.total+' · '+d.end+' s',
      stairs:()=>T('樓梯清空　西 ','Stair clearance · W ')+clear[0]+T('／東 ',' / E ')+clear[1],
      floors:()=>T('樓層到齊　','Floor completion: ')+'2F '+last[0]+' s / 3F '+last[1]+' s',
      measure:()=>(m.channel==='field'?T('操場','Field'):sideName(Number(m.channel==='east')))+' · A–B '+m.dt+' s · '+short(m.slope)+T(' 人/s',' people/s'),
      intervals:()=>T('等距取樣 ','Equal intervals: ')+m.samples.join(' → ')+T(' 人',' people')
    };
    if(type==='measure'||type==='intervals')sampled=true;
    emit(type==='measure'&&countSite!=='field'?'stairFlow':type,{...d,...m});sync();addLog(messages[type]);
  }
  function compareRuns() {
    if(phase!=='done'||!baseline)return;const d=C.compare(baseline,run);if(!d)return;
    emit('comparison',d);addLog(()=>T('基準 ','Baseline ')+d.baseTime+' s → '+d.end+' s ('+(d.delta>0?'+':'')+d.delta+' s)');
  }
  const modeKeys=['sizesVary','speedsVary','delaysVary'];
  function updateRooms() {
    for(const btn of $('roomGrid').children){
      const slot=Number(btn.dataset.room),c=q.origins.indexOf(slot);
      btn.firstChild.textContent=(slot>=3?'3F':'2F')+' · '+T(['西','中','東'][slot%3],['W','C','E'][slot%3]);
      btn.lastChild.textContent=C.classes[c]+T(' 班','');
      btn.disabled=!canEdit();btn.setAttribute('aria-pressed',String(selectedRoom===slot));
    }
    $('roomStatus').textContent=selectedRoom===null?'':T('已選 ','Selected ')+C.classes[q.origins.indexOf(selectedRoom)]+T(' 班，請選另一間教室。',' · choose the other room.');
  }
  function swapRooms(a,b) {
    const ca=q.origins.indexOf(a),cb=q.origins.indexOf(b);
    [q.origins[ca],q.origins[cb]]=[b,a];selectedRoom=null;changePlan();
  }
  let dragSlot=null,suppressRoomClick=false;
  const grid=$('roomGrid');
  for(const slot of [3,4,5,0,1,2]){
    const b=document.createElement('button');b.type='button';b.dataset.room=slot;b.append(document.createElement('span'),document.createElement('b'));grid.append(b);
    b.addEventListener('click',()=>{
      if(suppressRoomClick||!canEdit())return;
      if(selectedRoom===null||selectedRoom===slot){selectedRoom=selectedRoom===slot?null:slot;updateRooms();}
      else swapRooms(selectedRoom,slot);
    });
  }
  const hoverRoom=e=>document.elementFromPoint(e.clientX,e.clientY)?.closest('#roomGrid button');
  const clearDrop=()=>{grid.querySelector('.target')?.classList.remove('target');dragSlot=null;};
  grid.addEventListener('pointerdown',e=>{const b=e.target.closest('button');if(!b||!canEdit())return;dragSlot=Number(b.dataset.room);b.setPointerCapture(e.pointerId);});
  grid.addEventListener('pointermove',e=>{if(dragSlot===null)return;grid.querySelector('.target')?.classList.remove('target');hoverRoom(e)?.classList.add('target');});
  grid.addEventListener('pointercancel',clearDrop);
  grid.addEventListener('pointerup',e=>{
    const b=hoverRoom(e);
    if(b&&dragSlot!==null&&Number(b.dataset.room)!==dragSlot){swapRooms(dragSlot,Number(b.dataset.room));suppressRoomClick=true;setTimeout(()=>{suppressRoomClick=false;},0);}
    clearDrop();
  });
  for(const id of [...modeKeys,'merge','seed'])$(id).addEventListener('change',changePlan);
  listen('reroll',()=>{const seed=crypto.getRandomValues(new Uint32Array(1))[0];$('seed').value=seed===q.seed?(seed+1)>>>0:seed;changePlan();});
  for(const [id,preset] of Object.entries(C.quakePresets))listen(id,()=>{
    for(const [k,v] of Object.entries(preset))writeNumber($(k),v);
    changePlan();
  });
  $('countSite').addEventListener('change',()=>{countSite=$('countSite').value;updateMeasurement();paintChart();});
  for(const [c,name] of C.classes.entries()){
    const btn=document.createElement('button');btn.type='button';btn.dataset.class=name;btn.addEventListener('click',()=>assign(c,1-q.routes[c]));$('routeList').append(btn);
  }
  formKeys.forEach(k=>$(k).addEventListener('input',changePlan));$('closure').addEventListener('change',changePlan);$('push').addEventListener('change',changePlan);
  for(const [i,k] of ['cursorA','cursorB'].entries())$(k).addEventListener('input',()=>{if(!writingInputs)setCursor(i,LabNum.value($(k)));});
  listen('safeRoutes',()=>{if(!canEdit()||q.closed<0)return;q.routes=q.routes.map(s=>s===q.closed?1-s:s);changePlan();});
  listen('shortest',()=>{q.routes=q.origins.map(room=>C.shortest[room]);changePlan();});
  for(const f of [1,2,3])listen('floor'+f,()=>{if(viewWanted)setView(false);selectFloor(f);});
  listen('view2d',()=>setView(false));listen('view3d',()=>setView(true));listen('resetCam',()=>view?.cameraPreset(0));listen('stairCam',()=>view?.cameraPreset(1));
  listen('startDrill',start);listen('protect',protectionAction);listen('advance',movePhase);listen('depart',depart);
  listen('pause',()=>{running=!running;lastFrame=0;sync();schedule();});listen('finish',()=>{if(phase==='moving'){replayRate=32;running=true;lastFrame=0;sync();schedule();}});listen('clearAll',clearRecords);
  listen('soundBtn',()=>{LabSettings.set('sound',!LabSound.enabled());sync();});
  for(const [i,id] of ['ex1','ex2','ex3'].entries())listen(id,()=>applyExample(i));
  for(const [id,type] of Object.entries({recordRoll:'roll',recordStairs:'stairs',recordFloors:'floors',recordSlope:'measure',recordIntervals:'intervals'}))listen(id,()=>observe(type));
  listen('saveBase',()=>{if(phase!=='done')return;baseline=run;const time=run.end;sync();addLog(()=>T('基準已保存 ','Baseline saved: ')+time+' s');});listen('compare',compareRuns);
  listen('fineWidths',()=>{
    if(viewWanted)setView(false);if(floor===1)selectFloor(2);fine=!fine;
    if(!pad) {
      const point=key=>{const r=$('map').getBoundingClientRect(),a=mapGeo.handle(Number(key==='east'));return{x:r.left+a.x,y:r.top+a.y};};
      pad=LabVPad.mount({id:slug,canvas:$('map'),objects:['west','east'],steps:[1,5,10],step:5,lens:false,
        selected:()=>fineSide,select:k=>{fineSide=k;},point,visible:()=>fine&&!viewWanted&&canEdit(),
        move:(x,y,k)=>setWidth(k,q[k]+(x||y)/100),reading:()=>short(q[fineSide])+' m',
        record:()=>{fine=false;pad.refresh();info(()=>T('已套用樓梯淨寬。','Stair widths applied.'));}});
      const relabel=()=>{
        const btn=pad.element.querySelector('.vpad-select');const name=sideName(Number(fineSide==='east'));
        if(btn.textContent!==name+' ⇄')btn.textContent=name+' ⇄';
        btn.setAttribute('aria-label',T('切換樓梯 ','Switch stair: ')+name);
        pad.element.setAttribute('aria-label',T('樓梯寬度微調','Stair width fine control'));
        pad.element.querySelectorAll('.vpad-direction').forEach(b=>b.setAttribute('aria-label',T('調整樓梯寬度 ','Adjust stair width ')+b.textContent));
      };
      new MutationObserver(relabel).observe(pad.element.querySelector('.vpad-select'),{childList:true});relabel();
    }
    if(fine){$('map').scrollIntoView({block:'center',behavior:'instant'});pad.collapse(false);}
    pad.refresh();
  });
  addEventListener('lab:themechange',()=>{D.refresh();backdropKey='';view?.theme();sync();});
  addEventListener('lab:settingschange',()=>{backdropKey='';renderLog();sync();});
  document.addEventListener('visibilitychange',()=>{lastFrame=0;if(!document.hidden){redraw();schedule();}});
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{if(reduced()&&phase==='moving')finish();else schedule();});
  new ResizeObserver(()=>{backdropKey='';redraw();}).observe($('stage'));
  fillForm();sync();
  LabSide.mount({module:slug,steps:stepData,guide:i=>{const id=stepData()[i].id;window.LabDeck?.reveal($(id));LabStepGuide.show(i,{key:slug});}});
  const compactTools=matchMedia('(max-width: 600px) and (orientation: portrait), (orientation: landscape) and (max-height: 600px)');
  function placeSideTabs() {
    const rail=document.querySelector('.labside-rail'),host=compactTools.matches?$('railSlot'):document.body;
    if(rail&&rail.parentElement!==host)host.append(rail);
  }
  placeSideTabs();compactTools.addEventListener('change',placeSideTabs);
})();

