/* 113 學測物理 12 題共用一個任務檔（js/missions/index.js 的 LAB_LEARN_UNITS 以 file 指到這裡）。任務設計照 114：每題 7 個。 */
for (const [q,points,zh,en] of [
  [19,4,'把核能電廠的能量鏈從原子核排到插座，一次排對。','Put the nuclear plant’s energy chain in order, from nucleus to socket, in one go.'],
  [20,4,'把兩顆粒子拉開到 1 公分以上，看哪兩種力還在。','Pull the two particles more than 1 cm apart and see which forces remain.'],
  [21,4,'看遠又看近：兩次都調水晶體把影像對到視網膜上。','Look far, then near: both times, adjust the lens until the image lands on the retina.'],
  [22,4,'把探針放到 15 公分，四條射束各量一次。','Put the probe at 15 cm and measure all four beams.'],
  [23,6,'把腫瘤放到 10–11 公分，選出劑量比最好的射束。','Put the tumor at 10–11 cm and pick the beam with the best dose ratio.'],
  [24,4,'在密閉房間打開冰箱門，讓它運轉 2 小時以上。','Open the fridge door in a sealed room and run it for over 2 hours.'],
  [25,4,'把 1 度電換成焦耳，再乘性能係數 2.5。','Convert 1 kWh to joules, then multiply by the COP of 2.5.'],
  [26,4,'把游標拖到飽和壓力的一半，讀出時間。','Drag the cursor to half the saturation pressure and read the time.'],
  [27,6,'把緩衝時間拉長一倍，看平均力變成一半。','Double the stopping time and watch the average force halve.'],
  [44,6,'拖磁鐵整根穿過環圈，看磁力兩次都向上。','Drag the magnet all the way through the loop and see the force point up both times.'],
  [45,6,'改速度、乙的面積和圈數，各看一次電流怎麼變。','Change the speed, loop B’s area and the turns, and watch the current each time.'],
  [46,8,'播放 0–12 秒，在 9 秒標出 N 極離開中心。','Play 0–12 s and mark the N pole leaving the center at 9 s.']
]) {
  const unit='exam-113-'+q;
  const defs=[
    ['correct',points,'答對本題','Solve the problem','任一次取得本題滿分。','Earn full credit on any attempt.'],
    ['first',points,'第一次就答對','Right on the first try','第一次送出就拿滿分。沒拿到的話可以補救：聽完全部解題，換一天再來，當天第一次送出就拿滿分。','Earn full credit on the first submission. Missed it? Play the whole solution, come back another day, and earn full credit on that day’s first submission.'],
    ['viewed',1,'看完解題','Finish the solution','完整播放本題每一句解說。','Play every sentence to the end.'],
    ['experiment',1,'動手驗證','Test the model',zh,en],
    ['relearn',Math.max(2,points-2),'聽完再答對','Solve it after the solution','聽完全部解題之後，再送出一次拿到滿分。','After playing the whole solution, submit again for full credit.'],
    ['later',3,'隔天再答對','Solve it again tomorrow','拿過滿分之後，換日再送出一次，又拿到滿分。','After earning full credit, come back on another day and earn it again.'],
    ['national',1,'看全國怎麼選','See how the nation did','送出作答後，打開「全國資料」。','After submitting, open National results.']
  ];
  LabMission.register(unit,defs.map(([flag,level,z,e,zh,en],i)=>({
    id:unit+'-'+(i+1),level,study:true,title:{zh:z,en:e},desc:{zh,en},
    check:ev=>ev.type==='exam-progress' && ev.data.unit===unit && ev.data[flag]===true,
    need:()=>[[null,zh,en]]
  })));
}
