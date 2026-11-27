/* 三份案例資料供共用範例元件讀取，實驗頁直接使用相同的 core。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('../career-decision-balance-core.js'));
  else{const list=factory(root.CareerBalance);root.LAB_EXAMPLE_DATA=root.LAB_EXAMPLE_DATA||{};root.LAB_EXAMPLE_DATA['career-decision-balance']=list;root.LabExamples?.define('career-decision-balance',list);}
})(typeof window==='undefined'?globalThis:window,function(C){
  'use strict';
  const questions=[
    ['小安的三個方向很接近。哪一項考量只要改一點，就會換人領先？','An’s three fields are close. Which criterion can switch the leader with the smallest change?'],
    ['小庭眼中的資訊學群領先。把能力的比重分給價值觀後，領先能維持多久？','Computing leads for Ting. How long does the lead last if skills give way to values?'],
    ['小宇特別重視可負擔程度。數理化學群六項評分都最高，哪一種權重能改變第一名？','Yu values affordability. Math, physics and chemistry scores highest on every criterion. Can any choice of weights change the leader?']
  ];
  const solutions=[
    [['在翻盤圖比較各項變動的絕對值。選最短的一條，移到交界，確認前兩名同分。','Compare absolute distances on the switches chart. Select the shortest, move to the boundary and verify a tie at the top.']],
    [['先留作基準，再調整能力與價值觀。比對基準查看第一名與分差，並用機率圖檢查勝出比例。','Save a baseline and adjust skills and values. Compare the score leader and margin, then inspect the win shares.']],
    [['在資料表逐欄核對。每欄的首名都相同，加權後必然仍是第一。翻盤圖六列都應顯示沒有翻轉。','Check each column in Data. The same field wins every column, so any positive mix keeps it first. Verify that none of the six rows has a switch.']]
  ];
  return questions.map((q,i)=>({n:i+1,q,state:{profile:i,weights:C.profiles[i].weights.slice(),activities:[]},
    concept:[['勝出機率取決於這個角色的權重和線索。','Win shares depend on this character’s weights and evidence.']],sol:solutions[i]}));
});
