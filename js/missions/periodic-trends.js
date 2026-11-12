/* missions/periodic-trends.js — 週期表與週期性的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/periodic-trends.js 只在使用者操作之後回報）：
  //   'select'：{ Z, prop（'r'／'IE'／'EN'／'mp'／'rho'／'cat'）, hiddenSel }
  //   'graph'：{ tab（'z'／'period'／'group'）, prop, period, group, Z }
  //   'view3d'：{ prop }
  //   'predict'：{ prop, Z, guess, actual, err, hit, streak }
  const sel = function (ev, Z, prop) { const d = ev.type === 'select' && ev.data; return !!d && d.Z === Z && d.prop === prop && !d.hiddenSel; };
  const gr = function (ev) { return ev.type === 'graph' && ev.data ? ev.data : null; };
  const pr = function (ev) { return ev.type === 'predict' && ev.data ? ev.data : null; };

  LabMission.register('periodic-trends', [
    {
      id: 'periodic-trends-1', level: 1,
      title: { zh: '最貪心的原子', en: 'The greediest atom' },
      desc: { zh: '依電負度著色，選出電負度最大的元素。', en: 'Colour the table by electronegativity and choose the element with the largest electronegativity.' },
      check: function (ev) { return sel(ev, 9, 'EN'); }
    },
    {
      id: 'periodic-trends-2', level: 2,
      title: { zh: '最大的原子', en: 'The biggest atom' },
      desc: { zh: '依原子半徑著色，選出半徑最大的元素（只算有數據的）。', en: 'Colour by atomic radius and choose the element with the largest radius (among those with data).' },
      check: function (ev) { return sel(ev, 55, 'r'); }
    },
    {
      id: 'periodic-trends-3', level: 2,
      title: { zh: '最難拿走的電子', en: 'The hardest electron to remove' },
      desc: { zh: '依游離能著色，選出第一游離能最大的元素。', en: 'Colour by ionization energy and choose the element with the largest first ionization energy.' },
      check: function (ev) { return sel(ev, 2, 'IE'); }
    },
    {
      id: 'periodic-trends-4', level: 3,
      title: { zh: '會流動的金屬', en: 'A metal that flows' },
      desc: { zh: '依熔點著色，選出室溫下是液體的那一種金屬。', en: 'Colour by melting point and choose the one metal that is a liquid at room temperature.' },
      check: function (ev) { return sel(ev, 80, 'mp'); }
    },
    {
      id: 'periodic-trends-5', level: 3,
      title: { zh: '立起來的週期表', en: 'The table stands up' },
      desc: { zh: '切換到「3D 立體」，看週期表變成立體長條圖。', en: 'Switch to “3D bars” and see the table turn into a 3D bar chart.' },
      check: function (ev) { return ev.type === 'view3d'; }
    },
    {
      id: 'periodic-trends-6', level: 4,
      title: { zh: '越往右越小', en: 'Smaller to the right' },
      desc: { zh: '在「同週期」圖表中，看第 3 週期的原子半徑。', en: 'Use the “Same period” graph to look at the atomic radii of period 3.' },
      check: function (ev) { const d = gr(ev); return !!d && d.tab === 'period' && d.prop === 'r' && d.period === 3; }
    },
    {
      id: 'periodic-trends-7', level: 4,
      title: { zh: '鹵素家族', en: 'The halogen family' },
      desc: { zh: '在「同族」圖表中，看第 17 族的電負度。', en: 'Use the “Same group” graph to look at the electronegativities of group 17.' },
      check: function (ev) { const d = gr(ev); return !!d && d.tab === 'group' && d.prop === 'EN' && d.group === 17; }
    },
    {
      id: 'periodic-trends-8', level: 5,
      title: { zh: '不守規矩的游離能', en: 'Ionization energy breaks the rule' },
      desc: { zh: '在「同週期」的游離能圖中，選一個游離能比左邊元素還小的元素（第 2 或第 3 週期）。', en: 'In the “Same period” ionization-energy graph, choose an element whose ionization energy is lower than that of the element to its left (period 2 or 3).' },
      check: function (ev) { const d = gr(ev); return !!d && d.tab === 'period' && d.prop === 'IE' && [5, 8, 13, 16].indexOf(d.Z) >= 0; }
    },
    {
      id: 'periodic-trends-9', level: 5,
      title: { zh: '由鄰居猜', en: 'Ask the neighbours' },
      desc: { zh: '在猜猜看卡片按「開始」，猜中一題（誤差 10% 以內）。', en: 'Press “Start” on the guessing card and get one within 10%.' },
      check: function (ev) { const d = pr(ev); return !!d && d.err <= 0.10; }
    },
    {
      id: 'periodic-trends-10', level: 6,
      title: { zh: '精準的游離能', en: 'Ionization energy, precisely' },
      desc: { zh: '按「開始」玩猜猜看，猜第一游離能，誤差在 5% 以內。', en: 'Press “Start” to play the guessing game and predict a first ionization energy to within 5%.' },
      check: function (ev) { const d = pr(ev); return !!d && d.prop === 'IE' && d.err <= 0.05; }
    },
    {
      id: 'periodic-trends-11', level: 7,
      title: { zh: '看出規律了', en: 'You see the pattern' },
      desc: { zh: '按「開始」玩猜猜看，連續猜中 3 題（每題誤差 10% 以內）。', en: 'Press “Start” to play the guessing game and get 3 in a row (each within 10%).' },
      check: function (ev) { const d = pr(ev); return !!d && d.hit && d.streak >= 3; }
    },
    {
      id: 'periodic-trends-12', level: 8,
      title: { zh: '週期表在心中', en: 'The table in your head' },
      desc: { zh: '按「開始」玩猜猜看，連續猜中 5 題（每題誤差 10% 以內）。', en: 'Press “Start” to play the guessing game and get 5 in a row (each within 10%).' },
      check: function (ev) { const d = pr(ev); return !!d && d.hit && d.streak >= 5; }
    },
    {
      id: 'periodic-trends-h1', level: 3, hidden: true,
      riddle: { zh: '一直走，走到沒有路。', en: 'Keep walking until there is no more road.' },
      check: function (ev) { return ev.type === 'select' && !!ev.data && ev.data.Z === 118; }
    },
    {
      id: 'periodic-trends-h2', level: 4, hidden: true,
      riddle: { zh: '金屬裡的守財奴。', en: 'The miser among the metals.' },
      check: function (ev) { return sel(ev, 79, 'EN'); }
    },
    {
      id: 'periodic-trends-h3', level: 5, hidden: true,
      riddle: { zh: '差一點點都不行。', en: 'Not even a hair off.' },
      check: function (ev) { const d = pr(ev); return !!d && d.err <= 0.005; }
    }
  ]);
})();
