/* Lesson player and reusable, DOM-free timing / numerical grading functions. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.LearnEngine = api; document.addEventListener('DOMContentLoaded', api.mount); document.addEventListener('DOMContentLoaded', api.mastControls); }
})(globalThis, function () {
  'use strict';
  function parseScript(source) {
    let display='', spoken='';const marks={};
    for (const part of source.split(/(\[\[[\w-]+\]\]|\{\{[^{}|]+\|[^{}|]+\}\})/g)) {
      if (part.startsWith('[[')) {marks[part.slice(2,-2)]=spoken.length;continue;}
      if (part.startsWith('{{')) {const [d,v]=part.slice(2,-2).split('|');display+=d;spoken+=v;continue;}
      display+=part;spoken+=part;
    }
    return {display,spoken,marks};
  }
  function estimate(source,lang='zh') {
    const {spoken,marks}=parseScript(source), rate=lang==='en'?2.6:4;
    const count=t=>lang==='en'?(t.match(/[A-Za-z0-9]+(?:[.’'-][A-Za-z0-9]+)*/g)||[]).length:
      (t.match(/[\p{L}\p{N}]/gu)||[]).length;
    const sec=t=>Math.round(count(t)/rate*1000)/1000;
    return {dur:Number((sec(spoken)+.6).toFixed(3)),marks:Object.fromEntries(Object.entries(marks).map(([k,i])=>[k,sec(spoken.slice(0,i))]))};
  }
  let mathLoad;
  function mathReady() {
    if (typeof module==='object'&&module.exports)return Promise.resolve(require('../vendor/mathjs/math.min.js'));
    if(window.math)return Promise.resolve(window.math);
    if(!mathLoad)mathLoad=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/mathjs/math.min.js';s.onload=()=>resolve(window.math);s.onerror=()=>{mathLoad=null;reject(Error('mathjs'));};document.head.append(s);});
    return mathLoad;
  }
  function numeric(input) {
    let s=String(input).normalize('NFKC').trim().replace(/[−﹣]/g,'-').replace(/(\d|\.)\s*[×x*]\s*10\s*\^\s*([+-]?\d+)/gi,'$1e$2');
    const token='[+-]?(?:(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
    const m=s.match(new RegExp('^('+token+')(?:\\s*/\\s*('+token+'))?\\s*(%|[a-zA-ZµμΩ°][a-zA-Z0-9µμΩ°/^*-]*)?$','i'));
    if(!m)return null;
    const val=Number(m[1].replace(/,/g,''))/(m[2]?Number(m[2].replace(/,/g,'')):1)/(m[3]==='%'?100:1);
    return Number.isFinite(val)?{value:val,unit:m[3]==='%'?'':(m[3]||'')}:null;
  }
  async function gradeNumber(input,answer,opts={}) {
    const v=numeric(input);if(!v)return false;let value=v.value;
    if(v.unit&&v.unit!==opts.unit){
      if(!opts.unit)return false;
      try{const math=await mathReady();value=math.unit(value,v.unit).toNumber(opts.unit);}catch{return false;}
    }
    const tolerance=Math.max(opts.absolute||0,Math.abs(answer)*(opts.relative??.02));
    return Math.abs(value-answer)<=tolerance+Number.EPSILON*Math.max(1,Math.abs(answer))*4;
  }
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const read=(k,def)=>{try{return JSON.parse(localStorage.getItem(k))??def;}catch{return def;}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{/* private mode */}};

  // ── 電腦語音偵測（11/23 從播放器搬到這裡：學測頁頂列「聲音」鍵在解答還沒打開前也要能先選聲音）
  let DVK=null;
  function deviceVoices(){
    if(DVK)return DVK;
    // 電腦語音（11/23 站長：「仿照『龍騰：第2章試做』，聲音的播放加入載具本身的英文跟中文。英文分女性跟男性，中文只有女性……是載具本身自己可以轉換的」，
    // 另加「電腦語音・男（普通話）」；「AI語音・女／男（預錄）」這邊不做）。做法照龍騰 lt-engine.js：瀏覽器內建 speechSynthesis，選項放在語速鍵的選單上半部；
    // 中文女聲只收臺灣國語（简体介面也收 zh-CN），普通話男聲只在简体介面出現；這台裝置沒有的聲音那格變灰、寫原因。動畫照念到第幾個字對時。
    const SS=window.speechSynthesis,SSU=window.SpeechSynthesisUtterance,HANS=LabSettings.lang==='zh-Hans';
    const E_F=[/\baria\b/i,/\bjenny\b/i,/\bava\b/i,/\bemma\b/i,/michelle/i,/google us english/i,/samantha/i,/\bzira\b/i,/\blibby\b/i,/\bsonia\b/i,/google uk english female/i,/\bkaren\b/i,/\bmoira\b/i,/\btessa\b/i,/allison/i,/\bsusan\b/i,/serena/i,/\bfiona\b/i,/victoria/i];
    const E_M=[/\bguy\b/i,/\bandrew\b/i,/\bbrian\b/i,/christopher/i,/\beric\b/i,/\broger\b/i,/steffan/i,/\bryan\b/i,/google uk english male/i,/\bdaniel\b/i,/\balex\b/i,/\baaron\b/i,/\bfred\b/i,/\bdavid\b/i,/\bmark\b/i,/\bgeorge\b/i,/\btom\b/i,/\boliver\b/i,/\barthur\b/i,/\brishi\b/i];
    const V_M=[/yunjhe|雲哲/i,/zhiwei|志偉/i,/\breed\b/i,/\beddy\b/i,/\brocko\b/i,/grandpa/i,/yunxi|雲希|云希/i,/yunyang|雲揚|云扬/i,/kangkang|康康/i];
    const V_MC=[/yunxi|雲希|云希/i,/yunyang|雲揚|云扬/i,/yunjian|雲健|云健/i,/yunze|雲澤|云泽/i,/yunfeng|雲楓|云枫/i,/yunhao|雲皓|云皓/i,/kangkang|康康/i,/li-?mu|李牧/i];
    const V_F=[/hsiaochen|曉臻/i,/hsiaoyu|曉雨/i,/google/i,/yating|雅婷/i,/hanhan|涵涵/i,/mei-?jia|美佳/i,/\bsandy\b/i,/\bshelley\b/i,/\bflo\b/i,/grandma/i,/xiaoxiao|曉曉|晓晓/i,/xiaoyi|曉伊|晓伊/i,/huihui|慧慧/i,/tingting|婷婷/i];
    const VO={ready:false,zf:null,mc:null,ef:null,em:null};
    const langNorm=l=>String(l||'').replace(/_/g,'-').toLowerCase().replace(/-#\w+$/,''),rankIn=(list,name)=>list.findIndex(r=>r.test(name));
    const isTW=v=>/^(zh|cmn)-(hant-)?tw$/.test(langNorm(v.lang)),isCN=v=>/^(zh|cmn)-(hans-)?cn$/.test(langNorm(v.lang));
    function pickVoices(){
      let all=[];try{all=SS.getVoices()||[];}catch{/* 略 */}
      if(!all.length&&!VO.timedOut)return false;
      const zh=all.filter(isTW).concat(HANS?all.filter(isCN):[]),byRank=list=>(a,b)=>rankIn(list,a.name)-rankIn(list,b.name);
      const f=zh.filter(v=>rankIn(V_F,v.name)>=0).sort(byRank(V_F));VO.zf=f[0]||zh.filter(v=>rankIn(V_M,v.name)<0)[0]||null;
      VO.mc=HANS?all.filter(v=>isCN(v)&&rankIn(V_MC,v.name)>=0).sort(byRank(V_MC))[0]||null:null;
      const enV=all.filter(v=>/^en(-|$)/.test(langNorm(v.lang))),eRank=list=>v=>{const r=rankIn(list,v.name);return (r<0?99:r)*4+(/^en-us$/.test(langNorm(v.lang))?0:2)+(v.localService===false?0:1);};
      const ef=enV.filter(v=>rankIn(E_F,v.name)>=0).sort((a,b)=>eRank(E_F)(a)-eRank(E_F)(b)),em=enV.filter(v=>rankIn(E_M,v.name)>=0).sort((a,b)=>eRank(E_M)(a)-eRank(E_M)(b));
      VO.ef=ef[0]||enV.filter(v=>rankIn(E_M,v.name)<0).sort((a,b)=>eRank([])(a)-eRank([])(b))[0]||null;VO.em=em[0]||null;
      return true;
    }
    const VOICES=['ni','zf',...(HANS?['mc']:[]),'ef','em'],isTTS=v=>v!=='ni',vEN=v=>v==='ef'||v==='em';
    DVK={SS,SSU,HANS,VO,pickVoices,VOICES,isTTS,vEN};return DVK;
  }
  function voiceName(v){const T=(z,e)=>LabSettings.t(z,e);return v==='ni'?T('倪老師・AI 仿聲','Dr. Ni · AI voice clone'):v==='zf'?T('電腦語音・女','Chinese · female'):v==='mc'?T('電腦語音・男（普通話）','Chinese · male (Mandarin)'):v==='ef'?'English · female':'English · male';}
  const VRATES=[.8,1,1.2,1.4,1.6,1.8],vNear=v=>VRATES.reduce((a,b)=>{const da=Math.abs(a-v),db=Math.abs(b-v);return db<da-1e-9||(Math.abs(db-da)<1e-9&&Math.abs(b-1)<Math.abs(a-1))?b:a;},1);
  // 彈出選單（旁白聲音＋語速、語言）：一次只開一個；點別處、捲動、改視窗大小、Esc 都收起
  const VM={anchor:null,host:null,kind:'',build:null,wired:false};
  function closeVoiceMenu(){document.querySelector('.learn-rmenu')?.remove();const h=VM.host;VM.host=null;VM.kind='';if(h&&h.closed)h.closed();}
  function openPop(anchor,host,kind,build,keepFocus){
    document.querySelector('.learn-rmenu')?.remove();VM.anchor=anchor;VM.host=host;VM.kind=kind;VM.build=build;
    if(!VM.wired){VM.wired=true;
      document.addEventListener('pointerdown',e=>{if(VM.host&&!e.target.closest('.learn-rmenu')&&!(VM.anchor&&VM.anchor.contains(e.target)))closeVoiceMenu();});
      addEventListener('resize',()=>VM.host&&closeVoiceMenu());addEventListener('scroll',()=>VM.host&&closeVoiceMenu(),{passive:true});
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&VM.host){const a=VM.anchor;closeVoiceMenu();a?.focus();}});}
    const m=document.createElement('div');m.className='learn-rmenu'+(kind==='lang'?' learn-lmenu':'');m.setAttribute('role','group');
    build(m);document.body.append(m);
    const r=anchor.getBoundingClientRect(),W=m.offsetWidth,H=m.offsetHeight,vw=document.documentElement.clientWidth;
    const left=Math.min(Math.max(8,r.left+r.width/2-W/2),vw-W-8),below=r.bottom+6+H<=innerHeight-8;
    m.style.left=left+'px';m.style.top=(below?r.bottom+6:Math.max(8,r.top-6-H))+'px';
    if(!below&&r.top-6-H<8)m.style.maxHeight=(innerHeight-16)+'px';
    if(!keepFocus)m.querySelector('[aria-pressed="true"]:not([data-snd])')?.focus({preventScroll:true});
    if(host.opened)host.opened();
  }
  function refreshVoiceMenu(){if(VM.host&&VM.kind==='voice'&&document.querySelector('.learn-rmenu'))openPop(VM.anchor,VM.host,'voice',VM.build,true);}
  function openVoiceMenu(anchor,host,keepFocus){
    const T=(z,e)=>LabSettings.t(z,e);
    openPop(anchor,host,'voice',m=>{
      const {SS,SSU,VO,VOICES,vEN}=deviceVoices(),vpick=host.vpick(),speed=host.speed(),sound=!!LabSettings.get('sound');
      m.setAttribute('aria-label',T('旁白聲音與語速','Narration voice and speed'));
      const vopt=v=>{const has=v==='ni'||(VO.ready&&!!VO[v]),why=!(SS&&SSU)?T('這個瀏覽器不支援電腦語音','This browser has no device voices'):!VO.ready?T('正在找這台裝置的聲音…','Looking for voices…'):T('這台裝置沒有'+(vEN(v)?(v==='ef'?'英文女聲':'英文男聲'):v==='mc'?'普通話男聲':'臺灣國語女聲'),'No '+(vEN(v)?(v==='ef'?'English female':'English male'):v==='mc'?'Mandarin male':'Chinese female')+' voice on this device');
        const sub=v==='ni'?T('預錄旁白','Recorded narration'):has?VO[v].name.replace(/^(Microsoft|Google)\s+/,'').replace(/\s*-\s*.*$/,''):why;
        return '<button type="button" class="rm-voice" data-voice="'+v+'" aria-pressed="'+(v===vpick)+'"'+(has?'':' disabled')+'><b>'+voiceName(v)+'</b><small>'+sub+'</small></button>';};
      m.innerHTML='<button type="button" class="rm-snd" data-snd aria-pressed="'+sound+'"><span aria-hidden="true">'+(sound?'🔊':'🔇')+'</span>'+(sound?T('旁白開著（按一下關掉）','Narration on (tap to mute)'):T('旁白關著（按一下打開）','Narration off (tap to turn on)'))+'</button>'
        +(host.premount?'<p class="rm-note">'+T('先選好，打開解答就照這裡的聲音和語速播放。','Pick now; the solution will play with this voice and speed.')+'</p>':'')
        +'<div class="rm-title">'+T('旁白語速','Narration speed')+'</div><div class="rm-grid rm-grid6">'+VRATES.map(r=>'<button type="button" data-rate="'+r+'" aria-pressed="'+(r===speed)+'">'+r.toFixed(1)+'×</button>').join('')+'</div>'
        +'<div class="rm-title">'+T('旁白聲音','Narration voice')+'</div><div class="rm-voices">'+VOICES.map(vopt).join('')+'</div>';
      m.addEventListener('click',ev=>{
        if(ev.target.closest('[data-snd]')){LabSettings.set('sound',!LabSettings.get('sound'));refreshVoiceMenu();return;}
        const vb=ev.target.closest('[data-voice]');if(vb&&!vb.disabled){closeVoiceMenu();host.setVoice(vb.dataset.voice);return;}
        const b=ev.target.closest('[data-rate]');if(b)host.setRate(+b.dataset.rate);});
    },keepFocus);
  }
  function warmVoices(){
    const K=deviceVoices();if(!K.SS||!K.SSU||K.warm)return;K.warm=true;
    const go=()=>{if(K.pickVoices()){K.VO.ready=true;refreshVoiceMenu();}};
    setTimeout(go,0);try{if(K.SS.addEventListener)K.SS.addEventListener('voiceschanged',go);}catch{/* 略 */}
    setTimeout(()=>{if(!K.VO.ready){K.VO.timedOut=true;go();}},2500);
  }
  // ── 學測頁頂列三鍵（11/23 站長：「沉浸模式、語言選擇、語音選擇，根本就沒有上線啊。」原本都要答完、打開解答、捲到解答卡最下面才看得到）
  // 沉浸：解答開著就讓解題卡蓋滿畫面；還沒開就整頁進全螢幕、收起麵包屑與工具列。聲音：旁白開關＋聲音＋語速，解答還沒開也能先選。語言：繁中／简中／English。
  function mastControls(){
    const mast=document.querySelector('body.exam-page .learn-mast');if(!mast||document.getElementById('mast-voice'))return;
    const T=(z,e)=>LabSettings.t(z,e),root=document.documentElement,by=id=>document.getElementById(id);
    const mk=(id,label)=>{const b=document.createElement('button');b.type='button';b.id=id;b.className='mast-btn';b.setAttribute('aria-label',label);return b;};
    const box=document.createElement('div');box.className='mast-tools';
    const imm=mk('mast-imm',''),snd=mk('mast-voice',T('旁白聲音與語速','Narration voice and speed')),lang=mk('mast-lang',T('切換語言','Language'));
    snd.setAttribute('aria-haspopup','true');lang.setAttribute('aria-haspopup','true');
    box.append(imm,snd,lang);const cm=by('class-mode');if(cm)cm.after(box);else mast.append(box);
    warmVoices();
    const {HANS,VOICES}=deviceVoices(),vkey='learn-voice'+(HANS?'-hans':'');
    const pre={premount:true,vpick:()=>{const v=read(vkey,null);return VOICES.includes(v)?v:(LabSettings.lang==='en'?'ef':'ni');},speed:()=>vNear(+read('learn-rate',1)||1),
      setVoice:v=>{write(vkey,v);labels();},setRate:r=>{write('learn-rate',r);closeVoiceMenu();},closed:()=>labels(),opened:()=>labels()};
    const host=()=>{const h=window.LearnVoiceHost;return h?{...h,closed:()=>{h.closed&&h.closed();labels();},opened:()=>labels()}:pre;};
    const icon=on=>'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+(on?'<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>':'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')+'</svg>';
    const LANGS=[['zh-Hant','繁體中文','繁中'],['zh-Hans','简体中文','简中'],['en','English','EN']];
    const FLAG='exam-imm-page',ss={get:()=>{try{return sessionStorage.getItem(FLAG)==='1';}catch{return false;}},set:on=>{try{on?sessionStorage.setItem(FLAG,'1'):sessionStorage.removeItem(FLAG);}catch{/* 略 */}}};
    const outer=(()=>{try{return window.top!==window&&parent.__examImm?parent.__examImm:null;}catch{return null;}})();
    const fsOn=()=>document.fullscreenElement||document.webkitFullscreenElement||(outer&&outer.fsOn());
    const fsReq=()=>{const req=root.requestFullscreen||root.webkitRequestFullscreen;if(req&&!fsOn())try{const r=req.call(root);if(r&&r.catch)r.catch(()=>{});}catch(e){/* 略 */}};
    const fsExit=()=>{const ex=document.exitFullscreen||document.webkitExitFullscreen;if(document.fullscreenElement||document.webkitFullscreenElement)try{const r=ex&&ex.call(document);if(r&&r.catch)r.catch(()=>{});}catch(e){/* 略 */}};
    // 換題是整頁換頁，瀏覽器一換頁就退出全螢幕：全螢幕中換題改在全螢幕裡的 iframe 載入新題；退出時整頁換到正在看的那一題
    let frame=null;
    if(!outer)window.__examImm={fsOn:()=>document.fullscreenElement||document.webkitFullscreenElement,leave(url){ss.set(false);fsExit();if(url&&url!==location.href)location.href=url;else if(frame){frame.remove();frame=null;root.classList.remove('exam-imm-framed');pageImm(false);}}};
    function openFrame(url){
      try{window.LearnPlayer?.pause?.();}catch{/* 略 */}
      if(!frame){frame=document.createElement('iframe');frame.id='imm-frame';frame.title=document.title;frame.setAttribute('allow','fullscreen; autoplay');document.body.append(frame);root.classList.add('exam-imm-framed');}
      frame.src=url;frame.focus();
    }
    if(ss.get())root.classList.add('exam-imm-page');
    function labels(){
      const on=root.classList.contains('learn-immersive')||root.classList.contains('exam-imm-page');
      imm.setAttribute('aria-pressed',String(on));imm.innerHTML=icon(on)+'<span class="mb-t">'+(on?T('退出','Exit'):T('沉浸','Immersive'))+'</span>';
      imm.title=on?T('退出沉浸模式（Esc）','Exit immersive mode (Esc)'):T('沉浸模式：全螢幕','Immersive mode: full screen');imm.setAttribute('aria-label',imm.title);
      const sound=!!LabSettings.get('sound'),open=VM.host&&VM.anchor===snd;
      snd.innerHTML='<span class="mb-i" aria-hidden="true">'+(sound?'🔊':'🔇')+'</span><span class="mb-t">'+T('聲音','Voice')+'</span><small class="mb-r">'+host().speed().toFixed(1)+'×</small>';
      snd.setAttribute('aria-expanded',String(!!open));snd.classList.toggle('off',!sound);
      const L=LANGS.find(x=>x[0]===LabSettings.lang)||LANGS[0],lo=VM.host&&VM.anchor===lang;
      lang.innerHTML='<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.5 3.8 5.6 3.8 9s-1.2 6.5-3.8 9c-2.6-2.5-3.8-5.6-3.8-9S9.4 5.5 12 3z"/></svg><span class="mb-t" data-no-convert lang="'+L[0]+'">'+L[2]+'</span><span class="mb-c" aria-hidden="true">▾</span>';
      lang.setAttribute('aria-expanded',String(!!lo));
    }
    function pageImm(on){
      ss.set(on);
      if(!on&&outer){outer.leave(location.href);return;}
      root.classList.toggle('exam-imm-page',on);
      if(on)fsReq();else{root.dataset.pageFs='';fsExit();}
      labels();dispatchEvent(new Event('resize'));
    }
    imm.onclick=()=>{
      if(root.classList.contains('learn-immersive')){by('immersive')?.click();return;}
      if(root.classList.contains('exam-imm-page')){pageImm(false);return;}
      if(by('immersive')&&by('explanation')&&!by('explanation').hidden){by('immersive').click();return;}
      pageImm(true);
    };
    const fsChange=()=>{if(fsOn()){root.dataset.pageFs='1';return;}if(root.dataset.pageFs!=='1'||!root.classList.contains('exam-imm-page'))return;
      if(frame){let u='';try{u=frame.contentWindow.location.href;}catch{/* 略 */}window.__examImm.leave(u);}else pageImm(false);};
    // 換題連結：沉浸中留在沉浸；全螢幕中在全螢幕裡載入；在 iframe 裡點到學測頁以外的連結，先退出沉浸再整頁前往
    document.addEventListener('click',e=>{
      const a=e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank'||!root.classList.contains('exam-imm-page'))return;
      let u;try{u=new URL(a.href,location.href);}catch{return;}
      const exam=u.origin===location.origin&&/\/exam-\d+\.html$/.test(u.pathname);
      if(outer){if(!exam){e.preventDefault();outer.leave(u.href);}return;}
      if(exam&&fsOn()){e.preventDefault();openFrame(u.href);}
    },true);
    // 換題後（或重新整理）版面照樣沉浸；瀏覽器不讓網頁自己進全螢幕，點畫面任何地方再回到全螢幕
    if(!outer&&root.classList.contains('exam-imm-page')&&(root.requestFullscreen||root.webkitRequestFullscreen))document.addEventListener('pointerdown',function re(){document.removeEventListener('pointerdown',re,true);if(root.classList.contains('exam-imm-page')&&!fsOn())fsReq();},true);
    document.addEventListener('fullscreenchange',fsChange);document.addEventListener('webkitfullscreenchange',fsChange);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!VM.host&&root.classList.contains('exam-imm-page')&&!root.classList.contains('learn-immersive'))pageImm(false);});
    snd.onclick=e=>{e.stopPropagation();if(VM.host&&VM.anchor===snd)return closeVoiceMenu();openVoiceMenu(snd,host());};
    lang.onclick=e=>{e.stopPropagation();if(VM.host&&VM.anchor===lang)return closeVoiceMenu();
      openPop(lang,{closed:labels,opened:labels},'lang',m=>{
        m.setAttribute('aria-label',T('語言','Language'));
        m.innerHTML='<div class="rm-title">'+T('顯示語言','Display language')+'</div>'+LANGS.map(([v,name])=>'<button type="button" class="rm-lang" data-lang="'+v+'" lang="'+v+'" data-no-convert aria-pressed="'+(v===LabSettings.lang)+'">'+name+'</button>').join('');
        m.addEventListener('click',ev=>{const b=ev.target.closest('[data-lang]');if(!b)return;const v=b.dataset.lang;if(v===LabSettings.lang)return closeVoiceMenu();
          try{const st=JSON.parse(localStorage.getItem('lab-settings')||'{}');st.lang=v;localStorage.setItem('lab-settings',JSON.stringify(st));}catch{/* 略 */}
          try{const u=new URL(location.href);u.searchParams.delete('lang');location.replace(u.href);}catch{location.reload();}});
      });};
    // 沉浸中閒置 3 秒，播放列變半透明（照龍騰學生版：不擋眼睛、手指照樣按得到）
    // 只在 class 真的要變時才改（改 class 會觸發下面的監看，不能互相觸發成迴圈）
    let idle=0;const sleep=()=>{idle=0;if(root.classList.contains('learn-immersive')&&!root.classList.contains('learn-imm-idle'))root.classList.add('learn-imm-idle');};
    const wake=()=>{if(root.classList.contains('learn-imm-idle'))root.classList.remove('learn-imm-idle');clearTimeout(idle);idle=root.classList.contains('learn-immersive')?setTimeout(sleep,3000):0;};
    ['pointerdown','pointermove','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,wake,{passive:true}));
    new MutationObserver(()=>{labels();const on=root.classList.contains('learn-immersive');if(on&&!idle&&!root.classList.contains('learn-imm-idle'))idle=setTimeout(sleep,3000);if(!on){clearTimeout(idle);idle=0;if(root.classList.contains('learn-imm-idle'))root.classList.remove('learn-imm-idle');}}).observe(root,{attributes:true,attributeFilter:['class']});
    addEventListener('lab:settingschange',labels);
    labels();guardNear();
    {const mast=document.querySelector('.learn-mast');if(mast&&window.ResizeObserver)new ResizeObserver(()=>root.style.setProperty('--mast-h',mast.offsetHeight+'px')).observe(mast);}
  }
  // 任務提示框（.ms-near，例如「星星還沒有記錄」）讓位（11/23 站長選 A：提示框蓋住解答播放列）：
  // 提示框固定在畫面底部，學測頁的播放列也黏在底部；依序試「原本位置 → 播放列正上方 → 畫面上方（避開黏住的頂列）」，挑不蓋到要按的鍵的那個
  function guardNear(){
    const KEEP='#workpad>.transport,.mast-btn,#class-mode,#explain,#send-answer,.lab-account,.lab-gear';
    const vis=e=>{if(!e||e.hidden||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight?r:null;};
    const hit=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    let busy=false,raf=0;
    function place(box){
      if(busy||box.hidden||!box.getClientRects().length)return;busy=true;
      const keep=[...document.querySelectorAll(KEEP)].map(vis).filter(Boolean);
      const X=[['','','',''],['12px','auto','none','min(440px,calc(50vw - 24px))'],['auto','12px','none','min(440px,calc(50vw - 24px))']];
      const setX=x=>{box.style.left=x[0];box.style.right=x[1];box.style.transform=x[2];box.style.width=x[3];};
      setX(X[0]);box.style.top='';box.style.bottom='';
      const tr=vis(document.querySelector('#workpad>.transport')),mast=document.querySelector('.learn-mast'),mr=mast&&getComputedStyle(mast).position==='sticky'?vis(mast):null;
      const cands=[()=>{box.style.top='';box.style.bottom='';}]; // 上下位置：原位、播放列正上方、頂列下方；左右：置中，太矮的橫放畫面再試左半邊、右半邊
      if(tr)cands.push(()=>{box.style.top='auto';box.style.bottom=(innerHeight-tr.top+8)+'px';});
      cands.push(()=>{let y=(mr?mr.bottom:0)+8;box.style.bottom='auto';box.style.top=y+'px';for(let i=0;i<4;i++){const r=box.getBoundingClientRect(),k=keep.filter(q=>hit(r,q)>0);if(!k.length)break;y=Math.max(...k.map(q=>q.bottom))+8;box.style.top=y+'px';}});
      let best=null;const opts=[];X.forEach((x,xi)=>{if(xi&&innerWidth<600)return;cands.forEach(v=>opts.push(()=>{setX(x);v();}));});
      opts.forEach((apply,i)=>{apply();const r=box.getBoundingClientRect();const cost=keep.reduce((t,q)=>t+hit(r,q),0)+(r.top<0||r.bottom>innerHeight?1e6:0);if(!best||cost<best.cost-1)best={i,cost};});
      opts[best.i]();busy=false;
    }
    const all=()=>document.querySelectorAll('.ms-near').forEach(place);
    const soon=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(all);};
    const watch=new MutationObserver(soon),seen=new WeakSet();
    const hook=()=>document.querySelectorAll('.ms-near').forEach(b=>{if(!seen.has(b)){seen.add(b);watch.observe(b,{attributes:true,attributeFilter:['hidden'],childList:true});}});
    new MutationObserver(()=>{hook();soon();}).observe(document.body,{childList:true});
    const ex=document.getElementById('explanation');if(ex)watch.observe(ex,{attributes:true,attributeFilter:['hidden']});
    watch.observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    addEventListener('scroll',soon,{passive:true});addEventListener('resize',soon);hook();soon();
  }
  function progress(unit,n,notify) {
    const key='learn-progress:'+unit, local=uid=>uid?key+':'+uid:key;
    let uid=null,backend=null,epoch=0,ready=false,chain=Promise.resolve(),remote=0,guest=true,known=false,pending=0;
    const capped=p=>clamp(Number.isInteger(p)?p:0,0,n);
    const get=()=>Math.max(pending,capped(read(local(uid),{}).p));
    function save(p){write(local(uid),{p:capped(p),n,at:Date.now()});notify(get());}
    function push(){
      if(!uid||!ready||get()<=remote)return;
      const id=uid,e=epoch,path='learn/'+id+'/'+unit;
      chain=chain.catch(()=>{}).then(async()=>{
        if(e!==epoch)return;
        const existing=await backend.get(path);if(e!==epoch)return;
        // 頁數一律夾到 0…n（單元改版、總頁數變少時，雲端舊值可能大於 n）。
        // 規則不准頁數倒退：夾完仍不比雲端原始值大就不寫，只存本機。
        const old=Number(existing?.p)||0,p=Math.max(get(),capped(existing?.p));if(p>get())save(p);
        if(p>old){
          if(backend.advanceLearn){await backend.advanceLearn(id,unit,p,n);const latest=await backend.get(path);if(e===epoch&&capped(latest?.p)>get())save(capped(latest.p));}
          else await backend.update({[path]:{p,n,at:backend.now()}});
        }
        if(e===epoch)remote=p;
      }).catch(()=>{/* A later page or sign-in retries. Local progress is already saved. */});
    }
    const offline=()=>{if(!known){const p=get();known=true;pending=0;save(p);}};
    const fallback=setTimeout(offline,3000);
    window.LabMission?._ready().then(api=>{if(!api){offline();return;}backend=api;api.onAuth(async u=>{
      const e=++epoch,id=u?.uid||null,carry=guest&&id?capped(read(key,{}).p):0;
      const visited=pending;pending=0;known=true;clearTimeout(fallback);uid=id;guest=!id;ready=false;remote=0;
      save(Math.max(get(),carry,visited));
      if(!id)return;
      try{const rec=await api.get('learn/'+id+'/'+unit);if(e!==epoch)return;remote=capped(rec?.p);save(Math.max(get(),remote));}
      catch{if(e!==epoch)return;}
      ready=true;notify(get(),'remote');push();
    });}).catch(offline);
    return {get,visit(p){if(!known){pending=Math.max(pending,capped(p));return;}if(p>get())save(p);push();},get owner(){return uid;}};
  }
  function mount(){
    const U=window.LearnUnit;if(!U)return;
    const by=id=>document.getElementById(id);
    const T=(z,e)=>LabSettings.t(z,e),en=LabSettings.lang==='en', tr=p=>Array.isArray(p)?T(p[0],p[1]):p;
    const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',fn);return b;};
    const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
    const pages=U.pages,n=pages.length,C=window.LearnPhysics;
    const missions=()=>LabMission.all()[U.id]||[];
    const baseMissions=()=>missions().filter(m=>!m.hidden);
    function stars(){return baseMissions().reduce((sum,m)=>sum+(LabMission._state.done[m.id]?.stars||0),0);}
    const bonusEarned=()=>!!LabMission._state.done[U.id+'-25'];
    if(by('learn-lobby')){
      const bar=by('unit-progress');
      function show(p){if(by('door-textbook-me'))setTimeout(()=>doorMe?.());if(!bar)return;bar.max=n;bar.value=p;by('unit-count').textContent=T('第 '+p+'/'+n+' 頁',p+'/'+n+' pages');const resume=pages[Math.max(0,p-1)].id.split('-');by('unit-link').href='learn-phy-5-1.html?seg='+resume[0]+'&p='+resume[1];by('unit-stars').textContent='★ '+stars()+' / '+baseMissions().reduce((a,m)=>a+m.level,0);}
      const pr=progress(U.id,n,show);show(pr.get());LabMission.on('ready',()=>show(pr.get()));
      const view=new URLSearchParams(location.search).get('view'),pane=['textbook','exam'].includes(view)?view:null;by('lobby-home').hidden=!!pane;if(pane){const h=document.querySelector('.lobby-header h1');if(pane==='exam')h.innerHTML=T('自然科<span class="exam-em">學測</span>題解','<span class="exam-em">GSAT</span> science solutions');else h.textContent=T('課本模式','Textbook mode');h.removeAttribute('data-en');}by('textbook').hidden=pane!=='textbook';by('exam').hidden=pane!=='exam';const doorMe=()=>{const p=pr.get();by('door-textbook-me').textContent=p&&bar?T('你的進度：5-1 第 '+p+'/'+n+' 頁・★ '+stars(),'Your progress: 5-1 page '+p+'/'+n+' · ★ '+stars()):'';const qs=[...document.querySelectorAll('#exam-114 a[href*="q="]')].map(a=>new URL(a.href).searchParams.get('q')),uid=LabMission._state.user?.uid||'guest';const tried=qs.filter(q=>{try{return (JSON.parse(localStorage.getItem('exam-114-'+q+':attempts:'+uid))||{}).attempts>0;}catch{return false;}}).length;by('door-exam-me').textContent=tried?T('你的進度：已作答 '+tried+' / '+qs.length+' 題','Your progress: '+tried+' / '+qs.length+' answered'):'';};doorMe();LabMission.on('ready',doorMe);const examThumbs=()=>{const t=document.documentElement.getAttribute('data-theme'),dark=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches,L=LabSettings.lang==='en'?'en':LabSettings.lang==='zh-Hans'?'hans':'hant';for(const im of document.querySelectorAll('img[data-exam-thumb]')){const src='img/thumbs/'+im.dataset.examThumb+'-'+L+'-'+(dark?'dark':'light')+'.webp?v='+im.dataset.v;if(im.getAttribute('src')!==src)im.setAttribute('src',src);}};examThumbs();addEventListener('lab:themechange',examThumbs);matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',examThumbs);const crumbs=y=>{const cr=document.querySelector('.crumbs');if(!cr)return;const a=(h,t)=>'<a href="'+h+'">'+t+'</a>',top=a('index.html',T('首頁','Home'))+' / '+a('learn.html',T('物理自習室','Study Room'))+' / ',cur=t=>'<span aria-current="page">'+t+'</span>';cr.innerHTML=top+(pane==='textbook'?cur(T('課本模式','Textbook mode')):y?a('learn.html?view=exam',T('學測自然科','GSAT science'))+' / '+cur(T(y+'年',(+y+1911)+' ('+y+')')):cur(T('學測自然科','GSAT science')));};const pickYear=tab=>{for(const b of by('exam-years').children){const active=b===tab;b.setAttribute('aria-selected',active);by('exam-'+b.dataset.year).hidden=!active;}crumbs(tab.dataset.year);};by('exam-years')?.addEventListener('click',e=>{const tab=e.target.closest('[data-year]');if(!tab)return;pickYear(tab);const u=new URL(location.href);u.searchParams.set('year',tab.dataset.year);history.replaceState(history.state,'',u.href);});{const y=new URLSearchParams(location.search).get('year'),tab=by('exam-years')?.querySelector('[data-year="'+y+'"]');if(pane==='exam'&&tab)pickYear(tab);else if(pane)crumbs('');}return;
    }
    if(!by('learn-unit'))return;
    const params=new URLSearchParams(location.search), klass=params.get('class')==='1',review=params.has('review');
    document.documentElement.classList.toggle('learn-class',klass);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const presentation=U.presentation;
    const timing=window.LearnTimings[en?'en':'zh'],scene=LearnScene.create(by('scene')),answers=C?.answers();
    // 11/21 站長：語速照龍騰第 2 章做六檔（0.8–1.8），點一下彈出小選單、記住每個人的選擇（learn-rate）；不在六檔的舊值換成最近一檔（一樣近取靠 1.0 的）
    const RATES=[.8,1,1.2,1.4,1.6,1.8],nearRate=v=>RATES.reduce((a,b)=>{const da=Math.abs(a-v),db=Math.abs(b-v);return db<da-1e-9||(Math.abs(db-da)<1e-9&&Math.abs(b-1)<Math.abs(a-1))?b:a;},1);
    let index=0,t=0,playing=false,speed=nearRate(+read('learn-rate',1)||1),auto=read('learn-auto',true),sound=LabSettings.get('sound');
    const language=en?'en':'zh', recordings=window.LearnTimings.audio?.[language]||{};
    const estimatedClock=Object.fromEntries(pages.map(p=>[p.id,estimate(p.speech[en?1:0],language)]));
    let heardFromStart=false,failedRecording=false,trackClock=null,audibleUntil=0,tail=0,loadTimer=0,last=0,raf=0,held=false,frameModel=null,coverage=0,voice=null,voiceReady=false,voiceEpoch=0;
    let sideTab='concept',sideOpen=!presentation?.ownSide&&innerWidth>=1100,showClass=false,haptic=false,stamp='',lastSoundWork=0;
    let lockedAnswer=false,attemptEpoch=0,shownSolutions=new Set();
    const stateKey=()=> 'learn-activity:'+U.id+':'+(LabMission._state.user?.uid||'guest');
    const fresh=()=>({first:{},correct:{},viewed:{},heard:{},steps:{},examples:{},shared:false});
    let owner=stateKey(),activity=Object.assign(fresh(),read(owner,{}));
    const saveActivity=()=>write(owner,activity);
    const page=()=>pages[index],clock=()=>failedRecording?estimatedClock[page().id]:trackClock||timing[page().id],step=()=>page().id.startsWith('5-')?Number(page().id.slice(2)):0;
    const quizIDs=['7-1','7-2','7-3'];
    const earned=()=>{
      if(presentation)return {};
      const flags={};for(let i=1;i<=8;i++)flags[i]=pages.filter(p=>p.id.startsWith(i+'-')).every(p=>activity.viewed[p.id]);
      flags[9]=activity.first['2-1']!==undefined;flags[10]=activity.first['2-2']!==undefined;
      flags[11]=activity.first['2-1']===answers.bucket&&activity.first['2-2']===answers.trip&&!!activity.viewed['3-8'];
      for(let i=1;i<=4;i++)flags[11+i]=!!activity.steps[i];
      flags[16]=!!activity.examples['6-1'];flags[17]=!!activity.examples['6-2'];
      quizIDs.forEach((id,i)=>flags[18+i]=!!activity.correct[id]);
      flags[21]=quizIDs.every(id=>activity.first[id]===true);
      const recorded=Object.keys(recordings).filter(id=>recordings[id]);
      flags[22]=recorded.length>0&&recorded.every(id=>activity.heard[id]);
      flags[25]=activity.balancedPull===true;flags[23]=activity.shared;
      flags[24]=Array.from({length:23},(_,i)=>!!LabMission._state.done[U.id+'-'+(i+1)]).every(Boolean);return flags;
    };
    function changed(){saveActivity();if(presentation)presentation.viewed(pages.every(p=>activity.viewed[p.id]));else{LabMission.emit('learn-progress',{earned:earned()});if(pages.every(p=>activity.viewed[p.id]))document.dispatchEvent(new CustomEvent('learn:done'));} /* 11/21 教室統計第二階段：每頁都看過＝完成 */updateScore();if(sideOpen&&sideTab==='missions')panel();}
    let mayResume=!['seg','p','t','line'].some(k=>params.has(k));
    for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{mayResume=false;},{once:true,capture:true});
    const pr=progress(U.id,n,(p,source)=>{if(source==='remote'&&mayResume&&p>index+1){mayResume=false;go(p-1);}});
    LabMission.on('ready',()=>{const next=stateKey();if(next!==owner){owner=next;activity=Object.assign(fresh(),read(owner,{}));if(lastPage)displayPage();}updateScore();if(sideOpen)panel();});
    LabMission.on('complete',()=>{updateScore();if(sideOpen&&sideTab==='missions')panel();const flags=earned();if(flags[24]&&!LabMission._state.done[U.id+'-24'])LabMission.emit('learn-progress',{earned:flags});});
    function math(node,tex){window.katex.render(tex,node,{throwOnError:false,output:'htmlAndMathml'});}
    function rich(node,text){
      node.replaceChildren();String(text||'').split(/(\*\*[\s\S]*?\*\*|\\\([\s\S]*?\\\)|F_∥|W_[FfNg])/).filter(Boolean).forEach(s=>{
        if(s.startsWith('**')){const b=el('strong');rich(b,s.slice(2,-2));node.append(b);}
        else if(s.startsWith('\\(')){const span=el('span');math(span,colorMath(s.slice(2,-2)));node.append(span);}
        else if(/^(F_|W_)/.test(s)){const span=el('span');math(span,colorMath(s.replace('∥','{\\parallel}')));node.append(span);}
        else node.append(document.createTextNode(s));
      });
    }
    function colorMath(tex){if(presentation)return tex;const cs=scene.colors;return tex.replace(/F_\{\\parallel\}|W_[FfNg]|\\cos|\\[a-zA-Z]+|[FKUS]/g,k=>{
      const code={F:'F',S:'S',K:'K',U:'U','F_{\\parallel}':'parallel',W_F:'positive',W_f:'negative',W_N:'normal',W_g:'weight'}[k];
      return code?'{\\color{'+cs[code]+'}'+k+'}':k;
    });}
    function formulaLines(container,rows){
      container.replaceChildren();
      for(const [,tex] of rows){const line=el('div','equation');const at=tex.indexOf('=');
        const pieces=at>0?[tex.slice(0,at),'=',tex.slice(at+1)]:[tex];
        for(const piece of pieces){const span=el('span');math(span,piece);line.append(span);}container.append(line);}
    }
    const rowTime=(key,i,rows)=>key?(clock().marks[key]??Infinity)+(page().id==='4-6'&&key==='derive'?rows.slice(0,i).filter(r=>r[0]===key).length*.7:0):0;
    function link(z,e,href){const a=el('a','learn-link',T(z,e));a.href=href;return a;}
    function showLabs(node,limit=2){for(const [href,z,e] of U.labs.slice(0,limit))node.append(link('去 Lab 動手：'+z,'Try the lab: '+e,href));}
    const progressNav=by('segments');
    if(presentation)presentation.bindNavigation(i=>go(i));
    else U.segments.forEach((p,i)=>{const b=button('',()=>go(pages.findIndex(q=>q.id.startsWith((i+1)+'-')),0,false));b.append(el('span','segment-number',String(i+1)),el('span','segment-name',tr(p)));b.title=tr(p);b.setAttribute('aria-label',(i+1)+' · '+tr(p));progressNav.append(b);});
    function syncURL(){const q=new URLSearchParams(location.search),[seg,p]=page().id.split('-');if(presentation)q.set('line',page().id);else{q.set('seg',seg);q.set('p',p);}q.set('t',String(Math.round(t*1000)/1000));history.replaceState(null,'','?'+q);}
    function soundFx(type){if(!sound)return;if(type==='up'||type==='down')LabSound.sweep({from:type==='up'?360:640,to:type==='up'?640:360,dur:.13,gain:.12});else LabSound.tone({freq:type==='right'?740:295,dur:.14,type:'triangle',gain:.19});}
    const {SS,SSU,HANS,VO,pickVoices,VOICES,isTTS,vEN}=deviceVoices();
    let vpick=read('learn-voice'+(HANS?'-hans':''),null);if(!VOICES.includes(vpick))vpick=en?'ef':'ni';
    let tts=null,ttsGen=0;const ttsCps={zh:4.6,en:14};
    function loadVoices(){if(!SS||!SSU||!pickVoices())return;const was=VO.ready;VO.ready=true;refreshVoiceMenu();if(!was&&isTTS(vpick)&&!playing&&page())reloadVoice();controlLabels();}
    if(SS&&SSU){setTimeout(loadVoices,0);try{SS.addEventListener?SS.addEventListener('voiceschanged',loadVoices):(SS.onvoiceschanged=loadVoices);}catch{/* 略 */}
      setTimeout(()=>{if(!VO.ready){VO.timedOut=true;loadVoices();}},2500);
      document.addEventListener('pointerdown',()=>{if(!VO.zf&&!VO.ef)setTimeout(()=>{VO.timedOut=true;loadVoices();},400);},{once:true,capture:true});}
    function ttsText(p){
      const pair=p.speech;if(!pair)return '';
      const raw=Array.isArray(pair)?(vEN(vpick)?pair[1]:T(pair[0],pair[1])):pair;
      return parseScript(String(raw||'')).spoken.replace(/\\\(|\\\)|\\\[|\\\]/g,'').replace(/\*\*/g,'').replace(/\\[a-zA-Z]+/g,' ').replace(/[_{}^\\$]/g,' ').replace(/\s+/g,' ').trim();
    }
    function ttsUsable(){return isTTS(vpick)&&!!(SS&&SSU)&&VO.ready&&!!VO[vpick]&&sound&&!!ttsText(page());}
    function ttsCancel(){ttsGen++;try{if(SS&&(SS.speaking||SS.pending))SS.cancel();}catch{/* 略 */}}
    function startTTS(){
      const p=page(),id=p.id,text=ttsText(p),isEn=vEN(vpick),len=text.replace(/[，。！？；：、,.!?;:\s]/g,'').length||1;
      const est=Math.max(1.2,len/(isEn?ttsCps.en:ttsCps.zh)),base=timing[id],k=est/Math.max(.5,(base.dur||est)-.6),marks={};
      for(const [m,v] of Object.entries(base.marks||{}))marks[m]=v*k;
      tts={text,len,est,isEn,phase:'idle',started:false,bt:null};trackClock={...base,marks,dur:est+.6};t=Math.min(t,clock().dur);
    }
    function ttsSpeak(){
      if(!tts)return;ttsCancel();
      if(t>=tts.est-.05){tts.phase='done';return;}
      const g=ttsGen,v=VO[vpick],off=Math.floor(Math.min(.98,t/tts.est)*tts.text.length),part=tts.text.slice(off),u=new SSU(part);
      u.voice=v;u.lang=v.lang||(tts.isEn?'en-US':'zh-TW');u.rate=speed;
      const P=tts;P.phase='speak';P.started=false;P.bt=null;P.ts=performance.now();P.off=off;P.t0=t;
      u.onstart=()=>{if(g===ttsGen){P.started=true;P.real0=performance.now();}};
      u.onboundary=e=>{if(g!==ttsGen||!P.started||e?.charIndex==null)return;const pos=(off+e.charIndex)/tts.text.length*P.est;P.bt=pos;if(pos>t)t=Math.min(pos,P.est-.02);};
      u.onend=()=>{if(g!==ttsGen)return;const real=(performance.now()-(P.real0||P.ts))/1000,done=P.len*(1-off/Math.max(1,P.text.length));
        if(P.started&&real>.4){const c=done/(real*speed);if(P.isEn){if(c>5&&c<40)ttsCps.en=Math.max(9,Math.min(22,ttsCps.en*.7+c*.3));}else if(c>1.5&&c<12)ttsCps.zh=Math.max(2.8,Math.min(8,ttsCps.zh*.7+c*.3));}
        P.phase='done';t=Math.max(t,P.est);};
      u.onerror=e=>{if(g!==ttsGen)return;const er=e?.error;if(er==='interrupted'||er==='canceled')return;P.phase='done';if(er==='not-allowed')setPlaying(false);};
      try{if(SS.paused)SS.resume();SS.speak(u);}catch{P.phase='done';}
    }
    function ttsTick(dt){
      const P=tts;
      if(P.phase==='idle')ttsSpeak();
      else if(P.phase==='speak'){
        if(P.started)t=Math.min(t+dt*speed,P.est-.02,P.bt!=null?Math.max(t,P.bt+.5*speed):Infinity);
        else if(performance.now()-P.ts>3000){P.phase='done';}   // 3 秒沒開口：照時間走完，不卡住
        else if(P.started&&performance.now()-P.real0>(P.est-P.t0)/speed*3000+5000)P.phase='done';
      }else t=Math.min(clock().dur,t+dt*speed);
    }
    function reloadVoice(){const frac=clock().dur?t/clock().dur:0,was=playing;setPlaying(false);stopVoice();loadVoice();t=clamp(frac*clock().dur,0,clock().dur);stamp='';render();if(was)setPlaying(true);}
    function setVoice(v){vpick=v;write('learn-voice'+(HANS?'-hans':''),v);reloadVoice();controlLabels();}
    function stopVoice(){
      ++voiceEpoch;clearTimeout(loadTimer);ttsCancel();tts=null;
      if(voice){voice.pause();voice.removeAttribute('src');voice.load();}
      voice=null;voiceReady=false;heardFromStart=false;failedRecording=false;trackClock=null;tail=0;audibleUntil=0;
    }
    function voiceOffset(){return Math.min(t,voice.duration);}
    function fallbackVoice(token){
      if(token!==voiceEpoch)return;
      const fraction=t/clock().dur;stopVoice();failedRecording=true;
      t=clamp(fraction*clock().dur,0,clock().dur);coverage=0;stamp='';render();
    }
    function followVoice(){
      if(!voiceReady||!playing)return;
      const token=voiceEpoch;
      voice.playbackRate=speed;voice.muted=!sound;
      if(t>=voice.duration)return;
      if(Math.abs(voice.currentTime-t)>.035)voice.currentTime=voiceOffset();
      voice.play().catch(err=>{
        if(token!==voiceEpoch||!playing||err.name==='AbortError')return;
        if(err.name==='NotAllowedError')setPlaying(false);else fallbackVoice(token);
      });
    }
    function loadVoice(){
      const id=page().id,track=recordings[id];
      if(ttsUsable()){startTTS();return;}
      if(!track)return;
      const token=voiceEpoch,v=new Audio();voice=v;v.preload='auto';v.muted=!sound;
      loadTimer=setTimeout(()=>{if(!voiceReady)fallbackVoice(token);},6500);
      v.onloadedmetadata=()=>{
        if(token!==voiceEpoch)return;
        if(!Number.isFinite(v.duration)||v.duration<=0){fallbackVoice(token);return;}
        clearTimeout(loadTimer);voiceReady=true;trackClock={...timing[id],dur:v.duration+.6};
        t=Math.min(t,clock().dur);tail=Math.max(0,t-v.duration);v.currentTime=voiceOffset();followVoice();render();
      };
      v.onerror=()=>fallbackVoice(token);
      v.src=typeof track==='string'?track:'audio/study/'+U.slug+'/'+id+'.m4a';
    }
    function setHaptic(on){
      if(on&&navigator.userActivation&&!navigator.userActivation.hasBeenActive)return;
      if(on===haptic)return;haptic=on;if(!navigator.vibrate)return;
      const length=Math.max(1,Math.ceil(((clock().marks.zero||0)-t)/speed/.8));
      navigator.vibrate(on?Array.from({length:2*length-1},(_,i)=>i%2?735:65):0);
    }
    function controlLabels(){
      by('play').textContent=playing?'❚❚':'▶';by('play').setAttribute('aria-label',playing?T('暫停','Pause'):T('播放','Play'));
      // 喇叭旁邊寫字（照龍騰「聽倪講／倪先安靜」），讓人看得出旁白的開關在這裡
      const sb=by('sound');sb.classList.toggle('on',!!sound);sb.setAttribute('aria-pressed',String(sound));
      const dev=isTTS(vpick)&&VO.ready&&!!VO[vpick];sb.innerHTML='<span class="snd-i" aria-hidden="true">'+(sound?'🔊':'🔇')+'</span><span class="snd-t">'+(dev?(sound?T('聽電腦講','Device voice'):T('先安靜','Muted')):(sound?T('聽倪講','Ni speaking'):T('倪先安靜','Ni muted')))+'</span>';
      sb.setAttribute('aria-label',sound?T('聽倪講：旁白開著（按一下關掉）','Narration on (tap to mute)'):T('倪先安靜：旁白關著（按一下打開）','Narration off (tap to turn on)'));
      by('auto').checked=!!auto;by('speed').textContent=speed.toFixed(1)+'×';by('speed').setAttribute('aria-expanded',String(!!document.querySelector('.learn-rmenu')));by('class-mode').setAttribute('aria-pressed',String(klass));
      by('previous').disabled=index===0;by('next').disabled=index===n-1;
    }
    function setPlaying(on){if(on&&voice&&t<.005)heardFromStart=sound;playing=on;last=0;if(!on){voice?.pause();if(tts){ttsCancel();tts.phase='idle';}setHaptic(false);}else if(tts){if(!sound)tts.phase='done';else ttsSpeak();}else followVoice();controlLabels();schedule();}
    function microui(){by('playhead').max=clock().dur;by('playhead').value=t;by('time').textContent=fmtTime(t)+' / '+fmtTime(clock().dur);}
    function fmtTime(s){return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');}
    function defaultModel(id){
      if(!id.startsWith('5-')&&id!=='7-1')return null;
      return {angle:['5-2','5-4'].includes(id)?C.angle43:25,surface:['5-4','7-1'].includes(id)?'ice':'rough',direction:1,state:C.initial(),touched:false,turned:false,outbound:false,invalid:false,balancedDistance:0};
    }
    let lastPage=null;
    function go(i,seconds=0,run=false){
      if(i<0||i>=n)return;setPlaying(false);release();stopVoice();setHaptic(false);index=i;
      t=clamp(Number(seconds)||0,0,clock().dur);coverage=0;frameModel=defaultModel(page().id);lockedAnswer=false;++attemptEpoch;
      showClass=false;stamp='';lastPage=page().id;lastSoundWork=0;if(!presentation){by('feedback').replaceChildren();by('feedback').hidden=true;by('step-status').textContent='';}
      scene.reset();pr.visit(i+1);displayPage();loadVoice();syncURL();if(run&&t<clock().dur)setPlaying(true);
    }
    function seek(v){
      t=clamp(Number(v)||0,0,clock().dur);heardFromStart=playing&&sound&&t===0;coverage=0;last=0;release();setHaptic(false);
      frameModel=defaultModel(page().id);scene.reset();if(voiceReady){voice.currentTime=voiceOffset();tail=Math.max(0,t-voice.duration);audibleUntil=0;followVoice();}if(tts){ttsCancel();tts.phase=playing&&sound?'idle':'done';if(!playing)tts.phase='idle';}stamp='';render();syncURL();
    }
    const landscape=matchMedia('(orientation:landscape) and (max-height:600px)');
    function placeBoard(){
      const board=by('board');
      if(presentation)return;
      if(page().id.startsWith('6-'))by('question').after(board);
      else if(landscape.matches)by('prediction-result').after(board);
      else by('scene').after(board);
    }
    landscape.addEventListener('change',()=>{placeBoard();render();});
    function displayPage(){
      const p=page();
      if(presentation){
        rich(by('caption'),tr(p.caption));presentation.show(p,index,klass);
        controlLabels();if(sideOpen)panel();render();return;
      }
      const seg=Number(p.id.split('-')[0]);by('learn-unit').dataset.page=p.id;
      rich(by('page-title'),tr(p.title));by('page-code').textContent=p.id;by('folio').textContent=String(index+1).padStart(2,'0')+' / '+n;
      Array.from(progressNav.children).forEach((b,i)=>{b.setAttribute('aria-current',i+1===seg?'step':'false');});
      const caption=tr(p.caption);rich(by('caption'),caption);const example=p.id.startsWith('6-');by('workpad').dataset.example=example;
      placeBoard();
      by('scalar-review').hidden=p.id!=='7-2b';
      if(p.id==='7-2b')math(by('joule-equation'),U.board(p.id,scene.colors,en)[0][1]);
      const trip=by('trip-work');trip.hidden=p.id!=='3-8';
      if(!trip.hidden)for(const [i,leg] of Array.from(trip.children).entries()){
        const loss=C.work(C.forces(C.angle43).friction,5);
        leg.replaceChildren(document.createTextNode(i?T('回程 ','Back '):T('去程 ','Out ')));
        const formula=el('span');math(formula,'W_f='+loss+'\\,\\mathrm{J}');leg.append(formula);
      }
      const goal=by('step-goal');goal.hidden=!step();
      if(step())goal.textContent=[T('目標 4:3','Target 4:3'),T('目標 10 m','Target 10 m'),T('冰面 90°','Ice 90°'),T('去回各 5 m','5 m each way')][step()-1];
      const notes=by('notes');notes.replaceChildren();if(p.note){const f=el('span');rich(f,tr(p.note));notes.append(f);}
      if(p.video){const [v,sec]=p.video;const a=link('▶ 看倪老師上課講這段（〔'+v+'〕'+fmtTime(sec)+'）','▶ Watch Dr. Ni teach this part (['+v+'] '+fmtTime(sec)+')','https://youtu.be/'+U.videos[v]+'?t='+sec);a.target='_blank';a.rel='noopener noreferrer';notes.append(a);}
      if(step()){showLabs(notes,1);if(p.id==='5-1')notes.append(el('small','',T('斜向上拉會減輕箱子壓地面的力，摩擦力跟著變小。','An upward pull reduces the force on the floor, reducing friction.')));}notes.hidden=!notes.childElementCount;
      by('edge').style.top='clamp(143px, 25dvh, 250px)';by('interactive').hidden=!frameModel;by('angle-handle').hidden=!frameModel;by('lab-buttons').hidden=!step();by('readings').hidden=!step();
      by('scorecard').hidden=p.id!=='8-2';by('score-links').replaceChildren();if(p.id==='8-2')showLabs(by('score-links'));
      by('class-reveal').hidden=!klass||!(p.id.startsWith('6-')||U.reveal[p.id]);by('class-reveal').textContent=T('公布答案','Reveal answer');
      by('workpad').classList.toggle('has-lab',!!step());by('workpad').classList.toggle('has-question',!!p.prompt);
      by('workpad').classList.toggle('has-score',p.id==='8-2');
      question();controlLabels();updateScore();if(sideOpen)panel();if(step()){LabStepGuide.define(guideDefs(),{key:'learn'});LabStepGuide.update(step()-1,{key:'learn',auto:true});}else LabStepGuide.hide();
      render();
    }
    function render(){
      const p=page(),tm=clock();
      const rows=U.board(p.id,scene.colors,en),shown=rows.filter((r,i)=>t>=rowTime(r[0],i,rows));
      const reveal=U.reveal[p.id];
      const r=reveal&&(klass?showClass:t>=tm.marks[reveal[0]]);
      const board=by('board'),visible=step()||p.id==='7-2b'?[]:klass&&p.id.startsWith('6-')?(showClass?rows:[]):shown;
      const sig=p.id+'|'+visible.length+'|'+!!r+'|'+showClass+'|'+landscape.matches;
      if(sig!==stamp){stamp=sig;formulaLines(board,visible);board.hidden=!visible.length;
        // 試玩 B13：手機橫放時板書在右欄，0:00 還沒寫字會留一大片空白 → 先說明這裡等一下會寫什麼
        const wait=!visible.length&&landscape.matches&&!klass&&rows.length&&!step()&&p.id!=='7-2b'&&!p.id.startsWith('6-');board.classList.toggle('board-wait',!!wait);
        if(wait){board.hidden=false;board.replaceChildren(el('p',null,T('▶ 按播放，本頁 '+rows.length+' 行板書會跟著旁白寫在這裡。','▶ Press play: '+rows.length+' board line'+(rows.length>1?'s':'')+' will be written here as you listen.')));}
        if(p.id.startsWith('6-')&&visible.length)board.scrollTop=board.scrollHeight;
        const disclosure=by('prediction-result');if(disclosure){disclosure.hidden=!r;if(r)rich(disclosure,T(reveal[1],reveal[2]));}}
      scene.render(p,t,tm,frameModel,en,klass);
      if(frameModel)readModel();microui();setHaptic(p.id==='1-1'&&playing&&t<(tm.marks.zero??0)&&!document.hidden);
    }
    function heardCurrentTrack(){
      if(!heardFromStart||!voiceReady||!voice||!Number.isFinite(voice.duration))return false;
      const end=voice.duration,ranges=voice.played;let covered=0;
      for(let i=0;i<ranges.length;i++){if(ranges.start(i)>covered+.07)break;covered=Math.max(covered,ranges.end(i));}
      return end>0&&covered>=end-Math.min(.05,end*.05)&&audibleUntil>=end-Math.min(.05,end*.05);
    }
    function finish(){
      const p=page(),dur=clock().dur;
      if(coverage>=dur-.11){activity.viewed[p.id]=true;if(p.id.startsWith('6-')&&(!klass||showClass))activity.examples[p.id]=true;}
      if(heardCurrentTrack()&&coverage>=dur-.11)activity.heard[p.id]=true;
      changed();setPlaying(false);syncURL();
      const answering=p.id.startsWith('2-')?activity.first[p.id]!==undefined:quizIDs.includes(p.id)?activity.correct[p.id]:step()?activity.steps[step()]:true;
      if(auto&&!klass&&answering&&index<n-1)go(index+1,0,true);
    }
    function schedule(){if(!raf&&(playing||held)&&!document.hidden)raf=requestAnimationFrame(tick);}
    function tick(now){
      raf=0;if(document.hidden){setPlaying(false);release();return;}
      const dt=last?Math.max(0,(now-last)/1000):0;last=now;
      if(held)advanceHand(Math.min(dt,.10));
      if(playing){
        const old=t;
        if(voiceReady){
          const position=voice.currentTime;
          if(sound&&!voice.muted&&old<=audibleUntil+.002)audibleUntil=Math.max(audibleUntil,position);
          if(voice.ended||old>=voice.duration){
            if(old>=voice.duration)tail+=dt*speed;
            t=Math.min(clock().dur,voice.duration+tail);
          }else t=clamp(position,0,voice.duration);
        }else if(tts){if(sound)ttsTick(dt);else t=Math.min(clock().dur,t+dt*speed);}
        else if(!voice)t=Math.min(clock().dur,t+dt*speed);
        coverage+=Math.max(0,t-old);
        if(t>=clock().dur){render();finish();schedule();return;}
      }
      render();schedule();
    }
    function question(){
      const p=page(),box=by('question');box.replaceChildren();box.hidden=!p.prompt;
      if(!p.prompt)return;
      if(p.id.startsWith('6-')||tr(p.prompt)!==tr(p.caption).replace(/\*\*/g,'')){const prompt=el('div','question-copy');rich(prompt,tr(p.prompt));box.append(prompt);}
      if(p.id.startsWith('6-'))return;
      const controls=el('div','answer-controls');box.append(controls);
      if(U.choices[p.id])U.choices[p.id].forEach((v,i)=>{
        const b=button('',()=>{for(const x of controls.querySelectorAll('[data-choice]'))x.setAttribute('aria-pressed',String(x===b));submitAnswer(i);});
        b.dataset.choice=i;b.setAttribute('aria-pressed',String(p.id.startsWith('2-')&&activity.first[p.id]===i));b.append(el('b','choice-letter','ABCD'[i]),document.createTextNode(tr(v)));controls.append(b);
      });
      else if(p.id==='7-2'){const input=el('input');input.id='numeric-answer';input.type='text';input.inputMode='text';input.setAttribute('aria-label',T('摩擦力作功，單位焦耳','Work by friction, in joules'));input.autocomplete='off';
        const form=el('form','number-answer');const submit=button(T('送出','Check'),()=>{});submit.type='submit';form.addEventListener('submit',e=>{e.preventDefault();submitAnswer(input.value);});form.append(input,el('span','unit','J'),submit);controls.append(form);}
      else controls.append(button(T('檢查角度','Check angle'),()=>submitAnswer(frameModel.angle)));
      if(p.id.startsWith('2-')&&activity.first[p.id]!==undefined)feedback(T('已記下預測。','Prediction recorded.'));
      if(quizIDs.includes(p.id)&&activity.first[p.id]===false)solutionButton();
    }
    function feedback(s){const out=by('feedback');out.hidden=false;rich(out,s);}
    function solutionButton(){if(by('solution'))return;const b=button(T('看解答','Show solution'),()=>{const id=page().id,value=id==='7-1'?answers.angle+'°':id==='7-2'?answers.cart+' J':String(answers.ratio);
        feedback(T('解答：','Solution: ')+value);});b.id='solution';by('question').append(b);}
    async function submitAnswer(value){
      const p=page(),id=p.id,epoch=attemptEpoch;if(lockedAnswer)return;
      if(id.startsWith('2-')){if(activity.first[id]===undefined)activity.first[id]=value;question();changed();return;}
      if(id==='7-2'&&!String(value).trim())return;lockedAnswer=true;
      let ok=id==='7-1'?Math.abs(value-answers.angle)<=3:id==='7-3'?value===answers.bike:await gradeNumber(value,answers.cart,{unit:'J',relative:0});
      if(epoch!==attemptEpoch)return;lockedAnswer=false;const firstTry=activity.first[id]===undefined;if(firstTry)activity.first[id]=ok;
      if(ok)activity.correct[id]=true;
      let msg=T('答對了！','Correct!');
      if(!ok){const item=id==='7-1'?(value<5?0:1):id==='7-2'?(numeric(value)?.value===Math.abs(answers.cart)?0:1):value;
        msg=tr(U.feedback[id][item]);solutionButton();}
      // 11/21 教室統計第二階段：只記第一次作答；迷思代號＝選錯的選項（7-3 用字母、7-1／7-2 用 m0／m1）
      const myth=ok?'':id==='7-3'?'ABCD'[value]||'':'m'+(id==='7-1'?(value<5?0:1):(numeric(value)?.value===Math.abs(answers.cart)?0:1));
      if(firstTry)document.dispatchEvent(new CustomEvent('learn:answer',{detail:{item:id,ok,myth}}));
      soundFx(ok?'right':'wrong');feedback(msg);changed();
      const out=by('feedback'),site=el('p','ls-qrate');site.hidden=true;site.dataset.q=id;if(!ok&&myth)site.dataset.myth=myth;out.append(site);if(window.LearnStats&&LearnStats.fillRates)LearnStats.fillRates(out);
    }
    function updateScore(){if(!by('scorecard'))return;
      by('points').textContent=quizIDs.filter(k=>activity.correct[k]).length+' / 3';by('star-score').textContent='★ '+stars()+' / 54';
      const bonus=by('discovery-score');bonus.hidden=!bonusEarned();bonus.textContent=T('＋隱藏 ★3','+ Hidden ★3');}
    function scoreImage(){
      const c=document.createElement('canvas');c.width=960;c.height=600;
      const g=c.getContext('2d'),fill=g.createLinearGradient(0,0,960,600);
      fill.addColorStop(0,'#254e4c');fill.addColorStop(1,'#102c31');g.fillStyle=fill;g.fillRect(0,0,960,600);
      g.fillStyle='#ddbd79';g.fillRect(46,48,5,504);g.fillStyle='#eddbab';g.font='700 25px system-ui';g.fillText('Astro Ni Lab',82,92);
      g.fillStyle='#f6f2df';g.font='700 48px system-ui';g.fillText(T('功與能量的形式','Work and forms of energy'),82,171,800);
      g.font='26px system-ui';g.fillText(T('必修物理 5-1','Required physics 5-1'),84,221);
      g.fillStyle='#51736c';g.fillRect(82,261,792,2);
      g.fillStyle='#d1e3d9';g.font='27px system-ui';g.fillText(T('隨堂得分','Quiz score'),84,335);g.fillText(T('學習星星','Learning stars'),454,335);
      g.fillStyle='#ffffff';g.font='700 72px monospace';g.fillText(by('points').textContent,80,437);
      g.fillStyle='#ffcf68';g.fillText(by('star-score').textContent,450,437,400);
      if(bonusEarned()){g.font='26px system-ui';g.fillText(T('＋隱藏 ★3','+ Hidden ★3'),82,510);}
      return new Promise(resolve=>c.toBlob(resolve,'image/png'));
    }
    async function share(){
      const text=T('必修物理 5-1・功與能量的形式','Physics 5-1 · Work and forms of energy')+' · '+by('points').textContent+' · '+by('star-score').textContent;
      try{
        const blob=await scoreImage(),file=blob&&new File([blob],'Astro-Ni-5-1.png',{type:'image/png'});
        if(navigator.share){const data=file&&navigator.canShare?.({files:[file]})?{text,files:[file]}:{text};await navigator.share(data);}
        else if(blob&&window.ClipboardItem&&navigator.clipboard?.write){try{await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);}catch{await navigator.clipboard.writeText(text);}}
        else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
        else {const field=el('textarea');field.value=text;document.body.append(field);field.select();const ok=document.execCommand('copy');field.remove();if(!ok)return;}
        activity.shared=true;changed();feedback(T('成績卡已分享或複製。','Scorecard shared or copied.'));
      }catch{/* A cancelled share earns no star. */}
    }
    const quantities=[['F','F','','N'],['parallel','F','∥','N'],['friction','f','k','N'],['S','S','','m'],['','v','','m/s'],['','a','','m/s^2'],['K','K','','J'],['K','ΔK','','J'],['positive','W','F','J'],['negative','W','f','J'],['normal','W','N','J'],['weight','W','g','J']];
    if(!presentation)quantities.forEach(([key,base,sub,unit])=>{const item=el('div','reading');if(key){item.dataset.quantity=key;item.style.color='var(--ink-'+key+')';}
      const symbol=el('span','quantity',base);if(sub)symbol.append(el('sub','',sub));const val=el('b');const suffix=el('small');
      if(unit==='m/s^2'){suffix.textContent='m/s';suffix.append(el('sup','','2'));}else suffix.textContent=unit;
      item.append(symbol,el('span','equals','='),val,suffix);by('readings').append(item);});
    function readModel(){
      const u=frameModel,s=u.state,forces=C.forces(u.angle,u.surface,u.direction,s.v),vals=[forces.F,Math.abs(forces.parallel),Math.abs(forces.friction),s.x,Math.abs(s.v),s.v?forces.a:0,s.K,s.K-s.initialK,s.WF,s.Wf,s.WN,s.Wg];
      vals.forEach((val,i)=>{const v=by('readings').children[i].querySelector('b'),str=String(Number(val.toFixed(i===5?3:2)));if(v.textContent!==str)v.textContent=str;});
      const text=T(u.surface==='ice'?'地面：冰面':'地面：粗糙',u.surface==='ice'?'Floor: ice':'Floor: rough');
      if(by('surface').textContent!==text)by('surface').textContent=text;
      by('angle').value=u.angle;by('degrees').textContent=Number(u.angle.toFixed(2))+'°';
      by('angle-handle').setAttribute('aria-valuenow',u.angle.toFixed(2));
      const positive=by('positive-bar'),negative=by('negative-bar');positive.style.width=clamp(s.WF/400,0,1)*100+'%';negative.style.width=clamp(-s.Wf/400,0,1)*100+'%';
      if(sideOpen&&sideTab==='steps')refreshNeeds();
    }
    function completeStep(i){if(!activity.steps[i]){activity.steps[i]=true;soundFx('right');changed();}by('step-status').textContent=T('✓ 已完成','✓ Complete');}
    function setAngle(value){if(!frameModel||!Number.isFinite(value))return;const u=frameModel;
      u.angle=Math.abs(value-C.angle43)<=1.3?C.angle43:Math.abs(value-C.angle125)<=.5?C.angle125:clamp(value,0,90);u.touched=true;
      if(Math.abs(u.angle-C.angle125)>.5)u.balancedDistance=0;
      if(step()===1&&u.angle===C.angle43)completeStep(1);render();}
    function resetTrial(surface,angle){
      release();const u=frameModel;Object.assign(u,{surface,angle,state:C.initial(),direction:1,turned:false,outbound:false,invalid:false});lastSoundWork=0;render();
    }
    const HALL=[-5,10],room=u=>u.state.v>0?HALL[1]-u.state.x:u.state.x-HALL[0];
    function hallEnd(){feedback(T('行李箱走到走廊盡頭了（'+(frameModel.state.v>0?'10 m':'−5 m')+'）：按「掉頭」往回拉，或按「起步」重來。','The suitcase has reached the end of the corridor ('+(frameModel.state.v>0?'10 m':'−5 m')+'). Press Turn to pull it back, or Start to begin again.'));}
    function startPull(){if(!step()||!frameModel.state.v)return;if(room(frameModel)<=1e-7){hallEnd();return;}held=true;last=0;by('pull').setAttribute('aria-pressed','true');schedule();}
    function release(){if(frameModel)frameModel.balancedDistance=0;held=false;by('pull')?.setAttribute('aria-pressed','false');}
    function advanceHand(dt){
      const u=frameModel,i=step();if(!u||!i||!dt)return;
      const s=u.state;
      const balanced=u.angle===C.angle43&&u.surface==='rough';
      if((i===2||i===4)&&(!balanced||(!u.turned&&u.direction!==1)))u.invalid=true;
      const stopAt=i===2?10:i===4?(u.turned?10:5):Infinity;
      const limit=C.timeToDistance(s,u,Math.max(0,stopAt-s.distance)),wall=C.timeToDistance(s,u,Math.max(0,room(u)));
      u.state=C.advance(s,u,Math.min(dt,limit,wall));const q=u.state;
      if(q.distance-lastSoundWork>=1){const delta=q.WF-s.WF;if(Math.abs(delta)>1e-9)soundFx(delta>0?'up':'down');lastSoundWork=q.distance;}
      const a=C.forces(u.angle,u.surface,u.direction,s.v).a;
      const qualifies=held&&u.surface==='rough'&&Math.abs(u.angle-C.angle125)<=.5&&Math.abs(a)<.01;
      u.balancedDistance=qualifies?u.balancedDistance+q.distance-s.distance:0;
      if(u.balancedDistance>=2&&!activity.balancedPull){
        activity.balancedPull=true;changed();feedback(T('隱藏發現：水平 12、鉛直 5 時也能等速！','Hidden discovery: twelve across and five up also maintains constant speed!'));
      }
      if(i===3&&u.surface==='ice'&&u.angle===90&&q.distance>.3&&Math.abs(q.WF)<1e-8&&Math.abs(q.v-1)<1e-8)completeStep(3);
      if(i===2&&q.distance>=10-1e-8&&!u.invalid&&Math.abs(q.WF-400)<1e-6&&Math.abs(q.Wf+400)<1e-6)completeStep(2);
      if(i===4&&!u.invalid&&q.distance>=5-1e-8&&!u.turned&&Math.abs(q.x-5)<1e-7){u.outbound=true;by('step-status').textContent=T('已到 5 m，請掉頭。','At 5 m. Turn back.');}
      if(i===4&&u.outbound&&u.turned&&!u.invalid&&q.distance>=10-1e-8&&Math.abs(q.x)<1e-7&&Math.abs(q.Wf+400)<1e-6&&Math.abs(q.WF-400)<1e-6)completeStep(4);
      if(wall<=dt&&wall<limit){release();hallEnd();}
      else if(limit<=dt||!q.v)release();
    }
    if(!presentation){
      by('angle').addEventListener('input',e=>setAngle(+e.target.value));
      by('snap-angle').addEventListener('click',()=>setAngle(C.angle43));
      by('surface').addEventListener('click',()=>{if(frameModel)resetTrial(frameModel.surface==='ice'?'rough':'ice',frameModel.angle);});
      by('launch').addEventListener('click',()=>{if(frameModel)resetTrial(frameModel.surface,frameModel.angle);});
      by('turn').addEventListener('click',()=>{if(!frameModel)return;release();const u=frameModel;
        if(step()===4&&!u.outbound)u.invalid=true;u.direction*=-1;u.turned=u.direction<0;u.state=C.reverse(u.state);render();});
      by('pull').addEventListener('pointerdown',e=>{e.preventDefault();by('pull').setPointerCapture(e.pointerId);startPull();});
      ['pointerup','pointercancel','lostpointercapture'].forEach(k=>by('pull').addEventListener(k,release));
      by('pull').addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)startPull();}});
      by('pull').addEventListener('keyup',release);by('pull').addEventListener('blur',release);
      let drag=null;const stage=by('scene'),handle=by('angle-handle');
      stage.addEventListener('pointerdown',e=>{
        if(!frameModel||e.button!==0)return;const r=stage.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
        const bodyHit=e.target===by('luggage-3d')||e.target===by('illustration');
        if(!handle.contains(e.target)&&!(bodyHit&&scene.hitBody(x,y)))return;
        e.preventDefault();e.stopPropagation();handle.focus({preventScroll:true});stage.setPointerCapture(e.pointerId);drag=e.pointerId;
      },true);
      stage.addEventListener('pointermove',e=>{if(drag===e.pointerId)setAngle(scene.angleAt(e.clientX,e.clientY,frameModel.direction));});
      ['pointerup','pointercancel','lostpointercapture'].forEach(k=>stage.addEventListener(k,()=>{drag=null;}));
      function angleKey(e){
        const v=frameModel?.angle;if(v==null)return;
        const direction={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1}[e.key];
        if(!direction&&e.key!=='Home'&&e.key!=='End')return;
        e.preventDefault();e.stopPropagation();
        let next=e.key==='Home'?0:e.key==='End'?90:Math.round(v)+direction*(e.shiftKey?10:1);
        if(direction&&v===C.angle43&&Math.abs(next-v)<=1.3)next+=direction;
        if(direction&&v===C.angle125&&Math.abs(next-v)<=.6)next+=direction;
        setAngle(next);
      }
      handle.addEventListener('keydown',angleKey);by('angle').addEventListener('keydown',angleKey);
    }
    function guideDefs(){return U.steps.map((s,i)=>({...s,target:()=>by((i===2&&frameModel?.surface==='ice'?(frameModel.angle===90?'#pull':'#angle-handle'):i===3&&!frameModel?.outbound?'#pull':s.target).slice(1))}));}
    function need(i){const u=frameModel,p=u?.state,deg=u?Number(u.angle.toFixed(2)):0;return [
      T('拉到 4:3 吸附格，目前 '+deg+'°。','Set the 4:3 notch. Current angle: '+deg+'°.'),
      T('按住「拉」至 10 m，目前 '+(p?.distance||0).toFixed(2)+' m。','Hold Pull to 10 m. Distance: '+(p?.distance||0).toFixed(2)+' m.'),
      T('切冰面、拉到 90°，再按住「拉」觀察滑行。','Select ice, set 90°, then hold Pull to observe the glide.'),
      u?.outbound?T('按「掉頭」後按住「拉」，回到原點。','Turn, then hold Pull to return to the origin.'):T('在粗糙地面以 4:3 拉至 5 m，再掉頭。','Pull 5 m on the rough floor at 4:3, then turn.')
    ][i];}
    const tabNames={concept:['觀念','Concept'],steps:['步驟','Steps'],examples:['範例','Examples'],missions:['任務','Missions'],comments:['留言','Comments']};
    function setPanel(k,open=true){if(presentation?.ownSide)return;sideTab=k;sideOpen=open;by('study-side').hidden=!open;by('edge').setAttribute('aria-expanded',String(open));if(open){panel();if(k==='comments'&&review&&!by('comment-mount').querySelector('textarea')?.value)by('side-body').querySelector('button')?.click();}}
    const sideHead=by('side-tabs');if(!presentation?.ownSide)for(const [k,title] of Object.entries(tabNames)){if(presentation && !presentation.tabs.includes(k))continue;const b=button(tr(title),()=>setPanel(k));b.dataset.tab=k;b.setAttribute('role','tab');sideHead.append(b);}
    function panel(){
      const body=by('side-body'),p=page();body.replaceChildren();body.dataset.tab=sideTab;by('side-title').textContent=tr(tabNames[sideTab]);for(const b of sideHead.children)b.setAttribute('aria-selected',String(b.dataset.tab===sideTab));
      if(sideTab==='concept'){
        const speech=el('p','speech');rich(speech,parseScript(tr(p.speech)).display);body.append(speech);
        if((klass&&!showClass&&p.id.startsWith('6-'))||(!showClass&&klass&&U.reveal[p.id])){speech.replaceChildren();rich(speech,p.prompt?tr(p.prompt):tr(p.caption));}
        else{const list=el('div','side-equations');formulaLines(list,U.board(p.id,scene.colors,en));if(list.childElementCount)body.append(list);}
        if(p.note){const note=el('p');rich(note,tr(p.note));body.append(note);}
      }else if(sideTab==='steps'){
        U.steps.forEach((s,i)=>{const card=el('section','step-card'+(step()===i+1?' now':''));const row=button((activity.steps[i+1]?'✓ ':'')+(i+1)+' · '+tr(s.goal),()=>go(pages.findIndex(k=>k.id==='5-'+(i+1)),0,false));card.append(row);
          const det=el('details','ms-need');det.open=step()===i+1;det.append(el('summary','',T('還差什麼？','What’s missing?')));const info=el('p');info.dataset.need=i;det.append(info);card.append(det);
          const guide=button(T('👆 指給我看','👆 Show me'),()=>{if(step()!==i+1)go(pages.findIndex(k=>k.id==='5-'+(i+1)),0,false);if(innerWidth<1100)setPanel('steps',false);LabStepGuide.define(guideDefs(),{key:'learn'});LabStepGuide.show(i,{key:'learn'});});card.append(guide);body.append(card);});refreshNeeds();
      }else if(sideTab==='examples'){
        pages.filter(x=>x.id.startsWith('6-')).forEach(example=>{const card=el('section','example-card');card.append(el('h3','',tr(example.title)));const prompt=el('p');rich(prompt,tr(example.prompt));card.append(prompt);
          const toggle=button(shownSolutions.has(example.id)?T('收起解答','Hide solution'):T('看解答','Show solution'),()=>{if(shownSolutions.has(example.id))shownSolutions.delete(example.id);else shownSolutions.add(example.id);panel();});
          card.append(toggle);if(shownSolutions.has(example.id)){const lines=el('div','side-equations');formulaLines(lines,U.board(example.id,scene.colors,en));card.append(lines);activity.examples[example.id]=true;saveActivity();LabMission.emit('learn-progress',{earned:earned()});}
          card.append(button(T('播放範例','Play example'),()=>{if(innerWidth<1100)setPanel('examples',false);go(pages.indexOf(example),0,true);}));body.append(card);});
      }else if(sideTab==='missions'){
        const gate=LabMission.statusBox?.();if(gate)body.append(gate);
        const list=el('ol','ms-list');for(const m of LabMission.all()[U.id]||[]){const done=!!LabMission._state.done[m.id],li=el('li','ms-item'+(done?' done':''));li.dataset.mid=m.id;
          const hidden=m.hidden&&!done,title=hidden?T('隱藏任務','Hidden mission'):T(m.title.zh,m.title.en);
          const head=el('div','ms-head');head.append(el('span','ms-stars','★ '+LabMission.starsOf(m)),el('strong','ms-title',title));if(done)head.append(el('span','ms-check','✓'));li.append(head);
          li.append(el('p','ms-desc',hidden?T(m.riddle.zh,m.riddle.en):T(m.desc.zh,m.desc.en)));list.append(li);}body.append(list);
      }else{
        const prefix=()=>review?T('頁 '+p.id+'，第 '+Math.floor(t)+' 秒：','Page '+p.id+', second '+Math.floor(t)+': '):'';
        const compose=text=>{const sec=by('comments');if(sec){by('comment-mount').append(sec);sec.hidden=false;}
          if(window.LabComments){LabComments.compose(text);return;}const target=window.open(document.body.dataset.commentsUrl,'_blank');if(!target)return;
          let tries=0;const timer=setInterval(()=>{if(target.closed||++tries>80){clearInterval(timer);return;}try{if(target.LabComments){target.LabComments.compose(text);target.opener=null;clearInterval(timer);}}catch{clearInterval(timer);}},100);};
        body.append(button(T('寫留言','Write a comment'),()=>compose(prefix())),button(T('回報畫面問題','Report a display issue'),()=>compose(prefix()+T('【Bug 回報】','[Bug report] '))));
        if(review){const pref=el('p','review-prefix',prefix());body.append(pref);}
      }
      by('comment-mount').hidden=sideTab!=='comments';
    }
    function refreshNeeds(){for(const e of by('side-body').querySelectorAll('[data-need]')){const i=+e.dataset.need,txt=activity.steps[i+1]?T('✓ 已完成','✓ Complete'):need(i);if(e.textContent!==txt)e.textContent=txt;}}
    by('edge').addEventListener('click',()=>setPanel(sideTab,!sideOpen));by('side-close').addEventListener('click',()=>setPanel(sideTab,false));
    let edgeStart=0;by('edge').addEventListener('touchstart',e=>edgeStart=e.touches[0].clientX,{passive:true});
    by('edge').addEventListener('touchend',e=>{if(edgeStart-e.changedTouches[0].clientX>16)setPanel(sideTab,true);},{passive:true});
    by('side-header').addEventListener('touchstart',e=>edgeStart=e.touches[0].clientX,{passive:true});
    by('side-header').addEventListener('touchend',e=>{if(e.changedTouches[0].clientX-edgeStart>35)setPanel(sideTab,false);},{passive:true});
    by('previous').onclick=()=>go(index-1);by('next').onclick=()=>go(index+1);
    // 沉浸模式（11/23 站長：「設計有個沉浸模式的按鍵，能夠開全屏幕。不管是載具，可以看全屏幕；然後老師上課投影也是全屏幕。」）
    // 解題卡蓋滿整個視窗；瀏覽器支援就同時進全螢幕（iPhone 不支援元素全螢幕，只蓋滿視窗）
    (()=>{
      const bar=document.querySelector('.transport-buttons');if(!bar||by('immersive'))return;
      const b=document.createElement('button');b.type='button';b.id='immersive';bar.insertBefore(b,bar.querySelector('.auto-next'));
      const root=document.documentElement,icon=on=>'<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'+(on?'<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>':'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')+'</svg>';
      const label=()=>{const on=root.classList.contains('learn-immersive');b.setAttribute('aria-pressed',String(on));b.innerHTML=icon(on)+'<span class="imm-t">'+(on?T('退出','Exit'):T('沉浸','Immersive'))+'</span>';
        b.title=on?T('退出沉浸模式（Esc）','Exit immersive mode (Esc)'):T('沉浸模式：解題畫面全螢幕','Immersive mode: full-screen solution');b.setAttribute('aria-label',b.title);};
      const fsOn=()=>document.fullscreenElement||document.webkitFullscreenElement||(()=>{try{return window.top!==window&&parent.__examImm?parent.__examImm.fsOn():null;}catch{return null;}})();
      function set(on){
        root.classList.toggle('learn-immersive',on);label();
        if(on){const req=root.requestFullscreen||root.webkitRequestFullscreen;if(req&&!fsOn())try{const r=req.call(root);if(r&&r.catch)r.catch(()=>{});}catch(e){}}
        else if((document.fullscreenElement||document.webkitFullscreenElement)&&!root.classList.contains('exam-imm-page')){const ex=document.exitFullscreen||document.webkitExitFullscreen;try{const r=ex&&ex.call(document);if(r&&r.catch)r.catch(()=>{});}catch(e){}}
        dispatchEvent(new Event('resize'));
      }
      b.onclick=()=>set(!root.classList.contains('learn-immersive'));
      const left=()=>{if(!fsOn()&&root.classList.contains('learn-immersive')&&root.dataset.immFs==='1'){root.dataset.immFs='';set(false);}else if(fsOn())root.dataset.immFs='1';};
      document.addEventListener('fullscreenchange',left);document.addEventListener('webkitfullscreenchange',left);
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&root.classList.contains('learn-immersive')&&!document.querySelector('.learn-rmenu'))set(false);});
      label();
    })();
    by('replay').onclick=()=>go(index,0,true);by('play').onclick=()=>{if(t>=clock().dur)go(index,0,true);else setPlaying(!playing);};
    by('playhead').addEventListener('input',e=>seek(+e.target.value));by('speed').setAttribute('aria-haspopup','true');
    const setRate=v=>{speed=v;write('learn-rate',v);if(voice)voice.playbackRate=speed;if(tts&&playing&&tts.phase==='speak')ttsSpeak();closeVoiceMenu();};
    // 旁白聲音＋語速選單和頂列「聲音」鍵共用（openVoiceMenu）；播放器掛上後，頂列改用這裡的設定
    const vhost={vpick:()=>vpick,speed:()=>speed,setVoice:v=>setVoice(v),setRate:v=>setRate(v),closed:()=>controlLabels()};window.LearnVoiceHost=vhost;
    by('speed').onclick=e=>{e.stopPropagation();if(VM.host&&VM.anchor===by('speed'))return closeVoiceMenu();openVoiceMenu(by('speed'),vhost);controlLabels();};
    by('auto').onchange=e=>{auto=e.target.checked;write('learn-auto',auto);};
    by('sound').onclick=()=>LabSettings.set('sound',!sound);
    addEventListener('lab:settingschange',e=>{if(e.detail?.name==='sound'){sound=LabSettings.get('sound');if(voice)voice.muted=!sound;if(isTTS(vpick))reloadVoice();if(playing&&!sound)heardFromStart=false;controlLabels();}});
    by('class-mode').onclick=()=>{syncURL();const url=new URL(location.href);if(klass)url.searchParams.delete('class');else url.searchParams.set('class','1');location.assign(url.href);};
    if(by('class-reveal'))by('class-reveal').onclick=()=>{showClass=!showClass;by('class-reveal').textContent=showClass?T('收起答案','Hide answer'):T('公布答案','Reveal answer');stamp='';render();if(sideOpen)panel();};
    if(by('share'))by('share').onclick=share;
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){setPanel(sideTab,false);return;}if(!klass||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,button,[contenteditable]'))return;
      if(e.key==='ArrowLeft')go(index-1);else if(e.key==='ArrowRight')go(index+1);else if(e.code==='Space')by('play').click();else return;e.preventDefault();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){setPlaying(false);release();syncURL();}});
    addEventListener('pagehide',()=>{release();setHaptic(false);voice?.pause();ttsCancel();});
    addEventListener('lab:themechange',()=>{stamp='';render();if(sideOpen)panel();});
    const explicit=['seg','p','t','line'].some(k=>params.has(k)),id=presentation?params.get('line'):(params.get('seg')||'1')+'-'+(params.get('p')||'1');
    const start=explicit?Math.max(0,pages.findIndex(p=>p.id===id)):Math.max(0,pr.get()-1);
    go(start,+params.get('t')||0,!presentation&&!reduced&&!klass&&!explicit);
    setPanel('concept',sideOpen);
    window.LearnPlayer={pause(){setPlaying(false);},get snapshot(){return {id:page().id,index,t,dur:clock().dur,playing,mediaReady:voiceReady,mediaDuration:voiceReady?voice.duration:null,tail,renderer:by('scene').dataset.renderer,geometry:scene.geometry,model:frameModel,colors:scene.colors};}};

  }
  return {parseScript,estimate,numeric,gradeNumber,mount,progress,mastControls};
});
