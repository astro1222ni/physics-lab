/* missions/electron-configuration.js — 電子組態的任務（星星數 = 等級 1–10；隱藏任務 = 等級 × 2） */
(function () {
  'use strict';
  if (!window.LabMission) return;

  // 事件（js/electron-configuration.js 只在使用者操作之後回報）：
  //   'species'：{ Z, q, N, unpaired, exception, noble, iso }
  //   'fill'：{ Z, q, N }（「逐一填入」自己播完）
  //   'build'：{ Z, q, N, count, ground, occMatch, hundOK, aufbauOK, key, unpaired, fromGround }（自己填，每放一個或擦掉一個；
  //            fromGround：這一盤在這一步之前曾經填出基態，清空重填或換粒子就歸零）
  //   'pauli'：{ Z, q }
  //   'view3d'：{}
  const sp = function (ev) { return ev.type === 'species' && ev.data ? ev.data : null; };
  /** 自己填出 (Z, q) 的基態 */
  const built = function (ev, Z, q) { const d = ev.type === 'build' && ev.data; return !!d && d.Z === Z && d.q === q && d.ground === true && d.count === d.N; };

  LabMission.register('electron-configuration', [
    {
      id: 'electron-configuration-1', level: 1,
      title: { zh: '一個一個進場', en: 'One at a time' },
      desc: { zh: '按「逐一填入」，看電子一個一個進場，直到全部填好。', en: 'Press “Fill one by one” and watch the electrons arrive one at a time until they are all in.' },
      check: function (ev) { return ev.type === 'fill' && !!ev.data && ev.data.N >= 1; }
    },
    {
      id: 'electron-configuration-2', level: 2,
      title: { zh: '立起來的能階', en: 'The levels stand up' },
      desc: { zh: '切換到「3D 立體」，看副層變成一級一級的階梯。', en: 'Switch to “3D staircase” and see the subshells turn into a flight of steps.' },
      check: function (ev) { return ev.type === 'view3d'; }
    },
    {
      id: 'electron-configuration-3', level: 2,
      title: { zh: '包立說不行', en: 'Pauli says no' },
      desc: { zh: '在「自己填」裡，試著把兩個自旋相同的電子放進同一個軌域。', en: 'In “Fill it yourself”, try to put two electrons with the same spin into one orbital.' },
      check: function (ev) { return ev.type === 'pauli'; }
    },
    {
      id: 'electron-configuration-4', level: 3,
      title: { zh: '4s 比 3d 先', en: '4s before 3d' },
      desc: { zh: '選一個中性原子：它最後的電子填進了 4s，3d 卻還是空的。', en: 'Choose a neutral atom whose last electrons went into 4s while 3d is still empty.' },
      check: function (ev) { const d = sp(ev); return !!d && d.q === 0 && (d.Z === 19 || d.Z === 20); }
    },
    {
      id: 'electron-configuration-5', level: 3,
      title: { zh: '一格一個、方向一致', en: 'One each, all the same way' },
      desc: { zh: '在「自己填」裡，填出氮原子的基態。', en: 'In “Fill it yourself”, build the ground state of a nitrogen atom.' },
      check: function (ev) { return built(ev, 7, 0); }
    },
    {
      id: 'electron-configuration-6', level: 4,
      title: { zh: '穿上鈍氣的外衣', en: 'Dressed as a noble gas' },
      desc: { zh: '選一個離子（電荷不是 0），讓它的電子組態和某個鈍氣原子一模一樣。', en: 'Choose an ion (charge not 0) whose electron configuration is exactly that of a noble-gas atom.' },
      check: function (ev) { const d = sp(ev); return !!d && d.q !== 0 && d.noble > 0; }
    },
    {
      id: 'electron-configuration-7', level: 4,
      title: { zh: '沒有單身的電子', en: 'No one left single' },
      desc: { zh: '第 4 週期的過渡金屬（鈧到鋅）中，選出沒有未成對電子的那一個原子。', en: 'Among the period-4 transition metals (scandium to zinc), choose the one atom with no unpaired electrons.' },
      check: function (ev) { const d = sp(ev); return !!d && d.q === 0 && d.Z === 30; }
    },
    {
      id: 'electron-configuration-8', level: 5,
      title: { zh: '半滿的誘惑', en: 'The lure of half-full' },
      desc: { zh: '找出第 4 週期中，4s 只有一個電子、3d 剛好半滿的中性原子。', en: 'Find the neutral period-4 atom with a single 4s electron and a 3d subshell exactly half full.' },
      check: function (ev) { const d = sp(ev); return !!d && d.q === 0 && d.Z === 24; }
    },
    {
      id: 'electron-configuration-9', level: 6,
      title: { zh: '自己填出鉻', en: 'Build chromium yourself' },
      desc: { zh: '在「自己填」裡，填出鉻原子真正的基態（可以勾「先填好鈍氣核心」）。', en: 'In “Fill it yourself”, build the real ground state of a chromium atom (you may tick “Start with the noble-gas core filled”).' },
      check: function (ev) { return built(ev, 24, 0); }
    },
    {
      id: 'electron-configuration-10', level: 7,
      title: { zh: '先走的是 4s', en: '4s leaves first' },
      desc: { zh: '在「自己填」裡，填出電荷 +2 的鐵離子（Fe2+）的基態。', en: 'In “Fill it yourself”, build the ground state of the iron ion with charge +2 (Fe2+).' },
      check: function (ev) { return built(ev, 26, 2); }
    },
    {
      id: 'electron-configuration-11', level: 7,
      title: { zh: '等電子家族', en: 'An isoelectronic family' },
      desc: { zh: '找出 4 種電子數都是 10 的原子或離子（氖也算），一個一個選過。', en: 'Find four atoms or ions that all have 10 electrons (neon counts) and choose each of them.' },
      check: function (ev) { const d = sp(ev); return !!d && d.N === 10 && d.iso >= 4; }
    },
    {
      id: 'electron-configuration-12', level: 8,
      title: { zh: '最多單身電子', en: 'The most unpaired' },
      desc: { zh: '選出基態未成對電子最多的中性原子。', en: 'Choose the neutral atom with the most unpaired electrons in its ground state.' },
      check: function (ev) { const d = sp(ev); return !!d && d.q === 0 && (d.Z === 64 || d.Z === 96); }
    },
    // ---------------- 隱藏任務 ----------------
    {
      id: 'electron-configuration-h1', level: 3, hidden: true,
      riddle: { zh: '最貪心的那一位，搶到最後一個空位就心滿意足。', en: 'The greediest of them all is content once it grabs the last empty seat.' },
      check: function (ev) { return built(ev, 9, -1); }
    },
    {
      id: 'electron-configuration-h2', level: 4, hidden: true,
      riddle: { zh: '為了把房間住滿，它讓出了最外面的座位。', en: 'To fill the room completely, it gives up the seat outside.' },
      check: function (ev) { return built(ev, 29, 0); }
    },
    {
      id: 'electron-configuration-h3', level: 5, hidden: true,
      riddle: { zh: '路燈的黃光，來自一次短暫的跳躍。', en: 'The yellow glow of a street lamp comes from one brief jump.' },
      // 先填出鈉的基態，再讓 3s 電子跳到 3p（這一盤曾經是基態：fromGround）
      check: function (ev) { const d = ev.type === 'build' && ev.data; return !!d && d.Z === 11 && d.q === 0 && d.count === 11 && d.fromGround === true && d.key === '1s2 2s2 2p6 3p1'; }
    },
    {
      id: 'electron-configuration-h4', level: 6, hidden: true,
      riddle: { zh: '生鏽以後，它反而安心了。', en: 'Once it has rusted, it is finally at ease.' },
      check: function (ev) { return built(ev, 26, 3); }
    },
    {
      id: 'electron-configuration-h5', level: 7, hidden: true,
      riddle: { zh: '最外面的房間空著，裡面那間卻擠滿了人。', en: 'The outermost room stands empty, yet the one inside is packed.' },
      check: function (ev) { return built(ev, 46, 0); }
    },
    {
      id: 'electron-configuration-h6', level: 8, hidden: true,
      riddle: { zh: '第八位客人寧可住到樓上，也不打擾那七位。', en: 'The eighth guest would rather go upstairs than disturb the seven.' },
      check: function (ev) { return built(ev, 64, 0); }
    },
    {
      id: 'electron-configuration-h7', level: 8, hidden: true,
      riddle: { zh: '最後兩個人緊緊抱在一起，誰也不肯離開。', en: 'The last two hold each other tight, and neither will leave.' },
      check: function (ev) { return built(ev, 82, 2); }
    },
    {
      id: 'electron-configuration-h8', level: 9, hidden: true,
      riddle: { zh: '兩位兄長都跳了，只有它站在原地。', en: 'Both elder brothers jumped; only it stayed where it stood.' },
      check: function (ev) { return built(ev, 74, 0); }
    },
    {
      id: 'electron-configuration-h9', level: 10, hidden: true,
      riddle: { zh: '最後一位旅人，跳過眼前的房間，住進更外面的那一間。', en: 'The last traveller passes the room in front of it and moves into one further out.' },
      check: function (ev) { return built(ev, 103, 0); }
    },
    {
      id: 'electron-configuration-h10', level: 5, hidden: true,
      riddle: { zh: '紅寶石的紅，是它少了三個以後留下的。', en: 'The red of a ruby is what it keeps after losing three.' },
      check: function (ev) { return built(ev, 24, 3); }
    }
  ]);
})();
