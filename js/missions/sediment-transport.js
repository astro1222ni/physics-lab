/* missions/sediment-transport.js — 侵蝕、搬運與沉積的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/sediment-transport.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：任何設定改變時；'run'：動畫播完一次（河床：從上游放一把；沉降：七種顆粒都到底；從山到海：放流）。data 都是 {
 *      mode（'bed' 河床上的顆粒、'settle' 沉降水管、'river' 從山到海）, D（粒徑 mm）, mineral（quartz、magnetite、gold、coal）,
 *      shape（natural、sphere）, sample（按了樣本按鈕的代號；自己調過是 ''）, cls（Wentworth 分級：clay、silt、sand、granule、pebble、cobble、boulder）,
 *      U（平均流速 m/s）, h（水深 m）, consol（黏聚力倍數：1 鬆散、4 壓實）,
 *      bed（河床上的顆粒：rest、bedload、suspend）, inc（上游帶來的顆粒：deposit、bedload、suspend）, zone（erode、transport、deposit）,
 *      Ue（起動流速）, Ud（沉積流速）, us（剪力速度）, w（20 °C 的沉降速度）, rouse,
 *      UeQ（同粒徑的鬆散石英在同水深的起動流速）, qBed（同粒徑的鬆散石英在這個流速的狀態）, UeH1（同一種顆粒在水深 1 m 的起動流速）,
 *      UeMin、DMin（目前的礦物、形狀、黏聚力與水深下，起動流速曲線的最低點與它的粒徑 mm）,
 *      T（沉降水管的水溫 °C）, wS（水管裡的沉降速度）, t（沉 1 m 的秒數）, t20（同一顆粒在 20 °C 的秒數）, Rep（顆粒雷諾數）,
 *      tS（六種石英樣本在這個水溫沉 1 m 的秒數 { clay, silt, fine, coarse, pebble, cobble }）,
 *      U0（山上的流速）, picked（你的顆粒在山上挖得起來嗎）, x（你的顆粒停下的位置 0–1；挖不起來是 −1；帶進海裡是 null）,
 *      xs（六種樣本停下的位置，同上）, chart, anim（目前模式的動畫正在播放） }。
 *   河床與河流的水溫固定 20 °C。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const run = function (ev) { return ev.type === 'run' ? ev.data : null; };
  const any = function (ev) { return ev.type === 'state' || ev.type === 'run' ? ev.data : null; };
  const mode = function (ev, m) { const d = any(ev); return d && d.mode === m ? d : null; };
  const runOf = function (ev, m) { const d = run(ev); return d && d.mode === m ? d : null; };
  const moved = function (d) { return d.bed === 'bedload' || d.bed === 'suspend'; };

  LabMission.register('sediment-transport', [
    {
      id: 'sediment-transport-1', level: 1,
      title: { zh: '從上游來的', en: 'From upstream' },
      desc: { zh: '在「河床上的顆粒」按「從上游放一把」，看那把顆粒繼續被帶走還是停下來。', en: 'In “River bed”, press “Add a handful from upstream” and see whether the grains are carried on or settle.' },
      check: function (ev) { return !!runOf(ev, 'bed'); }
    },
    {
      id: 'sediment-transport-2', level: 2,
      title: { zh: '誰先到底', en: 'Who lands first' },
      desc: { zh: '在「沉降水管」按「放下顆粒」，等七種顆粒全部沉到 1 m 深的底部。', en: 'In “Settling column”, press “Drop the grains” and wait until all seven reach the bottom, 1 m down.' },
      check: function (ev) { return !!runOf(ev, 'settle'); }
    },
    {
      id: 'sediment-transport-3', level: 2,
      title: { zh: '一場大雨', en: 'A heavy rain' },
      desc: { zh: '在「從山到海」按「放流」，看各種顆粒停在哪裡。', en: 'In “Mountains to the sea”, press “Release” and see where each kind of grain stops.' },
      check: function (ev) { return !!runOf(ev, 'river'); }
    },
    {
      id: 'sediment-transport-4', level: 3,
      title: { zh: '剛好挖得動', en: 'Only just enough' },
      desc: { zh: '石英細砂（0.125–0.25 mm）的河床：把流速調到剛好被挖起，介於起動流速與它的 1.1 倍之間。', en: 'A bed of quartz fine sand (0.125–0.25 mm): set the flow so it is only just eroded, between the erosion speed and 1.1 times it.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.mineral === 'quartz' && d.D >= 0.125 && d.D <= 0.25 && d.U >= d.Ue && d.U <= 1.1 * d.Ue; }
    },
    {
      id: 'sediment-transport-5', level: 3,
      title: { zh: '黏住了', en: 'Stuck together' },
      desc: { zh: '把黏土（0.0039 mm 以下）的河床挖起來：顆粒那麼小，卻要比細砂快得多的水流。', en: 'Erode a bed of clay (finer than 0.0039 mm): tiny grains, yet it takes a much faster flow than for fine sand.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.cls === 'clay' && moved(d); }
    },
    {
      id: 'sediment-transport-6', level: 4,
      title: { zh: '搬得動，挖不起', en: 'Carried, but not picked up' },
      desc: { zh: '2 mm 以上的礫石落在「搬運」區：上游來的繼續被帶走，河床上的卻一顆也不動。', en: 'Gravel of 2 mm or more in the transport zone: grains from upstream keep going, yet not one on the bed moves.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.D >= 2 && d.zone === 'transport' && d.bed === 'rest' && d.inc !== 'deposit'; }
    },
    {
      id: 'sediment-transport-7', level: 3,
      title: { zh: '重的先到', en: 'Heavy goes first' },
      desc: { zh: '沉降水管：讓 0.25 mm 以下的金砂，比 1 mm 的石英粗砂先到底（放下顆粒看完一次）。', en: 'Settling column: make gold sand of 0.25 mm or less reach the bottom before 1 mm quartz coarse sand (drop the grains and watch).' },
      check: function (ev) { const d = runOf(ev, 'settle'); return !!d && d.mineral === 'gold' && d.D <= 0.25 && d.t < d.tS.coarse; }
    },
    {
      id: 'sediment-transport-8', level: 5,
      title: { zh: '冬天的湖', en: 'A lake in winter' },
      desc: { zh: '在 4 °C 以下的水裡，粉砂（0.0039–0.0625 mm）沉 1 m 的時間至少是 20 °C 時的 1.4 倍：冷水比較黏。', en: 'In water at 4 °C or colder, silt (0.0039–0.0625 mm) takes at least 1.4 times as long to fall 1 m as at 20 °C: cold water is more viscous.' },
      check: function (ev) { const d = mode(ev, 'settle'); return !!d && d.cls === 'silt' && d.T <= 4 && d.t >= 1.4 * d.t20; }
    },
    {
      id: 'sediment-transport-9', level: 5,
      title: { zh: '分選', en: 'Sorting' },
      desc: { zh: '從山到海放流：細砂停在下游 80 % 以後，中礫卻停在前半段。', en: 'Mountains to the sea: release so that the fine sand stops beyond 80 % of the way down while the pebbles stop in the first half.' },
      check: function (ev) { const d = runOf(ev, 'river'); return !!d && d.xs.fine != null && d.xs.fine >= 0.8 && d.xs.pebble >= 0 && d.xs.pebble <= 0.5; }
    },
    {
      id: 'sediment-transport-10', level: 4,
      title: { zh: '洪水', en: 'Flood' },
      desc: { zh: '從山到海放流：山上的水快到把 100 mm 的粗礫也帶下山。', en: 'Mountains to the sea: make the mountain flow fast enough to carry even the 100 mm cobbles downhill.' },
      check: function (ev) { const d = runOf(ev, 'river'); return !!d && d.xs.cobble != null && d.xs.cobble >= 0; }
    },
    {
      id: 'sediment-transport-11', level: 6,
      title: { zh: '曲線的谷底', en: 'The bottom of the curve' },
      desc: { zh: '找出最容易被侵蝕的粒徑：河床被挖起，而流速不超過起動流速曲線最低點的 1.02 倍。', en: 'Find the most easily eroded grain size: the bed is eroded with a flow no more than 1.02 times the lowest point of the erosion curve.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && moved(d) && d.U <= 1.02 * d.UeMin; }
    },
    {
      id: 'sediment-transport-12', level: 7,
      title: { zh: '石頭飛起來', en: 'Flying stones' },
      desc: { zh: '讓 4 mm 以上的石英中礫被亂流帶起、懸浮在水中：只有又淺又急的山洪辦得到。', en: 'Lift quartz pebbles of 4 mm or more into suspension: only a shallow, violent mountain flood can do it.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.mineral === 'quartz' && d.D >= 4 && d.bed === 'suspend'; }
    },

    // ───── 隱藏任務 ─────
    {
      id: 'sediment-transport-h1', level: 4, hidden: true,
      title: { zh: '黑色的石頭先走', en: 'The black stones leave first' },
      riddle: { zh: '同樣大的石頭，有一種比較早上路。', en: 'Stones of one size, and one kind sets off sooner.' },
      desc: { zh: '2 mm 以上的煤礫被挖起，而同樣大小的石英在這個流速下還挖不動：煤的密度只有石英的一半。', en: 'Coal gravel of 2 mm or more is eroded at a speed too slow to move quartz of the same size: coal is only half as dense.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.mineral === 'coal' && d.D >= 2 && moved(d) && d.U < d.UeQ; }
    },
    {
      id: 'sediment-transport-h2', level: 6, hidden: true,
      title: { zh: '淘金', en: 'Panning for gold' },
      riddle: { zh: '別的都被沖走了，留下的才閃閃發亮。', en: 'Everything else was washed away; what stays behind glitters.' },
      desc: { zh: '金的砂礫留在河床上，同樣大小的石英卻已經被沖成懸浮：這就是砂金礦（砂礦）的成因。', en: 'Gold grains stay on the bed while quartz of the same size is already in suspension: this is how placer gold deposits form.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.mineral === 'gold' && d.bed === 'rest' && d.qBed === 'suspend'; }
    },
    {
      id: 'sediment-transport-h3', level: 7, hidden: true,
      title: { zh: '硬土', en: 'Hard ground' },
      riddle: { zh: '它被壓了很久，水還是把它帶走了。', en: 'It was pressed down for ages, and still the water took it.' },
      desc: { zh: '把壓實的黏土河床挖起來：黏聚力是鬆散泥巴的 4 倍，要每秒好幾公尺的水流。', en: 'Erode a bed of compacted clay: four times the cohesion of loose mud, needing a flow of several metres per second.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.consol >= 4 && d.cls === 'clay' && moved(d); }
    },
    {
      id: 'sediment-transport-h4', level: 4, hidden: true,
      title: { zh: '一直不清的水', en: 'Water that never clears' },
      riddle: { zh: '水幾乎不動了，它還是不肯落下。', en: 'The water has all but stopped, and still it will not fall.' },
      desc: { zh: '流速 0.01 m/s 以下，上游來的粉砂仍然懸浮：細顆粒的沉降速度比微弱的亂流還慢，所以河口的水總是混濁的。', en: 'At 0.01 m/s or less, silt from upstream is still in suspension: fine grains sink more slowly than even weak turbulence stirs them, which is why river mouths stay muddy.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.cls === 'silt' && d.U <= 0.01 && d.inc === 'suspend'; }
    },
    {
      id: 'sediment-transport-h5', level: 5, hidden: true,
      title: { zh: '定律的邊界', en: 'Where the law ends' },
      riddle: { zh: '再大一點，那條漂亮的定律就不管用了。', en: 'A little bigger, and that elegant law stops working.' },
      desc: { zh: '沉降水管：讓顆粒雷諾數在 0.9–1.1 之間，正好是史托克斯定律開始失準的地方。', en: 'Settling column: bring the grain Reynolds number to 0.9–1.1, right where Stokes’ law begins to fail.' },
      check: function (ev) { const d = mode(ev, 'settle'); return !!d && d.Rep >= 0.9 && d.Rep <= 1.1; }
    },
    {
      id: 'sediment-transport-h6', level: 8, hidden: true,
      title: { zh: '大小不同，一起落下', en: 'Different sizes, falling together' },
      riddle: { zh: '它們長得不一樣大，水卻把它們當成同一種。', en: 'They are not the same size, yet the water treats them as one.' },
      desc: { zh: '水力等值：選石英以外的礦物，粒徑和 0.2 mm 差 20 % 以上，沉 1 m 的時間卻和石英細砂差 2 % 以內：海灘上的黑砂（磁鐵礦）比石英細，就是這個原因。', en: 'Hydraulic equivalence: a mineral other than quartz, more than 20 % away from 0.2 mm in size, that falls 1 m within 2 % of the time of quartz fine sand. This is why the black sand (magnetite) on beaches is finer than the quartz.' },
      check: function (ev) { const d = mode(ev, 'settle'); return !!d && d.mineral !== 'quartz' && Math.abs(d.D / 0.2 - 1) > 0.2 && Math.abs(d.t / d.tS.fine - 1) <= 0.02; }
    },
    {
      id: 'sediment-transport-h7', level: 9, hidden: true,
      title: { zh: '深水靜流', en: 'Still waters run deep' },
      riddle: { zh: '同樣快的水，淺處搬得動，深處卻搬不動。', en: 'Water just as fast moves it in the shallows, but not in the deep.' },
      desc: { zh: '水深 8 m 以上，河床不動；同樣的平均流速在 1 m 深的河裡卻會把它挖起：水越深，貼近河床的流速越慢。', en: 'Water 8 m or deeper leaves the bed untouched, though the same mean speed would erode it in a 1 m river: the deeper the water, the slower the flow near the bed.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.h >= 8 && d.bed === 'rest' && d.U > d.UeH1; }
    },
    {
      id: 'sediment-transport-h8', level: 8, hidden: true,
      title: { zh: '三角洲的第一層', en: 'The first layer of a delta' },
      riddle: { zh: '走了那麼遠，剛好停在門口。', en: 'All that way, and it stops right at the door.' },
      desc: { zh: '從山到海放流，你的顆粒剛好停在下游 97–100 % 的河口：三角洲就是這樣一層一層長出來的。', en: 'Release so that your grain stops right at the river mouth, 97–100 % of the way down: this is how a delta grows, layer by layer.' },
      check: function (ev) { const d = runOf(ev, 'river'); return !!d && d.picked && d.x != null && d.x >= 0.97 && d.x <= 1; }
    },
    {
      id: 'sediment-transport-h9', level: 6, hidden: true,
      title: { zh: '金比石頭先停', en: 'Gold stops before the stones' },
      riddle: { zh: '它比石頭小得多，卻比石頭更早留下來。', en: 'Far smaller than the stones, and yet it stays behind first.' },
      desc: { zh: '從山到海放流：你的金粒比 20 mm 的石英中礫更早停下（更靠近山區）。', en: 'Release so that your gold grain stops before the 20 mm quartz pebbles do (closer to the mountains).' },
      check: function (ev) { const d = runOf(ev, 'river'); return !!d && d.mineral === 'gold' && d.picked && d.x != null && d.xs.pebble >= 0 && d.x < d.xs.pebble; }
    },
    {
      id: 'sediment-transport-h10', level: 3, hidden: true,
      title: { zh: '滾動的大石頭', en: 'Rolling boulders' },
      riddle: { zh: '水底傳來低沉的撞擊聲。', en: 'A low knocking from the riverbed.' },
      desc: { zh: '讓 150 mm 以上的大石頭在河床上滾動（推移）：洪水時河底的石頭互相撞擊，會發出聲音。', en: 'Make stones of 150 mm or more roll along the bed (bedload): in a flood they knock against one another, and you can hear it.' },
      check: function (ev) { const d = mode(ev, 'bed'); return !!d && d.D >= 150 && d.bed === 'bedload'; }
    }
  ]);
})();
