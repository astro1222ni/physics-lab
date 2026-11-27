/* 115 學測物理 14 題共用一個任務檔（js/missions/index.js 的 LAB_LEARN_UNITS 以 file 指到這裡）。 */
for (const [q,points,zh,en] of [
  [10,4,"把時間拉到 20 秒，讓面積長滿，讀出全程位移 125 m。","Scrub time to 20 s so the area fills in, and read the total displacement of 125 m."],
  [11,6,"拉過加速、等速、減速三段，看合力箭頭怎麼轉向。","Scrub through the speeding-up, steady and slowing-down stages and watch the net-force arrow flip."],
  [12,6,"看完三段的能量長條，確認三段動能變化加起來是 0。","Step through all three stages and check that the kinetic-energy changes add up to 0."],
  [13,4,"拖著恆星繞完一整圈，畫出完整的 f–t 曲線。","Drag the star once all the way round and draw the whole f–t graph."],
  [14,7,"把四種力由大到小排好。","Put the four forces in order from largest to smallest."],
  [15,6,"拼出電場的兩種單位 N/C 和 V/m。","Build both units of electric field, N/C and V/m."],
  [16,6,"把電子放到原點兩側至少 6 個位置，描出 F–x 圖。","Put the electron at 6 or more places on both sides of the origin and plot F–x."],
  [17,4,"把溫度設成月球白天 121 °C 和晚上 −133 °C，讀出動能比 394/140。","Set the Moon’s day 121 °C and night −133 °C and read the kinetic-energy ratio 394/140."],
  [18,8,"調每秒分裂次數，讓電功率落在 300 MW 的 ±5% 內。","Set the fission rate so the electric power is within ±5% of 300 MW."],
  [47,4,"找出放出 365 nm 紫外光的那一對能階。","Find the pair of levels that emits 365 nm UV light."],
  [48,4,"把波長調到 13.5 nm，讀出光子能量約 1.5×10 的 −17 次方焦耳。","Set the wavelength to 13.5 nm and read a photon energy of about 1.5×10^−17 J."],
  [49,7,"調 R3 的相位與振幅，讓兩道反射光疊出最強的反射。","Tune the phase and size of R3 so the two reflections add up to the strongest wave."],
  [52,6,"把每次漲潮的水量、潮差、效率調成題目的數值，讀出一年約 10 的 7 次方度。","Set the volume, tidal height and efficiency to the question’s values and read about 10^7 kWh a year."],
  [53,7,"讓磁鐵往上加速穿過線圈，把 8 個點都描出來。","Lift the magnet faster and faster through the coil and plot all 8 points."]
]) {
  const unit='exam-115-'+q;
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
