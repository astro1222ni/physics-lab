/* 通用教學側板。只攔截 emit 轉交引導步驟，不改寫原任務判定。 */
(function () {
  'use strict';
  const script = document.currentScript;
  if (!document.querySelector('link[href*="study.css"]')) {
    const css = document.createElement('link'); css.rel = 'stylesheet';
    css.href = new URL('../study.css?v=20261115study2', script.src).href;
    css.addEventListener('load',()=>window.dispatchEvent(new Event('resize')));
    document.head.appendChild(css);
  }
  const T = (zh, en) => window.LabSettings ? LabSettings.t(zh, en) : zh;
  const tr = pair => Array.isArray(pair) ? T(pair[0], pair[1]) : String(pair || '');
  const names = { concept:['觀念','Concept'], steps:['步驟','Steps'], examples:['範例','Examples'], missions:['任務','Missions'] };
  function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent=text; if (cls) e.className=cls; return e; }
  function button(text, fn) { const b=el('button',text); b.type='button'; b.addEventListener('click',fn); return b; }
  let panel, strip, dockTab, tab='concept', state='collapsed', stripText='', panes={}, tabButtons={}, onChange=null, strips={};
  let defs=[], current=0, done=[], heldAt=null, advanceAt=null, lastSnapshot=null, ack=false, wrapped=null;
  function isWide() { return matchMedia('(min-width:1240px) and (orientation:landscape)').matches; }
  function geometry() {
    const stage=document.getElementById('study-stage');
    if (stage && !matchMedia('(orientation:landscape)').matches) {
      const graphic=stage.querySelector('canvas,iframe');let edge=(graphic||stage).getBoundingClientRect().bottom;
      if(graphic?.tagName==='IFRAME'){try{const cv=graphic.contentDocument?.querySelector('#cv');if(cv)edge=graphic.getBoundingClientRect().top+cv.getBoundingClientRect().bottom;}catch(e){/* 同源才能讀取 */}}
      document.documentElement.style.setProperty('--lp-half-top',Math.max(120,edge)+'px');
    }
    const controls=document.querySelector('.study-controls');
    if (controls) document.body.style.setProperty('--study-nav',controls.getBoundingClientRect().height+'px');
  }
  function setState(next) {
    if (!panel) return;
    state=next; document.documentElement.dataset.lpState=state; geometry();
    document.documentElement.classList.toggle('lp-docked',isWide()&&state!=='collapsed'&&!document.documentElement.classList.contains('ms-docked')&&!document.documentElement.classList.contains('lab-embed'));
    strip.setAttribute('aria-expanded',String(state!=='collapsed'));
    strip.setAttribute('aria-label',T('教學側板：','Learning panel: ')+stripText+' '+T('點擊切換高度','Click to change height'));
    panel.setAttribute('aria-hidden',String(state==='collapsed')); panel.inert=state==='collapsed';
    if(state!=='collapsed'&&panes[tab])panes[tab].scrollTop=0;
    if (onChange) onChange(state); window.dispatchEvent(new Event('resize'));requestAnimationFrame(geometry);
  }
  function setStrip(text,key) {
    strips[key||tab]=text||'';stripText=strips[tab]||'';if (!strip) return;
    const name=tr(names[tab]);strip.querySelector('span').textContent=stripText.startsWith(name)?stripText:name+'｜'+stripText;
  }
  function select(next) {
    tab=next;
    Object.keys(panes).forEach(k=>{ panes[k].hidden=k!==tab; tabButtons[k].setAttribute('aria-selected',String(k===tab)); tabButtons[k].tabIndex=k===tab?0:-1; });
    Object.values(panes).forEach(p=>p.scrollTop=0);setStrip(strips[tab]||'',tab);
  }
  function open(next) {
    if (!panel) mount({});
    if (document.documentElement.classList.contains('ms-docked')) document.querySelector('.ms-dock-close')?.click();
    if (next && panes[next]) select(next);
    setState('half');
  }
  function mount(options) {
    if (panel) return api;
    options=options || {}; onChange=options.onChange || null;
    panel=el('aside',null,'lp-panel'); panel.id='learning-panel'; panel.setAttribute('aria-label',T('教學側板','Learning panel'));
    const tabs=el('div',null,'lp-tabs'); tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label',T('教學分頁','Learning tabs')); panel.append(tabs);
    (options.tabs || Object.keys(names)).forEach(k=>{
      const b=button(tr(names[k]),()=>select(k)); b.id='lp-tab-'+k; b.setAttribute('role','tab'); b.setAttribute('aria-controls','lp-pane-'+k);
      b.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return; e.preventDefault(); const keys=Object.keys(panes); const n=(keys.indexOf(k)+(e.key==='ArrowRight'?1:-1)+keys.length)%keys.length; select(keys[n]); tabButtons[keys[n]].focus();});
      tabButtons[k]=b; tabs.append(b);
      const p=el('section',null,'lp-content'); p.id='lp-pane-'+k; p.setAttribute('role','tabpanel'); p.setAttribute('aria-labelledby',b.id); panes[k]=p; panel.append(p);
    });
    strip=button('',()=>setState(state==='collapsed'?'half':state==='half'?'full':'collapsed')); strip.className='lp-strip'; strip.setAttribute('aria-controls',panel.id); strip.append(el('span'));
    dockTab=button(T('教學側板','Learning panel'),()=>open(tab)); dockTab.className='lp-dock-tab';
    document.body.append(panel,strip,dockTab);
    let y=0;
    strip.addEventListener('pointerdown',e=>{y=e.clientY; strip.setPointerCapture(e.pointerId);});
    strip.addEventListener('pointerup',e=>{if(Math.abs(e.clientY-y)<24)return; e.preventDefault(); setState(e.clientY<y?(state==='collapsed'?'half':'full'):(state==='full'?'half':'collapsed')); strip.addEventListener('click',e=>e.stopImmediatePropagation(),{once:true,capture:true});});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){const active=panel.contains(document.activeElement); setState('collapsed'); if(active)strip.focus();}});
    document.addEventListener('pointerdown',e=>{if(e.target.closest('.study-scene canvas, .study-photo'))setState('collapsed');});
    window.addEventListener('resize',geometry); window.addEventListener('scroll',geometry,{passive:true});
    new MutationObserver(()=>{if(document.documentElement.classList.contains('ms-docked')&&state!=='collapsed')setState('collapsed');}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    select(tab); setState(isWide()&&!document.documentElement.classList.contains('lab-projector')?'half':'collapsed');
    const missions=panes.missions;
    missions.append(el('h3',T('把觀念拿去試試看','Put the idea to work')),
      el('p',T('斜面實驗有原本的任務與星星。教學側板會先收起，留給任務面板。','The incline experiment has its own missions and stars. This learning panel closes when you open missions.')),
      button(T('開任務模式','Open mission mode'),()=>{
        setState('collapsed'); const b=document.querySelector('.ms-toggle');
        if(b){if(!window.LabMission?._state.on)b.click();else document.querySelector('.ms-dock-tab')?.click();
          if(!isWide())document.querySelector('.ms-panel')?.scrollIntoView({block:'start'});
        }else if(options.onMissions)options.onMissions();
      }));
    return api;
  }
  function content(key,nodes) {
    if (!panel) mount({}); const p=panes[key]; if(!p)return;
    p.replaceChildren(...(Array.isArray(nodes)?nodes:[nodes]));p.scrollTop=0;
    if(window.renderMathInElement)renderMathInElement(p,{delimiters:[{left:'\\(',right:'\\)',display:false}],throwOnError:false});
  }
  function renderSteps() {
    if(!panel)return;
    const list=el('ol',null,'lp-steps');
    defs.forEach((s,i)=>{
      const li=el('li',null,(done[i]?'done ':'')+(i===current?'now':''));
      li.append(button((i+1)+'. '+tr(s.t),()=>{current=i;heldAt=null;advanceAt=null;ack=false;renderSteps();}));
      if(i===current){const detail=el('div',null,'lp-step-detail'); detail.append(el('p',tr(s.detail || s.t)));
        if(s.ack)detail.append(button(T('看到了','I see it'),()=>{ack=true;feed(lastSnapshot || {});}));
        li.append(detail);
      }list.append(li);
    });
    const nav=el('div',null,'lp-step-nav');
    const back=button(T('上一步','Back'),()=>moveStep(-1)), next=button(T('下一步','Next'),()=>moveStep(1));
    back.disabled=current===0; next.disabled=current>=defs.length-1; nav.append(back,next);
    content('steps',[el('h3',T('跟著做，別急著拉爆','Go gently, one step at a time')),list,nav]);
    if(defs[current])setStrip(T('步驟 ','Step ')+(current+1)+'/'+defs.length+'：'+tr(defs[current].t),'steps');
  }
  function moveStep(delta) {current=Math.max(0,Math.min(defs.length-1,current+delta)); heldAt=null; advanceAt=null;ack=false;renderSteps();}
  function define(steps) { defs=steps || []; current=0; done=[]; heldAt=null;advanceAt=null;lastSnapshot=null;ack=false;renderSteps(); }
  function feed(snapshot) {
    if(window.LabShare?.restoring)return;
    lastSnapshot=snapshot; const s=defs[current]; if(!s)return;
    const now=performance.now();
    if(advanceAt!==null){if(now>=advanceAt){advanceAt=null;if(current<defs.length-1)moveStep(1);}return;}
    if(done[current])return;
    const ok=(s.ack&&ack)||(s.check&&s.check(snapshot));
    if(!ok){heldAt=null;return;} if(heldAt===null)heldAt=now;
    if(!(s.ack&&ack)&&now-heldAt<(s.hold || 0)*1000)return;
    done[current]=true;heldAt=null;advanceAt=now+800;
    renderSteps(); strip?.classList.add('lp-complete'); setTimeout(()=>strip?.classList.remove('lp-complete'),800);
    window.dispatchEvent(new CustomEvent('lab:stepcomplete',{detail:{index:current,total:defs.length}}));
  }
  function wrapMissions() {
    const mission=window.LabMission; if(!mission || wrapped===mission.emit)return;
    const original=mission.emit;
    wrapped=function(type,data){
      const snap=Object.assign({},data,{type:type});
      if(!window.LabShare?.restoring){feed(snap);window.dispatchEvent(new CustomEvent('lab:experimentstate',{detail:snap}));}
      return original.apply(this,arguments);
    };
    mission.emit=wrapped;
  }
  // 原 emit 仍被呼叫一次。未登入也能做引導；restoring 時兩邊均不判定。
  function ready(){wrapMissions(); if(document.querySelector('.ex-bar'))mount({});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
  setInterval(()=>{wrapMissions();if(lastSnapshot&&defs.length&&!document.hidden)feed(lastSnapshot);},200);
  function showExample(example,opts) {
    opts=opts || {}; let lines=0, revealed=false;
    function render(){
      const nodes=[el('p',tr(example.q),'lp-example-question')];
      if(!opts.embed){
        if(!revealed)nodes.push(button(T('看解答','Show solution'),()=>{revealed=true;lines=1;render();}));
        else {const sol=el('div',null,'lp-solution');example.sol.slice(0,lines).forEach(p=>sol.append(el('p',tr(p))));nodes.push(sol);
          if(lines<example.sol.length)nodes.push(button(T('下一行板書','Next solution line'),()=>{lines++;render();}));
        }
      }
      content('examples',nodes);
      setStrip(T('範例 ','Example ')+example.n+'：'+tr(example.q).slice(0,14)+'…','examples');
    }
    render(); if(opts.steps!==false)define(example.steps || []);
  }
  const api=window.LabPanel={ mount,open,close:()=>setState('collapsed'),setStrip,setContent:content,setTab:select,showExample,
    setHeight:setState,get state(){return state;},get tab(){return tab;},element:el,button,tr };
  window.LabSteps={define,feed,get index(){return current;},get done(){return done.slice();},get steps(){return defs.slice();}};
})();
