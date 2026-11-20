/* Learning units award ordinary (single-weight) study stars. */
(function () {
  const unit='learn-phy-5-1';
  const sections=[['引起動機','Warm-up'],['先預測','Predictions'],['觀念：功','Work'],['觀念：能量','Energy'],['動手','Hands-on'],['範例','Worked examples'],['隨堂三題','Quiz'],['小結','Recap']];
  const rows=sections.map(([z,e])=>[1,z,e,'看完這一段的每一頁。','Play every page in this section to the end.']).concat([
    [1,'預測一','First prediction','記下水桶題的預測。','Record a prediction for the bucket.'],
    [1,'預測二','Second prediction','記下行李箱來回的預測。','Record a prediction for the return trip.'],
    [2,'兩題預測全對','Both predictions correct','兩個原始預測皆正確，看到第二題揭曉。','Make both original predictions correctly and finish the second reveal.'],
    [2,'分解拉力','Resolve the pull','把拉桿拖至水平 4、鉛直 3。','Set the handle to four across and three up.'],
    [2,'等速拉箱','Pull at constant speed','在粗糙地面以 4:3 拉行 10 m。','Pull for 10 m at 4:3 on the rough floor.'],
    [2,'冰上零功','Zero work on ice','在冰上垂直拉，眼見速率維持不變。','Pull vertically on ice and observe constant speed.'],
    [2,'往返原點','Round trip','以 4:3 去、回各 5 m，累加兩段功。','Pull 5 m out and 5 m back at 4:3.'],
    [2,'範例一','Worked example 1','看完手托物體的解答。','View the complete lifting solution.'],
    [2,'範例二','Worked example 2','看完背包題的解答。','View the complete backpack solution.'],
    [3,'零功角度','Angle for zero work','在冰面上調對拉桿的角度。','Set the correct angle on ice.'],
    [3,'摩擦力作功','Work by friction','填對摩擦力所作的功，包括正負號。','Enter the work by friction with its sign.'],
    [3,'速率與動能','Speed and kinetic energy','選對動能的倍數。','Choose the correct kinetic-energy ratio.'],
    [6,'隨堂一次全對','Three on the first try','三題隨堂題第一次作答都答對。','Get all three quiz questions right on the first attempt.'],
    [3,'旁白全部聽完','Hear every narration','開啟聲音，完整播放每頁錄音。','Listen to the recording on every page with sound on.'],
    [2,'分享成績卡','Share your scorecard','成功分享或複製成績卡。','Share or copy the scorecard successfully.'],
    [10,'全通','Complete the unit','取得本單元前 23 個任務。','Earn the first 23 learning missions.'],
    [3,'第二個等速角','The other constant-speed angle','在粗糙地面以水平 12、鉛直 5 等速拉行至少 2 m。','Hold the pull on the rough floor at twelve across and five up for at least 2 m at constant speed.']
  ]);
  LabMission.register(unit,rows.map(([level,z,e,zh,en],i)=>({
    id:unit+'-'+(i+1),level,study:true,...(i===24?{hidden:true,studyStars:3,riddle:{zh:'粗糙地面上，還有另一個等速的角度。',en:'There is another steady-speed angle on the rough floor.'}}:{}),title:{zh:z,en:e},desc:{zh,en},
    check:event=>event.type==='learn-progress'&&event.data.earned?.[i+1]===true,
    need:()=>[[null,zh,en]]
  })));
})();
