(function () {
  'use strict';
  const slug='sir-epidemic', near=(a,b,tol=1e-9)=>Math.abs(a-b)<=tol;
  const sameSchool=(d,p)=>d.schoolKey===p.schoolKey;
  const sameStart=(d,p)=>sameSchool(d,p) && near(d.start.s,p.start.s);
  const sameCurve=(d,p)=>sameStart(d,p) && near(d.effective,p.effective);
  const sameDay=(d,p)=>d.day===p.day && d.cumulativeInfected>0;
  const sameRun=(d,p)=>sameStart(d,p) && near(d.basic,p.basic) && near(d.mask,p.mask) && near(d.air,p.air) && d.day>p.day;
  const available=(d,id)=>!d.caseMission || d.caseMission===id;
  const newCase=[null,'這組設定已用於另一題。改變一項情境設定，再觀察新的結果。','This setup was used for another mission. Change one scenario control and observe the new result.'];
  const recordNext=[null,'按「記錄讀數」提交這次觀察。','Press “Record readings” to submit this observation.'];
  const present=d=>d.prior;
  const wave=d=>d.peak>d.start.i+1e-8;
  const atPeak=d=>Math.abs(d.day-d.peakDay)<=.5;
  const item=(zh,en,test)=>({zh,en,test});
  const dayZero=item('觀察日期與起始快照不符。','The current date is different from the initial snapshot.',d=>d.day===0);
  const dayZeroReference=item('比較起始快照與長期結果。','Compare the initial snapshot with the long-term result.',d=>d.prior && d.prior.day===0);
  const keep=item('先保留一組情境為基準。','Keep a reference scenario first.',present);
  const atSameDate=item('兩份快照的比較日期還不合適。','The snapshot dates are not yet comparable.',d=>d.prior && sameDay(d,d.prior));
  const noReference=item('這次觀察要單獨記錄。','This observation needs a single run.',d=>!d.prior);
  const lowerBasic=item('比較的兩組起始免疫與防治須一致，基本再生數須降低。','Compare a lower basic reproduction number with the same starting immunity and controls.',
    d=>d.prior && d.basic<d.prior.basic && sameStart(d,d.prior) && near(d.mask,d.prior.mask) && near(d.air,d.prior.air));
  function currentReading(n,d) {
    const p=d.prior,pct=x=>(100*x).toFixed(3)+'%',num=x=>x.toFixed(3);
    const values=[];
    const add=(zh,en,value)=>values.push([zh+' '+value,en+' '+value]);
    add('日期','Day',d.day);
    if(n===1||n===5) add('具傳染力人數','Infectious headcount',d.counts.i);
    if([2,3,6].includes(n)) add('起初有效再生數','Initial effective reproduction',num(d.initialRe));
    if(n===3) {add('起初免疫','Initially immune',pct(d.start.r));add('只用口罩／只用通風','Masks alone / ventilation alone',num(d.maskOnlyRe)+' / '+num(d.airOnlyRe));}
    if([2,4,7,9,10].includes(n)) add('高峰比例','Peak share',pct(d.peak));
    if([4,7,8,9].includes(n)) add('高峰日期','Peak day',num(d.peakDay));
    if(n===5) {add('全員易感時防治後再生數','Controlled reproduction if all susceptible',num(d.effective));add('最終非易感／有效門檻','Final non-susceptible / threshold',pct(d.finalNonSusceptible)+' / '+pct(d.effectiveThreshold));}
    if(n===6) add('起初／當天具傳染力比例','Initial / current infectious share',pct(d.start.i)+' / '+pct(d.i));
    if(n===8) {
      const exact=x=>(100*x).toFixed(7)+'%';
      add('昨日／今日新增速率（每天）','Yesterday / today infection rate (per day)',(d.day?exact(d.yesterday.dailyIncidence):'—')+' / '+exact(d.dailyIncidence));
      add('昨日／今日具傳染力比例','Yesterday / today infectious share',(d.day?exact(d.yesterday.i):'—')+' / '+exact(d.i));
    }
    if(p&&[7,9,10].includes(n)) {
      add('基準日','Reference day',p.day);
      add('基準高峰比例／日期','Reference peak share / day',pct(p.peak)+' / '+num(p.peakDay));
      if(n===9) add('基準／目前最終曾感染','Reference / current ever infected',pct(p.finalInfected)+' / '+pct(d.finalInfected));
      else add('基準／目前具傳染力比例','Reference / current infectious share',pct(p.i)+' / '+pct(d.i));
    }
    return [null,values.map(v=>v[0]).join(' · '),values.map(v=>v[1]).join(' · ')];
  }
  function normal(n,level,zh,en,descZh,descEn,items) {
    const single=![7,9,10].includes(n);
    const conditions=single?[noReference,...items]:items;
    const prefix=single?'單獨觀察，不保留基準。':'';
    const prefixEn=single?'Observe a single run with no saved reference. ':'';
    const names={
      1:['下降趨勢、點名人數','decline and attendance'],2:['觀察日、起初成長、高峰','observation date, initial growth and peak'],
      3:['觀察日、起始免疫、兩項防治及起初走勢','date, starting immunity, both controls and initial trend'],
      4:['高峰日期、峰高與游標','peak time, height and cursor'],5:['防治後再生數、峰後日期、剩餘人數與過衝','reproduction with controls, post-peak date, remaining cases and overshoot'],
      6:['起初的臨界狀態、第一天的走勢','initial threshold and first-day trend'],7:['同日較低的讀數與推遲的低峰','a lower same-day reading and a later, lower peak'],
      8:['新增速率與具傳染力比例的走勢','infection rate and infectious share trends'],9:['基準日期、同高峰與長期差異','reference date, matching peaks and long-term difference'],
      10:['同日讀數與兩條曲線的峰高','same-day readings and the two peak heights']
    };
    return {id:slug+'-'+n,level,title:{zh,en},desc:{zh:prefix+descZh,en:prefixEn+descEn},needOn:['recorded','observed'],
      check(ev) {return ev.type==='recorded' && available(ev.data,slug+'-'+n) && conditions.every(a=>a.test(ev.data));},
      need(ctx) {
        const latest=ctx.seq && ctx.seq('recorded')>ctx.seq('observed')?'recorded':'observed';
        const d=ctx.last(latest)||ctx.last('recorded');
        if(!d) return [[null,'尚無讀數。先觀察 '+names[n][0]+'。','No reading yet. Inspect '+names[n][1]+'.']];
        if(!available(d,slug+'-'+n)) return [newCase,currentReading(n,d)];
        const missing=conditions.filter(a=>!a.test(d));
        if(!missing.length) return [[true,'觀察條件已符合。','The observation conditions are met.'],currentReading(n,d),recordNext];
        return missing.map(a=>[false,a.zh,a.en]).concat([currentReading(n,d)]);
      }
    };
  }
  function hidden(n,level,zh,en,test) {
    return {id:slug+'-h'+n,level,hidden:true,riddle:{zh,en},
      check(ev) {
        return ev.type==='recorded' && available(ev.data,slug+'-h'+n) && !!ev.data.prior && test(ev.data,ev.data.prior);
      },
      need(ctx) {
        const last=ctx.seq && ctx.seq('recorded')>ctx.seq('observed')?'recorded':'observed';
        const d=ctx.last(last);
        return d && !available(d,slug+'-h'+n)?[newCase]:[[null,zh,en]];
      }
    };
  }
  window.LabMission.register(slug,[
    normal(1,1,'最後幾件紅制服','The last red uniforms','從第二天起，在曾經成長的疫情過峰後，找到全校只剩一到三位具傳染力者的日子。切到一個仍有紅制服的班級核對，再記錄讀數。','From day two onward, after a growing wave has peaked, find a day with just one to three infectious students in the school. Select a class that still has a red uniform in its register, then record.',[
      item('在點名簿選一個仍有紅制服的班級。','Select a class that still has a red uniform in the register.',d=>d.inspectedClass),
      item('尚未觀察到疫情先成長、過峰後下降。','The observation has not yet captured a growing wave after its peak.',d=>d.day>1 && wave(d) && d.day>d.peakDay && d.i<d.yesterday.i),
      item('點名簿中具傳染力人數尚不符合。','The infectious headcount does not yet match.',d=>d.counts.i>=1 && d.counts.i<=3)
    ]),
    normal(2,2,'把波峰壓低','Keep the wave small','在第零天記錄一組仍會成長、但具傳染力比例高峰低於 10% 的情境。','At day zero, record a wave that grows but peaks below 10% infectious.',[
      dayZero,item('起初沒有形成成長波。','The wave is not growing initially.',d=>d.initialRe>1 && wave(d)),
      item('高峰仍太高。','The peak is still too high.',d=>d.peak<.1)
    ]),
    normal(3,3,'兩道防線','Two layers of protection','全校起初都沒有免疫力。讓單用口罩或單靠通風時疫情都仍會成長，兩者合用才壓住它，回第零天記錄。','Start without immunity. Keep the wave growing with either control alone, then stop initial growth by combining them. Record day zero.',[
      dayZero,item('起始族群或原本的傳播走勢不符。','Check the starting population and its uncontrolled trend.',d=>near(d.start.r,0) && d.basic*d.initialFactor>1),
      item('單用口罩或單靠通風時，起初有效再生數都要高於 1。','Keep initial reproduction above one with either measure alone.',d=>d.maskOnlyRe>1 && d.airOnlyRe>1),
      item('目前防治下，起初仍在成長。','The infection still grows initially with these controls.',d=>d.initialRe<=1)
    ]),
    normal(4,4,'姍姍來遲的高峰','A late peak','把高峰延到第 30 天以後，同時讓高峰超過 5%。在最接近高峰的整天記錄。','Delay the peak until after day 30 while keeping it above 5%. Record the nearest whole day to the peak.',[
      item('高峰還太早。','The peak is still too early.',d=>d.peakDay>30),
      item('高峰還太低。','The peak is still too low.',d=>d.peak>.05),
      item('游標對準最接近高峰的整天。','Move the cursor to the nearest whole day.',atPeak)
    ]),
    normal(5,5,'越過門檻還在傳','Beyond the threshold','採用口罩或通風措施後，讓疫情仍先成長。找出連續兩天都已過峰、今天點名仍有至少四位具傳染力者，且還有新增感染的一天。比較最終非易感比例與防治後有效門檻，確認前者較高，再按「記錄讀數」。','Apply masks or ventilation while keeping the wave initially growing. Find two consecutive days after its peak. On the second day, at least four students must still be infectious and new infections must still occur. Compare the final non-susceptible share with the threshold under the current controls. If the final share is higher, press “Record readings”.',[
      item('採用口罩或通風措施後，起初有效再生數仍須高於 1。','Apply a control and keep initial effective reproduction above one.',d=>(d.mask>0 || d.air>0) && d.initialRe>1 && wave(d)),
      item('昨天和今天都要過峰，今天仍有新增感染。','Find two post-peak dates with new infections still occurring today.',d=>d.yesterday.day>d.peakDay && d.i<d.yesterday.i && d.dailyIncidence>0),
      item('點名時還有至少四位具傳染力者。','Look for at least four infectious students in the register.',d=>d.counts.i>=4),
      item('最終非易感比例（含初始免疫）須高於防治後的有效門檻。','Find a final non-susceptible share above the threshold under the current controls.',d=>d.finalNonSusceptible>d.effectiveThreshold)
    ]),
    normal(6,6,'從門檻出發','Starting at the threshold','讓起初有效再生數落在 1 的千分之一以內。記錄第一天，確認具傳染力比例已低於起點。','Start within one thousandth of an effective reproduction number of one. Record day one with an infectious share below its initial value.',[
      item('起初有效再生數尚未到臨界附近。','Initial effective reproduction is outside the threshold neighbourhood.',d=>near(d.initialRe,1,.001+1e-12)),
      item('觀察日期或起點後的走勢還不符。','Check the date and the trend just after the start.',d=>d.day===1 && d.i<d.start.i)
    ]),
    normal(7,7,'削平並推遲','Flatter and later','在非零日保留基準，只調低基本再生數，再記錄同一天。當天具傳染力比例要較低，高峰至少低 10 個百分點、晚 4 天。','Save a reference after day zero. Lower only the basic reproduction number and record the same day. The infectious share must be lower, with a peak at least 10 percentage points lower and four days later.',[
      keep,atSameDate,lowerBasic,item('比較當日的具傳染力比例。','Compare infectious shares on the saved day.',d=>d.prior && d.i<d.prior.i),item('相對基準的峰高降幅還不夠。','The peak has not fallen enough relative to the reference.',d=>d.prior && d.prior.peak-d.peak>=.1),
      item('高峰相對基準延後得不夠。','The peak has not been delayed enough.',d=>d.prior && d.peakDay-d.prior.peakDay>=4)
    ]),
    normal(8,8,'新增先轉彎','New infections turn first','在距離具傳染力比例高峰還超過一天時，找出新增感染速率已低於昨天、具傳染力比例卻仍在上升的一天，展開觀察紀錄裡的「對照讀數」核對兩天，再記錄。','More than a day before the infectious peak, find a date when the infection rate is lower than yesterday while the infectious share is still rising. Open “Compare readings” in Observations to check both days, then record.',[
      item('展開觀察紀錄的「對照讀數」，核對兩天的走勢。','Open “Compare readings” in Observations to check both days.',d=>d.comparing),
      item('當下新增感染速率已比昨天同一時刻低。','Find an infection rate lower than at the same time yesterday.',d=>d.day>0 && d.dailyIncidence<d.yesterday.dailyIncidence),
      item('具傳染力比例仍在增加，距離高峰還超過一天。','Keep the infectious share rising with more than a day to go until its peak.',d=>d.i>d.yesterday.i && d.day+1<d.peakDay)
    ]),
    normal(9,9,'同一高峰，兩種結局','One peak, two endings','在第零天保留一組從起初就未成長的情境，再找另一組。兩組都在第零天達到相同高峰，最終曾感染比例卻相差至少 8 個百分點。在第 180 天記錄。','On day zero, save one wave that does not grow from the start and make another. Both have the same day-zero peak but their final infected shares differ by at least eight percentage points. Record on day 180.',[
      keep,dayZeroReference,item('兩組起始高峰尚未吻合。','The two initial peaks do not yet match.',d=>d.prior && d.peakDay===0 && d.prior.peakDay===0 && near(d.peak,d.prior.peak)),
      item('兩個長期結果還不夠分明。','The long-term outcomes are still too similar.',d=>d.prior && Math.abs(d.finalInfected-d.prior.finalInfected)>=.08),
      item('觀察日期尚未涵蓋全段。','The observation does not yet cover the full time window.',d=>d.day===180)
    ]),
    normal(10,10,'交換領先的曲線','When the curves trade places','在非零日保留基準，只調低基本再生數。比較同一天，讓新情境的高峰至少低 4 個百分點，當天具傳染力的比例卻比基準高至少 2 個百分點，再按「記錄讀數」。','Save a reference after day zero and lower only the basic reproduction number. On that same day, find a wave with a peak at least four percentage points lower but an infectious share at least two percentage points higher. Press “Record readings”.',[
      keep,atSameDate,lowerBasic,item('兩條曲線的峰高差還不夠。','The two peak heights are still too similar.',d=>d.prior && d.prior.peak-d.peak>=.04),
      item('同日具傳染力比例的反差還不夠。','The same-day infectious shares are still too similar.',d=>d.prior && d.i-d.prior.i>=.02)
    ]),
    hidden(1,3,'紅制服已從點名簿消失，紙上的細線仍未貼地。','The red uniforms vanish from the register while a fine line still hovers above the page.',
      (d,p)=>sameRun(d,p) && d.day===p.day+1 && p.counts.i>0 && d.counts.i===0 && d.i<p.i && d.dailyIncidence>0),
    hidden(2,4,'相鄰兩頁點名簿，夾著金線落下的那一刻。','Two facing pages of the register hold the instant the gold thread dips.',
      (d,p)=>sameRun(d,p) && d.day===p.day+1 && d.reCrossDay!==null &&
        p.day<d.reCrossDay && d.reCrossDay<=d.day),
    hidden(3,5,'不同的午後，走廊上一樣擁擠。','On distant afternoons, the corridor looks equally full.',
      (d,p)=>sameRun(d,p) && p.re>1 && d.re<1 && d.day-p.day>=7 && p.i>.035 && near(d.i,p.i,.001)),
    hidden(4,5,'點名簿的兩端，悄悄交換了厚薄。','The two ends of the register trade places.',
      (d,p)=>sameRun(d,p) && wave(d) && d.day===p.day+1 && p.day>d.peakDay && p.s>p.r && d.r>=d.s && d.r-d.s<.025),
    hidden(5,6,'第一批紅制服散隊後夾進書籤。待最後一欄幾乎填完，展開「對照讀數」，找回剩下的紅制服。','Bookmark the register after the first red uniforms have left. When the last column is nearly full, open “Compare readings” to account for those that remained.',
      (d,p)=>d.comparing && p.day>0 && p.r>p.start.r && sameRun(d,p) && p.re>1 && d.re<1 && d.s>.03 && d.cumulativeInfected-p.cumulativeInfected>.30 &&
        d.i<.0001 && near(p.i+d.cumulativeInfected-p.cumulativeInfected,(d.r-p.r)+d.i)),
    hidden(6,7,'兩張條件不同的記錄紙，疊在窗上只透出一條曲線。','Two sheets with different settings show a single curve when held to the window.',
      (d,p)=>d.day===p.day && ['basic','immune','mask','air'].some(key=>!near(d[key],p[key])) && sameCurve(d,p) && near(d.i,p.i) && near(d.s,p.s)),
    hidden(7,7,'兩班開始時的金線重疊，後來的紅制服卻排出不同隊形。','The gold threads start together, but the red uniforms form different lines later.',
      (d,p)=>sameDay(d,p) && sameSchool(d,p) && !sameStart(d,p) && near(d.initialRe,p.initialRe,.0001) && Math.abs(d.i-p.i)>.025),
    hidden(8,8,'早到的鐘聲越過了舊屋脊。','An early bell rings above the old roofline.',
      (d,p)=>sameDay(d,p) && sameStart(d,p) && d.basic>p.basic && near(d.effective/d.basic,p.effective/p.basic) &&
        p.peakDay-d.peakDay>6 && d.peak-p.peak>.08 && d.i<d.yesterday.i && p.i>p.yesterday.i),
    hidden(9,9,'窗框與制服的影子交會時，金線換了方向。','Where the window frames and uniforms cast overlapping shadows, the gold line turns.',
      (d,p)=>sameDay(d,p) && sameStart(d,p) && near(d.basic,p.basic) && p.initialRe>1 &&
        d.maskOnlyRe>1 && d.airOnlyRe>1 && d.initialRe<1),
    hidden(10,10,'走廊最擠的那一刻，校門口最忙的時候已經過了。','When the corridor is fullest, the busiest moment at the gate has already passed.',
      (d,p)=>sameRun(d,p) && p.day>0 && d.day-p.day>=2 &&
        p.dailyIncidence>=p.yesterday.dailyIncidence && p.dailyIncidence>p.tomorrow.dailyIncidence &&
        atPeak(d) && d.dailyIncidence<p.dailyIncidence && d.i>p.i+.005)
  ]);
})();
