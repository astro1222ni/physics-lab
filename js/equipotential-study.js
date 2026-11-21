/* 同一張實驗桌中的八段自學；課程不建立第二份物理狀態。 */
(function () {
  'use strict';
  const U=EquipotentialStudyData,S=EquipotentialStudyCore,C=EquipotentialCore,L=EquipotentialLab,P=LabPanel,D=LabDraw;
  const T=(a,b)=>LabSettings.t(a,b),tr=P.tr,E=P.element,B=P.button,rich=P.rich,$=id=>document.getElementById(id);
  const KEY='eqp-study:run:v1';
  const POSITION_KEY='lab-study-pos:equipotential';
  const empty=()=>({answers:{},first:{},submitted:{},quizFirst:{},sections:Array(8).fill(false),cards:[],flags:{},project:null,exampleChecks:{}});
  let run=empty();try{const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s&&Array.isArray(s.sections)&&s.sections.length===8)run=Object.assign(empty(),s);}catch(e){}
  let message='',classRun,flow,currentExample=0,settingExample=false,reference=0,lastFrame=0,elapsed=0,playing=false,startedAt=0,enteredAt=0,raf=0,header,caption,tools,nav,menu;
  const image=new Image();image.src='img/study/usgs-contours.jpg';image.onload=()=>L.redraw();
  const save=()=>{if(flow?.state.teaching)return;try{localStorage.setItem(KEY,JSON.stringify(run));}catch(e){}};
  const query=new URLSearchParams(location.search);
  const classEntry=query.get('class')==='1';
  function validPosition(n,i){
    return Number.isInteger(n)&&Number.isInteger(i)&&i>=1&&i<=U.sections[n-1]?.steps.length;
  }
  function readPosition(){
    try{
      const pos=JSON.parse(localStorage.getItem(POSITION_KEY));
      if(pos&&validPosition(pos.section,pos.step))return pos;
    }catch(e){/* 儲存空間不可用或格式已失效，照常開啟課程。 */}
    return null;
  }
  function savePosition(n,i){
    if(!isStudy()||classEntry||flow.state.teaching)return;
    try{localStorage.setItem(POSITION_KEY,JSON.stringify({section:n,step:i}));}
    catch(e){/* 瀏覽器停用儲存時，仍可在本頁自學。 */}
  }
  function beginStudy(){
    if(own(L.snapshot())>=6)project();
    const pos=readPosition();
    if(!pos){flow.start(1,1);return;}
    const dialog=$('eq-resume-study');
    if(dialog.open)return;
    $('eq-resume-step').textContent=T(
      '接續上次（第 '+pos.section+' 段第 '+pos.step+' 步）',
      'Resume (Section '+pos.section+', Step '+pos.step+')'
    );
    dialog.returnValue='resume';
    dialog.addEventListener('close',()=>{
      if(dialog.returnValue==='restart')flow.start(1,1);
      else flow.start(pos.section,pos.step);
    },{once:true});
    dialog.showModal();
  }
  const stage=()=>$('stage'),isStudy=()=>!!flow?.state.active,section=()=>flow?.state.section||0;
  const own=s=>s.records.filter(r=>!r.given).length;
  function tell(text){message=text;document.querySelectorAll('#eq-study-message,#lp-pane-'+P.tab+' .eq-course-message').forEach(p=>rich(p,text));}
  function emit(act,seg,data){flow.emit(act,seg,data);save();}
  function project(){const s=L.snapshot();if(own(s)>=6)run.project={config:{type:s.type,d:s.d,a:s.a,L:s.L,V0:s.V0,medium:s.medium,ac:s.ac,noise:s.noise,meter:'dmm',power:true,clip:s.clip,n1:s.n1,n2:s.n2,drawLines:true,drawField:s.drawField,showTheory:false},records:s.records};save();}
  function base(extra,records){L.preset(Object.assign({},S.base,{meter:'dmm',power:true,clip:false,n1:{x:11.5,y:5.5},n2:{x:18.5,y:13.5},drawLines:false,drawField:false,showTheory:false,showHeat:false,showStream:false},extra||{}),records);L.view('2d');}
  function restoreProject(){if(run.project) { L.preset(run.project.config,run.project.records);L.view('2d'); }else base({},[]);}
  function enter(n,reset){enteredAt=performance.now();playing=false;elapsed=0;
    if(n===4){const ownRecords=L.snapshot().records.filter(r=>!r.given);base({power:false},reset?[]:ownRecords);reference=0;defineGuide();}
    else if(n===5||n===8){restoreProject();}
    else if(n===6){if(own(L.snapshot())>=6)project();currentExample=0;}
    else {base(n===3?{n1:{x:15,y:3},n2:{x:15,y:13}}:{},[]);}
    if(n!==4){LabSteps.setActive(false);window.LabStepGuide?.hide();}L.redraw();
  }
  function step(n,i){if(n!==4)window.LabStepGuide?.hide();message='';document.querySelectorAll('#eq-study-message,.eq-course-message').forEach(p=>p.replaceChildren());enteredAt=performance.now();
    // 第 4 段的共用操作指引另有索引，接續及直接連結都要同步選取該步。
    if(n===4&&LabSteps.index!==i-1)document.querySelectorAll('#lp-pane-steps .lp-steps > li > button:first-child')[i-1]?.click();
    savePosition(n,i);
    if(n===1&&i===2)L.view('rig');else if(n===1)L.view('2d');
    if(n===3){L.preset({showTheory:i>=2,showStream:i===4});}
    if(n===5&&i===3){L.preset({medium:'water',noise:true,ac:false,meter:'dmm',clip:true,n2:{x:15,y:10},showTheory:true});}
    if(n===7){L.preset({V0:i===1?12:6,medium:i===3?'water':'paper',noise:false,ac:false,n1:{x:15,y:3},n2:{x:15,y:13},showTheory:true,drawLines:false,drawField:false},[]);}
    if([2,3,5,7,8].includes(n)){P.open('concept');}
    if(n===6&&!settingExample&&currentExample!==i)applyExample(i);if(n===6)P.open('examples');
    L.redraw();
  }
  function canAdvance(n,i){
    if(n===2&&!run.submitted['p'+i]){tell(T('先送出這題預測，答案留到對答案時揭曉。','Submit this prediction first; the answer will be revealed later.'));return false;}
    if(n===3){if(performance.now()-enteredAt<300)return false;run.cards[i-1]=true;}
    if(n===4&&!LabSteps.done[i-1]){tell(T('先把目前這一步做完。可開「步驟」看做法與原因。','Finish this step first. Open Steps for the instructions and reason.'));return false;}
    if(n===7&&!Number.isInteger(run.answers['q'+i])){tell(T('先選一個答案，再繼續。','Choose an answer before continuing.'));return false;}
    return true;
  }
  function finish(n){let ok=true;
    if(n===1)ok=!!run.flags.intro;
    if(n===2)ok=!!run.submitted.p1&&!!run.submitted.p2;
    if(n===3){ok=run.cards.filter(Boolean).length===5;if(ok)emit('concepts-viewed',3,{cardsSeen:5});}
    if(n===4){ok=LabSteps.done.length===7&&LabSteps.done.every(Boolean);if(ok)project();}
    if(n===5)ok=!!run.flags.theory&&!!run.flags.media;
    if(n===6)ok=[1,2,3].every(k=>run.exampleChecks[k]?.done);
    if(n===7)ok=['q1','q2','q3'].every(k=>run.answers[k]===U.questions[k].correct)&&!!run.flags.quiz;
    if(n===8)ok=!!run.flags.card;
    if(!ok){tell(T('這段還有動手條件沒完成；可從上方八段進度跳看其他段，完成紀錄會保留。','There is still an activity to finish. You can use the eight-section navigation to explore another section; your records are kept.'));return false;}
    if(!flow.state.teaching)run.sections[n-1]=true;save();if(n===8)finishUnit();return true;
  }
  function finishUnit(){const done=LabMission._state?.done||{},awarded=Array.from({length:16},(_,i)=>i+16).filter(n=>done['equipotential-'+n]);if(run.sections.every(Boolean)&&awarded.length===16)emit('unit-completed',8,{sections:run.sections.slice(),awarded});}
  function guideSnapshot(){const s=L.snapshot();return Object.assign(s,{ownPoints:own(s),good:s.paths.filter(g=>g.ownN>=6&&g.vRange<.06).length});}
  function defineGuide(){LabSteps.setActive(true);const t=U.sections[3].steps;
    LabSteps.define(t.map((s,i)=>Object.assign({},L.guides(true)[i],{t:s.cap,detail:s.body,hold:i<2?.25:0,check:x=>!!x.n1&&Array.isArray(x.records)&&[
      x.power,Math.hypot(x.n1.x-15,x.n1.y-3)<.4&&x.power,
      x.records.some(r=>!r.given&&Math.abs(r.reading)<=.02+1e-9),
      x.good>=1&&x.drawLines,x.good>=3,x.drawField&&x.fields.length>0,
      x.estimate&&Number.isFinite(x.estimate.err)&&Math.abs(x.estimate.err)<.1
    ][i]})),{key:'equipotential-study',title:['跟著量，畫出自己的電場','Measure your own field']});
  }
  function conditions(){const s=L.snapshot();if(section()===7&&flow.state.step===3)return T('水平水槽 · 左正右負 · 穩定 6 V；假設兩側深 1、2 cm（圖仍為等深示意）','Level tray · left +, right − · steady 6 V; assume depths of 1 and 2 cm (the view stays uniform-depth).');return s.medium==='water'?T('水槽水平 · 0.1 % 食鹽水 · 深 1.0 cm · 左正右負 · ','Level tray · 0.1% salt water · depth 1.0 cm · left +, right − · ')+s.V0.toFixed(1)+' V · '+(s.power?T('已穩定通電','steady supply'):T('等待接通電源','switch on next')):T('導電紙水平 · 左正右負 · ','Level conducting paper · left +, right − · ')+s.V0.toFixed(1)+' V · '+(s.power?T('已穩定通電','steady supply'):T('等待接通電源','switch on next'));}
  function lecture(key){const v=U.videos[key];if(!v)return null;const a=E('a',T('▶ 看倪老師上課講這段（〔9〕','▶ Watch Dr. Ni teach this (in Chinese, ')+v.time+T('）',')'),'lp-lecture-link');a.href=v.url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function courseNav(){const list=E('div',null,'eq-unit-menu');U.sections.forEach((s,i)=>{const b=B(String(i+1),()=>{if(section()===4)project();flow.go(i+1,1);});b.append(E('span',' '+tr(s.title),'eq-unit-name'));b.setAttribute('aria-label',(i+1)+' '+tr(s.title)+(run.sections[i]?T('，已完成',', complete'):''));if(i+1===section())b.setAttribute('aria-current','step');list.append(b);});return list;}
  const classAnswers={};
  function question(id){const q=U.questions[id],predict=id[0]==='p',teaching=flow.state.teaching,answers=teaching?classAnswers:run.answers,box=E('section',null,'eq-question'),opts=E('div',null,'study-options');
    box.append(rich(E('h3',null,'sr-only'),tr(q.q)));q.options.forEach((p,i)=>{const b=B('',()=>{if(!teaching&&predict&&run.submitted[id])return;answers[id]=i;if(!teaching&&!predict){if(run.quizFirst[id]==null)run.quizFirst[id]=i;StudyFlow.cue(i===q.correct?'correct':'wrong');}save();renderQuestion();});b.dataset.answer=id+'-'+i;b.setAttribute('aria-pressed',String(answers[id]===i));if(!teaching&&predict&&run.submitted[id])b.disabled=true;b.append(E('span','ABCD'[i],'study-letter'));
      if(q.diagrams)b.append(pattern(i));b.append(rich(E('span'),tr(p)));if(teaching?flow.state.reveal&&i===q.correct:!predict&&answers[id]===i)b.classList.add(i===q.correct?'correct':'wrong');opts.append(b);});box.append(opts);
    if(predict&&!teaching){const send=B(run.submitted[id]?T('已送出，稍後揭曉','Submitted; reveal later'):T('送出這題預測','Submit prediction'),()=>{if(!Number.isInteger(run.answers[id]))return;if(run.first[id]==null)run.first[id]=run.answers[id];run.submitted[id]=true;StudyFlow.cue('page');if(run.submitted.p1&&run.submitted.p2)emit('predictions-submitted',2,{submitted:2});save();renderQuestion();});send.disabled=!Number.isInteger(run.answers[id])||!!run.submitted[id];box.append(send);}
    else if(!predict&&(teaching?flow.state.reveal:Number.isInteger(answers[id]))){const answer=teaching?q.correct:answers[id],f=E('div',null,'study-feedback '+(answer===q.correct?'is-correct':'is-wrong'));f.append(rich(E('p'),tr(q.feedback[answer])));box.append(f);}
    if(flow.state.teaching)box.append(B(flow.state.reveal?T('藏答案','Hide answer'):T('公布答案','Reveal answer'),()=>flow.reveal()));
    return box;
  }
  function pattern(index){const cv=E('canvas',null,'eq-pattern');cv.width=90;cv.height=54;cv.setAttribute('aria-hidden','true');const g=cv.getContext('2d');g.strokeStyle=D.c.muted;g.lineWidth=1;g.strokeRect(1,1,88,52);g.strokeStyle=D.c.accent;g.lineWidth=2;[0,1].forEach(k=>{g.beginPath();if(index===3){g.moveTo(35+k*22,2);g.lineTo(35+k*22,52);}else if(index===0||index===2&&k===0)g.ellipse(58,27,9+k*9,13+k*6,0,0,Math.PI*2);else{g.moveTo(62+k*12,1);g.bezierCurveTo(24,14,24,40,62+k*12,53);}g.stroke();});return cv;}
  function renderQuestion(){render();}
  function quick(label,id){return B(label,()=>{$(id).click();L.redraw();});}
  function renderTools(target){const tools=target||$('eq-study-tools');tools.replaceChildren();const s=L.snapshot();
    if(section()===1){tools.append(B(playing?T('播放中…','Playing…'):T('▶ 播放溪流','▶ Play the stream'),()=>{playing=true;elapsed=0;startedAt=performance.now();StudyFlow.cue('page');animate();}),B(T('3D 器材','3D apparatus'),()=>L.view('rig')),B(T('2D／地形圖','2D / map'),()=>L.view('2d')));return;}
    if(section()===4){tools.append(quick(s.power?T('關電源','Supply off'):T('接通電源','Supply on'),'power'),rich(B('',()=>document.querySelector('[data-sel=n1]').click()),'\\(N_1\\)'),rich(B('',()=>document.querySelector('[data-sel=n2]').click()),'\\(N_2\\)'),quick(T('記錄','Record'),'rec'));
      if(flow.state.step>=4){tools.append(quick(T('連等位線','Join lines'),'drawLines'),B(T('換參考點','Next reference'),()=>{const refs=[[15,3],[20.25,1],[9.75,1]];reference=(reference+1)%3;L.move('n1',...refs[reference]);tell(T('黑探針參考位置：','Black reference: ')+refs[reference].join(', ')+' cm');}),quick(T('畫電力線','Field lines'),'drawField'),quick(T('估算電場','Estimate E'),'est'));}}
    else if(section()===5){if(flow.state.step===1)tools.append(B(T('疊上計算線','Overlay computed curves'),compareTheory),B(T('揭曉預測','Reveal predictions'),revealPredictions));else if(flow.state.step===2)tools.append(B(T('換成水槽','Switch to water'),compareWater));else tools.append(B(T('直流極化','DC polarization'),()=>L.preset({medium:'water',ac:false,noise:true,meter:'dmm',clip:true})),B(T('交流＋耳機','AC + headphones'),()=>{L.preset({medium:'water',ac:true,meter:'phone',noise:false,clip:false,n1:run.project?.config.n1||{x:9.75,y:1}});tell(T('先開音效，再拖紅探針，找聲音最小的位置。','Enable sound, then drag the red probe to find the quietest point.'));}),quick(T('切換音效','Toggle sound'),'soundBtn'));}

    else if(section()===6)tools.append(B(T('開範例與解答','Examples and solutions'),()=>LabPanel.open('examples')));
    else if(section()===8)tools.append(B(T('分享我的電場圖','Share my field map'),()=>EquipotentialStudyCard.open()),B(T('重新自學','Start a new attempt'),restart));
    else tools.append(B(T('打開觀念','Open Concept'),()=>LabPanel.open('concept')),B(T('步驟／進度','Steps / progress'),()=>LabPanel.open('steps')));
  }
  function compareTheory(){const s=L.snapshot();if(own(s)<6){tell(T('先在第 4 段描至少六個自己的點。','First record six of your own points in Section 4.'));return;}L.preset({showTheory:true,drawLines:true});run.flags.theory=true;emit('theory-compared',5,{ownPoints:own(s),showTheory:true,drawLines:true});project();render();}
  function compareWater(){restoreProject();const a=L.snapshot();if(own(a)<6){tell(T('先完成自己的實測線，再換材質比較。','Trace your own line before comparing media.'));return;}L.preset({medium:'paper',ac:false,noise:false,showTheory:true,drawLines:true},a.records);const paper=L.snapshot();L.preset({medium:'water',ac:false,noise:false,showTheory:true,drawLines:true},paper.records);const water=L.snapshot();const match=C.compareEquipotentials(paper.paths.map(g=>({V:g.V,pts:g.pts,path:g.path})),water.paths.map(g=>({V:g.V,pts:g.pts,path:g.path})));if(match){run.flags.media=true;emit('media-compared',5,{paperSeen:true,waterSeen:true,sameConfig:true,points:own(paper),meanDistance:match.meanDistance});}project();render();}
  function revealPredictions(){if(!run.submitted.p1||!run.submitted.p2){tell(T('第 2 段還沒送出兩題預測。','Submit both predictions in Section 2 first.'));return;}run.flags.revealed=true;if(run.first.p1===0&&run.first.p2===2)emit('predictions-perfect',2,{firstCorrect:2,revealed:true});render();}
  function restart(){run=empty();save();LabSteps.setActive(false);flow.start(1,1);tell(T('開始新的一次自學；已領取的星星保留。','A new attempt has started; earned stars are kept.'));}
  function navButtons(){const b=E('div',null,'eq-course-nav');b.append(B(T('◀ 上一步','◀ Back'),()=>flow.prev()),B(T('回到這段設定','Reset this section'),()=>flow.reset()),B(section()===8&&flow.state.step===2?T('完成本單元','Finish unit'):T('下一步 ▶','Next ▶'),()=>flow.next()));return b;}
  function renderMissions(){const list=E('div',null,'eq-study-missions'),defs=LabMission.all().equipotential||[],done=LabMission._state?.done||{};const stars=defs.filter(m=>m.study&&done[m.id]).reduce((n,m)=>n+(done[m.id].stars||m.level),0);list.append(E('h3',T('自學任務：','Self-study missions: ')+stars+' / 78 ★'));if(!LabMission._state?.user)list.append(E('p',T('不登入也能自學。要保存星星，請先回實驗頁頁首登入，再回來繼續。','You can study without signing in. To save stars, return to the experiment header, sign in and continue.')),B(T('回頁首登入','Return to sign in'),()=>{flow.close();scrollTo({top:0,behavior:'instant'});}));defs.filter(m=>m.study).forEach(m=>{const row=E('p',null,'eq-study-task');row.append(LabCatalogText.render(E('strong'),(done[m.id]?'✓ ':'☆ ')+tr([m.title.zh,m.title.en])+' · '+m.level+' ★'));list.append(row);});LabPanel.setContent('missions',list);LabPanel.setStrip(stars+' / 78 ★ '+T('自學星星','study stars'),'missions');}
  function render(){if(!flow)return;const st=flow.state;if(!st.active)return;const sec=U.sections[st.section-1],s=sec.steps[st.step-1];
    document.documentElement.toggleAttribute('data-eq-guide',st.section===4);$('eq-study-heading').textContent=st.section+'/8 '+tr(sec.title)+' · '+st.step+'/'+sec.steps.length;$('eq-class').setAttribute('aria-pressed',String(st.teaching));menu.replaceChildren(courseNav());rich(caption,tr(s.cap));rich($('eq-condition'),conditions());nav.replaceChildren(navButtons());renderTools();
    const nodes=[E('p',conditions(),'eq-panel-condition')];if(s.question)nodes.push(question(s.question));else nodes.push(rich(E('p'),tr(s.body)));
    if(s.video)nodes.push(lecture(s.video));
    if(st.section===1){const a=E('a',T('地形圖：USGS · 公有領域','Map: USGS · Public Domain'),'eq-map-credit');a.href='https://www.usgs.gov/media/images/contour-lines-and-shaded-relief-a-us-topo-map';a.target='_blank';a.rel='noopener';nodes.push(a);}
    if(st.section===5&&st.step===1&&run.flags.revealed)nodes.push(rich(E('p',null,'study-feedback'),T('預測揭曉：3 V 是中垂線；1 V 封閉，2 V 碰紙邊。電場線不是任意電荷的軌跡，等位線也不會相交。','Predictions revealed: 3 V is the perpendicular bisector; 1 V closes and 2 V reaches the boundary. Field lines are not arbitrary particle trajectories, and equipotentials cannot cross.')));
    if(st.section===7&&st.step===3&&!st.teaching){nodes.push(B(T('檢查三題','Check all three'),()=>{const correct=['q1','q2','q3'].filter(k=>run.answers[k]===U.questions[k].correct).length;if(correct===3){run.flags.quiz=true;emit('quiz-completed',7,{correct});}else tell(T('還有題目要再想一想；各題可回去重答。','Review the remaining questions; you may retry each one.'));render();}));if(run.flags.quiz&&['q1','q2','q3'].every(k=>run.quizFirst[k]===U.questions[k].correct))nodes.push(B(T('收下第一次全對紀錄','Claim first-try success'),()=>{emit('quiz-perfect',7,{correct:3,firstCorrect:3});tell(T('本次三題第一次作答都正確。','All three were correct on the first attempt in this run.'));}));}
    if(st.section===8){nodes.push(E('p',T('河水垂直等高線流，電場垂直等位線跑。','Water crosses elevation contours; the field crosses equipotentials.')),B(T('預覽我的圖卡','Preview my card'),()=>EquipotentialStudyCard.open()));const a=E('a',T('下一步：電場與電力線 →','Next: electric fields and field lines →'),'lp-lecture-link');a.href='electric-field.html';nodes.push(a);}
    if(st.section===1||st.section===4||st.section===5||st.section===8){const action=E('div',null,'eq-panel-tools');renderTools(action);nodes.push(action);}nodes.push(navButtons(),rich(E('p',null,'eq-course-message'),message));LabPanel.setContent('concept',nodes);LabPanel.setContext({label:['觀念','Concept'],caption:tr(s.cap)});LabPanel.setStrip(st.section+'-'+st.step+' '+tr(s.cap).replace(/\[\[|\]\]/g,''),'concept');
    if(st.section!==4){LabPanel.setContent('steps',[E('h3',T('八段自學進度','Eight-section progress')),courseNav(),E('p',conditions())]);LabPanel.setStrip(st.section+'/8 '+tr(sec.title),'steps');}
    renderMissions();if(st.section===6)appendExampleControls();L.redraw();save();
  }
  function applyExample(n){settingExample=true;try{LabExamples.apply('equipotential',+n,false);}finally{settingExample=false;}}
  function exampleControls(){const ex=LabExamples.get('equipotential').find(x=>x.n===currentExample);if(!ex)return E('div');const box=E('section',null,'eq-example-checks');box.id='eq-example-checks';const checks=run.exampleChecks[currentExample]||(run.exampleChecks[currentExample]={});
    if(ex.n===1)box.append(quick(T('用兩線估算驗算','Verify with Estimate E'),'est'),lecture('bars'));
    if(ex.n===2){const b=B(T('B 比 A 強','B is stronger than A'),()=>{checks.judgement=true;save();appendExampleControls();});b.setAttribute('aria-pressed',String(!!checks.judgement));box.append(b,B(T('A 比 B 強','A is stronger than B'),()=>{checks.judgement=false;tell(T('先看相同電位差的線距；不是只看位置名稱。','Compare spacing for equal voltage gaps, not the point names.'));appendExampleControls();}));box.append(B((checks.A?'✓ ':'')+T('量 A','Measure A'),()=>{L.move('n2',15,10);}),B((checks.B?'✓ ':'')+T('量 B','Measure B'),()=>{L.move('n2',9.5,10);}),quick(T('估算目前位置','Estimate here'),'est'),B(T('確認範例二','Confirm Example 2'),()=>{if(checks.judgement&&checks.A&&checks.B){checks.done=true;emit('example-two-verified',6,{example:2,judgement:true,verifiedA:true,verifiedB:true});appendExampleControls();}else tell(T('先判斷，再於 A、B 各按一次估算。','Predict first, then estimate at both A and B.'));}));}
    if(ex.n===3){[['voltage','V'],['field','E']].forEach(([key,name])=>{const relation=E('div',null,'eq-relation'),label=rich(E('label'),T('比較 ','Compare ')+'\\('+name+'_A\\) '+T('與','and')+' \\('+name+'_B\\)'),sel=E('select');sel.id='eq-example-'+key;label.htmlFor=sel.id;[['',T('請選關係','Choose a relation')],['less',T('A 較小','A is smaller')],['equal',T('兩處相同','Equal')],['greater',T('A 較大','A is greater')]].forEach(([v,t])=>{const o=E('option',t);o.value=v;sel.append(o);});sel.value=checks[key]||'';sel.onchange=()=>{checks[key]=sel.value;save();};relation.append(label,sel);box.append(relation);});box.append(B(T('確認 V 與 E','Check V and E'),()=>{const ok=checks.voltage==='less'&&checks.field==='less';StudyFlow.cue(ok?'correct':'wrong');if(ok){checks.done=true;emit('example-three-verified',6,{example:3,voltageCorrect:true,fieldCorrect:true});}tell(ok?T('兩個判斷都正確。電位讀線的數字；電場看線距。','Both are correct. Read contour values for potential and spacing for the field.'):T('電位先看線的數字；電場再看等電位差的疏密。兩者不能混在一起。','Read values for potential, then compare spacing for the field. Keep the two quantities separate.'));appendExampleControls();}));}
    box.append(rich(E('p',null,'eq-course-message'),message));if(checks.done)box.append(E('p',T('✓ 這個範例已在實驗裡驗證','✓ This example is verified')));return box;
  }
  function leaveExample(){currentExample=0;if(isStudy())flow.close();L.discardGiven();const u=new URL(location.href);u.searchParams.delete('ex');history.replaceState(null,'',u);P.close();}
  function appendExampleControls(){if(!currentExample)return;const pane=$('lp-pane-examples');$('eq-example-checks')?.remove();pane?.querySelector('.eq-example-picker')?.remove();const picker=E('div',null,'eq-example-picker');[1,2,3].forEach(n=>{const b=B(T('範例 ','Example ')+n,()=>applyExample(n));b.setAttribute('aria-pressed',String(n===currentExample));picker.append(b);});pane?.prepend(picker);pane?.append(exampleControls());}
  window.LabExampleAdapters=window.LabExampleAdapters||{};
  window.LabExampleAdapters.equipotential={apply(ex){currentExample=ex.n;run.exampleChecks[ex.n]=run.exampleChecks[ex.n]||{};base(ex.state,S.givenRecords(ex.state,ex.levels));L.redraw();},solution(ex,line){L.redraw();}};
  addEventListener('lab:examplechange',e=>{if(e.detail.slug!=='equipotential')return;if(isStudy()&&section()===6&&flow.state.step!==e.detail.n)flow.go(6,e.detail.n);appendExampleControls();});
  addEventListener('lab:solutionstep',()=>appendExampleControls());
  addEventListener('eqp:action',e=>{if(!flow||flow.state.teaching)return;const {type,data}=e.detail,s=L.snapshot();if(isStudy()&&section()===4){
    if(type==='record'&&Math.abs(data.reading)<=.02+1e-9)emit('null-recorded',4,{power:s.power,recorded:true,reading:data.reading});
    if(type==='lines'){const g=s.paths.find(g=>g.ownN>=6&&g.vRange<.06);if(g)emit('line-completed',4,{power:s.power,groupN:g.ownN,vRange:g.vRange,drawLines:s.drawLines});}
    if(type==='fieldlines')emit('field-drawn',4,{groups:s.paths.filter(g=>g.ownN>=6&&g.vRange<.06).length,drawField:s.drawField,fieldCurves:s.fields.length});
    if(type==='estimate')emit('field-estimated',4,{estimated:true,err:data.err});
    if(['record','lines','fieldlines','estimate'].includes(type))project();
  }
    if(currentExample&&(!isStudy()||section()===6)&&type==='estimate'){const ck=run.exampleChecks[currentExample]||(run.exampleChecks[currentExample]={});if(Number.isFinite(data.err)&&Math.abs(data.err)<.1){if(currentExample===1){ck.done=true;emit('example-one-verified',6,{example:1,estimated:true,err:data.err});}if(currentExample===2){if(Math.hypot(s.n2.x-15,s.n2.y-10)<.3)ck.A=true;if(Math.hypot(s.n2.x-9.5,s.n2.y-10)<.3)ck.B=true;}}appendExampleControls();save();}
  });
  function animate(t=performance.now()){raf=0;if(!isStudy()||document.hidden)return;const visible=stage().getBoundingClientRect().bottom>0&&stage().getBoundingClientRect().top<innerHeight;
    if(playing&&visible){elapsed=Math.min(4,elapsed+(lastFrame?Math.min((t-lastFrame)/1000,1):0));if(elapsed>=4){playing=false;run.flags.intro=true;emit('intro-viewed',1,{kind:'stream',seconds:4});renderTools();}}
    lastFrame=t;L.redraw();if(playing||section()===4&&!D.reducedMotion())raf=requestAnimationFrame(animate);
  }
  function intro(ctx,G){if(!isStudy()||section()!==1||flow.state.step!==1)return false;ctx.setTransform(G.dpr,0,0,G.dpr,0,0);D.backdrop(ctx,G.w,G.h);const x=10,y=34,w=G.w-20,h=G.h-56;const cropW=480*w/h,cropX=374+(612-cropW)/2;if(image.complete)ctx.drawImage(image,cropX,650,cropW,480,x,y,w,h);
    const points=[[.53,.02],[.50,.12],[.58,.22],[.66,.31],[.70,.44],[.68,.56],[.73,.70],[.70,.86],[.66,.98]],progress=D.reducedMotion()?1:elapsed/4;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>{if(i>progress*(points.length-1)+1)return;const q=i?points[i-1]:p,u=Math.min(1,Math.max(0,progress*(points.length-1)-(i-1)));const px=i?q[0]+(p[0]-q[0])*u:p[0],py=i?q[1]+(p[1]-q[1])*u:p[1];i?ctx.lineTo(x+((px*612+(cropW-612)/2)/cropW)*w,y+py*h):ctx.moveTo(x+((px*612+(cropW-612)/2)/cropW)*w,y+py*h);});ctx.strokeStyle=D.alpha(D.c.surface,.9);ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle=D.c.neg;ctx.lineWidth=3;ctx.stroke();ctx.restore();D.pill(ctx,T('真實地形圖 · 示意坡降水流','Real terrain · illustrated downhill flow'),G.w/2,24,D.c.text,'center','600 13px '+D.FONT);return true;}
  function overlay(ctx,g){const s=L.snapshot();if(isStudy()&&section()===4&&flow.state.step===2){const x=g.X(15),y=g.Y(3),pulse=D.reducedMotion()?0:Math.sin(performance.now()/260)*3;ctx.save();ctx.beginPath();ctx.arc(x,y,17+pulse,0,Math.PI*2);ctx.strokeStyle=D.c.accent;ctx.lineWidth=3;ctx.stroke();D.arrow(ctx,x-45-pulse,y-25,x-18,y-4,D.c.accent,3);ctx.restore();}
    // 站長 11/16：「範例二跟範例三的 A 點跟 B 點要在圖上顯示出來，只有座標很難知道 A、B 兩點在哪裡」→ 一般模式選範例二、三也畫：點＋字母＋座標
    if(isStudy()&&section()===3&&flow.state.step===3||currentExample>=2&&(!isStudy()||section()===6))markAB(ctx,g);}
  function markAB(ctx,g){const px=Math.abs(g.X(1)-g.X(0)),wide=px>=15;[['A',15,10],['B',9.5,10]].forEach(([name,x,y])=>{const cx=g.X(x),cy=g.Y(y);ctx.save();
      // 十字準線＋圓圈：針尖或電極蓋在點上時也看得出位置
      const bg=D.alpha(D.c['canvas-bg']||D.c.surface,.9),r=10,k=17;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(cx-k,cy);ctx.lineTo(cx-r+3,cy);ctx.moveTo(cx+r-3,cy);ctx.lineTo(cx+k,cy);ctx.moveTo(cx,cy-k);ctx.lineTo(cx,cy-r+3);ctx.moveTo(cx,cy+r-3);ctx.lineTo(cx,cy+k);
      ctx.lineWidth=4.5;ctx.strokeStyle=bg;ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle=D.c.equi;ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.lineWidth=4.5;ctx.strokeStyle=bg;ctx.stroke();ctx.setLineDash([4,3]);ctx.lineWidth=2;ctx.strokeStyle=D.c.equi;ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(cx,cy,2.4,0,Math.PI*2);ctx.fillStyle=D.c.equi;ctx.fill();ctx.restore();
      // 點位沿用主線的十字準線；字牌交給共用避讓，保留座標並避開探針、線名與讀數。
      L.label(wide?name+' ('+x+', '+y+')':name,x,y,D.c.equi);});}
  function boot(){P.mount({onChange:()=>L.redraw(),onTab(tab){if(tab!=='examples'||!flow)return;if(isStudy()&&section()!==6)flow.go(6,currentExample||1);else if(!currentExample)applyExample(1);}});const bar=$('eq-study-shell');header=bar;caption=$('eq-study-caption');tools=$('eq-study-tools');nav=$('eq-study-nav');menu=$('eq-study-progress');
    flow=StudyFlow.embed({id:'equipotential',sections:U.sections,onClass(on){if(on)classRun=JSON.parse(JSON.stringify(run));else if(classRun){run=classRun;classRun=null;}},enter,step,canAdvance,finish,render,save,start(){window.LabSide?.instance?.close();const b=document.querySelector('.ms-toggle');if(b&&!LabMission._state.on)b.click();document.querySelector('.ms-dock-close')?.click();scrollTo({top:0,behavior:'instant'});if(innerWidth>=1240||[2,3,5,7,8].includes(section())){P.open('concept');}lastFrame=0;if(!raf)raf=requestAnimationFrame(animate);},close(){currentExample=0;LabSteps.setActive(false);L.discardGiven();L.redraw();}});
    $('studyBtn').onclick=beginStudy;$('studyInvite').onclick=beginStudy;$('eq-study-close').onclick=()=>{if(window.LabModeGate){location.href=LabModeGate.url({mode:'lab'});return;}flow.close();L.discardGiven();};$('clearAll').addEventListener('click',()=>{if(!isStudy())leaveExample();});$('eq-class').onclick=()=>flow.classMode(!flow.state.teaching);
    LabMission.on('complete',m=>{if(m?.study){StudyFlow.cue('star');renderMissions();finishUnit();}});
    // 站長 11/16 回報：已登入仍顯示「回頁首登入」——側板在登入狀態讀回前就畫好，之後沒重畫。
    // 登入完成（ready）、星星同步（synced）、改暱稱（profile）都重畫；登出或換帳號沒有事件，另外每秒比對一次帳號與完成數。
    ['ready','synced','profile'].forEach(n=>LabMission.on(n,()=>renderMissions()));
    {let seen='';setInterval(()=>{const s=LabMission._state||{},k=(s.user?.uid||'')+'|'+(s.ready?1:0)+'|'+Object.keys(s.done||{}).length;if(k!==seen){const first=!seen;seen=k;if(!first)renderMissions();}},1000);}
    setInterval(()=>{if(!isStudy()||document.hidden)return;const s=guideSnapshot();if(section()===4){LabSteps.feed(s);if(LabSteps.index+1!==flow.state.step)flow.go(4,LabSteps.index+1);if(!$('eq-step-tools')){const a=E('div',null,'eq-panel-tools');a.id='eq-step-tools';renderTools(a);$('lp-pane-steps').append(a);}}
      if(section()===4&&!D.reducedMotion()&&!raf)raf=requestAnimationFrame(animate);
      if(section()===1&&s.view==='rig'&&s.ready3D&&!run.flags.intro){run.flags.intro=true;emit('intro-viewed',1,{kind:'rig',ready:true});}
    },250);
    if(query.get('study')==='1'){
      if(classEntry||['seg','step','ex'].some(key=>query.has(key))){
        const n=+query.get('seg')||(query.has('ex')?6:1);
        const i=+query.get('step')||(n===6?+query.get('ex')||1:1);
        if(validPosition(n,i))flow.start(n,i);
        else flow.start(1,1);
        if(classEntry)flow.classMode(true);
      }else beginStudy();
    }else if(!query.has('ex'))P.close();
    renderMissions();
  }
  window.EquipotentialStudy={get active(){return isStudy();},get observing(){return isStudy()||!!currentExample;},get state(){return flow?.state;},get progress(){return JSON.parse(JSON.stringify(run));},get flow(){return flow;},get theoryFractions(){return isStudy()&&section()===7&&flow.state.step===1?[1/6,2/6,3/6,4/6,5/6]:null;},drawIntro:intro,drawOverlay:overlay,notify:tell,exported(method){const s=L.snapshot();if(own(s)>=6){run.flags.card=true;emit('card-exported',8,{ownPoints:own(s),method,exported:true});render();}},shareProject(){return L.snapshot();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
