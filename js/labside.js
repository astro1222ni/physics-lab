/* 共用步驟／任務／留言側板；資料由原實驗與 LabMission 讀取，不另存完成判定。 */
(function(){
  'use strict';
  const doc=document,script=doc.currentScript,T=(a,b)=>window.LabSettings?LabSettings.t(a,b):a;
  const E=(tag,cls,text)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;},B=(text,fn,cls)=>{const b=E('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;};
  if(!doc.querySelector('link[href*="lab-tools.css"]')){const l=E('link');l.rel='stylesheet';l.href=new URL('../lab-tools.css'+new URL(script.src).search,script.src).href;doc.head.append(l);}
  function deviceLine() {
    const ua = navigator.userAgent || '';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : T('其他', 'other');
    const os = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iOS/iPadOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
    const root = document.documentElement;
    const th = root.getAttribute('data-theme');
    const dark = th === 'dark' || (!th && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    return window.innerWidth + '×' + window.innerHeight + '・' + (dark ? T('深色', 'dark') : T('淺色', 'light')) + '・' + (root.lang || '') + '・' + br + (os ? '・' + os : '');
  }
  function feedbackContent(o){o=o||{};const box=E('div','lab-feedback-content');const compose=text=>{
      o.beforeCompose?.();
      if(window.LabComments){LabComments.compose(text);return;}
      // 獨立自學頁沒有留言後端，改到指定的實驗頁使用同一套 compose。
      const url=o.url||doc.body.dataset.commentsUrl;if(!url)return;
      const target=new URL(url,location.href);if(target.origin!==location.origin)return;
      const child=window.open(target.href,'_blank');if(!child)return;
      let tries=0;const timer=setInterval(()=>{if(child.closed||++tries>100){clearInterval(timer);return;}try{if(child.LabComments){clearInterval(timer);child.LabComments.compose(text);child.opener=null;}}catch(e){clearInterval(timer);}},100);
    };box.append(E('p','',T('分享觀察、問問題，或回報哪一步的畫面、數字或按鈕有問題。','Share an observation, ask a question, or report a problem with a step, display or button.')),B(T('到本實驗的留言區留言','Go to this lab’s comments'),()=>compose()),B(T('回報 bug','Report a bug'),()=>compose(T('【Bug 回報】\n哪一步、按了什麼：\n看到什麼：\n應該是：\n（裝置：','[Bug report]\nWhat I did: \nWhat I saw: \nWhat I expected: \n(Device: ')+deviceLine()+T('）',')'))));return box;}
  let instance;
  function mount(o){if(instance)return instance;const rail=E('nav','labside-rail');rail.setAttribute('aria-label',T('實驗側板','Lab side panels'));const pane=E('aside','labside-panel');pane.id='labside-panel';pane.setAttribute('aria-label',T('實驗步驟、任務與留言','Lab steps, missions and comments'));pane.hidden=true;const head=E('div','labside-head'),handle=B('⠿',()=>{},'labside-handle'),title=E('h2'),close=B(T('收起','Close'),()=>setOpen(false));handle.setAttribute('aria-label',T('拖曳調整側板高度','Drag to resize the drawer'));head.append(handle,title,close);const body=E('div','labside-content');pane.append(head,body);doc.body.append(rail,pane);doc.documentElement.classList.add('labside-active');
    const tabs={},names={steps:[T('步驟','Steps'),T('實驗步驟','Procedure')],missions:[T('任務','Missions'),T('本實驗的任務','Lab missions')],comments:[T('留言','Comments'),T('留言與 bug 回報','Comments and bug reports')]};const needOpen={};let open=false,tab='steps',cache='',height=Math.round(innerHeight*.43),sy,sh,watching=false;
    for(const k of ['steps','missions']){const b=B(names[k][0],()=>show(k));b.id='labside-tab-'+k;b.setAttribute('aria-controls',pane.id);b.setAttribute('aria-expanded','false');rail.append(b);tabs[k]=b;}
    // 收起／拉出側標籤（站長 11/16：箭頭提醒可以收起；收起後像三星手機一樣從側面拉出來）
    const fold=B('›',()=>setRail(false),'labside-fold');fold.setAttribute('aria-label',T('收起側邊標籤','Hide side tabs'));fold.title=T('收起側邊標籤（從右邊緣可以再拉出來）','Hide side tabs (pull them back from the right edge)');rail.prepend(fold);
    const edge=B('',()=>{if(!edgeSwiped)setRail(true);},'labside-edge');edge.setAttribute('aria-label',T('拉出側邊標籤：步驟、任務、留言','Show side tabs: steps, missions, comments'));doc.body.append(edge);
    let railOn=true,edgeSwiped=false;try{railOn=localStorage.getItem('labside-rail')!=='0';}catch(e){}
    function setRail(on){railOn=!!on;doc.documentElement.classList.toggle('labside-railed',!railOn);doc.documentElement.classList.remove('labside-pulling');rail.style.transform='';edge.setAttribute('aria-expanded',String(railOn));try{localStorage.setItem('labside-rail',railOn?'1':'0');}catch(e){}if(railOn&&doc.activeElement===edge)(tabs.steps||fold).focus();if(!railOn&&rail.contains(doc.activeElement))edge.focus();}
    setRail(railOn);
    // 從邊緣往左拉：側標籤跟著手指出來，拉超過一半就留著；從側標籤往右撥：收起
    let px=null,pdx=0;
    edge.addEventListener('pointerdown',e=>{px=e.clientX;pdx=0;edgeSwiped=false;edge.setPointerCapture(e.pointerId);});
    edge.addEventListener('pointermove',e=>{if(px==null)return;pdx=Math.max(0,px-e.clientX);if(pdx<6)return;edgeSwiped=true;const w=rail.offsetWidth+8;doc.documentElement.classList.add('labside-pulling');rail.style.transform='translateX('+Math.max(0,w-pdx)+'px)';});
    const edgeEnd=()=>{if(px==null)return;px=null;if(edgeSwiped){setRail(pdx>(rail.offsetWidth+8)/2);setTimeout(()=>{edgeSwiped=false;},0);}};
    edge.addEventListener('pointerup',edgeEnd);edge.addEventListener('pointercancel',()=>{px=null;edgeSwiped=false;setRail(false);});
    let rx=null,ry=0;
    rail.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;rx=e.clientX;ry=e.clientY;});
    rail.addEventListener('pointerup',e=>{if(rx==null)return;const dx=e.clientX-rx,dy=Math.abs(e.clientY-ry);rx=null;if(dx>28&&dx>dy){rail.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();},{capture:true,once:true});setRail(false);}});
    rail.addEventListener('pointercancel',()=>{rx=null;});
    function adoptFeedback(){const b=doc.querySelector('.fb-tab');if(!b)return;if(!rail.contains(b)){rail.append(b);b.replaceChildren(doc.createTextNode(names.comments[0]));b.setAttribute('aria-controls',pane.id);b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();show('comments');},{capture:true});tabs.comments=b;}b.hidden=!!o.study?.();}
    function setOpen(on){open=!!on&&!o.study?.();pane.hidden=!open;doc.documentElement.classList.toggle('labside-open',open);doc.documentElement.classList.toggle('labside-docked',open&&innerWidth>=1240);doc.documentElement.style.setProperty('--labside-height',height+'px');Object.entries(tabs).forEach(([k,b])=>{b.setAttribute('aria-expanded',String(open&&tab===k));});if(open){title.textContent=names[tab][1];render(true);if(innerWidth<1240)o.focus?.();}dispatchEvent(new Event('resize'));}
    function show(k){tab=k;setOpen(!open||body.dataset.tab!==k);body.dataset.tab=k;}
    function symbols(node,text){
      String(text).split(/(N[12]|V0)/g).forEach(s=>{if(/^(N[12]|V0)$/.test(s)){node.append(doc.createTextNode(s[0]),E('sub','',s[1]));}else node.append(doc.createTextNode(s));});return node;
    }
    function fillNeed(det,m){
      const list=window.LabMission?.needOf?.(m),ul=det.querySelector('ul');ul.replaceChildren();
      if(!list){ul.append(E('li','ms-need-act',T('先動手操作一次，這裡就會列出還差哪些條件。','Try it once and the missing conditions will be listed here.')));return;}
      for(const item of list){const li=E('li',item[0]===true?'ms-need-ok':item[0]===false?'ms-need-no':'ms-need-act');li.append(E('span','ms-need-mark',item[0]===true?'✓':item[0]===false?'✗':'→'),symbols(E('span'),T(item[1],item[2]||item[1])));ul.append(li);}
    }
    function refreshNeeds(){const list=window.LabMission?.all()[o.module]||[];body.querySelectorAll('details[data-labside-need][open]').forEach(det=>{const m=list.find(m=>m.id===det.dataset.labsideNeed);if(m)fillNeed(det,m);});}
    function render(force){if(!open)return;const steps=o.steps?.()||[],LM=window.LabMission,list=LM?.all()[o.module]||[],done=LM?._state?.done||{},signature=tab+JSON.stringify(tab==='steps'?steps:[!!LM?._state?.on,list.map(m=>[m.id,!!done[m.id]])]);if(!force&&signature===cache){refreshNeeds();return;}cache=signature;body.replaceChildren();body.dataset.tab=tab;
      if(tab==='comments'){body.append(feedbackContent({beforeCompose:()=>setOpen(false)}));return;}
      if(tab==='steps'){const h=E('div','labside-guide-head');h.append(E('p','',T('照步驟操作，隨時可以指給你看。','Follow the steps, or ask to see the next control.')));if(window.LabStepGuide)h.append(LabStepGuide.toggleButton());body.append(h);const ol=E('ol','labside-steps');steps.forEach((s,i)=>{const li=E('li',s.done?'done':s.current?'now':'');const p=E('div','');p.innerHTML=(s.done?'✓ ':'')+(i+1)+'. '+s.html;li.append(p,B(T('👆 指給我看','👆 Show me'),()=>{setOpen(false);o.guide(i);},'labside-show'));ol.append(li);});body.append(ol);return;}
      // 樣式沿用原本任務面板（lab.css 的 ms-*）：橘黃星星徽章、完成是金框、隱藏任務是斜紋卡
      // （站長 11/16：「以前的星星都是那個橘黃色的星星，可是現在怎麼都變成這種黑白色的星星，有夠難看的」）
      const STAR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
      const badge=(txt,label)=>{const b=E('span','ms-stars');b.innerHTML=STAR;b.append(E('span','',txt));b.setAttribute('aria-label',label);return b;};
      const sOf=m=>LM.starsOf?LM.starsOf(m):m.level;
      const on=!!LM?._state?.on,mode=B('',()=>{doc.querySelector('.ms-toggle')?.click();doc.querySelector('.ms-dock-close')?.click();render(true);},'labside-ms-toggle'+(on?' on':''));mode.innerHTML=STAR;mode.append(E('span','',on?T('任務模式：開','Mission mode: on'):T('任務模式：關','Mission mode: off')));mode.setAttribute('aria-pressed',String(on));body.append(mode);
      const labMode=doc.documentElement.dataset.labMode;if(labMode==='lab'||labMode==='learn')body.append(E('p','labside-ms-note',labMode==='lab'?T('實驗模式：這裡列一般與隱藏任務；自學任務在「學習模式」。星星兩邊合計。','Lab mode: missions and hidden missions are listed here; self-study missions are in Learning mode. Stars add up.'):T('學習模式：這裡列自學任務；一般與隱藏任務在「實驗模式」。星星兩邊合計。','Learning mode: self-study missions are listed here; missions and hidden missions are in Lab mode. Stars add up.')));
      for(const [kind,name] of [['normal',T('一般任務','Missions')],['hidden',T('隱藏任務','Hidden missions')],['study',T('自學任務','Self-study missions')]]){const a=list.filter(m=>(kind==='study'?m.study:kind==='hidden'?m.hidden:!m.study&&!m.hidden)&&(!LM.modeAllows||labMode!=='lab'&&labMode!=='learn'||LM.modeAllows(m)));if(!a.length)continue;
        const section=E('section','labside-mission-section'+(kind==='hidden'?' ms-sec-hid':''));const nd=a.filter(m=>done[m.id]).length,got=a.filter(m=>done[m.id]).reduce((n,m)=>n+(done[m.id].stars||sOf(m)),0),tot=a.reduce((n,m)=>n+sOf(m),0);
        const h=E('h3','labside-ms-head');h.append(E('span','ms-sec-name',name),E('span','ms-sec-count',nd+' / '+a.length),badge(got+' / '+tot,T('已得 '+got+' 顆，共 '+tot+' 顆倪的星星',got+' of '+tot+' Ni stars')));section.append(h);
        const box=E(kind==='hidden'?'ul':'ol',kind==='hidden'?'ms-hgrid':'ms-list');
        for(const m of a){const d=!!done[m.id],row=E('li',(kind==='hidden'?'ms-hcard':'ms-item')+' labside-mission'+(d?' done':''));row.dataset.mission=m.id;row.dataset.mid=m.id;
          const head=E('div','ms-head');head.append(badge('×'+sOf(m),sOf(m)+T(' 顆倪的星星',' Ni stars')));if(kind!=='hidden')head.append(E('strong','ms-title',T(m.title.zh,m.title.en)));if(d)head.append(E('span','ms-check',T('✓ 已完成','✓ Done')));row.append(head);
          if(kind==='hidden'){if(m.riddle)row.append(E('p','ms-desc',T('「'+m.riddle.zh+'」','“'+m.riddle.en+'”')));}else if(m.desc)row.append(symbols(E('p','ms-desc'),T(m.desc.zh,m.desc.en)));
        if(!m.hidden&&!done[m.id]&&typeof m.need==='function'){
          const det=E('details','ms-need');det.dataset.labsideNeed=m.id;det.append(E('summary','',T('還差什麼？','What’s missing?')),E('ul'));det.open=!!needOpen[m.id];if(det.open)fillNeed(det,m);det.addEventListener('toggle',()=>{needOpen[m.id]=det.open;if(det.open)fillNeed(det,m);});row.append(det);
        }
          box.append(row);}
        section.append(box);body.append(section);}
    }
    handle.addEventListener('pointerdown',e=>{if(innerWidth>=1240)return;sy=e.clientY;sh=height;handle.setPointerCapture(e.pointerId);});handle.addEventListener('pointermove',e=>{if(sy==null)return;height=Math.max(220,Math.min(innerHeight-100,sh+sy-e.clientY));doc.documentElement.style.setProperty('--labside-height',height+'px');});handle.addEventListener('pointerup',()=>{sy=null;});handle.addEventListener('pointercancel',()=>{sy=null;});
    doc.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});addEventListener('resize',()=>{doc.documentElement.classList.toggle('labside-docked',open&&innerWidth>=1240);});
    function sync(){adoptFeedback();const study=!!o.study?.();const panelOpen=innerWidth<1240&&window.LabPanel&&LabPanel.state!=='collapsed';rail.hidden=study||!!panelOpen;edge.hidden=rail.hidden;if(study&&open)setOpen(false);doc.documentElement.classList.toggle('labside-study',study);if(doc.documentElement.classList.contains('ms-docked'))doc.querySelector('.ms-dock-close')?.click();render(false);}
    setInterval(sync,250);window.LabMission?.on('complete',()=>render(true));sync();instance={open:k=>{tab=k;setOpen(true);},close:()=>setOpen(false),refresh:sync,showRail:()=>setRail(true),hideRail:()=>setRail(false),get railOpen(){return railOn;},get state(){return {open,tab,height};}};return instance;
  }
  window.LabSide={mount,feedbackContent,deviceLine,get instance(){return instance;}};
})();
