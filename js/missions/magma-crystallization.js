/* missions/magma-crystallization.js — 岩漿冷卻與鮑文反應序列的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/magma-crystallization.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'state'：任何設定改變時；'run'：冷卻動畫播完一次（斜長石模式：降溫到 1100 °C）。data 都是 {
 *      mode（'cool' 冷卻、'plag' 斜長石）, preset（真實岩石的代號；改過設定就是 ''）, type（basalt、andesite、rhyolite）,
 *      a（岩體半厚 m）, z（深度 km）, xr（取樣位置 0 中心 – 1 接觸面）, phen（岩漿庫裡先長出的晶體比例 0–0.4）, Tr（圍岩 °C）,
 *      L（晶體大小 mm；斑狀時是全部晶體的平均）, Lp（斑晶 mm）, Lg（石基 mm；不是斑狀時 = L）, Xp（斑晶的體積比例）,
 *      N（每立方公分的晶體數）, X（結晶比例）, glass（玻璃比例）, tex（glassy、aphanitic、phaneritic、pegmatitic、porphyritic、porphyry-glass）,
 *      rock（岩石名稱）, tEnd（凝固或凍成玻璃所需的時間 s）, tYears, q（結晶時的平均冷卻速率 °C/s）, dT50（結晶一半時的過冷度 °C，沒有結晶到一半是 null）,
 *      Lc、glassC、texC（同一岩體中心 x/a = 0 的晶體大小、玻璃比例、組織）,
 *      meth（'eq' 平衡、'frac' 分離）, an0（岩漿成分 An %）, T（°C）, TL、TS（液相線、固相線溫度）,
 *      eq：{ state（liquid、two、solid）, xl、xs（An %）, fs（晶體比例） },
 *      fr：{ F（剩下的熔體比例）, xl, xs（最外層，An %）, core（核心）, mean（晶體平均） }, chart, played,
 *      anim（斜長石降溫動畫正在播放；需要停在特定溫度的任務要動畫停下來或暫停才算） }。
 */
