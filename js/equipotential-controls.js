/* 探針微調貼著畫布：八向鍵盤可拖動、記住位置，展開時附局部放大。 */
(function(){
  'use strict';
  const L=EquipotentialLab,P=LabPanel,T=(a,b)=>LabSettings.t(a,b),E=P.element,B=P.button;
  const cv=document.getElementById('cv'),host=E('div',null,'eq-canvas-tools');
  cv.before(host);host.append(cv);const pad=E('div',null,'eq-probe-pad');pad.dataset.eqPad='';host.append(pad);
  const handle=B(T('⠿ 微調','⠿ Fine move'),()=>{pad.classList.toggle('expanded');if(pad.style.left){pad.style.left=Math.max(0,Math.min(pad.offsetLeft,host.clientWidth-pad.offsetWidth))+'px';pad.style.top=Math.max(0,Math.min(pad.offsetTop,host.clientHeight-pad.offsetHeight))+'px';}paint();});handle.setAttribute('aria-expanded','false');pad.append(handle);
  const detail=E('div',null,'eq-pad-detail'),zoom=E('canvas',null,'eq-probe-zoom');zoom.width=180;zoom.height=90;zoom.setAttribute('aria-label',T('探針周圍三倍放大','Three-times probe magnification'));detail.append(zoom);
  const select=E('div',null,'eq-pad-select');['n1','n2'].forEach((id,i)=>{const b=B('',()=>L.focus(id));b.innerHTML='N<sub>'+(i+1)+'</sub>';b.setAttribute('aria-label',T('選取探針 ','Select probe ')+(i+1));select.append(b);});detail.append(select);
  const grid=E('div',null,'eq-pad-grid');const arrows=['↖','↑','↗','←','0.01','→','↙','↓','↘'];let fine=true;
  arrows.forEach((text,i)=>{const dx=i%3-1,dy=1-Math.floor(i/3);const b=B(text,()=>{if(i===4){fine=!fine;b.textContent=fine?'0.01':'0.05';}else L.tweak(dx*(fine?.01:.05),dy*(fine?.01:.05));paint();});b.setAttribute('aria-label',i===4?T('切換步長，單位公分','Change step in centimetres'):T('微調探針 ','Move probe ')+text);grid.append(b);});detail.append(grid);pad.append(detail);
  let drag;
  try{const pos=JSON.parse(localStorage.getItem('eqp-pad-position'));if(pos){pad.style.left=Math.min(host.clientWidth-50,Math.max(0,pos.x))+'px';pad.style.top=Math.min(cv.clientHeight-44,Math.max(0,pos.y))+'px';pad.style.right=pad.style.bottom='auto';}}catch(e){}
  handle.addEventListener('pointerdown',e=>{const a=pad.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:a.left,top:a.top,moved:false};handle.setPointerCapture(e.pointerId);});
  handle.addEventListener('pointermove',e=>{if(!drag)return;const r=host.getBoundingClientRect();if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;if(!drag.moved)return;pad.style.left=Math.max(0,Math.min(host.clientWidth-pad.offsetWidth,drag.left-r.left+e.clientX-drag.x))+'px';pad.style.top=Math.max(0,Math.min(host.clientHeight-pad.offsetHeight,drag.top-r.top+e.clientY-drag.y))+'px';pad.style.right=pad.style.bottom='auto';});
  handle.addEventListener('pointerup',()=>{if(drag?.moved){try{localStorage.setItem('eqp-pad-position',JSON.stringify({x:pad.offsetLeft,y:pad.offsetTop}));}catch(e){}handle.addEventListener('click',e=>e.stopImmediatePropagation(),{capture:true,once:true});}drag=null;});
  function paint(){const expanded=pad.classList.contains('expanded');handle.setAttribute('aria-expanded',String(expanded));if(!expanded||document.hidden)return;const s=L.snapshot(),p=L.screenPoint(s[L.selected].x,s[L.selected].y),r=cv.getBoundingClientRect(),ratio=cv.width/r.width,c=zoom.getContext('2d');c.clearRect(0,0,180,90);c.drawImage(cv,(p.x-r.left-24)*ratio,(p.y-r.top-12)*ratio,48*ratio,24*ratio,0,0,180,90);c.strokeStyle=LabDraw.c.accent;c.lineWidth=1;c.beginPath();c.moveTo(82,45);c.lineTo(98,45);c.moveTo(90,37);c.lineTo(90,53);c.stroke();select.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(L.selected==='n'+(i+1))));}
  setInterval(paint,250);
  const feedback=B(T('留言／bug','Feedback'),()=>{
    const dialog=E('dialog',null,'eq-feedback-dialog');dialog.append(E('h2',T('留言與 bug 回報','Comments and bug reports')));
    const draft=E('textarea');draft.setAttribute('aria-label',T('bug 回報草稿','Bug report draft'));draft.value=T('實驗：等位線與電場\n發生步驟：\n預期結果：\n實際結果：\n','Experiment: equipotentials\nSteps:\nExpected:\nActual:\n')+'URL: '+location.href+'\n'+navigator.userAgent+'\n'+innerWidth+' × '+innerHeight;
    const visit=()=>{dialog.close();EquipotentialStudy.flow.close();document.getElementById('comments')?.scrollIntoView({behavior:'smooth'});};
    dialog.append(B(T('到本實驗留言區','Open experiment comments'),visit),B(T('回報 bug：先填草稿','Report a bug: prepare a draft'),()=>{draft.hidden=false;draft.focus();}),draft,B(T('帶到留言區','Use draft in comments'),()=>{const input=document.querySelector('#comments textarea');if(input){input.value=draft.value;input.dispatchEvent(new Event('input',{bubbles:true}));}visit();}),B(T('關閉','Close'),()=>dialog.close()));draft.hidden=true;dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
  });feedback.className='eq-feedback-tab';document.body.append(feedback);const inline=B('✉',()=>feedback.click());inline.setAttribute('aria-label',T('留言與 bug 回報','Comments and bug reports'));document.querySelector('.eq-study-head').append(inline);
})();
