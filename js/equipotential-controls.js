/* 探針微調貼著畫布：八向鍵盤可拖動、記住位置，展開時附局部放大。 */
(function(){
  'use strict';
  const L=EquipotentialLab,P=LabPanel,T=(a,b)=>LabSettings.t(a,b),E=P.element,B=P.button;
  const cv=document.getElementById('cv'),host=E('div',null,'eq-canvas-tools');
  // 站長 11/16：「八向小鍵盤……太大了，結果它就擋住了實驗的畫面……稍微畫小一點，而且應該可以移出框」
  // → 縮成左邊方向鍵、右邊放大鏡＋探針選擇的橫式小盤；掛在 body 上，可以拖到實驗框外任何地方。
  cv.before(host);host.append(cv);const stage=document.getElementById('stage')||host;
  const pad=E('div',null,'eq-probe-pad');pad.dataset.eqPad='';document.body.append(pad);
  const handle=B(T('⠿ 微調','⠿ Fine move'),()=>{pad.classList.toggle('expanded');place();paint();});handle.className='eq-pad-handle';handle.setAttribute('aria-expanded','false');pad.append(handle);
  const detail=E('div',null,'eq-pad-detail'),side=E('div',null,'eq-pad-side'),zoom=E('canvas',null,'eq-probe-zoom');zoom.width=180;zoom.height=90;zoom.setAttribute('aria-label',T('探針周圍放大','Probe magnification'));
  const select=E('div',null,'eq-pad-select');['n1','n2'].forEach((id,i)=>{const b=B('',()=>L.focus(id));b.innerHTML='N<sub>'+(i+1)+'</sub>';b.setAttribute('aria-label',T('選取探針 ','Select probe ')+(i+1));select.append(b);});
  const grid=E('div',null,'eq-pad-grid');const arrows=['↖','↑','↗','←','0.01','→','↙','↓','↘'];let fine=true;
  arrows.forEach((text,i)=>{const dx=i%3-1,dy=1-Math.floor(i/3);const b=B(text,()=>{if(i===4){fine=!fine;b.textContent=fine?'0.01':'0.05';}else L.tweak(dx*(fine?.01:.05),dy*(fine?.01:.05));paint();});b.setAttribute('aria-label',i===4?T('切換步長，單位公分','Change step in centimetres'):T('微調探針 ','Move probe ')+text);grid.append(b);});
  side.append(zoom,select);detail.append(grid,side);pad.append(detail);
  // 位置＝相對畫布左上角的位移（畫布因版面移動時，小盤跟著走）；沒拖過就貼畫布右下角
  let off=null,drag;
  try{const o=JSON.parse(localStorage.getItem('eqp-pad-offset'));if(o&&isFinite(o.dx)&&isFinite(o.dy))off=o;}catch(e){}
  function place(){
    const r=cv.getBoundingClientRect(),hide=stage.classList.contains('is3d')||!r.width||!r.height;
    pad.classList.toggle('eq-pad-off',hide);if(hide)return;
    const w=pad.offsetWidth,h=pad.offsetHeight,base=document.body.getBoundingClientRect(),vw=document.documentElement.clientWidth;
    const d=off||{dx:r.width-w-6,dy:r.height-h-6};
    const x=Math.max(4-r.left,Math.min(vw-w-4-r.left,d.dx)),y=Math.max(-(r.top+scrollY)+4,d.dy);
    pad.style.left=Math.round(r.left+x-base.left)+'px';pad.style.top=Math.round(r.top+y-base.top)+'px';
  }
  handle.addEventListener('pointerdown',e=>{const a=pad.getBoundingClientRect(),r=cv.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,dx:a.left-r.left,dy:a.top-r.top,moved:false};handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointermove',e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;if(!drag.moved)return;off={dx:drag.dx+e.clientX-drag.x,dy:drag.dy+e.clientY-drag.y};place();});
  handle.addEventListener('pointerup',()=>{if(drag?.moved){const a=pad.getBoundingClientRect(),r=cv.getBoundingClientRect();off={dx:a.left-r.left,dy:a.top-r.top};try{localStorage.setItem('eqp-pad-offset',JSON.stringify(off));}catch(e){}handle.addEventListener('click',e=>e.stopImmediatePropagation(),{capture:true,once:true});}drag=null;});
  handle.addEventListener('pointercancel',()=>{drag=null;});
  addEventListener('resize',place);
  function paint(){const expanded=pad.classList.contains('expanded');handle.setAttribute('aria-expanded',String(expanded));if(!drag)place();if(!expanded||document.hidden)return;const s=L.snapshot(),p=L.screenPoint(s[L.selected].x,s[L.selected].y),r=cv.getBoundingClientRect(),ratio=cv.width/r.width,c=zoom.getContext('2d');c.clearRect(0,0,180,90);c.drawImage(cv,(p.x-r.left-24)*ratio,(p.y-r.top-12)*ratio,48*ratio,24*ratio,0,0,180,90);c.strokeStyle=LabDraw.c.accent;c.lineWidth=1;c.beginPath();c.moveTo(82,45);c.lineTo(98,45);c.moveTo(90,37);c.lineTo(90,53);c.stroke();select.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(L.selected==='n'+(i+1))));}
  setInterval(paint,250);requestAnimationFrame(()=>paint());
  const feedback=B(T('留言／bug','Feedback'),()=>{
    const dialog=E('dialog',null,'eq-feedback-dialog');dialog.append(E('h2',T('留言與 bug 回報','Comments and bug reports')));
    const draft=E('textarea');draft.setAttribute('aria-label',T('bug 回報草稿','Bug report draft'));draft.value=T('實驗：等位線與電場\n發生步驟：\n預期結果：\n實際結果：\n','Experiment: equipotentials\nSteps:\nExpected:\nActual:\n')+'URL: '+location.href+'\n'+navigator.userAgent+'\n'+innerWidth+' × '+innerHeight;
    const visit=()=>{dialog.close();EquipotentialStudy.flow.close();document.getElementById('comments')?.scrollIntoView({behavior:'smooth'});};
    dialog.append(B(T('到本實驗留言區','Open experiment comments'),visit),B(T('回報 bug：先填草稿','Report a bug: prepare a draft'),()=>{draft.hidden=false;draft.focus();}),draft,B(T('帶到留言區','Use draft in comments'),()=>{const input=document.querySelector('#comments textarea');if(input){input.value=draft.value;input.dispatchEvent(new Event('input',{bubbles:true}));}visit();}),B(T('關閉','Close'),()=>dialog.close()));draft.hidden=true;dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  });feedback.className='eq-feedback-tab';document.body.append(feedback);const inline=B('✉',()=>feedback.click());inline.setAttribute('aria-label',T('留言與 bug 回報','Comments and bug reports'));document.querySelector('.eq-study-head').append(inline);
})();
