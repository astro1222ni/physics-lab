/* 既有實驗只需掛點＋三個 script。狀態還原沿用 classroom.js。 */
(function(){
  'use strict';
  const registry=window.LAB_EXAMPLE_DATA || (window.LAB_EXAMPLE_DATA={});
  const T=(a,b)=>window.LabSettings?LabSettings.t(a,b):a;
  const embed=new URLSearchParams(location.search).get('embed')==='1';
  let selected=null, waiting=null;
  const labels=[['範例一','Example 1'],['範例二','Example 2'],['範例三','Example 3']];
  function concept(){
    LabPanel.setContent('concept',[
      LabPanel.element('h3',T('先判斷接觸面有沒有滑','First ask whether the surfaces slip')),
      LabPanel.element('p',T('還沒滑：先找其他力想讓木塊往哪滑，再用平衡找出需要的靜摩擦力。上限只告訴你撐不撐得住。','Before slipping, find which way the other forces would drive the block, then use equilibrium to find the static friction needed. The limit tells you whether it can hold.')),
      LabPanel.element('p',T('已經滑：摩擦力和接觸面的相對滑動方向相反。範例的「看解答」一次只多出一行，先自己想。','Once sliding, friction opposes relative motion at the contact. Reveal each solution one line at a time and think first.'))
    ]);
  }
  function define(slug,data){registry[slug]=data;mount();}
  function apply(slug,n,open){
    const ex=(registry[slug] || []).find(x=>x.n===Number(n));if(!ex)return false;
    if(!window.LabShare){waiting={slug,n,open};return false;}
    // reset 也在還原保護內；LabShare.restore 自己延後解除 restoring。
    LabShare.restoring=true;
    document.getElementById('reset')?.click();
    LabShare.restore(ex.state); selected=ex;
    document.querySelectorAll('.ex-bar[data-examples="'+slug+'"] button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.example===ex.n)));
    LabPanel.mount({});concept();LabPanel.showExample(ex,{embed:embed});
    LabPanel.setStrip(T('範例 ','Example ')+ex.n+'：'+LabPanel.tr(ex.q).slice(0,14)+'…','examples');
    if(open!==false)LabPanel.open('examples');
    const u=new URL(location.href);u.searchParams.set('ex',ex.n);history.replaceState(null,'',u);
    window.dispatchEvent(new CustomEvent('lab:examplechange',{detail:{slug:slug,n:ex.n}}));
    window.dispatchEvent(new Event('resize'));
    return true;
  }
  function mount(){
    document.querySelectorAll('.ex-bar').forEach(root=>{
      if(root.children.length)return;const slug=root.dataset.examples;
      (registry[slug] || []).forEach(ex=>{
        const pair=labels[ex.n-1];const b=document.createElement('button');b.type='button';b.textContent=T(pair[0],pair[1]);b.dataset.example=ex.n;b.setAttribute('aria-pressed','false');
        b.addEventListener('click',()=>apply(slug,ex.n));root.append(b);
      });
    });
  }
  let embeddedGeometry=null;
  // 只替換範例與直立牆面的呈現；受力、滑動及任務事件仍來自原頁核心。
  function drawEmbedded(cv,s){
    const c=cv.getContext('2d'),w=cv.clientWidth,h=cv.clientHeight,dpr=cv.width/w,D=window.LabDraw,cs=getComputedStyle(document.documentElement),get=n=>cs.getPropertyValue(n).trim();
    if(!get('--study-wood'))return; // 動態樣式載入後由 load 事件重畫，避免空色值進入漸層。
    c.setTransform(dpr,0,0,dpr,0,0);D.backdrop(c,w,h);c.lineCap='round';c.lineJoin='round';
    const fs=parseFloat(cs.getPropertyValue('--fs'))||1,correction=fs/(1+(fs-1)*.7),f=n=>'700 '+(n*correction)+'px system-ui';
    const txt=(t,x,y,n=14,col=D.c.text,align='left')=>{c.font=f(n);c.textAlign=align;c.textBaseline='middle';c.strokeStyle=D.c['canvas-bg'];c.lineWidth=4;c.strokeText(t,x,y);c.fillStyle=col;c.fillText(t,x,y);};
    const body=(x,y,bw,bh)=>{D.contactShadow(c,x+bw/2,y+bh,bw*.5,0);D.block(c,x,y,bw,bh,get('--study-wood'),{r:4,shadow:false});c.strokeStyle=get('--study-grain');for(let j=0;j<4;j++){c.beginPath();c.moveTo(x+4,y+10+j*(bh-16)/4);c.bezierCurveTo(x+20,y+2+j*(bh-16)/4,x+bw-15,y+18+j*(bh-16)/4,x+bw-4,y+7+j*(bh-16)/4);c.stroke();}};
    txt(s.kind==='kinetic'?T('滑動中','Sliding'):T('靜止','At rest'),12,20,16,D.c.accent);
    txt(T('上限 ','limit ')+s.fsMax.toFixed(2)+' N',w-12,20,16,D.c.accent,'right');
    const wall=Math.abs(s.theta-90)<.01,fric=get('--fric');
    if(wall){
      const wx=w*.65,top=50,hh=h-82,bw=Math.max(70,Math.min(92,w*.235)),bh=Math.max(56,bw*.76),by=h*.49-bh/2,bx=wx-bw;
      D.block(c,wx,top,28,hh,get('--study-edge'),{r:2,shadow:false});c.strokeStyle=get('--study-grain');for(let j=0;j<5;j++){c.beginPath();c.moveTo(wx+4+j*4,top+5);c.bezierCurveTo(wx-1+j*4,top+hh*.3,wx+10+j*4,top+hh*.6,wx+4+j*4,top+hh-4);c.stroke();}
      body(bx,by,bw,bh);txt(s.m.toFixed(1)+' kg',bx+bw/2,by+bh/2,16,D.c.text,'center');
      const fx=bx-8,fy=by+bh/2,forceTail=Math.min(-8,fx-s.F*4);
      if(s.mode==='horiz'&&s.F){D.arrow(c,forceTail,fy,fx,fy,D.c.pos,3);txt('F '+s.F.toFixed(1)+' N',Math.max(12,fx-Math.abs(s.F)*2),fy-22,18,D.c.pos);}
      else if(s.F){D.arrow(c,bx+bw/2,by+bh/2,bx+bw/2,by+bh/2-s.F*4,D.c.pos,3);txt('F '+s.F.toFixed(1)+' N',bx-6,by-18,18,D.c.pos);}
      const cy=by+bh/2;D.arrow(c,wx-3,cy,wx-3,cy+s.f*4,fric,3);txt('f '+Math.abs(s.f).toFixed(2)+' N',wx+34,cy+s.f*4,18,fric);
      embeddedGeometry={wall:{x:wx,y:top,w:28,h:hh},block:{x:bx,y:by,w:bw,h:bh},fArrow:{x:wx-3,y0:cy,y1:cy+s.f*4},forceArrow:{x0:forceTail,x1:fx,y:fy}};
    }else{
      const a=s.theta*Math.PI/180,co=Math.cos(a),si=Math.sin(a),length=Math.min(w-56,(h-85)/Math.max(.2,si)),end={x:w-22,y:h-44},start={x:end.x-length*co,y:end.y-length*si};
      const dist=Math.max(46,Math.min(length-46,48+s.x*length/2.2)),p={x:start.x+dist*co,y:start.y+dist*si},bw=84,bh=64;
      c.save();c.translate(start.x,start.y);c.rotate(a);D.block(c,0,0,length,14,get('--study-edge'),{r:2,shadow:false});c.strokeStyle=get('--study-grain');for(let j=0;j<3;j++){c.beginPath();c.moveTo(5,3+j*3);c.bezierCurveTo(length*.3,1+j*3,length*.6,8+j*3,length-5,3+j*3);c.stroke();}body(dist-bw/2,-bh,bw,bh);c.restore();
      txt(s.m.toFixed(1)+' kg',p.x+si*bh/2,p.y-co*bh/2,18,D.c.text,'center');
      const scale=4,fEnd={x:p.x+s.f*scale*co,y:p.y+s.f*scale*si};D.arrow(c,p.x,p.y,fEnd.x,fEnd.y,fric,3);txt('f '+Math.abs(s.f).toFixed(2)+' N',Math.max(12,Math.min(w-125,p.x-28)),p.y+27,18,fric);
      if(s.F){const o={x:p.x+si*bh*.55,y:p.y-co*bh*.55};const dx=s.mode==='horiz'?s.F*4:-s.F*4*co,dy=s.mode==='horiz'?0:-s.F*4*si;D.arrow(c,o.x,o.y,o.x+dx,o.y+dy,D.c.pos,3);txt('F '+s.F.toFixed(1)+' N',Math.max(12,o.x-35),Math.max(48,o.y-33),18,D.c.pos);}
      txt('θ = '+s.theta.toFixed(1)+'°',w-12,h-18,16,D.c.muted,'right');embeddedGeometry={block:{x:p.x,y:p.y,w:bw,h:bh},contact:p,fArrow:{x0:p.x,y0:p.y,x1:fEnd.x,y1:fEnd.y}};
    }
    cv.dataset.nomumode=String(embed);txt(T('器材與力方向示意','Apparatus and force directions'),12,h-18,14,D.c.muted);
  }

  function ready(){mount();const slug=document.querySelector('.ex-bar')?.dataset.examples;if(!slug)return;
    if(embed){document.documentElement.classList.add('embed-nomu');const bar=document.querySelector('.ex-bar'),lab=document.querySelector('.inc');if(bar&&lab)lab.prepend(bar);}
    const n=new URLSearchParams(location.search).get('ex');
    if(n)apply(slug,n,true);else{LabPanel.mount({});concept();LabPanel.showExample(registry[slug][0],{embed:embed});LabPanel.setStrip(T('選一題，讓實驗替你擺好器材','Choose an example to set up the experiment'));}
  }
  document.addEventListener('lab:shareready',()=>{if(waiting){const w=waiting;waiting=null;apply(w.slug,w.n,w.open);}});
  window.LabExamples={define,apply,drawEmbedded,get:slug=>registry[slug] || [],get selected(){return selected;},get embeddedGeometry(){return embeddedGeometry;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
