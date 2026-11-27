/* 生涯決策工作頁。人物、滑桿、活動與紀錄只存在這一頁的記憶體。 */
(function () {
  'use strict';
  const C=window.CareerBalance, D=window.LabDraw, slug='career-decision-balance';
  const $=id=>document.getElementById(id), T=(zh,en)=>LabSettings.t(zh,en), L=p=>T(...p);
  const cv=$('cv'), ctx=cv.getContext('2d'), pct=x=>(x*100).toFixed(1)+'%', pp=x=>(x*100).toFixed(1);
  const shortFields=[['數理化','Sciences'],['資訊','Computing'],['建築設計','Design']];
  const compactEnglish=['Engineering','Health','Life sciences','Bioresources','Earth sciences','Arts',
    'Soc. & psych.','Media','Languages','Humanities','Education','Law & politics','Management','Finance','Sport & leisure'];
  const defaultSettings=()=>({fields:[0,1,2],sigma:{},seed:C.SEED,trials:C.TRIALS,fixed:false,floor:1,floorCriterion:5});
  let settings=defaultSettings();
  const criterion=i=>L(C.criteria[i]), fullField=i=>L(C.fields[settings.fields[i]]);
  const field=i=>{
    const id=settings.fields[i];
    return shortFields[id]?L(shortFields[id]):T(C.fields[id][0].replace(/學群$/,''),compactEnglish[id-3]);
  };
  function activityName(i){
    if(i===1 && settings.fields[2]!==2)return T(field(2)+'體驗營',field(2)+' field camp');
    if(i===2 && settings.fields[1]!==1)return T(field(1)+'公開課',field(1)+' open course');
    return L(C.activities[i].name);
  }
  const noField=()=>T('無合格學群','No eligible field');
  const leaderLabel=a=>a.rank.tied.length?a.rank.tied.map(field).join(' / '):noField();
  const trialsLabel=()=>settings.trials.toLocaleString('en-US');
  const titles={score:['學群適配分數','Field fit scores'],probe:['還差多少會翻盤？','Distance to a switch'],chance:['模擬首名比例','Simulated win shares'],map:['權重與領先區域','Map of leading fields']};
  const cornerNames=[['頂端','Top'],['左下','Lower left'],['右下','Lower right']];
  const progressText=[
    [['讀一個虛構案例，辨認三個要比較的學群。','Read a fictional case and identify its three fields.'],['三個學群與六項評分都已備妥。','The three fields and their six ratings are ready.'],'#profile'],
    [['改一項權重，看長條如何消長。','Change a weight and watch the bars.'],['改變一項考量在這個案例的占比。','Change a criterion’s share in this case.'],'#w0'],
    [['選一項考量，檢驗第一名在何處會換人。','Test where changing a criterion can switch the leader.'],['到翻盤圖選一項，再按檢驗判讀。','Select a criterion in the switches view and test it.'],'#testPivot'],
    [['安排探索活動，比對相同權重下的前後差異。','Plan exploration and compare its effect at fixed weights.'],['先加入活動，再比對探索前後。','Add an activity, then compare the exploration results.'],'#effect'],
    [['讀過勝出機率後，完成這次判讀。','Read the win shares and finish the decision note.'],['看過機率圖，再到探索分頁完成判讀。','View the chances chart, then finish the note in Explore.'],'#finish']
  ];
  const state={profile:0,raw:C.profiles[0].weights.slice(),ids:[],axes:[0,1,2],criterion:0,view:'score',
    checked:false,compared:false,sawChance:false,finished:false,base:null,log:[]};
  let now,bare,facets,palette=[],inks=[],chart={},handles=[],drag=null,frame=0,three=null,viewRequest=0,side=null;
  const revised=()=>state.ids.length>0 || !C.same(state.raw,C.profiles[state.profile].weights);
  let bed=null;
  function updateSound(){
    const active=now && state.view==='chance' && !state.finished && !document.hidden && LabSound.enabled();
    if(!active){if(bed)bed.forEach(v=>v.stop(.12));bed=null;return;}
    const flutter=Math.max(0,1-2*Math.abs(Math.max(...now.prob)-.5));
    if(!bed || !bed[0].playing)bed=[LabSound.voice({freq:392,gain:.033}),LabSound.voice({freq:392+7*flutter,gain:.03*flutter})];
    else bed[1].set({freq:392+7*flutter,gain:.03*flutter},.12);
  }
  function text(id,value){if($(id).textContent!==value) $(id).textContent=value;}
  function note(v){text('viewMsg',v);}
  function caseName(){return L(C.profiles[state.profile].name);}
  function paletteUpdate(){
    const css=getComputedStyle(document.documentElement);
    palette=['--pos','--b-wave','--equi','--b-optics','--probe','--neg'].map(k=>css.getPropertyValue(k).trim());
    inks=[palette[0],palette[1],palette[3]];
    document.querySelectorAll('[data-crit]').forEach(el=>el.style.setProperty('--k',palette[+el.dataset.crit]));
  }
  function options(el,items){el.replaceChildren(...items.map((name,i)=>new Option(name,''+i)));}
  options($('criterion'),C.criteria.map(L));
  cornerNames.forEach((name,i)=>{
    const label=document.createElement('label'), select=document.createElement('select');
    label.append(document.createTextNode(L(name)),select); select.id='axis'+i;options(select,C.criteria.map(L));$('axes').append(label);
    select.addEventListener('change',()=>{
      const choice=+select.value, other=state.axes.indexOf(choice);
      if(other>=0) state.axes[other]=state.axes[i];
      state.axes[i]=choice; if(state.view!=='3d') setView('map'); update(false);
    });
  });
  function recolorLegend(){
    const weights=state.view==='score', names=weights?C.criteria.map(L):[0,1,2].map(fullField);
    $('legend').replaceChildren();
    if(state.view==='probe') { text('legend',T('向左為降低占比，向右為提高占比；長條越短，越容易換人領先。','Left lowers a share. Right raises it. Shorter bars mean an easier switch.')); return; }
    names.forEach((name,i)=>{
      const el=document.createElement('span'), icon=document.createElement('i');
      el.style.setProperty('--k',(weights?palette:inks)[i]);el.append(icon,name);$('legend').append(el);
    });
  }
  function refreshScore(){
    now=C.analyze(state.profile,state.raw,state.ids,settings);
    bare=state.ids.length?C.analyze(state.profile,state.raw,[],settings):now;
    facets=C.triangle(now.model.mean,now.w,state.axes,now.eligible);
  }
  function currentFractions(){
    const vals=state.axes.map(i=>now.w[i]), total=C.sum(vals);
    return total?vals.map(v=>v/total):[1/3,1/3,1/3];
  }
  function setShares(b){
    if(state.axes.every(i=>now.w[i]<=C.EPS)){note(T('先給一個頂點正權重，旗子才有占比可以分配。','Give one corner a positive weight before moving the flag.'));return;}
    const nonnegative=b.map(v=>Math.max(0,v)), n=C.sum(nonnegative);
    if(!n)return;
    changeRaw(C.sliderUnits(C.sliceWeights(now.w,state.axes,nonnegative.map(v=>v/n)),C.sum(state.raw)));
  }
  function changeRaw(raw){
    if(!C.sum(raw)){syncSliders();note(T('至少保留一項正權重，才能計算各項占比。','Keep at least one positive weight so shares can be calculated.'));return;}
    if(C.same(raw,state.raw))return;
    state.raw=raw;state.checked=false;state.compared=false;state.finished=false;state.sawChance=state.view==='chance';
    text('effectText','');note('');syncSliders();update(true);
  }
  function syncSliders(){syncExact();state.raw.forEach((v,i)=>{
    const out=document.querySelector('output[for="w'+i+'"]');
    if(!out.dataset.editing)out.textContent=String(+v.toFixed(3));
  });}
  function impact(a){
    return [0,1,2].map(r=>{
      const cells=a.cells.filter(c=>c[0]===r);
      return cells.length?field(r)+' · '+cells.map(c=>criterion(c[1])).join(T('、',', ')):'';
    }).filter(Boolean).join(' / ');
  }
  function buildActivities(){
    $('activityList').replaceChildren();
    C.activities.forEach((a,i)=>{
      const button=document.createElement('button');button.type='button';button.className='activity';button.dataset.activity=i;
      const name=document.createElement('b'), cost=document.createElement('span'), target=document.createElement('small');
      name.textContent=activityName(i);cost.textContent=a.hours+' h';target.textContent=impact(a);
      const grip=document.createElement('span');grip.className='grip';grip.textContent='⠿';grip.setAttribute('aria-hidden','true');
      button.append(grip,name,cost,target);button.addEventListener('click',()=>{if(!suppressTap) add(i);});$('activityList').append(button);
    });
  }
  function showPlan(){
    text('hours',T('已安排 ','Scheduled ')+now.hours+' / 20 h');$('budgetFill').style.width=(5*now.hours)+'%';
    $('timeline').replaceChildren();
    if(!state.ids.length) text('timeline',T('把第一張活動卡放進來','Drop the first activity here'));
    let t=0;
    for(const i of state.ids){
      const a=C.activities[i], start=t;t+=a.hours;
      const btn=document.createElement('button');btn.type='button';btn.textContent=start+'–'+t+' h · '+activityName(i)+' ×';
      btn.setAttribute('aria-label',T('移除','Remove')+' '+activityName(i));btn.addEventListener('click',()=>setPlan(state.ids.filter(v=>v!==i)));
      $('timeline').append(btn);
    }
    document.querySelectorAll('[data-activity]').forEach(el=>{const i=+el.dataset.activity;el.disabled=C.addActivity(state.ids,i)===state.ids;});
    $('effect').disabled=!state.ids.length;$('finish').disabled=!state.ids.length;
  }
  function setPlan(ids){state.ids=ids;state.checked=false;state.compared=false;state.sawChance=state.view==='chance';state.finished=false;text('effectText','');note('');update(true);}
  function add(i){const ids=C.addActivity(state.ids,i);if(ids!==state.ids)setPlan(ids);}
  function matrix(){
    const rows=C.criteria.map((name,c)=>'<tr><th scope="row">'+L(name)+'</th>'+now.model.mean.map((r,i)=>'<td>'+r[c].toFixed(2)+'<small>σ '+now.model.sigma[i][c].toFixed(2)+'</small></td>').join('')+'</tr>');
    $('matrix').innerHTML='<thead><tr><th scope="col">'+T('考量','Criterion')+'</th>'+[0,1,2].map(i=>'<th scope="col">'+field(i)+(now.eligible.includes(i)?'':T('（未達標）',' (excluded)'))+'</th>').join('')+'</tr></thead><tbody>'+rows.join('')+'</tbody>';
    text('filterResult',criterion(settings.floorCriterion)+' ≥ '+settings.floor.toFixed(2)+' · '+(now.eligible.length?now.eligible.map(field).join(' / ')+T(' 合格',' eligible'):noField()));
    const intervals=now.eligible.map(i=>field(i)+' '+pct(now.interval[i][0])+'–'+pct(now.interval[i][1]));
    text('chancePrecision',intervals.length?T('首名比例的保守誤差界（至少 95% 把握）','Conservative margins (at least 95% coverage)')+' · '+intervals.join(' / '):noField());
    if(now.eligible.length<2){text('uncertainty',T('至少兩個學群合格才有分差。','A gap requires two eligible fields.'));return;}
    text('uncertainty',T('前兩名分差的標準差 ','Standard deviation of the top-two gap ')+now.gapSigma.toFixed(3)+T(' 分。',' points.'));
  }
  function dataFor(type){
    const ref=type==='compare'?state.base:((type==='explore'||type==='plan')?bare:now);
    if(!ref)return null;
    return Object.assign(C.observation(now,ref,state.criterion,state.axes,revised()),
      C.readingHistory(now,state.base,state.criterion,state.baseView));
  }
  function preview(){
    if(!window.LabMission)return;
    // These are last measured scalar results for the shared hints, never raw weights or ratings.
    const reading=dataFor('score');
    for(const type of ['score','chance','map','probe']) LabMission.emit('preview-'+type,reading);
    const effect=dataFor('explore');LabMission.emit('preview-explore',effect);LabMission.emit('preview-plan',effect);
    const cmp=dataFor('compare');LabMission.emit('preview-compare',cmp||{revised:0});
  }
  function publishObservation(type){const data=dataFor(type);if(data&&window.LabMission)LabMission.emit(type,data);}
  function steps(){
    const done=[true,revised(),state.checked,state.compared,state.finished], current=done.indexOf(false);
    return progressText.map(([label,need,target],i)=>({html:L(label),target,done:done[i],current:i===current,need:[[done[i],...need]]}));
  }
  function stepTarget(i){
    if(i===3 && !state.ids.length)return document.querySelector('[data-activity="0"]');
    if(i===4 && !state.sawChance)return $('viewChance');
    return document.querySelector(progressText[i][2]);
  }
  function projection(){
    const tied=now.rank.tied.length>1, a=now.rank.order[0];
    text('lead',a===undefined?noField():tied?T('並列','Tie'):field(a));text('margin',now.eligible.length<2?'—':now.rank.gap.toFixed(3));text('win',a===undefined||tied?'—':pct(now.prob[a]));
    $('lead').style.color=a===undefined||tied?'var(--text)':inks[a];
    const distinct=now.pivots.map((p,k)=>({p,k})).filter(x=>x.p.delta!==null).sort((a,b)=>Math.abs(a.p.delta)-Math.abs(b.p.delta));
    const nearest=distinct[0], leaders=now.rank.order.slice(0,2);
    const idea=nearest && C.activities.find((act,i)=>C.addActivity(state.ids,i)!==state.ids && act.cells.some(([r,k])=>leaders.includes(r)&&k===nearest.k));
    const difference=now.rank.gap.toFixed(3),spread=now.gapSigma.toFixed(3);
    const reading=now.eligible.length<2?T('合格學群不足兩個，無法比較領先分差。可在資料分頁調整最低分。','Fewer than two fields qualify. Change the minimum in Data to compare a lead.') : now.rank.gap<now.gapSigma
      ?T('前兩名只差 '+difference+' 分，小於分差的標準差 '+spread+' 分。先保留兩個方向。','The top two differ by '+difference+' points, less than the gap’s standard deviation of '+spread+'. Keep both options open.')
      :T('領先 '+difference+' 分，分差的標準差為 '+spread+' 分。再看看更換權重後能否維持領先。','The lead is '+difference+' points and the gap’s standard deviation is '+spread+'. Check whether the lead survives a change of weights.');
    const dominant=now.rank.first>=0 && now.model.mean[now.rank.first].every((v,k)=>now.model.mean.every((r,i)=>i===now.rank.first || v>r[k]+C.EPS));
    const next=nearest?T('先想想「'+criterion(nearest.k)+'」該占多少，它離翻盤最近。','First reconsider the share of '+criterion(nearest.k)+', the criterion closest to a switch.'):
      dominant?T('逐欄都由同一個學群領先，因此任何有效權重都沒有翻轉。','The same field leads every column. It stays first for every admissible choice of weights.'):'';
    const ideaName=idea?activityName(C.activities.indexOf(idea)):'';
    const act=idea?T('若拿不準這一欄的評分，可'+ideaName+'（'+idea.hours+' 小時）。','To clarify a rating in this column, try '+ideaName+' ('+idea.hours+' h).'):
      nearest?T('目前可排的活動中，沒有直接釐清前兩名這一欄的線索。','None of the remaining affordable activities targets this rating for the top two.'):'';
    text('nextStep',[reading,next,act].filter(Boolean).join(T('',' ')));
    state.raw.forEach((_,i)=>text('share'+i,pct(now.w[i])));
    const p=now.pivots[state.criterion], sign=p.delta===null?'':p.delta<0?'−':'+';
    text('pivotText',p.at===null?criterion(state.criterion)+T('：沿這個方向調整，沒有換人領先的交界。',' · No switch of leader along this line.'):
      criterion(state.criterion)+T('占比 ',' share ')+pct(now.w[state.criterion])+' → '+pct(p.at)+T('，還差 ',' · change ')+sign+pp(Math.abs(p.delta))+T(' 個百分點。',' pp.'));
    const pairLabel=pair=>pair.map(field).join(' / ');
    const exceptions=[
      ...p.parallel.map(pair=>pairLabel(pair)+T('：兩線平行',' · parallel lines')),
      ...p.coincident.map(pair=>pairLabel(pair)+T('：全程同分',' · tied throughout')),
      ...p.endpoints.map(e=>pairLabel(e.pair)+T('：端點平手 ',' · endpoint tie at ')+pct(e.at))
    ];
    text('lineCases',exceptions.join(T('。',' · ')));$('lineCases').hidden=!exceptions.length;
    $('conclusion').options[1].disabled=now.rank.first<0;
    if(now.rank.first<0)$('conclusion').value='open';
    $('toPivot').disabled=p.at===null;
    const captions={
      score:[T('分段長條','Stacked scores'),T('拖交界可改權重。長條下的鬚線是總分上下各一個標準差。','Drag a divider to reweight. Whiskers show one standard deviation on either side of the score.')],
      probe:[T('翻盤距離','Switch distance'),T('選考量看交界。占比變動越小，排名越敏感。','Select a criterion. A smaller change means a more sensitive ranking.')],
      chance:[trialsLabel()+T(' 次抽樣',' draws'),T('± 是單一學群首名比例的保守誤差界（Hoeffding 不等式，至少 95% 把握，比一般信賴區間寬），單位為百分點。','± is a conservative margin per field (Hoeffding bound, at least 95% coverage, wider than a usual confidence interval), in percentage points.')],
      map:[T('權重旗','Weight flag'),T('拖旗改變三項的相對比重，跨色就換人領先。','Drag to redistribute three shares. A colour change marks a new leader.')],
      '3d':[T('立體地形','Relief map'),T('谷線上兩強平手。拖旗改權重，拖空白處轉動或平移。','Two fields tie in a valley. Drag the flag to reweight, or the board to orbit or pan.')]
    };
    if(now.eligible.length<2){
      const missing=T('不足兩個學群達標，沒有可比較的領先分差。','Fewer than two eligible fields. There is no leading margin to compare.');
      captions.map[1]=missing;captions['3d'][1]=missing;captions.probe[1]=missing;
    }
    const title=$('chanceTitle').firstElementChild;
    title.textContent=settings.fixed?T('依本案例的分布假設，模擬中排第一的比例（固定評分）','How often does each field rank first with fixed ratings?'):
      T('依本案例的分布假設，模擬中排第一的比例（均勻抽樣）','Under uniform sampling, how often does each field rank first?');
    const cap=captions[state.view];$('caption').replaceChildren();const lead=document.createElement('strong');lead.textContent=cap[0];$('caption').append(lead,' · '+cap[1]);
    text('record',state.view==='probe'?T('檢驗判讀','Test criterion'):T('記錄讀圖','Record chart'));
    $('compare').disabled=!state.base;
    $('criterion').value=String(state.criterion);state.axes.forEach((v,i)=>{$('axis'+i).value=String(v);});
    const defined=steps();LabStepGuide.update(defined.findIndex(s=>s.current),{key:slug,auto:true});updateSound();
  }
  function update(announce){
    refreshScore();showPlan();matrix();recolorLegend();projection();requestDraw();
    if(three)three.update(sceneData());if(announce)preview();
  }
  function addLog(message){state.log.push(message);const li=document.createElement('li');li.textContent=message;$('log').append(li);note(message);}
  function resultsLabel(){if(now.eligible.length<2)return leaderLabel(now);return leaderLabel(now)+T('領先分差 ',' · lead ')+now.rank.gap.toFixed(3)+T(' 分',' points');}
  function soundRead(){
    if(!LabSound.enabled())return;
    const chance=Math.max(...now.prob), flutter=Math.max(0,1-2*Math.abs(chance-.5));
    // Two close voices beat more noticeably near even odds. Play one short listening window per observation.
    LabSound.tone({freq:392,dur:.62,gain:.16});LabSound.tone({freq:392+7*flutter,dur:.62,gain:.14*flutter});
  }
  function probe(){
    state.checked=true;projection();publishObservation('probe');addLog($('pivotText').textContent);soundRead();
  }
  function record(){
    if(state.view==='probe'){probe();return;}
    const type=state.view==='3d'?'map':state.view;
    publishObservation(type);addLog(L(titles[type])+' · '+resultsLabel()+(type==='chance'?' · '+now.prob.map(pct).join(' / '):''));soundRead();
  }
  function comparePlan(finish){
    if(!state.ids.length)return;
    const summary=a=>leaderLabel(a)+(a.rank.first<0?'':' ('+pct(a.prob[a.rank.first])+')');
    const msg=T('相同權重，探索前後','Fixed weights, before → after')+' · '+summary(bare)+' → '+summary(now)+', '+now.hours+' h';
    text('effectText',msg);state.compared=true;
    if(finish){
      if(!state.sawChance){setView('chance');note(T('先讀三個學群的勝出率，再按一次完成判讀。','Read the three win shares, then finish the note again.'));return;}
      const conclusion=$('conclusion').value==='open'?T('探索後仍未定','Still undecided after exploration'):
        T('暫採 ','Tentatively favour ')+field(now.rank.first);
      state.finished=true;publishObservation('plan');addLog(T('完成判讀','Decision note')+' · '+conclusion+' · '+msg);
      text('effectText',conclusion+' · '+msg);
      if(LabSound.enabled())[523.25,659.25,783.99].forEach((freq,i)=>LabSound.tone({freq,delay:i*.07,dur:.36,gain:.15}));
    }else{publishObservation('explore');addLog(msg);soundRead();}
    projection();
  }
  function initCase(n){
    settings=defaultSettings();
    state.profile=n;state.raw=C.profiles[n].weights.slice();state.base=null;state.log=[];state.criterion=0;state.axes=[0,1,2];
    syncModelControls();buildActivities();$('log').replaceChildren();$('conclusion').value='open';setPlan([]);syncSliders();
  }
  function clearAll(){
    state.base=null;state.log=[];$('log').replaceChildren();$('conclusion').value='open';setPlan([]);note(T('已清除活動、基準與判讀紀錄。','Activities, baseline and decision notes cleared.'));
  }
  function requestDraw(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(!cv.hidden)draw();});}
  const line=(x1,y1,x2,y2,color,width=1)=>{ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
  function rect(x,y,w,h,r,fill){D.roundRect(ctx,x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
  function label(t,x,y,size=14,color=D.c.text,align='left',weight=550){
    ctx.font=weight+' '+(size*(LabSettings.get('fs')||1))+'px '+D.FONT;
    if(align==='center'){const half=ctx.measureText(t).width/2;x=C.clamp(x,half+3,cv.clientWidth-half-3);}
    ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(t,x,y);
  }
  function sheet(w,h){
    const c=D.c, dark=D.dark, paper=D.mix(c['canvas-bg'],c.equi,dark?.045:.043);
    const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,D.shade(paper,dark?.035:.015));g.addColorStop(1,D.mix(paper,c.accent,.055));
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=16)line(x+.5,0,x+.5,h,D.alpha(c.muted,x%64===0?.105:.047));
    for(let y=0;y<h;y+=16)line(0,y+.5,w,y+.5,D.alpha(c.muted,y%64===0?.105:.047));
    const left=chart.left;
    line(left-9,0,left-9,h,D.alpha(palette[0],.33));
    for(let y=17;y<h-4;y+=32){rect(3,y,7,4,2,D.alpha(c.text,.17));line(3,y+4,9,y+4,D.alpha(c.surface,.8));}
    const x=chart.left+2, top=chart.compact?18:25;
    label(L(titles[state.view]),x,top,chart.narrow?17:20,c.text,'left',750);
    const key=caseName()+T('的案例','’s case');
    if(w>490||!chart.large)label(key,w-(chart.narrow?53:16),top,13,c.muted,'right',600);
    line(x,top+16,w-14,top+16,D.alpha(c.text,.18));
  }
  function glyph(i,x,y,color){
    if(settings.fields[i]!==i){label(String(i+1),x,y,13,color,'center',700);return;}
    ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.lineWidth=1.7;ctx.lineCap='round';ctx.lineJoin='round';
    if(i===0){for(const a of [-.7,.7]){ctx.beginPath();ctx.ellipse(0,0,8,3.3,a,0,Math.PI*2);ctx.stroke();}ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,1.5,0,7);ctx.fill();}
    else if(i===1){for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*3,-5);ctx.lineTo(side*8,0);ctx.lineTo(side*3,5);ctx.stroke();}}
    else{ctx.beginPath();ctx.moveTo(-6,6);ctx.lineTo(-6,-6);ctx.lineTo(7,6);ctx.closePath();ctx.stroke();line(-3,2,-3,-.5,color);line(0,5,0,3,color);}
    ctx.restore();
  }
  function drawScores(w,h){
    const left=chart.left+4, right=w-chart.right, span=right-left, top=chart.compact?36:53, bottom=h-24;
    const row=(bottom-top)/3, barHeight=Math.min(24,row*.30);handles=[];
    for(let j=0;j<=5;j++){const x=left+span*j/5;line(x,top+2,x,bottom,D.alpha(D.c.muted,.17));label(String(j),x,h-11,12,D.c.muted,'center');}
    for(let r=0;r<3;r++){
      const y=top+row*(r+.56), cy=y-barHeight/2-(chart.compact?11:15);
      glyph(r,left+9,cy,inks[r]);label(chart.narrow?field(r):fullField(r),left+24,cy,chart.narrow?14:16,D.c.text,'left',650);
      const end=left+span*now.totals[r]/5;
      label(now.eligible.includes(r)?now.totals[r].toFixed(3):T('未達標','Excluded'),end,cy,18,inks[r],'right',750);
      rect(left,y,span,barHeight,4,D.alpha(D.c.muted,.11));let x=left;
      now.model.mean[r].forEach((v,c)=>{
        const width=span*now.w[c]*v/5;
        if(width>0){const g=ctx.createLinearGradient(0,y,0,y+barHeight);g.addColorStop(0,D.shade(palette[c],.18));g.addColorStop(1,D.shade(palette[c],-.12));
          ctx.fillStyle=g;ctx.fillRect(x,y,width,barHeight);line(x,y+1,x+width,y+1,D.alpha('#ffffff',.35));}
        x+=width;
        if(c<5){handles.push({x,y:y+barHeight/2,r,c,left,span});if(width>1)line(x,y+1,x,y+barHeight-1,D.c.surface,1.5);
          if(width>15){rect(x-2,y+barHeight*.32,4,barHeight*.37,2,D.alpha(D.c.surface,.78));}}
      });
      line(x,y-2,x,y+barHeight+2,D.alpha(D.c.text,.73),1.6);
      const sigma=Math.hypot(...now.model.sigma[r].map((s,c)=>s*now.w[c])), half=span*sigma/5,wy=y+barHeight+(chart.compact?4:7);
      line(end-half,wy,end+half,wy,inks[r],1.8);line(end-half,wy-3,end-half,wy+3,inks[r],1.5);line(end+half,wy-3,end+half,wy+3,inks[r],1.5);
    }
  }
  function drawProbe(w,h){
    const top=chart.compact?40:58,bottom=h-18, row=(bottom-top)/6;
    const left=chart.left+3, x=left+(chart.narrow?(chart.large?100:82):125), right=w-14;
    const mid=x+(right-x)/2, range=(right-x)/2-4;
    const lim=Math.max(.05,...now.pivots.map(p=>Math.abs(p.delta||0)));
    line(mid,top-2,mid,bottom,D.alpha(D.c.text,.45));
    chart.probe={top,row};
    now.pivots.forEach((p,i)=>{
      const y=top+(i+.5)*row,selected=i===state.criterion, col=palette[i];
      if(selected)rect(left-4,y-row*.47,right-left+5,row*.94,5,D.alpha(col,.13));
      label(criterion(i),left,y,13,D.c.text,'left',selected?750:500);
      if(p.delta===null){label(T('無翻盤','No switch'),mid,y,13,D.c.muted,'center');return;}
      const end=mid+p.delta/lim*range;
      rect(Math.min(mid,end),y+1,Math.max(1,Math.abs(end-mid)),Math.min(7,row*.24),2,col);
      const v=(p.delta<0?'−':'+')+pp(Math.abs(p.delta));
      label(v,p.delta<0?mid-4:mid+4,y-6,13,D.c.text,p.delta<0?'right':'left',650);
    });
    if(!chart.compact)label(T('占比變動（百分點）','Share change (pp)'),mid,h-9,12,D.c.muted,'center');
  }
  function drawChance(w,h){
    const top=chart.compact?38:49, cy=(h+top)/2, rad=Math.max(28,Math.min((h-top)*.36,w*.165)), x=chart.left+rad+5;
    const thick=rad*.34;let angle=-Math.PI/2;
    now.prob.forEach((p,i)=>{const end=angle+p*Math.PI*2;if(p>0){
      ctx.beginPath();ctx.arc(x,cy,rad-thick/2,angle+.003,end-.003<angle+.003?end:end-.003);
      ctx.strokeStyle=inks[i];ctx.lineWidth=thick;ctx.lineCap='butt';ctx.stroke();
    }angle=end;});ctx.lineCap='round';
    label(trialsLabel(),x,cy-4,chart.narrow?18:26,D.c.text,'center',800);label(T('次抽樣','draws'),x,cy+16,13,D.c.muted,'center');
    const start=x+rad+Math.max(11,w*.035),end=w-14,row=Math.min((h-top)/3,69);
    now.prob.forEach((p,i)=>{const y=cy+(i-1)*row;
      rect(start,y-11,4,25,2,inks[i]);label(field(i),start+10,y-8,13,D.c.muted);
      label(now.eligible.includes(i)?pct(p)+' ± '+pp(now.margin):T('未達標','Excluded'),start+10,y+13,chart.narrow?15:19,D.c.text,'left',750);
      if(end-start>300){const l=start+170;rect(l,y+7,end-l,5,2,D.alpha(inks[i],.15));rect(l,y+7,(end-l)*p,5,2,inks[i]);}
    });
  }
  function triPoint(b){return {x:b.reduce((s,v,i)=>s+v*chart.tri[i].x,0),y:b.reduce((s,v,i)=>s+v*chart.tri[i].y,0)};}
  function fromPoint(x,y){
    const [a,b,c]=chart.tri;const top=(b.y-y)/(b.y-a.y), right=(x-b.x-top*(a.x-b.x))/(c.x-b.x);
    return [top,1-top-right,right];
  }
  function drawMap(w,h){
    const top=chart.compact?62:80,bottom=h-29,rightPad=chart.narrow?55:22;
    const dx=Math.min((w-chart.left-rightPad-12)*.47,(bottom-top)*.77),cx=(w+chart.left-rightPad)/2;
    chart.tri=[{x:cx,y:top},{x:cx-dx,y:bottom},{x:cx+dx,y:bottom}];
    const centers=Array.from({length:3},()=>({area:0,x:0,y:0}));
    facets.forEach(f=>{
      const ps=f.poly.map(v=>triPoint(v.p));ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
      const g=ctx.createLinearGradient(cx-dx,top,cx+dx,bottom);g.addColorStop(0,D.mix(D.c['canvas-bg'],inks[f.winner],.42));g.addColorStop(1,D.mix(D.c['canvas-bg'],inks[f.winner],.7));ctx.fillStyle=g;ctx.fill();
      f.poly.forEach((v,i)=>{const next=f.poly[(i+1)%ps.length];if(v.h<C.EPS&&next.h<C.EPS)line(ps[i].x,ps[i].y,ps[(i+1)%ps.length].x,ps[(i+1)%ps.length].y,D.c.text,2);});
      const center=centers[f.winner],a=ps[0];
      for(let i=1;i<ps.length-1;i++){
        const b=ps[i],c=ps[i+1],area=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
        center.area+=area;center.x+=area*(a.x+b.x+c.x)/3;center.y+=area*(a.y+b.y+c.y)/3;
      }
    });
    for(let k=0;k<3;k++)for(let j=0;j<5;j++){
      const b=[0,0,0],c=[0,0,0];b[k]=c[k]=j/5;b[(k+1)%3]=1-j/5;c[(k+2)%3]=1-j/5;
      const p=triPoint(b),q=triPoint(c);line(p.x,p.y,q.x,q.y,D.alpha(D.c.text,j?.22:.7),j?.8:1.4);
    }
    chart.tri.forEach((p,i)=>label(criterion(state.axes[i]),p.x,p.y+(i?14:-12),13,D.c.text,'center',650));
    const flag=triPoint(currentFractions());chart.flag=flag;
    centers.forEach((m,i)=>{
      if(m.area<1400)return;
      const x=m.x/m.area,y=m.y/m.area;
      const scale=LabSettings.get('fs')||1;
      if(Math.hypot(x-flag.x,y-flag.y)>31*scale)D.pill(ctx,field(i),x,y+8,D.c.text,'center','650 '+(13*scale)+'px '+D.FONT);
    });
    ctx.beginPath();ctx.arc(flag.x,flag.y,7,0,2*Math.PI);ctx.fillStyle=D.c.surface;ctx.fill();ctx.strokeStyle=D.c.text;ctx.lineWidth=2;ctx.stroke();
    line(flag.x,flag.y-2,flag.x,flag.y-24,D.c.text,2);
    ctx.beginPath();ctx.moveTo(flag.x+1,flag.y-24);ctx.lineTo(flag.x+18,flag.y-20);ctx.lineTo(flag.x+1,flag.y-15);ctx.closePath();ctx.fillStyle=palette[0];ctx.fill();
  }
  function draw(){
    const r=cv.getBoundingClientRect();if(r.width<2||r.height<2||cv.hidden)return;
    const dpr=Math.min(devicePixelRatio||1,2), w=r.width,h=r.height;
    if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);}
    ctx.setTransform(cv.width/w,0,0,cv.height/h,0,0);
    chart={left:w<470?22:34,right:w<470?32:20,compact:h<245,narrow:w<460,large:LabSettings.get('fs')>1.12};ctx.lineJoin='round';ctx.lineCap='round';sheet(w,h);
    ({score:drawScores,probe:drawProbe,chance:drawChance,map:drawMap})[state.view]?.(w,h);
  }
  function sceneData(){return {facets,axes:state.axes.map(criterion),bary:currentFractions(),gap:now.rank.gap,inks:inks.slice(),flag:palette[0],theme:D.ver};}
  async function setView(v){
    $('chanceTitle').hidden=v!=='chance';
    const ticket=++viewRequest;state.view=v;cv.dataset.mode=v;cv.hidden=v==='3d';$('host3').hidden=v!=='3d';
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===v)));
    if(v==='chance')state.sawChance=true;
    if(v!=='3d'&&three){three.dispose();three=null;}
    note('');projection();recolorLegend();requestDraw();
    if(v==='3d'&&!three){
      try{
        const mod=await import('./career-decision-balance-3d.js');
        if(ticket!==viewRequest)return;
        three=mod.makeTerrain($('host3'),sceneData(),setShares,T,()=>{
          setView('map');note(T('立體繪圖已中斷，可繼續使用平面權重圖。','3D rendering was interrupted. The weight map is available.'));
        });
      }catch(err){
        if(ticket!==viewRequest)return;
        setView('map');note(T('此裝置無法開啟立體地形，可在平面權重圖繼續拖旗。','3D is unavailable on this device. Drag the flag on the weight map.'));
        console.warn('3D:',err.message);
      }
    }
  }
  function localPoint(e){const r=cv.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function nearestDivider(p){
    let found=null, distance=Infinity;
    for(const q of handles){const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<distance && d<=25 && Math.abs(q.y-p.y)<=22){found=q;distance=d;}}
    return found;
  }
  cv.addEventListener('pointerdown',e=>{
    const p=localPoint(e);
    if(state.view==='probe'&&chart.probe){const c=Math.floor((p.y-chart.probe.top)/chart.probe.row);
      if(c>=0&&c<6){state.criterion=c;projection();requestDraw();preview();}return;}
    if(state.view==='score'){const hit=nearestDivider(p);if(!hit)return;drag={hit,start:p,raw:state.raw.slice()};}
    else if(state.view==='map'&&chart.tri){
      const b=fromPoint(p.x,p.y), onFlag=Math.hypot(p.x-chart.flag.x,p.y-chart.flag.y+8)<28;
      if(!onFlag && Math.min(...b)<0)return;drag={map:true};if(!onFlag)setShares(b);
    } else return;
    e.preventDefault();cv.setPointerCapture(e.pointerId);cv.style.cursor='grabbing';
  });
  cv.addEventListener('pointermove',e=>{
    const p=localPoint(e);
    if(!drag){if(state.view==='score')cv.style.cursor=nearestDivider(p)?'ew-resize':'default';return;}
    if(drag.map){setShares(fromPoint(p.x,p.y));return;}
    const {hit,raw,start}=drag, c=hit.c;
    const change=(p.x-start.x)/hit.span*5*C.sum(raw)/now.model.mean[hit.r][c];
    const transfer=C.clamp(change,Math.max(-raw[c],raw[c+1]-10),Math.min(10-raw[c],raw[c+1]));
    const out=raw.slice();out[c]+=transfer;out[c+1]-=transfer;changeRaw(out);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(event=>cv.addEventListener(event,()=>{drag=null;cv.style.cursor='';}));
  function nudge(dir,step=.02){
    const d=LabVPad.delta(dir,step), b=currentFractions();
    setShares([b[0]+d.y,b[1]-d.y/2-d.x/2,b[2]-d.y/2+d.x/2]);
  }
  cv.addEventListener('keydown',e=>{
    const key={ArrowUp:1,ArrowLeft:3,ArrowRight:5,ArrowDown:7}[e.key];
    if(state.view==='map'&&key!==undefined){e.preventDefault();nudge(key,e.shiftKey?.08:.02);}
    if(e.key==='Enter')record();
  });
  $('nudges').addEventListener('click',e=>{const btn=e.target.closest('[data-dir]');if(btn){if(state.view!=='3d')setView('map');nudge(+btn.dataset.dir);}});
  let cardDrag=null,suppressTap=false;
  const tray=$('timeline');
  $('activityList').addEventListener('pointerdown',e=>{
    const card=e.target.closest('[data-activity]');if(!card||card.disabled||(e.pointerType==='touch'&&!e.target.closest('.grip')))return;
    cardDrag={id:e.pointerId,card,i:+card.dataset.activity,x:e.clientX,y:e.clientY,ghost:null};
    card.setPointerCapture(e.pointerId);
  });
  $('activityList').addEventListener('pointermove',e=>{
    if(!cardDrag||cardDrag.id!==e.pointerId)return;
    if(!cardDrag.ghost&&Math.hypot(e.clientX-cardDrag.x,e.clientY-cardDrag.y)>6){
      suppressTap=true;const ghost=document.createElement('div');ghost.className='card-ghost';ghost.textContent=activityName(cardDrag.i);
      document.body.append(ghost);cardDrag.ghost=ghost;
    }
    if(cardDrag.ghost){
      cardDrag.ghost.style.left=e.clientX+'px';cardDrag.ghost.style.top=(e.clientY-28)+'px';
      tray.classList.toggle('over',tray.contains(document.elementFromPoint(e.clientX,e.clientY)));
    }
  });
  function endCard(e){
    if(!cardDrag||e.pointerId!==cardDrag.id)return;
    const dragged=cardDrag, landed=tray.contains(document.elementFromPoint(e.clientX,e.clientY));cardDrag=null;
    if(dragged.ghost){dragged.ghost.remove();if(landed&&e.type==='pointerup')add(dragged.i);}
    tray.classList.remove('over');setTimeout(()=>{suppressTap=false;},0);
  }
  $('activityList').addEventListener('pointerup',endCard);$('activityList').addEventListener('pointercancel',endCard);
  let syncing=false;
  // LabNum.set also updates its precise-value cache when a map drag lands between slider ticks.
  function syncExact(){
    syncing=true;
    try{state.raw.forEach((v,i)=>{const el=$('w'+i);if(Math.abs(LabNum.value(el)-v)>.0005)LabNum.set(el,v);});}
    finally{syncing=false;}
  }
  state.raw.forEach((_,i)=>$('w'+i).addEventListener('input',()=>{
    if(syncing)return;const raw=state.raw.slice();raw[i]=LabNum.value($('w'+i));changeRaw(raw);
  }));
  const sigmaKey=()=>settings.fields[+$('sigmaField').value]+','+$('sigmaCriterion').value;
  function syncSigma(){
    const id=settings.fields[+$('sigmaField').value], k=+$('sigmaCriterion').value, row=C.ratingRow(state.profile,id);
    const el=$('sigmaValue'), v=settings.sigma[sigmaKey()]??row.sigma[k];
    LabNum.clear(el);el.max=(Math.floor(C.maxSigma(row.mean[k])*100)/100).toString();el.value=v;
    el.disabled=settings.fixed;$('redraw').disabled=settings.fixed;
    document.querySelector('output[for=sigmaValue]').textContent=(settings.fixed?0:v).toFixed(2);
  }
  function syncModelControls(){
    settings.fields.forEach((id,i)=>{
      const select=$('field'+i);options(select,C.fields.map(L));select.value=id;
      for(const opt of select.options)opt.disabled=settings.fields.includes(+opt.value)&&+opt.value!==id;
    });
    const selectedRow=$('sigmaField').value||'0';
    options($('sigmaField'),[0,1,2].map(fullField));$('sigmaField').value=selectedRow;
    if(!$('sigmaCriterion').options.length)options($('sigmaCriterion'),C.criteria.map(L));
    options($('floorCriterion'),C.criteria.map(L));$('floorCriterion').value=settings.floorCriterion;
    LabNum.clear($('floorValue'));$('floorValue').value=settings.floor;document.querySelector('output[for=floorValue]').textContent=settings.floor.toFixed(2);
    $('trials').value=settings.trials;$('variation').value=settings.fixed?'fixed':'random';$('drawSeed').value=settings.seed;
    text('retentions',C.activities.map((a,i)=>activityName(i)+' '+pct(a.retain)).join(' / '));syncSigma();
  }
  function modelChanged(resetPlan=false){
    state.base=null;state.log=[];$('log').replaceChildren();$('conclusion').value='open';
    syncModelControls();buildActivities();setPlan(resetPlan?[]:state.ids);
  }
  ['evenWeights','interestWeights','costWeights'].forEach((id,i)=>$(id).addEventListener('click',()=>changeRaw(C.presets[i].slice())));
  settings.fields.forEach((_,i)=>$('field'+i).addEventListener('change',()=>{
    settings.fields[i]=+$('field'+i).value;settings.sigma={};modelChanged(true);
  }));
  ['sigmaField','sigmaCriterion'].forEach(id=>$(id).addEventListener('change',syncSigma));
  $('sigmaValue').addEventListener('input',()=>{
    const value=LabNum.value($('sigmaValue')), k=+$('sigmaCriterion').value, id=settings.fields[+$('sigmaField').value];
    if(value===C.ratingRow(state.profile,id).sigma[k])delete settings.sigma[sigmaKey()];
    else settings.sigma[sigmaKey()]=value;
    modelChanged();
  });
  $('floorValue').addEventListener('input',()=>{settings.floor=LabNum.value($('floorValue'));modelChanged();});
  $('floorCriterion').addEventListener('change',()=>{settings.floorCriterion=+$('floorCriterion').value;modelChanged();});
  $('variation').addEventListener('change',()=>{settings.fixed=$('variation').value==='fixed';modelChanged();});
  $('trials').addEventListener('change',()=>{settings.trials=+$('trials').value;modelChanged();});
  $('drawSeed').addEventListener('change',()=>{
    const seed=$('drawSeed').valueAsNumber;
    if(Number.isInteger(seed)&&seed>=1&&seed<=0xffffffff){settings.seed=seed;modelChanged();}
    else {$('drawSeed').value=settings.seed;note(T('種子須為 1 到 4294967295 的整數。','Enter an integer seed from 1 to 4294967295.'));}
  });
  $('redraw').addEventListener('click',()=>{
    let seed;do{seed=crypto.getRandomValues(new Uint32Array(1))[0];}while(!seed||seed===settings.seed);
    settings.seed=seed;modelChanged();
  });
  $('viewSampling').addEventListener('click',()=>{setView('chance');$('board').scrollIntoView({block:'center'});});
  $('restoreModel').addEventListener('click',()=>{settings=defaultSettings();modelChanged(true);});
  $('profile').addEventListener('change',()=>initCase(+$('profile').value));
  $('criterion').addEventListener('change',()=>{state.criterion=+$('criterion').value;setView('probe');preview();});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  $('topCam').addEventListener('click',()=>three?.cameraPreset(true));$('resetCam').addEventListener('click',()=>three?.cameraPreset(false));
  $('testPivot').addEventListener('click',()=>{setView('probe');probe();});
  $('toPivot').addEventListener('click',()=>{
    const p=now.pivots[state.criterion];if(p.at===null)return;
    setView('probe');changeRaw(C.sliderUnits(C.redistribute(now.w,state.criterion,p.at),C.sum(state.raw)));
    note(T('已移到解析交界。切換總分圖，可檢查平手的分數。','At the analytical boundary. Open Scores to inspect the tie.'));
  });
  $('saveBase').addEventListener('click',()=>{state.base=now;state.baseView=state.view;projection();preview();addLog(T('基準','Baseline')+' · '+resultsLabel());});
  $('compare').addEventListener('click',()=>{
    if(!state.base)return;publishObservation('compare');
    const old=state.base;addLog(T('基準比對','Baseline comparison')+' · '+leaderLabel(old)+' → '+leaderLabel(now)+T('，分差 ', ', gap ')+old.rank.gap.toFixed(3)+' → '+now.rank.gap.toFixed(3));soundRead();
  });
  $('effect').addEventListener('click',()=>comparePlan(false));$('finish').addEventListener('click',()=>comparePlan(true));
  $('record').addEventListener('click',record);$('clearAll').addEventListener('click',clearAll);
  $('openPlan').addEventListener('click',()=>{LabDeck.reveal($('timeline'));$('timeline').scrollIntoView({block:'nearest',behavior:'instant'});});
  function soundLabel(){const on=LabSound.enabled();$('soundBtn').setAttribute('aria-pressed',String(on));text('soundBtn',on?T('音效開','Sound on'):T('音效關','Sound off'));}
  $('soundBtn').addEventListener('click',()=>{LabSettings.set('sound',!LabSound.enabled());soundLabel();});
  window.addEventListener('lab:settingschange',e=>{if(e.detail?.name==='sound'){soundLabel();updateSound();}else requestDraw();});
  document.addEventListener('visibilitychange',updateSound);
  window.addEventListener('lab:themechange',()=>{if(!now)return;paletteUpdate();recolorLegend();projection();requestDraw();if(three)three.update(sceneData());});
  function boot(){
    LabStepGuide.define(progressText.map(([,need],i)=>({target:()=>stepTarget(i),hint:()=>L(need),action:i===1?'drag':'tap'})),{key:slug});
    side=LabSide.mount({module:slug,steps,guide:i=>{LabDeck.reveal(stepTarget(i));LabStepGuide.show(i,{key:slug});}});
    state.raw.forEach((_,i)=>{const share=document.createElement('small');share.id='share'+i;document.querySelector('label[for=w'+i+']').append(share);});
    syncModelControls();paletteUpdate();buildActivities();syncSliders();update(false);soundLabel();cv.dataset.mode='score';

    new ResizeObserver(requestDraw).observe(cv);
  }
  document.addEventListener('DOMContentLoaded',boot,{once:true});
})();
