/* 共用小鍵盤與步驟指引只呼叫原器材；沒有第二套電流或任務狀態。 */
(function () {
  'use strict';
  const L=CurrentBalanceLab,T=(a,b)=>LabSettings.t(a,b),cv=document.getElementById('cv');
  let padMoved=false;try{padMoved=JSON.parse(localStorage.getItem('lab-vpad:current-balance')||'null')?.custom===true;}catch(e){}
  function padViewport(){
    // 預設避開右側說明與操作台；開始拖曳後，整個視窗都開放給使用者放置。
    if(padMoved)return {width:innerWidth,height:innerHeight};
    const wide=innerWidth>=881||LabDeck.mode==='drawer',right=wide?Math.max(240,cv.getBoundingClientRect().right):innerWidth-8;
    const limited=CurrentBalanceStudy.active&&LabPanel.state!=='collapsed'&&!wide;
    return {width:right,height:limited?Math.max(100,document.querySelector('.lp-strip').getBoundingClientRect().top):innerHeight};
  }
  const pad=LabVPad.mount({id:'current-balance',canvas:cv,objects:['nut','I1','I2'],steps:[.001,.01,.05],step:.01,selected:()=>L.selected,select:id=>L.select(id),move:(dx,dy,id)=>L.tweak(dx,dy,id),record:()=>document.getElementById('record').click(),point:id=>L.screenPoint(id),board:()=>cv.getBoundingClientRect(),reading:()=>{const s=L.snapshot();return L.selected==='nut'?s.nut.toFixed(3)+' mm':s.knobs[L.selected].toFixed(3)+' A';},visible:()=>document.documentElement.dataset.labMode!=='choose'&&L.snapshot().view==='2d'&&(!CurrentBalanceStudy.active||[4,6].includes(CurrentBalanceStudy.state.section)),viewport:padViewport});
  pad.element.querySelector('.vpad-handle').addEventListener('pointerdown',()=>{padMoved=true;},{capture:true});
  pad.element.querySelector('.vpad-handle').addEventListener('dblclick',()=>{padMoved=false;},{capture:true});
  pad.element.setAttribute('aria-label',T('天平八向微調小鍵盤','Eight-direction balance adjustment'));
  // 第一次先收成小圓鈕；學生點畫布旁的螺母／電流鍵才展開，避免擋住器材。
  try{if(!localStorage.getItem('lab-vpad:current-balance'))pad.collapse(true);}catch(e){pad.collapse(true);}
  const names={nut:['螺母','Nut'],I1:['I1','I1'],I2:['I2','I2']};
  function labels(){const selected=pad.element.querySelector('.vpad-select');if(selected){const text=T(...names[L.selected]);if(selected.textContent!==text)selected.innerHTML=L.selected==='nut'?text:'I<sub>'+L.selected.slice(1)+'</sub>';selected.setAttribute('aria-label',T('切換螺母、I1、I2','Select nut, I1 or I2'));}const step=pad.element.querySelector('.vpad-step'),unit=L.selected==='nut'?' mm':' A',text=pad.state.step+unit;if(step&&step.textContent!==text)step.textContent=text;for(const b of pad.element.querySelectorAll('[data-direction]'))b.setAttribute('aria-label',T('微調 ','Fine adjustment ')+b.textContent);pad.lens.querySelector('canvas').setAttribute('aria-label',T('所選器材三倍放大','Three-times magnification of selected apparatus'));document.querySelectorAll('[data-fine]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.fine===L.selected)));}
  addEventListener('cb:fine',()=>{pad.activity();labels();});addEventListener('cb:select',()=>{pad.refresh();labels();});pad.element.addEventListener('click',()=>requestAnimationFrame(labels));
  document.querySelectorAll('[data-fine]').forEach(b=>b.onclick=()=>{L.select(b.dataset.fine);pad.collapse(false);pad.refresh();});document.getElementById('cb-guide-toggle').append(LabStepGuide.toggleButton());
  function target(i){const s=L.snapshot();return [s.hung?'hang':s.power?'power':'nut',s.knobs.I1>0?'I1':s.knobs.I2>0?'I2':'power',!s.currents?'I1':!s.magDown?'rev1':'I2',!s.hung?'hang':!s.level?'I2':'record','wl','part2'][i];}
  const definitions=Array.from({length:6},(_,i)=>({target:()=>document.getElementById(target(i)),action:'tap',hint:()=>T(...[['歸零螺母','Zero nut'],['開啟電源','Power on'],['電流與反向','Currents and reversal'],['掛勾／記錄','Hook / record'],['剪線長度','Wire length'],['實驗二','Part 2']][i]),opener:()=>{const card=document.getElementById(target(i))?.closest('[data-deck]');return card?.id?document.querySelector('[aria-controls="'+card.id+'"]'):null;}}));LabStepGuide.define(definitions,{key:'cb-lab'});
  function update(){if(CurrentBalanceStudy.active)return;const s=L.snapshot(),i=s.steps.findIndex(v=>!v);if(i<0)LabStepGuide.hide();else LabStepGuide.update(i,{key:'cb-lab',auto:true});}
  addEventListener('cb:action',update);update();labels();
  // 手機分頁內的分析先放圖與切換鍵，再放長數據表，避免跨好幾頁才能操作。
  const figure=document.querySelector('#dataCard figure');if(figure){figure.dataset.deck='分析圖|Graph';figure.dataset.deckOrder='8';figure.classList.add('card');const heading=document.createElement('h2');heading.textContent=T('分析圖','Analysis graph');figure.prepend(heading);}
  // ---------- 實驗模式的右側側板：步驟／任務／留言（站長 11/16 晚上的規則，等位線為範本） ----------
  // 每一步都有「還差什麼？」逐條 [ok, 中文, English]；ok 為 null 是接下來要做的動作（站長：「步驟跟一般任務都需要有」）
  const f2=v=>Number.isFinite(v)?v.toFixed(2):'—',f1=v=>Number.isFinite(v)?v.toFixed(1):'—';
  function own(s){return CurrentBalanceCore.analyze((s.rows||[]).filter(r=>!r.given).map(r=>({part:r.part,m:r.m*1e-6,I1:r.I1,I2:r.I2})));}
  function stepNeed(i,s){
    const k=s.knobs,A=own(s),tip='（目前 '+(s.tip>=0?'偏高 ':'偏低 ')+f1(Math.abs(s.tip))+' mm）',tipEn=' (now '+f1(Math.abs(s.tip))+' mm '+(s.tip>=0?'high':'low')+')';
    if(i===0)return [[!(s.I1>0&&s.I2>0),'沒有電流：電流轉到 0 或關掉電源','No current: knobs at 0 or power off'],[!s.hung,'掛勾上不掛東西（有東西就按「取下」）','Nothing on the hook (take it off if needed)'],[!!s.level,'轉「歸零螺母」讓指針對準水平刻線'+tip,'Turn the zero nut until the pointer is level'+tipEn],[!!s.rest,'等天平停穩','Wait for the balance to settle']];
    if(i===1){const zero=k.I1===0&&k.I2===0,ok=s.power&&s.fromMin;return [[ok||zero,'兩個電流旋鈕都轉到 0（目前 I1 '+f2(k.I1)+' A、I2 '+f2(k.I2)+' A）','Both current knobs at 0 (now I1 '+f2(k.I1)+' A, I2 '+f2(k.I2)+' A)'],s.power&&!s.fromMin?[false,'電源是在旋鈕不為 0 時打開的：先關電源、旋鈕轉到 0，再開','The power went on with a knob above 0: switch off, turn both to 0, switch on again']:[ok,'按「開啟電源」','Press “Power on”']];}
    if(i===2)return [[!!s.power,'電源已開','Power is on'],[k.I1>=.995&&k.I1<=3.005,'I1 在 1.00–3.00 A（目前 '+f2(k.I1)+' A）','I1 between 1.00 and 3.00 A (now '+f2(k.I1)+' A)'],[k.I2>=1,'I2 約 2 A，至少 1 A（目前 '+f2(k.I2)+' A）','I2 about 2 A, at least 1 A (now '+f2(k.I2)+' A)'],[!!(s.currents&&s.magDown),s.currents&&!s.magDown?'外端下垂：按「I1 反向」或「I2 反向」其中一個':'外端上翹（bc 受力向下）',s.currents&&!s.magDown?'The outer end drops: press one of the “Reverse” buttons':'Outer end rises (bc pushed down)']];
    if(i===3)return [[s.part===1,'選「實驗一：固定 I1、調 I2」','Choose “Part 1: fix I1, adjust I2”'],[!!s.hung,'剪一段漆包線，按「掛上天平」','Cut a piece of wire and press “Hang it on the balance”'],[!!(s.currents&&s.magDown),'兩個電流都開、外端上翹','Both currents on, outer end rising'],[!!(s.level&&s.rest),'慢慢調 I2 讓指針水平並停穩'+tip,'Adjust I2 until the pointer is level and still'+tipEn],[A.p1.n>=1,'按「記錄」','Press “Record”']];
    if(i===4)return [[A.p1.distinctM>=5,'實驗一做 5 種不同長度（目前 '+(A.p1.distinctM||0)+' 種）','Five different lengths in Part 1 ('+(A.p1.distinctM||0)+' so far)'],[!(A.p1.n>1)||A.p1.I1spread<=.011,'I1 全程不變','Keep I1 fixed'],[null,'換一段長度、掛上、調 I2 平衡，再按「記錄」','Cut another length, hang it, balance with I2 and record']];
    return [[s.part===2,'按「實驗二：固定 I2、調 I1」','Choose “Part 2: fix I2, adjust I1”'],[k.I2>=2.995&&k.I2<=5.005,'I2 固定在 3.00–5.00 A（目前 '+f2(k.I2)+' A）','I2 fixed between 3.00 and 5.00 A (now '+f2(k.I2)+' A)'],[A.p2.distinctM>=5,'實驗二做 5 種不同長度（目前 '+(A.p2.distinctM||0)+' 種）','Five different lengths in Part 2 ('+(A.p2.distinctM||0)+' so far)'],[null,'改調 I1 讓天平平衡，再按「記錄」','Balance with I1, then record']];
  }
  function stepList(){const s=L.snapshot(),now=s.steps.findIndex(v=>!v);return Array.from(document.getElementById('steps').children).map((li,i)=>({html:li.innerHTML,done:!!s.steps[i],current:i===now,need:s.steps[i]?null:stepNeed(i,s)}));}
  // 手指與捲動箭頭只在按「👆 指給我看」時出現（stepguide.js 約 6 秒淡出）；側板裡每一步也有自己的「指給我看」
  const side=window.LabSide?LabSide.mount({module:'current-balance',study:()=>CurrentBalanceStudy.active,steps:stepList,guide:i=>{LabStepGuide.setEnabled(true);LabStepGuide.define(definitions,{key:'cb-lab'});LabStepGuide.update(i,{key:'cb-lab'});},focus:()=>cv.scrollIntoView({block:'start',behavior:LabDraw.reducedMotion()?'instant':'smooth'})}):null;
  window.CurrentBalanceControls={pad,update,side,steps:stepList};
  new MutationObserver(labels).observe(pad.element,{childList:true,subtree:true});
})();
