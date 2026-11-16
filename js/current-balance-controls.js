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
  const definitions=Array.from({length:6},(_,i)=>({target:()=>document.getElementById(target(i)),action:'tap',hint:()=>T(...[['歸零螺母','Zero nut'],['開電源','Power'],['電流與反向','Currents and reversal'],['掛勾／記錄','Hook / record'],['剪線長度','Wire length'],['實驗二','Part 2']][i]),opener:()=>{const card=document.getElementById(target(i))?.closest('[data-deck]');return card?.id?document.querySelector('[aria-controls="'+card.id+'"]'):null;}}));LabStepGuide.define(definitions,{key:'cb-lab'});
  function update(){if(CurrentBalanceStudy.active)return;const s=L.snapshot(),i=s.steps.findIndex(v=>!v);if(i<0)LabStepGuide.hide();else LabStepGuide.update(i,{key:'cb-lab',auto:true});}
  addEventListener('cb:action',update);update();labels();
  // 手機分頁內的分析先放圖與切換鍵，再放長數據表，避免跨好幾頁才能操作。
  const figure=document.querySelector('#dataCard figure');if(figure){figure.dataset.deck='分析圖|Graph';figure.dataset.deckOrder='8';figure.classList.add('card');const heading=document.createElement('h2');heading.textContent=T('分析圖','Analysis graph');figure.prepend(heading);}
  window.CurrentBalanceControls={pad,update};
  new MutationObserver(labels).observe(pad.element,{childList:true,subtree:true});
})();
