/* 可重用的八向小鍵盤與三倍放大鏡；物理位移及記錄交由實驗回呼處理。 */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.LabVPad=api;})(typeof window==='undefined'?globalThis:window,function(root){
  'use strict';
  const directions=[[-1,1],[0,1],[1,1],[-1,0],[0,0],[1,0],[-1,-1],[0,-1],[1,-1]];
  function delta(index,step){return {x:directions[index][0]*step,y:directions[index][1]*step};}
  function position(x,y,w,h,vw,vh,snap){const maxX=Math.max(8,vw-w-8),maxY=Math.max(8,vh-h-8);x=Math.max(8,Math.min(maxX,x));y=Math.max(8,Math.min(maxY,y));if(snap){if(x<22)x=8;if(maxX-x<14)x=maxX;if(y<22)y=8;if(maxY-y<14)y=maxY;}return {x,y};}
  function repeat(fn,clock){clock=clock||root;let timeout,interval,stopped=false;fn();timeout=clock.setTimeout(()=>{if(stopped)return;fn();interval=clock.setInterval(fn,80);},350);return ()=>{stopped=true;clock.clearTimeout(timeout);clock.clearInterval(interval);};}
  // 放大鏡選擇水域四角，優先避開小鍵盤及正在操作的針尖。
  function lensPosition(board,point,pad,vw,vh){
    const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    const tip={left:point.x-22,right:point.x+22,top:point.y-22,bottom:point.y+22};
    const candidates=[];
    for(const x of [board.left+8,board.right-132])for(const y of [board.top+8,board.bottom-124]){
      const p={x:Math.max(8,Math.min(vw-132,x)),y:Math.max(8,Math.min(vh-156,y))};
      const box={left:p.x,right:p.x+124,top:p.y,bottom:p.y+154};
      candidates.push({p,score:overlap(box,pad)*10+overlap(box,tip)*30});
    }
    candidates.sort((a,b)=>a.score-b.score);return candidates[0].p;
  }
  const api={delta,position,repeat,lensPosition};if(!root.document)return api;
  const doc=root.document,script=doc.currentScript,T=(a,b)=>root.LabSettings?LabSettings.t(a,b):a;
  if(!doc.querySelector('link[href*="lab-tools.css"]')){const l=doc.createElement('link');l.rel='stylesheet';l.href=new URL('../lab-tools.css'+new URL(script.src).search,script.src).href;doc.head.append(l);}
  function mount(o){const E=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;},button=(cls,text,fn)=>{const b=E('button',cls,text);b.type='button';if(fn)b.addEventListener('click',fn);return b;};
    const pad=E('div','lab-vpad '+(o.className||''));pad.setAttribute('role','group');pad.setAttribute('aria-label',T('探針八向微調小鍵盤','Eight-direction probe control'));doc.body.append(pad);const ids=o.objects||['n1','n2'],steps=o.steps||[.01,.05,.5],key='lab-vpad:'+o.id;
    let step=o.step||.05,collapsed=false,auto=false,drag,stopRepeat=null,coords=null,lastMove=-Infinity,hidden=true,lastViewport=null,expandedHeight=248,custom=false,canvasSize=null;
    try{const s=JSON.parse(localStorage.getItem(key)||'null');if(s&&Number.isFinite(s.x)&&Number.isFinite(s.y)){coords={x:s.x,y:s.y};custom=s.custom!==false;collapsed=!!s.collapsed;}}catch(e){}
    const launch=button('vpad-launch','🎮',()=>{collapsed=false;render();save();});launch.setAttribute('aria-label',T('展開微調小鍵盤','Open fine-move keypad'));pad.append(launch);
    const body=E('div','vpad-body'),head=E('div','vpad-head'),handle=button('vpad-handle',T('⠿ 微調','⠿ Fine move'));handle.title=T('拖曳移動；雙擊回預設位置','Drag to move; double-click to reset');head.append(handle,button('vpad-collapse','−',()=>{collapsed=true;render();save();}));head.lastChild.setAttribute('aria-label',T('收成圓鈕','Collapse to a round button'));body.append(head);
    const grid=E('div','vpad-grid'),arrows=['↖','↑','↗','←','','→','↙','↓','↘'];let selector;
    arrows.forEach((text,i)=>{const b=button(i===4?'vpad-select':'vpad-direction',text);b.style.gridColumn=i%3+1;b.style.gridRow=Math.floor(i/3)+1;if(i===4){selector=b;b.setAttribute('aria-label',T('切換黑探針或紅探針','Select black or red probe'));b.addEventListener('click',()=>{const next=ids[(ids.indexOf(o.selected())+1)%ids.length];o.select(next);render();});}else{
      b.dataset.direction=i;b.setAttribute('aria-label',T('移動探針 ','Move probe ')+text);const move=()=>{const d=delta(i,step);o.move(d.x,d.y,o.selected());activity();};
      b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();stop();b.setPointerCapture(e.pointerId);stopRepeat=repeat(move);});b.addEventListener('pointerup',stop);b.addEventListener('pointercancel',stop);b.addEventListener('lostpointercapture',stop);b.addEventListener('click',e=>{if(e.detail===0)move();});
    }grid.append(b);});
    const rec=button('vpad-record',T('記錄','Record'),()=>o.record());rec.dataset.vpadRecord='';body.append(grid);const footer=E('div','vpad-footer');const stepButton=button('vpad-step','',()=>{step=steps[(steps.indexOf(step)+1)%steps.length];render();});stepButton.setAttribute('aria-label',T('切換微調步距','Change fine-move step'));footer.append(stepButton,rec);body.append(footer);pad.append(body);
    const lens=E('div','vpad-lens'),zoom=E('canvas','vpad-zoom'),reading=E('div','vpad-reading');zoom.width=240;zoom.height=240;zoom.setAttribute('aria-label',T('探針、方格與記錄點三倍放大','Three-times magnification of probe, grid and recorded points'));lens.append(zoom,reading);doc.body.append(lens);lens.hidden=true;
    function viewport(){return o.viewport?o.viewport():{width:innerWidth,height:innerHeight};}
    function apply(snap){const v=viewport(),r=pad.getBoundingClientRect(),changed=lastViewport&&(v.width!==lastViewport.width||v.height!==lastViewport.height);if(changed&&!custom)coords=null;if(!coords){const c=o.canvas.getBoundingClientRect();const p=o.point(o.selected());coords=auto?{x:v.width-r.width-8,y:v.height-r.height-8}:{x:p.x>v.width/2?8:v.width-r.width-8,y:Math.min(v.height-r.height-8,c.bottom-r.height-8)};}coords=position(coords.x,coords.y,r.width,r.height,v.width,v.height,snap);if(changed&&!drag){const p=o.point(o.selected());if(p.x>=coords.x-15&&p.x<=coords.x+r.width+15&&p.y>=coords.y-15&&p.y<=coords.y+r.height+15)coords.x=p.x>v.width/2?8:Math.max(8,v.width-r.width-8);}lastViewport=v;pad.style.left=coords.x+'px';pad.style.top=coords.y+'px';}
    function save(){try{localStorage.setItem(key,JSON.stringify(Object.assign({},coords,{collapsed,custom})));}catch(e){}}
    function stop(){if(stopRepeat)stopRepeat();stopRepeat=null;setTimeout(avoidSelected,0);}
    function render(){const id=o.selected(),n=ids.indexOf(id)+1;selector.innerHTML='N<sub>'+n+'</sub><small> ⇄</small>';selector.dataset.object=id;selector.classList.toggle('is-red',n===2);selector.setAttribute('aria-label',T('目前選取探針 ','Selected probe ')+n+T('，點一下切換',', tap to switch'));stepButton.textContent=step+' cm';pad.classList.toggle('is-collapsed',collapsed||auto);pad.classList.toggle('expanded',!collapsed&&!auto);launch.setAttribute('aria-expanded',String(!collapsed&&!auto));body.hidden=collapsed||auto;launch.hidden=!body.hidden;if(!custom)coords=null;if(!body.hidden)expandedHeight=Math.max(200,pad.offsetHeight);apply(false);}
    handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;stop();const r=pad.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};handle.setPointerCapture(e.pointerId);});
    handle.addEventListener('pointermove',e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;if(!drag.moved)return;custom=true;coords={x:drag.left+e.clientX-drag.x,y:drag.top+e.clientY-drag.y};apply(false);});
    handle.addEventListener('pointerup',()=>{if(drag?.moved){apply(true);save();handle.addEventListener('click',e=>e.stopImmediatePropagation(),{capture:true,once:true});}drag=null;});handle.addEventListener('pointercancel',()=>{drag=null;});handle.addEventListener('dblclick',()=>{custom=false;coords=null;apply(false);save();});
    function avoidSelected(){if(custom||drag||stopRepeat||hidden||collapsed||auto)return;const p=o.point(o.selected()),r=pad.getBoundingClientRect();if(p.x>r.left-12&&p.x<r.right+12&&p.y>r.top-12&&p.y<r.bottom+12){coords=null;render();}}
    function activity(){lastMove=performance.now();paintLens();setTimeout(avoidSelected,0);}
    function paintLens(){const live=performance.now()-lastMove<2000&&!hidden;if(!live){lens.classList.remove('is-active');return;}const r=o.canvas.getBoundingClientRect(),p=o.point(o.selected()),point={x:p.x-r.left,y:p.y-r.top},ratio=o.canvas.width/r.width,c=zoom.getContext('2d');lens.hidden=false;lens.classList.add('is-active');const board=o.board?o.board():r,at=lensPosition(board,p,pad.getBoundingClientRect(),innerWidth,innerHeight);lens.style.left=at.x+'px';lens.style.top=at.y+'px';
      c.clearRect(0,0,240,240);c.save();c.beginPath();c.arc(120,120,118,0,Math.PI*2);c.clip();c.drawImage(o.canvas,(point.x-20)*ratio,(point.y-20)*ratio,40*ratio,40*ratio,0,0,240,240);c.restore();const ink=getComputedStyle(doc.documentElement).getPropertyValue('--accent');c.strokeStyle=ink;c.lineWidth=2;c.beginPath();c.moveTo(108,120);c.lineTo(132,120);c.moveTo(120,108);c.lineTo(120,132);c.stroke();reading.textContent='×3 · '+o.reading();
    }
    function refresh(){const r=o.canvas.getBoundingClientRect(),eligible=(!o.visible||o.visible())&&!!o.canvas.getClientRects().length;const visibleHeight=Math.max(0,Math.min(viewport().height,r.bottom)-Math.max(0,r.top)),selectedPoint=o.point(o.selected());hidden=!eligible||visibleHeight<Math.min(160,r.height*.5)||selectedPoint.y<12||selectedPoint.y>viewport().height-12;pad.hidden=!eligible;renderSelected();
      const resized=!canvasSize||canvasSize.width!==r.width||canvasSize.height!==r.height;
      canvasSize={width:r.width,height:r.height};
      if(resized&&eligible&&!custom&&!drag&&!stopRepeat){coords=null;apply(false);}
      const v=viewport();if(lastViewport&&(v.width!==lastViewport.width||v.height!==lastViewport.height))apply(false);const was=auto;auto=hidden||(!collapsed&&viewport().height<expandedHeight+16); if(was!==auto)render();if(hidden)stop();avoidSelected();paintLens();}
    addEventListener('resize',()=>{apply(false);refresh();});addEventListener('scroll',refresh,{passive:true});addEventListener('blur',stop);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)stop();});render();refresh();setTimeout(()=>{if(!localStorageSafe()){coords=null;render();}},150);function localStorageSafe(){try{return !!localStorage.getItem(key);}catch(e){return false;}}const timer=setInterval(()=>{renderSelected();refresh();},80);
    function renderSelected(){const id=o.selected();if(selector.dataset.object!==id)render();}
    return {element:pad,lens,activity,refresh,collapse(on){collapsed=!!on;render();save();},reset(){custom=false;coords=null;collapsed=false;render();save();},get state(){return {step,selected:o.selected(),collapsed:collapsed||auto,auto,position:coords};},dispose(){stop();clearInterval(timer);pad.remove();lens.remove();}};
  }
  api.mount=mount;return api;
});
