/* Shared by the live mission engine and the executable proofs. Every award follows a user action. */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const slug='sexagenary-cycle';
  const text=(zh,en)=>({zh,en});
  function mission(id,level,title,desc,needs){
    return {id:slug+'-'+id,level,title:text(...title),desc:text(...desc),
      check(e){return e.type==='calendar'&&!!e.data?.act&&needs.every(row=>row[2](e.data));},
      need(ctx){const d=ctx.last('calendar');return needs.map(([zh,en,test])=>[d?!!test(d):null,zh,en]);}};
  }
  const verified=['記下起點，再正確預測兩個不同年份的年距。','Pin a year and correctly predict a nonzero interval.',
    d=>d.act==='compare'&&d.comparison?.correct&&d.comparison.gap>0];
  const fact=(zh,en,condition)=>[zh,en,d=>!!d.comparison&&condition(d.comparison)];
  function hidden(i,level,riddle,test){
    return {id:slug+'-h'+i,level,hidden:true,riddle:text(...riddle),
      check(e){return e.type==='calendar'&&e.data?.act==='compare'&&!!e.data.comparison?.correct&&test(e.data.comparison);}};
  }
  window.LabMission.register(slug,[
    mission(1,1,['一齒一年','One tooth, one year'],['讓兩個齒輪各推進或退回一格，觀察三種紀年。','Move both wheels one position forward or back and read the three calendars.'],[
      ['手動移動相鄰的一年。','Move manually to an adjacent year.',d=>['drag','step','entry'].includes(d.act)&&Math.abs(d.delta)===1]]),
    mission(2,2,['再遇甲午','Find another Jia-Wu'],['從別的年份出發，找到一個甲午年。','Start in a different year and find a Jia-Wu year.'],[
      ['到達甲午，而且起點在另一年。','Arrive at Jia-Wu from a different year.',d=>!!d.delta&&d.k===30]]),
    mission(3,2,['換一本年曆','Change calendars'],['用民國或民國前年數查到另一個西元年份，核對三欄。','Enter a year in ROC or before-ROC notation to find a different civil year.'],[
      ['以民國或民國前輸入年份。','Enter a year using ROC or before ROC.',d=>d.act==='entry'&&['roc','before'].includes(d.era)],
      ['查到的年份與原來不同。','Reach a different year.',d=>!!d.delta]]),
    mission(4,3,['找出缺席的配對','A missing pairing'],['挑一組無法同時到達指標的干、支，用整圈刻度查驗。','Choose a stem and branch that cannot meet. Test all the positions.'],[
      ['查驗一整圈，找到零次相遇的配對。','Check the cycle and find zero matches.',d=>d.act==='pair'&&d.pair?.matches.length===0]]),
    mission(5,4,['天干先回來','The stem returns first'],['比較兩個天干相同、地支不同的年份，預測年距。','Find two years with the same stem but different branches and predict their interval.'],[
      verified,fact('只有天干重現。','Only the stem repeats.',c=>c.sameStem&&!c.sameBranch)]),
    mission(6,5,['同生肖，不同干支','One animal, different pairs'],['用兩個不同干支的年份證明，同一生肖可以配不同天干。','Compare two different stem–branch years to show that one animal can accompany different stems.'],[
      verified,fact('地支和生肖相同，天干不同。','Match branch and animal with different stems.',c=>c.sameBranch&&!c.sameStem)]),
    mission(7,6,['替兩份史料定年','Date two records'],['在兩件有出處的歷史事件間，正確算出相隔幾年。','Find the interval between two documented historical events.'],[
      verified,fact('起點與終點各有一件不同的歷史事件。','Use a different documented event at each end.',c=>c.twoEvents)]),
    mission(8,7,['年號裡的兩個歲次','One reign, two year names'],['從史料找出同一清代年號下兩個不同歲次，驗算間隔。','Use the records to find two different cycle names within one Qing reign and check the interval.'],[
      verified,fact('兩件史事的清代年號相同，干支不同。','Use two recorded events in one Qing reign with different cycle names.',c=>c.sameReign&&!c.samePair)]),
    mission(9,8,['跨過西元分界','Across the BC/AD boundary'],['選分居西元分界兩側且相距不到十二年的兩年，算出實際年距。','Choose two years on opposite sides of the BC/AD boundary less than twelve years apart and predict the interval.'],[
      verified,fact('兩年分居西元前後。','Choose one BC and one AD year.',c=>c.crossBC),
      fact('相隔未滿十二年。','Keep the interval under twelve years.',c=>c.gap<12)]),
    mission(10,10,['下一個同名年','The very next namesake'],['記下任一年（可試辛亥），找出以後第一個完全同名的年份，再預測年距。','Pin any year, such as Xin-Hai. Find the first later year with the same stem and branch, then predict the interval.'],[
      verified,fact('往後走，兩輪第一次同時歸位。','Go forward to the first simultaneous return.',c=>c.samePair&&c.delta===60)]),
    hidden(1,3,['新門掛起，舊獸仍來。','A familiar animal visits a new gate.'],c=>c.crossROC&&c.gap===12&&c.sameBranch&&!c.sameStem),
    hidden(2,4,['匾額換了，首字依稀。','The plaque changes; its first letter lingers.'],c=>c.crossROC&&c.gap===10&&c.sameStem&&!c.sameBranch),
    hidden(3,4,['同一方印泥，留下兩道摺痕。','Two creases share one seal.'],c=>c.sameReign&&c.gap>1&&!c.sameStem&&!c.sameBranch),
    hidden(4,5,['兩張相鄰的紙，書脊換了名字。','The spine bears a new name between adjacent leaves.'],c=>c.crossROC&&c.gap===1),
    hidden(5,6,['橋上只有一步。','A single footfall spans the bridge.'],c=>c.crossBC&&c.gap===1),
    hidden(6,8,['橋的兩岸，各有一枚相同的印。','Matching seals rest on opposite banks.'],c=>c.crossBC&&c.samePair&&c.gap===60),
    hidden(7,7,['戰報折起之後，馬又披上舊字。','The dispatch is folded; the horse wears its old inscription.'],c=>c.from===1894&&c.start===30&&c.end===30&&c.delta===60),
    hidden(8,7,['首字未改，獸影在對岸。','The first letter holds while the animal looks across.'],c=>c.gap===30&&c.sameStem&&!c.sameBranch),
    hidden(9,9,['新舊匾額間，圓鼓報了兩輪。','The round drum keeps time beneath two different plaques.'],c=>c.crossROC&&c.gap===120&&c.samePair),
    hidden(10,10,['末頁留下的空格，正好讓新卷落款。','The last leaf leaves a space for the next volume’s seal.'],c=>c.start===59&&c.end===0&&c.delta===1)
  ]);
})();
