/* Each narrated frame is reconstructed from the page, cue times and playhead.
   Only the hands-on model and the user's camera are additional inputs. */
(function () {
  'use strict';
  const D = window.LabDraw, C = window.LearnPhysics;
  const clip = n => Math.min(1, Math.max(0, n));
  const TAU = Math.PI * 2, rad = a => a * Math.PI / 180;
  const suitcasePages = new Set(['1-2','2-2','3-7','3-8','5-1','5-2','5-3','5-4','7-1']);
  const keys = ['F','S','parallel','perp','friction','normal','weight','positive','negative','K','U','spring'];
  function palette() {
    const css = getComputedStyle(document.documentElement);
    return Object.fromEntries(keys.map(k => [k, css.getPropertyValue('--ink-'+k).trim()]));
  }
  const skin = '#dcab85', shell = '#357878', wood = '#aa734b';
  function box(c,x,y,w,h,r,fill,edge) {
    D.roundRect(c,x,y,w,h,r); c.fillStyle=fill; c.fill();
    if (edge) { c.strokeStyle=edge; c.lineWidth=1; c.stroke(); }
  }
  function line(c,points,color,width=2) {
    c.strokeStyle=color; c.lineWidth=width; c.beginPath();
    points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y)); c.stroke();
  }
  function oval(c,x,y,rx,ry,col) { c.fillStyle=col; c.beginPath(); c.ellipse(x,y,rx,ry,0,0,TAU); c.fill(); }
  function grad(c,x,y,h,top,bottom) {const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;}
  function bag(c,x,y,k=1,handle=false,angle=C.angle43) {
    c.save(); c.translate(x,y); c.scale(k,k);
    if (handle) {
      const a=rad(angle), bx=23+64*Math.cos(a), by=-68-64*Math.sin(a);
      for(const dx of [-4,3]) {line(c,[[23+dx,-68],[bx+dx,by]],'#324b52',3.5);line(c,[[23+dx,-68],[bx+dx,by]],'#c6d7d4',1.4);}
      line(c,[[bx-4,by],[bx+5,by]],'#243b40',6);
    } else {
      c.strokeStyle='#263f43';c.lineWidth=5;c.beginPath();c.ellipse(0,-68,12,12,0,Math.PI,TAU);c.stroke();
    }
    if(handle)for(const wx of [-20,20]) {D.ball(c,wx,-3,5,'#27383a');oval(c,wx,-3,2,2,'#9ca9a4');}
    box(c,-30,-70,60,65,12,grad(c,0,-70,65,'#65a5a0','#185255'),'#24484b');
    if(handle) {
      for(let j=-22;j<=22;j+=8) box(c,j,-62,3.7,48,2,grad(c,0,-62,48,'#7eaaa3','#2d6564'));
    } else {
      for(const side of [-1,1]){c.strokeStyle='#38595b';c.lineWidth=3;c.beginPath();c.ellipse(side*26,-38,7,21,side*.12,0,TAU);c.stroke();}box(c,-24,-43,48,32,8,grad(c,0,-43,32,'#4e8d89','#2d6869'),'#244e54');
      line(c,[[-21,-37],[20,-37]],'#bed0b2',2); box(c,-5,-61,12,8,2,'#cfaa70');
      line(c,[[18,-36],[17,-29]],'#e3bf86',2);
    }
    line(c,[[-23,-59],[-23,-49]],'#a2c4b5',1.2); c.restore();
  }
  // The grip point is the origin. The raised dorsal knuckles face the camera.
  function hand(c,x,y,size,flip=1,support=false) {
    c.save();c.translate(x,y);c.scale(size*flip,size);
    const outline='#91634e', flesh=grad(c,0,-10,21,'#f6d4b5','#b57c5e');
    c.lineWidth=.9;c.strokeStyle=outline;c.fillStyle=flesh;c.beginPath();
    c.moveTo(-39,-6);c.bezierCurveTo(-29,-7,-20,-7,-15,-10);
    c.bezierCurveTo(-9,-13,-4,-12,0,-9);c.quadraticCurveTo(6,-8,7,-3);
    c.quadraticCurveTo(9,4,2,6);c.bezierCurveTo(-5,12,-12,10,-19,6);
    c.lineTo(-39,7);c.closePath();c.fill();c.stroke();
    for(let i=0;i<4;i++){
      const knuckle=-6+i*3.4,base=-8+i*1.3,end=support?knuckle+14-i:knuckle+5;
      c.beginPath();c.moveTo(knuckle-2,base);c.quadraticCurveTo(knuckle+3,base-4,end,base+1);
      c.quadraticCurveTo(end+4,base+(support?0:9),end,base+(support?4:10));
      c.quadraticCurveTo(end-2,base+(support?6:10),end-3,base+4);
      c.lineTo(knuckle-2,base+4);c.fillStyle=flesh;c.fill();c.stroke();
      oval(c,end,base+(support?2:6),1.4,2,'#f0c7b0');
      line(c,[[knuckle,base+1],[knuckle+1.8,base+1.5]],'#b38268',.65);
    }
    c.beginPath();c.moveTo(-13,4);c.quadraticCurveTo(-4,7,3,2);c.quadraticCurveTo(9,1,8,5);
    c.quadraticCurveTo(0,13,-10,10);c.fillStyle=flesh;c.fill();c.stroke();
    for(const i of [0,1])line(c,[[-21,0+i*3],[-12,-2+i*2],[-7,-5+i*2]],'#c09175',.65);
    box(c,-48,-8,13,17,2,grad(c,0,-8,17,'#799998','#385b66'),'#355461');
    line(c,[[-38,-6],[-38,6]],'#b1bdac',1);c.restore();
  }
  function person(c,x,y,scale,pose,phase=0) {
    c.save();c.translate(x,y);c.scale(scale,scale);
    const walk=pose==='walk',stride=walk?Math.sin(phase)*13:0;
    for(const side of [-1,1]){
      const knee=side*(5+stride*.4),foot=side*(7+stride);
      line(c,[[side*5,-59],[knee,-32],[foot,-7]],side<0?'#294454':'#476271',10);
      line(c,[[side*5,-57],[knee-2,-31],[foot-1,-11]],'#69818a',1.2);
      box(c,foot-6,-8,19,7,3,'#263b42');line(c,[[foot-5,-1],[foot+12,-1]],'#b3ae96',1.6);
    }
    box(c,-3,-119,11,16,4,grad(c,0,-118,13,'#ad795e','#e4b493'));
    c.fillStyle=grad(c,0,-109,55,'#92aaa0','#3c6973');c.beginPath();c.moveTo(-10,-107);
    c.quadraticCurveTo(1,-114,13,-105);c.lineTo(17,-57);c.quadraticCurveTo(0,-51,-12,-57);c.closePath();c.fill();
    line(c,[[1,-105],[6,-100],[11,-106]],'#d4c5a5',2);line(c,[[-7,-82],[-4,-61],[2,-58]],'#54797a',1.4);
    oval(c,2,-130,13,17,grad(c,0,-146,33,'#f1cfac','#c29070'));oval(c,14,-129,3.8,2.8,'#d6a482');
    oval(c,-7,-136,7.5,11,'#343c39');oval(c,1,-141,13.5,7,'#343c39');
    line(c,[[-7,-141],[-1,-145],[7,-144]],'#56564c',1.4);oval(c,-6,-128,3,4,'#dba682');
    oval(c,10,-134,1.1,1.1,'#36403a');line(c,[[9,-122],[13,-123]],'#986e5d',.9);
    const grip=walk?[20,-60]:[44,-80], elbow=walk?[14,-78]:[15,-79];
    line(c,[[6,-99],elbow],'#4e747b',11);line(c,[[5,-100],[elbow[0]-2,elbow[1]-2]],'#86a59e',4);
    line(c,[elbow,[grip[0]-5,grip[1]-1]],'#c99875',6);
    hand(c,grip[0],grip[1],.46);c.restore();
  }
  function bucket(c,x,y,k=1) {
    c.save();c.translate(x,y);c.scale(k,k);c.strokeStyle='#858f8d';c.lineWidth=2.8;
    c.beginPath();c.ellipse(0,-26,16,24,0,Math.PI,TAU);c.stroke();
    c.fillStyle=grad(c,0,-28,39,'#88b8be','#3a6b76');c.beginPath();c.moveTo(-20,-27);c.lineTo(-15,7);c.quadraticCurveTo(0,13,15,7);c.lineTo(20,-27);c.closePath();c.fill();
    oval(c,0,-27,20,5,'#c4dad6');oval(c,0,-27,17,3.5,'#719eaa');line(c,[[-14,-17],[-11,3]],'#b1cecb',2);c.restore();
  }
  function block(c,x,y,w=42,h=32,color=wood) {
    D.contactShadow(c,x+w/2,y+h,w*.56,0);D.block(c,x,y,w,h,color,{r:3,shadow:false});
    for(let i=1;i<=3;i++)line(c,[[x+4,y+h*i/4],[x+w*.51,y+h*i/4-1.5],[x+w-4,y+h*i/4+1]],D.alpha('#503e32',.22),.8);
  }
  function room(c,w,h,dark,kind) {
    const chalk=kind==='board', wall=dark?'#263b42':'#e3e4d7', floor=dark?'#324344':'#c4b098';
    c.fillStyle=chalk?grad(c,0,0,h,'#243f3c','#142e30'):grad(c,0,0,h,wall,dark?'#3b4f52':'#f4edda');c.fillRect(0,0,w,h);
    if(chalk) {
      for(let x=0;x<w;x+=18)line(c,[[x,0],[x,h]],'rgba(211,231,208,.045)',.6);
      for(let y=0;y<h;y+=18)line(c,[[0,y],[w,y]],'rgba(211,231,208,.045)',.6);
      return;
    }
    const horizon=h*.72; c.fillStyle=grad(c,0,horizon,h*.3,floor,dark?'#202e32':'#d6c6ab');c.fillRect(0,horizon,w,h-horizon);
    const glow=dark?'#749493':'#fff5d8';
    for(let i=-1;i<Math.ceil(w/112);i++) {
      const x=i*112+14;box(c,x,13,90,h*.42,2,dark?'#354c51':'#c8cdbf');
      box(c,x+3,16,84,h*.42-6,1,grad(c,x,16,h*.42,dark?'#58747c':'#b7d4d2',glow));
      line(c,[[x+45,17],[x+45,h*.42+8]],dark?'#3e5658':'#d2d4c5',3);
      line(c,[[x,14+h*.42],[x+90,14+h*.42]],dark?'#50625e':'#afbaaa',3);
    }
    line(c,[[0,horizon],[w,horizon]],dark?'#6f7970':'#a8977d',3);
    for(let x=-w;x<=w*2;x+=60)line(c,[[w*.5+(x-w*.5)*.47,horizon],[x,h]],dark?'#263537':'#b7a489',.8);
    for(const p of [.15,.5,.91])line(c,[[0,horizon+(h-horizon)*p],[w,horizon+(h-horizon)*p]],dark?'#293a3b':'#b8a78c',.7);
  }
  function bowling(c,x,y,k) {
    D.contactShadow(c,x,y+19*k,23*k,0);D.ball(c,x,y,19*k,'#995c44');
    for(const [dx,dy] of [[0,-9],[-5,-5],[3,-3]])oval(c,x+dx*k,y+dy*k,1.8*k,2*k,'#56392f');
  }
  function pin(c,x,y,tilt=0) {
    c.save();c.translate(x,y);c.rotate(tilt);c.fillStyle=grad(c,0,-48,49,'#fff6df','#cebaa0');
    c.beginPath();c.moveTo(-6,0);c.bezierCurveTo(-14,-13,-4,-26,-4,-31);c.bezierCurveTo(-7,-49,7,-49,4,-31);c.bezierCurveTo(4,-25,14,-12,6,0);c.closePath();c.fill();line(c,[[-4,-29],[4,-29]],'#ad523f',3);c.restore();
  }
  function book(c,x,y,k=1) {
    c.save();c.translate(x,y);c.scale(k,k);box(c,-28,-11,56,12,2,'#8e493a');box(c,-24,-9,51,7,1,'#e0cba2');line(c,[[-24,-3],[25,-3]],'#a48c71',.8);box(c,-29,-13,58,3,1,'#bf7051');c.restore();
  }
  function trolley(c,x,y,kind) {
    for(const delta of [-15,16]) {D.ball(c,x+delta,y-4,6,'#364b50');oval(c,x+delta,y-4,2,2,'#b1c4bc');}
    D.block(c,x-24,y-16,48,10,'#669799',{r:3,shadow:false});if(kind==='cart'){block(c,x-13,y-35,30,18);line(c,[[x+22,y-12],[x+31,y-39],[x+39,y-39]],'#466569',3);}
  }
  function bike(c,x,y,phase) {
    c.save();c.translate(x,y);const axle=-22,crank=[4,-25],spin=phase*5;
    for(const wx of [-37,41]){
      D.contactShadow(c,wx,-1,20,.15);
      for(const [r,col,w] of [[21,'#26353a',4.5],[19,'#c9d1c9',1.4],[17.8,'#617678',.7]]){
        c.beginPath();c.arc(wx,axle,r,0,TAU);c.strokeStyle=col;c.lineWidth=w;c.stroke();
      }
      for(let i=0;i<16;i++){const a=spin+i*TAU/16;line(c,[[wx+2*Math.cos(a+.7),axle+2*Math.sin(a+.7)],[wx+18*Math.cos(a),axle+18*Math.sin(a)]],'#a4b2ad',.7);}
      D.ball(c,wx,axle,2.8,'#8c9d9c');
    }
    const tube=(a,b,w)=>{line(c,[a,b],'#693e31',w+1.5);line(c,[a,b],'#bc6e49',w);line(c,[[a[0],a[1]-1],[b[0],b[1]-1]],'#e8ad78',1);};
    const rear=[-37,axle],seat=[-11,-51],head=[25,-53];
    tube(rear,seat,2.5);tube(rear,crank,2.3);tube(seat,crank,4);tube(seat,head,3.7);tube(crank,head,4.4);tube(head,[41,axle],2.8);
    line(c,[seat,[-14,-58]],'#a6b3b0',3);box(c,-24,-61,20,5,2,'#303c3d');
    line(c,[head,[23,-61],[32,-63],[37,-62]],'#c3cbc2',2.8);line(c,[[32,-63],[38,-62],[36,-58]],'#354342',3);
    c.strokeStyle='#5e706d';c.lineWidth=1;c.beginPath();c.moveTo(32,-61);c.quadraticCurveTo(50,-53,32,-42);c.stroke();
    line(c,[[-37,-23],[4,-31],[8,-25],[4,-19],[-37,-20]],'#58615c',1);D.ball(c,4,-25,5.6,'#899892');
    const pedal=[4+9*Math.cos(spin),-25+9*Math.sin(spin)];line(c,[crank,pedal],'#cbd2c6',2);line(c,[[pedal[0]-4,pedal[1]],[pedal[0]+4,pedal[1]]],'#364442',2.8);
    const hip=[-13,-62],shoulder=[5,-81],knee=[9,-47+3*Math.sin(spin)];
    line(c,[hip,[-22,-44],[-5,-26]],'#37505f',5.8);line(c,[hip,knee],'#344c5e',8);line(c,[knee,pedal],'#c29578',4.6);
    line(c,[[pedal[0]-3,pedal[1]-1],[pedal[0]+4,pedal[1]-1]],'#344249',3.5);
    line(c,[hip,shoulder],'#416c71',13);line(c,[[-14,-65],[4,-83]],'#78978b',6);
    line(c,[[6,-81],[17,-69]],'#5f8382',7);line(c,[[17,-69],[32,-62]],'#d4a483',4.5);hand(c,33,-62,.24);
    line(c,[[5,-82],[10,-88]],'#b98569',5);oval(c,12,-91,7,8,'#dfb493');oval(c,18,-91,2,1.5,'#d6a382');
    oval(c,11,-96,8.5,4.4,'#526d6a');line(c,[[5,-97],[12,-99],[16,-98]],'#acbbb0',1);c.restore();
  }
  function energyObject(c,i,x,y,on) {
    c.save();c.translate(x,y); c.globalAlpha=on?1:.42;
    if(i===0){D.block(c,-18,-22,36,29,'#697d77',{r:4,shadow:false});for(let j=-11;j<=11;j+=7)line(c,[[j,-16],[j,1]],on?'#ed9756':'#929a80',3);}
    if(i===1){box(c,-20,-10,40,17,4,'#9d6551');oval(c,0,-10,19,6,'#dfd7af');for(let j=-9;j<15;j+=8)D.ball(c,j,-11,4,j>0?'#9baf77':'#cc9256');}
    if(i===2){line(c,[[0,8],[0,-21]],'#967252',3);box(c,-13,6,26,3,1,'#91694c');c.fillStyle=on?'#f3cd79':'#bba780';c.beginPath();c.moveTo(-14,-12);c.lineTo(-8,-28);c.lineTo(7,-28);c.lineTo(14,-12);c.fill();}
    if(i===3){D.ball(c,8,-23,8,'#ebbb64');c.fillStyle='#487780';c.beginPath();c.moveTo(-20,4);c.lineTo(-11,-10);c.lineTo(15,-10);c.lineTo(6,4);c.closePath();c.fill();for(let j=-12;j<11;j+=7)line(c,[[j,2],[j+6,-8]],'#9ebfc0',1);}
    if(i===4){for(const dx of [-8,7]){c.fillStyle='#9da9a4';c.beginPath();c.moveTo(dx-9,6);c.quadraticCurveTo(dx-3,-8,dx-6,-24);c.lineTo(dx+6,-24);c.quadraticCurveTo(dx+4,-6,dx+10,6);c.fill();oval(c,dx,-24,6,2,'#647574');}}
    c.restore();
  }
  function create(host) {
    const canvas=host.querySelector('#illustration'), ctx=canvas.getContext('2d'), web=host.querySelector('#luggage-3d');
    let three=null, pending=false, failed=false, last=null, scale=1, ox=0, oy=0, anchors={}, audit={labels:[],arrows:[]};
    let colors=palette(), dark=D.dark, classMode=false, boardScene=false;
    function refresh(){colors=palette();dark=D.dark;if(last)render(...last);}
    window.addEventListener('lab:themechange',refresh);
    const resize=new ResizeObserver(()=>{if(last)render(...last);});resize.observe(host);
    function model(page,t,mark,user){
      const after=(k,len=1)=>clip((t-mark(k))/len), trip=C.angle43;
      let x=0,angle=trip,dir=1,distance=0;
      if(page.id==='1-2'){distance=after('drag',6)*3;x=distance;}
      if(page.id==='2-2'){const back=mark('back');distance=t<back?5*clip(t/back):5+5*after('back',3);x=distance<=5?distance:10-distance;dir=distance>5?-1:1;}
      if(page.id==='3-7'){const go=after('go',2),back=after('come',2);x=5*(go-back);distance=5*(go+back);dir=back>0?-1:1;}
      if(page.id==='3-8'){
        const elapsed=clip(t/Math.max(.01,mark('fric'))),go=clip((elapsed-.37)/.28),back=clip((elapsed-.69)/.27);
        x=5*(go-back);distance=5*(go+back);dir=elapsed<.69?1:-1;
      }
      if(user){angle=user.angle;dir=user.direction;x=user.state.x;distance=user.state.distance;if(page.id==='7-1'){const glide=C.advance(C.initial(),user,t);distance=glide.distance;x=5*(1-Math.exp(-glide.x/30));}}
      return {x,angle,dir,distance,ice:user?.surface==='ice',id:page.id};
    }
    function render(page,t,timing,user,lang=false,cls=false) {
      last=[page,t,timing,user,lang,cls];classMode=cls;const id=page.id,threePage=suitcasePages.has(id);
      const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
      const dpr=Math.min(devicePixelRatio||1,2);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      const c=ctx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
      const m=(key,fallback=Infinity)=>timing.marks[key]??fallback;
      const at=(time,draw)=>{if(t>=time)draw(clip((t-time)/.55));};
      const phase=(key,d=1)=>clip((t-m(key))/d), u=clip(t/Math.max(.01,timing.dur-.6));
      const T=(z,e)=>lang?e:z;
      boardScene=['3-1','3-2','3-3','3-4','3-5','3-6','4-6','7-1b','7-2b','8-1','8-2'].includes(id);
      const frame=model(page,t,m,user);
      host.dataset.scene=id;host.classList.toggle('is-board',boardScene);
      web.hidden=!threePage||!three;host.classList.toggle('has-3d',threePage&&!!three);
      if(threePage&&!three&&!pending&&!failed){
        pending=true;Promise.all([import('../../vendor/three/three.module.min.js'),import('../../vendor/three/OrbitControls.js')]).then(([TH,{OrbitControls}])=>{
          three=makeThree(TH,OrbitControls,web,host,()=>{if(last)render(...last);});pending=false;if(last)render(...last);
        }).catch(()=>{pending=false;failed=true;host.dataset.renderer='canvas';});
      }
      if(three)three.visible(threePage);
      if(threePage&&three){three.draw(frame,w,h,dark);host.dataset.renderer='three';}
      else {room(c,w,h,dark,boardScene?'board':'room');host.dataset.renderer='canvas';}
      scale=Math.min(w/360,h/203);ox=(w-360*scale)/2;oy=(h-203*scale)/2;
      c.save();c.translate(ox,oy);c.scale(scale,scale);c.lineCap='round';c.lineJoin='round';
      audit={labels:[],arrows:[],bars:[]};anchors={};
      function label(text,x,y,ink,sub='',suffix='') {
        const font=Math.max(15/scale,14)*(classMode?1.4:1); const small=font*.68;
        c.font='600 '+font+'px system-ui';let a=c.measureText(text).width;c.font='600 '+small+'px system-ui';let b=sub?c.measureText(sub).width:0;
        c.font='600 '+font+'px system-ui';const tail=c.measureText(suffix).width,total=a+b+tail;
        const len=total+12,height=font*1.5;x=Math.max(-ox/scale+len/2+3,Math.min((w-ox)/scale-len/2-3,x));
        y=Math.max(-oy/scale+height/2+2,Math.min((h-oy)/scale-height/2-2,y));
        const rect={x:x-len/2,y:y-height/2,w:len,h:height};
        box(c,rect.x,rect.y,len,height,5,'rgba(19,40,43,.94)');
        c.fillStyle=ink||'#f1e9d8';c.textAlign='left';c.textBaseline='middle';c.font='600 '+font+'px system-ui';c.fillText(text,x-total/2,y);
        if(sub){c.font='600 '+small+'px system-ui';c.fillText(sub,x-total/2+a,y+font*.32);}
        if(suffix){c.font='600 '+font+'px system-ui';c.fillText(suffix,x-total/2+a+b,y);}
        audit.labels.push({text:text+sub+suffix,...rect});
      }
      const arrow=(x,y,xx,yy,col,dash)=>{D.arrow(c,x,y,xx,yy,col,2.8,{dash});audit.arrows.push([x,y,xx,yy]);};
      const meter=(x,y,len,p,col)=>{box(c,x,y,len,6,3,'#45615f');if(p>.005)box(c,x,y,Math.max(2,len*clip(p)),6,3,col);};
      function energyBar(x,y,width,symbol,sub,value,range,color){
        const font=Math.max(15/scale,13)*(classMode?1.4:1), display=String(Number(value.toFixed(1)))+' J';
        const backdrop='#193537';
        box(c,x-5,y-font*1.12,width+10,font*1.12+18,5,backdrop);
        c.textAlign='left';c.textBaseline='alphabetic';c.font='650 '+font+'px system-ui';
        c.fillStyle=color;c.fillText(symbol,x,y);
        if(sub){const dx=c.measureText(symbol).width;c.font='600 '+font*.7+'px system-ui';c.fillText(sub,x+dx,y+font*.24);}
        c.font='600 '+font+'px ui-monospace,monospace';c.textAlign='right';c.fillStyle=color;c.fillText(display,x+width,y);
        const innerWidth=width-2,filled=innerWidth*clip(value/range);
        box(c,x,y+6,width,7,3,'#253e40',color);
        if(filled>0)box(c,x+1,y+7,filled,5,Math.min(2,filled/2),color);
        audit.bars.push({symbol:symbol+(sub?'_'+sub:''),value,range,display,color,backdrop,frameWidth:innerWidth,filledWidth:filled});
      }
      if(threePage){
        let grip,pivot;
        if(three){const a=three.anchor();grip={x:(a.grip.x-ox)/scale,y:(a.grip.y-oy)/scale};pivot={x:(a.base.x-ox)/scale,y:(a.base.y-oy)/scale};anchors=a;audit.suitcase=a.bounds;}
        else {const x=138+frame.x*8,y=161;D.contactShadow(c,x,y,35,0);c.save();c.translate(x,y);c.scale(frame.dir,1);bag(c,0,0,.9,true,frame.angle);c.restore();pivot={x:x+20.7*frame.dir,y:y-61.2};grip={x:pivot.x+57.6*frame.dir*Math.cos(rad(frame.angle)),y:pivot.y-57.6*Math.sin(rad(frame.angle))};anchors={grip:{x:ox+grip.x*scale,y:oy+grip.y*scale},base:{x:ox+pivot.x*scale,y:oy+pivot.y*scale}};}
        if(id==='1-2')at(m('angle',.3),()=>{
          const a=Math.atan2(grip.y-pivot.y,grip.x-pivot.x),x=grip.x,y=grip.y;
          arrow(x,y,x+48*Math.cos(a),y+48*Math.sin(a),colors.F);arrow(x,y,x+55,y,colors.S);
          c.strokeStyle=colors.positive;c.beginPath();c.arc(x,y,17,a,0);c.stroke();
          label('F',x+4,y-37,colors.F);label('S',x+66,y+19,colors.S);label('θ',x+15,y+28);
        });
        if(id==='3-7'){
          const work=C.work(C.forces(C.angle43).parallel,5);
          at(m('go'),()=>label('+'+work+' J',75,170,colors.positive));
          at(m('come'),()=>label('+'+work+' J',280,170,colors.positive));
          at(m('waste'),()=>{if(t<m('sum')){label('= 0 ?',177,160);if(phase('waste')>.3)line(c,[[156,166],[198,153]],colors.negative,2);}});
        }
        if(id==='3-8'){
          const local=p=>({x:(p.x-ox)/scale,y:(p.y-oy)/scale}),dir=frame.dir;
          const contact=anchors.contact?local(anchors.contact):{x:pivot.x-17*dir,y:pivot.y+61};
          const center=anchors.center?local(anchors.center):{x:contact.x,y:contact.y-33};
          const x=contact.x,y=contact.y,dx=dir*48;
          arrow(x,y,x-dx,y,colors.friction);label('f',x-dx-dir*18,y,colors.friction,'k');
          arrow(center.x,center.y,center.x+dx,center.y,colors.S);label('S',center.x+dx+dir*15,center.y,colors.S);
          if(t>=m('grav')){arrow(center.x,center.y,center.x,y-3,colors.weight);label('mg',center.x+27*dir,center.y+(y-center.y)*.55,colors.weight);}
          const legs=host.querySelector('#trip-work').children;
          legs[0].hidden=frame.distance<5-.01;legs[1].hidden=frame.distance<10-.01;
        }
        if(user&&page.id.startsWith('5-')){
          const i=Number(page.id.slice(2)),x=(w-ox-98)/scale,cy=(52-oy)/scale,len=65,p=clip(t/Math.max(.01,timing.dur-.6));
          if(i===1||i===3){const target=i===1?C.angle43:90,a=rad(18+(target-18)*p);line(c,[[x,cy+14],[x+43,cy+14]],colors.S,1.5);arrow(x,cy+14,x+29*Math.cos(a),cy+14-29*Math.sin(a),colors.F);}
          else {line(c,[[x,cy],[x+len,cy]],colors.S,2);const u=i===4?1-Math.abs(2*p-1):p;D.ball(c,x+len*u,cy,4.5,colors.positive);if(i===4){line(c,[[x,cy+9],[x+len*p,cy+9]],colors.negative,3);}}
        }
        if(user){arrow(pivot.x,pivot.y,grip.x,grip.y,colors.F);const b=host.querySelector('#angle-handle');if(b){b.style.left=anchors.grip.x+'px';b.style.top=anchors.grip.y+'px';}}
      }else if(id==='1-1'){
        D.contactShadow(c,144,178,47,0);person(c,131,181,.98,'hold');bag(c,131+44*.98,181-80*.98+80*.78,.78);
        const zero=t>=m('zero'),seconds=zero?1800:Math.round(1800*clip(t/m('zero')));
        label(Math.floor(seconds/60).toString().padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'),70,38);
        at(m('zero',.3),()=>{c.setLineDash([4,4]);line(c,[[194,101],[248,101]],colors.S,1.6);c.setLineDash([]);label('S = 0',280,101,colors.S);});meter(42,61,56,zero?0:clip(t/m('zero')),colors.positive);
      }else if(id==='2-1'){
        const x=91+u*87;person(c,x,174,.85,'walk',t*3);bucket(c,x+20*.85,174-60*.85+50*.62,.62);
        arrow(76,187,280,187,colors.S);label('10 m',235,161,colors.S);
      }else if(['3-1','3-2','3-3','3-4'].includes(id)){
        const span=Math.max(1,m('change',5)-m('transfer',0)),rise=clip((t-m('transfer'))/span),brake=phase('change',2);
        const x=id==='3-1'?96+55*rise*rise+110/span*(2*brake-brake*brake):id==='3-2'?78+78*clip(t/Math.max(.3,m('w1',6))):112,y=id==='3-3'?157:140;
        if(id==='3-1'||id==='3-2')block(c,x,y-33,53,33);else bag(c,x,y,.73,true);
        if(id==='3-1'){
          const letGo=t>=m('change'),fx=x+53,fy=y-16,palm=fx+52+brake*30;
          if(!letGo){line(c,[[fx,fy],[palm-9,fy-11]],colors.F,2);hand(c,palm,fy-11,.8,-1);}
          else {hand(c,palm,fy-24-brake*10,.8,-1);line(c,[[fx,fy],[fx+12,fy+8],[fx+22,fy+12]],colors.perp,1.5);if(brake<1){arrow(x+14,y+10,x-25,y+10,colors.friction);label('f',x-30,y+31,colors.friction,'k');}}
          const energy=C.kinetic(C.mass,1),kinetic=C.kinetic(C.mass,rise*(1-brake)),heat=brake?energy-kinetic:0;
          energyBar(45,52,104,'K','',kinetic,energy,colors.K);
          energyBar(211,52,104,T('熱','Heat'),'',heat,energy,colors.negative);
          if(letGo)for(let j=0;j<4;j++){c.beginPath();c.moveTo(x+6+j*12,157);c.bezierCurveTo(x+15+j*12,151,x+j*12,146,x+7+j*12,142);c.strokeStyle=colors.negative;c.stroke();}
        }
        else if(id==='3-2'){arrow(x+55,119,x+116,119,colors.F);label('F',x+90,95,colors.F);line(c,[[103,151],[103,168]],colors.perp,1);if(x>82)arrow(103,160,x+25,160,colors.S);label('S',x+46,168,colors.S);}
        else {
          const ax=x+23*.73,ay=y-68*.73,bx=ax+92,by=ay-69;arrow(ax,ay,bx,by,colors.F);label('F',bx+22,by-5,colors.F);
          const sy=id==='3-4'?ay:ay+38;arrow(ax,sy,bx+27,sy,colors.S);if(id==='3-4')label('S',ax+66,sy+26,colors.S,'',' = 10 m');else label('S',bx+50,sy,colors.S);
          if(id==='3-3'){
            at(m('split'),()=>{c.setLineDash([3,4]);line(c,[[ax,by],[bx,by],[bx,ay],[ax,ay]],colors.perp,1);c.setLineDash([]);label(T('水平 4','Run 4'),ax+42,by-16,colors.parallel);label(T('鉛直 3','Rise 3'),ax-84,ay-5,colors.perp);label(T('斜邊 5','Side 5'),ax+64,ay-24,colors.F);});
            at(m('par'),p=>{arrow(ax,ay,ax+92*p,ay,colors.parallel);label('F',ax+59,ay+20,colors.parallel,'∥');});
            at(m('perp'),p=>{arrow(ax,ay,ax,ay-69*p,colors.perp,[4,3]);label('F',ax-25,by+18,colors.perp,'⊥');line(c,[[ax-5,by+10],[ax+5,by+19]],colors.negative,2);line(c,[[ax+5,by+10],[ax-5,by+19]],colors.negative,2);});
          }else at(m('sp'),()=>{const end=ax+119,px=ax+119*.64,py=ay-119*.48;arrow(ax,ay,px,py,colors.S);arrow(px,py,end,ay,colors.perp,[4,3]);label('S',ax+8,ay-55,colors.S,'∥',' = 8 m');label('S',end+28,ay-29,colors.perp,'⊥',' = 6 m');label(T('✓ 兩種算法一樣','✓ Same work'),ax+50,163,colors.positive);const mx=(px+end)/2,my=(py+ay)/2;line(c,[[mx-4,my-4],[mx+4,my+4]],colors.negative,2);line(c,[[mx-4,my+4],[mx+4,my-4]],colors.negative,2);});
        }
      }else if(['3-5','7-1b'].includes(id)){
        ['pos','neg','none'].forEach((key,i)=>{const x=25+i*112, y=108, a=[-35,-145,-90][i],v=id==='7-1b'?clip(u*4-i*.55):phase(key);block(c,x+25,y,22,15);arrow(x+36,y,x+36+32*Math.cos(rad(a)),y+32*Math.sin(rad(a)),colors.F);arrow(x+17,y+24,x+62,y+24,colors.S);
          if(v){const col=[colors.positive,colors.negative,colors.perp][i];label(['W > 0','W < 0','W = 0'][i],x+35,45,col);line(c,[[x+76,114],[x+76,114+[-26,26,0][i]*v]],col,7);if(id==='7-1b'||t>=m('meaning'))label([T('交出能量','Gives'),T('拿走能量','Takes'),T('沒有傳能量','No transfer')][i],x+33,164,col);}});
      }else if(id==='3-6'){
        D.ball(c,62+9*Math.sin(t*.8),104,13,'#9caeb7');
        const middle=t>=m('s0')&&t<m('ninety')&&(t-m('s0'))<(m('ninety')-m('s0'))*.52;
        person(c,153,149,.55,'hold');
        if(middle){D.block(c,177,64,15,85,'#87958c',{r:1});for(let j=0;j<4;j++)line(c,[[178,76+j*17],[190,76+j*17]],'#637269',1);}
        else {bag(c,185,107,.38);if(t>=m('s0'))label('30:00',161,56);}
        const third=t<m('ninety')?0:Math.min(2,Math.floor(3*(t-m('ninety'))/Math.max(.01,timing.dur-m('ninety'))));
        if(third===0){bucket(c,286,118,.66);arrow(285,80,285,54,colors.F);arrow(265,141,313,141,colors.S);}
        else if(third===1){const a=t*1.4,x=288+29*Math.cos(a),y=100+29*Math.sin(a);c.strokeStyle='#678079';c.beginPath();c.arc(288,100,29,0,TAU);c.stroke();line(c,[[288,100],[x,y]],colors.perp,1.4);D.ball(c,x,y,5,'#b8ccc3');D.ball(c,288,100,2.5,'#b8ccc3');arrow(x,y,288,100,colors.F);arrow(x,y,x-21*Math.sin(a),y+21*Math.cos(a),colors.S);}
        else {block(c,272,108,31,23);line(c,[[255,133],[324,133]],'#a9b7a9',2);arrow(287,125,287,76,colors.normal);arrow(287,125,320,125,colors.S);line(c,[[287,117],[295,117],[295,125]],colors.perp,1);label('N',306,68,colors.normal);}
        ['f0','s0','ninety'].forEach((k,i)=>at(m(k),()=>label(['F = 0','S = 0','90°'][i],63+116*i,169,colors.S)));
      }else if(id==='4-1'||id==='4-5'){
        const marks=['heat','chem','elec','light','nuke'],labs=[T('熱能','Heat'),T('化學能','Chemical'),T('電能','Electric'),T('光能','Light'),T('核能','Nuclear')];
        for(let i=0;i<5;i++){const x=42+i*69,on=id==='4-1'?t>=m('ability'):t>=m(marks[i]);block(c,x-24,133,48,5);energyObject(c,i,x,123,on);if(on||id==='4-1')label(labs[i],x,158+i%2*22);}
      }else if(id==='4-2'){const travel=phase('move',2),rev=phase('nonneg',2),dbl=phase('double',1);const x=81+139*travel-109*rev+117*dbl;bowling(c,x,137,1.1);[0,1,2].forEach((n)=>pin(c,244+n*15,160-n*4,travel*.9+n*.14));meter(68,48,166,.18*travel+.54*dbl,colors.K);if(dbl){label('K ×'+C.answers().ratio,269,48,colors.K);label('v ×2',112,77,colors.S);}}
      else if(id==='4-3'){
        const up=phase('lift',2),down=phase('fall',1.6)**2,high=phase('high',1);
        const h=(.75*high+.25*up)*(1-down),x=161+72*high-60*up,y=158-72*h;
        block(c,216,108,67,7);block(c,216,115,5,37);block(c,278,115,5,37);book(c,x,y);
        line(c,[[93,158],[291,158]],colors.perp,1);label('h = 0',70,177,colors.perp);
        const full=C.potential(1,1);
        energyBar(29,29,111,'U','',C.potential(1,h),full,colors.U);
        energyBar(212,29,111,'K','',C.potential(1,down),full,colors.K);
        if(up){const sign=down>0?1:-1;arrow(x-39,y-6,x-39,y+20,colors.weight);
          arrow(x+40,y-7*sign,x+40,y+18*sign,colors.S);
          label('W',282,65,down>0?colors.positive:colors.negative,'g',down>0?' > 0':' < 0');}
      }
      else if(id==='4-4'){
        const compress=phase('spring',2),p=phase('mech',2.4),extension=compress*(1-p);
        const x=143-24*extension+95*p;block(c,57,102,13,55);
        const points=[];for(let j=0;j<=100;j++)points.push([70+j*(51-23*extension)/100,138+Math.sin(j/100*TAU*8)*8]);
        D.tube(c,()=>points.forEach(([xx,yy],i)=>i?c.lineTo(xx,yy):c.moveTo(xx,yy)),'#70aaa6',3);
        trolley(c,x,155);const total=C.kinetic(C.mass,1),stored=total*extension**2;
        energyBar(33,58,108,'U','e',stored,total,colors.spring);energyBar(214,58,108,'K','',p?total-stored:0,total,colors.K);
      }
      else if(id==='4-6'){
        const f=phase('derive',1.8),bx=88+119*f;
        label(T('不會考','Off the exam'),95,31);at(m('exam'),()=>{line(c,[[62,41],[126,22]],colors.negative,2);label(T('決勝點','What counts'),242,31,colors.positive);});
        block(c,bx,103,37,27);arrow(bx+36,115,bx+80,115,colors.F);label('F',bx+60,87,colors.F,T('合','net'));
        const start=88+37/2,end=start+119;
        label('v',start,74,colors.S,'0');label('v',end,66,colors.S);
        arrow(start,153,end,153,colors.S);label('S',(start+end)/2,178,colors.S);
      }
      else if(id==='6-1'){const y=146-55*u;block(c,158,y-34,40,32,'#849799');hand(c,174,y+2,1.12,1,true);arrow(224,150,224,94,colors.S);label('2 m',261,127,colors.S);}
      else if(id==='6-2'){const x=100+105*u,y=154-37*clip(u*4);bag(c,x,y,.65);line(c,[[71,159],[71,119]],colors.S,2);label('0.8 m',65,91,colors.S);arrow(112,177,265,177,colors.S);label('15 m',254,149,colors.S);}
      else if(id==='7-2b'){
        const cards=host.querySelectorAll('[data-energy]');
        cards.forEach((card,i)=>card.style.setProperty('--reveal',String(.25+.75*clip(u*3-i))));
      }
      else if(id==='7-2'){const gx=113+85*u+39;trolley(c,gx-39,151,'cart');arrow(gx,112,gx+58,112,colors.F);label('30 N',gx+29,86,colors.F);arrow(76,175,267,175,colors.S);label('8 m',290,175,colors.S);}
      else if(id==='7-3'){bike(c,101+138*u,168,t);label('3 m/s',83,38);label('6 m/s',270,38);arrow(134,38,217,38,colors.S);}
      else if(id==='8-1'||id==='8-2'){
        const example=C.examples(),full=[example.hand,example.backpackK,example.dU],range=Math.max(...full);
        for(let i=0;i<3;i++){
          const x=62+116*i,r=clip(u*3-i*.6);D.contactShadow(c,x,141,30,0);
          if(i===0){const y=132-30*r;block(c,x-11,y-19,24,18,'#849799');hand(c,x-1,y+1,.49,1,true);arrow(x+25,132,x+25,105,colors.F);}
          if(i===1){bag(c,x-13+26*r,136,.55);arrow(x-23,76,x+22,76,colors.S);}
          if(i===2){bag(c,x,137-24*r,.55);line(c,[[x-23,139],[x+23,139]],colors.perp,1);}
          energyBar(x-45,167,90,['W','K','U'][i],'',full[i]*r,range,[colors.positive,colors.K,colors.U][i]);
        }
      }
      c.restore();
      return audit;
    }
    function angleAt(clientX,clientY,dir){
      const b=host.getBoundingClientRect(), x=clientX-b.left,y=clientY-b.top;
      if(three&&host.dataset.renderer==='three')return three.angleAt(x,y,dir);
      return Math.max(0,Math.min(90,Math.atan2(anchors.base.y-y,dir*(x-anchors.base.x))*180/Math.PI));
    }
    function hitBody(x,y){if(three&&host.dataset.renderer==='three')return three.hitBody(x,y);const base=anchors.base;return !!base&&Math.abs(x-base.x)<48*scale&&y>base.y&&y<base.y+73*scale;}
    return {render,angleAt,hitBody,reset(){three?.reset();},get anchors(){return anchors;},get geometry(){return audit;},get colors(){return colors;},refresh};
  }

  function makeThree(TH,OrbitControls,canvas,host,invalidate) {
    const renderer=new TH.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:false});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=TH.PCFSoftShadowMap;renderer.outputColorSpace=TH.SRGBColorSpace;
    const scene=new TH.Scene(),camera=new TH.PerspectiveCamera(31,1,.1,65);
    const controls=new OrbitControls(camera,canvas);controls.enableDamping=false;
    controls.minDistance=2.2;controls.maxDistance=12;controls.maxPolarAngle=Math.PI*.48;
    const nav=LabView3DNav.attach({THREE:TH,controls,canvas,host,radius:5,T:LabSettings.t});
    function home(){camera.position.set(1.58,2.89,5.78);controls.target.set(.12,1.53,0);controls.update();nav.home();}
    home();let drawing=false;
    controls.addEventListener('change',()=>{if(!drawing)invalidate();});
    const v=(x,y,z)=>new TH.Vector3(x,y,z);
    const mat=(col,rough=.62,metal=.06)=>new TH.MeshStandardMaterial({color:col,roughness:rough,metalness:metal});
    const polymer=mat(0x348984,.32,.20),seam=mat(0x243a40,.57),rubber=mat(0x202e31,.91);
    const satin=mat(0xa6b5ae,.36,.7),brass=mat(0xd1a261,.43,.38),ribs=mat(0x58a39a,.40,.17);
    function mesh(parent,geo,material,x=0,y=0,z=0){const o=new TH.Mesh(geo,material);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
    const cube=(parent,w,h,d,material,x,y,z)=>mesh(parent,new TH.BoxGeometry(w,h,d),material,x,y,z);
    function rounded(parent,w,h,d,r,material,x,y,z){
      const s=new TH.Shape(),a=-w/2,b=-h/2;
      s.moveTo(a+r,b);s.lineTo(-a-r,b);s.quadraticCurveTo(-a,b,-a,b+r);s.lineTo(-a,-b-r);s.quadraticCurveTo(-a,-b,-a-r,-b);s.lineTo(a+r,-b);s.quadraticCurveTo(a,-b,a,-b-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);
      const bevel=Math.min(.035,d*.22,r*.4);
      return mesh(parent,new TH.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSegments:3,bevelSize:bevel,bevelThickness:bevel,curveSegments:5}),material,x,y,z-d/2);
    }
    function rod(parent,a,b,r,material,r2=r) {
      const delta=b.clone().sub(a),mid=a.clone().addScaledVector(delta,.5);
      const o=mesh(parent,new TH.CylinderGeometry(r2,r,delta.length(),14),material,mid.x,mid.y,mid.z);
      o.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize());return o;
    }
    function ball(parent,x,y,z,sx,sy,sz,material){const o=mesh(parent,new TH.SphereGeometry(1,18,14),material,x,y,z);o.scale.set(sx,sy,sz);return o;}
    const bagRoot=new TH.Group();scene.add(bagRoot);
    rounded(bagRoot,.98,1.12,.43,.14,seam,0,.82,0);
    for(const z of [-.14,.14]) rounded(bagRoot,1.0,1.13,.20,.145,polymer,0,.82,z);
    for(const z of [-.287,.287])for(let i=-3;i<=3;i++){const h=.82-.045*Math.abs(i);rounded(bagRoot,.043,h,.024,.020,ribs,i*.113,.80,z);rounded(bagRoot,.010,h-.039,.012,.005,satin,i*.113-.014,.80,z+Math.sign(z)*.012);}
    rounded(bagRoot,.18,.069,.02,.016,brass,.266,1.27,.292);
    for(let j=-1;j<=1;j++)cube(bagRoot,.023,.022,.004,seam,.268+j*.037,1.27,.312);
    for(const x of [-.47,.47]){rounded(bagRoot,.055,.25,.1,.025,seam,x,.43,.18);}
    // Zipper teeth and twin pulls on the continuous centre seam.
    for(let i=0;i<18;i++)cube(bagRoot,.009,.025,.017,satin,.518,.39+i*.049,.012);
    for(const y of [.82,.93]){rod(bagRoot,v(.535,y,0),v(.55,y-.137,.032),.014,brass);}
    const wheels=[];
    for(const x of [-.34,.34])for(const z of [-.19,.19]){
      cube(bagRoot,.10,.14,.075,seam,x,.20,z);const group=new TH.Group();group.position.set(x,.109,z);bagRoot.add(group);
      rod(group,v(0,0,-.045),v(0,0,.045),.104,rubber);rod(group,v(0,0,-.049),v(0,0,.049),.061,satin);
      for(let i=0;i<4;i++){const a=i*Math.PI/2;rod(group,v(0,0,.052),v(.05*Math.cos(a),.05*Math.sin(a),.052),.008,seam);}wheels.push(group);
    }
    const handle=new TH.Group();bagRoot.add(handle);handle.position.set(.31,1.33,0);
    for(const z of [-.135,.135]){
      rod(handle,v(0,0,z),v(.47,0,z),.034,seam);rod(handle,v(.43,0,z),v(.97,0,z),.024,satin);
      rod(handle,v(.44,0,z),v(.48,0,z),.034,brass);
    }
    rod(handle,v(.96,0,-.18),v(.96,0,.18),.052,seam);rod(handle,v(.962,.014,-.105),v(.962,.014,.105),.045,rubber);
    const actor=new TH.Group();scene.add(actor);
    const jacket=mat(0x537d80),shoulderCloth=mat(0x688d8a),stitch=mat(0xaab29e);
    const pants=mat(0x404e5c),flesh=mat(0xdcae89),skinShadow=mat(0xbd896c),hair=mat(0x373b35),shoe=mat(0x344344);
    ball(actor,0,1.48,0,.221,.395,.173,jacket);
    ball(actor,-.021,1.65,0,.234,.19,.183,shoulderCloth);
    rod(actor,v(.02,1.78,0),v(.03,1.93,0),.084,skinShadow,.075);
    ball(actor,.055,2.052,0,.165,.209,.145,flesh);
    ball(actor,.012,2.165,-.006,.17,.132,.149,hair);
    ball(actor,-.079,2.071,-.01,.095,.119,.141,hair);
    for(const z of [-.141,.141]){
      const side=Math.sign(z);ball(actor,.004,2.047,z,.040,.055,.018,flesh);
      ball(actor,.005,2.047,z+side*.013,.018,.032,.008,skinShadow);
      ball(actor,.164,2.075,z*.72,.013,.012,.008,hair);
      rod(actor,v(.141,2.107,z*.74),v(.177,2.1,z*.67),.008,hair);
    }
    ball(actor,.202,2.043,0,.052,.039,.038,flesh);
    rod(actor,v(.184,1.997,-.027),v(.19,1.996,.033),.005,skinShadow);
    rod(actor,v(.17,1.71,.094),v(.17,1.54,.104),.009,stitch);
    const legs=[];
    for(const z of [-.092,.092]){
      const leg=new TH.Group();actor.add(leg);leg.position.set(0,1.16,z);
      rod(leg,v(0,0,0),v(.022,-.54,0),.103,pants,.076);
      rod(leg,v(.022,-.54,0),v(-.015,-1.035,0),.077,pants,.057);
      ball(leg,.065,-1.073,.006,.146,.07,.08,shoe);legs.push(leg);
    }
    rod(actor,v(.047,1.68,-.16),v(.157,1.44,-.19),.083,jacket,.067);
    rod(actor,v(.157,1.44,-.19),v(.25,1.29,-.17),.060,flesh,.04);
    ball(actor,.25,1.28,-.17,.052,.07,.046,flesh);
    const shoulder=v(-.018,1.73,.139),elbow=v(-.28,1.55,.18);
    rod(actor,shoulder,elbow,.094,shoulderCloth,.070);
    ball(actor,elbow.x,elbow.y,elbow.z,.068,.068,.062,flesh);
    const armB=rod(actor,v(0,0,0),v(0,1,0),.062,flesh,.040);
    const gripHand=new TH.Group();actor.add(gripHand);
    ball(gripHand,0,.039,0,.079,.041,.072,flesh);
    for(let j=0;j<4;j++){
      const z=-.049+j*.032;
      ball(gripHand,-.042,.042,z,.026,.022,.017,flesh);
      rod(gripHand,v(-.045,.044,z),v(-.061,-.013,z),.017,flesh,.014);
      rod(gripHand,v(-.061,-.013,z),v(-.026,-.040,z),.014,flesh,.011);
    }
    rod(gripHand,v(.049,.042,.037),v(.04,-.007,.077),.024,flesh,.018);
    scene.add(new TH.HemisphereLight(0xfff2d5,0x64746f,2.3));
    const sun=new TH.DirectionalLight(0xffebca,3.2);sun.position.set(-4,6,4);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.normalBias=.025;sun.shadow.bias=-.0004;
    Object.assign(sun.shadow.camera,{left:-6,right:6,top:5,bottom:-5});scene.add(sun);
    const floorTile=document.createElement('canvas');floorTile.width=floorTile.height=128;
    const f=floorTile.getContext('2d');f.fillStyle='#c3b8a7';f.fillRect(0,0,128,128);
    let seed=3941;function rand(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
    for(let i=0;i<3000;i++){f.fillStyle=i%2?'rgba(255,251,229,.16)':'rgba(89,73,66,.12)';f.fillRect(rand()*128,rand()*128,1+rand()*2,1);}
    f.strokeStyle='#a59c8b';f.strokeRect(0,0,128,128);
    const tex=new TH.CanvasTexture(floorTile);tex.wrapS=tex.wrapT=TH.RepeatWrapping;tex.repeat.set(24,16);tex.colorSpace=TH.SRGBColorSpace;
    const floorMat=new TH.MeshStandardMaterial({map:tex,roughness:.86});const floor=mesh(scene,new TH.PlaneGeometry(36,24),floorMat);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
    const wall=mat(0xe4ddc9),trim=mat(0x89968e),glass=mat(0xb7d5d5,.4),woodMat=mat(0xba9574);
    cube(scene,30,5,.12,wall,0,2.48,-3.1);cube(scene,30,.085,.13,woodMat,0,.07,-2.97);
    for(let i=-4;i<5;i++){const x=i*2.45;cube(scene,2.10,1.65,.10,trim,x,2.32,-2.98);cube(scene,1.99,1.55,.11,glass,x,2.32,-2.91);cube(scene,.045,1.54,.12,trim,x,2.32,-2.83);cube(scene,2.21,.062,.24,woodMat,x,1.47,-2.83);}
    let cur=null,prevId='',sw=0,sh=0; const plane=new TH.Plane(v(0,0,1),0), ray=new TH.Raycaster();
    function px(point){const p=point.project(camera);return {x:(p.x+1)*sw/2,y:(1-p.y)*sh/2};}
    // Project each local envelope with the active camera, including the oriented handle and its grip.
    function caseBounds(){
      const points=[];
      for(const x of [-.55,.55])for(const y of [0,1.43])for(const z of [-.32,.32])points.push(px(bagRoot.localToWorld(v(x,y,z))));
      for(const x of [-.04,1.02])for(const y of [-.06,.06])for(const z of [-.19,.19])points.push(px(handle.localToWorld(v(x,y,z))));
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      return {x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
    }
    function wheelContact(){
      const contacts=wheels.map(wheel=>px(bagRoot.localToWorld(v(wheel.position.x,wheel.position.y-.104,wheel.position.z))));
      return contacts.reduce((front,next)=>next.y>front.y?next:front);
    }
    function draw(frame,w,h,isDark){
      drawing=true;cur=frame;
      if(prevId!==frame.id){home();prevId=frame.id;}
      if(w!==sw||h!==sh){sw=w;sh=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
      scene.background=new TH.Color(isDark?0x526568:0xdfdfd2);scene.fog=new TH.Fog(scene.background,6.3,16);
      floorMat.color.setHex(frame.ice?0xa6d9e4:isDark?0x9da7a2:0xffffff);floorMat.roughness=frame.ice?.22:.86;
      bagRoot.position.x=(frame.id==='1-2'?-.96:-.32)+Math.max(-.88,Math.min(1.24,frame.x*.16));bagRoot.rotation.y=frame.dir<0?Math.PI:0;
      handle.rotation.z=rad(frame.angle);for(const wheel of wheels)wheel.rotation.z=-frame.distance/.104;
      actor.visible=frame.id==='1-2';
      if(actor.visible){
        const gripWorld=handle.localToWorld(v(.96,0,.04));
        actor.position.set(gripWorld.x+.55,0,gripWorld.z-.18);
        const palm=v(-.55,gripWorld.y,.18),delta=palm.clone().sub(elbow);
        armB.position.copy(elbow).addScaledVector(delta,.5);armB.scale.y=delta.length();
        armB.quaternion.setFromUnitVectors(v(0,1,0),delta.normalize());gripHand.position.copy(palm);
        legs.forEach((leg,i)=>leg.rotation.z=(i?1:-1)*.19*Math.sin(frame.distance*4));
      }
      controls.update();scene.updateMatrixWorld();renderer.render(scene,camera);drawing=false;
    }
    return {draw,reset(){drawing=true;home();drawing=false;},visible(on){canvas.hidden=!on;controls.enabled=on;},anchor(){return {grip:px(handle.localToWorld(v(.96,0,0))),base:px(handle.localToWorld(v(0,0,0))),center:px(bagRoot.localToWorld(v(0,.80,.28))),contact:wheelContact(),bounds:caseBounds()};},
      angleAt(x,y,dir){ray.setFromCamera({x:2*x/sw-1,y:1-2*y/sh},camera);const p=new TH.Vector3(),base=handle.localToWorld(v(0,0,0));plane.constant=-base.z;
        if(!ray.ray.intersectPlane(plane,p))return cur.angle;return Math.max(0,Math.min(90,Math.atan2(p.y-base.y,(p.x-base.x)*dir)*180/Math.PI));},
      hitBody(x,y){ray.setFromCamera({x:2*x/sw-1,y:1-2*y/sh},camera);return ray.intersectObject(bagRoot,true).length>0;},
      dispose(){nav.dispose();controls.dispose();renderer.dispose();}};
  }
  window.LearnScene={create,palette};
})();
