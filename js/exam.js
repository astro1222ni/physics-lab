/* Question intake and answer feedback; LearnEngine owns the lesson transport. */
(() => {
  'use strict';
  const {number:q,question:Q,questions}=Exam114, unit='exam-114-'+q;
  const by=id=>document.getElementById(id), T=(z,e)=>LabSettings.t(z,e), tr=pair=>T(...pair);
  const make=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
  const params=new URLSearchParams(location.search);
  const tracks=ExamTracks['Q'+q], points=Q.key?2:4;
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
    LabMission.emit('exam-progress',{unit,first:state.first===true,correct:!!state.correct,viewed:!!state.viewed,experiment:!!state.experiment});
  }
  function save(){try{localStorage.setItem(storageKey(),JSON.stringify(state));}catch{}emit();}
  function milestone(key){if(!state[key]){state[key]=true;save();}}
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
      const a=make('a',T('第 '+n+' 題','Q'+n));const url=new URL(location.href);url.searchParams.set('q',n);
      ['line','seg','p','t'].forEach(k=>url.searchParams.delete(k));a.href=url.href;a.title=tr(question.title);
      if(+n===q)a.setAttribute('aria-current','page');by('exam-nav').append(a);
    }
    by('kind').textContent=T('114 學測自然','114 GSAT Science')+'　/　'+T('第 '+q+' 題','Question '+q);
    by('point-label').textContent=(Q.key?T('多選','Multiple response'):T('非選','Constructed response'))+' · '+T(points+' 分',points+' points');
    by('exam-title').textContent=tr(Q.title);
    if(Q.group){
      const d=by('passage');d.hidden=false;d.open=q===23;d.querySelector('summary').textContent=tr(Q.group);
      const body=d.querySelector('div');for(const para of Q.passage)body.append(paragraph(tr(para)));
      if(q===49){const im=make('img');im.src='img/exam114/fig12-14'+(LabSettings.lang==='en'?'-en':'')+'.png';im.alt=T('圖 12 神經細胞、圖 13 傳訊放大圖、圖 14 膜電容與三條並聯支路','Original figures 12–14: neurons, magnified signaling, membrane capacitor and three parallel branches');body.append(im);}
    }
    if(Q.stem)by('problem-text').append(paragraph(tr(Q.stem)));
    by('problem-text').append(paragraph(tr(Q.ask)));
    if(q===49){by('opening-art').hidden=true;by('figures').hidden=false;by('figure-tabs').hidden=false;
      by('figure-tabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;
        by('figures').dataset.figure=b.dataset.figure;for(const tab of by('figure-tabs').children)tab.setAttribute('aria-pressed',String(tab===b));};
      circuit();ExamScene.preview(by('printed-graph'),q);}
    else{const figure=by('opening-art');figure.querySelector('figcaption').textContent=q===19?T('地球、近地軌道與同步軌道','Earth, low Earth orbit and synchronous orbit'):T('地球端監測太空船傳回的訊號','Earth monitors the signal from the spacecraft');
      ExamScene.preview(figure.querySelector('canvas'),q);}
    const fields=by('answer-fields');
    if(Q.key) Q.choices.forEach((pair,i)=>{
      const row=make('label');row.className='exam-choice';const box=make('input');box.type='checkbox';box.name='choice';box.value='ABCDE'[i];
      const caption=make('span');rich(caption,tr(pair));row.append(box,make('b',box.value),caption);fields.append(row);
    });
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
    if(!Q.key){body.append(paragraph(T('大考中心未公布非選題得分率','The CEEC did not publish a national score rate for this constructed-response question.')),paragraph(T('大考中心評分原則：(a) 45–55 mV、(b) 125–175 Ω 都給分，單位必寫。','CEEC marking ranges: (a) 45–55 mV and (b) 125–175 Ω. Include both units.')));return;}
    body.append(paragraph(T('全國得分率 ','National score rate ')+Q.rate+'%'));
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
    if(rec.score<points)result.append(paragraph(tr(Q.hint)));
    if(restore){if(Q.key){document.querySelectorAll('[name=choice]').forEach(x=>x.checked=rec.selected.includes(x.value));}
      else rec.fields.forEach(({value,unit},i)=>{by('value-'+i).value=value;by('unit-'+i).value=unit;});}
    statistics();by('national').open=rec.score===points;
  }
  async function check(e){
    e.preventDefault();const btn=by('send-answer');if(btn.disabled)return;btn.disabled=true;
    try{
      let rec;
      if(Q.key){const selected=[...document.querySelectorAll('[name=choice]:checked')].map(x=>x.value).join('');
        if(!selected){by('result').hidden=false;by('result').textContent=T('請先勾選你的答案。','Select your answer first.');return;}
        rec={selected,...ExamPhysics.multiple(selected,Q.key)};
      }else{
        const fields=[0,1].map(i=>({value:by('value-'+i).value,unit:by('unit-'+i).value}));
        if(fields.every(f=>!f.value.trim())){by('value-0').focus();return;}
        rec={fields,...await ExamPhysics.gradeChannel(fields,LearnEngine)};
      }
      const ok=rec.score===points;if(!state.attempts)state.first=ok;
      state.correct=!!state.correct||ok;state.attempts=(state.attempts||0)+1;state.last=rec;save();feedback();
      if(LabSettings.get('sound'))LabSound.tone({freq:ok?740:295,dur:.14,type:'triangle',gain:.15});
    }finally{btn.disabled=false;}
  }
  function openSolution(scroll){
    by('explanation').hidden=false;
    if(!mounted){
      const timing={},audio={};const pages=tracks.map(row=>{
        const speech=[subtitle(row.disp),subtitle(row.en)];timing[row.id]={dur:row.duration+.6,marks:{}};audio[row.id]=true;
        return {...row,speech,caption:speech.map(s=>s.replace(focusWords[q],'**$&**')),title:Q.groups[row.row]};
      });
      const select=by('sentence');for(const [i,p] of pages.entries()){
        const opt=make('option',(i+1)+' · '+tr(p.title));opt.value=i;select.append(opt);}
      const presentation={tabs:['concept','missions','comments'],bindNavigation(go){select.onchange=()=>go(+select.value);},
        show(p,i){select.value=i;by('folio').textContent=(i+1)+' / '+pages.length;if(p.row===Q.mid)by('experiment').open=true;},
        viewed(all){if(all)milestone('viewed');}
      };
      window.LearnUnit={id:unit,slug:'exam-114',pages,presentation,reveal:{},board:id=>{
        const p=pages.find(page=>page.id===id),formula=specific[id]||formulas[p.row];
        const lines=params.get('class')==='1'?formula.split(',\\quad'): [formula];
        return lines.map(line=>['',line.trim()]);}};
      window.LearnTimings={zh:timing,en:timing,audio:{zh:audio,en:audio}};
      window.LearnScene={create:()=>ExamScene.lesson(by('lesson-art'),q)};
      mounted=true;LearnEngine.mount();
    }
    if(scroll)by('explanation').scrollIntoView({block:'start'});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    buildProblem();feedback(true);
    by('exam-answer').onsubmit=check;by('explain').onclick=()=>openSolution(true);
    by('class-mode').onclick=()=>{const url=new URL(location.href);if(params.get('class')==='1')url.searchParams.delete('class');else url.searchParams.set('class','1');location.assign(url.href);};
    by('class-mode').setAttribute('aria-pressed',String(params.get('class')==='1'));
    if(params.has('line')&&(state.correct||state.attempts>=2||params.get('class')==='1'))openSolution(true);
    LabMission.on('ready',()=>{if(storageKey()!==owner){owner=storageKey();state=load();feedback(true);
      if(params.has('line')&&!mounted&&(state.correct||state.attempts>=2))openSolution(true);}emit();});
  });
})();