(function () {
  'use strict';
  if (!window.LabMission) return;

  const run = function (ev) { return ev.type === 'run' ? ev.data : null; };
  const any = function (ev) { return ev.type === 'state' || ev.type === 'run' ? ev.data : null; };
  const cool = function (ev) { const d = any(ev); return d && d.mode === 'cool' ? d : null; };
  const pl = function (ev) { const d = any(ev); return d && d.mode === 'plag' ? d : null; };
  // 停在某個溫度才算的斜長石任務：降溫動畫播放途中經過不算（暫停或手動調溫度才算）
  const plHold = function (ev) { const d = pl(ev); return d && !d.anim ? d : null; };
  const coolRun = function (ev) { const d = run(ev); return d && d.mode === 'cool' ? d : null; };

  LabMission.register('magma-crystallization', [
    {
      id: 'magma-crystallization-1', level: 1,
      title: { zh: '從岩漿到岩石', en: 'From magma to rock' },
      desc: { zh: '按「開始冷卻」，從頭看到尾：岩漿冷卻，變成了什麼岩石？', en: 'Press “Cool it” and watch to the end: what rock does the magma become?' },
      check: function (ev) { return !!coolRun(ev); }
    },
    {
      id: 'magma-crystallization-2', level: 2,
      title: { zh: '來不及排隊', en: 'No time to line up' },
      desc: { zh: '讓岩漿冷卻後至少一半是玻璃（原子還沒排成晶體就動不了了）。', en: 'Cool a magma so that at least half of it ends up as glass (the atoms stop before they can form crystals).' },
      check: function (ev) { const d = coolRun(ev); return !!d && d.glass >= 0.5; }
    },
    {
      id: 'magma-crystallization-3', level: 3,
      title: { zh: '肉眼看得見', en: 'Visible to the naked eye' },
      desc: { zh: '不用岩漿庫的斑晶，冷卻出晶體 1 mm 以上的顯晶質岩石。', en: 'Without phenocrysts from the deep chamber, cool a phaneritic rock with crystals of 1 mm or more.' },
      check: function (ev) { const d = coolRun(ev); return !!d && d.phen === 0 && d.glass < 0.5 && d.L >= 1; }
    },
    {
      id: 'magma-crystallization-4', level: 3,
      title: { zh: '冷凝邊', en: 'The chilled margin' },
      desc: { zh: '在靠近接觸面的地方取樣（位置 0.8 以上）：這裡的晶體比同一個岩體中心的小 5 倍以上，兩處都還是結晶的岩石（玻璃不到一半）。', en: 'Sample near the contact (position 0.8 or more): the crystals there are at least 5 times smaller than at the centre of the same body, and both places are still crystalline (less than half glass).' },
      check: function (ev) { const d = cool(ev); return !!d && d.xr >= 0.8 && d.phen === 0 && d.glass < 0.5 && d.glassC < 0.5 && d.L > 0 && d.L * 5 <= d.Lc; }
    },
    {
      id: 'magma-crystallization-5', level: 4,
      title: { zh: '一萬年的耐心', en: 'Ten thousand years of patience' },
      desc: { zh: '找一個岩體，取樣點要一萬年以上才凝固。', en: 'Find a magma body whose sample point takes ten thousand years or more to solidify.' },
      check: function (ev) { const d = cool(ev); return !!d && d.tYears >= 1e4; }
    },
    {
      id: 'magma-crystallization-6', level: 4,
      title: { zh: '槓桿的支點', en: 'The fulcrum of the lever' },
      desc: { zh: '斜長石的平衡結晶：調整成分與溫度，讓晶體和熔體剛好各占一半（晶體 49–51 %）。', en: 'Equilibrium crystallisation of plagioclase: adjust the composition and temperature so that crystals and melt are half and half (crystals 49–51 %).' },
      check: function (ev) { const d = plHold(ev); return !!d && d.meth === 'eq' && d.eq.state === 'two' && d.eq.fs >= 0.49 && d.eq.fs <= 0.51; }
    },
    {
      id: 'magma-crystallization-7', level: 5,
      title: { zh: '兩段人生', en: 'Two lives' },
      desc: { zh: '不用預設的岩石，自己做出斑狀岩石：斑晶比石基大 20 倍以上。', en: 'Without the preset rocks, make a porphyritic rock yourself: phenocrysts at least 20 times larger than the groundmass.' },
      check: function (ev) { const d = cool(ev); return !!d && d.preset === '' && d.tex === 'porphyritic' && d.Lg > 0 && d.Lp >= 20 * d.Lg; }
    },
    {
      id: 'magma-crystallization-8', level: 5,
      title: { zh: '一圈一圈', en: 'Ring by ring' },
      desc: { zh: '分離結晶，熔體還沒用完時：斜長石的核心比最外層多 50 個百分點以上的鈣長石（An）。', en: 'Fractional crystallisation, while there is still melt: the plagioclase core has at least 50 percentage points more anorthite (An) than its outermost layer.' },
      check: function (ev) { const d = plHold(ev); return !!d && d.meth === 'frac' && d.fr.F > 0 && d.fr.xs != null && d.fr.core - d.fr.xs >= 50; }
    },
    {
      id: 'magma-crystallization-9', level: 4,
      title: { zh: '一千四百度', en: 'Fourteen hundred degrees' },
      desc: { zh: '在斜長石的相圖上，找出開始結晶的溫度（液相線）剛好是 1400 °C 的岩漿成分（± 2 °C）。', en: 'On the plagioclase diagram, find the magma composition that starts to crystallise (liquidus) at exactly 1400 °C (± 2 °C).' },
      check: function (ev) { const d = pl(ev); return !!d && Math.abs(d.TL - 1400) <= 2; }
    },
    {
      id: 'magma-crystallization-10', level: 6,
      title: { zh: '黑曜岩的邊界', en: 'The edge of obsidian' },
      desc: { zh: '流紋岩質的熔岩流（深度 0 km）在中心取樣：調整厚度，讓它剛好一半是玻璃（玻璃 45–55 %）。', en: 'A rhyolitic lava flow (depth 0 km), sampled at the centre: adjust its thickness so that it is just half glass (45–55 % glass).' },
      check: function (ev) { const d = cool(ev); return !!d && d.type === 'rhyolite' && d.z === 0 && d.xr === 0 && d.phen === 0 && d.glass >= 0.45 && d.glass <= 0.55; }
    },
    {
      id: 'magma-crystallization-11', level: 7,
      title: { zh: '固相線之下', en: 'Below the solidus' },
      desc: { zh: '分離結晶：溫度降到平衡結晶的固相線（或更低），卻還剩 25 % 以上的熔體。', en: 'Fractional crystallisation: the temperature is at or below the equilibrium solidus, yet 25 % or more of the melt is left.' },
      check: function (ev) { const d = plHold(ev); return !!d && d.meth === 'frac' && d.T <= d.TS && d.fr.F >= 0.25; }
    },
    {
      id: 'magma-crystallization-12', level: 8,
      title: { zh: '深深的過冷', en: 'Deeply undercooled' },
      desc: { zh: '不用斑晶，冷卻看完一次：取樣點在結晶一半時的過冷度達到 300 °C 以上，最後卻仍然是結晶的岩石（玻璃不到一半）。', en: 'Without phenocrysts, cool it to the end: the sample reaches an undercooling of 300 °C or more by the time it is half crystallised, yet still ends up as crystalline rock (less than half glass).' },
      check: function (ev) { const d = coolRun(ev); return !!d && d.phen === 0 && d.dT50 != null && d.dT50 >= 300 && d.glass < 0.5; }
    },
    // ───── 隱藏任務 ─────
    {
      id: 'magma-crystallization-h1', level: 3, hidden: true,
      title: { zh: '一天的岩體', en: 'A one-day body' },
      riddle: { zh: '日出到下一次日出，正是它的脈搏。', en: 'From one sunrise to the next is the length of its pulse.' },
      desc: { zh: '岩體的冷卻時間尺度 τ（a 的平方除以 κ）剛好是一天（± 3 %）：半厚約 29 cm。', en: 'The cooling time scale τ (a squared divided by κ) of the body is exactly one day (± 3 %): a half-thickness of about 29 cm.' },
      check: function (ev) { const d = cool(ev); if (!d) return false; const tau = d.a * d.a / 1e-6; return Math.abs(tau / 86400 - 1) <= 0.03; }
    },
    {
      id: 'magma-crystallization-h2', level: 4, hidden: true,
      title: { zh: '最後一滴', en: 'The last drop' },
      riddle: { zh: '幾乎全都凝固了，只剩一滴還在發光。', en: 'Almost everything has set; only one drop still glows.' },
      desc: { zh: '平衡結晶中，晶體占 99 % 以上，但熔體還沒有完全消失。', en: 'In equilibrium crystallisation the crystals make up 99 % or more, but the melt has not quite vanished.' },
      check: function (ev) { const d = plHold(ev); return !!d && d.meth === 'eq' && d.eq.state === 'two' && d.eq.fs >= 0.99; }
    },
    {
      id: 'magma-crystallization-h3', level: 5, hidden: true,
      title: { zh: '鈣的心、鈉的皮', en: 'A heart of calcium, a skin of sodium' },
      riddle: { zh: '生在最熱的爐邊，最後卻披上了最冷的外衣。', en: 'Born beside the hottest fire, it ends up wearing the coldest coat.' },
      desc: { zh: '從 An 90 以上的岩漿做分離結晶，一直降到 1118 °C 以下：斜長石的最外圈是純鈉長石。', en: 'Fractionally crystallise a magma of An 90 or more all the way below 1118 °C: the outermost rim of the plagioclase is pure albite.' },
      check: function (ev) { const d = pl(ev); return !!d && d.meth === 'frac' && d.an0 >= 90 && d.T <= 1118; }
    },
    {
      id: 'magma-crystallization-h4', level: 6, hidden: true,
      title: { zh: '黑海裡的島', en: 'Islands in a black sea' },
      riddle: { zh: '黑色的海，浮著從深處帶上來的島。', en: 'A black sea, scattered with islands brought up from the deep.' },
      desc: { zh: '流紋岩質的熔岩流（深度 0 km、半厚 10 m 以上）冷卻看完一次，做出玻璃質石基的斑狀岩石：深處長好的斑晶，被凍成玻璃的熔體包住。', en: 'Cool a rhyolitic lava flow (depth 0 km, half-thickness 10 m or more) to the end and get a porphyritic rock with a glassy groundmass: phenocrysts grown at depth, wrapped in melt that froze to glass.' },
      check: function (ev) { const d = coolRun(ev); return !!d && d.type === 'rhyolite' && d.z === 0 && d.a >= 10 && d.tex === 'porphyry-glass'; }
    },
    {
      id: 'magma-crystallization-h5', level: 7, hidden: true,
      title: { zh: '花崗岩的心、黑曜岩的邊', en: 'Granite inside, obsidian at the edge' },
      riddle: { zh: '心裡慢慢長成了花，邊上卻瞬間結了冰。', en: 'Its heart slowly grew into flowers; its edge froze in an instant.' },
      desc: { zh: '流紋岩質的岩體：中心是顯晶質的花崗岩，而在接觸面附近（位置 0.9 以上）取樣卻是玻璃（一半以上）。', en: 'A rhyolitic body whose centre is phaneritic granite, while a sample near the contact (position 0.9 or more) is at least half glass.' },
      check: function (ev) { const d = cool(ev); return !!d && d.type === 'rhyolite' && d.phen === 0 && d.texC === 'phaneritic' && d.xr >= 0.9 && d.glass >= 0.5; }
    },
    {
      id: 'magma-crystallization-h6', level: 8, hidden: true,
      title: { zh: '最寬的凝固帶', en: 'The widest freezing range' },
      riddle: { zh: '從第一顆星亮起到最後一盞燈熄滅，這一次走得最久。', en: 'From the first star appearing to the last lamp going out, this time the walk is longest.' },
      desc: { zh: '選出開始結晶到完全凝固（平衡結晶）的溫度差最大的斜長石成分（相差 170 °C 以上），再用「慢慢降溫」從頭看到尾。', en: 'Choose the plagioclase composition whose equilibrium crystallisation spans the widest range from first crystal to fully solid (170 °C or more), then watch “Cool slowly” all the way through.' },
      check: function (ev) { const d = run(ev); return !!d && d.mode === 'plag' && d.TL - d.TS >= 170; }
    },
    {
      id: 'magma-crystallization-h7', level: 9, hidden: true,
      title: { zh: '千倍之差', en: 'A thousandfold' },
      riddle: { zh: '同一塊石頭，心裡的和邊上的，差了一千倍。', en: 'The same stone: what lies at its heart and what lies at its edge differ a thousandfold.' },
      desc: { zh: '不用斑晶，同一個岩體中心的晶體比取樣點大 1000 倍以上，取樣點卻仍是結晶的岩石（玻璃不到一半）。', en: 'Without phenocrysts, the crystals at the centre of the body are at least 1000 times larger than at the sample point, and the sample is still crystalline (less than half glass).' },
      check: function (ev) { const d = cool(ev); return !!d && d.phen === 0 && d.glass < 0.5 && d.L > 0 && d.Lc >= 1000 * d.L; }
    },
    {
      id: 'magma-crystallization-h8', level: 10, hidden: true,
      title: { zh: '巨大的斑晶', en: 'Giant phenocrysts' },
      riddle: { zh: '從深處帶上來的訪客，大得讓人一眼就看見。', en: 'The visitors brought up from the deep are big enough to catch any eye.' },
      desc: { zh: '冷卻看完一次，做出斑狀岩石：斑晶有 5 mm 以上，而且比石基大 100 倍以上。', en: 'Cool it to the end and get a porphyritic rock whose phenocrysts are 5 mm or more and at least 100 times larger than the groundmass.' },
      check: function (ev) { const d = coolRun(ev); return !!d && d.tex === 'porphyritic' && d.Lp >= 5 && d.Lg > 0 && d.Lp >= 100 * d.Lg; }
    },
    {
      id: 'magma-crystallization-h9', level: 5, hidden: true,
      title: { zh: '地表的慢火', en: 'A slow fire at the surface' },
      riddle: { zh: '就躺在陽光下，卻冷得比一聲嘆息還輕。', en: 'It lies right under the sun, yet it cools more gently than a sigh.' },
      desc: { zh: '玄武岩質岩體在地表（深度 0 km）中心取樣，結晶一半時的過冷度卻小於 0.1 °C：岩體夠大，就冷得夠慢。', en: 'A basaltic body at the surface (depth 0 km), sampled at the centre, is half crystallised at an undercooling below 0.1 °C: a big enough body cools slowly enough.' },
      check: function (ev) { const d = cool(ev); return !!d && d.type === 'basalt' && d.z === 0 && d.xr === 0 && d.phen === 0 && d.dT50 != null && d.dT50 < 0.1; }
    },
    {
      id: 'magma-crystallization-h10', level: 6, hidden: true,
      title: { zh: '最不像的一對', en: 'The least alike pair' },
      riddle: { zh: '同一個時刻、同一個爐裡，兩者卻相差最遠。', en: 'In the same moment, in the same furnace, the two are as unlike as they can be.' },
      desc: { zh: '平衡結晶剛開始（晶體不到 2 %）時，第一批晶體就比熔體多 37.5 個百分點以上的鈣長石（An）：這是相圖上液相線與固相線分得最開的地方。', en: 'At the very start of equilibrium crystallisation (less than 2 % crystals), the first crystals already hold 37.5 or more percentage points more anorthite (An) than the melt: where the liquidus and solidus are farthest apart.' },
      check: function (ev) { const d = plHold(ev); return !!d && d.meth === 'eq' && d.eq.state === 'two' && d.eq.fs <= 0.02 && d.eq.xs - d.eq.xl >= 37.5; }
    }
  ]);
})();
