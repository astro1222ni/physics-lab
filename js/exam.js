/* Question intake and answer feedback; LearnEngine owns the lesson transport. */
(() => {
  'use strict';
  const {number:q,question:Q,questions}=Exam114, unit='exam-114-'+q;
  const by=id=>document.getElementById(id), T=(z,e)=>LabSettings.t(z,e), tr=pair=>T(...pair);
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
  const params=new URLSearchParams(location.search);
  const tracks=ExamTracks['Q'+q], points=Q.points||(Q.key?2:4), single=!!Q.key&&Q.key.length===1;
  function rich(node,text){
    node.replaceChildren();
    for(const part of text.split(/(\\\([\s\S]*?\\\))/)){
      if(!part.startsWith('\\(')){node.append(part);continue;}
      const span=make('span');katex.render(part.slice(2,-2),span,{throwOnError:false});node.append(span);
    }
  }
  const paragraph=text=>{const p=make('p');rich(p,text);return p;};
  function subtitle(s){return s.replace(/([fT])\u2080/g,'\\($1_0\\)');}
  const focusWords={
    19:/任何質量|向心力|克卜勒第三定律|衛星自己的質量|軌道半徑|力學能|重力位能|加速度|週期|位能|動能|速率|any mass|centripetal force|orbital radius|mechanical energy|potential energy|acceleration|period|speed/i,
    23:/波峰的間隔|波源|都卜勒效應|遠離地球|等速|頻率|紅移|Doppler effect|constant speed|moving away|receding|frequency|redshift/i,
    49:/電流是 0|斜率的倒數|平衡電壓|電阻|單位|截距|趨勢線|equilibrium voltage|reciprocal|resistance|slope|unit|intercept|trend line/i
  };
  const formulas={
    wrong:q===19?'U_{\\rm ISS}>U_{\\rm syn}\\;?':q===23?'v=\\mathrm{const.}\\quad f=f_0\\;?':'I_{\\rm Na}(V)',
    flip:q===19?'U=-GMm/r':'f<f_0',flip2:'E=-GMm/(2r)',
    solve:'v=\\sqrt{GM/r},\\quad a=GM/r^2',radius:'T^2\\propto r^3',
    kepler:'r^3/T^2=GM/(4\\pi^2)',judge:q===19?'r\\!\\downarrow\\;\\Rightarrow\\;v\\!\\uparrow,\\ a\\!\\uparrow':'0<f<f_0',
    ft:'f/f_0=\\sqrt{(1-\\beta)/(1+\\beta)}',redshift:'\\lambda\\!\\uparrow\\;\\Rightarrow\\; f\\!\\downarrow',
    solveA:'I_{\\rm Na}=0\\;\\Rightarrow\\; V=E_{\\rm Na}',solveB:'R_{\\rm Na}=\\Delta V/\\Delta I',
    grade:'45\\!\\text{–}\\!55\\;\\mathrm{mV},\\quad125\\!\\text{–}\\!175\\;\\Omega',
    alt:q===19?'E=K+U=U/2=-K':'V=E_{\\rm Na}+I_{\\rm Na}R_{\\rm Na}',joke:'E_{\\rm Na}',
    trick:q===19?'v^2=GM/r':q===23?'\\beta>0\\;\\Rightarrow\\;f<f_0':'\\Delta I/\\Delta V=1/R_{\\rm Na}'
  };
  const specific={
    Q19_10:'C:\\ 34\\%,\\quad B:\\ 32\\%',Q19_12:'K_{\\rm ISS}>K_{\\rm syn}\\ \\Rightarrow\\ E_{\\rm ISS}>E_{\\rm syn}\\;?',
    Q19_21:'GMm/r^2=mv^2/r',Q19_27:'r_{\\rm ISS}\\approx 6800\\;\\mathrm{km}',Q19_34:'\\boxed{D,\\ E}',
    Q23_09:'f=f_0\\;?',Q23_13:'T_{\\rm rec}>T_0',Q23_22:'\\boxed{A,\\ D}',
    Q49_19:'E_{\\rm Na}\\approx50\\;\\mathrm{mV}',Q49_22:'\\Delta V\\approx60\\;\\mathrm{mV},\\quad\\Delta I\\approx0.4\\;\\mathrm{mA}',
    Q49_23:'R_{\\rm Na}\\approx150\\;\\Omega',Q49_29:'R_{\\rm Na}\\approx146\\;\\Omega,\\quad E_{\\rm Na}\\approx50\\;\\mathrm{mV}'
  };
  const storageKey=()=>unit+':attempts:'+(LabMission._state.user?.uid||'guest');
  const load=()=>{try{return JSON.parse(localStorage.getItem(storageKey()))||{};}catch{return {};}};
  let state=load(), owner=storageKey(), mounted=false;
  function emit(){
    LabMission.emit('exam-progress',{unit,first:state.first===true||!!state.recovered,correct:!!state.correct,viewed:!!state.viewed,experiment:!!state.experiment,relearn:!!state.relearn,later:!!state.later,national:!!state.national});
  }
  function save(){try{localStorage.setItem(storageKey(),JSON.stringify(state));}catch{}emit();refreshSide();}
  function milestone(key){if(!state[key]){state[key]=true;save();}}
  const twDay=()=>new Date(Date.now()+8*3600e3).toISOString().slice(0,10);
  function circuit(){
    const host=by('circuit');
    host.innerHTML='<svg viewBox="0 0 175 222" role="img"><g fill="none" stroke="currentColor" stroke-width="2.5"><path d="M64 55V30H135V106 M135 119V195H64V171 M64 55V94l-5 4 10 5-10 5 10 5-10 5 5 4v14 M64 146v25"/><path d="M51 137h26 M44 145h40 M126 108h18 M119 117h32"/><rect x="22" y="54" width="83" height="119" rx="3" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M76 94V71m-4 7 4-7 4 7"/></g><g fill="currentColor"><circle cx="64" cy="55" r="3.5"/><circle cx="64" cy="171" r="3.5"/></g><g fill="currentColor" font-size="14" font-family="system-ui"><text x="81" y="78">I<tspan dy="3" font-size="10">Na</tspan></text><text x="76" y="118">R<tspan dy="3" font-size="10">Na</tspan></text><text x="77" y="159">E<tspan dy="3" font-size="10">Na</tspan></text><text x="32" y="136">−</text><text x="32" y="160">+</text><text x="148" y="106">−</text><text x="147" y="133">+</text><text x="151" y="119">V</text><text x="20" y="20">'+T('細胞外部','Outside')+'</text><text x="20" y="215">'+T('細胞內部','Inside')+'</text></g></svg>';
    host.firstChild.setAttribute('aria-label',T('細胞膜電路，電流向上，電池與電壓均為下正上負','Membrane circuit with upward current and both positive terminals at the bottom'));
    host.append(make('figcaption',T('圖 15　虛線框為細胞膜','Figure 15 · Dashed membrane boundary')));
  }
  function buildProblem(){
    document.body.dataset.q=q;document.body.dataset.commentsUrl=Q.lab+'.html';
    document.documentElement.classList.toggle('learn-class',params.get('class')==='1');
    document.title=T('第 '+q+' 題・','Question '+q+' · ')+tr(Q.title)+' · Astro Ni Lab';
    for(const [n,question] of Object.entries(questions)){
      const a=make('a');a.innerHTML='<span class="nav-word">'+T('第 ','Q')+'</span>'+n+'<span class="nav-word">'+T(' 題','')+'</span>';a.setAttribute('aria-label',T('第 '+n+' 題','Question '+n));const url=new URL(location.href);url.searchParams.set('q',n);
      ['line','seg','p','t'].forEach(k=>url.searchParams.delete(k));a.href=url.href;a.title=tr(question.title);
      if(+n===q)a.setAttribute('aria-current','page');by('exam-nav').append(a);
    }
    by('kind').textContent=T('114 學測自然','114 GSAT Science')+'　/　'+T('第 '+q+' 題','Question '+q);
    by('point-label').textContent=(Q.key?(single?T('單選','Single choice'):T('多選','Multiple response')):T('非選','Constructed response'))+' · '+T(points+' 分',points+' points');
    by('exam-title').textContent=tr(Q.title);
    if(Q.group){
      const d=by('passage');d.hidden=false;d.open=Q.open??q===23;d.querySelector('summary').textContent=tr(Q.group);
      const body=d.querySelector('div');for(const para of Q.passage)body.append(paragraph(tr(para)));
      if(q===49||Q.figs==='fig12-14'){const im=make('img');im.src='img/exam114/fig12-14'+(LabSettings.lang==='en'?'-en':'')+'.png';im.alt=T('圖 12 神經細胞、圖 13 傳訊放大圖、圖 14 膜電容與三條並聯支路','Original figures 12–14: neurons, magnified signaling, membrane capacitor and three parallel branches');body.append(im);}
    }
    if(Q.stem)by('problem-text').append(paragraph(tr(Q.stem)));
    tr(Q.ask).split('\n').forEach(t=>by('problem-text').append(paragraph(t)));
    if(q===49){by('opening-art').hidden=true;by('figures').hidden=false;by('figure-tabs').hidden=false;
      by('figure-tabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;
        by('figures').dataset.figure=b.dataset.figure;for(const tab of by('figure-tabs').children)tab.setAttribute('aria-pressed',String(tab===b));};
      circuit();ExamScene.preview(by('printed-graph'),q);}
    else{const figure=by('opening-art');figure.querySelector('figcaption').textContent=Q.caption?tr(Q.caption):q===19?T('地球、近地軌道與同步軌道','Earth, low Earth orbit and synchronous orbit'):T('地球端監測太空船傳回的訊號','Earth monitors the signal from the spacecraft');
      ExamScene.preview(figure.querySelector('canvas'),q);}
    const fields=by('answer-fields');
    if(Q.key) Q.choices.forEach((pair,i)=>{
      const row=make('label');row.className='exam-choice';const box=make('input');box.type=single?'radio':'checkbox';box.name='choice';box.value='ABCDE'[i];
      const caption=make('span');rich(caption,tr(pair));row.append(box,make('b',box.value),caption);
      if(Q.choiceArt){const art=make('canvas');art.className='choice-art';art.setAttribute('aria-hidden','true');row.classList.add('has-art');row.append(art);requestAnimationFrame(()=>Q.choiceArt(art,i));}
      fields.append(row);
    });
    else if(Q.fields){
      Q.fields.forEach((f,i)=>{
        const row=make('div');row.className='numeric-field'+(f.options?' select-field':'');const id='value-'+i,label=make('label',tr(f.label));label.htmlFor=id;
        if(f.options){const sel=make('select');sel.id=id;[[ '',T('請選擇','Choose')],...f.options.map(o=>[o[0],tr(o[1])])].forEach(([v,t])=>{const opt=make('option',t);opt.value=v;sel.append(opt);});row.append(label,sel);}
        else{const input=make('input');input.id=id;input.autocomplete='off';input.inputMode='decimal';const select=make('select');select.id='unit-'+i;select.setAttribute('aria-label',tr(f.label)+' '+T('單位','unit'));
          [T('單位','Unit'),...f.units].forEach((u,j)=>{const opt=make('option',u);opt.value=j?u:'';select.append(opt);});row.append(label,input,select);}
        fields.append(row);});
      if(Q.fieldNote)fields.append(make('small',tr(Q.fieldNote)));
    }
    else{
      for(const [i,name,units] of [[0,T('平衡電壓','Voltage'),['mV','V']],[1,T('電阻值','Resistance'),['Ω','kΩ']]]){
        const row=make('div');row.className='numeric-field';const id='value-'+i,label=make('label','('+'ab'[i]+') '+name);label.htmlFor=id;
        const input=make('input');input.id=id;input.autocomplete='off';input.inputMode='decimal';
        const select=make('select');select.id='unit-'+i;select.setAttribute('aria-label',name+' '+T('單位','unit'));
        [T('單位','Unit'),...units].forEach((s,j)=>{const opt=make('option',s);opt.value=j?s:'';select.append(opt);});row.append(label,input,select);fields.append(row);
      }
      fields.append(make('small',T('單位一定要寫','Include a unit for each answer.')));
    }
    by('experiment').querySelector('summary').textContent=T('能動手的圖','Hands-on graph')+' · '+tr(Q.hands);
    ExamScene.interactive(by('experiment-body'),q,()=>milestone('experiment'));
    by('lab-link').href=Q.lab+'.html';by('lab-link').textContent=T('去 Lab 試：','Try the lab: ')+tr(Q.labName)+' ↗';
    by('credit').textContent=T('試題出處：大學入學考試中心 114 學年度學科能力測驗自然考科第 '+q+' 題；全國資料：大考中心 114 學測選項分析及答對率統計。','Source: CEEC 114 GSAT Natural Sciences, question '+q+'. National data: CEEC 114 GSAT option analysis and score statistics.');
  }
  function statistics(){
    const body=by('national-body');body.replaceChildren();
    if(!Q.key&&Q.marking){body.append(paragraph(T('大考中心未公布非選題得分率','The CEEC did not publish a national score rate for this constructed-response question.')),paragraph(tr(Q.marking)));return;}
    if(!Q.key){body.append(paragraph(T('大考中心未公布非選題得分率','The CEEC did not publish a national score rate for this constructed-response question.')),paragraph(T('大考中心評分原則：(a) 45–55 mV、(b) 125–175 Ω 都給分；單位要寫對才有機會拿滿分，過程對但漏寫單位可能只拿部分分數。','CEEC marking ranges: (a) 45–55 mV and (b) 125–175 Ω. Correct units are needed for full credit; sound work with a missing unit may earn partial credit.')));return;}
    body.append(paragraph((single?T('全國答對率 ','National correct rate '):T('全國得分率 ','National score rate '))+Q.rate+'%'+(Q.full!=null?T('｜全對率 '+Q.full+'%',' | Fully correct '+Q.full+'%'):''))); // 11/21 試玩：多選的得分率含部分給分，另標全對率
    const progress=make('progress');progress.max=100;progress.value=Q.rate;progress.setAttribute('aria-label',T('全國得分率','National score rate'));body.append(progress);
    const largest=Math.max(...Q.shares.filter((_,i)=>!Q.key.includes('ABCDE'[i])));
    Q.shares.forEach((v,i)=>{
      const l='ABCDE'[i],row=make('div'),correct=Q.key.includes(l),mistake=!correct&&v===largest;
      row.className='stat-row '+(correct?'correct':mistake?'mistake':'');const bar=make('span');bar.className='stat-track';const fill=make('i');fill.style.width=v+'%';bar.append(fill);
      const tags=[correct?T('正解','Correct'):mistake?T('最多人錯選','Top distractor'):''];
      if(state.last.selected?.includes(l))tags.push(T('全國 '+v+'% 也選了這個',v+'% also chose this'));
      row.append(make('b',l),bar,make('b',v+'%'),make('small',tags.filter(Boolean).join(' · ')));body.append(row);
    });
  }
  function feedback(restore=false){
    const rec=state.last;by('result').hidden=!rec;by('national').hidden=!rec;
    by('explain').hidden=!(state.correct||state.attempts>=2||params.get('class')==='1');
    if(!rec)return;
    const result=by('result');result.replaceChildren(make('strong',(rec.score===points?T('答對了','Correct'):T('本次得分','Your score'))+'　'+rec.score+' / '+points));
    if(!Q.key)result.append(paragraph(T('這是網頁練習分數：只看數值和單位，不看過程；正式閱卷還會看計算過程。','This is a practice score: only the values and units are checked, not your working. Real marking also looks at the working.')));
    if(rec.score<points)result.append(paragraph(tr(Q.hint)));
    if(restore){if(Q.key){document.querySelectorAll('[name=choice]').forEach(x=>x.checked=rec.selected.includes(x.value));}
      else rec.fields.forEach(({value,unit},i)=>{if(by('value-'+i))by('value-'+i).value=value;if(by('unit-'+i))by('unit-'+i).value=unit;});}
    statistics();by('national').open=rec.score===points;
  }
  async function check(e){
    e.preventDefault();const btn=by('send-answer');if(btn.disabled)return;btn.disabled=true;
    try{
      let rec;
      if(Q.key){const selected=[...document.querySelectorAll('[name=choice]:checked')].map(x=>x.value).join('');
        if(!selected){by('result').hidden=false;by('result').textContent=T('請先勾選你的答案。','Select your answer first.');return;}
        rec={selected,...(single?ExamPhysics.single(selected,Q.key):ExamPhysics.multiple(selected,Q.key))};
      }else{
        const n=Q.fields?Q.fields.length:2,fields=Array.from({length:n},(_,i)=>({value:by('value-'+i).value,unit:by('unit-'+i)?.value||''}));
        if(fields.every(f=>!f.value.trim())){by('value-0').focus();return;}
        rec={fields,...await (Q.grade?Q.grade(fields,LearnEngine):ExamPhysics.gradeChannel(fields,LearnEngine))};
      }
      const ok=rec.score===points,day=twDay();if(!state.attempts){state.first=ok;state.firstDay=day;}
      // 11/21 站長：「萬一第一次沒有通過的，他要怎麼補救」→ 聽完解題後再答對、隔天（臺灣日期）再答對，各有任務
      if(ok){if(state.viewed)state.relearn=true;if(state.okDay&&state.okDay!==day)state.later=true;if(!state.okDay)state.okDay=day;}
      // 11/21 站長：「補救的方式是這七顆，不是額外再七顆」→ 第一次沒拿滿分：聽完全部解題，換一天，當天第一次送出就拿滿分，「第一次就答對」照樣給
      if(state.attempts){if(!state.firstDay)state.firstDay=day;if(!state.lastDay)state.lastDay=day;} // 舊紀錄沒有日期：當作今天，最快明天補救
      if(ok&&state.first===false&&state.viewed&&state.firstDay!==day&&state.lastDay!==day)state.recovered=true;
      state.lastDay=day;
      state.correct=!!state.correct||ok;state.attempts=(state.attempts||0)+1;state.last=rec;save();feedback();
      if(LabSettings.get('sound'))LabSound.tone({freq:ok?740:295,dur:.14,type:'triangle',gain:.15});
    }finally{btn.disabled=false;}
  }
  function openSolution(scroll){
    by('explanation').hidden=false;
    if(!mounted){
      const timing={},audio={};const pages=tracks.map(row=>{
        const speech=[subtitle(row.disp),subtitle(row.en)];timing[row.id]={dur:row.duration+.6,marks:{}};audio[row.id]=true;
        return {...row,speech,caption:speech.map(s=>s.replace(Q.focus||focusWords[q],'**$&**')),title:Q.groups[row.row]};
      });
      const select=by('sentence');for(const [i,p] of pages.entries()){
        const opt=make('option',(i+1)+' · '+tr(p.title));opt.value=i;select.append(opt);}
      const presentation={ownSide:true,tabs:[],bindNavigation(go){select.onchange=()=>go(+select.value);},
        show(p,i){select.value=i;by('folio').textContent=(i+1)+' / '+pages.length;if(p.row===Q.mid)by('experiment').open=true;side.page=p;refreshSide();},
        viewed(all){if(all)milestone('viewed');refreshSide();}
      };
      window.LearnUnit={id:unit,slug:'exam-114',pages,presentation,reveal:{},board:id=>{
        const p=pages.find(page=>page.id===id),formula=(Q.specific||{})[id]||specific[id]||(Q.board?Q.board[p.row]:formulas[p.row]);if(!formula)return [];
        const lines=params.get('class')==='1'?formula.split(',\\quad'): [formula];
        return lines.map(line=>['',line.trim()]);}};
      window.LearnTimings={zh:timing,en:timing,audio:{zh:audio,en:audio}};
      window.LearnScene={create:()=>ExamScene.lesson(by('lesson-art'),q)};
      mounted=true;LearnEngine.mount();
    }
    if(scroll)by('explanation').scrollIntoView({block:'start'});
  }
  // 步驟・觀念・任務・留言側板（11/21 站長：「一樣要做步驟，還有任務的側板。」）。
  // 一進題目就有，不必等看解答；學習引擎的側板在學測頁關掉（presentation.ownSide）。
  const side={tab:'steps',open:false,page:null,opened:new Set(),closed:new Set()};
  const tabNames={steps:['步驟','Steps'],concept:['觀念','Concept'],missions:['任務','Missions'],comments:['留言','Comments']};
  const SIDE_KEY='exam-side-open',wide=()=>innerWidth>=1240;
  function heard(){try{const a=JSON.parse(localStorage.getItem('learn-activity:'+unit+':'+(LabMission._state.user?.uid||'guest')))||{};const v=a.viewed||{};return tracks.filter(r=>v[r.id]).length;}catch{return 0;}}
  const fieldCount=Q.fields?Q.fields.length:2;
  const fieldDone=i=>!!by('value-'+i)?.value.trim()&&(!by('unit-'+i)||!!by('unit-'+i).value);
  function filled(){return Q.key?document.querySelectorAll('[name=choice]:checked').length:Array.from({length:fieldCount},(_,i)=>i).filter(fieldDone).length;}
  const solvable=()=>!!(state.correct||state.attempts>=2||params.get('class')==='1');
  const handsGoal=()=>{const m=(LabMission.all()[unit]||[]).find(x=>x.id===unit+'-4');return m?[m.desc.zh,m.desc.en]:Q.hands;};
  function steps(){
    const n=tracks.length,h=heard(),c=filled(),att=state.attempts||0;
    return [
      {goal:Q.key?(single?['選一個答案','Pick one answer']:['勾選你的答案','Choose your answer']):['填答每一格','Fill in every box'],target:'#answer-fields',
        hint:Q.key?(single?['單選題：只有一個答案','Single choice: one answer']:['多選題：每個你認為對的選項都勾','Multiple response: tick every statement you think is true']):['每一格都要填，有單位的要選單位','Fill every box and choose units where asked'],
        done:att>0||(Q.key?c>0:c===fieldCount),
        need:Q.key?[[c>0||att>0,'已勾選 '+c+' 個選項',c+' option(s) ticked']]
          :Q.fields?Q.fields.map((f,i)=>[fieldDone(i)||att>0,f.label[0]+(f.options?'：選一項':'：數值＋單位'),f.label[1]+(f.options?': choose one':': value and unit')])
          :[[fieldDone(0)||att>0,'(a) 平衡電壓：數值＋單位','(a) Voltage: value and unit'],[fieldDone(1)||att>0,'(b) 電阻值：數值＋單位','(b) Resistance: value and unit']]},
      {goal:['送出作答','Submit'],target:'#send-answer',hint:['按「送出作答」看得分','Press Submit answer to see your score'],done:att>0,
        need:[[att>0,'已送出 '+att+' 次',att+' submission(s)']]},
      {goal:['對照全國資料','Compare with the nation'],target:()=>by('national').querySelector('summary'),hint:['打開「全國資料」，看全國怎麼選','Open National results'],done:!!state.national,
        need:[[att>0?true:null,'先送出作答，才會出現全國資料','Submit first to unlock the national data'],[!!state.national,'打開「全國資料」','Open National results']]},
      {goal:['聽完逐句解題','Play the whole solution'],target:()=>mounted?by('play'):by('explain'),hint:mounted?['按 ▶ 播放，開「自動下一句」可以一路聽完','Press play; turn on Auto next to hear it all']:['按「看解答」','Press Show solution'],done:!!state.viewed,
        need:[[solvable()?true:(att>0?false:null),'答對，或作答兩次後出現「看解答」','Show solution appears after a correct answer or two attempts'],[h===n?true:mounted?null:false,'已聽完 '+h+' / '+n+' 句',h+' / '+n+' sentences played']]},
      {goal:['動手驗證','Test the model'],target:()=>by('experiment').open?by('experiment-body').querySelector('canvas'):by('experiment').querySelector('summary'),hint:handsGoal(),done:!!state.experiment,
        need:[[by('experiment').open?true:null,'打開「能動手的圖」','Open the hands-on graph'],[!!state.experiment,...handsGoal()]]}
    ];
  }
  function needList(items){const ul=make('ul');for(const [ok,zh,en] of items){const li=make('li'),mark=make('span',ok===true?'✓':ok===false?'✗':'→');mark.className='ms-need-mark';if(ok===true)li.className='ms-need-ok';else mark.dataset.ok=String(ok);li.append(mark,make('span',T(zh,en)));ul.append(li);}return ul;}
  function missionNeed(m){const flag=['correct','first','viewed','experiment','relearn','later','national'][+m.id.split('-').pop()-1],att=state.attempts||0;
    if(flag==='first'){if(!att)return [[null,'還沒送出：第一次送出就要全對','Not submitted yet: get it fully right the first time']];
      if(state.first===true)return [[true,'第一次送出就拿滿分','Full credit on the first try']];
      if(state.recovered)return [[true,'補救成功：聽完解題、換一天再答對','Recovered: played the solution and solved it on another day']];
      const h=heard(),today=twDay();
      return [[false,'第一次送出沒拿到滿分，還可以補救，拿回這 '+m.level+' 顆','Missed on the first try; you can still recover these '+m.level+' stars'],
        [state.viewed||h===tracks.length?true:null,'聽完全部解題（已聽 '+h+' / '+tracks.length+' 句）','Play the whole solution ('+h+' / '+tracks.length+')'],
        [null,(state.lastDay===today?'明天（臺灣時間 00:00 以後）再來':'今天')+'，當天第一次送出就拿滿分',(state.lastDay===today?'Come back tomorrow (after midnight Taiwan time); ':'Today, ')+'get full credit on that day’s first submission']];}
    if(flag==='relearn'){const h=heard();return [[state.viewed||h===tracks.length?true:null,'先聽完全部解題（已聽 '+h+' / '+tracks.length+' 句）','Play the whole solution first ('+h+' / '+tracks.length+')'],[state.relearn?true:null,'聽完之後再送出一次，拿到滿分','Then submit again for full credit']];}
    if(flag==='later')return [[state.okDay?true:null,state.okDay?'已在 '+state.okDay+' 拿過滿分':'先拿到一次滿分',state.okDay?'Full credit on '+state.okDay:'Get full credit once'],[state.later?true:null,'換日（臺灣時間 00:00）之後再送出一次，又拿滿分','After midnight (Taiwan time), submit again for full credit']];
    if(flag==='national')return [[att?true:null,'先送出作答','Submit first'],[!!state.national,'打開「全國資料」，看全國怎麼選','Open National results']];
    if(flag==='correct')return [[state.correct?true:att?false:null,state.correct?'已拿到滿分':'已送出 '+att+' 次，還沒拿到滿分',state.correct?'Full credit earned':att+' submission(s), no full credit yet']];
    if(flag==='viewed'){const h=heard();return [[solvable()?true:null,'打開「看解答」','Open the solution'],[h===tracks.length?true:null,'已聽完 '+h+' / '+tracks.length+' 句',h+' / '+tracks.length+' sentences played']];}
    return [[!!state.experiment,...handsGoal()]];}
  function current(){const list=steps(),i=list.findIndex(s=>!s.done);return i<0?list.length:i;}
  function guide(i){LabStepGuide.define(steps().map(s=>({target:s.target,action:s.goal,hint:s.hint})),{key:'exam'});
    const s=steps()[i];if(s.target==='#answer-fields'||i===1)by('exam-answer').scrollIntoView({block:'center',behavior:'smooth'});
    if(!wide())setSide(side.tab,false);LabStepGuide.show(i,{key:'exam'});}
  function render(){
    const body=by('side-body');body.replaceChildren();body.dataset.tab=side.tab;by('side-title').textContent=tr(tabNames[side.tab]);
    for(const b of by('side-tabs').children)b.setAttribute('aria-selected',String(b.dataset.tab===side.tab));
    if(side.tab==='steps'){const list=steps(),now=current();
      body.append(make('p',now<list.length?T('第 '+(now+1)+' 步，共 '+list.length+' 步','Step '+(now+1)+' of '+list.length):T('五步都完成了！','All five steps done!')));body.lastChild.className='side-sum';
      // 每步一行（站長 11/21：「要優化你的版面」）：點一下展開「還差什麼？」與「指給我看」，目前這一步自動展開。
      list.forEach((s,i)=>{const card=make('details');card.className='step-card'+(i===now?' now':'')+(s.done?' done':'');card.open=i===now&&!side.closed.has(i)||side.opened.has(i);
        const head=make('summary');head.append(make('span',s.done?'✓':String(i+1)),make('strong',tr(s.goal)));if(!s.done&&i!==now)head.append(make('small',T('還差什麼？','What’s missing?')));card.append(head);
        head.addEventListener('click',()=>{const open=!card.open;(open?side.closed:side.opened).delete(i);(open?side.opened:side.closed).add(i);});
        card.append(needList(s.need));const b=make('button',T('👆 指給我看','👆 Show me'));b.type='button';b.className='sg-show';b.onclick=()=>guide(i);if(!s.done)card.append(b);body.append(card);});
    }else if(side.tab==='concept'){
      if(!mounted||!side.page){body.append(make('p',T('看解答之後，這裡會跟著目前這一句，列出講解和公式。','After you open the solution, this tab follows the current sentence with its explanation and formula.')));body.lastChild.className='side-note';
        if(!solvable())body.append(make('p',T('先作答：答對，或作答兩次後就能看解答。','Answer first: the solution opens after a correct answer or two attempts.')));}
      else{const p=side.page,speech=make('p');speech.className='speech';rich(speech,tr(p.speech));body.append(speech);
        const eq=make('div');eq.className='side-equations';for(const [,line] of window.LearnUnit.board(p.id)){const d=make('div');d.className='equation';katex.render(line,d,{throwOnError:false,displayMode:false});eq.append(d);}body.append(eq);}
    }else if(side.tab==='missions'){
      const gate=LabMission.statusBox?.();if(gate)body.append(gate);
      const list=make('ol');list.className='ms-list';
      for(const m of LabMission.all()[unit]||[]){const done=!!LabMission._state.done[m.id],li=make('li');li.className='ms-item'+(done?' done':'');li.dataset.mid=m.id;
        const head=make('div');head.className='ms-head';const st=make('span','★ '+LabMission.starsOf(m));st.className='ms-stars';const ti=make('strong',T(m.title.zh,m.title.en));ti.className='ms-title';head.append(st,ti);
        if(done){const ck=make('span','✓');ck.className='ms-check';head.append(ck);}li.append(head);
        const d=make('p',T(m.desc.zh,m.desc.en));d.className='ms-desc';li.append(d);
        if(!done){const det=make('details');det.className='ms-need';det.append(make('summary',T('還差什麼？','What’s missing?')),needList(missionNeed(m)));li.append(det);}list.append(li);}
      body.append(list);
    }else{
      const compose=text=>{const sec=by('comments');if(sec){by('comment-mount').append(sec);sec.hidden=false;}if(window.LabComments)LabComments.compose(text);};
      for(const [zh,en,pre] of [['寫留言','Write a comment',''],['回報畫面問題','Report a display issue',T('【Bug 回報】','[Bug report] ')]]){const b=make('button',T(zh,en));b.type='button';b.onclick=()=>compose(T('第 '+q+' 題：','Question '+q+': ')+pre);body.append(b);}
    }
    by('comment-mount').hidden=side.tab!=='comments';
  }
  function badge(){const n=current(),all=steps().length;by('edge-count').textContent=n<all?(n+1)+'/'+all:'✓';}
  function refreshSide(){if(!by('side-tabs')?.childElementCount)return;badge();if(side.open)render();}
  function setSide(tab,open=true,remember=true){side.tab=tab;side.open=open;by('study-side').hidden=!open;by('edge').setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('side-open',open);if(remember){try{localStorage.setItem(SIDE_KEY,open?'1':'0');}catch{}}if(open)render();}
  function buildSide(){
    for(const [k,pair] of Object.entries(tabNames)){const b=make('button',tr(pair));b.type='button';b.dataset.tab=k;b.setAttribute('role','tab');b.onclick=()=>setSide(k);by('side-tabs').append(b);}
    by('edge').onclick=()=>setSide(side.tab,!side.open);by('side-close').onclick=()=>setSide(side.tab,false);
    let x0=0;by('edge').addEventListener('touchstart',e=>x0=e.touches[0].clientX,{passive:true});by('edge').addEventListener('touchend',e=>{if(x0-e.changedTouches[0].clientX>16)setSide(side.tab,true);},{passive:true});
    by('side-header').addEventListener('touchstart',e=>x0=e.touches[0].clientX,{passive:true});by('side-header').addEventListener('touchend',e=>{if(e.changedTouches[0].clientX-x0>35)setSide(side.tab,false);},{passive:true});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&side.open)setSide(side.tab,false);});
    by('answer-fields').addEventListener('input',refreshSide);by('answer-fields').addEventListener('change',refreshSide);
    by('national').addEventListener('toggle',()=>{if(by('national').open)milestone('national');});
    by('experiment').addEventListener('toggle',refreshSide);
    LabMission.on('complete',refreshSide);LabMission.on('ready',refreshSide);
    addEventListener('lab:themechange',refreshSide);
    let saved=null;try{saved=localStorage.getItem(SIDE_KEY);}catch{}
    setSide('steps',wide()&&saved!=='0',false);badge(); // 手機、窄螢幕一律先收成把手，不蓋題目
  }
  document.addEventListener('DOMContentLoaded',()=>{
    buildProblem();feedback(true);buildSide();
    by('exam-answer').onsubmit=check;by('explain').onclick=()=>openSolution(true);
    by('class-mode').onclick=()=>{const url=new URL(location.href);if(params.get('class')==='1')url.searchParams.delete('class');else url.searchParams.set('class','1');location.assign(url.href);};
    by('class-mode').setAttribute('aria-pressed',String(params.get('class')==='1'));
    if(params.has('line')&&(state.correct||state.attempts>=2||params.get('class')==='1'))openSolution(true);
    LabMission.on('ready',()=>{if(storageKey()!==owner){owner=storageKey();state=load();feedback(true);
      if(params.has('line')&&!mounted&&(state.correct||state.attempts>=2))openSolution(true);}emit();});
  });
})();
