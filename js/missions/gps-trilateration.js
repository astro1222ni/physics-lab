/* missions/gps-trilateration.js — GPS 三邊定位的任務（星星數 = 等級；隱藏任務 = 等級 × 2）
 *
 * 事件（js/gps-trilateration.js 只在使用者操作過之後才回報；載入頁面不算）：
 *   'gps'：拖曳滑桿時大約每 0.25 秒一次；放開滑桿、換練習、換畫面、開關發射塔、按「讓接收機自己解」、
 *          拖曳接收機、點衛星、換時鐘做法、播放時間、轉動地球時回報。
 *     data = {
 *       act（plane、sky、time、mode、view、clock、tower、solve、useall、drag、sat、rotate）, mode（plane／sky）, view（globe／skyplot／fix）,
 *       plane = { n（用到的塔數）, on, tau（真正的時鐘偏差 μs）, guess（時鐘修正 μs）, noise（m）, rx（接收機 km）,
 *                 miss（圓離同一點多遠，m）, err（估計位置誤差，m）, nX（兩座塔時的交點數）, xErr（交點離接收機最近多少 m）,
 *                 near（離最近一座用到的塔 km）, seg（兩座塔時，接收機到兩塔連線段的距離 km）, solved（剛按過自己解）, fullTau, hdop },
 *       sky = { lat, lon, t（分鐘）, mask, wall, mp, sig, clock（solve／assume）, ctau（μs）, nVis, nUsed, nExcl, maxEl（用到的衛星最高仰角）,
 *               pAll（全部看得到的衛星一起用時的 PDOP）, playing, dop = { p, h, v, t }（衛星不夠時 null）, hrms, biasH, biasV（m） }
 *     }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  const V = function (ev) { return ev.type === 'gps' ? ev.data : null; };
  const P = function (ev) { const d = V(ev); return d && d.mode === 'plane' ? d.plane : null; };
  const S = function (ev) { const d = V(ev); return d && d.mode === 'sky' ? d.sky : null; };
  const solve4 = function (s) { return !!s && s.clock === 'solve' && !!s.dop; };

  LabMission.register('gps-trilateration', [
    {
      id: 'gps-trilateration-1', level: 1,
      title: { zh: '登山客出發', en: 'Off on a hike' },
      desc: { zh: '在平面練習裡拖曳登山客，看三個圓怎麼跟著改變。', en: 'In the tower practice, drag the hiker and watch the circles change.' },
      check: function (ev) { const d = V(ev); return !!d && d.mode === 'plane' && d.act === 'drag'; }
    },
    {
      id: 'gps-trilateration-2', level: 2,
      title: { zh: '抬頭看天空', en: 'Look up' },
      desc: { zh: '到「天上的衛星」，打開天空圖。', en: 'Go to “Satellites” and open the sky plot.' },
      check: function (ev) { const d = V(ev); return !!d && d.mode === 'sky' && d.view === 'skyplot'; }
    },
    {
      id: 'gps-trilateration-3', level: 3,
      title: { zh: '自己對準時鐘', en: 'Set the clock yourself' },
      desc: { zh: '至少三座塔、時鐘偏差至少 5 μs：用手拖動時鐘修正，讓所有的圓交在同一點（差不到 20 m）。', en: 'With at least three towers and a clock error of at least 5 μs, drag the clock correction by hand until every circle meets at one point (within 20 m).' },
      check: function (ev) { const p = P(ev); return !!p && p.n >= 3 && Math.abs(p.tau) >= 5 && p.miss != null && p.miss < 20 && !p.solved; }
    },
    {
      id: 'gps-trilateration-4', level: 3,
      title: { zh: '在哪一個交點？', en: 'Which crossing?' },
      desc: { zh: '只用兩座塔，時鐘修正對，讓兩個圓的交點之一剛好是接收機（差不到 50 m）。', en: 'Use only two towers with the clock correct, so that one of the two crossings is the receiver (within 50 m).' },
      check: function (ev) { const p = P(ev); return !!p && p.n === 2 && p.nX === 2 && p.xErr != null && p.xErr < 50; }
    },
    {
      id: 'gps-trilateration-5', level: 3,
      title: { zh: '交給接收機', en: 'Let the receiver do it' },
      desc: { zh: '時鐘偏差至少 10 μs，至少三座塔，按「讓接收機自己解」，位置誤差不到 1 m。', en: 'With a clock error of at least 10 μs and three or more towers, press “Let the receiver solve it” and get the position within 1 m.' },
      check: function (ev) { const p = P(ev); return !!p && p.solved && p.n >= 3 && Math.abs(p.tau) >= 10 && p.err != null && p.err < 1; }
    },
    {
      id: 'gps-trilateration-6', level: 4,
      title: { zh: '四顆就夠', en: 'Four is enough' },
      desc: { zh: '連時鐘一起解，只用四顆衛星，PDOP 不超過 3。', en: 'Solving for the clock too, use exactly four satellites with a PDOP of 3 or less.' },
      check: function (ev) { const s = S(ev); return solve4(s) && s.nUsed === 4 && s.dop.p <= 3; }
    },
    {
      id: 'gps-trilateration-7', level: 4,
      title: { zh: '差一點，差很多', en: 'A little off, a long way off' },
      desc: { zh: '假設時鐘是準的，但時鐘其實偏了不到 0.5 μs，讓位置偏掉至少 200 m（水平和垂直合起來）。', en: 'Assume the clock is right while it is actually off by less than 0.5 μs, and let the position shift by at least 200 m (horizontal and vertical together).' },
      check: function (ev) { const s = S(ev); return !!s && s.clock === 'assume' && s.nUsed >= 4 && Math.abs(s.ctau) <= 0.5 && s.biasH != null && Math.hypot(s.biasH, s.biasV) >= 200; }
    },
    {
      id: 'gps-trilateration-8', level: 5,
      title: { zh: '高樓之間', en: 'Between tall buildings' },
      desc: { zh: '街谷兩側大樓頂的仰角至少 45°，連時鐘一起解還算得出來，而且 PDOP 不超過 4。', en: 'With rooftops at least 45° high on both sides, still get a solution (clock included) with a PDOP of 4 or less.' },
      check: function (ev) { const s = S(ev); return solve4(s) && s.wall >= 45 && s.dop.p <= 4; }
    },
    {
      id: 'gps-trilateration-9', level: 5,
      title: { zh: '繞路的訊號', en: 'Signals that take the long way' },
      desc: { zh: '仰角遮罩至少 10°，讓多路徑造成的水平固定偏移至少 6 m。', en: 'With an elevation mask of at least 10°, make multipath shift the position sideways by at least 6 m.' },
      check: function (ev) { const s = S(ev); return !!s && s.mask >= 10 && s.biasH != null && s.biasH >= 6; }
    },
    {
      id: 'gps-trilateration-10', level: 6,
      title: { zh: '關鍵的那一顆', en: 'The one that mattered' },
      desc: { zh: '只拿掉一顆衛星，讓 PDOP 變成原來（全部都用）的 1.5 倍以上。', en: 'Drop a single satellite and make the PDOP at least 1.5 times what it was with all of them.' },
      check: function (ev) { const s = S(ev); return solve4(s) && s.nExcl === 1 && s.pAll != null && s.dop.p >= 1.5 * s.pAll; }
    },
    {
      id: 'gps-trilateration-11', level: 5,
      title: { zh: '滿天星', en: 'A sky full of satellites' },
      desc: { zh: '仰角遮罩至少 5°，同時用到至少 10 顆衛星。', en: 'With an elevation mask of at least 5°, use at least 10 satellites at once.' },
      check: function (ev) { const s = S(ev); return !!s && s.mask >= 5 && s.nUsed >= 10; }
    },
    {
      id: 'gps-trilateration-12', level: 7,
      title: { zh: '最好的四顆', en: 'The best four' },
      desc: { zh: '仰角遮罩至少 10°，連時鐘一起解，只用四顆衛星，PDOP 不超過 2.2。', en: 'With an elevation mask of at least 10°, solving for the clock, use exactly four satellites with a PDOP of 2.2 or less.' },
      check: function (ev) { const s = S(ev); return solve4(s) && s.mask >= 10 && s.nUsed === 4 && s.dop.p <= 2.2; }
    },

    // ---------------- 隱藏任務 ----------------
    {
      id: 'gps-trilateration-h1', level: 3, hidden: true,
      riddle: { zh: '鐵塔的影子，落在你的鞋上。', en: 'The tower’s shadow falls on your shoes.' },
      check: function (ev) { const d = V(ev), p = P(ev); return !!p && d.act === 'drag' && p.n >= 1 && p.near < 0.3; }
    },
    {
      id: 'gps-trilateration-h2', level: 4, hidden: true,
      riddle: { zh: '兩道漣漪，只在你身上輕輕一碰。', en: 'Two ripples barely brush, right where you stand.' },
      check: function (ev) { const p = P(ev); return !!p && p.n === 2 && Math.abs(p.tau - p.guess) <= 0.05 && p.seg != null && p.seg < 0.15 && p.near > 1; }
    },
    {
      id: 'gps-trilateration-h3', level: 5, hidden: true,
      riddle: { zh: '抬起頭，它就在你的正上方。', en: 'Look straight up: it is right there.' },
      check: function (ev) { const s = S(ev); return !!s && s.nUsed >= 1 && s.maxEl >= 88; }
    },
    {
      id: 'gps-trilateration-h4', level: 6, hidden: true,
      riddle: { zh: '在世界的頂端，最難知道的是自己有多高。', en: 'At the top of the world, the hardest thing to know is how high you are.' },
      check: function (ev) { const d = V(ev), s = S(ev); return solve4(s) && d.view === 'fix' && Math.abs(s.lat) >= 80 && s.wall === 0 && s.mask <= 10 && s.nExcl === 0 && s.dop.v >= 3 * s.dop.h; }
    },
    {
      id: 'gps-trilateration-h5', level: 6, hidden: true,
      riddle: { zh: '天空重新排好，比太陽早了四分鐘。', en: 'The sky lines up again, four minutes ahead of the Sun.' },
      check: function (ev) { const d = V(ev), s = S(ev); return !!s && d.view === 'skyplot' && !s.playing && s.t >= 1435 && s.t <= 1437; }
    },
    {
      id: 'gps-trilateration-h6', level: 7, hidden: true,
      riddle: { zh: '四顆星站在差不多的高度，你的高度就跟著消失。', en: 'Four satellites at nearly the same height, and your own height fades away.' },
      check: function (ev) { const s = S(ev); return solve4(s) && s.wall === 0 && s.nExcl >= 2 && s.nUsed === 4 && s.dop.p >= 50; }
    },
    {
      id: 'gps-trilateration-h7', level: 7, hidden: true,
      riddle: { zh: '借來一只原子鐘，第四顆星就可以休息。', en: 'Borrow an atomic clock, and the fourth satellite can rest.' },
      check: function (ev) { const s = S(ev); return !!s && s.clock === 'assume' && s.nUsed === 3 && Math.abs(s.ctau) <= 0.005 && !!s.dop; }
    },
    {
      id: 'gps-trilateration-h8', level: 7, hidden: true,
      riddle: { zh: '量了三百次，每一次都歪向同一邊。', en: 'Three hundred tries, and every one leans the same way.' },
      check: function (ev) { const d = V(ev), s = S(ev); return solve4(s) && d.view === 'fix' && s.mp > 0 && s.sig <= 1 && s.biasH >= 5; }
    },
    {
      id: 'gps-trilateration-h9', level: 8, hidden: true,
      riddle: { zh: '天空只剩一條縫，你仍然知道自己在哪裡。', en: 'Only a slit of sky is left, and still you know where you are.' },
      check: function (ev) { const s = S(ev); return solve4(s) && s.wall >= 60 && s.dop.p <= 6; }
    },
    {
      id: 'gps-trilateration-h10', level: 10, hidden: true,
      riddle: { zh: '四顆星，排成最端正的四面體。', en: 'Four satellites, set out as the most perfect tetrahedron.' },
      check: function (ev) { const s = S(ev); return solve4(s) && s.nUsed === 4 && s.dop.p <= 1.9; }
    }
  ]);
})();
