(function () {
  'use strict';
  const C = window.SirEpidemicCore, D = window.LabDraw, N = window.LabNum;
  const T = window.LabSettings.t, $ = id => document.getElementById(id);
  const cv = $('cv'), roll = $('roll'), layer = document.createElement('canvas');
  const percent = (n, digits = 1) => (100 * n).toFixed(digits) + '%';
  const dayText = n => T('第 ' + n + ' 天', 'Day ' + n);
  const ids = ['basic', 'immune', 'mask', 'air'];
  const fs = () => Number(LabSettings.get('fs')) || 1;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const compact=matchMedia('(orientation: landscape) and (max-height: 600px)');
  const groupNames={s:['尚可被感染','Susceptible'],i:['目前有傳染力','Infectious'],r:['免疫或已移出','Immune or removed']};
  // Shared settings apply 70% of the font-size increase to every canvas setter.
  // Compensate once so chart text follows the same full scale as the HTML readouts.
  function chartFont(px,weight='400') {
    const scale=fs(), shared=1+.7*(scale-1);
    return weight+' '+(px*scale/shared)+'px '+D.FONT;
  }
  function reText(value) {
    const {number,side}=C.reReading(value);
    if(side===null) return number;
    return number+' '+(side>0?T('↑高於 1','↑above 1'):side<0?T('↓低於 1','↓below 1'):T('＝等於 1','=equal to 1'));
  }
  const colors = () => ({ s: D.c.neg, i: D.c.pos, r: D.c.probe, re: D.c.equi });
  let settings, result, data, reference = null, recorded = null;
  const guideKey='sir-epidemic';
  let basicMoved=false, dayMoved=false, caseScope, book;
  const awaitingAward=new Map();
  let span = 60, plot, staticDirty = true, grabbed = null, hover = false;
  let running = false, advancing = false, animation = 0, lastTime = null, playDay = 0, taps = 0;
  let room = null, viewToken = 0, rollKey = '';

  function surface(canvas, bounds) {
    const w = Math.round(bounds.width), h = Math.round(bounds.height);
    if (w < 2 || h < 2) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w*ratio) || canvas.height !== Math.round(h*ratio)) {
      canvas.width = Math.round(w*ratio); canvas.height = Math.round(h*ratio);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width/w, 0, 0, canvas.height/h, 0, 0);
    return { ctx, w, h };
  }

  function stroke(g, pts, color, width, dash = []) {
    g.beginPath();
    pts.forEach(([x,y], n) => n ? g.lineTo(x,y) : g.moveTo(x,y));
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash);
    g.lineJoin = g.lineCap = 'round'; g.stroke(); g.setLineDash([]);
  }

  function chartLayer(bounds) {
    const { ctx: g, w, h } = surface(layer, bounds);
    const sf = fs(), l = 12 + 26*sf, r = w - 12 - 13*sf, t = 12 + 20*sf, b = h - 12 - 20*sf;
    const yMax = Math.max(2, Math.ceil(result.initialRe + .25));
    const x = d => l + (r-l)*d/span, y = fraction => b - (b-t)*fraction;
    const yr = re => y(re / yMax);
    plot = { w, h, l, r, t, b, x, y, yr };
    const col = colors(), tick = chartFont(13), label = chartFont(14,'600');
    D.backdrop(g,w,h);
    const wash = g.createLinearGradient(0,t,0,b);
    wash.addColorStop(0,D.alpha(D.c.neg,.045)); wash.addColorStop(1,D.alpha(D.c.surface,0));
    g.fillStyle = wash; g.fillRect(l,t,r-l,b-t);
    for (let k = 0; k <= 12; k++) {
      const px = x(span*k/12);
      stroke(g,[[px,t],[px,b]],D.alpha(D.c.muted,k%3 ? .085 : .19),1);
      if (k%3 === 0) {
        const caption = String(span*k/12) + (k === 12 ? T(' 天',' d') : '');
        g.font = tick;
        const tx = Math.min(px,w-4-g.measureText(caption).width/2);
        D.haloText(g,caption,tx,b+7,D.c.muted,'center','top',tick);
      }
    }
    for (let k = 0; k <= 4; k++) {
      const py = y(k/4);
      stroke(g,[[l,py],[r,py]],D.alpha(D.c.muted,.18),1);
      D.haloText(g,String(k*25),l-6,py,D.c.muted,'right','middle',tick);
    }
    for (let k = 0; k <= yMax; k++) {
      D.haloText(g,String(k),r+6,yr(k),col.re,'left','middle',tick);
    }
    const shareTitle = T('人口 %','Share %');
    D.haloText(g,shareTitle,l,13*sf,D.c.muted,'left','middle',label);
    // Separate glyphs keep the subscript on canvas at every font scale.
    D.haloText(g,'R',r-3*sf,13*sf,col.re,'right','middle',chartFont(16,'600'));
    D.haloText(g,'e',r-3*sf,18*sf,col.re,'left','middle',chartFont(13));

    const visible = result.points.slice(0,span+1);
    if (result.crossing && result.crossing.day > 0 && result.crossing.day < span) {
      visible.splice(Math.floor(result.crossing.day)+1,0,{
        ...result.crossing, r: 1-result.crossing.s-result.crossing.i
      });
    }
    const curve = (rows,key) => rows.map(p => [x(p.day),key === 're' ? yr(p.re) : y(p[key])]);
    const fill = g.createLinearGradient(0,t,0,b);
    fill.addColorStop(0,D.alpha(col.i,.32)); fill.addColorStop(1,D.alpha(col.i,.045));
    const infected = curve(visible,'i');
    g.beginPath(); g.moveTo(l,b); infected.forEach(p=>g.lineTo(...p)); g.lineTo(r,b); g.closePath();
    g.fillStyle = fill; g.fill();
    stroke(g,[[l,yr(1)],[r,yr(1)]],D.alpha(col.re,.72),1.4,[6,5]);
    if (reference) stroke(g,curve(reference.result.points.slice(0,span+1),'i'),D.c.muted,2.4,[2,5]);
    stroke(g,curve(visible,'s'),col.s,2.4);
    stroke(g,curve(visible,'r'),col.r,2.4,[10,4]);
    stroke(g,infected,col.i,2.8,[4,3]);
    stroke(g,curve(visible,'re'),col.re,2.5,[2,4]);

    const cx = x(result.peakDay), cy = y(result.peak);
    if (result.peakDay <= span) {
      const cross = result.crossing;
      if (cross) {
        stroke(g,[[cx,t],[cx,Math.max(yr(1),cy)]],D.alpha(D.c.field,.45),1.2,[3,4]);
        g.save(); g.translate(cx,yr(1)); g.rotate(Math.PI/4); g.fillStyle = col.re;
        g.strokeStyle = D.c['canvas-bg']; g.lineWidth = 1.6; g.fillRect(-4,-4,8,8); g.strokeRect(-4,-4,8,8); g.restore();
      }
      D.ball(g,cx,cy,4.5,col.i,{shadow:false});
      const caption = T('高峰 ','Peak ') + result.peakDay.toFixed(1) + T(' 天',' d');
      g.font = label;
      const half = (g.measureText(caption).width + 16)/2;
      const minX = l + g.measureText(shareTitle).width + 6*sf + half;
      const maxX = r - 17*sf - half;
      const hasRoom = minX <= maxX;
      const tagX = hasRoom ? Math.min(maxX,Math.max(minX,cx)) : Math.min(r-half,Math.max(l+half,cx));
      const tagY = t + (hasRoom ? 4 : 24*sf);
      if (Math.abs(tagX-cx)>half) {
        const edge = tagX + Math.sign(cx-tagX)*(half-2);
        stroke(g,[[cx,t],[cx,tagY+2],[edge,tagY+2]],D.alpha(col.i,.58),1);
      }
      D.pill(g,caption,tagX,tagY,col.i,'center',label);
    }
    staticDirty = false;
  }

  function drawGraph() {
    if (room || !data || $('view2').hidden) return;
    const bounds = cv.getBoundingClientRect();
    const s = surface(cv,bounds);
    if (!s) return;
    if (staticDirty || !plot || s.w !== plot.w || s.h !== plot.h || layer.width !== cv.width) chartLayer(bounds);
    const {ctx:g,w,h} = s, {x,y,yr,t,b} = plot, px = x(data.day);
    g.drawImage(layer,0,0,w,h);
    if (hover || grabbed !== null) {
      g.fillStyle = D.alpha(D.c.accent,.09); g.fillRect(px-10,t,20,b-t);
    }
    stroke(g,[[px,t],[px,b]],D.c.field,grabbed !== null ? 2.3 : 1.5,[4,3]);
    const col = colors();
    for (const key of ['s','r','i','re']) {
      const py = key === 're' ? yr(data.re) : y(data[key]);
      g.beginPath();
      if(key==='s') g.arc(px,py,3.5,0,2*Math.PI);
      else if(key==='r') g.rect(px-3.3,py-3.3,6.6,6.6);
      else if(key==='i') {g.moveTo(px,py-4.5);g.lineTo(px+4.3,py+3.5);g.lineTo(px-4.3,py+3.5);g.closePath();}
      else {g.moveTo(px,py-4.2);g.lineTo(px+3.8,py);g.lineTo(px,py+4.2);g.lineTo(px-3.8,py);g.closePath();}
      g.fillStyle=col[key];g.fill();
      g.strokeStyle=D.c['canvas-bg']; g.lineWidth=1.3; g.stroke();
    }
    g.beginPath(); g.moveTo(px-5,b+1); g.lineTo(px+5,b+1); g.lineTo(px,b-6); g.closePath();
    g.fillStyle = D.c.field; g.fill();
  }

  const classPick=$('rollClass');
  classPick.add(new Option(T('全校 · 20 × 20','Whole school · 20 × 20'),'all'));
  for(let cls=1;cls<=10;cls++) classPick.add(new Option(T('第 '+cls+' 班 · 40 人','Class '+cls+' · 40 students'),String(cls-1)));
  const roster=roll.closest('details');
  const rollLayout=()=>{
    roster.open=!compact.matches;
    $('resetCam').textContent=compact.matches?T('全景','Overview'):T('校園全景','Overview');
    $('closeCam').textContent=compact.matches?T('窗前','Windows'):T('教室窗前','By the classroom');
  };
  rollLayout(); compact.addEventListener('change',rollLayout);
  roster.addEventListener('toggle',()=>{rollKey='';drawRoll();});
  classPick.addEventListener('change',()=>{roll.classList.toggle('class-detail',classPick.value!=='all');rollKey='';drawRoll();});

  // One seat per student; the close-up uses exactly the same seats as its class in the overview.
  function drawRoll() {
    if(!roster.open || !data) return;
    const surface2d=surface(roll,roll.getBoundingClientRect());
    if(!surface2d) return;
    const {ctx:g,w,h}=surface2d,n=data.counts,overview=classPick.value==='all';
    const key=[roll.width,roll.height,D.ver,n.s,n.i,n.r,classPick.value].join('/');
    if(key===rollKey) return;
    rollKey=key;
    const cols=overview?20:10,rows=overview?20:4;
    const gutter=overview?Math.min(4,w*.009):0, pad=overview?2:6;
    const cell=Math.min((w-2*pad-gutter)/cols,(h-2*pad-4*gutter)/rows);
    const mark=cell*(overview?.89:.79);
    const left=(w-cols*cell-gutter)/2, top=(h-rows*cell-(overview?4*gutter:0))/2;
    const col=colors();
    g.clearRect(0,0,w,h);g.fillStyle=D.c['canvas-bg'];g.fillRect(0,0,w,h);
    const selected=Number(classPick.value),classCounts={s:0,i:0,r:0};
    for(let row=0;row<rows;row++) for(let c=0;c<cols;c++) {
      const seat=overview?row*20+c:(Math.floor(selected/2)*4+row)*20+(selected%2)*10+c;
      const kind=C.groupAt(seat,n);
      classCounts[kind]++;
      const x=left+(c+.5)*cell+(overview&&c>=10?gutter:0);
      const y=top+(row+.5)*cell+(overview?Math.floor(row/4)*gutter:0);
      const r=mark/2;
      g.fillStyle=col[kind];g.beginPath();
      if(kind==='s') g.arc(x,y,r,0,Math.PI*2);
      else if(kind==='i') {g.moveTo(x,y-r);g.lineTo(x+r,y+r);g.lineTo(x-r,y+r);g.closePath();}
      else g.roundRect(x-r,y-r,mark,mark,Math.max(1,r*.13));
      g.fill();
      // A head and shoulders cut into each coloured attendance stamp.
      const ink=D.c['canvas-bg'], shift=kind==='i'?r*.19:0;
      g.fillStyle=ink;g.beginPath();g.arc(x,y-r*.26+shift,r*.22,0,2*Math.PI);g.fill();
      g.beginPath();g.moveTo(x-r*.43,y+r*.43+shift);g.quadraticCurveTo(x-r*.37,y-r*.08+shift,x,y+shift);
      g.quadraticCurveTo(x+r*.37,y-r*.08+shift,x+r*.43,y+r*.43+shift);g.closePath();g.fill();
    }
    const desc=Object.keys(classCounts).map(k=>T(...groupNames[k])+' '+classCounts[k]).join(' · ');
    roll.setAttribute('aria-label',classPick.selectedOptions[0].text+' · '+desc);
    $('classCount').hidden=overview;
    if(!overview) $('classCount').textContent=T('本班','This class')+' · S '+classCounts.s+' · I '+classCounts.i+' · R '+classCounts.r;
  }

  const readingNodes = new Map();
  function reading(id, zh, en, value) {
    let pair = readingNodes.get(id);
    if (!pair) {
      pair = [document.createElement('dt'),document.createElement('dd')];
      $('readout').append(...pair); readingNodes.set(id,pair);
      pair[0].textContent=T(zh,en);pair[0].dataset.reading=id;
    }
    pair.forEach(el=>{el.hidden = value === null;});
    if (value !== null) pair[1].textContent=value;
  }
  function updateReadings() {
    $('dayStamp').textContent=dayText(data.day);
    $('dayo').textContent=String(data.day);
    cv.setAttribute('aria-valuenow',String(data.day)); cv.setAttribute('aria-valuetext',dayText(data.day));
    $('todayRe').textContent=reText(data.re);
    $('peakText').textContent=dayText(result.peakDay.toFixed(1))+' · '+percent(result.peak);
    for (const k of ['s','i','r']) $('count'+k.toUpperCase()).textContent=String(data.counts[k]);
    reading('sShare','易感 S','Susceptible S',percent(data.s));
    reading('iShare','具傳染力 I','Infectious I',percent(data.i,7));
    reading('rShare','初始免疫或已移出 R','Initially immune or removed R',percent(data.r));
    reading('effective','防治後再生數（全員易感）','With controls, if all susceptible',result.effective.toFixed(3));
    reading('re','起初有效再生數','Initial effective reproduction',reText(result.initialRe));
    reading('peak','具傳染力比例高峰時刻','Time of peak infectious share',dayText(result.peakDay.toFixed(2)));
    reading('cross','金線向下穿過 1','Downward crossing of one',result.reCrossDay === null ? T('無向下穿越','No downward crossing') : dayText(result.reCrossDay.toFixed(2)));
    reading('peakI','高峰比例','Peak infectious share',percent(result.peak));
    reading('yesterdayRate','昨日同時的新增感染速率（全校占比／天）','Yesterday’s infection rate (% of school per day)',data.day ? percent(data.yesterday.dailyIncidence,7) : '—');
    reading('rate','當下新增感染速率（全校占比／天）','Current infection rate (% of school per day)',percent(data.dailyIncidence,7));
    reading('yesterdayI','昨天同時的具傳染力比例','Yesterday’s infectious share',data.day ? percent(data.yesterday.i,7) : '—');
    reading('new','過去 24 小時新增','New in the past 24 hours',data.day ? percent(data.dailyNew,3) : '—');
    reading('cumulative','自起點累計新增','New infections since the start',percent(data.cumulativeInfected));
    reading('threshold','基準群體免疫門檻','Baseline immunity threshold',percent(result.threshold));
    reading('effectiveThreshold','防治後有效門檻','Threshold with controls',percent(result.effectiveThreshold,2));
    reading('by180','第 180 天累計新增（不含起始感染者）','New infections by day 180 (excludes initial cases)',percent(result.newByEnd));
    reading('final','最終曾感染（模型長期預測，含起始感染者）','Ever infected (long-term projection, includes initial cases)',percent(result.finalInfected));
    reading('finalNonSusceptible','最終非易感（含初始免疫）','Finally non-susceptible (includes initial immunity)',percent(result.finalNonSusceptible,2));
    reading('ref','基準日期與高峰','Reference day and peak',reference ? dayText(reference.data.day)+' · '+percent(reference.data.peak) : null);
    reading('refRe','基準當天的有效再生數','Effective reproduction on the saved day',reference?reText(reference.data.re):null);
    reading('refI','基準記錄當天的 I','Infectious on the saved day',reference ? percent(reference.data.i,4) : null);
    reading('refRate','基準日新增感染速率（全校占比／天）','Saved infection rate (% of school per day)',reference ? percent(reference.data.dailyIncidence,7) : null);
    reading('difference','高峰差（百分點）','Peak difference (pp)',reference ? ((data.peak-reference.data.peak)*100).toFixed(1) : null);
    $('refKey').hidden=!reference;
    $('clearReference').disabled=!reference && !recorded;
  }
  // Store only local case assignments. Returning to a date, view or reference never creates a new case.
  function notebook() {
    const scope=window.LabMission?._state.user?.uid || '';
    if(scope!==caseScope) {
      caseScope=scope;
      let entries=[];
      try { entries=JSON.parse(sessionStorage.getItem(guideKey+'/cases/'+scope)) || []; }
      catch { /* The notebook also works in memory. */ }
      book=C.casebook(entries);
    }
    return book;
  }
  function caseOwner(d) {
    const saved=notebook().owner(d);
    if(saved) return saved;
    const state=window.LabMission?._state, key=C.scenarioKey(d);
    for(const [id,entry] of awaitingAward) {
      if(entry.scope && entry.scope!==caseScope) {awaitingAward.delete(id);continue;}
      // A failed or cancelled score write releases the reservation for another observation.
      if(!entry.mission.pending && state?.ready && state.nickname && !state.done[id]) {awaitingAward.delete(id);continue;}
      if(entry.key===key) return id;
    }
    return null;
  }
  function measurement() { return {...data,prior:reference?.data || null,caseMission:caseOwner(data)}; }
  function recordObservation() {
    const d=measurement(), lm=window.LabMission;
    d.previousCase=!!d.caseMission;
    if(lm && !d.caseMission && !window.LabShare?.restoring) {
      const state=lm._state, blocker=lm.blocker();
      if(!blocker || blocker==='loading' || blocker==='nickname') {
        const event={type:'recorded',data:d};
        const matches=(lm.all()[guideKey]||[]).filter(m=>!m.pending && !awaitingAward.has(m.id) &&
          !state.done[m.id] && lm.modeAllows(m) && m.check(event,{}));
        if(matches.length===1) {
          const mission=matches[0];
          d.caseMission=mission.id;
          awaitingAward.set(mission.id,{mission,scope:caseScope,key:C.scenarioKey(d),data:d});
        }
      }
    }
    lm?.emit('recorded',d);
    return d;
  }
  window.LabMission?.on('complete',mission=>{
    const entry=awaitingAward.get(mission?.id);
    if(!entry) return;
    awaitingAward.delete(mission.id);
    const current=notebook();
    if(entry.scope && entry.scope!==caseScope) return;
    current.record(entry.data,[mission.id]);
    try { sessionStorage.setItem(guideKey+'/cases/'+caseScope,JSON.stringify(current.entries())); }
    catch { /* The completed case remains in this page's notebook. */ }
  });
  function changed() {
    const lm=window.LabMission, d=measurement();
    lm?.emit('observed',d);
    // The same live predicates drive the textual hint and the cue on the actual button.
    const tasks=lm?.all()[guideKey] || [];
    const ready=tasks.some(m=>(m.id===guideKey+'-8'||m.id===guideKey+'-10') &&
      !lm._state.done[m.id] && m.check({type:'recorded',data:d},{}));
    $('record').toggleAttribute('data-ready',ready);
    updateGuide();
  }
  function refreshDay() {
    const day = Math.round(N.value($('day')));
    if (day > span) setSpan(C.DAYS);
    data=C.measurement(settings,result,day);
    updateReadings(); syncPlay(); drawGraph(); drawRoll();
    room?.update(data);
  }
  function scenario() {
    settings = { basic:N.value($('basic')), immune:N.value($('immune'))/100,
      mask:N.value($('mask'))/100, air:N.value($('air'))/100 };
    result=C.simulate(settings); staticDirty=true;
    ids.forEach(id=>{ $(id+'o').textContent=N.value($(id))+(id==='basic'?'':'%'); });
    refreshDay();
  }
  function setSpan(value) {
    span=value; staticDirty=true;
    $('spanBtn').textContent = span === 60 ? T('展開至 180 天','Show 180 days') : T('放大前 60 天','Zoom to 60 days');
  }
  $('spanBtn').addEventListener('click',()=>{
    stop(); setSpan(span === 60 ? C.DAYS : 60);
    if (data.day>span) N.set($('day'),span); else drawGraph();
  });

  function moveCursor(e) {
    if (!plot) return;
    const x=e.clientX-cv.getBoundingClientRect().left;
    N.set($('day'),Math.max(0,Math.min(span,Math.round((x-plot.l)*span/(plot.r-plot.l)))));
  }
  cv.addEventListener('pointerdown',e=>{
    if (!e.isPrimary || e.button !== 0) return;
    stop(); grabbed=e.pointerId; cv.setPointerCapture(grabbed); moveCursor(e);
  });
  cv.addEventListener('pointermove',e=>{ if(grabbed===e.pointerId) moveCursor(e); });
  function release(e) {
    if (grabbed!==e.pointerId) return;
    grabbed=null; if(cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId);
    drawGraph();
  }
  for (const name of ['pointerup','pointercancel','lostpointercapture']) cv.addEventListener(name,release);
  cv.addEventListener('pointerenter',()=>{hover=true;drawGraph();});
  cv.addEventListener('pointerleave',()=>{hover=false;drawGraph();});
  cv.addEventListener('keydown',e=>{
    const keys = { ArrowLeft:data.day-1, ArrowRight:data.day+1, ArrowDown:data.day-1, ArrowUp:data.day+1,
      PageDown:data.day-10, PageUp:data.day+10, Home:0, End:C.DAYS };
    if (e.key in keys) {e.preventDefault(); N.set($('day'),keys[e.key]);}
  });

  function syncPlay() {
    const play=$('play');
    play.textContent=motion.matches?(data?.day===C.DAYS?T('回起點','Go to start'):T('看第 180 天','View day 180')):(running?T('暫停','Pause'):T('播放','Play'));
    play.setAttribute('aria-pressed',String(running));
  }
  motion.addEventListener('change',()=>{stop();});
  function stop() { running=false; lastTime=null; cancelAnimationFrame(animation); taps=0; syncPlay(); }
  function chime() { LabSound.sweep({from:820,to:360,dur:.27,gain:.15}); }
  function tick(time) {
    if (!running) return;
    const dt=lastTime===null?0:Math.min((time-lastTime)/1000,1/30);
    const old=playDay; lastTime=time; playDay=Math.min(C.DAYS,playDay+5*dt);
    if (LabSound.enabled() && playDay>old) {
      const crossing=result.reCrossDay;
      if (crossing !== null && old<crossing && playDay>=crossing) chime();
      // One tap represents four expected new cases. Carry fractional taps forward.
      const amount=C.integrateIncidence(result.points,old,playDay)*C.PEOPLE/4;
      const count=Math.floor(taps+amount);
      for(let j=1;j<=count;j++) {
        LabSound.tone({freq:610,type:'triangle',dur:.035,gain:.095,delay:dt*(j-taps)/amount});
      }
      taps+=amount-count;
    }
    if (Math.floor(playDay)!==data.day) {
      advancing=true; N.set($('day'),Math.floor(playDay)); advancing=false;
    }
    if(playDay===C.DAYS) stop(); else animation=requestAnimationFrame(tick);
  }
  $('play').addEventListener('click',()=>{
    if(motion.matches) {stop();N.set($('day'),data.day===C.DAYS?0:C.DAYS);return;}
    if(running) {stop();return;}
    if(data.day===C.DAYS) N.set($('day'),0);
    playDay=data.day; running=true; syncPlay(); animation=requestAnimationFrame(tick);
  });
  $('restart').addEventListener('click',()=>{stop();N.set($('day'),0);});
  $('day').addEventListener('input',()=>{
    const before=data.day;
    if(!advancing) stop();
    refreshDay();
    if(data.day!==before) dayMoved=true;
    if(advancing) changed();
    if(!advancing) {
      const cross=result.reCrossDay;
      if(LabSound.enabled() && cross !== null && before<cross && data.day>=cross) chime();
      changed();
    }
  });
  ids.forEach(id=>$(id).addEventListener('input',()=>{
    if(id==='basic' && N.value($(id))!==data.basic) basicMoved=true;
    stop();scenario();changed();
  }));
  function soundLabel() {
    const on=LabSound.enabled(); $('soundBtn').setAttribute('aria-pressed',String(on));
    $('soundLabel').textContent=on?T('音效開','Sound on'):T('音效關','Sound off');
  }
  $('soundBtn').addEventListener('click',()=>LabSettings.set('sound',!LabSound.enabled()));
  window.addEventListener('lab:settingschange',soundLabel);
  $('reference').addEventListener('click',()=>{
    reference={data,result};staticDirty=true;refreshDay();changed();
    $('feedback').textContent=T('已保留基準：','Reference saved: ')+dayText(reference.data.day);
  });
  $('clearReference').addEventListener('click',()=>{
    reference=null;recorded=null;staticDirty=true;refreshDay();changed();
    $('feedback').textContent=T('已清除觀察紀錄。','Observations cleared.');
  });
  $('record').addEventListener('click',()=>{
    recorded=recordObservation(); $('record').removeAttribute('data-ready'); updateReadings(); updateGuide();
    const status=T('已記錄：','Recorded: ')+dayText(data.day)+' · I '+percent(data.i,4);
    $('feedback').textContent=recorded.previousCase?status+T('。這組設定已用於一題任務。改變一項情境設定可挑戰另一題。','. This setup was used for a mission. Change a scenario control to try another.') : status;
  });

  function viewLabels(three, message='') {
    $('spanBtn').hidden=three; $('view2').hidden=three; $('view3').hidden=!three; $('cameraControls').hidden=!three;
    $('view2d').setAttribute('aria-pressed',String(!three)); $('view3d').setAttribute('aria-pressed',String(three));
    $('sceneTitle').textContent=three?T('校園中庭','School courtyard'):T('校園傳播曲線','Transmission curves');
    $('viewMsg').textContent=message; $('viewMsg').hidden=!message;
  }
  function flat(message='') {
    viewToken++; if(room) {room.dispose();room=null;}
    viewLabels(false,message);drawGraph();
  }
  $('view2d').addEventListener('click',()=>flat());
  $('view3d').addEventListener('click',async()=>{
    if(room) return;
    const token=++viewToken;
    viewLabels(false,T('載入校園中庭…','Loading courtyard…'));
    try {
      const { createCourtyard }=await import('./sir-epidemic-3d.js');
      if (token!==viewToken) return;
      viewLabels(true);
      room=createCourtyard($('view3'),()=>flat(T('立體畫面已中斷，已回到曲線。','3D was interrupted. The curves are active.')));
      room.update(data); room.preset('overview');
    } catch (error) {
      if (token===viewToken) flat(T('這個裝置無法顯示中庭，已回到曲線。','The courtyard is unavailable on this device. The curves are active.'));
    }
  });
  $('resetCam').addEventListener('click',()=>room?.preset('overview'));
  $('closeCam').addEventListener('click',()=>room?.preset('windows'));
  window.addEventListener('lab:themechange',()=>{staticDirty=true;rollKey='';drawGraph();drawRoll();room?.theme();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stop();});
  const observer=new ResizeObserver(()=>{drawGraph();drawRoll();});
  observer.observe(cv); observer.observe(roll);
  window.addEventListener('lab:settingschange',event=>{
    if(event.detail?.name==='fs') {staticDirty=true;rollKey='';drawGraph();drawRoll();}
  });
  const steps=[
    ['basic','改變基本再生數，觀察曲線的高峰。','Change basic reproduction and inspect the peak.','基本再生數','Basic reproduction'],
    ['day','移動日期，讀取金線和點名人數。','Move the day cursor and read the gold curve and the register.','觀察日期','Day shown'],
    ['reference','保留當天的情境與日期。','Save this scenario and day as a reference.','保留為基準','Keep as reference'],
    ['record','換一天或改變情境，再記錄讀數。','Change the day or scenario and record the readings.','記錄讀數','Record readings']
  ];
  function different(a,b) { return a.day!==b.day || C.scenarioKey(a)!==C.scenarioKey(b); }
  function progress() {
    const saved=reference?.data, compared=!!(saved && recorded?.prior===saved && different(recorded,saved));
    return [basicMoved,dayMoved,!!saved,compared];
  }
  function nextControl() {
    const step=progress().indexOf(false);
    return step===3 && !different(data,reference.data)?1:step;
  }
  function updateGuide() { LabStepGuide.update(nextControl(),{key:guideKey,auto:true}); }
  function stepRows() {
    const done=progress(), next=done.indexOf(false), saved=reference?.data;
    const changedCase=!!saved && different(data,saved);
    const live=[
      T('基本再生數 ','Basic reproduction ')+data.basic+T(' · 高峰 ',' · Peak ')+percent(data.peak),
      dayText(data.day)+T(' · 有效再生數 ',' · Effective reproduction ')+reText(data.re)+' · I '+data.counts.i,
      saved?dayText(saved.day)+' · I '+percent(saved.i,4):T('尚無基準','No reference saved'),
      recorded?dayText(recorded.day)+' · I '+percent(recorded.i,4):T('尚無記錄','No reading recorded')
    ];
    const actions=[
      ['調整「基本再生數」，看高峰如何改變。','Adjust “Basic reproduction” and inspect the peak.'],
      ['移動「觀察日期」，比較讀數。','Move “Day shown” and compare the readings.'],
      ['按「保留為基準」保存這一天。','Press “Keep as reference” to save this day.'],
      !saved?['先按「保留為基準」。','First press “Keep as reference”.']:
      changedCase?['按「記錄讀數」留下比較結果。','Press “Record readings” to save the comparison.']:
      ['移動「觀察日期」，和基準比較。','Move “Day shown” to compare with the reference.']
    ];
    const checks=[
      ['已調過基本再生數','Changed basic reproduction'],
      ['已移動日期','Moved the day cursor'],
      ['已保存基準','Saved a reference'],
      ['已記錄另一日或另一情境','Recorded a different day or scenario']
    ];
    return steps.map(([,zh,en],i)=>{
      const need=[[done[i],checks[i][0]+' · '+live[i],checks[i][1]+' · '+live[i]]];
      if(i===3 && saved) need.push([changedCase,'目前與基準不同 · '+dayText(data.day)+' ／ '+dayText(saved.day),
        'Current and reference differ · '+dayText(data.day)+' / '+dayText(saved.day)]);
      if(!done[i]) need.push([null,...actions[i]]);
      return {html:T(zh,en),done:done[i],current:i===next,need};
    });
  }
  LabStepGuide.define(steps.map(([id,,,zh,en])=>({target:'#'+id,hint:[zh,en],action:id==='basic'||id==='day'?'drag':'tap'})),{key:guideKey});
  setSpan(60); scenario(); soundLabel(); changed();
  LabSide.mount({module:guideKey,steps:stepRows,
    focus(){
      const panel=$('labside-panel').getBoundingClientRect(),meter=document.querySelector('.meter').getBoundingClientRect();
      if(meter.bottom>panel.top-10||meter.top<0) window.scrollBy({top:meter.bottom-panel.top+10,behavior:'instant'});
    },
    guide(){
      const index=nextControl();
      if(index<0) {LabStepGuide.hide();return;}
      const el=$(steps[index][0]);LabDeck.reveal(el);el.focus({preventScroll:true});
      LabStepGuide.show(index,{key:guideKey});
    }});
})();
