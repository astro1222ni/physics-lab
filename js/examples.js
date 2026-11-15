/* 既有實驗只需掛點＋三個 script。狀態還原沿用 classroom.js。 */
(function(){
  'use strict';
  const registry=window.LAB_EXAMPLE_DATA || (window.LAB_EXAMPLE_DATA={});
  const T=(a,b)=>window.LabSettings?LabSettings.t(a,b):a;
  const embed=new URLSearchParams(location.search).get('embed')==='1';
  let selected=null, waiting=null;
  const labels=[['範例一','Example 1'],['範例二','Example 2'],['範例三','Example 3']];
  function concept(){
    LabPanel.setContent('concept',[
      LabPanel.element('h3',T('先判斷接觸面有沒有滑','First ask whether the surfaces slip')),
      LabPanel.element('p',T('還沒滑：先找其他力想讓木塊往哪滑，再用平衡找出需要的靜摩擦力。上限只告訴你撐不撐得住。','Before slipping, find which way the other forces would drive the block, then use equilibrium to find the static friction needed. The limit tells you whether it can hold.')),
      LabPanel.element('p',T('已經滑：摩擦力和接觸面的相對滑動方向相反。範例的「看解答」一次只多出一行，先自己想。','Once sliding, friction opposes relative motion at the contact. Reveal each solution one line at a time and think first.'))
    ]);
  }
  function define(slug,data){registry[slug]=data;mount();}
  function apply(slug,n,open){
    const ex=(registry[slug] || []).find(x=>x.n===Number(n));if(!ex)return false;
    if(!window.LabShare){waiting={slug,n,open};return false;}
    // reset 也在還原保護內；LabShare.restore 自己延後解除 restoring。
    LabShare.restoring=true;
    document.getElementById('reset')?.click();
    LabShare.restore(ex.state); selected=ex;
    document.querySelectorAll('.ex-bar[data-examples="'+slug+'"] button').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.example===ex.n)));
    LabPanel.mount({});concept();LabPanel.showExample(ex,{embed:embed});
    LabPanel.setStrip(T('範例 ','Example ')+ex.n+'：'+LabPanel.tr(ex.q));
    if(open!==false)LabPanel.open('examples');
    const u=new URL(location.href);u.searchParams.set('ex',ex.n);history.replaceState(null,'',u);
    window.dispatchEvent(new CustomEvent('lab:examplechange',{detail:{slug:slug,n:ex.n}}));
    return true;
  }
  function mount(){
    document.querySelectorAll('.ex-bar').forEach(root=>{
      if(root.children.length)return;const slug=root.dataset.examples;
      (registry[slug] || []).forEach(ex=>{
        const pair=labels[ex.n-1];const b=document.createElement('button');b.type='button';b.textContent=T(pair[0],pair[1]);b.dataset.example=ex.n;b.setAttribute('aria-pressed','false');
        b.addEventListener('click',()=>apply(slug,ex.n));root.append(b);
      });
    });
  }
  function ready(){mount();const slug=document.querySelector('.ex-bar')?.dataset.examples;if(!slug)return;
    const n=new URLSearchParams(location.search).get('ex');
    if(n)apply(slug,n,true);else{LabPanel.mount({});concept();LabPanel.showExample(registry[slug][0],{embed:embed});LabPanel.setStrip(T('選一題，讓實驗替你擺好器材','Choose an example to set up the experiment'));}
  }
  document.addEventListener('lab:shareready',()=>{if(waiting){const w=waiting;waiting=null;apply(w.slug,w.n,w.open);}});
  window.LabExamples={define,apply,get:slug=>registry[slug] || [],get selected(){return selected;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
