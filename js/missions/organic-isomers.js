/* missions/organic-isomers.js — 同分異構物的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/organic-isomers.js 只在使用者操作之後回報）：
  //   'mol'：分子改變或切到 3D { en（英文 IUPAC 名；順反未定時 null）, formula, cls, key, key0, W, bp, n, view, pairDone, wienerPair, tetraStereo }
  //   'collect'：按「收進圖鑑」{ target, n, total, complete, added, en }
  //   'twist'：拖「扭轉角」{ en, order, angle, E, eclipsed, light }
  //   'photo'：照光翻轉 { from, to }
  const mol = function (ev) { return ev.type === 'mol' && ev.data ? ev.data : null; };
  const full = function (id) { return function (ev) { const d = ev.type === 'collect' && ev.data; return !!d && d.target === id && d.complete && d.n >= d.total && d.total > 0; }; };
  const is = function (en, view) { return function (ev) { const d = mol(ev); return !!d && d.en === en && (!view || d.view === view); }; };

  LabMission.register('organic-isomers', [
    {
      id: 'organic-isomers-1', level: 1,
      title: { zh: '三個碳', en: 'Three carbons' },
      desc: { zh: '在格子上組出丙烷（C3H8）。', en: 'Build propane (C3H8) on the grid.' },
      check: is('propane')
    },
    {
      id: 'organic-isomers-2', level: 2,
      title: { zh: '分岔的丁烷', en: 'A branched butane' },
      desc: { zh: '組出 2-甲基丙烷：分子式和丁烷一樣是 C4H10，碳骨架卻有分岔。', en: 'Build 2-methylpropane: the same formula C4H10 as butane, but with a branched skeleton.' },
      check: is('2-methylpropane')
    },
    {
      id: 'organic-isomers-3', level: 3,
      title: { zh: '最早沸騰的戊烷', en: 'The first pentane to boil' },
      desc: { zh: '組出沸點最低的 C5H12 異構物。', en: 'Build the C5H12 isomer with the lowest boiling point.' },
      check: is('2,2-dimethylpropane')
    },
    {
      id: 'organic-isomers-4', level: 3,
      title: { zh: '戊烷收齊', en: 'All the pentanes' },
      desc: { zh: '在異構物圖鑑的分子式選單選 C5H12，把它的烷類異構物全部「收進圖鑑」。', en: 'Choose C5H12 in the formula menu of the isomer collection and “Add to collection” every one of its alkane isomers.' },
      check: full('C5H12')
    },
    {
      id: 'organic-isomers-5', level: 4,
      title: { zh: '順與反', en: 'Cis and trans' },
      desc: { zh: '做出一對順反異構物：先組出其中一個，再組出另一個（同一個結構，雙鍵兩側的排法相反）。', en: 'Make a cis–trans pair: build one, then the other (the same structure with the groups on the C=C arranged the other way).' },
      check: function (ev) { const d = mol(ev); return !!d && d.pairDone; }
    },
    {
      id: 'organic-isomers-6', level: 5,
      title: { zh: '酒精與它的雙胞胎', en: 'Alcohol and its twin' },
      desc: { zh: '在異構物圖鑑的分子式選單選 C2H6O，把醇和醚都「收進圖鑑」。比一比它們的沸點。', en: 'Choose C2H6O in the formula menu of the isomer collection and “Add to collection” both the alcohol and the ether. Compare their boiling points.' },
      check: full('C2H6O')
    },
    {
      id: 'organic-isomers-7', level: 6,
      title: { zh: '己烷五兄弟', en: 'Five hexanes' },
      desc: { zh: '在異構物圖鑑的分子式選單選 C6H14，把 5 種烷類異構物全部「收進圖鑑」。', en: 'Choose C6H14 in the formula menu of the isomer collection and “Add to collection” all 5 alkane isomers.' },
      check: full('C6H14')
    },
    {
      id: 'organic-isomers-8', level: 6,
      title: { zh: '光讓雙鍵翻身', en: 'Light flips a double bond' },
      desc: { zh: '組出順-2-丁烯，切到「3D 立體」，選它的 C=C，勾「照光」，把「扭轉角」扭過 90° 再放手，讓它變成反-2-丁烯。', en: 'Build cis-2-butene, switch to “3D model”, choose its C=C, tick “Shine UV light”, and turn the “Twist angle” past 90° before letting go, so it becomes trans-2-butene.' },
      check: function (ev) { return ev.type === 'photo' && !!ev.data && ev.data.from === 'cis-2-butene' && ev.data.to === 'trans-2-butene'; }
    },
    {
      id: 'organic-isomers-9', level: 7,
      title: { zh: '環也算', en: 'Rings count too' },
      desc: { zh: '選 C4H8 的「全部，含環與順反」，把烯類、環狀分子和順反異構物全部「收進圖鑑」。', en: 'Choose C4H8 “all, rings and cis/trans counted” and “Add to collection” every alkene, ring and cis–trans isomer.' },
      check: full('C4H8')
    },
    {
      id: 'organic-isomers-10', level: 8,
      title: { zh: '四碳醇與醚', en: 'Four-carbon alcohols and ethers' },
      desc: { zh: '選 C4H10O，把所有醇和醚（共 7 種）都「收進圖鑑」。', en: 'Choose C4H10O and “Add to collection” all the alcohols and ethers (7 in total).' },
      check: full('C4H10O')
    },
    {
      id: 'organic-isomers-11', level: 9,
      title: { zh: '庚烷九種', en: 'Nine heptanes' },
      desc: { zh: '選 C7H16，把 9 種烷類異構物全部「收進圖鑑」。', en: 'Choose C7H16 and “Add to collection” all 9 alkane isomers.' },
      check: full('C7H16')
    },
    {
      id: 'organic-isomers-12', level: 10,
      title: { zh: '辛烷十八種', en: 'Eighteen octanes' },
      desc: { zh: '選 C8H18，把 18 種烷類異構物全部「收進圖鑑」。', en: 'Choose C8H18 and “Add to collection” all 18 alkane isomers.' },
      check: full('C8H18')
    },
    {
      id: 'organic-isomers-h1', level: 3, hidden: true,
      riddle: { zh: '指甲上的顏色，被它一抹就掉。', en: 'One wipe, and the colour on the nails is gone.' },
      check: is('propanone')
    },
    {
      id: 'organic-isomers-h2', level: 4, hidden: true,
      riddle: { zh: '四個碳，站成一條筆直的隊伍。', en: 'Four carbons, standing in one perfectly straight line.' },
      check: is('2-butyne', '3d')
    },
    {
      id: 'organic-isomers-h3', level: 5, hidden: true,
      riddle: { zh: '兩張臉正對著，最不自在。', en: 'Face to face is the least comfortable way to stand.' },
      check: function (ev) { const d = ev.type === 'twist' && ev.data; return !!d && d.en === 'ethane' && d.order === 1 && d.eclipsed; }
    },
    {
      id: 'organic-isomers-h4', level: 4, hidden: true,
      riddle: { zh: '橡膠樹流下的乳白汁液，拆到最小的一塊。', en: 'The milky sap of the rubber tree, taken apart down to its smallest piece.' },
      check: is('2-methyl-1,3-butadiene')
    },
    {
      id: 'organic-isomers-h5', level: 5, hidden: true,
      riddle: { zh: '六個人手牽著手，坐成一把椅子。', en: 'Six holding hands, sitting down as a chair.' },
      check: is('cyclohexane', '3d')
    },
    {
      id: 'organic-isomers-h6', level: 6, hidden: true,
      riddle: { zh: '數字一樣，身形不同。', en: 'The same number, a different shape.' },
      check: function (ev) { const d = mol(ev); return !!d && d.wienerPair; }
    },
    {
      id: 'organic-isomers-h7', level: 7, hidden: true,
      riddle: { zh: '有人夢見一條蛇，咬住了自己的尾巴。', en: 'Someone dreamt of a snake biting its own tail.' },
      check: is('benzene')
    },
    {
      id: 'organic-isomers-h8', level: 7, hidden: true,
      riddle: { zh: '加油站的數字裡，滿分的那一位。', en: 'Among the numbers at the petrol pump, the one that scores a hundred.' },
      check: is('2,2,4-trimethylpentane')
    },
    {
      id: 'organic-isomers-h9', level: 8, hidden: true,
      riddle: { zh: '兩端都沒有空手，卻仍分得出左右。', en: 'Neither end has a free hand, yet left and right can still be told apart.' },
      check: function (ev) { const d = mol(ev); return !!d && d.tetraStereo && d.en != null; }
    },
    {
      id: 'organic-isomers-h10', level: 10, hidden: true,
      riddle: { zh: '兄弟們都還在流動，只有它早已凝結。', en: 'All its brothers still flow; it alone set long ago.' },
      check: is('2,2,3,3-tetramethylbutane')
    }
  ]);
})();
