/* missions/river-meander.js — 曲流、牛軛湖與河道變遷的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/river-meander.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'river'：時間在走時大約每 0.4 秒一次，另外在播放／暫停、往前 1 年、改滑桿、點河道或牛軛湖、人工截彎、清除時立刻回報。
 *     data = MeanderCore.snapshot(…) = {
 *       t（年）, W（河寬 m）, k（河岸可侵蝕程度 m/年）, seed, sin（彎曲度）, L（河道長度 m）, lambda（曲流波長 m，彎不明顯時 null）,
 *       cuts（自然截彎次數）, artCuts（人工截彎次數）, oxbows（記住的牛軛湖數）, lakes（還有水的牛軛湖數，形成未滿 400 年）,
 *       oldest（最老的牛軛湖幾歲）, lastCut, lastArt（最近一次人工截彎 { t, neck, saved, before, after }）,
 *       maxSin（這條河到過的最大彎曲度）, minGap（兩次自然截彎的最短間隔，年；不到兩次為 null）, minGap3、minGap4（連續三次、四次自然截彎的最短時距）,
 *       sinceNat（距離上一次自然截彎幾年；還沒有就是從第 0 年算）, straightAt（從 2.5 以上被人工拉直到 1.2 以下的時刻，沒有為 null）,
 *       running（時間在走）, act（這次回報的原因：run、play、pause、step、param、select、oxbow、art、nocut、reset、tool、layer）,
 *       tool（look／cut）, sel（剖面：{ c 無因次曲率, R1, R1max, bar 露出沙洲, top 遷移最快的地方, hOut, hIn }，沒有為 null）,
 *       selOx（點到的牛軛湖：{ age, len, art }，沒有為 null）
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const FILL = window.MeanderCore ? window.MeanderCore.FILL_YR : 400;
  const M = function (ev) { return ev.type === 'river' ? ev.data : null; };

  LabMission.register('river-meander', [
    {
      id: 'river-meander-1', level: 1,
      title: { zh: '讓河流流五十年', en: 'Fifty years of flow' },
      desc: { zh: '按「播放」，讓時間走過 50 年。', en: 'Press Play and let 50 years go by.' },
      check: function (ev) { const d = M(ev); return !!d && d.t >= 50; }
    },
    {
      id: 'river-meander-2', level: 2,
      title: { zh: '第一個牛軛湖', en: 'The first oxbow lake' },
      desc: { zh: '等到河道第一次自然截彎取直，留下牛軛湖。', en: 'Wait until the river cuts off a loop by itself and leaves an oxbow lake.' },
      check: function (ev) { const d = M(ev); return !!d && d.cuts >= 1; }
    },
    {
      id: 'river-meander-3', level: 2,
      title: { zh: '凹岸與凸岸', en: 'Outer bank, inner bank' },
      desc: { zh: '點一個明顯的彎道（曲率半徑小於 5 倍河寬），看它的橫剖面。', en: 'Tap a clear bend (radius less than 5 channel widths) and look at its cross-section.' },
      check: function (ev) { const d = M(ev); return !!d && !!d.sel && Math.abs(d.sel.c) >= 0.2; }
    },
    {
      id: 'river-meander-4', level: 3,
      title: { zh: '成為曲流河', en: 'A meandering river' },
      desc: { zh: '讓彎曲度達到 1.5。', en: 'Let the sinuosity reach 1.5.' },
      check: function (ev) { const d = M(ev); return !!d && d.sin >= 1.5; }
    },
    {
      id: 'river-meander-5', level: 3,
      title: { zh: '三個牛軛湖', en: 'Three oxbow lakes' },
      desc: { zh: '讓谷底同時有 3 個還有水的牛軛湖。', en: 'Have three oxbow lakes that still hold water at the same time.' },
      check: function (ev) { const d = M(ev); return !!d && d.lakes >= 3; }
    },
    {
      id: 'river-meander-6', level: 4,
      title: { zh: '人工截彎取直', en: 'Straighten a bend' },
      desc: { zh: '切到「人工截彎」，截掉一個彎。', en: 'Switch to “Cut a bend” and cut one off.' },
      check: function (ev) { const d = M(ev); return !!d && d.act === 'art' && d.artCuts >= 1; }
    },
    {
      id: 'river-meander-7', level: 4,
      title: { zh: '大河的大彎', en: 'Big river, big bends' },
      desc: { zh: '河寬至少 140 m、彎曲度至少 1.2 時，讓曲流波長超過 1.5 km。', en: 'With the river at least 140 m wide and a sinuosity of at least 1.2, get a meander wavelength over 1.5 km.' },
      check: function (ev) { const d = M(ev); return !!d && d.W >= 140 && d.sin >= 1.2 && d.lambda != null && d.lambda >= 1500; }
    },
    {
      id: 'river-meander-8', level: 5,
      title: { zh: '小河的小彎', en: 'Small river, small bends' },
      desc: { zh: '河寬不超過 50 m、彎曲度至少 1.2 時，讓曲流波長小於 600 m。', en: 'With the river at most 50 m wide and a sinuosity of at least 1.2, get a meander wavelength under 600 m.' },
      check: function (ev) { const d = M(ev); return !!d && d.W <= 50 && d.sin >= 1.2 && d.lambda != null && d.lambda <= 600; }
    },
    {
      id: 'river-meander-9', level: 5,
      title: { zh: '搶在河流之前', en: 'Beat the river to it' },
      desc: { zh: '在頸部已經窄到不到 2 倍河寬的彎道上人工截彎。', en: 'Cut a bend whose neck is already less than 2 channel widths across.' },
      check: function (ev) { const d = M(ev); return !!d && d.act === 'art' && !!d.lastArt && d.lastArt.neck <= 2 * d.W; }
    },
    {
      id: 'river-meander-10', level: 6,
      title: { zh: '繞三倍遠', en: 'Three times the distance' },
      desc: { zh: '讓彎曲度達到 3：河道長度是河谷的 3 倍。', en: 'Reach a sinuosity of 3: the channel three times as long as the valley.' },
      check: function (ev) { const d = M(ev); return !!d && d.sin >= 3; }
    },
    {
      id: 'river-meander-11', level: 6,
      title: { zh: '二十個牛軛湖', en: 'Twenty cut-offs' },
      desc: { zh: '讓同一條河自然截彎累積 20 次（清除或換河谷會重算）。', en: 'Let one river cut off 20 loops by itself (clearing or a new valley starts the count again).' },
      check: function (ev) { const d = M(ev); return !!d && d.cuts >= 20; }
    },
    {
      id: 'river-meander-12', level: 7,
      title: { zh: '淤成溼地', en: 'From lake to wetland' },
      desc: { zh: '等一個牛軛湖淤滿變成溼地（形成後 400 年）。', en: 'Wait for an oxbow lake to fill in and become a wetland (400 years after it forms).' },
      check: function (ev) { const d = M(ev); return !!d && d.oldest >= FILL; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'river-meander-h1', level: 3, hidden: true,
      riddle: { zh: '去問問那彎被遺忘的水。', en: 'Go and ask the water that was left behind.' },
      check: function (ev) { const d = M(ev); return !!d && d.act === 'oxbow' && !!d.selOx; }
    },
    {
      id: 'river-meander-h2', level: 4, hidden: true,
      riddle: { zh: '彎道內側，河床探出了頭。', en: 'On the inside of the bend, the riverbed comes up for air.' },
      check: function (ev) { const d = M(ev); return !!d && d.act === 'select' && !!d.sel && d.sel.bar && !d.sel.top; }
    },
    {
      id: 'river-meander-h3', level: 5, hidden: true,
      riddle: { zh: '同一年，河流放手了四次。', en: 'Four times in one year, the river let go.' },
      check: function (ev) { const d = M(ev); return !!d && d.minGap4 != null && d.minGap4 <= 1; }
    },
    {
      id: 'river-meander-h4', level: 6, hidden: true,
      riddle: { zh: '找到河咬得最用力的那一口。', en: 'Find where the river bites hardest.' },
      check: function (ev) { const d = M(ev); return !!d && d.act === 'select' && !d.running && !!d.sel && d.sel.top; }
    },
    {
      id: 'river-meander-h5', level: 7, hidden: true,
      riddle: { zh: '河流偷偷背下了圓周率。', en: 'The river has quietly learned a famous number by heart.' },
      check: function (ev) { const d = M(ev); return !!d && !d.running && d.t > 0 && Math.abs(d.sin - Math.PI) <= 0.002; }
    },
    {
      id: 'river-meander-h6', level: 7, hidden: true,
      riddle: { zh: '一千年，沒有一個彎被拋下。', en: 'A thousand years, and not one bend abandoned.' },
      check: function (ev) { const d = M(ev); return !!d && d.t >= 1000 && d.sinceNat >= 1000; }
    },
    {
      id: 'river-meander-h7', level: 8, hidden: true,
      riddle: { zh: '一條捷徑，替水省下一段很長很長的路。', en: 'One shortcut spares the water a very, very long walk.' },
      check: function (ev) { const d = M(ev); return !!d && d.act === 'art' && !!d.lastArt && d.lastArt.saved >= 5000; }
    },
    {
      id: 'river-meander-h8', level: 8, hidden: true,
      riddle: { zh: '把它拉直，好像什麼都沒發生過。', en: 'Pull it straight, as if nothing had ever happened.' },
      check: function (ev) { const d = M(ev); return !!d && d.act === 'art' && d.straightAt != null && !!d.lastArt && d.lastArt.t === d.straightAt; }
    },
    {
      id: 'river-meander-h9', level: 9, hidden: true,
      riddle: { zh: '走四步半，才前進一步。', en: 'Four and a half steps to move one step forward.' },
      check: function (ev) { const d = M(ev); return !!d && d.sin >= 4.5; }
    },
    {
      id: 'river-meander-h10', level: 10, hidden: true,
      riddle: { zh: '人拉直的，河會再彎回去。', en: 'What people pull straight, the river bends back.' },
      check: function (ev) { const d = M(ev); return !!d && d.straightAt != null && d.t > d.straightAt && d.sin >= 2.5; }
    }
  ]);
})();
