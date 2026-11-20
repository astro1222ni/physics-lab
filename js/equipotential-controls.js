/* 等位線只提供座標與原操作回呼；小鍵盤、放大鏡及側板由共用元件處理。 */
(function(){
  'use strict';
  const L=EquipotentialLab,P=LabPanel,T=(a,b)=>LabSettings.t(a,b),cv=document.getElementById('cv');
  const pad=LabVPad.mount({id:'equipotential',className:'eq-probe-pad',canvas:cv,objects:['n1','n2'],selected:()=>L.selected,select:id=>L.focus(id),move:(dx,dy)=>L.tweak(dx,dy),record:()=>L.record(),point:id=>{const p=L.probe(id);return L.screenPoint(p.x,p.y);},board:()=>L.board(),reading:()=>document.getElementById('rMeter').textContent,visible:()=>L.currentView==='2d'&&(!EquipotentialStudy.active||EquipotentialStudy.state.section===4),viewport:()=>{let height=innerHeight;if(innerWidth<1240){const panel=EquipotentialStudy.active&&LabPanel.state!=='collapsed'?document.querySelector('.lp-strip'):LabSide.instance?.state.open?document.querySelector('.labside-panel'):null;if(panel)height=Math.max(80,panel.getBoundingClientRect().top);}const docked=innerWidth>=1240&&(EquipotentialStudy.active||LabSide.instance?.state.open||document.documentElement.classList.contains('lp-docked'));const deckWidth=window.LabDeck?.mode==='drawer'?document.querySelector('.labdeck').getBoundingClientRect().width:0;return {width:innerWidth-deckWidth-(docked?380:0)-(EquipotentialStudy.active?0:48),height};}});
  // 第一次橫放先收起小鍵盤；已儲存的位置和展開狀態優先。
  if (matchMedia('(orientation: landscape) and (max-height: 600px)').matches && !localStorage.getItem('lab-vpad:equipotential')) pad.collapse(true);
  pad.element.dataset.eqPad='';addEventListener('eqp:probemove',()=>pad.activity());addEventListener('eqp:probeselect',()=>pad.refresh());
  const hint=P.element('p',T('畫面上也有微調小鍵盤','A floating fine-move keypad is also available on the canvas.'),'hint');document.querySelector('.nudge').after(hint);
  const side=LabSide.mount({module:'equipotential',study:()=>EquipotentialStudy.active,steps:()=>L.steps(),guide:i=>{LabStepGuide.setEnabled(true);LabStepGuide.define(L.guides(false),{key:'equipotential'});LabStepGuide.update(i,{key:'equipotential'});},focus:()=>{P.close();document.getElementById('cv').scrollIntoView({block:'start',behavior:LabDraw.reducedMotion()?'instant':'smooth'});}});
  const heading=document.getElementById('steps').previousElementSibling;const guideHead=P.element('div',null,'labside-guide-head');heading.before(guideHead);guideHead.append(heading,LabStepGuide.toggleButton());
  const mail=P.button('✉',()=>{if(EquipotentialStudy.active)P.open('comments');else side.open('comments');});mail.setAttribute('aria-label',T('留言與 bug 回報','Comments and bug reports'));document.querySelector('.eq-study-head').append(mail);
  addEventListener('lab:feedbackcompose',()=>{if(EquipotentialStudy.active)EquipotentialStudy.flow.close();});
  window.EquipotentialControls={pad,side};
})();
