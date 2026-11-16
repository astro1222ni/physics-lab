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
    const tabs={},names={steps:[T('步驟','Steps'),T('實驗步驟','Procedure')],missions:[T('任務','Missions'),T('本實驗的任務','Lab missions')],comments:[T('留言','Comments'),T('留言與 bug 回報','Comments and bug reports')]};let open=false,tab='steps',cache='',height=Math.round(innerHeight*.43),sy,sh,watching=false;
    for(const k of ['steps','missions']){const b=B(names[k][0],()=>show(k));b.id='labside-tab-'+k;b.setAttribute('aria-controls',pane.id);b.setAttribute('aria-expanded','false');rail.append(b);tabs[k]=b;}
    function adoptFeedback(){const b=doc.querySelector('.fb-tab');if(!b)return;if(!rail.contains(b)){rail.append(b);b.replaceChildren(doc.createTextNode(names.comments[0]));b.setAttribute('aria-controls',pane.id);b.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();show('comments');},{capture:true});tabs.comments=b;}b.hidden=!!o.study?.();}
    function setOpen(on){open=!!on&&!o.study?.();pane.hidden=!open;doc.documentElement.classList.toggle('labside-open',open);doc.documentElement.classList.toggle('labside-docked',open&&innerWidth>=1240);doc.documentElement.style.setProperty('--labside-height',height+'px');Object.entries(tabs).forEach(([k,b])=>{b.setAttribute('aria-expanded',String(open&&tab===k));});if(open){title.textContent=names[tab][1];render(true);if(innerWidth<1240)o.focus?.();}dispatchEvent(new Event('resize'));}
    function show(k){tab=k;setOpen(!open||body.dataset.tab!==k);body.dataset.tab=k;}
    function render(force){if(!open)return;const steps=o.steps?.()||[],LM=window.LabMission,list=LM?.all()[o.module]||[],done=LM?._state?.done||{},signature=tab+JSON.stringify(tab==='steps'?steps:[!!LM?._state?.on,list.map(m=>[m.id,!!done[m.id]])]);if(!force&&signature===cache)return;cache=signature;body.replaceChildren();body.dataset.tab=tab;
      if(tab==='comments'){body.append(feedbackContent({beforeCompose:()=>setOpen(false)}));return;}
      if(tab==='steps'){const h=E('div','labside-guide-head');h.append(E('p','',T('照步驟操作，隨時可以指給你看。','Follow the steps, or ask to see the next control.')));if(window.LabStepGuide)h.append(LabStepGuide.toggleButton());body.append(h);const ol=E('ol','labside-steps');steps.forEach((s,i)=>{const li=E('li',s.done?'done':s.current?'now':'');const p=E('div','');p.innerHTML=(s.done?'✓ ':'')+(i+1)+'. '+s.html;li.append(p,B(T('👆 指給我看','👆 Show me'),()=>{setOpen(false);o.guide(i);},'labside-show'));ol.append(li);});body.append(ol);return;}
      const mode=B(LM?._state?.on?T('任務模式：開','Mission mode: on'):T('任務模式：關','Mission mode: off'),()=>{doc.querySelector('.ms-toggle')?.click();doc.querySelector('.ms-dock-close')?.click();render(true);});body.append(mode);
      for(const [kind,name] of [['normal',T('一般任務','Missions')],['hidden',T('隱藏任務','Hidden missions')],['study',T('自學任務','Self-study missions')]]){const a=list.filter(m=>kind==='study'?m.study:kind==='hidden'?m.hidden:!m.study&&!m.hidden);if(!a.length)continue;const section=E('section','labside-mission-section');section.append(E('h3','',name));for(const m of a){const row=E('div','labside-mission'+(done[m.id]?' done':''));row.dataset.mission=m.id;const label=m.hidden?T('隱藏任務','Hidden mission'):T(m.title.zh,m.title.en);row.append(E('strong','',(done[m.id]?'✓ ':'○ ')+label),E('span','',T('等級 ','Level ')+m.level+' · '+(LM.starsOf?LM.starsOf(m):m.level)+' ★ · '+(done[m.id]?T('已完成','Complete'):T('未完成','Not yet'))));section.append(row);}body.append(section);}
    }
    handle.addEventListener('pointerdown',e=>{if(innerWidth>=1240)return;sy=e.clientY;sh=height;handle.setPointerCapture(e.pointerId);});handle.addEventListener('pointermove',e=>{if(sy==null)return;height=Math.max(220,Math.min(innerHeight-100,sh+sy-e.clientY));doc.documentElement.style.setProperty('--labside-height',height+'px');});handle.addEventListener('pointerup',()=>{sy=null;});handle.addEventListener('pointercancel',()=>{sy=null;});
    doc.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false);});addEventListener('resize',()=>{doc.documentElement.classList.toggle('labside-docked',open&&innerWidth>=1240);});
    function sync(){adoptFeedback();const study=!!o.study?.();rail.hidden=study;if(study&&open)setOpen(false);doc.documentElement.classList.toggle('labside-study',study);if(doc.documentElement.classList.contains('ms-docked'))doc.querySelector('.ms-dock-close')?.click();render(false);}
    setInterval(sync,250);window.LabMission?.on('complete',()=>render(true));sync();instance={open:show,close:()=>setOpen(false),refresh:sync,get state(){return {open,tab,height};}};return instance;
  }
  window.LabSide={mount,feedbackContent,deviceLine,get instance(){return instance;}};
})();
