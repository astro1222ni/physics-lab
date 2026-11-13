/* missions/population-pyramid.js — 人口金字塔與人口推估的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/population-pyramid.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'pop'：播放時大約每 0.3 秒一次，另外在播放／暫停、往後 1 年、回到 2025、拖年份、看過去的年份、換情境、改滑桿、
 *          換對照、點長條（跟著一個出生年）時立刻回報。
 *     data = {
 *       act（play、playstart、pause、step、back、year、past、mode、param、cmp、cohort）, running, mode（ndc／custom／stable）,
 *       view（proj 推估／past 過去）, real（畫面上是真實資料：過去的年份，或 2025 年而且不是穩定人口）,
 *       year, tfr（這一年的總生育率）, e0（平均壽命設定）, net（淨遷入設定，千人／年；不是自訂時為 0）, srb（出生性比例設定）,
 *       total, total2025（2025 年底真實總人口）, pct0_14, pct65, dep（扶養比）, depPrev（前一年的扶養比）, aging（老化指數）,
 *       median（年齡中位數）, sexRatio, p100（100 歲以上人數）, shape（expansive／stationary／constrictive）,
 *       cmp（none／start／ndc）, cmpDist（和對照的逐歲差距，比例）, cohort（跟著的出生年）, cohortAge, cohortFrom（開始跟的時候幾歲）, cohortN,
 *       r（穩定人口的年增加率）, depMin（穩定人口裡，同樣平均壽命與性比例下扶養比的最低值）
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const P = function (ev) { return ev.type === 'pop' ? ev.data : null; };
  const DRAGON = [1976, 1988, 2000, 2012], TIGER = [1998, 2010];

  LabMission.register('population-pyramid', [
    {
      id: 'population-pyramid-1', level: 1,
      title: { zh: '走到 2050 年', en: 'On to 2050' },
      desc: { zh: '按「播放」或拖年份，看 2050 年的人口金字塔。', en: 'Press Play or drag the year to see the pyramid in 2050.' },
      check: function (ev) { const d = P(ev); return !!d && d.view === 'proj' && d.year >= 2050; }
    },
    {
      id: 'population-pyramid-2', level: 2,
      title: { zh: '回到 1992 年', en: 'Back to 1992' },
      desc: { zh: '看 1992 年的真實人口金字塔，和 2025 年比一比。', en: 'Look at the real pyramid of 1992 and compare it with 2025.' },
      check: function (ev) { const d = P(ev); return !!d && d.view === 'past' && d.year === 1992; }
    },
    {
      id: 'population-pyramid-3', level: 2,
      title: { zh: '跟著一個世代', en: 'Follow a generation' },
      desc: { zh: '點一條長條，跟著那一年出生的人。', en: 'Tap a bar to follow the people born in that year.' },
      check: function (ev) { const d = P(ev); return !!d && d.act === 'cohort' && d.cohort != null && d.cohortAge >= 0 && d.cohortAge <= 100; }
    },
    {
      id: 'population-pyramid-4', level: 3,
      title: { zh: '扶養比破百的那一年', en: 'The year dependants outnumber workers' },
      desc: { zh: '停在扶養比剛超過 100 的那一年（前一年還不到 100）。', en: 'Stop exactly at the year the dependency ratio first goes over 100 (it was under 100 the year before).' },
      check: function (ev) { const d = P(ev); return !!d && !d.running && d.view === 'proj' && d.depPrev != null && d.depPrev < 100 && d.dep >= 100; }
    },
    {
      id: 'population-pyramid-5', level: 3,
      title: { zh: '變回金字塔', en: 'A pyramid again' },
      desc: { zh: '在「自訂」裡讓人口結構變成擴張型。', en: 'In “My own”, make the age structure expansive.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && d.shape === 'expansive'; }
    },
    {
      id: 'population-pyramid-6', level: 4,
      title: { zh: '和國發會對答案', en: 'Check against the official figures' },
      desc: { zh: '用國發會中推估走到 2050 年以後，對照國發會公布的推估人數。', en: 'Follow the official projection to 2050 or later and compare it with the published figures.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'ndc' && d.view === 'proj' && d.cmp === 'ndc' && d.cmpDist != null && d.year >= 2050; }
    },
    {
      id: 'population-pyramid-7', level: 4,
      title: { zh: '高齡社會倒退', en: 'Turning back the clock on ageing' },
      desc: { zh: '在「自訂」裡，讓 2125 年 65 歲以上的人少於 14%。', en: 'In “My own”, get the share aged 65+ below 14% by 2125.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && d.year === 2125 && d.pct65 < 14; }
    },
    {
      id: 'population-pyramid-8', level: 5,
      title: { zh: '人口慣性', en: 'Population momentum' },
      desc: { zh: '總生育率設成 2.1、淨遷入 0，到 2075 年人口還是比 2025 年少。', en: 'Set the fertility rate to 2.1 and net migration to 0: in 2075 the population is still smaller than in 2025.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && Math.abs(d.tfr - 2.1) <= 0.001 && d.net === 0 && d.year >= 2075 && d.total < d.total2025; }
    },
    {
      id: 'population-pyramid-9', level: 5,
      title: { zh: '靠移民撐住', en: 'Held up by migration' },
      desc: { zh: '總生育率不超過 1.0，到 2075 年人口仍不少於 2025 年。', en: 'With a fertility rate of 1.0 or less, still have at least as many people in 2075 as in 2025.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && d.tfr <= 1.0 && d.year >= 2075 && d.total >= d.total2025; }
    },
    {
      id: 'population-pyramid-10', level: 6,
      title: { zh: '零成長', en: 'Zero growth' },
      desc: { zh: '找一個每年增減不到 0.05% 的穩定人口。', en: 'Find a stable population that grows or shrinks by less than 0.05% a year.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'stable' && d.view === 'proj' && d.r != null && Math.abs(d.r) < 0.0005; }
    },
    {
      id: 'population-pyramid-11', level: 6,
      title: { zh: '延長人口紅利', en: 'Make the dividend last' },
      desc: { zh: '在「自訂」裡，讓 2075 年的扶養比不超過 70。', en: 'In “My own”, keep the dependency ratio at 70 or below in 2075.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && d.year === 2075 && d.dep <= 70; }
    },
    {
      id: 'population-pyramid-12', level: 7,
      title: { zh: '百年後回到原點', en: 'Back where we started' },
      desc: { zh: '總生育率不超過 1.5，讓 2125 年的人口和 2025 年相差不到 1%。', en: 'With a fertility rate of 1.5 or less, end 2125 within 1% of the 2025 population.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && d.tfr <= 1.5 && d.year === 2125 && Math.abs(d.total / d.total2025 - 1) < 0.01; }
    },

    // ---------- 隱藏任務 ----------
    {
      id: 'population-pyramid-h1', level: 3, hidden: true,
      riddle: { zh: '有些年份，大家特別想生孩子。', en: 'In some years, everyone seems to want a baby.' },
      check: function (ev) { const d = P(ev); return !!d && d.act === 'cohort' && d.real && DRAGON.indexOf(d.cohort) >= 0; }
    },
    {
      id: 'population-pyramid-h2', level: 4, hidden: true,
      riddle: { zh: '老虎來的那一年，搖籃特別空。', en: 'The year the tiger came, the cradles stood empty.' },
      check: function (ev) { const d = P(ev); return !!d && d.act === 'cohort' && d.real && TIGER.indexOf(d.cohort) >= 0; }
    },
    {
      id: 'population-pyramid-h3', level: 5, hidden: true,
      riddle: { zh: '天平剛好停在中間。', en: 'The scales come to rest exactly level.' },
      check: function (ev) { const d = P(ev); return !!d && !d.running && d.view === 'proj' && d.year > 2025 && Math.abs(d.sexRatio - 100) <= 0.05; }
    },
    {
      id: 'population-pyramid-h4', level: 6, hidden: true,
      riddle: { zh: '從搖籃開始陪著，一直走到一百歲。', en: 'Walk beside them from the cradle to a hundred.' },
      check: function (ev) { const d = P(ev); return !!d && d.view === 'proj' && d.cohortFrom != null && d.cohortFrom <= 5 && d.cohortAge >= 100; }
    },
    {
      id: 'population-pyramid-h5', level: 7, hidden: true,
      riddle: { zh: '永遠是一個孩子，對著十個長輩。', en: 'For ever, one child for every ten elders.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'stable' && d.act === 'param' && Math.abs(d.aging - 1000) <= 10; }
    },
    {
      id: 'population-pyramid-h6', level: 7, hidden: true,
      riddle: { zh: '不到四十年，一半的人不見了。', en: 'In under forty years, half the people are gone.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && d.year <= 2064 && d.total <= d.total2025 / 2; }
    },
    {
      id: 'population-pyramid-h7', level: 8, hidden: true,
      riddle: { zh: '一半的人還沒長大。', en: 'Half the people have not grown up yet.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && d.median < 16; }
    },
    {
      id: 'population-pyramid-h8', level: 8, hidden: true,
      riddle: { zh: '三十五年，一個變成兩個。', en: 'In thirty-five years, one becomes two.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'stable' && d.act === 'param' && d.r > 0 && Math.abs(Math.log(2) / Math.log(1 + d.r) - 35) <= 0.25; }
    },
    {
      id: 'population-pyramid-h9', level: 9, hidden: true,
      riddle: { zh: '百歲的人，坐滿一座城。', en: 'Enough centenarians to fill a city.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'custom' && d.view === 'proj' && d.year <= 2045 && d.p100 >= 100000; }
    },
    {
      id: 'population-pyramid-h10', level: 10, hidden: true,
      riddle: { zh: '生得太多是負擔，生得太少也是；找出剛剛好的那一個。', en: 'Too many births is a burden, and so is too few. Find the one in between.' },
      check: function (ev) { const d = P(ev); return !!d && d.mode === 'stable' && d.act === 'param' && d.depMin != null && d.dep - d.depMin <= 0.02; }
    }
  ]);
})();
