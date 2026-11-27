/* 任務門檻是讀圖與比較的教學目標，並無生涯適配分級意義。
 * 只在親手記錄、驗證或完成判讀時檢查。preview 供「還差什麼」讀取，從不授星。
 */
(function () {
  'use strict';
  const slug = 'career-decision-balance';
  const pair = (zh,en) => ({zh,en});
  const pct = x => (100*x).toFixed(1)+'%';
  const pp = x => (100*x).toFixed(1);
  const score = d => [d.gap.toFixed(3)+' 分', d.gap.toFixed(3)+' points'];
  const odds = d => [pct(d.chance),pct(d.chance)];
  const gain = d => [pct(d.oldChance)+' → '+pct(d.chance),pct(d.oldChance)+' → '+pct(d.chance)];
  const actions = {
    score:['在總分圖記錄一次。','Record the scores view.'], chance:['在機率圖記錄一次。','Record the chances view.'],
    probe:['選一項考量，檢驗它的敏感度。','Choose a criterion and test its sensitivity.'],
    compare:['留下一組基準，改權重再比對。','Save a baseline, change weights and compare.'],
    explore:['安排活動後，比對探索前後。','Plan an activity and compare its effects.'],
    plan:['判讀探索結果後，完成這次判讀。','Review the evidence and finish the decision note.']
  };
  function standard(n,type,title,desc,conditions,measure) {
    const matches = d => d.revised && conditions.every(c => c[0](d));
    return {id:slug+'-'+n, level:n, readingType:type, title:pair(...title), desc:pair(...desc),
      check:ev=>ev.type===type && !!matches(ev.data),
      need(ctx) {
        const d = ctx.last('preview-'+type) || ctx.last(type);
        if(d?.modelLimited)return [[null,'讓三個學群都合格，採案例原始標準差、隨機差異及至少 2,000 次抽樣。','Keep all three fields eligible, use original deviations, random variation and at least 2,000 draws.']];
        if (!d || !d.revised) return [[null,'先改動案例的權重或安排活動。','Change the case weights or plan an activity first.']];
        const value = measure(d);
        const rows = conditions.filter(c=>!c[0](d)).map(c=>[false,c[1]+'（目前 '+value[0]+'）',c[2]+' (now '+value[1]+')']);
        return rows.length ? rows : [[null,...actions[type]]];
      }};
  }
  function secret(n,level,type,riddle,fn) {
    return {id:slug+'-h'+n, level, readingType:type, hidden:true, riddle:pair(...riddle), check:ev=>ev.type===type && !!ev.data.revised && fn(ev.data)};
  }
  const explores = [d=>d.spent>0 && d.tightened,'至少要有一項活動帶來新線索。','At least one activity must add evidence.'];
  const unchanged = [d=>d.sameModel,'基準與現在要使用同一批線索。','Use the same evidence on both sides.'];
  const sameFirst = [d=>d.sameFirst,'前後須由同一學群單獨領先。','The same field must lead outright both times.'];
  const missions = [
    standard(1,'score',['拉開差距','Open a lead'],['兼顧至少兩項考量，讓第一名領先至少 0.20 分，在總分圖記錄。','Give weight to at least two criteria. Record a leading margin of at least 0.20 in the scores view.'],[
      [d=>d.active>=2,'讓不只一項考量參與。','Include more than one criterion.'],[d=>d.gap>=.2-1e-9,'再拉開前兩名分差。','Widen the gap between the top two.']],score),
    standard(2,'probe',['找出最容易翻盤的一項','Find the easiest reversal'],['調整一次權重，在翻盤圖選出離換人領先最近的一項，再檢驗判讀。','Adjust the weights. On the switches chart, select and test the criterion closest to a change of leader.'],[
      [d=>d.first>=0,'先讓第一名分出來。','Start with a unique leader.'],[d=>d.nearest,'所選考量須能用最小變動翻盤。','Your criterion must allow the smallest change.']],d=>d.distance<0?['無交界','no crossing']:[pp(d.distance)+' 個百分點',pp(d.distance)+' pp']),
    standard(3,'chance',['領先也可能輸','A fragile lead'],['在機率圖記下一位總分領先者，它在抽樣中勝出的比例達 45%，卻不到 60%。','Record a score leader that wins at least 45% but less than 60% of the draws.'],[
      [d=>d.first>=0,'先找出單獨領先者。','Find one outright score leader.'],[d=>d.chance>=.45 && d.chance<.6,'勝出機率要落在題目的範圍內。','Bring its win share into the requested interval.']],odds),
    standard(4,'compare',['一點就翻過去','Across a narrow boundary'],['先存基準。只調一項權重，其餘維持原比例，以不超過 5 個百分點的占比變動換一個第一名，再比對基準。','Save a baseline. Change one share by at most five percentage points, keeping the others in proportion. Compare after the leader switches.'],[
      unchanged,[d=>d.single && d.shift<=.05+1e-9,'只改一項的相對占比，並縮小變動。','Change just one relative share and keep the move small.'],[d=>d.flipped,'兩次第一名須不同。','Look for different outright leaders.']],d=>[pp(d.shift)+' 個百分點',pp(d.shift)+' pp']),
    standard(5,'explore',['花了時間，機率沒動','Time spent, odds unchanged'],['安排活動讓評分更明確。比對探索前後，找出同一個學群仍領先、三個勝出機率也完全沒有變動的一次。','Plan activities that narrow the ratings. Compare at the same weights and find the same outright leader with unchanged win shares for all three fields.'],[
      explores,sameFirst,[d=>d.probChange<1e-9,'仍有學群的勝出機率改變。','Some win shares still change.']],d=>[pp(d.probChange)+' 個百分點',pp(d.probChange)+' pp']),
    standard(6,'explore',['多一點把握','A little more confidence'],['固定權重，比對探索前後。讓原本的第一名提升至少 8 個百分點，且勝出機率仍低於 80%。','At fixed weights, compare the plan with no activities. Raise the original leader’s win share by at least eight percentage points while keeping it below 80%.'],[
      explores,sameFirst,[d=>d.chance-d.oldChance>=.08-1e-9 && d.chance<.8,'檢查原本第一名的機率增幅與終點。','Check the original leader’s gain and its final win share.']],gain),
    standard(7,'explore',['用線索穩住領先','Strengthen the lead'],['先在機率圖留作基準，維持相同權重，在 20 小時內安排活動。比對探索前後，讓原本第一名的勝出機率從低於 80% 升到至少 80%。','Save the pre-activity chances as a baseline and hold the weights fixed. Within 20 hours, move the original leader from below 80% to at least 80% wins. Compare the exploration results.'],[
      explores,sameFirst,[d=>d.savedChances,'先在探索前的機率圖留下這組權重的基準。','Save these weights in Chances before planning.'],[d=>d.oldChance<.8 && d.chance>=.8 && d.chance-d.oldChance>1e-9,'探索的前後須跨過指定機率。','Cross the requested win share with evidence.']],gain),
    standard(8,'compare',['領先縮水','A shrinking margin'],['存好基準後，重新分配至少兩項考量的相對比重。維持同一位第一名，讓領先分差縮到一半以下，再比對基準。','Save a baseline and change the mix beyond a single proportional adjustment. Keep the same leader and reduce its margin to half or less. Compare the baseline.'],[
      unchanged,sameFirst,[d=>!d.single && !d.equalShares,'改變考量之間的搭配。','Change the mix beyond one criterion.'],[d=>d.oldGap>0 && d.gap<=d.oldGap*.5,'進一步縮小目前的領先分差。','Shrink the current margin further.']],d=>[d.oldGap.toFixed(3)+' → '+d.gap.toFixed(3),d.oldGap.toFixed(3)+' → '+d.gap.toFixed(3)]),
    standard(9,'explore',['沒改志向，結果翻了','Evidence changes the leader'],['用相同權重比對探索前後。找一組活動，讓原本單獨領先的學群被另一學群超越。','Hold weights fixed. Compare a plan with no activities and find a different outright score leader after collecting evidence.'],[
      explores,[d=>d.flipped,'線索還沒有讓另一學群單獨領先。','The evidence has yet to produce a different outright leader.']],gain),
    standard(10,'plan',['值得花的時間','Evidence on a budget'],['找出原先三個勝出機率都不到 60% 的情況。用同一組權重安排活動，至少保留 4 小時，讓一個學群達到 80%，再完成判讀。','Start with all three win shares below 60%. At the same weights, plan activities that leave at least four hours and raise a field to 80% or more. Finish the decision note.'],[
      explores,[d=>d.oldPeak<.6,'探索前的排名還要更不確定。','Find greater uncertainty before exploration.'],[d=>d.spent<=16,'再留下多一點探索時間。','Keep more time in reserve.'],[d=>d.chance>=.8,'找能釐清第一名的線索。','Find evidence that clarifies the lead.']],gain),
    secret(1,3,'score',['合唱散場，一個聲部仍撐起整首歌。','The choir leaves. One voice carries the song.'],d=>d.active===1 && d.first>=0),
    secret(2,4,'score',['兩道影子並肩抵達，後面還有腳步。','Two shadows arrive abreast. Footsteps follow.'],d=>d.ties===2),
    secret(3,4,'probe',['潮水一齊抬高船身，港口的次序依舊。','One tide lifts every hull. The harbour keeps its order.'],d=>d.flat && !d.hasPivot && d.first>=0),
    secret(4,6,'probe',['從獨撐一面的彼岸留下航誌，再回到眾聲之間，領航的帆依然在前。','Log the shore where one voice stands alone. Back among many voices, the same sail leads.'],d=>d.testedEndpoint && !d.flat && d.stable && !d.hasPivot),
    secret(5,7,'chance',['盤中的三片月色，幾乎分不出盈虧。','Three slivers of moonlight share the plate almost evenly.'],d=>d.probSpan<=.02 && d.gapSigma>0),
    secret(6,5,'chance',['風還在吹，所有紙舟卻靠上同一座碼頭。','The air still stirs. Every paper boat reaches the same dock.'],d=>d.first>=0 && d.chance>=1-1e-9 && d.gapSigma>0),
    secret(7,6,'compare',['影印紙上的字變大了，行與行依舊對齊。','The letters grow on the copy. Every line still aligns.'],d=>d.sameModel && d.equalShares && d.rawChanged && d.active>=2),
    secret(8,8,'explore',['霧淡了，走在最前面的身影反而沒那麼篤定。','The fog thins. The front runner looks less certain.'],d=>d.tightened && d.sameFirst && d.gapSigma<d.oldSigma && d.chance<=d.oldChance-.08+1e-9),
    secret(9,9,'compare',['摺扇慢慢收起，扇骨的前後依然分明。','A folding fan closes. The ribs keep their order.'],d=>d.sameModel && d.single && d.flatShift && d.sameFirst && d.scoresMoved && d.gap<d.oldGap-1e-9),
    secret(10,10,'map',['谷底的三條小徑，在同一枚旗釘下會合。','Three valley paths meet under a single pin.'],d=>d.interior && d.scoreSpan<=.002 && d.regions===3)
  ];
  LabMission.register(slug,missions);
})();
