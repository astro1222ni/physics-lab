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
  let key;
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
  function concept(st){
    const hiddenAnswer=teaching&&!reveal&&['prediction','quiz'].includes(unit.sections[section].kind);
    const body=hiddenAnswer?T('先讓大家選，按 A 再公布答案與說明。','Let everyone choose first. Press A to reveal the answer and explanation.'):tr(st.body);
    const nodes=[E('p',body)];
    if(unit.sections[section].kind==='scene'){
      const k=C.forcesAt(params(scene.F),scene.motion.v,0);
      nodes.push(E('p','\\(F = '+scene.F.toFixed(1)+'\\ \\mathrm{N},\\quad f = '+Math.abs(k.f).toFixed(1)+'\\ \\mathrm{N}\\)'));
      if(index===7)unit.board.forEach(p=>nodes.push(E('p',tr(p))));
    }
    if(unit.sections[section].kind==='experiment')nodes.push(settings());
    LabPanel.setContent('concept',nodes);
    LabPanel.setStrip(body.split(/(?<=[。！？.!?])\s*/)[0],'concept');
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
    return box;
  }
  function graphIcon(type){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 60');svg.classList.add('study-graph-choice');svg.setAttribute('aria-hidden','true');
    const p=document.createElementNS(ns,'path');p.setAttribute('d','M10 4V50H96');p.setAttribute('fill','none');p.setAttribute('stroke','currentColor');p.setAttribute('opacity','.4');svg.append(p);
    const line=document.createElementNS(ns,'path');line.setAttribute('d',['M10 25H95','M10 50L85 6','M10 50L50 9V20H95'][type]);line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','3');svg.append(line);return svg;
  }
  function feedback(q,a){
    const box=E('div',null,'study-feedback'),raw=tr(q.feedback[a]);
    if(!teaching&&q.misconceptions[a]){
      const id=q.misconceptions[a].split(/[/／]/)[0];box.append(E('span',tr(unit.misconceptionLabels[id]),'study-misconception'));
    }
    box.append(E('p',teaching?raw:raw.replace(/^M[1-7](?:[/／]M?[1-7])*\s*[｜|]\s*/,'')));return box;
  }
  function question(qid,show){
    currentQuestion=qid;const q=unit.questions[qid],div=E('div',null,'study-question');div.classList.toggle('revealed',reveal);
    div.append(E('h3',tr(q.q)));const options=E('div',null,'study-options');
    q.options.forEach((pair,i)=>{
      const wrap=E('div'),b=B('',()=>{answers[qid]=i;save();render();});b.setAttribute('aria-pressed',String((!teaching||reveal)&&answers[qid]===i));
      if(teaching&&reveal){b.classList.toggle('correct',i===q.correct);b.classList.toggle('wrong',i!==q.correct&&answers[qid]===i);}
      b.append(E('span','ABCD'[i],'study-letter'));if(q.graph)b.append(graphIcon(i));b.append(E('span',tr(pair)));if(show)b.disabled=true;wrap.append(b);
      if(teaching&&unit.sections[section].kind==='prediction'){
        const poll=E('div',null,'study-poll'),id=qid+'-'+i,value=polls[id]||0;
        poll.append(B(T('舉手 +1','Hands +1'),()=>{polls[id]=value+1;render();}),E('output',String(value)),B('−1',()=>{polls[id]=Math.max(0,value-1);render();}));wrap.append(poll);
      }
      options.append(wrap);
    });div.append(options);
    const a=answers[qid];if((show||unit.sections[section].kind==='quiz')&&Number.isInteger(a)&&(!teaching||reveal))div.append(feedback(q,a));
    if(teaching){div.append(B(reveal?T('把答案藏起來（A）','Hide answer (A)'):T('公布答案（A）','Reveal answer (A)'),()=>{reveal=!reveal;render();}));
      if(reveal)div.append(E('p',T('正解：','Answer: ')+'ABCD'[q.correct]+' '+tr(q.feedback[q.correct]),'study-feedback'));
    }
    return div;
  }
  function photo(st){
    const box=E('div',null,'study-photo'),cv=E('canvas');cv.setAttribute('role','img');cv.setAttribute('aria-label',tr(unit.photo.alt));box.append(cv);
    cv.addEventListener('click',()=>next(false));
    requestAnimationFrame(()=>{
      const w=cv.clientWidth,h=cv.clientHeight,dpr=Math.min(2,devicePixelRatio||1);cv.width=w*dpr;cv.height=h*dpr;const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);D.backdrop(c,w,h);
      const cs=getComputedStyle(document.documentElement),wood=cs.getPropertyValue('--study-wood'),edge=cs.getPropertyValue('--study-edge'),bw=Math.min(205,w*.5),bh=Math.min(340,h-80),x=w*.39,y=(h-bh)/2;
      D.contactShadow(c,x+bw/2,y+bh+6,bw*.62,0);D.block(c,x,y,bw,bh,edge,{r:3,shadow:false});D.block(c,x+10,y+10,bw-20,bh-20,wood,{r:1,shadow:false});
      for(let row=0;row<3;row++){
        const sy=y+12+(row+1)*(bh-30)/3;D.block(c,x+7,sy,bw-14,9,edge,{r:1,shadow:false});
        for(let j=0;j<6;j++){const bookW=(bw-38)/6-3,bx=x+18+j*(bookW+3),bookH=32+(j*13+row*7)%35;D.block(c,bx,sy-bookH,bookW,bookH,[D.c.accent,D.c.pos,D.c.field][(j+row)%3],{r:2,shadow:false});}
      }
      D.block(c,x+8,y+bh,15,10,edge,{r:1,shadow:false});D.block(c,x+bw-23,y+bh,15,10,edge,{r:1,shadow:false});
      const hy=y+bh*.56;D.block(c,8,hy-10,Math.max(20,x-46),24,cs.getPropertyValue('--study-hand'),{shadow:false,r:10});drawHand(c,x-38,hy,false,1);
      if(index>0){D.arrow(c,x,hy,x+Math.min(95,bw*.65),hy,D.c.pos,4);D.pill(c,'F',x+45,hy-15,D.c.pos,'center',font(18,'700'));}
      c.font=font(14,'600');c.textAlign='left';c.fillStyle=D.c.muted;c.fillText(T('手推書櫃','Pushing a bookcase'),12,24);
    });return box;
  }
  function sceneView(interactive){const box=E('div',null,'study-scene');canvas=E('canvas');canvas.tabIndex=0;canvas.classList.toggle('is-interactive',interactive);
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',T('木塊、拉力計與摩擦力對拉力圖。實驗時可拖拉環或圖上目前點；方向鍵調拉力。','Block, spring scale and friction-versus-pull graph. In the experiment, drag the ring or current point; arrow keys adjust the pull.'));
    ctx=canvas.getContext('2d');box.append(canvas);
    if(interactive){
      const tools=E('div',null,'study-experiment-tools');const ramp=B(experiment.ramp?T('停止加力','Stop ramp'):T('慢慢加力','Add force'),()=>{experiment.ramp=!experiment.ramp;ramp.textContent=experiment.ramp?T('停止加力','Stop ramp'):T('慢慢加力','Add force');});
      tools.append(ramp,B(T('指針歸零','Reset peak'),()=>{experiment.peak=0;draw();}),B(T('步驟','Steps'),()=>LabPanel.open('steps')));box.append(tools);
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
    if(Number.isInteger(a))box.append(feedback(unit.questions.p2,a));
    else box.append(E('p',T('你跳過了預測。灰線先不畫；可以回第 2 段補選，再來比較。','You skipped the prediction, so there is no grey sketch yet. Return to section 2 to choose one, then compare.'),'study-feedback'));
    return box;
  }
  function exampleView(){
    const box=E('div'),data=window.LAB_EXAMPLE_DATA['incline-friction'],iframe=E('iframe',null,'study-iframe');
    iframe.title=T('範例的斜面實驗','Incline experiment for this example');
    iframe.src='incline-friction.html?embed=1&ex='+examplesIndex+(LabSettings.lang==='en'?'&lang=en':LabSettings.lang==='zh-Hans'?'&lang=zh-Hans':'');
    iframe.addEventListener('load',()=>{try{
      const w=iframe.contentWindow;w.LabPanel?.close();
      w.addEventListener('lab:examplechange',e=>{examplesIndex=e.detail.n;LabPanel.showExample(data[examplesIndex-1]);LabPanel.open('examples');});
      w.addEventListener('lab:experimentstate',e=>LabSteps.feed(e.detail));
      LabPanel.open('examples');layout();
    }catch(e){/* 僅同源嵌入讀取 */}});box.append(iframe);
    LabPanel.showExample(data[examplesIndex-1]);guideDefined=false;return box;
  }
  function summary(){
    const box=E('div',null,'study-board study-summary');unit.shortBoard.slice(0,Math.min(3,index+1)).forEach(p=>box.append(E('p',tr(p))));
    if(index===3){
      box.append(E('p',T('下一單元：C4-05 最大靜摩擦力有多大？','Next: C4-05 How big is the static limit?')),E('p',T('本單元星星：','Unit stars: ')+stars.filter(Boolean).length+'/8'));
      const starsRow=E('div',null,'study-stars');starsRow.setAttribute('aria-label',T('已得星星 ','Stars earned: ')+stars.filter(Boolean).length+'/8');
      stars.forEach(on=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');if(on)svg.classList.add('earned');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M12 1.5 15.2 8l7.2 1-5.2 5 1.2 7.2L12 17.8l-6.4 3.4L6.8 14 1.6 9l7.2-1Z');svg.append(path);starsRow.append(svg);});box.append(starsRow);
    }return box;
  }
  function render(){
    cancelAnimationFrame(frame);frame=0;canvas=null;ctx=null;currentQuestion=null;drag=null;hover=false;
    const s=unit.sections[section],st=s.steps[index];document.body.dataset.studyKind=s.kind;visits.add(section+'-'+index);progress();
    $('study-kicker').textContent=(section+1)+'/8';$('study-heading').textContent=tr(s.title);$('study-count').textContent=T('第 ','Step ')+(index+1)+'/'+s.steps.length;
    const assessment=teaching&&['prediction','quiz'].includes(s.kind);
    $('study-caption').textContent=tr(st.cap);$('study-caption').hidden=assessment&&!reveal;$('study-caption').classList.toggle('revealed',assessment&&reveal);
    $('study-footnote').textContent=section===0&&index===0?T('按下一步，慢慢看；也可以上一步。','Take one step at a time. You can always go back.'):(teaching?T('方向鍵翻頁 · A 公布答案 · P 側板 · R 重播','Arrow keys: navigate · A: answers · P: panel · R: replay'):'');
    $('study-footnote').hidden=!$('study-footnote').textContent;$('study-caption').setAttribute('aria-live',s.kind==='experiment'?'off':'polite');
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

    if(s.kind==='experiment'){lastTime=0;frame=requestAnimationFrame(tick);}
    else if(s.kind==='scene'&&index===4&&!D.reducedMotion()){
      const pulse=()=>{if(!canvas||section!==2||index!==4)return;draw();if(performance.now()-lastRenderTime<450)frame=requestAnimationFrame(pulse);};frame=requestAnimationFrame(pulse);
    }
    requestAnimationFrame(()=>{layout();window.dispatchEvent(new Event('resize'));});
  }
  function sceneSizes(){const wide=canvas&&canvas.clientWidth>=760;return {force:teaching?30:wide?20:18,read:teaching?32:wide?22:20,tick:teaching?20:13,anno:teaching?21:14,small:teaching?18:14};}
  function font(n,weight,mono){
    const fs=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||1;
    // settings.js 另套一次 canvas 字級倍率；這裡抵銷該倍率，實際繪製仍恰為 n*fs CSS px。
    return (weight||'500')+' '+(n*fs/(1+(fs-1)*.7))+'px '+(mono?'ui-monospace, monospace':'system-ui');
  }
  function text(str,x,y,size,color,align,weight){ctx.font=font(size,weight);ctx.fillStyle=color||D.c.text;ctx.textAlign=align||'left';ctx.textBaseline='middle';ctx.fillText(str,x,y);}
  function halo(str,x,y,size,color,align){ctx.font=font(size,'700');ctx.textAlign=align||'left';ctx.textBaseline='middle';ctx.strokeStyle=D.c['canvas-bg'];ctx.lineWidth=5;ctx.strokeText(str,x,y);ctx.fillStyle=color;ctx.fillText(str,x,y);}
  function label(str,x,y,size,color,mono){
    const fs=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||1;ctx.font=font(size,'700',mono);const w=ctx.measureText(str).width+12,h=Math.max(26,size*fs*1.3+8);ctx.fillStyle=D.alpha(D.c.surface,.94);D.roundRect(ctx,x-w/2,y-h/2,w,h,8);ctx.fill();ctx.strokeStyle=D.alpha(color||D.c.muted,.35);ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=color||D.c.text;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(str,x,y);
  }
  function vectorLabel(str,x,y,color,size){const fs=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs'))||1,k=size/13*fs/(1+(fs-1)*.7);ctx.save();ctx.translate(x,y);ctx.scale(k,k);D.vecLabel(ctx,str,'',0,0,color);ctx.restore();}
  function layout(){
    const portrait=!matchMedia('(orientation:landscape)').matches,half=portrait&&LabPanel.state==='half',controls=$('study-controls')||document.querySelector('.study-controls');
    const heights=['.study-top','.study-progress','.study-heading'].reduce((sum,q)=>sum+document.querySelector(q).getBoundingClientRect().height,0);
    const cap=$('study-caption').hidden?0:$('study-caption').getBoundingClientRect().height+8,foot=$('study-footnote').hidden?0:$('study-footnote').getBoundingClientRect().height+6;
    const tools=document.querySelector('.study-experiment-tools'),extra=tools&&getComputedStyle(tools).display!=='none'?tools.getBoundingClientRect().height:0;
    const feedback=document.querySelector('.study-scene>.study-feedback'),fb=feedback?feedback.getBoundingClientRect().height:0;
    const wanted=half?400:Math.max(400,innerHeight-heights-cap-foot-controls.getBoundingClientRect().height-(portrait?56:0)-extra-fb-10);
    const h=portrait?wanted:Math.min(560,wanted),value=h+'px';if(document.body.style.getPropertyValue('--study-canvas-h')!==value)document.body.style.setProperty('--study-canvas-h',value);
    if(canvas)resize();
  }
  function setupClassControl(){const button=$('study-class'),settings=document.querySelector('#lab-settings');if(!settings)return;
    if(innerWidth<=767){if(button.parentElement!==settings)settings.insertBefore(button,settings.firstChild);}else if(!button.closest('.study-top'))document.querySelector('.study-top').append(button);
  }
  function resize(){if(!canvas)return;const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function draw(){
    if(!canvas||!scene||!ctx)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    D.backdrop(ctx,w,h);ctx.lineCap='round';ctx.lineJoin='round';
    const wide=w>=760,split=wide?Math.round(w*.56):w,appH=wide?h:Math.round(h*.52);const apparatus={x:0,y:0,w:split,h:appH,desktop:wide},graph={x:wide?split:0,y:wide?0:appH,w:wide?w-split:w,h:wide?h:h-appH,desktop:wide};
    drawApparatus(apparatus);drawGraph(graph);
    if(unit.sections[section].kind==='experiment'){
      const k=C.forcesAt(params(scene.F,scene.material),scene.motion.v,0);
      const message=T('拉力 ','Pull ')+Math.abs(scene.F).toFixed(1)+' N · '+T('摩擦力 ','Friction ')+Math.abs(k.f).toFixed(1)+' N · '+(scene.motion.v?T('滑動中','sliding'):T('靜止','at rest'));
      if($('study-caption').textContent!==message)$('study-caption').textContent=message;
    }
    const range=$('study-force-accessible');if(range){const k=C.forcesAt(params(scene.F,scene.material),scene.motion.v,0);range.value=scene.F;range.setAttribute('aria-valuetext','F '+scene.F.toFixed(1)+' N; f '+Math.abs(k.f).toFixed(1)+' N, '+(k.f>0?T('向左','left'):k.f<0?T('向右','right'):T('零','zero')));}
  }
  function drawHand(c,x,y,flip,scale){
    const cs=getComputedStyle(document.documentElement);c.save();c.translate(x,y);c.scale((flip?-1:1)*scale,scale);
    c.fillStyle=cs.getPropertyValue('--study-hand');c.strokeStyle=cs.getPropertyValue('--study-hand-line');c.lineWidth=1.8;
    c.beginPath();c.moveTo(-3,-7);c.bezierCurveTo(-10,-10,-10,2,-3,8);c.lineTo(7,12);c.bezierCurveTo(12,24,29,20,39,9);c.lineTo(37,-12);c.bezierCurveTo(29,-22,17,-19,10,-12);c.bezierCurveTo(5,-18,0,-13,-3,-7);c.closePath();c.fill();c.stroke();
    c.beginPath();c.moveTo(-3,2);c.quadraticCurveTo(6,9,12,4);c.moveTo(10,-12);c.lineTo(14,0);c.moveTo(19,-16);c.lineTo(23,-3);c.moveTo(28,-16);c.lineTo(31,-3);c.stroke();c.restore();
  }
  function drawApparatus(r){
    ctx.save();ctx.translate(r.x,r.y);
    const s=scene,k=C.forcesAt(params(s.F,s.material),s.motion.v,0),cs=getComputedStyle(document.documentElement),col=n=>cs.getPropertyValue(n).trim();
    const desktop=r.desktop,bw=desktop?130:84,bh=desktop?100:64,woodLeft=desktop?Math.max(14,(r.w-510)/2):10;
    const table=desktop?r.h*.62:Math.min(188,r.h*.64+28),cy=table-bh/2,localCenter=woodLeft+bw/2;
    const metalX=woodLeft+bw+(desktop?12:8),metalW=desktop?Math.min(272,Math.max(210,r.w-276)):170,metalH=desktop?48:30;
    const springRead=Math.min(50,Math.abs(s.F)),ring=metalX+metalW+19+springRead*(desktop?.4:.32),X=x=>s.left?r.w-x:x,center=X(localCenter),sz=sceneSizes();
    text(T('箭頭長度 ∝ 力','Arrow length ∝ force'),r.w-12,18,sz.small,D.c.muted,'right','600');
    if(s.F!==0&&k.kind==='static')text(s.F>0?T('趨勢向右','Tendency: right'):T('趨勢向左','Tendency: left'),12,18,sz.small,D.c.muted,'left','600');
    // 桌面與前緣用獨立厚度，紋理按核心位移捲動。
    D.block(ctx,4,table,r.w-8,10,col('--study-wood'),{shadow:false,r:2});D.block(ctx,4,table+10,r.w-8,14,col('--study-edge'),{shadow:false,r:2});
    ctx.strokeStyle=col('--study-grain');ctx.lineWidth=1;
    const shift=((-s.motion.x*220)%70+70)%70;
    for(let j=-1;j<Math.ceil(r.w/70);j++){const x=j*70+shift;for(let row=0;row<3;row++){ctx.beginPath();ctx.moveTo(x,table+2+row*3);ctx.bezierCurveTo(x+20,table-2+row*3,x+40,table+8+row*3,x+68,table+2+row*3);ctx.stroke();}}
    if(r.h-table>70){D.block(ctx,22,table+24,14,r.h-table-30,col('--study-edge'),{shadow:false,r:2});D.block(ctx,r.w-38,table+24,14,r.h-table-30,col('--study-edge'),{shadow:false,r:2});}
    const left=X(woodLeft+bw);D.contactShadow(ctx,center,table,bw*.55,0);D.block(ctx,s.left?left:woodLeft,table-bh,bw,bh,col('--study-wood'),{shadow:false,r:5});
    ctx.strokeStyle=col('--study-grain');for(let n=0;n<4;n++){const bx=s.left?left:woodLeft,y=table-bh+13+n*(bh-22)/4;ctx.beginPath();ctx.moveTo(bx+6,y);ctx.bezierCurveTo(bx+24,y-8,bx+bw-24,y+9,bx+bw-6,y-2);ctx.stroke();}
    label('5 kg',center,table-bh*.46,sz.small,D.c.text);
    // 器材圖形可鏡射，文字另在 CSS 像素座標畫，避免字也被鏡射。
    ctx.save();if(s.left){ctx.translate(r.w,0);ctx.scale(-1,1);}
    ctx.strokeStyle=col('--study-ring');ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(woodLeft+bw,cy);ctx.lineTo(metalX-5,cy);ctx.quadraticCurveTo(metalX+1,cy-8,metalX+4,cy);ctx.stroke();
    const g=ctx.createLinearGradient(0,cy-metalH/2,0,cy+metalH/2);g.addColorStop(0,col('--study-metal1'));g.addColorStop(.5,col('--study-metal2'));g.addColorStop(1,col('--study-metal3'));D.roundRect(ctx,metalX,cy-metalH/2,metalW,metalH,8);ctx.fillStyle=g;ctx.fill();ctx.strokeStyle=col('--study-ring');ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.55)';D.roundRect(ctx,metalX+8,cy-metalH/2+4,metalW-16,metalH-8,4);ctx.fill();
    const a=metalX+16,z=metalX+metalW-16,tick=n=>a+(z-a)*n/50;
    ctx.strokeStyle=col('--study-scale-ink');ctx.lineWidth=.8;
    for(let n=0;n<=50;n++){ctx.beginPath();ctx.moveTo(tick(n),cy-metalH/2+6);ctx.lineTo(tick(n),cy-metalH/2+(n%10?10:13));ctx.stroke();}
    const springY=cy+metalH/2-4,springEnd=a+12+(z-a-12)*springRead/50;
    ctx.strokeStyle=D.c.muted;ctx.lineWidth=1.5;ctx.beginPath();for(let n=0;n<=22;n++){const x=a+(springEnd-a)*n/22,y=springY+(n===0||n===22?0:n%2?2:-2);n?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
    ctx.strokeStyle=col('--study-peak');ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(tick(s.peak),cy-metalH/2+2);ctx.lineTo(tick(s.peak),cy+metalH/2-8);ctx.stroke();
    ctx.strokeStyle=col('--study-ring');ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(metalX+metalW,cy);ctx.lineTo(ring-11,cy);ctx.stroke();
    ctx.save();ctx.translate(ring,cy);if(hover||drag?.kind==='ring')ctx.scale(1.06,1.06);
    if(hover||drag?.kind==='ring'){ctx.fillStyle=D.alpha(D.c.accent,.18);ctx.beginPath();ctx.arc(0,0,28,0,2*Math.PI);ctx.fill();}
    ctx.strokeStyle=col('--study-ring');ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,11,0,2*Math.PI);ctx.stroke();ctx.restore();ctx.restore();
    for(let n=0;n<=50;n+=10)text(String(n),X(a+(z-a)*n/50),cy+(desktop?3:1),sz.tick,col('--study-scale-ink'),'center','600');
    drawHand(ctx,X(ring),cy,s.left,(desktop?1.4:1)*(hover||drag?.kind==='ring'?1.06:1));
    const forceScale=desktop?3:2,Fx=X(woodLeft+bw+8),Fy=cy-14;
    if(s.F){D.arrow(ctx,Fx,Fy,Fx+s.F*forceScale,Fy,D.c.pos,3);vectorLabel('F',Fx+s.F*forceScale,Fy-19,D.c.pos,sz.force);}
    if(k.f){const fY=table-3;D.arrow(ctx,center,fY,center-k.f*forceScale,fY,col('--fric'),3);label('f',center,table+9,sz.force,col('--fric'));}
    if(s.F&&k.kind==='static'){const y=table-bh-10;D.arrow(ctx,center,y,center+Math.sign(s.F)*44,y,D.c.muted,2,{dash:[4,5]});}
    label(k.kind==='static'?T('合力 0','Net force 0'):T('滑動中','Sliding'),center,table-bh-30,sz.small,k.kind==='static'?D.c.accent:col('--fric'));
    if(s.showValues)label(Math.abs(s.F).toFixed(1)+' N',X(metalX+metalW/2),cy-(desktop?76:66),sz.read,D.c.text,true);
    const rulerX=r.w*.4,rulerY=table+8;ctx.strokeStyle=D.c.muted;ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(rulerX,rulerY-4);ctx.lineTo(rulerX,rulerY+4);ctx.moveTo(rulerX,rulerY);ctx.lineTo(rulerX+22,rulerY);ctx.lineTo(rulerX+22,rulerY-4);ctx.stroke();text('10 cm',rulerX+30,rulerY,sz.small,D.c.muted,'left','600');
    if(s.showValues)text(T('紅指針：','Peak reading: ')+s.peak.toFixed(1)+' N',r.w-12,r.h-14,sz.small,col('--study-peak'),'right','600');
    geometry=geometry||{};geometry.ring={x:X(ring)+r.x,y:cy+r.y};geometry.block={x:(s.left?left:woodLeft)+r.x,y:table-bh+r.y,w:bw,h:bh};geometry.contact={x:center+r.x,y:table-3+r.y};geometry.fArrow={x0:center+r.x,x1:center-k.f*forceScale+r.x,y:table-3+r.y};ctx.restore();
  }
  function drawGraph(r){
    ctx.save();ctx.translate(r.x,r.y);const sz=sceneSizes(),desktop=r.desktop;
    const ph=desktop?Math.min(r.h-110,(r.w-76)*1.1):r.h-86,pw=desktop?ph/1.1:r.w-62;
    const plot={x:desktop?Math.max(48,(r.w-pw)/2):42,y:desktop?50:38,w:pw,h:ph};
    const max=C.components(params(0,scene.material)),yMax=Math.max(30,Math.ceil(max.fsMax/10)*10),px=F=>plot.x+F/50*plot.w,py=f=>plot.y+plot.h-f/yMax*plot.h;
    ctx.strokeStyle=D.alpha(D.c.muted,.17);ctx.lineWidth=1;
    for(let F=0;F<=50;F+=10){ctx.beginPath();ctx.moveTo(px(F),plot.y);ctx.lineTo(px(F),plot.y+plot.h);ctx.stroke();text(String(F),px(F),plot.y+plot.h+16,sz.tick,D.c.muted,'center');}
    for(let f=0;f<=yMax;f+=10){ctx.beginPath();ctx.moveTo(plot.x,py(f));ctx.lineTo(plot.x+plot.w,py(f));ctx.stroke();text(String(f),plot.x-10,py(f),sz.tick,D.c.muted,'right');}
    text('f (N)',12,17,sz.small,D.c.text,'left','600');text('F (N)',plot.x+plot.w,plot.y+plot.h+35,sz.small,D.c.text,'right','600');
    const sec=unit.sections[section],reference=(sec.kind==='scene'&&index>=3)||sec.kind==='experiment'||sec.kind==='compare';
    if(reference){const ref=Math.min(50,yMax);ctx.strokeStyle=D.c.muted;ctx.lineWidth=1.5;ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(px(0),py(0));ctx.lineTo(px(ref),py(ref));ctx.stroke();ctx.setLineDash([]);text('f = F',px(8)+4,py(8)-16,sz.anno,D.c.muted,'left','700');}
    if(sec.kind==='compare'&&Number.isInteger(answers.p2)){
      ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--study-predict');ctx.lineWidth=10;ctx.beginPath();const paths=[[[0,15],[50,15]],[[0,0],[30,30]],[[0,0],[24.5,24.5],[24.5,19.6],[50,19.6]]];
      paths[answers.p2].forEach(([F,f],i)=>i?ctx.lineTo(px(F),py(f)):ctx.moveTo(px(F),py(f)));ctx.stroke();text(T('你的預測','Your prediction'),Math.min(r.w-12,px(49)),py(answers.p2===0?15:answers.p2===1?29:19.6)+23,sz.small,D.c.muted,'right','700');
    }
    const fric=getComputedStyle(document.documentElement).getPropertyValue('--fric').trim();let prev=null;
    scene.trace.forEach(p=>{if(p.f>yMax){prev=null;return;}if(prev&&(prev.kind===p.kind||Math.abs(prev.F-p.F)<1.1)){ctx.strokeStyle=p.kind==='static'?D.c.accent:fric;ctx.lineWidth=3;ctx.setLineDash(p.kind==='kinetic'?[8,5]:[]);ctx.beginPath();ctx.moveTo(px(prev.F),py(prev.f));ctx.lineTo(px(p.F),py(p.f));ctx.stroke();}prev=p;});ctx.setLineDash([]);
    const k=C.forcesAt(params(scene.F,scene.material),scene.motion.v,0),point={x:px(Math.abs(scene.F))+r.x,y:py(Math.abs(k.f))+r.y};
    ctx.fillStyle=k.kind==='static'?D.c.accent:fric;ctx.strokeStyle=D.c.surface;ctx.lineWidth=2;ctx.beginPath();ctx.arc(point.x-r.x,point.y-r.y,hover?7.42:7,0,2*Math.PI);ctx.fill();ctx.stroke();
    const reached=(sec.kind==='scene'&&index>=4)||scene.trace.some(x=>x.kind==='kinetic');
    if(reached&&max.fsMax<=yMax){
      const x=px(max.fsMax),y=py(max.fsMax),message=T('最大靜摩擦力 ','Static limit ')+max.fsMax.toFixed(1)+' N';
      ctx.fillStyle=D.c.accent;ctx.beginPath();ctx.arc(x,y,5,0,2*Math.PI);ctx.fill();ctx.font=font(sz.anno,'700');const tw=ctx.measureText(message).width,tx=Math.max(12,Math.min(x+8,r.w-tw-8)),ty=Math.max(16,y-22);
      ctx.strokeStyle=D.c.accent;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(tx+Math.min(12,tw/2),ty+6);ctx.stroke();halo(message,tx,ty,sz.anno,D.c.accent,'left');
      if(k.kind==='kinetic'||scene.trace.some(x=>x.kind==='kinetic'))halo(T('動摩擦力 ','Kinetic friction ')+max.fk.toFixed(1)+' N',px(37),py(max.fk)-13,sz.anno,fric,'center');
      if(sec.kind==='scene'&&index===4&&!D.reducedMotion()){const u=(performance.now()-lastRenderTime)/450;if(u<1)D.ripple(ctx,x,y,12,u,D.c.accent);}
    }
    geometry=geometry||{};geometry.graph={x:r.x+plot.x,y:r.y+plot.y,w:plot.w,h:plot.h,point};ctx.restore();
  }

  function setForce(F){if(!experiment)return;experiment.F=Math.max(-50,Math.min(50,Math.round(F*2)/2));experiment.peak=Math.max(experiment.peak,Math.abs(experiment.F));tracePoint(experiment);draw();}
  function local(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function pointerDown(e){if(!geometry)return;const p=local(e),g=geometry.graph,nearRing=Math.hypot(p.x-geometry.ring.x,p.y-geometry.ring.y)<=28,nearPoint=Math.hypot(p.x-g.point.x,p.y-g.point.y)<=28;
    if(!nearRing&&!nearPoint)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);hover=true;drag={kind:nearPoint?'graph':'ring',x:p.x,F:experiment.F};experiment.ramp=false;}
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
  function mount(data){unit=data;key='study:'+unit.id+':v2';teaching=document.documentElement.classList.contains('lab-projector');if(!teaching)read();fromHash();
    LabPanel.mount({tabs:['concept','steps','examples','missions'],dock:true,onMissions:()=>{
      save();try{sessionStorage.setItem('ms-on:incline-friction','1');}catch(e){/* 仍可進實驗自行開啟 */}
      location.href='incline-friction.html?ex='+examplesIndex;
    }});
    $('lp-pane-missions').append(E('p',T('任務會在完整的斜面實驗開啟；這一頁的自學進度留在本機。','Missions open in the full incline experiment. Your study progress stays on this device.')));
    $('study-prev').addEventListener('click',prev);$('study-next').addEventListener('click',()=>next(false));$('study-skip').addEventListener('click',()=>next(true));
    $('study-replay').addEventListener('click',()=>{lastRenderTime=performance.now();if(unit.sections[section].kind==='experiment'){experiment=newScene();LabSteps.define(unit.experimentSteps);}render();});
    $('study-class').addEventListener('click',()=>classMode(!teaching));document.addEventListener('keydown',keydown);
    $('study-stage').addEventListener('click',e=>{if(e.target.closest('button,input,iframe,canvas,a'))return;if(LabPanel.state!=='collapsed'&&innerWidth<1240){LabPanel.close();return;}if(!currentQuestion&&unit.sections[section].kind!=='experiment')next(false);});
    window.addEventListener('resize',()=>{setupClassControl();layout();});window.addEventListener('lab:themechange',()=>{if(canvas)draw();});
    window.addEventListener('hashchange',()=>{if(fromHash()){reveal=false;render();save();}});
    document.addEventListener('visibilitychange',()=>{lastTime=0;});
    window.addEventListener('lab:stepcomplete',e=>{if(section===3&&e.detail.index===5)mark();});
    new MutationObserver(()=>{const on=document.documentElement.classList.contains('lab-projector');if(on!==teaching)classMode(on);}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupClassControl);else setupClassControl();
    lastRenderTime=performance.now();render();
  }
  window.Study={mount,go,next:()=>next(false),replay:()=>{lastRenderTime=performance.now();render();},classMode,
    get state(){return {section:section+1,step:index+1,stars:stars.slice(),answers:Object.assign({},answers),teaching};},
    get scene(){return scene;},get geometry(){return geometry;},get visits(){return Array.from(visits);}};
})();
