/* 114 學測物理 14 題共用一個任務檔（js/missions/index.js 的 LAB_LEARN_UNITS 以 file 指到這裡）。 */
for (const [q,points,zh,en] of [
  [19,6,'調整高度，使軌道週期落在 24 小時的 1% 以內。','Adjust altitude to within 1% of a 24-hour orbit.'],
  [20,4,'把冰山和臺北 101 比高，再把熔化熱換成 J/kg。','Compare the iceberg with Taipei 101, then convert the latent heat to J/kg.'],
  [21,6,'用對數拉桿把可用能量調到需要能量的 ±12% 內（不可把立方公尺當公斤）。','Use the log slider to bring the available energy within ±12% of the energy needed, without treating cubic metres as kilograms.'],
  [22,4,'試一次「只換成分鐘」的錯法，再改回正確換算，得到 10 的 4 次方。','Try the minutes-only mistake once, then fix it to get 10 to the 4th power.'],
  [23,5,'畫完加速、等速與減速三段頻率曲線。','Trace all three stages of the frequency graph.'],
  [24,4,'讓原子放出 3 條不同顏色的譜線。','Make the atom emit three different spectral lines.'],
  [25,4,'讓電子一顆一顆打到屏幕上，累積 2000 顆以上。','Send electrons one at a time until at least 2000 have landed.'],
  [26,4,'把 8 種現象一次分到正確的交互作用。','Sort all eight phenomena into the right interactions in one go.'],
  [27,4,'用交流把電池充滿，再試直流至少 1.5 秒。','Fill the battery with AC, then try DC for at least 1.5 seconds.'],
  [47,6,'按 A–E 檢查單位，找出兩個和能量相同的選項。','Check the units of A–E and find the two that match energy.'],
  [48,4,'把兩個溫度設成 27 °C 和 17 °C，看絕對溫度的比。','Set the temperatures to 27 °C and 17 °C and read the kelvin ratio.'],
  [49,7,'移動兩個取樣點，量出 125–175 Ω。','Move both sample points to measure 125–175 Ω.'],
  [50,4,'頻率太低時先把強度拉到 8 以上，再把頻率調到 3.2 eV 以上。','With the frequency too low, raise the intensity to 8 or more, then raise the frequency past 3.2 eV.'],
  [51,7,'把波長調到 400 nm，再把能隙調到 400 nm 的光剛好能用。','Set the wavelength to 400 nm, then lower the gap until 400 nm just works.']
]) {
  const unit='exam-114-'+q;
  const defs=[
    ['correct',points,'答對本題','Solve the problem','任一次取得本題滿分。','Earn full credit on any attempt.'],
    // 11/21 站長：「補救的方式是這七顆，不是額外再七顆」→ 第一次沒拿滿分也能拿回同一顆任務（判定在 js/exam.js 的 recovered）
    ['first',points,'第一次就答對','Right on the first try','第一次送出就拿滿分。沒拿到的話可以補救：聽完全部解題，換一天再來，當天第一次送出就拿滿分。','Earn full credit on the first submission. Missed it? Play the whole solution, come back another day, and earn full credit on that day’s first submission.'],
    ['viewed',1,'看完解題','Finish the solution','完整播放本題每一句解說。','Play every sentence to the end.'],
    ['experiment',1,'動手驗證','Test the model',zh,en],
    // 11/21 站長：第一次沒答對要有補救、星數別差太多 → 已上線的 1–4 不動，補三個中間星數的任務
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
