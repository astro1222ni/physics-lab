/* 同一台天平的八段自學：題目、指引、範例與領星互相分開，保留學生的量測。 */
(function () {
  'use strict';
  const C=CurrentBalanceCore,S=CurrentBalanceStudyCore,U=CurrentBalanceStudyData,L=CurrentBalanceLab,P=LabPanel,D=LabDraw;
  const T=(a,b)=>LabSettings.t(a,b),tr=P.tr,E=P.element,B=(text,fn)=>{const b=rich(P.button('',fn),text);if(text)b.setAttribute('aria-label',text);return b;},$=id=>document.getElementById(id);
  const mathSymbols=text=>String(text).replace(/\bI([12])\b/g,'\\(I_$1\\)').replace(/μ0/g,'\\(\\mu_0\\)');
  const rich=(node,text)=>P.rich(node,mathSymbols(text));
  const KEY='current-balance-study:v1',blank=()=>({answers:{},first:{},submitted:{},quizFirst:{},sections:Array(8).fill(false),cards:[],hands:Array(9).fill(false),flags:{},examples:{},project:null});
  let diagramFrame=0;
  let run=blank(),flow,teachingCopy,teachingRows,currentExample=0,exampleApplying=false,enteredAt=0,message='',linear=false,compareIdeal=false,compareReal=false,rendering=false;
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&saved.sections?.length===8)run={...blank(),...saved};}catch(e){}
  const isStudy=()=>!!flow?.state.active,section=()=>flow?.state.section||0,isTeacher=()=>!!flow?.state.teaching;
  function save(){if(isTeacher())return;try{localStorage.setItem(KEY,JSON.stringify(run));}catch(e){}}
  function tell(text){message=text;const node=$('cb-study-message');if(node)rich(node,text);document.querySelectorAll('.cb-course-message').forEach(p=>rich(p,text));}
  function emit(act,seg,data){if(isStudy())flow.emit(act,seg,data);save();}
  function ownRows(){return L.snapshot().rows.filter(r=>!r.given);}
  function analysis(rows=ownRows()){return C.analyze(rows.map(r=>({...r,m:r.m*1e-6})));}
  function remember(){const rows=ownRows().filter(r=>r.part===1);if(rows.length)run.project={rows:rows.map(r=>({...r})),I1:rows[0].I1};save();}
  const base={power:true,fromMin:true,I1:3,I2:2,s1:1,s2:1,len:1,hung:false,nut:8.4,mode:'ideal',realSol:false,part:1,weight:'wire',grains:1,show:{hand:false,optical:false,labels:true,force:true,field:true}};
  function enter(n,reset){enteredAt=performance.now();message='';
    if(n===4){L.view('2d');L.preset({...base,power:false,I1:0,I2:0,s1:-1,nut:10},run.project?.rows||[]);defineGuide();}
    else if(n===5||n===8){L.view('2d');L.preset({...base,hung:true,I2:run.project?.rows.at(-1)?.I2||2,len:(run.project?.rows.at(-1)?.m||40)/40},run.project?.rows||[]);}
    else if(n!==6){L.view('2d');L.preset({...base,I1:n===2?1:2,I2:n===7&&flow?.state.step===3?2.5:3,hung:true,len:2.3},[]);}
    if(n!==4)LabSteps.setActive(false);
  }
  function step(n,i){enteredAt=performance.now();message='';
    if(n===3&&i===2){L.preset({show:{hand:true}});L.view('3d');}
    else if(n!==4&&n!==6)L.view('2d');
    if(n===7)L.preset({I1:i===1?1:2,I2:i===1?2:i===3?2.5:3});
    if(n===6&&!exampleApplying&&currentExample!==i)applyExample(i);
    if(n===4){document.querySelector('#lp-pane-steps .lp-steps li:nth-child('+i+')>button')?.click();setTimeout(()=>{LabStepGuide.update(i-1,{key:'cb-study',auto:true});LabDeck?.reveal($(guideTarget(i-1)));},0);}
    else LabStepGuide.hide();
    if(n===5&&i===2){compareIdeal=false;compareReal=false;}
    if([2,3,5,7,8].includes(n))P.open('concept');
    if(n===3&&i===2)P.close();
    L.redraw();
  }
  function canAdvance(n,i){
    if(n===1&&i===1){const img=$('cb-kibble-photo');if(!img?.complete||!img.naturalWidth){tell(T('照片還在載入。','The photograph is still loading.'));return false;}run.flags.photo=true;}
    if(n===2&&!run.submitted['p'+i]){tell(T('先送出預測；答案留到第 5 段。','Submit your prediction first; answers are revealed in Section 5.'));return false;}
    if(n===3){if(performance.now()-enteredAt<250)return false;if(i===2&&!run.flags.hand&&!run.flags.handFallback){tell(T('先等 3D 載入，轉一轉右手；裝置不支援時可用下方的替代示意確認。','Let 3D load and rotate the hand. If unavailable, use the fallback diagram confirmation below.'));return false;}run.cards[i-1]=true;}
    if(n===4&&!run.hands[i-1]){tell(T('這一步要實際做完；打開「步驟」可看目標與進度。','Complete this action first; open Steps for its target and progress.'));return false;}
    if(n===6&&!run.examples[i]){tell(T('先完成這題的實驗驗算。','Verify this example in the experiment first.'));return false;}
    if(n===7&&run.answers['q'+i]!==U.questions['q'+i].correct){tell(T('先選答案；答錯可以重答並看迷思說明。','Choose the correct answer first; retries include an explanation.'));return false;}
    return true;
  }
  function finish(n){const ok=[!!run.flags.photo&&!!run.flags.rice,!!run.submitted.p1&&!!run.submitted.p2,run.cards.filter(Boolean).length===5,run.hands.every(Boolean),!!run.flags.compared&&!!run.flags.models,[1,2,3].every(i=>run.examples[i]),['q1','q2','q3'].every(k=>run.answers[k]===U.questions[k].correct),!!run.flags.card][n-1];
    if(!ok){tell(T('這段還有動手條件沒完成；可以從八段分頁先看其他段，紀錄會保留。','An activity remains in this section. You can explore another section; your work is saved.'));return false;}
    if(!isTeacher())run.sections[n-1]=true;
    if(n===1)emit('intro-completed',1,{photoSeen:true,riceSeen:true});
    if(n===3)emit('concepts-completed',3,{cardsSeen:5,handSeen:!!run.flags.hand});
    if(n===4)remember();if(n===8)finishUnit();save();return true;
  }
  function finishUnit(){const done=LabMission._state?.done||{},awarded=Array.from({length:16},(_,i)=>i+14).filter(i=>done['current-balance-'+i]);if(run.sections.every(Boolean))emit('unit-completed',8,{sections:run.sections.slice(),awarded});}
  function guideTarget(i){const s=L.snapshot();return ['nut',s.knobs.I1?'I1':s.knobs.I2?'I2':'power',!s.currents?'I1':!s.magDown?'rev1':'I2',s.hung?'wl':'hang','I2','record','wl','g1','cb-mu-answer'][i];}
  function defineGuide(){LabSteps.setActive(true);LabSteps.define(U.sections[3].steps.map((s,i)=>({t:s.cap,detail:s.body,check:x=>!!run.hands[i]})),{title:['量出自己的真空磁導率','Measure vacuum permeability']});LabStepGuide.define(U.sections[3].steps.map((s,i)=>({target:()=>$(guideTarget(i)),action:'tap',hint:()=>T(...[['歸零螺母','Zero nut'],['開電源','Power'],['電流／反向','Current / reverse'],['掛上天平','Hang load'],['調 I2','Adjust I2'],['記錄','Record'],['換長度','New length'],['B–I2 圖','B–I2 graph'],['輸入 μ0','Enter μ0']][i]),opener:()=>{const el=$(guideTarget(i));const card=el?.closest('[data-deck]');return card?.id?document.querySelector('.labdeck-tabs [aria-controls="'+card.id+'"]'):null;}})),{key:'cb-study'});}
  function guideUpdate(type,data,user){if(!isStudy()||section()!==4||isTeacher()||!user)return;const s=L.snapshot(),an=analysis(),p=an.p1;
    const pass=[!s.power&&!s.hung&&s.rest&&s.level&&Math.abs(s.zeroOff)<.8,s.power&&s.fromMin,s.currents&&s.magDown&&Math.abs(s.knobs.I1-3)<.005,s.hung&&s.weight==='wire',s.hung&&s.currents&&s.magDown&&s.rest&&s.level,ownRows().length>=1,p.n>=5&&p.distinctM>=5&&p.I1spread<=.011,!!run.flags.graph,!!run.flags.mu];
    const index=flow.state.step-1;
    if(pass[index]&&!run.hands[index]){run.hands[index]=true;if(index===0)emit('zero-completed',4,s);if(index===6)emit('five-recorded',4,{...p,given:false});save();LabSteps.feed({...s});render();}
    LabStepGuide.update(index,{key:'cb-study',auto:true});
  }
  function conditions(){const s=L.snapshot();const model=s.realSol?T('真實有限長螺線管','real finite solenoid'):T('長螺線管模型','long-solenoid model');const zero=section()===4&&!run.hands[0]?T('正在歸零','zeroing now'):Math.abs(s.zeroOff)<.8?T('已歸零','zeroed'):T('尚未歸零','not zeroed');return T('水平管 · bc 在中央 · ','Horizontal · bc centered · ')+zero+' · '+model+T(' · 等臂 14.0 cm；ㄈ電路 I1、螺線管 I2',' · equal 14.0 cm arms; circuit I1, solenoid I2');}
  function question(id){const q=U.questions[id],predict=id[0]==='p',box=E('section',null,'cb-question'),options=E('div',null,'study-options');
    q.options.forEach((option,i)=>{const b=B('',()=>{if(predict&&run.submitted[id]&&!isTeacher())return;run.answers[id]=i;if(!predict){if(run.quizFirst[id]==null)run.quizFirst[id]=i;StudyFlow.cue(i===q.correct?'correct':'wrong');checkQuiz();}save();render();});b.dataset.answer=id+'-'+i;b.setAttribute('aria-pressed',String(run.answers[id]===i));b.disabled=predict&&!!run.submitted[id]&&!isTeacher();b.append(E('span','ABC'[i],'study-letter'),rich(E('span'),tr(option)));if(!predict&&run.answers[id]===i)b.classList.add(i===q.correct?'correct':'wrong');if(isTeacher()&&flow.state.reveal&&i===q.correct)b.classList.add('correct');options.append(b);});box.append(options);
    if(predict&&!isTeacher()){const send=B(run.submitted[id]?T('已送出，稍後揭曉','Submitted; reveal later'):T('送出這題預測','Submit prediction'),()=>{if(!Number.isInteger(run.answers[id]))return;run.first[id]=run.answers[id];run.submitted[id]=true;if(run.submitted.p1&&run.submitted.p2)emit('predictions-submitted',2,{submitted:2});save();render();});send.dataset.submit=id;send.disabled=!!run.submitted[id]||!Number.isInteger(run.answers[id]);box.append(send);}
    if(!predict&&Number.isInteger(run.answers[id])&&(!isTeacher()||flow.state.reveal)){const f=rich(E('div',null,'study-feedback'),tr(q.feedback[isTeacher()?q.correct:run.answers[id]]));box.append(f);}
    if(isTeacher())box.append(B(flow.state.reveal?T('藏答案','Hide answer'):T('公布答案','Reveal answer'),()=>flow.reveal()));return box;
  }
  function checkQuiz(){if(isTeacher())return;const correct=['q1','q2','q3'].filter(k=>run.answers[k]===U.questions[k].correct).length,firstCorrect=['q1','q2','q3'].filter(k=>run.quizFirst[k]===U.questions[k].correct).length;if(correct===3){emit('quiz-correct',7,{correct});if(firstCorrect===3)emit('quiz-perfect',7,{firstCorrect});}}
  function lecture(key){const data=U.videos[key],a=E('a',tr(data.label),'lp-lecture-link');a.href=data.url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function feedback(){const box=E('div',null,'cb-feedback');box.append(E('h3',T('留言與 bug 回報','Comments and bug reports')),B(T('到本實驗留言','Comment on this experiment'),()=>{P.close();LabComments?.compose('');}),B(T('回報操作問題','Report a problem'),()=>{P.close();LabComments?.compose(T('電流天平問題回報\n發生步驟：\n預期結果：\n實際結果：\n裝置：','Current balance problem\nSteps:\nExpected:\nObserved:\nDevice:')+navigator.userAgent);}));return box;}
  function studyTaskText(node,text){
    LabCatalogText.render(node,mathSymbols(text));
    P.math(node);
    return node;
  }
  function tasks(){const all=LabMission.all()?.['current-balance']||[],done=LabMission._state?.done||{};return all.filter(m=>m.study).map(m=>{const div=E('div',null,'cb-study-task');div.append(studyTaskText(E('strong'),(done[m.id]?'✓ ':'☆ ')+tr([m.title.zh,m.title.en])+' · '+m.level),studyTaskText(E('p'),tr([m.desc.zh,m.desc.en])));return div;});}
  function render(){if(!flow||rendering)return;rendering=true;try{const state=flow.state,n=state.section,i=state.step,s=U.sections[n-1].steps[i-1];if(!state.active)return;
    const slide=![4,6].includes(n)&&!(n===3&&i===2)&&!(n===5&&i===2&&L.snapshot().view==='3d');document.documentElement.classList.toggle('cb-slide',slide);document.documentElement.classList.add('cb-study');document.documentElement.toggleAttribute('data-cb-hands',[4,6].includes(n));
    for(const id of ['cb-study-shell','cb-study-caption','cb-study-tools','cb-study-nav','cb-study-message'])$(id).hidden=false;
    $('cb-study-heading').textContent=n+'. '+tr(U.sections[n-1].title);$('cb-class').textContent=state.teaching?T('學生自學','Student mode'):T('老師上課','Class mode');$('cb-class').setAttribute('aria-pressed',String(state.teaching));
    $('cb-study-progress').replaceChildren(...U.sections.map((seg,k)=>{const b=B((k+1)+(run.sections[k]?'✓':''),()=>{if(section()===4)remember();flow.go(k+1,1);});b.setAttribute('aria-label',(k+1)+' '+tr(seg.title));if(k+1===n)b.setAttribute('aria-current','step');return b;}));
    rich($('cb-study-caption'),tr(s.cap));P.setContext({label:['觀念','Concept'],caption:tr(s.cap)});P.setStrip(tr(s.cap),'concept');
    const content=[rich(E('p',null,'cb-condition'),conditions()),rich(E('p'),tr(s.body))];if(s.question)content.push(question(s.question));if(s.video)content.push(lecture(s.video));
    if(n===3&&i===2)content.push(B(T('我看清楚右手方向了','I inspected the right hand'),()=>{if(L.snapshot().view==='3d'&&L.snapshot().hand){run.flags.hand=true;save();tell(T('拇指、四指、掌心對應 I、B、F；反向時再比較。','Compare thumb, fingers and palm with I, B and F while reversing.'));}else tell(T('請先開 3D 右手；不支援時用替代示意。','Open the 3D hand first, or use the fallback diagram if unsupported.'));}));
    if(n===5&&i===1&&run.flags.revealed)content.push(rich(E('p'),T('答案：I\u2082 = 2.00 A；兩電流一起反向，bc 仍向下。'.replaceAll('I\u2082','\\(I_2\\)'), 'Answers: \\(I_2=2.00\\) A; reversing both currents keeps bc pulled downward.')));
    if(n===5&&i===2)content.push(rich(E('p'),T('同尺寸模型反推 μ0 比值：','Inferred μ0 ratio for this apparatus: ')+(C.realFactor().ratio*100).toFixed(2)+' %'));
    if(n===8){const a=E('a',T('零位法：到等位線找電表零點 →','Null method: find a meter null in equipotentials →'),'cb-cross-link');a.href='equipotential.html?mode=learn&study=1&seg=4';content.push(a);}
    const panelTools=E('div',null,'cb-panel-tools');renderTools(n,i,panelTools);content.push(panelTools);const inline=E('div',null,'cb-inline-nav');const back=B(T('← 上一步','← Back'),()=>flow.prev()),inlineNext=B(T('下一步 →','Next →'),()=>flow.next());back.disabled=n===1&&i===1;inline.append(back,inlineNext);content.push(inline);
    content.push(rich(E('p',null,'cb-course-message'),message));P.setContent('concept',content);P.setContent('comments',[feedback()]);P.setContent('missions',tasks());
    renderVisual(n,i,s);renderTools(n,i);rich($('cb-study-message'),message);
    const prev=B(T('← 上一步','← Back'),()=>flow.prev()),next=B(i===U.sections[n-1].steps.length?(n===8?T('完成自學','Complete study'):T('完成本段 →','Complete section →')):T('下一步 →','Next →'),()=>flow.next());prev.dataset.coursePrev='';next.dataset.courseNext='';prev.disabled=n===1&&i===1;$('cb-study-nav').replaceChildren(prev,E('span',i+'/'+U.sections[n-1].steps.length),next);
    if(n===4&&i>=8)appendCalculation($('cb-study-tools'));
    if(n===6)appendExampleControls();
  }finally{rendering=false;}}
  function renderVisual(n,i,s){cancelAnimationFrame(diagramFrame);const box=$('cb-course-visual');box.replaceChildren();if(n===1&&i===1){const figure=E('figure',null,'cb-photo'),img=E('img');img.id='cb-kibble-photo';img.src='img/study/nist-kibble-balance.jpg';img.alt=T('NIST-4 Kibble 天平的實際裝置','Photograph of the NIST-4 Kibble balance');figure.append(img);const credit=E('a',T('照片：J. L. Lee／NIST · 公有領域','Photo: J. L. Lee / NIST · Public domain'));credit.href='https://www.nist.gov/image/nist4wattbalancejpg';credit.target='_blank';credit.rel='noopener noreferrer';const caption=E('figcaption');caption.append(credit);figure.append(caption);box.append(figure);}else{const cv=E('canvas',null,'cb-diagram');cv.width=1000;cv.height=380;cv.setAttribute('aria-label',T('條件圖：左側螺線管中央 b、c，支點 K，右側掛勾；d1、d2 各 14.0 cm，I、B、F 的方向依接線更新','Conditions: b and c at the solenoid center, pivot K, load on the right; equal 14.0 cm arms, with I, B and F following the wiring'));box.append(cv);const start=performance.now();
      // 只把新一步的力與場逐漸帶出，完成後停住；不另造運動或更改核心數據。
      const frame=now=>{if(!cv.isConnected)return;const progress=LabDraw.reducedMotion()?1:Math.min(1,(now-start)/280);drawDiagram(cv,n,i,progress);if(progress<1)diagramFrame=requestAnimationFrame(frame);};
      if(LabDraw.reducedMotion())drawDiagram(cv,n,i,1);else diagramFrame=requestAnimationFrame(frame);}}
  function drawDiagram(cv,n,i,reveal=1){const g=cv.getContext('2d'),w=cv.width,h=cv.height;D.backdrop(g,w,h);const p=L.snapshot(),y=180,bc=230,K=500,hook=770;
    D.block(g,100,110,300,150,D.mix(D.c.neg,D.c.surface,.78),{r:20,shadow:false});g.strokeStyle=D.alpha(D.c.neg,.65);g.lineWidth=6;for(let x=120;x<400;x+=21){g.beginPath();g.ellipse(x,185,12,70,0,0,Math.PI*2);g.stroke();}
    D.block(g,bc-8,y-8,hook-bc+15,16,D.c.probe,{r:5,shadow:false});g.fillStyle=D.c.muted;g.beginPath();g.moveTo(K,y+9);g.lineTo(K-28,y+95);g.lineTo(K+28,y+95);g.closePath();g.fill();
    const txt=(t,x,yy,color=D.c.text)=>D.pill(g,t,x,yy,color,'center','700 36px '+D.FONT);
    for(const [t,x,yy] of [['b',bc-8,y-30],['c',bc+8,y+38],['K',K,295],[T('掛勾','Hook'),hook,300]]){g.strokeStyle=D.c.accent;g.lineWidth=2;g.beginPath();g.arc(x,t==='K'?y:yy>y&&t!=='c'?y+8:y,10,0,Math.PI*2);g.stroke();txt(t,x,yy);}
    g.strokeStyle=D.c.muted;g.lineWidth=2;g.beginPath();g.moveTo(bc,330);g.lineTo(hook,330);g.stroke();for(const x of [bc,K,hook]){g.beginPath();g.moveTo(x,320);g.lineTo(x,340);g.stroke();}
    const sub=(base,index,x,yy)=>{StudyDraw.subscript(g,base,index,x,yy,32,D.c.text);};sub('d','1',280,369);sub('d','2',550,369);txt('= 14.0 cm',420,369);txt('= 14.0 cm',690,369);
    if(!(n===1&&i===2)&&!(n===3&&i===1)){g.strokeStyle=D.c.equi;g.lineWidth=5;g.beginPath();g.moveTo(hook-10,y+53);g.lineTo(hook-10,y+13);g.quadraticCurveTo(hook,y-1,hook+10,y+13);g.lineTo(hook+10,y+50);g.stroke();txt(n===2?'61 mg':'m',hook+85,y+30,D.c.equi);D.arrow(g,hook+35,y+15,hook+35,y+85,D.c.probe,5);txt('mg',hook+95,y+80,D.c.probe);}
    if((n===3&&i===4)||(n===7&&i===2)){
      // 同圖對照：直的軸向場是理想情況，管口上下外散的場線說明有限長側臂受力。
      g.strokeStyle=D.c.neg;g.lineWidth=4;g.beginPath();g.moveTo(330,135);g.quadraticCurveTo(410,130,475,85);g.moveTo(330,225);g.quadraticCurveTo(410,235,475,280);g.stroke();
      D.arrow(g,440,110,475,85,D.c.neg,4);D.arrow(g,440,255,475,280,D.c.neg,4);
      D.pill(g,T('管口磁場外散','Field spreads at mouth'),600,100,D.c.neg,'center','700 28px '+D.FONT);
    }
    if(p.realSol){for(const x of [bc+75,bc+130])D.arrow(g,x,y,x,y-44,D.c.pos,4);txt(T('側臂反向受力','Opposing side force'),bc+180,y-60,D.c.pos);}
    D.pill(g,T('原理示意，未依比例','Schematic, not to scale'),970,26,D.c.muted,'right','600 20px '+D.FONT);
    g.save();g.globalAlpha=reveal;if(n!==1||i===2){if(!(n===3&&i===1)){D.arrow(g,bc,180,bc,180+(p.s1*p.s2>0?70:-70),D.c.pos,5);txt('F',bc-45,185+(p.s1*p.s2>0?50:-50),D.c.pos);}D.arrow(g,135,72,p.s2>0?370:110,72,D.c.neg,4);txt('B',260,40,D.c.neg);StudyDraw.subscript(g,'I','1',480,60,36,D.c.equi);txt(p.s1>0?T('入紙面','into page'):T('出紙面','out of page'),625,60,D.c.equi);}
    g.restore();
    if(n===3&&i===1){StudyDraw.subscript(g,'I','2',700,110,36,D.c.equi);txt(p.knobs.I2.toFixed(2)+' A',855,110,D.c.equi);}
    if(n===7&&i===3)txt(T('地磁 0.035 mT；管內 12.57 mT','Earth 0.035 mT; inside 12.57 mT'),600,110,D.c.accent);
    if(n===1&&i===2){g.fillStyle=D.c.text;g.beginPath();g.ellipse(hook,y+50,12,28,-.35,0,Math.PI*2);g.fill();txt(T('一粒米 20–24 mg','One grain: 20–24 mg'),715,100,D.c.accent);}
  }
  const quick=(text,id)=>B(text,()=>{$(id).click();});
  function renderTools(n,i,target){const tools=target||$('cb-study-tools');tools.replaceChildren();
    if(n===1&&i===2)tools.append(B(T('放一粒米','Place one grain'),()=>{L.preset({weight:'rice',grains:1,hung:true,I1:1,I2:1.4});run.flags.rice=true;save();if(LabSound?.enabled())LabSound.noise({dur:.08,gain:.12,filter:3000});StudyFlow.cue('page');render();}));
    if(n===2&&!target)tools.append(B(T('看條件與選項','Conditions and choices'),()=>P.open('concept')));
    if(n===3&&i===2){tools.append(B(T('右手說明','Hand explanation'),()=>P.open('concept')),quick(T('反向 I1','Reverse I1'),'rev1'),quick(T('反向 I2','Reverse I2'),'rev2'),quick(T('重設視角','Reset view'),'resetCam'));if(/無法|could not|unavailable/i.test($('viewMsg').textContent))tools.append(B(T('看右手替代示意','Inspect fallback hand'),()=>{run.flags.handFallback=true;save();tell(T('此裝置未能開 3D；用圖中 I、B、F 核對右手方向。','3D is unavailable here. Check the illustrated I, B and F against your right hand.'));}));}
    if(n===4){tools.append(B(T('步驟／進度','Steps / progress'),()=>P.open('steps')));if(i===8)tools.append(B(T('看我的 B–I2 圖','My B–I2 graph'),()=>{$('g1').click();LabDeck.reveal($('g1'));run.flags.graph=true;guideUpdate('graph',{},true);render();}));}
    if(n===5&&i===1)tools.append(B(T('比對並揭曉預測','Compare and reveal'),compareAnswers));
    if(n===5&&i===2)tools.append(B(T('理想長螺線管','Ideal solenoid'),()=>compareModel(false)),B(T('真實有限長','Real solenoid'),()=>compareModel(true)),B(T('3D 看管口','Inspect mouth in 3D'),()=>{L.view('3d');setTimeout(render,300);}));
    if(n===6)tools.append(B(T('題目／逐行解答','Problem / solution'),()=>P.open('examples')));
    if(n===8&&i===2)tools.append(B(T('預覽分享圖卡','Preview my card'),()=>CurrentBalanceStudyCard.open()),B(T('重新自學','New attempt'),()=>{run=blank();save();flow.start(1,1);document.documentElement.classList.add('cb-study');}));
    if(!tools.children.length&&!target)tools.append(B(T('看觀念','Open Concept'),()=>P.open('concept')));
  }
  function appendCalculation(target){const label=rich(E('label'),T('\\(\\mu_0\\)（\\(\\times10^{-7}\\) T·m/A）','\\(\\mu_0\\) (\\(\\times10^{-7}\\) T·m/A)')),input=E('input');input.type='number';input.id='cb-mu-answer';input.step='.01';input.value=run.muAnswer||'';input.setAttribute('aria-label',T('我算出的 μ0','My calculated μ0'));input.oninput=()=>{run.muAnswer=input.value;save();};label.append(input);target.append(label,B(T('確認 μ0','Check μ0'),()=>{const a=analysis().p1,value=+input.value*1e-7;if(!(a.n>=5&&a.distinctM>=5&&a.I1spread<=.011)){tell(T('先完成固定 I1 的五筆、五種質量。','First record five different masses at fixed I1.'));return;}const answerErr=value/C.MU0-1,ok=Number.isFinite(answerErr)&&Math.abs(answerErr)<.05&&Math.abs(a.err)<.05;StudyFlow.cue(ok?'correct':'wrong');if(ok){run.flags.mu=true;emit('mu-calculated',4,{...a,answerErr});guideUpdate('mu',{},true);}tell(ok?T('正確！斜率除以匝數密度，得到真空磁導率。','Correct! Divide slope by turn density to obtain vacuum permeability.'):T('檢查單位與斜率：先把 mT 換成 T，再除以 4000。','Check units and slope: convert mT to T, then divide by 4000.'));render();}));}
  function compareAnswers(){const a=analysis(run.project?.rows||[]).p1;if(!(a.n>=5)||!run.submitted.p1||!run.submitted.p2){tell(T('先做五筆實驗，並送出兩題預測。','First measure five rows and submit both predictions.'));return;}run.flags.compared=run.flags.revealed=true;emit('answer-compared',5,{n:a.n,mu0:a.mu0,submitted:2,revealed:true});if(run.first.p1===0&&run.first.p2===0)emit('predictions-perfect',2,{firstCorrect:2,revealed:true});render();}
  function compareModel(real){L.preset({realSol:real});if(real)compareReal=true;else compareIdeal=true;if(compareReal&&compareIdeal){run.flags.models=true;emit('models-compared',5,{idealSeen:true,realSeen:true,ratio:C.realFactor().ratio});}render();}
  function applyExample(n){exampleApplying=true;currentExample=n;LabExamples.apply('current-balance',n,true);exampleApplying=false;}
  P.mount({tabs:['concept','steps','examples','missions','comments']});
  window.LabExampleAdapters=window.LabExampleAdapters||{};
  window.LabExampleAdapters['current-balance']={apply(ex){if(section()===4)remember();currentExample=ex.n;linear=false;L.view('2d');L.preset({...base,...ex.state,show:{hand:false}},ex.n===2?S.inverseRows():ex.n===3?S.offsetRows():[]);},solution(){L.redraw();}};
  function appendExampleControls(){const pane=$('lp-pane-examples');if(!pane||!currentExample)return;pane.querySelector('.cb-example-controls')?.remove();const box=E('section',null,'cb-example-controls');
    [1,2,3].forEach(n=>box.append(B(T('範例 ','Example ')+n,()=>{if(isStudy())flow.go(6,n);else applyExample(n);})));const n=currentExample;
    if(n===1)box.append(B(T('驗算我的平衡記錄','Verify my balanced record'),()=>{const rows=ownRows(),r=rows.at(-1),correct=C.balanceMass(2,3,false)/C.APP.lambda*100;if(r&&Math.abs(r.I1-2)<.02&&Math.abs(r.I2-3)<.02&&Math.abs(r.len-correct)<.1){run.examples[1]=true;emit('example-one-checked',6,{example:1,ownRecord:true,balanced:true,lengthError:Math.abs(r.len-correct)});tell(T('2.3 cm 的記錄與理論相符。','The 2.3 cm record matches the calculation.'));}else tell(T('先把 I1=2、I2=3，線長改成 2.3 cm，等停穩後記錄。','Set I1=2, I2=3 and length 2.3 cm, wait and record first.'));save();appendExampleControls();}));
    if(n===2){box.append(B(linear?T('看雙曲線','Show hyperbola'):T('改畫 I1 對 1/I2','Plot I1 vs 1/I2'),()=>{linear=!linear;appendExampleControls();}));const cv=E('canvas',null,'cb-example-plot');cv.width=720;cv.height=350;box.append(cv);setTimeout(()=>drawExamplePlot(cv),0);const fit=S.inverseFit(S.inverseRows());const label=rich(E('label'),T('由斜率算 \\(\\mu_0\\)（\\(\\times10^{-7}\\)）：','\\(\\mu_0\\) from slope (\\(\\times10^{-7}\\)):')),input=E('input');input.type='number';input.step='.01';input.id='cb-example-mu';label.append(input);box.append(label,B(T('確認直線與 μ0','Check line and μ0'),()=>{const err=+input.value*1e-7/C.MU0-1;if(linear&&Number.isFinite(err)&&Math.abs(err)<.05){run.examples[2]=true;emit('example-two-checked',6,{example:2,linear:true,err});tell(T('正確：直線斜率 '+fit.slope.toFixed(3)+' \\(\\mathrm{A}^2\\)，換回 μ0。','Correct: slope '+fit.slope.toFixed(3)+' \\(\\mathrm{A}^2\\) gives μ0.'));}else tell(T('先改成直線圖，讀斜率並換算；別把 \\(\\mathrm{A}^2\\) 當成 μ0 的單位。','First switch to the line plot and convert its slope; \\(\\mathrm{A}^2\\) is not a unit of μ0.'));save();}));}
    if(n===3){const select=E('select');select.id='cb-intercept-cause';[['',T('截距來自…','Intercept caused by…')],['zero',T('未歸零的固定力矩','A constant unzeroed torque')],['n',T('匝數密度改變','Changed turn density')],['none',T('水平表示沒有力','Level means no forces')]].forEach(([v,t])=>{const o=E('option',t);o.value=v;select.append(o);});box.append(select,B(T('確認截距原因','Check intercept cause'),()=>{const a=analysis(S.offsetRows()).p1;if(select.value==='zero'){run.examples[3]=true;emit('example-three-checked',6,{example:3,cause:'zero',intercept:a.line.intercept});tell(T('對，固定零偏只移動截距；斜率仍是 μ0n。','Correct: a fixed zero offset shifts the intercept; the slope remains μ0n.'));}else tell(T('先想固定零偏會改變每一筆的哪個量。','Which measured quantity receives the same offset in every row?'));save();}));}
    box.append(rich(E('p',null,'cb-course-message'),message));if(run.examples[n])box.append(E('p',T('✓ 這題已驗算','✓ Example verified')));pane.append(box);
  }
  function drawExamplePlot(cv){if(!cv.isConnected)return;const g=cv.getContext('2d'),rows=S.inverseRows(),w=cv.width,h=cv.height;D.backdrop(g,w,h);const x0=80,y0=h-65,X=v=>x0+v/(linear?1:5)*(w-120),Y=v=>y0-v/4*(h-110);g.strokeStyle=D.c.muted;g.lineWidth=2;g.beginPath();g.moveTo(x0,25);g.lineTo(x0,y0);g.lineTo(w-25,y0);g.stroke();for(let v=1;v<=4;v++){D.haloText(g,String(v),x0-15,Y(v),D.c.text,'right','middle','28px system-ui');}const k=S.inverseFit(rows).slope;g.strokeStyle=D.c.accent;g.lineWidth=3;g.beginPath();for(let j=0;j<=100;j++){const x=linear?.1+j*.8/100:1+j*4/100,y=linear?k*x:k/x;j?g.lineTo(X(x),Y(y)):g.moveTo(X(x),Y(y));}g.stroke();for(const r of rows){g.fillStyle=D.c.pos;g.beginPath();g.arc(X(linear?1/r.I2:r.I2),Y(r.I1),6,0,Math.PI*2);g.fill();}g.fillStyle=D.c.text;g.textAlign='left';g.textBaseline='alphabetic';g.font='700 32px system-ui';if(linear)g.fillText('1/',w-210,h-25);StudyDraw.subscript(g,'I','2',linear?w-175:w-155,h-25,32,D.c.text);g.fillText(linear?'(1/A)':'(A)',w-120,h-25);StudyDraw.subscript(g,'I','1',100,32,32,D.c.text);g.fillText('(A)',145,32);if(linear){const title=T('斜率 ','Slope ')+k.toFixed(3)+' A';g.fillStyle=D.c.accent;g.font='700 28px system-ui';g.fillText(title,320,45);const size=g.measureText(title).width;g.font='700 22px system-ui';g.fillText('2',321+size,34);}}
  // 使用器材當下的傾角投影，不把點位固定在水平時的位置；字母沿用器材標籤。
  function overlay(g,G){if(!isStudy()&&!currentExample)return;if(isStudy()&&![3,4,6].includes(section()))return;for(const [name,q]of G.points){g.save();g.strokeStyle=D.c.accent;g.lineWidth=1.5;g.beginPath();g.arc(q[0],q[1],7,0,Math.PI*2);g.moveTo(q[0]-10,q[1]);g.lineTo(q[0]+10,q[1]);g.moveTo(q[0],q[1]-10);g.lineTo(q[0],q[1]+10);g.stroke();g.restore();}}
  addEventListener('cb:action',e=>{const {type,data,userAction}=e.detail;if(!flow||isTeacher())return;
    if(isStudy()&&section()===4){if(type==='record'&&userAction){const a=analysis().p1;remember();if(!run.flags.first){run.flags.first=true;emit('first-recorded',4,{ownN:ownRows().length,recorded:true,rest:true,level:true,given:false});}if(a.n>=5&&a.distinctM>=5&&a.I1spread<=.011)emit('five-recorded',4,{...a,given:false});}guideUpdate(type,data,userAction);}
    if(type==='view'&&isStudy()&&section()===3&&flow.state.step===2&&data.view==='3d'&&data.hand){run.flags.hand=true;save();}
  });
  addEventListener('lab:examplechange',e=>{if(e.detail.slug!=='current-balance')return;document.documentElement.classList.add('cb-example');if(isStudy()&&section()===6&&!exampleApplying&&flow.state.step!==e.detail.n)flow.go(6,e.detail.n);appendExampleControls();});addEventListener('lab:solutionstep',()=>appendExampleControls());
  addEventListener('lab:themechange',()=>{if(isStudy())render();else if(currentExample)appendExampleControls();});
  addEventListener('lab:stepcomplete',e=>{if(!isStudy()||section()!==4||isTeacher())return;const index=e.detail.index;if(index<8&&flow.state.step===index+1)setTimeout(()=>{if(section()===4&&flow.state.step===index+1)flow.go(4,index+2);},850);});
  document.addEventListener('click',e=>{if(e.isTrusted&&isStudy()&&section()===4&&e.target.closest('#lp-pane-steps .lp-steps button,#lp-pane-steps .lp-step-nav button'))setTimeout(()=>{if(section()===4&&flow.state.step!==LabSteps.index+1)flow.go(4,LabSteps.index+1);},0);});
  function boot(){P.mount({tabs:['concept','steps','examples','missions','comments']});P.setContent('comments',[feedback()]);
    flow=StudyFlow.embed({id:'current-balance',sections:U.sections,enter,step,canAdvance,finish,render,save,onClass(on){if(on){teachingCopy=JSON.parse(JSON.stringify(run));teachingRows=JSON.parse(JSON.stringify(L.snapshot().rows));}else if(teachingCopy){run=teachingCopy;teachingCopy=null;L.preset({},teachingRows||[]);teachingRows=null;}},start(){document.documentElement.classList.add('cb-study');if(!LabMission._state.on)document.querySelector('.ms-toggle')?.click();document.querySelector('.ms-dock-close')?.click();scrollTo(0,0);render();if(([1,2,3,5,7,8].includes(section())||innerWidth>=1240)&&!(section()===3&&flow.state.step===2))P.open('concept');},close(){document.documentElement.classList.remove('cb-study','cb-slide');}});
    LabMission.on('complete',()=>{if(isStudy()){P.setContent('missions',tasks());if(section()===8)finishUnit();}});
    $('cb-panel-toggle').onclick=()=>{if(P.state==='collapsed')P.open('concept');else P.close();};
    $('cb-class').onclick=()=>flow.classMode(!flow.state.teaching);
    const url=new URL(location.href),params=url.searchParams,learn=params.get('mode')==='learn'||params.get('study')==='1'&&params.get('mode')!=='lab';
    if(learn){document.documentElement.dataset.labMode='learn';flow.start(+params.get('seg')||1,+params.get('step')||1);if(params.get('class')==='1')flow.classMode(true);}
    else {if(params.get('mode')==='lab'||params.has('ex'))document.documentElement.dataset.labMode='lab';P.setContent('concept',[rich(E('p'),T('等臂天平用重量秤磁力：\\(mg=I_1L\\mu_0nI_2\\)。先歸零，再量五種質量。','Equal arms weigh magnetic force: \\(mg=I_1L\\mu_0nI_2\\). Zero first, then measure five masses.'))]);P.setContent('missions',tasks());}
    if(params.has('ex')){document.documentElement.classList.add('cb-example');appendExampleControls();}else if(!learn)P.close();
  }
  window.CurrentBalanceStudy={get active(){return isStudy();},get teaching(){return isTeacher();},get state(){return flow?.state;},get flow(){return flow;},get run(){return run;},overlay,notify:tell,shareProject:()=>run.project,exported(method){if(!isStudy()||isTeacher())return;const a=analysis(run.project?.rows||[]).p1;run.flags.card=true;emit('card-exported',8,{n:a.n,distinctM:a.distinctM,exported:true,method});render();},render};
  addEventListener('lab:missioncomplete',()=>{if(isStudy()){P.setContent('missions',tasks());if(section()===8)finishUnit();}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
