/* One definition file for the three GSAT learning units. */
for (const [q,points,zh,en] of [
  [19,6,'調整高度，使軌道週期落在 24 小時的 1% 以內。','Adjust altitude to within 1% of a 24-hour orbit.'],
  [23,5,'畫完加速、等速與減速三段頻率曲線。','Trace all three stages of the frequency graph.'],
  [49,7,'移動兩個取樣點，量出 125–175 Ω。','Move both sample points to measure 125–175 Ω.']
]) {
  const unit='exam-114-'+q;
  const defs=[
    ['correct',points,'答對本題','Solve the problem','任一次取得本題滿分。','Earn full credit on any attempt.'],
    ['first',points,'第一次就答對','Right on the first try','第一次送出即取得滿分。','Earn full credit on the first submission.'],
    ['viewed',1,'看完解題','Finish the solution','完整播放本題每一句解說。','Play every sentence to the end.'],
    ['experiment',1,'動手驗證','Test the model',zh,en]
  ];
  LabMission.register(unit,defs.map(([flag,level,z,e,zh,en],i)=>({
    id:unit+'-'+(i+1),level,study:true,title:{zh:z,en:e},desc:{zh,en},
    check:ev=>ev.type==='exam-progress' && ev.data.unit===unit && ev.data[flag]===true,
    need:()=>[[null,zh,en]]
  })));
}
