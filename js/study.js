/* 八段式自學引擎：目標狀態可重建，科學計算只呼叫既有物理核心。 */
(function(){
  'use strict';
  const T=(a,b)=>window.LabSettings?LabSettings.t(a,b):a;
  const tr=p=>Array.isArray(p)?T(p[0],p[1]):String(p || '');
  const $=id=>document.getElementById(id), E=(tag,text,cls)=>LabPanel.element(tag,text,cls), B=(text,fn)=>LabPanel.button(text,fn);
  const C=window.InclineCore,D=window.LabDraw;
  let unit,section=0,index=0,stars=Array(8).fill(false),answers={},polls={},reveal=false,teaching=false;
  let canvas,ctx,scene=null,experiment=null,frame=0,lastTime=0,geometry=null,hover=false,drag=null,examplesIndex=1;
  let visits=new Set(),currentQuestion=null,guideDefined=false;
  const key='study:c4-04-1:v1';
  function params(F,material){
    const u=material&&material!=='unit'?C.SURFACES.find(x=>x.id===material):{mus:.5,muk:.4};
    return {theta:0,mode:'along',m:5,mus:u.mus,muk:u.muk,g:C.G,F:F || 0};
  }
  function snapshot(s,type){const k=C.forcesAt(params(s.F,s.material),s.motion.v,0);return Object.assign({},k,{F:s.F,f:k.f,moving:s.motion.v!==0,type:type || 'frame'});}
  function newScene(){return {F:0,motion:C.newState(),trace:[],peak:0,material:'unit',left:false,showValues:true,ramp:false};}
  function tracePoint(s){const k=C.forcesAt(params(s.F,s.material),s.motion.v,0),p={F:Math.abs(s.F),f:Math.abs(k.f),kind:k.kind};
    const old=s.trace[s.trace.length-1];if(!old||old.kind!==p.kind||Math.abs(old.F-p.F)>.04||Math.abs(old.f-p.f)>.04){s.trace.push(p);if(s.trace.length>1800)s.trace.shift();}}
  function targetScene(n){const s=newScene(); const forces=[0,5,15,15,24.5,25,40,40];s.F=forces[n];
    for(let i=0;i<=n;i++){
      const F=forces[i];if(i===3){for(let f=0;f<=15;f+=.5){const k=C.forcesAt(params(f),0,0);s.trace.push({F:f,f:Math.abs(k.f),kind:k.kind});}}
      if(i>=5){const st=C.step(params(F),C.newState(),.4); s.motion=st.s;
        for(let f=25;f<=F;f+=.5){const k=C.forcesAt(params(f),s.motion.v,0);s.trace.push({F:f,f:Math.abs(k.f),kind:k.kind});}
      }else{s.trace.push({F:F,f:Math.abs(C.forcesAt(params(F),0,0).f),kind:'static'});}
    }
    s.peak=s.F;return s;
  }
  function save(){if(teaching)return;try{localStorage.setItem(key,JSON.stringify({section,index,stars,answers}));}catch(e){/* 私密瀏覽仍可學習 */}}
  function read(){try{const s=JSON.parse(localStorage.getItem(key)||'null');if(!s)return;
    section=Math.max(0,Math.min(7,+s.section||0));index=Math.max(0,Math.min(unit.sections[section].steps.length-1,+s.index||0));
    stars=Array.from({length:8},(_,i)=>!!s.stars?.[i]);answers=s.answers||{};
  }catch(e){/* 舊資料或儲存停用時從頭開始 */}}
  function fromHash(){const m=/^#s([1-8])-(\d+)$/.exec(location.hash);if(!m)return false;section=+m[1]-1;index=Math.max(0,Math.min(unit.sections[section].steps.length-1,+m[2]-1));return true;}
  function progress(){
    const nav=$('study-progress');nav.replaceChildren();
    unit.sections.forEach((s,i)=>{const b=B((i+1)+(innerWidth>=1000?' '+tr(s.title):''),()=>go(i,0));b.setAttribute('aria-label',(i+1)+' '+tr(s.title)+(stars[i]?T('，已完成','; complete'):''));
      if(section===i)b.setAttribute('aria-current','step');b.classList.toggle('done',stars[i]);nav.append(b);});
  }
  function canAdvance(){if(teaching)return true;const q=currentQuestion;return !q || Number.isInteger(answers[q]);}
  function mark(){if(teaching)return;const s=unit.sections[section];
    const allQuestions=s.steps.filter(x=>x.question).every(x=>Number.isInteger(answers[x.question]));
    if(!allQuestions)return;
    if(s.kind==='quiz'&&!s.steps.every(x=>answers[x.question]===unit.questions[x.question].correct))return;
    if(s.kind==='experiment'&&!LabSteps.done.every(Boolean))return;
    if(s.kind==='experiment'&&LabSteps.done.length!==6)return;
    stars[section]=true;save();progress();}
  function next(skip){
    if(!skip&&!canAdvance())return;
    const s=unit.sections[section];
    if(index===s.steps.length-1){if(!skip)mark();if(section<7)go(section+1,0);else{mark();render();}return;}
    go(section,index+1);
  }
  function prev(){if(index>0)go(section,index-1);else if(section>0)go(section-1,unit.sections[section-1].steps.length-1);}
  function go(s,i){const old=section;section=Math.max(0,Math.min(7,s));index=Math.max(0,Math.min(unit.sections[section].steps.length-1,i));reveal=false;lastRenderTime=performance.now();
    if(old!==section){if(innerWidth<1240)LabPanel.close();if(unit.sections[section].kind!=='examples')LabPanel.setTab('concept');}
    history.replaceState(null,'','#s'+(section+1)+'-'+(index+1));render();save();}
  function sourceNode(text){return E('p',text,'lp-source');}
  function concept(st){
    const nodes=[E('h3',tr(unit.sections[section].title)),E('p',tr(st.body)),sourceNode(T('講法出處：','Teaching source: ')+(LabSettings.lang==='en'?'C4-04 script / Astro Ni lecture [20]; adapted for this unit':st.source))];
    if(unit.sections[section].kind==='photo'){
      nodes.push(E('p',tr(unit.photo.context)),sourceNode(tr(unit.photo.credit)));
      const link=E('a',T('照片原始頁與授權','Photo source and licence'));link.href=unit.photo.page;link.target='_blank';link.rel='noopener';nodes.push(link);
      const lic=E('a','CC BY 2.0');lic.href=unit.photo.license;lic.target='_blank';lic.rel='noopener';nodes.push(E('p'),lic);
    }
    if(unit.sections[section].kind==='scene'){const s=scene,k=C.forcesAt(params(s.F),s.motion.v,0);
      nodes.push(E('p','\\(F = '+s.F.toFixed(1)+'\\,\\mathrm{N},\\quad f = '+Math.abs(k.f).toFixed(1)+'\\,\\mathrm{N}\\)'));
      if(index===7)unit.board.forEach(p=>nodes.push(E('p',tr(p))));
    }
    if(unit.sections[section].kind==='experiment')nodes.push(settings());
    LabPanel.setContent('concept',nodes);LabPanel.setStrip(tr(st.cap));
  }
  function settings(){const box=E('div',null,'lp-settings');box.append(E('h3',T('實驗設定','Experiment settings')));
    const label=E('label',T('接觸面','Surfaces'));const select=E('select');select.id='study-material';
    [['unit',T('本單元桌面（預設）','This unit’s table (default)')],['wood',T('木頭／木頭','Wood on wood')],['rubber',T('橡膠／乾混凝土','Rubber on dry concrete')]].forEach(([v,t])=>{const o=E('option',t);o.value=v;select.append(o);});
    select.value=experiment.material;select.setAttribute('aria-label',T('接觸面材質','Surface material'));
    select.addEventListener('change',()=>{experiment.material=select.value;experiment.motion=C.newState();experiment.F=0;experiment.trace=[];experiment.ramp=false;draw();});label.htmlFor=select.id;box.append(label,select);
    const swap=E('label');const check=E('input');check.type='checkbox';check.checked=experiment.left;
    check.addEventListener('change',()=>{experiment.left=check.checked;experiment.F=(experiment.left?-1:1)*Math.abs(experiment.F);draw();});swap.append(check,E('span',T('換邊拉','Pull from the other side')));
    const show=E('label');const values=E('input');values.type='checkbox';values.checked=experiment.showValues;values.addEventListener('change',()=>{experiment.showValues=values.checked;draw();});show.append(values,E('span',T('顯示數值','Show values')));
    box.append(swap,show,B(T('全部清除（只清軌跡）','Clear all (trace only)'),()=>{experiment.trace=[];draw();}),E('p',T('六步引導以預設桌面為準。換材質後，可以重新量上限；回到預設桌面再做引導。','The six guided checks use the default table. With other surfaces, measure a new limit; return to the default table for the guide.'),'lp-source'));
    box.append(B(T('用動摩擦讀數精調拉力','Fine-tune to the kinetic reading'),()=>{if(!experiment.motion.v)return;experiment.F=(experiment.left?-1:1)*C.components(params(0,experiment.material)).fk;experiment.ramp=false;draw();}),E('p',T('先讓它滑，再用這個鈕精調到 19.6 N，觀察等速。一般拖曳每格 0.5 N，這裡保留量測值的小數。','Start it sliding, then use this button to fine-tune to 19.6 N and observe constant speed. Normal dragging uses 0.5 N steps; this keeps the decimal measurement.'),'lp-source'));
    return box;
  }
  function graphIcon(type){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 60');svg.classList.add('study-graph-choice');svg.setAttribute('aria-hidden','true');
    const p=document.createElementNS(ns,'path');p.setAttribute('d','M10 4V50H96');p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('opacity','.4');svg.append(p);
    const line=document.createElementNS(ns,'path');line.setAttribute('d',['M10 25H95','M10 50L85 6','M10 50L50 9V20H95'][type]);line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','3');svg.append(line);return svg;
  }
  function question(qid,show){
    currentQuestion=qid;const q=unit.questions[qid],div=E('div',null,'study-question');
    div.append(E('h3',tr(q.q)));const options=E('div',null,'study-options');
    q.options.forEach((pair,i)=>{const wrap=E('div');const b=B('',()=>{answers[qid]=i;save();render();});b.setAttribute('aria-pressed',String(answers[qid]===i));
      b.append(E('span','ABCD'[i],'study-letter'));if(q.graph)b.append(graphIcon(i));b.append(E('span',tr(pair)));if(show)b.disabled=true;wrap.append(b);
      if(teaching&&unit.sections[section].kind==='prediction'){
        const poll=E('div',null,'study-poll');const id=qid+'-'+i;const value=polls[id]||0;
        poll.append(B(T('舉手 +1','Hands +1'),()=>{polls[id]=value+1;render();}),E('output',String(value)),B('−1',()=>{polls[id]=Math.max(0,value-1);render();}));wrap.append(poll);
      }
      options.append(wrap);
    });div.append(options);
    const a=answers[qid];
    if((show||unit.sections[section].kind==='quiz')&&Number.isInteger(a)&&(!teaching||reveal))div.append(E('p',tr(q.feedback[a]),'study-feedback'));
    if(teaching){const b=B(reveal?T('把答案藏起來（A）','Hide answer (A)'):T('公布答案（A）','Reveal answer (A)'),()=>{reveal=!reveal;render();});div.append(b);
      if(reveal&&!Number.isInteger(a))div.append(E('p',T('正解：','Answer: ')+'ABCD'[q.correct]+' '+tr(q.feedback[q.correct]),'study-feedback'));
    }
    return div;
  }
  function photo(st){const box=E('div',null,'study-photo');const img=E('img');img.alt=tr(unit.photo.alt);img.src=unit.photo.url;box.append(img);
    img.addEventListener('error',()=>{img.hidden=true;box.prepend(E('div',T('搬家時，想像你正在推這個大書櫃……','Moving day: imagine pushing this large bookcase…'),'study-photo-fallback'));});
    if(index>0){const cv=E('canvas');box.append(cv);requestAnimationFrame(()=>{const r=box.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);cv.width=r.width*dpr;cv.height=r.height*dpr;const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);D.arrow(c,r.width*.25,r.height*.64,r.width*.65,r.height*.64,D.c.pos,5);D.pill(c,'F',r.width*.47,r.height*.55,D.c.pos,'center','bold 22px system-ui');});}
    if(index===2)box.append(E('p',tr(st.cap),'photo-note'));return box;
  }
  function sceneView(interactive){const box=E('div',null,'study-scene');canvas=E('canvas');canvas.tabIndex=0;canvas.classList.toggle('is-interactive',interactive);
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',T('木塊、拉力計與摩擦力對拉力圖。實驗時可拖拉環或圖上目前點；方向鍵調拉力。','Block, spring scale and friction-versus-pull graph. In the experiment, drag the ring or current point; arrow keys adjust the pull.'));
    ctx=canvas.getContext('2d');box.append(canvas);
    if(interactive){
      const tools=E('div',null,'study-experiment-tools');const ramp=B(experiment.ramp?T('停止加力','Stop increasing'):T('慢慢加力','Increase slowly'),()=>{experiment.ramp=!experiment.ramp;ramp.textContent=experiment.ramp?T('停止加力','Stop increasing'):T('慢慢加力','Increase slowly');});
      tools.append(ramp,B(T('紅指針歸零','Zero peak marker'),()=>{experiment.peak=0;draw();}),B(T('步驟','Steps'),()=>LabPanel.open('steps')));box.append(tools);
      const range=E('input');range.type='range';range.min='-50';range.max='50';range.step='.5';range.value=experiment.F;range.className='study-sr';range.id='study-force-accessible';range.setAttribute('aria-label',T('水平拉力','Horizontal pull'));range.addEventListener('input',()=>setForce(+range.value));box.append(range);
      canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);
      canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);
      canvas.addEventListener('pointerleave',()=>{if(!drag){hover=false;draw();}});
    }else canvas.addEventListener('click',()=>next(false));
    if(unit.sections[section].kind==='scene'&&index===7){const board=E('div',null,'study-scene-board');unit.shortBoard.forEach(p=>board.append(E('p',tr(p))));box.append(board);}
    requestAnimationFrame(()=>{resize();draw();});return box;
  }
  function compare(){
    if(index===0){const box=question('p1',true),reading=C.forcesAt(params(10),0,0);box.prepend(E('p',T('實驗讀數：','Measured: ')+'F = 10 N · f = '+Math.abs(reading.f).toFixed(0)+' N · '+T('木塊沒動','at rest'),'study-feedback'));return box;}
    const s=experiment || newScene();scene=s;
    const box=sceneView(false);const a=answers.p2;
    if(Number.isInteger(a))box.append(E('p',tr(unit.questions.p2.feedback[a]),'study-feedback'));
    else box.append(E('p',T('你跳過了預測。灰線先不畫；可以回第 2 段補選，再來比較。','You skipped the prediction, so there is no grey sketch yet. Return to section 2 to choose one, then compare.'),'study-feedback'));
    return box;
  }
  function exampleView(){const box=E('div');const picks=E('div',null,'study-example-picks');
    const data=window.LAB_EXAMPLE_DATA['incline-friction'];
    function pick(n){examplesIndex=n;reveal=false;render();LabPanel.open('examples');}
    data.forEach(ex=>{const b=B(T('範例','Example ')+ex.n,()=>pick(ex.n));b.setAttribute('aria-pressed',String(ex.n===examplesIndex));picks.append(b);});box.append(picks);
    const iframe=E('iframe',null,'study-iframe');iframe.title=T('範例的斜面實驗','Incline experiment for this example');
    iframe.src='incline-friction.html?embed=1&ex='+examplesIndex+(LabSettings.lang==='en'?'&lang=en':LabSettings.lang==='zh-Hans'?'&lang=zh-Hans':'');
    iframe.addEventListener('load',()=>{try{
      const w=iframe.contentWindow;w.LabPanel?.close();
      w.addEventListener('lab:examplechange',e=>{examplesIndex=e.detail.n;picks.querySelectorAll('button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i+1===examplesIndex)));LabPanel.showExample(data[examplesIndex-1]);LabPanel.open('examples');});
      w.addEventListener('lab:experimentstate',e=>LabSteps.feed(e.detail));
    }catch(e){/* 同源以外不讀 */}});box.append(iframe);
    LabPanel.showExample(data[examplesIndex-1]);guideDefined=false;
    requestAnimationFrame(()=>{if(section===5)LabPanel.open('examples');});return box;
  }
  function summary(){const box=E('div',null,'study-board study-summary');unit.shortBoard.slice(0,Math.min(3,index+1)).forEach(p=>box.append(E('p',tr(p))));
    if(index===3){box.append(E('p',tr(unit.sections[7].steps[3].cap),'takeaway'),E('p',T('下一單元：C4-05 摩擦係數（名稱暫定）','Next: C4-05 Friction coefficients (working title)')),
      E('p',T('星星：','Stars: ')+stars.filter(Boolean).length+'/8 '+stars.map(x=>x?'★':'☆').join(''),'study-stars'));
      box.append(B(T('完成這一段','Complete this section'),()=>{mark();render();}));
    }return box;
  }
  function render(){
    cancelAnimationFrame(frame);frame=0;canvas=null;ctx=null;currentQuestion=null;drag=null;hover=false;
    const s=unit.sections[section],st=s.steps[index];visits.add(section+'-'+index);progress();
    $('study-kicker').textContent=(section+1)+'/8';$('study-heading').textContent=tr(s.title);$('study-count').textContent=T('第 ','Step ')+(index+1)+'/'+s.steps.length;
    $('study-caption').textContent=tr(st.cap);$('study-footnote').textContent=s.kind==='experiment'?T('圖上 F、f 是大小；方向看箭頭。拉環與圖點都可拖。','Graph F and f are magnitudes; arrows show directions. Drag the ring or graph point.'):teaching?T('方向鍵翻頁 · A 公布答案 · P 側板 · R 重播','Arrow keys: navigate · A: answers · P: panel · R: replay'):T('按下一步，慢慢看；也可以上一步。','Take one step at a time. You can always go back.');
    $('study-caption').setAttribute('aria-live',s.kind==='experiment'?'off':'polite');
    let view;
    if(s.kind==='photo')view=photo(st);
    else if(s.kind==='prediction'){view=st.question?question(st.question,false):E('div',tr(st.cap),'study-board');}
    else if(s.kind==='scene'){scene=targetScene(index);view=sceneView(false);}
    else if(s.kind==='experiment'){
      if(!experiment)experiment=newScene();scene=experiment;view=sceneView(true);
      if(!guideDefined){LabSteps.define(unit.experimentSteps);guideDefined=true;}
    }
    else if(s.kind==='compare')view=compare();
    else if(s.kind==='examples')view=exampleView();
    else if(s.kind==='quiz')view=question(st.question,false);
    else view=summary();
    $('study-stage').replaceChildren(view);concept(st);
    if(s.kind==='examples')LabPanel.showExample(window.LAB_EXAMPLE_DATA['incline-friction'][examplesIndex-1],{steps:false});
    $('study-prev').disabled=section===0&&index===0;$('study-next').disabled=!canAdvance();$('study-skip').hidden=canAdvance();
    $('study-next').textContent=section===7&&index===s.steps.length-1?T('完成 ✓','Finish ✓'):T('下一步 ▶','Next ▶');
    if(teaching&&s.kind!=='experiment')LabPanel.setStrip(tr(st.cap));
    if(s.kind==='experiment'){lastTime=0;frame=requestAnimationFrame(tick);}
    else if(s.kind==='scene'&&index===4&&!D.reducedMotion()){
      const pulse=()=>{if(!canvas||section!==2||index!==4)return;draw();if(performance.now()-lastRenderTime<450)frame=requestAnimationFrame(pulse);};frame=requestAnimationFrame(pulse);
    }
    requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  }
  function font(n,weight){const fs=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||1,correction=fs/(1+(fs-1)*.7);
    const k=teaching?1.5:1;return (weight || '500')+' '+(n*correction*k)+'px system-ui';}
  function text(str,x,y,size,color,align){ctx.font=font(size);ctx.fillStyle=color || D.c.text;ctx.textAlign=align || 'left';ctx.textBaseline='middle';ctx.fillText(str,x,y);}
  function label(str,x,y,size,color){D.pill(ctx,str,x,y+10,color || D.c.text,'center',font(size,'700'));}
  function vectorLabel(str,x,y,color,size){const fs=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||1,k=(size/13)*(fs/(1+(fs-1)*.7))*(teaching?1.5:1);
    ctx.save();ctx.translate(x,y);ctx.scale(k,k);D.vecLabel(ctx,str,'',0,0,color);ctx.restore();}
  function resize(){if(!canvas)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function draw(){
    if(!canvas||!scene||!ctx)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    D.backdrop(ctx,w,h);ctx.lineCap='round';ctx.lineJoin='round';
    const wide=w>650;const apparatus={x:0,y:0,w:wide?w*.55:w,h:wide?h:210},graph={x:wide?w*.55:0,y:wide?0:210,w:wide?w*.45:w,h:wide?h:190};
    drawApparatus(apparatus);drawGraph(graph);
    if(unit.sections[section].kind==='experiment'){
      const k=C.forcesAt(params(scene.F,scene.material),scene.motion.v,0);
      const message=T('拉力 ','Pull ')+Math.abs(scene.F).toFixed(1)+' N · '+T('摩擦力 ','Friction ')+Math.abs(k.f).toFixed(1)+' N · '+(scene.motion.v?T('滑動中','sliding'):T('靜止','at rest'));
      if($('study-caption').textContent!==message)$('study-caption').textContent=message;
    }
    const range=$('study-force-accessible');if(range){const k=C.forcesAt(params(scene.F,scene.material),scene.motion.v,0);range.value=scene.F;range.setAttribute('aria-valuetext','F '+scene.F.toFixed(1)+' N; f '+Math.abs(k.f).toFixed(1)+' N, '+(k.f>0?T('向左','left'):k.f<0?T('向右','right'):T('零','zero')));}
  }
  function drawApparatus(r){
    ctx.save();ctx.translate(r.x,r.y);const s=scene,p=params(s.F,s.material),k=C.forcesAt(p,s.motion.v,0),colors=getComputedStyle(document.documentElement),fric=colors.getPropertyValue('--fric').trim(),wood=colors.getPropertyValue('--study-wood').trim(),metal=colors.getPropertyValue('--study-metal').trim(),hand=colors.getPropertyValue('--study-hand').trim();
    const tall=r.h>300, table=tall?r.h*.64:155,bw=Math.min(80,r.w*.19),bh=tall?85:60,center=s.left?r.w*.72:r.w*.27,left=center-bw/2,scale=2,sg=s.left?-1:1;
    text(T('箭頭長度 ∝ 力','Arrow length ∝ force'),12,18,14,D.c.muted);
    const fY=table-bh-32,frY=table-bh-2;
    if(s.F!==0){D.arrow(ctx,center,fY,center+s.F*scale,fY,D.c.pos,3);vectorLabel('F',center+s.F*scale/2,fY-18,D.c.pos,tall?20:18);}
    if(Math.abs(k.f)>0){D.arrow(ctx,center,frY,center-k.f*scale,frY,fric,3);vectorLabel('f',center-k.f*scale/2,frY-17,fric,tall?20:18);}
    if(Math.abs(s.F)>0&&k.kind==='static'){
      const y=table+(tall?38:42),x=tall?center:12;
      ctx.setLineDash([4,5]);D.arrow(ctx,x+(s.F<0?32:0),y,x+(s.F>0?32:0),y,D.c.muted,2,{dash:[4,5]});ctx.setLineDash([]);
      text(s.F>0?T('趨勢向右','Tends right'):T('趨勢向左','Tends left'),x+42,y,14,D.c.muted);
    }
    D.block(ctx,8,table,r.w-16,15,wood,{shadow:false});ctx.strokeStyle=D.alpha(D.c.text,.2);ctx.lineWidth=1;
    const shift=((-s.motion.x*220)%60+60)%60;
    for(let j=-1;j<Math.ceil(r.w/60);j++){const x=j*60+shift;ctx.beginPath();ctx.moveTo(x,table+5);ctx.bezierCurveTo(x+20,table+2,x+30,table+10,x+55,table+6);ctx.stroke();}
    D.contactShadow(ctx,center,table+1,bw*.62,0);D.block(ctx,left,table-bh,bw,bh,wood,{shadow:false});
    ctx.strokeStyle=D.alpha(D.c.text,.14);for(let j=0;j<4;j++){ctx.beginPath();ctx.moveTo(left+5,table-bh+12+j*11);ctx.bezierCurveTo(left+20,table-bh+3+j*11,left+bw-20,table-bh+20+j*11,left+bw-5,table-bh+9+j*11);ctx.stroke();}
    label('5 kg',center,table-bh*.45,14);
    // 金屬筒、透明刻度窗、實際 0–50 N 刻度、彈簧與掛鉤。器材外形為示意。
    const start=center+sg*(bw/2+10),bodyW=tall?Math.min(230,r.w*.4):Math.min(150,r.w*.42),bodyX=sg>0?start:start-bodyW,cy=table-bh*.37;
    ctx.strokeStyle=metal;ctx.lineWidth=3;ctx.beginPath();ctx.arc(center+sg*(bw/2+3),cy,7,sg>0?Math.PI:0,sg>0?Math.PI*2:Math.PI);ctx.stroke();
    D.block(ctx,bodyX,cy-18,bodyW,36,metal,{shadow:false,r:8});ctx.fillStyle=D.alpha(D.c.surface,.94);ctx.fillRect(bodyX+7,cy-12,bodyW-14,25);
    const tickX=n=>bodyX+8+(sg>0?n:50-n)*(bodyW-16)/50;
    ctx.strokeStyle=D.c.muted;ctx.lineWidth=.7;for(let n=0;n<=50;n++){const x=tickX(n);ctx.beginPath();ctx.moveTo(x,cy-10);ctx.lineTo(x,cy+(n%10===0?2:-4));ctx.stroke();}
    for(let n=0;n<=50;n+=10)text(String(n),tickX(n),cy+8,13,D.c.muted,'center');
    const springEnd=tickX(Math.min(50,Math.abs(s.F)));ctx.strokeStyle=D.c.text;ctx.lineWidth=1.4;ctx.beginPath();for(let j=0;j<=20;j++){const x=tickX(0)+(springEnd-tickX(0))*j/20;const y=cy+17+(j===0||j===20?0:(j%2?3:-3));if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    ctx.strokeStyle=D.c.pos;ctx.lineWidth=2;const marker=tickX(s.peak);ctx.beginPath();ctx.moveTo(marker,cy-17);ctx.lineTo(marker,cy+3);ctx.stroke();
    const end=start+sg*bodyW,ringX=end+sg*(13+Math.abs(s.F)*.32);ctx.strokeStyle=metal;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(end,cy);ctx.lineTo(ringX-sg*9,cy);ctx.stroke();
    ctx.save();ctx.translate(ringX,cy);if(hover)ctx.scale(1.06,1.06);if(hover){ctx.fillStyle=D.alpha(D.c.accent,.15);ctx.beginPath();ctx.arc(0,0,28,0,2*Math.PI);ctx.fill();}ctx.strokeStyle=D.c.accent;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,11,0,2*Math.PI);ctx.stroke();ctx.restore();
    ctx.strokeStyle=hand;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(ringX+sg*24,cy+14);ctx.lineTo(ringX+sg*8,cy+6);ctx.lineTo(ringX+sg*3,cy-2);ctx.stroke();
    if(s.showValues){label(Math.abs(s.F).toFixed(1)+' N',bodyX+bodyW/2,cy-38,tall?22:20);text(T('紅指針：','Peak: ')+s.peak.toFixed(1)+' N',tall?r.w/2:r.w-12,table+(tall?72:42),14,D.c.pos,tall?'center':'right');}
    const rulerY=table+22;ctx.strokeStyle=D.alpha(D.c.muted,.7);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(16,rulerY);ctx.lineTo(r.w-16,rulerY);ctx.stroke();for(let x=16-shift;x<r.w-16;x+=22){if(x<16)continue;ctx.beginPath();ctx.moveTo(x,rulerY);ctx.lineTo(x,rulerY+5);ctx.stroke();}text('10 cm',r.w-18,rulerY+(tall?15:-7),13,D.c.muted,'right');
    if(k.kind==='static')label(T('合力 0','Net force 0'),r.w*.73,tall?80:42,14,D.c.accent);
    if(k.kind==='kinetic')label(T('滑動中','Sliding'),r.w*.73,tall?80:42,14,fric);
    if(tall){const lines=unit.sections[section].kind==='scene'&&index===7?unit.board:[['桌面隨鏡頭捲動；木塊位置由物理核心計算。','The camera follows the block; position comes from the physics core.']];
      lines.forEach((line,i)=>text(tr(line),16,table+110+i*32,14,D.c.muted));}
    geometry=geometry || {};geometry.ring={x:ringX+r.x,y:cy+r.y};ctx.restore();
  }
  function drawGraph(r){
    ctx.save();ctx.translate(r.x,r.y);const tall=r.h>300,plot={x:44,y:tall?150:42,w:r.w-64,h:tall?r.h-222:r.h-82};
    const yMax=Math.max(30,Math.ceil(C.components(params(0,scene.material)).fsMax/10)*10);
    const px=F=>plot.x+F/50*plot.w,py=f=>plot.y+plot.h-f/yMax*plot.h;
    ctx.strokeStyle=D.alpha(D.c.muted,.17);ctx.lineWidth=1;
    for(let F=0;F<=50;F+=10){ctx.beginPath();ctx.moveTo(px(F),plot.y);ctx.lineTo(px(F),plot.y+plot.h);ctx.stroke();text(String(F),px(F),plot.y+plot.h+16,13,D.c.muted,'center');}
    for(let f=0;f<=yMax;f+=10){ctx.beginPath();ctx.moveTo(plot.x,py(f));ctx.lineTo(plot.x+plot.w,py(f));ctx.stroke();text(String(f),plot.x-10,py(f),13,D.c.muted,'right');}
    text('f (N)',12,tall?112:18,14,D.c.text);text('F (N)',plot.x+plot.w,plot.y+plot.h+29,13,D.c.text,'right');
    const sec=unit.sections[section],reference=(sec.kind==='scene'&&index>=3)||sec.kind==='experiment'||sec.kind==='compare';
    if(reference){const ref=Math.min(50,yMax);ctx.strokeStyle=D.alpha(D.c.muted,.4);ctx.setLineDash([3,5]);ctx.beginPath();ctx.moveTo(px(0),py(0));ctx.lineTo(px(ref),py(ref));ctx.stroke();ctx.setLineDash([]);text('f = F',px(ref-3),py(ref-2),13,D.c.muted);}
    const fric=getComputedStyle(document.documentElement).getPropertyValue('--fric').trim();let prev=null;
    scene.trace.forEach(p=>{if(p.f>yMax){prev=null;return;}ctx.strokeStyle=p.kind==='static'?D.c.accent:fric;ctx.lineWidth=2.5;ctx.setLineDash(p.kind==='kinetic'?[6,4]:[]);
      if(prev&&(prev.kind===p.kind||Math.abs(prev.F-p.F)<1.1)){ctx.beginPath();ctx.moveTo(px(prev.F),py(prev.f));ctx.lineTo(px(p.F),py(p.f));ctx.stroke();}
      ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(px(p.F),py(p.f),2.5,0,Math.PI*2);ctx.fill();prev=p;});ctx.setLineDash([]);
    if(sec.kind==='compare'&&Number.isInteger(answers.p2)){
      ctx.strokeStyle=D.c.muted;ctx.lineWidth=2;ctx.setLineDash([2,5]);ctx.beginPath();
      const paths=[[[0,20],[50,20]],[[0,0],[30,30]],[[0,0],[24.5,24.5],[24.5,19.6],[50,19.6]]];
      paths[answers.p2].forEach(([F,f],i)=>i?ctx.lineTo(px(F),py(f)):ctx.moveTo(px(F),py(f)));ctx.stroke();ctx.setLineDash([]);
    }
    const k=C.forcesAt(params(scene.F,scene.material),scene.motion.v,0);
    const point={x:px(Math.abs(scene.F))+r.x,y:py(Math.abs(k.f))+r.y};
    if(Math.abs(k.f)<=yMax){ctx.fillStyle=k.kind==='static'?D.c.accent:fric;ctx.strokeStyle=D.c.surface;ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x-r.x,point.y-r.y,hover?7.42:7,0,Math.PI*2);ctx.fill();ctx.stroke();}
    if((sec.kind==='scene'&&index>=4)||scene.trace.some(x=>x.kind==='kinetic')){
      const max=C.components(params(0,scene.material));
      text(T('最大靜摩擦力 ','Static limit ')+max.fsMax.toFixed(1)+' N',tall?plot.x:80,tall?35:14,tall?14:13,D.c.accent);
      if(k.kind==='kinetic'||sec.kind==='compare')text(T('動摩擦力 ','Kinetic friction ')+max.fk.toFixed(1)+' N',tall?plot.x:80,tall?66:31,tall?14:13,fric);
      if(sec.kind==='scene'&&index===4&&!D.reducedMotion()){
        const flash=Math.max(0,1-(performance.now()-lastRenderTime)/450);if(flash>0)D.ripple(ctx,px(24.5),py(24.5),12,1-flash,D.c.accent);
      }
    }
    geometry=geometry || {};geometry.graph={x:r.x+plot.x,y:r.y+plot.y,w:plot.w,h:plot.h,point:point};ctx.restore();
  }
  function setForce(F){if(!experiment)return;experiment.F=Math.max(-50,Math.min(50,Math.round(F*2)/2));experiment.peak=Math.max(experiment.peak,Math.abs(experiment.F));tracePoint(experiment);draw();}
  function local(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function pointerDown(e){if(!geometry)return;const p=local(e),g=geometry.graph,nearRing=Math.hypot(p.x-geometry.ring.x,p.y-geometry.ring.y)<=28,nearPoint=Math.hypot(p.x-g.point.x,p.y-g.point.y)<=28;
    if(!nearRing&&!nearPoint)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);drag={kind:nearPoint?'graph':'ring',x:p.x,F:experiment.F};experiment.ramp=false;}
  function pointerMove(e){const p=local(e);if(!drag){hover=geometry&&(Math.hypot(p.x-geometry.ring.x,p.y-geometry.ring.y)<=28||Math.hypot(p.x-geometry.graph.point.x,p.y-geometry.graph.point.y)<=28);draw();return;}
    const g=geometry.graph,sign=experiment.left?-1:1;setForce(drag.kind==='graph'?sign*(p.x-g.x)/g.w*50:drag.F+(p.x-drag.x)/Math.max(140,canvas.clientWidth*.4)*50);}
  function pointerUp(){if(drag){drag=null;experiment.ramp=false;setForce(0);}}
  function tick(time){
    if(!canvas||unit.sections[section].kind!=='experiment')return;
    const dt=lastTime?Math.min((time-lastTime)/1000,1/30):0;lastTime=time;
    if(!document.hidden&&dt>0){
      if(experiment.ramp){experiment.F=Math.min(50,Math.abs(experiment.F)+2*dt)*(experiment.left?-1:1);experiment.peak=Math.max(experiment.peak,Math.abs(experiment.F));}
      const result=C.step(params(experiment.F,experiment.material),experiment.motion,dt);experiment.motion=result.s;
      result.ev.forEach(e=>LabSteps.feed(snapshot(experiment,e.type)));LabSteps.feed(snapshot(experiment));tracePoint(experiment);draw();
    }
    frame=requestAnimationFrame(tick);
  }
  let lastRenderTime=0;
  function classMode(on){teaching=on;document.documentElement.classList.toggle('lab-projector',on);$('study-class').setAttribute('aria-pressed',String(on));reveal=false;
    if(on)LabPanel.close();render();window.dispatchEvent(new Event('lab:themechange'));}
  function keydown(e){if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,select,textarea,.lab-set-panel'))return;
    if(!teaching&&unit.sections[section].kind==='experiment'&&['ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();setForce(experiment.F+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?5:.5));return;
    }
    if(!teaching)return;
    if(/^[1-8]$/.test(e.key)){e.preventDefault();go(+e.key-1,0);return;}
    if(['ArrowRight',' ','PageDown'].includes(e.key)){e.preventDefault();next(false);}
    else if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();prev();}
    else if(e.key.toLowerCase()==='r'){e.preventDefault();lastRenderTime=performance.now();render();}
    else if(e.key.toLowerCase()==='a'){e.preventDefault();reveal=!reveal;render();}
    else if(e.key.toLowerCase()==='p'){e.preventDefault();LabPanel.state==='collapsed'?LabPanel.open():LabPanel.close();}
    else if(e.key==='Home'){e.preventDefault();go(0,0);}else if(e.key==='End'){e.preventDefault();go(7,3);}
    else if(e.key.toLowerCase()==='f'){e.preventDefault();if(document.fullscreenElement)document.exitFullscreen?.();else document.documentElement.requestFullscreen?.().catch(()=>{});}
  }
  function mount(data){unit=data;teaching=document.documentElement.classList.contains('lab-projector');if(!teaching)read();fromHash();
    LabPanel.mount({tabs:['concept','steps','examples','missions'],dock:true,onMissions:()=>{
      save();try{sessionStorage.setItem('ms-on:incline-friction','1');}catch(e){/* 仍可進實驗自行開啟 */}
      location.href='incline-friction.html?ex='+examplesIndex;
    }});
    $('lp-pane-missions').append(E('p',T('任務會在完整的斜面實驗開啟；這一頁的自學進度留在本機。','Missions open in the full incline experiment. Your study progress stays on this device.')));
    $('study-prev').addEventListener('click',prev);$('study-next').addEventListener('click',()=>next(false));$('study-skip').addEventListener('click',()=>next(true));
    $('study-replay').addEventListener('click',()=>{lastRenderTime=performance.now();if(unit.sections[section].kind==='experiment'){experiment=newScene();LabSteps.define(unit.experimentSteps);}render();});
    $('study-class').addEventListener('click',()=>classMode(!teaching));document.addEventListener('keydown',keydown);
    $('study-stage').addEventListener('click',e=>{if(e.target.closest('button,input,iframe,canvas,a'))return;if(LabPanel.state!=='collapsed'&&innerWidth<1240){LabPanel.close();return;}if(!currentQuestion&&unit.sections[section].kind!=='experiment')next(false);});
    window.addEventListener('resize',()=>{if(canvas)resize();});window.addEventListener('lab:themechange',()=>{if(canvas)draw();});
    window.addEventListener('hashchange',()=>{if(fromHash()){reveal=false;render();save();}});
    document.addEventListener('visibilitychange',()=>{lastTime=0;});
    window.addEventListener('lab:stepcomplete',e=>{if(section===3&&e.detail.index===5)mark();});
    new MutationObserver(()=>{const on=document.documentElement.classList.contains('lab-projector');if(on!==teaching)classMode(on);}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    lastRenderTime=performance.now();render();
  }
  window.Study={mount,go,next:()=>next(false),replay:()=>{lastRenderTime=performance.now();render();},classMode,
    get state(){return {section:section+1,step:index+1,stars:stars.slice(),answers:Object.assign({},answers),teaching};},
    get scene(){return scene;},get visits(){return Array.from(visits);}};
})();
