/* Notebook evidence is produced only after a learner submits a correct analysis. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (root.LabMission) root.LabMission.register('han-character-formation',factory());
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const slug = 'han-character-formation-';
  const pair = (zh,en) => ({zh,en});
  function task(id,level,title,requirement,test) {
    const valid = d => !!d && ['build','compare'].includes(d.act) && test(d);
    return {id:slug+id,level,title:pair(...title),desc:pair(...requirement),
      check:e=>e.type === 'han-evidence' && valid(e.data),
      need:ctx=>{const d=ctx.last('han-evidence');return [[d ? valid(d) : null,...requirement]];}};
  }
  function hidden(id,level,riddle,act,char,built,heard) {
    return {id:slug+'h'+id,level,hidden:true,riddle:pair(...riddle),
      check(e){const d=e.data;return e.type === 'han-evidence' && d?.act === act && d.char === char
        && [...built].every(c=>d.built.includes(c)) && [...heard].every(c=>d.heard.includes(c));}};
  }
  return [
    task(1,1,['第一張字卡','Your first entry'],['在拼字台核對一個字的造字法與聲符。','Check the construction and sound component of any character.'],d=>d.built.length>0),
    task(2,2,['看得出形狀','An outline with meaning'],['正確判讀一個象形字，再判讀一個指事字。','Verify one pictograph and one indicative character.'],d=>['P','I'].every(t=>d.types.includes(t))),
    task(3,3,['意義能相加','Two clues to meaning'],['正確判讀兩個不同的會意字。','Verify two different compound ideographs.'],d=>d.compounds>=2),
    task(4,4,['同音的親戚','A perfect sound match'],['在家族圈找出一字，核對它與聲符同聲母、同韻母、同聲調。','In a family, verify a member that matches the initial, final and tone of its sound component.'],d=>d.masks.includes(7)),
    task(5,5,['一個形旁，兩條聲路','One meaning clue, two sound clues'],['判讀兩個形聲字，讓它們的形旁相同、聲符不同。','Verify two phonosemantic characters with the same meaning component and different sound components.'],d=>d.meaningBreadth>=2),
    task(6,6,['聲調也會走開','When tone changes'],['在家族圈核對兩種情形：三項全同，以及只差聲調。','Verify both a complete match and a reading that differs only in tone.'],d=>d.masks.includes(7)&&d.masks.includes(6)),
    task(7,7,['拆出四條線索','Four ways to form a graph'],['在拼字台各判讀一個象形、指事、會意、形聲字。','Verify one example of each of the four construction types.'],d=>d.types.length===4),
    task(8,8,['跨過三個家族','Across three families'],['核對三個聲符家族的讀音，至少得到三種不同的相符組合。','Check readings in three families and find at least three different patterns of agreement.'],d=>d.families.length>=3&&d.masks.length>=3),
    task(9,9,['形旁的三個鄰居','Three neighbors of a meaning clue'],['判讀三個形旁相同、聲符各異的字，再在家族圈核對其中兩字。','Verify three graphs with one meaning component and three different sound components. Check the readings of two of those graphs.'],d=>d.sharedChecked>=2&&d.meaningBreadth>=3),
    task(10,10,['校勘一頁字譜','Edit a page of the atlas'],['四種造字法各有一例，至少四個家族留下紀錄，並找出四種相符組合。','Record all four construction types, four phonetic families and four patterns of sound agreement.'],d=>d.types.length===4&&d.families.length>=4&&d.masks.length>=4),
    hidden(1,3,['紅絲繞過長流。','A red thread crosses the current.'],'compare','江','江','紅'),
    hidden(2,4,['近侍退去，吟聲未歇。','An attendant leaves. A verse lingers.'],'compare','詩','詩','侍'),
    hidden(3,5,['竹簡上的客人換了差事。','A guest takes a different post among bamboo slips.'],'build','等','待詩',''),
    hidden(4,5,['樹梢記得樹根的筆。','The treetop remembers a stroke at its roots.'],'build','末','本上',''),
    hidden(5,6,['歇腳的人走進另一片蔭。','A resting traveler enters a second shade.'],'build','林','休木',''),
    hidden(6,7,['水和心經過同一間米坊。','Water and heart pass the same rice mill.'],'compare','精','精','清情'),
    hidden(7,7,['兩份差事落在同一把尺上。','Two duties fall to a single square.'],'build','功','攻','功'),
    hidden(8,8,['河面托起一口會破的鐘。','The river carries a bell that bursts.'],'build','泡','清江','泡'),
    hidden(9,9,['衣領豎起，耳朵最早知道。','A collar rises. The ear knows first.'],'compare','冷','冷','領聆'),
    hidden(10,10,['平靖之後，清水仍藏著問號。','After peace returns, clear water holds a question.'],'compare','猜','猜','靖清')
  ];
});
