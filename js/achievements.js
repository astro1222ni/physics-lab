/*
 * achievements.js — 成就系統（需登入 Google 帳號）
 *
 * 由 missions.js 自動載入。登入後：
 *   - 記錄個人累計：操作次數、操作時間（stats.js 的 lab:statsflush 事件）、留言數（comments.js 的 lab:commented）、
 *     玩過哪些實驗、每天玩過哪些實驗、特殊旗標。
 *   - 載入全站任務定義，依累計資料、完成的任務、星星與名次判定成就；解鎖時跳出提示並寫入資料庫（每個成就只解鎖一次）。
 * 成就是收藏用的徽章，不加星星（星星只能靠任務取得）。
 * 等級：1 銅、2 銀、3 金、4 紫晶、5 傳說。隱藏成就只顯示謎語；解鎖後顯示名稱，但不說明條件。
 * 資料：userStats/<uid>/{ops, seconds, comments, modules/<模組>, days/<YYYYMMDD>/<模組>, flags/<旗標>}、achievements/<uid>/<成就>
 */
(function () {
  'use strict';
  const LM = window.LabMission;
  if (!LM || window.LabAchievements) return;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const L = function (o) { return o ? T(o.zh, o.en || o.zh) : ''; };
  const st = LM._state;
  const self = document.currentScript || document.querySelector('script[src*="achievements.js"]');
  const base = self ? self.getAttribute('src').replace(/achievements\.js.*$/, '') : 'js/';

  // ---------- 載入全站實驗清單與所有任務定義（只註冊，不在本頁判定） ----------
  function loadScript(src) {
    return new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = src; s.onload = s.onerror = resolve;
      document.body.appendChild(s);
    });
  }
  const listReady = (window.LAB_LIVE_MODULES ? Promise.resolve() : loadScript(base + 'missions/index.js')).then(function () {
    const all = LM.all();
    return Promise.all((window.LAB_MISSION_MODULES || []).filter(function (m) { return !all[m.id]; })
      .map(function (m) { return loadScript(base + 'missions/' + m.id + '.js'); }));
  });
  const live = function () { return window.LAB_LIVE_MODULES || []; };
  const branchOf = function (m) { return (window.LAB_MODULE_BRANCH || {})[m]; };

  // ---------- 成就定義 ----------
  // 數量型成就：{ id, tier, cat, name, desc, need, val: c => 目前數值 }；其他：{ id, tier, cat, name, desc, check: c => bool }
  const CATS = [
    ['start', { zh: '起步', en: 'Getting started' }], ['explore', { zh: '探索', en: 'Exploration' }],
    ['ops', { zh: '操作次數', en: 'Interactions' }], ['time', { zh: '操作時間', en: 'Time spent' }],
    ['mission', { zh: '任務', en: 'Missions' }], ['stars', { zh: '倪的星星', en: 'Ni stars' }],
    ['hidden', { zh: '隱藏任務', en: 'Hidden missions' }], ['master', { zh: '制霸', en: 'Mastery' }],
    ['branch', { zh: '分支制霸', en: 'Branch mastery' }], ['streak', { zh: '持之以恆', en: 'Persistence' }],
    ['social', { zh: '交流', en: 'Discussion' }], ['rank', { zh: '排行榜', en: 'Leaderboard' }],
    ['secret', { zh: '隱藏成就', en: 'Hidden achievements' }]
  ];
  function n(id, tier, cat, zh, en, dzh, den, need, val) { return { id: id, tier: tier, cat: cat, name: { zh: zh, en: en }, desc: { zh: dzh, en: den }, need: need, val: val }; }
  const V = {
    modules: function (c) { return c.modules; }, ops: function (c) { return c.ops; }, sec: function (c) { return c.seconds; },
    missions: function (c) { return c.missions; }, stars: function (c) { return c.stars; }, hidden: function (c) { return c.hiddenDone; },
    full: function (c) { return c.fullModules; }, master10: function (c) { return c.level10; }, streak: function (c) { return c.streak; },
    days: function (c) { return c.totalDays; }, comments: function (c) { return c.comments; }
  };
  const LIST = [
    { id: 'hello', tier: 1, cat: 'start', name: { zh: '第一道光', en: 'First light' }, desc: { zh: '登入並取好暱稱。', en: 'Sign in and choose a nickname.' }, check: function (c) { return !!c.nickname; } },
    { id: 'mission-mode', tier: 1, cat: 'start', name: { zh: '接下挑戰', en: 'Challenge accepted' }, desc: { zh: '第一次打開任務模式。', en: 'Turn on Mission mode for the first time.' }, check: function (c) { return !!c.flags.mm; } },

    n('explore-3', 1, 'explore', '好奇的眼睛', 'Curious eyes', '玩過 3 種實驗。', 'Try 3 different experiments.', 3, V.modules),
    n('explore-6', 2, 'explore', '實驗室漫遊者', 'Lab wanderer', '玩過 6 種實驗。', 'Try 6 different experiments.', 6, V.modules),
    n('explore-10', 3, 'explore', '跨界探險家', 'Explorer across fields', '玩過 10 種實驗。', 'Try 10 different experiments.', 10, V.modules),
    n('explore-15', 4, 'explore', '物理版圖拓荒者', 'Pioneer of the physics map', '玩過 15 種實驗。', 'Try 15 different experiments.', 15, V.modules),
    { id: 'explore-all', tier: 5, cat: 'explore', name: { zh: '萬物之理', en: 'Theory of everything' }, desc: { zh: '玩過網站上所有的實驗。', en: 'Try every experiment on the site.' }, need: 0, val: function (c) { return c.liveVisited; }, needFn: function (c) { return c.liveCount; } },

    n('ops-100', 1, 'ops', '動手的開始', 'Hands on', '累計操作 100 次。', 'Make 100 interactions.', 100, V.ops),
    n('ops-1000', 2, 'ops', '熟能生巧', 'Practice makes perfect', '累計操作 1,000 次。', 'Make 1,000 interactions.', 1000, V.ops),
    n('ops-5000', 3, 'ops', '實驗狂熱', 'Experiment fever', '累計操作 5,000 次。', 'Make 5,000 interactions.', 5000, V.ops),
    n('ops-10000', 3, 'ops', '萬次求真', 'Ten thousand trials for truth', '累計操作 10,000 次。', 'Make 10,000 interactions.', 10000, V.ops),
    n('ops-50000', 4, 'ops', '百折不撓的實驗家', 'Unbending experimenter', '累計操作 50,000 次。', 'Make 50,000 interactions.', 50000, V.ops),
    n('ops-100000', 5, 'ops', '永動之手', 'Perpetual-motion hands', '累計操作 100,000 次。', 'Make 100,000 interactions.', 100000, V.ops),

    n('time-10m', 1, 'time', '專注的十分鐘', 'Ten focused minutes', '累計操作時間 10 分鐘。', 'Spend 10 minutes experimenting.', 600, V.sec),
    n('time-1h', 2, 'time', '一小時的探索', 'An hour of discovery', '累計操作時間 1 小時。', 'Spend 1 hour experimenting.', 3600, V.sec),
    n('time-5h', 2, 'time', '沉浸於物理', 'Immersed in physics', '累計操作時間 5 小時。', 'Spend 5 hours experimenting.', 18000, V.sec),
    n('time-10h', 3, 'time', '十小時的物理人', 'Ten-hour physicist', '累計操作時間 10 小時。', 'Spend 10 hours experimenting.', 36000, V.sec),
    n('time-24h', 4, 'time', '一晝夜的追尋', 'A day and a night of searching', '累計操作時間 24 小時。', 'Spend 24 hours experimenting.', 86400, V.sec),
    n('time-100h', 4, 'time', '百小時的修行', 'A hundred hours of practice', '累計操作時間 100 小時。', 'Spend 100 hours experimenting.', 360000, V.sec),
    n('time-200h', 5, 'time', '時間的主人', 'Master of time', '累計操作時間 200 小時。', 'Spend 200 hours experimenting.', 720000, V.sec),

    n('mission-1', 1, 'mission', '初試啼聲', 'First mission', '完成 1 個任務。', 'Complete 1 mission.', 1, V.missions),
    n('mission-10', 2, 'mission', '任務達人', 'Mission expert', '完成 10 個任務。', 'Complete 10 missions.', 10, V.missions),
    n('mission-30', 3, 'mission', '解題專家', 'Problem solver', '完成 30 個任務。', 'Complete 30 missions.', 30, V.missions),
    n('mission-60', 3, 'mission', '六十道光', 'Sixty beams of light', '完成 60 個任務。', 'Complete 60 missions.', 60, V.missions),
    n('mission-100', 4, 'mission', '百題斬', 'A hundred conquered', '完成 100 個任務。', 'Complete 100 missions.', 100, V.missions),
    n('mission-150', 4, 'mission', '全知者', 'The all-knowing', '完成 150 個任務。', 'Complete 150 missions.', 150, V.missions),
    n('mission-200', 5, 'mission', '兩百座里程碑', 'Two hundred milestones', '完成 200 個任務。', 'Complete 200 missions.', 200, V.missions),

    n('stars-10', 1, 'stars', '第一把星光', 'A handful of starlight', '累積 10 顆倪的星星。', 'Collect 10 Ni stars.', 10, V.stars),
    n('stars-50', 2, 'stars', '星光點點', 'Twinkling', '累積 50 顆倪的星星。', 'Collect 50 Ni stars.', 50, V.stars),
    n('stars-100', 2, 'stars', '百星之人', 'Hundred-star scholar', '累積 100 顆倪的星星。', 'Collect 100 Ni stars.', 100, V.stars),
    n('stars-300', 3, 'stars', '星座的繪製者', 'Drawer of constellations', '累積 300 顆倪的星星。', 'Collect 300 Ni stars.', 300, V.stars),
    n('stars-600', 4, 'stars', '銀河漫步', 'Walking the Milky Way', '累積 600 顆倪的星星。', 'Collect 600 Ni stars.', 600, V.stars),
    n('stars-1000', 4, 'stars', '千星宇宙', 'A universe of a thousand stars', '累積 1,000 顆倪的星星。', 'Collect 1,000 Ni stars.', 1000, V.stars),
    n('stars-1500', 5, 'stars', '超新星', 'Supernova', '累積 1,500 顆倪的星星。', 'Collect 1,500 Ni stars.', 1500, V.stars),

    n('hidden-1', 2, 'hidden', '秘密發現者', 'Secret finder', '完成 1 個隱藏任務。', 'Complete 1 hidden mission.', 1, V.hidden),
    n('hidden-5', 3, 'hidden', '解謎高手', 'Riddle solver', '完成 5 個隱藏任務。', 'Complete 5 hidden missions.', 5, V.hidden),
    n('hidden-15', 4, 'hidden', '謎之收藏家', 'Collector of mysteries', '完成 15 個隱藏任務。', 'Complete 15 hidden missions.', 15, V.hidden),
    n('hidden-30', 4, 'hidden', '看穿一切的人', 'The one who sees through all', '完成 30 個隱藏任務。', 'Complete 30 hidden missions.', 30, V.hidden),
    { id: 'hidden-all', tier: 5, cat: 'hidden', name: { zh: '拉普拉斯的惡魔', en: "Laplace's demon" }, desc: { zh: '完成網站上所有的隱藏任務。', en: 'Complete every hidden mission on the site.' }, need: 0, val: V.hidden, needFn: function (c) { return c.hiddenTotal; } },

    n('full-1', 2, 'master', '一門通', 'One subject mastered', '完成某一個實驗的所有任務（含隱藏任務）。', 'Complete every mission of one experiment, hidden ones included.', 1, V.full),
    n('full-3', 3, 'master', '三門精通', 'Three subjects mastered', '完成 3 個實驗的所有任務。', 'Complete every mission of 3 experiments.', 3, V.full),
    n('full-5', 4, 'master', '五項全能', 'Pentathlon', '完成 5 個實驗的所有任務。', 'Complete every mission of 5 experiments.', 5, V.full),
    n('full-10', 4, 'master', '十項全能', 'Decathlon', '完成 10 個實驗的所有任務。', 'Complete every mission of 10 experiments.', 10, V.full),
    { id: 'full-all', tier: 5, cat: 'master', name: { zh: '物理大統一', en: 'Grand unification' }, desc: { zh: '完成網站上所有實驗的所有任務。', en: 'Complete every mission of every experiment.' }, need: 0, val: V.full, needFn: function (c) { return c.moduleTotal; } },
    n('level10-1', 3, 'master', '大師之路', 'The master\'s path', '完成 1 個 ★10 大師任務。', 'Complete 1 level-10 master mission.', 1, V.master10),
    n('level10-5', 4, 'master', '十星名家', 'Ten-star virtuoso', '完成 5 個 ★10 大師任務。', 'Complete 5 level-10 master missions.', 5, V.master10),
    { id: 'level10-all', tier: 5, cat: 'master', name: { zh: '巔峰', en: 'Summit' }, desc: { zh: '完成網站上所有 ★10 大師任務。', en: 'Complete every level-10 master mission.' }, need: 0, val: V.master10, needFn: function (c) { return c.level10Total; } },

    { id: 'branch-mech', tier: 4, cat: 'branch', name: { zh: '牛頓的傳人', en: 'Heir of Newton' }, desc: { zh: '完成力學分支所有實驗的所有任務。', en: 'Complete every mission in Mechanics.' }, check: function (c) { return c.branchDone.mech; } },
    { id: 'branch-thermo', tier: 4, cat: 'branch', name: { zh: '焦耳的溫度計', en: "Joule's thermometer" }, desc: { zh: '完成熱學分支所有實驗的所有任務。', en: 'Complete every mission in Heat.' }, check: function (c) { return c.branchDone.thermo; } },
    { id: 'branch-wave', tier: 4, cat: 'branch', name: { zh: '都卜勒的耳朵', en: "Doppler's ears" }, desc: { zh: '完成波動與聲音分支所有實驗的所有任務。', en: 'Complete every mission in Waves & Sound.' }, check: function (c) { return c.branchDone.wave; } },
    { id: 'branch-optics', tier: 4, cat: 'branch', name: { zh: '惠更斯的眼睛', en: "Huygens' eyes" }, desc: { zh: '完成光學分支所有實驗的所有任務。', en: 'Complete every mission in Optics.' }, check: function (c) { return c.branchDone.optics; } },
    { id: 'branch-em', tier: 4, cat: 'branch', name: { zh: '馬克士威的方程式', en: "Maxwell's equations" }, desc: { zh: '完成電磁學分支所有實驗的所有任務。', en: 'Complete every mission in Electromagnetism.' }, check: function (c) { return c.branchDone.em; } },
    { id: 'branch-modern', tier: 4, cat: 'branch', name: { zh: '愛因斯坦的光子', en: "Einstein's photon" }, desc: { zh: '完成近代物理分支所有實驗的所有任務。', en: 'Complete every mission in Modern Physics.' }, check: function (c) { return c.branchDone.modern; } },

    n('streak-3', 1, 'streak', '三日不懈', 'Three days running', '連續 3 天都有做實驗。', 'Experiment on 3 days in a row.', 3, V.streak),
    n('streak-7', 2, 'streak', '一週不間斷', 'A week without a break', '連續 7 天都有做實驗。', 'Experiment on 7 days in a row.', 7, V.streak),
    n('streak-14', 3, 'streak', '兩週的習慣', 'A two-week habit', '連續 14 天都有做實驗。', 'Experiment on 14 days in a row.', 14, V.streak),
    n('streak-30', 4, 'streak', '月之循環', 'A lunar cycle', '連續 30 天都有做實驗。', 'Experiment on 30 days in a row.', 30, V.streak),
    n('streak-100', 4, 'streak', '百日築基', 'A hundred-day foundation', '連續 100 天都有做實驗。', 'Experiment on 100 days in a row.', 100, V.streak),
    n('streak-365', 5, 'streak', '繞日一周', 'Once around the Sun', '連續 365 天都有做實驗。', 'Experiment on 365 days in a row.', 365, V.streak),
    n('days-10', 1, 'streak', '十日之功', 'Ten days of effort', '累計 10 天做過實驗。', 'Experiment on 10 different days.', 10, V.days),
    n('days-50', 3, 'streak', '五十個日子', 'Fifty days', '累計 50 天做過實驗。', 'Experiment on 50 different days.', 50, V.days),
    n('days-200', 5, 'streak', '時光旅人', 'Time traveller', '累計 200 天做過實驗。', 'Experiment on 200 different days.', 200, V.days),

    n('comment-1', 1, 'social', '發問是科學的開始', 'Science begins with a question', '在實驗留言區留下第 1 則留言。', 'Post your first comment on an experiment.', 1, V.comments),
    n('comment-10', 2, 'social', '討論的熱情', 'A passion for discussion', '累計留言 10 則。', 'Post 10 comments.', 10, V.comments),

    { id: 'rank-100', tier: 2, cat: 'rank', name: { zh: '榜上有名', en: 'On the board' }, desc: { zh: '進入排行榜前 100 名（至少 10 顆星）。', en: 'Reach the top 100 (with at least 10 stars).' }, check: function (c) { return c.rank > 0 && c.rank <= 100 && c.stars >= 10; } },
    { id: 'rank-10', tier: 4, cat: 'rank', name: { zh: '十大物理名人', en: 'Top ten physicists' }, desc: { zh: '進入排行榜前 10 名（至少 100 顆星，且排行榜上至少 30 人）。', en: 'Reach the top 10 (with at least 100 stars, among 30 or more players).' }, check: function (c) { return c.rank > 0 && c.rank <= 10 && c.stars >= 100 && c.boardSize >= 30; } },
    { id: 'rank-1', tier: 5, cat: 'rank', name: { zh: '站上巔峰', en: 'Top of the world' }, desc: { zh: '登上排行榜第 1 名（至少 300 顆星，且排行榜上至少 50 人）。', en: 'Reach number 1 (with at least 300 stars, among 50 or more players).' }, check: function (c) { return c.rank === 1 && c.stars >= 300 && c.boardSize >= 50; } },

    // ---------- 隱藏成就：只有謎語 ----------
    { id: 'secret-a', tier: 3, cat: 'secret', hidden: true, name: { zh: '守夜人', en: 'Night watch' }, riddle: { zh: '月亮也還沒睡。', en: 'Even the Moon is still awake.' }, check: function (c) { return !!c.flags.night; } },
    { id: 'secret-b', tier: 3, cat: 'secret', hidden: true, name: { zh: '晨曦', en: 'Daybreak' }, riddle: { zh: '比太陽更早醒來。', en: 'Awake before the Sun.' }, check: function (c) { return !!c.flags.dawn; } },
    { id: 'secret-c', tier: 2, cat: 'secret', hidden: true, name: { zh: '世界公民', en: 'Citizen of the world' }, riddle: { zh: '換一種語言看世界。', en: 'See the world in other words.' }, check: function (c) { return !!c.flags.lang; } },
    { id: 'secret-d', tier: 3, cat: 'secret', hidden: true, name: { zh: '周遊列國', en: 'Grand tour' }, riddle: { zh: '一天之內，走遍天下。', en: 'The whole world in a single day.' }, check: function (c) { return c.maxDayModules >= 5; } },
    { id: 'secret-e', tier: 4, cat: 'secret', hidden: true, name: { zh: '終極答案', en: 'The ultimate answer' }, riddle: { zh: '生命、宇宙以及一切。', en: 'Life, the universe and everything.' }, check: function (c) { return c.stars === 6 * 7; } },
    { id: 'secret-f', tier: 4, cat: 'secret', hidden: true, name: { zh: '整點報時', en: 'On the hour' }, riddle: { zh: '鐘聲響起的那一刻。', en: 'The moment the bell rings.' }, check: function (c) { return !!c.lastDone && c.lastDone.minute === 0; } },
    { id: 'secret-g', tier: 3, cat: 'secret', hidden: true, name: { zh: '歸來的旅人', en: 'The traveller returns' }, riddle: { zh: '離開得夠久，才懂得回來。', en: 'Only those who stay away long enough know how to return.' }, check: function (c) { return c.longestGap >= 30; } },
    { id: 'secret-h', tier: 4, cat: 'secret', hidden: true, name: { zh: '對稱之美', en: 'The beauty of symmetry' }, riddle: { zh: '正著讀、倒著讀，都是同一個你。', en: 'Read forwards or backwards — still the same you.' }, check: function (c) { return c.stars >= 100 && String(c.stars) === String(c.stars).split('').reverse().join(''); } },
    { id: 'secret-i', tier: 4, cat: 'secret', hidden: true, name: { zh: '孤獨的質數', en: 'A lonely prime' }, riddle: { zh: '只能被一和自己整除的孤獨。', en: 'The loneliness of being divisible only by one and yourself.' }, check: function (c) { return c.stars > 100 && isPrime(c.stars); } },
    { id: 'secret-j', tier: 4, cat: 'secret', hidden: true, name: { zh: '無盡的圓', en: 'The endless circle' }, riddle: { zh: '永不結束、永不循環的那個數。', en: 'The number that never ends and never repeats.' }, check: function (c) { return c.ops >= 31416; } },
    { id: 'secret-k', tier: 5, cat: 'secret', hidden: true, name: { zh: '三力交會', en: 'Where three forces meet' }, riddle: { zh: '三種不同的語言，在同一天被你說出。', en: 'Three different languages, all spoken by you in a single day.' }, check: function (c) { return c.maxDayBranches >= 3; } }
  ];
  function isPrime(x) { if (x < 2 || x % 2 === 0) return x === 2; for (let i = 3; i * i <= x; i += 2) if (x % i === 0) return false; return true; }

  // ---------- 狀態 ----------
  let api = null, uid = null, rank = 0, boardSize = 0;
  const me = { stats: { ops: 0, seconds: 0, comments: 0, modules: {}, days: {}, flags: {} }, got: {}, loaded: false };
  let lastDone = null;
  const renderers = [];

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }
  function keyToDate(k) { return new Date(+k.slice(0, 4), +k.slice(4, 6) - 1, +k.slice(6, 8)); }
  function streak(days) {
    let s = 0;
    const d = new Date();
    if (!days[dayKey(d)]) d.setDate(d.getDate() - 1); // 今天還沒玩也不中斷
    while (days[dayKey(d)]) { s++; d.setDate(d.getDate() - 1); }
    return s;
  }
  function longestGap(days) {
    const ks = Object.keys(days).sort();
    let g = 0;
    for (let i = 1; i < ks.length; i++) g = Math.max(g, Math.round((keyToDate(ks[i]) - keyToDate(ks[i - 1])) / 864e5));
    return g;
  }

  function context() {
    const s = me.stats, all = LM.all();
    const done = st.done || {};
    const ids = Object.keys(done);
    let hidden = 0, hiddenTotal = 0, full = 0, moduleTotal = 0, l10 = 0, l10Total = 0;
    const branchMods = {}, branchFull = {};
    Object.keys(all).forEach(function (k) {
      const list = all[k];
      if (!list.length) return;
      moduleTotal++;
      const ok = list.every(function (m) { return done[m.id]; });
      if (ok) full++;
      list.forEach(function (m) {
        if (m.hidden) { hiddenTotal++; if (done[m.id]) hidden++; }
        if (m.level === 10 && !m.hidden) { l10Total++; if (done[m.id]) l10++; }
      });
      const b = branchOf(k);
      if (b) { branchMods[b] = (branchMods[b] || 0) + 1; branchFull[b] = (branchFull[b] || 0) + (ok ? 1 : 0); }
    });
    // 分支制霸：該分支所有已上線實驗都有任務，且全部完成
    const branchDone = {};
    ['mech', 'thermo', 'wave', 'optics', 'em', 'modern'].forEach(function (b) {
      const liveIn = live().filter(function (m) { return branchOf(m) === b; });
      branchDone[b] = liveIn.length > 0 && liveIn.every(function (m) { return all[m] && all[m].length; }) && branchFull[b] === liveIn.length;
    });
    // 同一天完成任務涵蓋幾個分支
    const dayBranches = {};
    ids.forEach(function (id) {
      const at = done[id].at;
      const mod = id.replace(/-(h?\d+)$/, '');
      const b = branchOf(mod);
      if (typeof at === 'number' && b) { const k = dayKey(new Date(at)); (dayBranches[k] = dayBranches[k] || {})[b] = true; }
    });
    let maxDayBranches = 0;
    Object.keys(dayBranches).forEach(function (k) { maxDayBranches = Math.max(maxDayBranches, Object.keys(dayBranches[k]).length); });
    const mods = s.modules || {};
    let maxDay = 0;
    Object.keys(s.days || {}).forEach(function (k) { maxDay = Math.max(maxDay, Object.keys(s.days[k] || {}).length); });
    return {
      ops: s.ops || 0, seconds: s.seconds || 0, comments: s.comments || 0, modules: Object.keys(mods).length, flags: s.flags || {},
      liveCount: live().length, liveVisited: live().filter(function (m) { return mods[m]; }).length,
      missions: ids.length, hiddenDone: hidden, hiddenTotal: hiddenTotal, fullModules: full, moduleTotal: moduleTotal,
      level10: l10, level10Total: l10Total, branchDone: branchDone, maxDayBranches: maxDayBranches,
      stars: ids.reduce(function (a, id) { return a + (done[id].stars || 0); }, 0),
      nickname: st.nickname, streak: streak(s.days || {}), totalDays: Object.keys(s.days || {}).length,
      longestGap: longestGap(s.days || {}), maxDayModules: maxDay, lastDone: lastDone, rank: rank, boardSize: boardSize
    };
  }
  function need(a, c) { return a.needFn ? a.needFn(c) : a.need; }
  function unlocked(a, c) {
    try {
      if (a.val) { const nd = need(a, c); return nd > 0 && a.val(c) >= nd; }
      return !!a.check(c);
    } catch (e) { return false; }
  }

  // ---------- 判定與解鎖 ----------
  let evaluating = false, again = false;
  function evaluate() {
    if (!api || !uid || !me.loaded || !st.ready) return;
    if (evaluating) { again = true; return; }
    const c = context();
    const fresh = LIST.filter(function (a) { return !me.got[a.id] && unlocked(a, c); });
    if (!fresh.length) return;
    evaluating = true;
    const map = {};
    fresh.forEach(function (a) { map['achievements/' + uid + '/' + a.id] = { at: api.now() }; });
    api.update(map).then(function () {
      fresh.forEach(function (a, i) { me.got[a.id] = { at: Date.now() }; setTimeout(function () { toast(a); }, i * 700); });
      renderers.forEach(function (f) { f(); });
    }).catch(function () { /* 下次再試 */ }).then(function () {
      evaluating = false;
      if (again) { again = false; evaluate(); }
    });
  }

  // ---------- 累計資料 ----------
  function record(extra) {
    if (!api || !uid) return;
    const map = {};
    const mod = LM.module;
    const today = dayKey();
    const P = 'userStats/' + uid + '/';
    if (mod) {
      if (!me.stats.modules[mod]) { me.stats.modules[mod] = true; map[P + 'modules/' + mod] = true; }
      me.stats.days[today] = me.stats.days[today] || {};
      if (!me.stats.days[today][mod]) { me.stats.days[today][mod] = true; map[P + 'days/' + today + '/' + mod] = true; }
    }
    const h = new Date().getHours();
    const flag = function (k, on) { if (on && !me.stats.flags[k]) { me.stats.flags[k] = true; map[P + 'flags/' + k] = true; } };
    flag('night', mod && (h >= 23 || h < 4));
    flag('dawn', mod && h >= 4 && h < 6);
    flag('lang', window.LabSettings && window.LabSettings.lang !== 'zh-Hant');
    flag('mm', mod && st.on);
    if (extra) {
      if (extra.ops) { me.stats.ops += extra.ops; map[P + 'ops'] = api.inc(extra.ops); }
      if (extra.seconds) { me.stats.seconds += extra.seconds; map[P + 'seconds'] = api.inc(extra.seconds); }
      if (extra.comments) { me.stats.comments += 1; map[P + 'comments'] = api.inc(1); }
    }
    if (!Object.keys(map).length) { evaluate(); return; }
    api.update(map).catch(function () { /* 忽略 */ }).then(evaluate);
  }

  window.addEventListener('lab:statsflush', function (e) {
    const d = e.detail || {};
    if (uid) record({ ops: Math.min(300, d.ops || 0), seconds: Math.min(180, d.seconds || 0) });
  });
  window.addEventListener('lab:commented', function () { if (uid) record({ comments: 1 }); });
  LM.on('complete', function () {
    const d = new Date();
    lastDone = { minute: d.getMinutes(), hour: d.getHours() };
    evaluate();
  });

  function load() {
    if (!api || !uid) return;
    Promise.all([api.get('userStats/' + uid).catch(function () { return null; }), api.get('achievements/' + uid).catch(function () { return null; })]).then(function (r) {
      const s = r[0] || {};
      me.stats = { ops: s.ops || 0, seconds: s.seconds || 0, comments: s.comments || 0, modules: s.modules || {}, days: s.days || {}, flags: s.flags || {} };
      me.got = r[1] || {};
      me.loaded = true;
      record();
      renderers.forEach(function (f) { f(); });
    });
  }

  // ---------- 解鎖提示 ----------
  const BADGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z"/><path d="M7.5 15.5L6 22l6-3 6 3-1.5-6.5" opacity=".6"/></svg>';
  function toast(a) {
    const t = el('div', 'ac-toast tier' + (a.tier || 1));
    t.setAttribute('role', 'status');
    const ico = el('span', 'ac-ico'); ico.innerHTML = BADGE; t.appendChild(ico);
    const tx = el('span', 'ac-tx');
    tx.appendChild(el('strong', null, a.hidden ? T('隱藏成就解鎖！', 'Hidden achievement unlocked!') : T('成就解鎖！', 'Achievement unlocked!')));
    tx.appendChild(el('span', null, L(a.name)));
    t.appendChild(tx);
    let box = document.getElementById('ac-toasts');
    if (!box) { box = el('div', 'ac-toasts'); box.id = 'ac-toasts'; document.body.appendChild(box); }
    box.appendChild(t);
    const S = window.LabSound;
    if (S && S.enabled()) { S.tone({ freq: 1047, dur: 0.12, gain: 0.4 }); S.tone({ freq: 1568, dur: 0.18, gain: 0.35, delay: 0.1 }); }
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 3400);
  }

  // ---------- 我的成就（排行榜頁） ----------
  const TIER = { 1: { zh: '銅', en: 'Bronze' }, 2: { zh: '銀', en: 'Silver' }, 3: { zh: '金', en: 'Gold' }, 4: { zh: '紫晶', en: 'Amethyst' }, 5: { zh: '傳說', en: 'Legend' } };
  function fmtNum(x, a) {
    if (a.val === V.sec) { const h = x / 3600; return h >= 1 ? (Math.floor(h * 10) / 10) + T(' 小時', ' h') : Math.floor(x / 60) + T(' 分', ' min'); }
    return Math.floor(x).toLocaleString();
  }
  function renderInto(box) {
    const draw = function () {
      box.innerHTML = '';
      if (!uid) { box.appendChild(el('p', 'lb-note', T('登入 Google 帳號後才能收集成就。', 'Sign in with Google to collect achievements.'))); return; }
      if (!me.loaded) { box.appendChild(el('p', 'lb-note', T('載入中…', 'Loading…'))); return; }
      const c = context();
      const got = LIST.filter(function (a) { return me.got[a.id]; }).length;
      box.appendChild(el('p', 'lb-note', T('已解鎖 ', 'Unlocked ') + got + ' / ' + LIST.length +
        T('　等級：銅、銀、金、紫晶、傳說。隱藏成就解鎖前只顯示謎語。', ' · Tiers: bronze, silver, gold, amethyst, legend. Hidden ones show only a riddle until unlocked.')));
      CATS.forEach(function (cat) {
        const items = LIST.filter(function (a) { return a.cat === cat[0]; });
        if (!items.length) return;
        const n1 = items.filter(function (a) { return me.got[a.id]; }).length;
        const sec = el('div', 'ac-cat');
        sec.appendChild(el('h3', null, L(cat[1]) + '　' + n1 + ' / ' + items.length));
        const grid = el('div', 'ac-grid');
        items.forEach(function (a) {
          const on = !!me.got[a.id];
          const card = el('div', 'ac-card tier' + (a.tier || 1) + (on ? ' on' : '') + (a.hidden ? ' secret' : ''));
          const ico = el('span', 'ac-ico'); ico.innerHTML = BADGE; card.appendChild(ico);
          const tx = el('div', 'ac-tx');
          const head = el('strong', null, a.hidden && !on ? '？？？' : L(a.name));
          tx.appendChild(head);
          tx.appendChild(el('span', null, a.hidden ? '「' + L(a.riddle) + '」' : L(a.desc)));
          if (a.val && !on) {
            const nd = need(a, c), v = Math.min(a.val(c), nd || 0);
            if (nd > 0) {
              const bar = el('span', 'ac-bar'); const fill = el('span', 'ac-fill');
              fill.style.width = Math.min(100, 100 * v / nd) + '%'; bar.appendChild(fill); tx.appendChild(bar);
              tx.appendChild(el('span', 'ac-prog', fmtNum(v, a) + ' / ' + fmtNum(nd, a)));
            }
          }
          tx.appendChild(el('span', 'ac-tier', L(TIER[a.tier || 1])));
          card.appendChild(tx);
          grid.appendChild(card);
        });
        sec.appendChild(grid);
        box.appendChild(sec);
      });
      box.appendChild(el('p', 'lb-note ac-stats', T('我的累計：操作 ', 'My totals: ') + c.ops.toLocaleString() + T(' 次・操作時間 ', ' interactions · ') +
        fmtNum(c.seconds, { val: V.sec }) + T('・玩過 ', ' · ') + c.modules + T(' 種實驗・連續 ', ' experiments · streak ') + c.streak + T(' 天・累計 ', ' days · ') + c.totalDays + T(' 天', ' days in total')));
    };
    renderers.push(draw);
    draw();
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  window.LabAchievements = {
    list: LIST, renderInto: renderInto, _me: me,
    setRank: function (r, size) { rank = r || 0; boardSize = size || 0; evaluate(); }
  };

  // ---------- 啟動 ----------
  Promise.all([LM._ready(), listReady]).then(function (r) {
    api = r[0];
    if (!api) return;
    LM.on('ready', function () { if (uid) record(); });
    api.onAuth(function (user) {
      uid = user ? user.uid : null;
      me.loaded = false;
      me.got = {};
      renderers.forEach(function (f) { f(); });
      if (uid) load();
    });
  });
  // 打開任務模式時記錄（成就「接下挑戰」）
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.ms-toggle')) setTimeout(function () { if (uid && st.on) record(); }, 50);
  }, true);
})();
