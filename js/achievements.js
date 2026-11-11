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
  // 一、等級系列：第 k 級門檻 = 基數 × k(k+1)/2（級數遞增，越後面差距越大）；探索、全制霸以實驗數量為準（每多一種實驗一級）。
  //     每 10 級（及少數特別等級）有專屬稱號。成就代號為「系列-等級」，例如 ops-12。
  // 二、單一成就：起步、分支制霸、排行榜、隱藏成就。
  const CATS = [
    ['series', { zh: '等級成就', en: 'Levelled achievements' }],
    ['start', { zh: '起步', en: 'Getting started' }], ['branch', { zh: '分支制霸', en: 'Branch mastery' }],
    ['rank', { zh: '排行榜', en: 'Leaderboard' }], ['secret', { zh: '隱藏成就', en: 'Hidden achievements' }]
  ];
  const nm = function (zh, en) { return { zh: zh, en: en }; };
  const SERIES = [
    { key: 'ops', name: nm('動手實驗', 'Hands-on'), unit: nm('次操作', 'interactions'), mag: [2, 9], val: function (c) { return c.ops; },
      titlesAt: { 100: nm('動手的開始', 'Hands on'), 1e3: nm('熟能生巧', 'Practice makes perfect'), 1e4: nm('萬次求真', 'Ten thousand trials for truth'), 1e5: nm('百折不撓的實驗家', 'Unbending experimenter'), 1e6: nm('千錘百鍊', 'Forged by a thousand blows'), 1e7: nm('實驗的化身', 'Experiment incarnate'), 1e8: nm('永動之手', 'Perpetual-motion hands'), 1e9: nm('宇宙的實驗室', 'Laboratory of the cosmos') } },
    { key: 'time', name: nm('專注時光', 'Focused time'), unit: nm('', ''), time: true, levels: 70, base: 600, val: function (c) { return c.seconds; },
      titles: { 1: nm('專注的十分鐘', 'Ten focused minutes'), 10: nm('沉浸於物理', 'Immersed in physics'), 20: nm('一晝夜的追尋', 'A day and a night of searching'), 30: nm('百小時的修行', 'A hundred hours of practice'), 40: nm('時間的主人', 'Master of time'), 50: nm('光陰的雕刻者', 'Sculptor of time'), 60: nm('永恆的觀測者', 'Eternal observer'), 70: nm('宇宙的時鐘', 'Clock of the cosmos') } },
    { key: 'mission', name: nm('任務', 'Missions'), unit: nm('個任務', 'missions'), mag: [0, 6], val: function (c) { return c.missions; },
      titlesAt: { 1: nm('初試啼聲', 'First mission'), 10: nm('任務達人', 'Mission expert'), 100: nm('百題斬', 'A hundred conquered'), 1e3: nm('千題之境', 'Realm of a thousand problems'), 1e4: nm('智慧的燈塔', 'Lighthouse of wisdom'), 1e5: nm('物理的守護者', 'Guardian of physics'), 1e6: nm('全知者', 'The all-knowing') } },
    { key: 'stars', name: nm('倪的星星', 'Ni stars'), unit: nm('顆星', 'stars'), mag: [1, 12], val: function (c) { return c.stars; },
      titlesAt: { 10: nm('第一把星光', 'A handful of starlight'), 100: nm('星光點點', 'Twinkling'), 1e3: nm('星座的繪製者', 'Drawer of constellations'), 1e4: nm('銀河漫步', 'Walking the Milky Way'), 1e5: nm('星河奔流', 'A river of stars'), 1e6: nm('超新星', 'Supernova'), 1e7: nm('星系的誕生', 'Birth of a galaxy'), 1e8: nm('星系團', 'Galaxy cluster'), 1e9: nm('宇宙大爆炸', 'The Big Bang'), 1e10: nm('暗物質的秘密', 'Secret of dark matter'), 1e11: nm('可觀測宇宙', 'The observable universe'), 1e12: nm('多重宇宙', 'The multiverse') } },
    { key: 'hidden', name: nm('解謎', 'Riddles'), unit: nm('個隱藏任務', 'hidden missions'), mag: [0, 5], val: function (c) { return c.hiddenDone; },
      titlesAt: { 1: nm('秘密發現者', 'Secret finder'), 10: nm('解謎高手', 'Riddle solver'), 100: nm('謎之收藏家', 'Collector of mysteries'), 1e3: nm('看穿一切的人', 'The one who sees through all'), 1e4: nm('先知', 'The seer'), 1e5: nm('拉普拉斯的惡魔', "Laplace's demon") } },
    { key: 'master', name: nm('大師任務', 'Master missions'), unit: nm('個 ★10 任務', 'level-10 missions'), mag: [0, 4], val: function (c) { return c.level10; },
      titlesAt: { 1: nm('大師之路', 'The master\'s path'), 10: nm('十星名家', 'Ten-star virtuoso'), 100: nm('大師中的大師', 'Master of masters'), 1e3: nm('一代宗師', 'Grandmaster'), 1e4: nm('巔峰', 'Summit') } },
    { key: 'streak', name: nm('持之以恆', 'Persistence'), unit: nm('天連續', 'days in a row'), levels: 40, base: 1, val: function (c) { return c.streak; },
      titles: { 2: nm('三日不懈', 'Three days running'), 10: nm('兩月的堅持', 'Two months strong'), 20: nm('百日築基', 'A hundred-day foundation'), 27: nm('繞日一周', 'Once around the Sun'), 30: nm('恆星的毅力', 'The patience of a star'), 40: nm('時間長河', 'The river of time') } },
    { key: 'days', name: nm('日積月累', 'Day by day'), unit: nm('天', 'days'), levels: 60, base: 1, val: function (c) { return c.totalDays; },
      titles: { 1: nm('第一天', 'Day one'), 10: nm('積沙成塔', 'Grains into a tower'), 20: nm('時光旅人', 'Time traveller'), 30: nm('歲月的見證', 'Witness of the years'), 40: nm('兩載寒暑', 'Two summers, two winters'), 50: nm('三年一劍', 'A sword forged in three years'), 60: nm('五年磨一劍', 'Five years at the grindstone') } },
    { key: 'comment', name: nm('交流', 'Discussion'), unit: nm('則留言', 'comments'), levels: 20, base: 1, val: function (c) { return c.comments; },
      titles: { 1: nm('發問是科學的開始', 'Science begins with a question'), 10: nm('討論的熱情', 'A passion for discussion'), 20: nm('學術的沙龍', 'An academic salon') } },
    { key: 'explore', name: nm('探索', 'Exploration'), unit: nm('種實驗', 'experiments'), linear: true, levelsFn: function (c) { return c.liveCount; }, val: function (c) { return c.modules; },
      titles: { 3: nm('好奇的眼睛', 'Curious eyes'), 6: nm('實驗室漫遊者', 'Lab wanderer'), 10: nm('跨界探險家', 'Explorer across fields'), 15: nm('物理版圖拓荒者', 'Pioneer of the physics map'), all: nm('萬物之理', 'Theory of everything') } },
    { key: 'full', name: nm('全制霸', 'Clean sweep'), unit: nm('個實驗全部完成', 'experiments fully completed'), linear: true, levelsFn: function (c) { return c.moduleTotal; }, val: function (c) { return c.fullModules; },
      titles: { 1: nm('一門通', 'One subject mastered'), 3: nm('三門精通', 'Three subjects mastered'), 5: nm('五項全能', 'Pentathlon'), 10: nm('十項全能', 'Decathlon'), all: nm('物理大統一', 'Grand unification') } }
  ];
  // 數量級系列（mag: [起始指數, 最終指數]）：門檻依序為 1×10^a, 2×10^a, …, 9×10^a, 1×10^(a+1), …，最後一級 1×10^b。
  SERIES.forEach(function (s) {
    if (!s.mag) return;
    s.th = [];
    for (let d = s.mag[0]; d < s.mag[1]; d++) for (let m = 1; m <= 9; m++) s.th.push(m * Math.pow(10, d));
    s.th.push(Math.pow(10, s.mag[1]));
    s.levels = s.th.length;
    s.titles = {};
    Object.keys(s.titlesAt).forEach(function (v) { const i = s.th.indexOf(+v); if (i >= 0) s.titles[i + 1] = s.titlesAt[v]; });
    s.si = true;
  });
  function levelsOf(s, c) { return s.linear ? Math.max(0, s.levelsFn(c) || 0) : s.levels; }
  function threshold(s, k) { return s.th ? s.th[k - 1] : s.linear ? k : s.base * k * (k + 1) / 2; }
  function levelOf(s, c) {
    const N = levelsOf(s, c), v = s.val(c) || 0;
    let k = 0;
    while (k < N && v >= threshold(s, k + 1)) k++;
    return k;
  }
  // 第 k 級的稱號：往下找最近的稱號；最高級若有 all 稱號就用它
  function titleOf(s, k, c) {
    if (k <= 0) return null;
    if (s.titles.all && k >= levelsOf(s, c)) return s.titles.all;
    for (let i = k; i >= 1; i--) if (s.titles[i]) return s.titles[i];
    return null;
  }
  function nextTitle(s, k, c) {
    const N = levelsOf(s, c);
    for (let i = k + 1; i <= N; i++) {
      if (s.titles[i]) return { level: i, t: s.titles[i] };
      if (s.titles.all && i === N) return { level: i, t: s.titles.all };
    }
    return null;
  }
  // 色彩等級：依該系列進度分 6 段（銅、銀、金、紫晶、鑽石、傳說）
  function band(s, k, c) { const N = levelsOf(s, c) || 1; return Math.max(1, Math.min(6, Math.ceil(6 * k / N))); }

  const LIST = [
    { id: 'hello', tier: 1, cat: 'start', name: nm('第一道光', 'First light'), desc: nm('登入並取好暱稱。', 'Sign in and choose a nickname.'), check: function (c) { return !!c.nickname; } },
    { id: 'mission-mode', tier: 1, cat: 'start', name: nm('接下挑戰', 'Challenge accepted'), desc: nm('第一次打開任務模式。', 'Turn on Mission mode for the first time.'), check: function (c) { return !!c.flags.mm; } },
    { id: 'branch-mech', tier: 5, cat: 'branch', name: nm('牛頓的傳人', 'Heir of Newton'), desc: nm('完成力學分支所有實驗的所有任務。', 'Complete every mission in Mechanics.'), check: function (c) { return c.branchDone.mech; } },
    { id: 'branch-thermo', tier: 5, cat: 'branch', name: nm('焦耳的溫度計', "Joule's thermometer"), desc: nm('完成熱學分支所有實驗的所有任務。', 'Complete every mission in Heat.'), check: function (c) { return c.branchDone.thermo; } },
    { id: 'branch-wave', tier: 5, cat: 'branch', name: nm('都卜勒的耳朵', "Doppler's ears"), desc: nm('完成波動與聲音分支所有實驗的所有任務。', 'Complete every mission in Waves & Sound.'), check: function (c) { return c.branchDone.wave; } },
    { id: 'branch-optics', tier: 5, cat: 'branch', name: nm('惠更斯的眼睛', "Huygens' eyes"), desc: nm('完成光學分支所有實驗的所有任務。', 'Complete every mission in Optics.'), check: function (c) { return c.branchDone.optics; } },
    { id: 'branch-em', tier: 5, cat: 'branch', name: nm('馬克士威的方程式', "Maxwell's equations"), desc: nm('完成電磁學分支所有實驗的所有任務。', 'Complete every mission in Electromagnetism.'), check: function (c) { return c.branchDone.em; } },
    { id: 'branch-modern', tier: 5, cat: 'branch', name: nm('愛因斯坦的光子', "Einstein's photon"), desc: nm('完成近代物理分支所有實驗的所有任務。', 'Complete every mission in Modern Physics.'), check: function (c) { return c.branchDone.modern; } },
    { id: 'rank-100', tier: 3, cat: 'rank', name: nm('榜上有名', 'On the board'), desc: nm('進入排行榜前 100 名（至少 1 k 顆星）。', 'Reach the top 100 (with at least 1 k stars).'), check: function (c) { return c.rank > 0 && c.rank <= 100 && c.stars >= 1e3; } },
    { id: 'rank-10', tier: 5, cat: 'rank', name: nm('十大物理名人', 'Top ten physicists'), desc: nm('進入排行榜前 10 名（至少 1 M 顆星，且排行榜上至少 100 人）。', 'Reach the top 10 (with at least 1 M stars, among 100 or more players).'), check: function (c) { return c.rank > 0 && c.rank <= 10 && c.stars >= 1e6 && c.boardSize >= 100; } },
    { id: 'rank-1', tier: 6, cat: 'rank', name: nm('站上巔峰', 'Top of the world'), desc: nm('登上排行榜第 1 名（至少 1 G 顆星，且排行榜上至少 1,000 人）。', 'Reach number 1 (with at least 1 G stars, among 1,000 or more players).'), check: function (c) { return c.rank === 1 && c.stars >= 1e9 && c.boardSize >= 1000; } },
    // ---------- 隱藏成就：只有謎語 ----------
    { id: 'secret-a', tier: 3, cat: 'secret', hidden: true, name: nm('守夜人', 'Night watch'), riddle: nm('月亮也還沒睡。', 'Even the Moon is still awake.'), check: function (c) { return !!c.flags.night; } },
    { id: 'secret-b', tier: 3, cat: 'secret', hidden: true, name: nm('晨曦', 'Daybreak'), riddle: nm('比太陽更早醒來。', 'Awake before the Sun.'), check: function (c) { return !!c.flags.dawn; } },
    { id: 'secret-c', tier: 2, cat: 'secret', hidden: true, name: nm('世界公民', 'Citizen of the world'), riddle: nm('換一種語言看世界。', 'See the world in other words.'), check: function (c) { return !!c.flags.lang; } },
    { id: 'secret-d', tier: 4, cat: 'secret', hidden: true, name: nm('周遊列國', 'Grand tour'), riddle: nm('一天之內，走遍天下。', 'The whole world in a single day.'), check: function (c) { return c.maxDayModules >= 8; } },
    { id: 'secret-e', tier: 4, cat: 'secret', hidden: true, name: nm('終極答案', 'The ultimate answer'), riddle: nm('生命、宇宙以及一切。', 'Life, the universe and everything.'), check: function (c) { return c.stars === 6 * 7; } },
    { id: 'secret-f', tier: 4, cat: 'secret', hidden: true, name: nm('整點報時', 'On the hour'), riddle: nm('鐘聲響起的那一刻。', 'The moment the bell rings.'), check: function (c) { return !!c.lastDone && c.lastDone.minute === 0; } },
    { id: 'secret-g', tier: 3, cat: 'secret', hidden: true, name: nm('歸來的旅人', 'The traveller returns'), riddle: nm('離開得夠久，才懂得回來。', 'Only those who stay away long enough know how to return.'), check: function (c) { return c.longestGap >= 30; } },
    { id: 'secret-h', tier: 5, cat: 'secret', hidden: true, name: nm('對稱之美', 'The beauty of symmetry'), riddle: nm('正著讀、倒著讀，都是同一個你。', 'Read forwards or backwards — still the same you.'), check: function (c) { return c.stars >= 1000 && String(c.stars) === String(c.stars).split('').reverse().join(''); } },
    { id: 'secret-i', tier: 5, cat: 'secret', hidden: true, name: nm('孤獨的質數', 'A lonely prime'), riddle: nm('只能被一和自己整除的孤獨。', 'The loneliness of being divisible only by one and yourself.'), check: function (c) { return c.stars > 1000 && isPrime(c.stars); } },
    { id: 'secret-j', tier: 5, cat: 'secret', hidden: true, name: nm('無盡的圓', 'The endless circle'), riddle: nm('永不結束、永不循環的那個數。', 'The number that never ends and never repeats.'), check: function (c) { return c.ops >= 314159; } },
    { id: 'secret-k', tier: 6, cat: 'secret', hidden: true, name: nm('三力交會', 'Where three forces meet'), riddle: nm('三種不同的語言，在同一天被你說出。', 'Three different languages, all spoken by you in a single day.'), check: function (c) { return c.maxDayBranches >= 3; } }
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
  function unlocked(a, c) { try { return !!a.check(c); } catch (e) { return false; } }

  // ---------- 判定與解鎖 ----------
  // 等級系列：達到第 k 級時，寫入 系列-1 … 系列-k 中尚未解鎖的等級；一次升好幾級只跳一則提示。
  let evaluating = false, again = false;
  function evaluate() {
    if (!api || !uid || !me.loaded || !st.ready) return;
    if (evaluating) { again = true; return; }
    const c = context();
    const map = {}, notes = [];
    SERIES.forEach(function (sr) {
      const k = levelOf(sr, c);
      let from = 0;
      for (let i = 1; i <= k; i++) {
        const id = sr.key + '-' + i;
        if (!me.got[id]) { map['achievements/' + uid + '/' + id] = { at: api.now() }; if (!from) from = i; }
      }
      if (from) notes.push({ series: sr, from: from, to: k, band: band(sr, k, c), title: titleOf(sr, k, c) });
    });
    LIST.forEach(function (a) {
      if (!me.got[a.id] && unlocked(a, c)) { map['achievements/' + uid + '/' + a.id] = { at: api.now() }; notes.push({ single: a }); }
    });
    if (!notes.length) return;
    evaluating = true;
    api.update(map).then(function () {
      Object.keys(map).forEach(function (path) { me.got[path.split('/').pop()] = { at: Date.now() }; });
      notes.forEach(function (n, i) { setTimeout(function () { toast(n); }, i * 700); });
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
  function toast(n) {
    const tier = n.single ? (n.single.tier || 1) : n.band;
    const t = el('div', 'ac-toast tier' + tier);
    t.setAttribute('role', 'status');
    const ico = el('span', 'ac-ico'); ico.innerHTML = BADGE; t.appendChild(ico);
    const tx = el('span', 'ac-tx');
    if (n.single) {
      tx.appendChild(el('strong', null, n.single.hidden ? T('隱藏成就解鎖！', 'Hidden achievement unlocked!') : T('成就解鎖！', 'Achievement unlocked!')));
      tx.appendChild(el('span', null, L(n.single.name)));
    } else {
      tx.appendChild(el('strong', null, T('成就升級！', 'Level up!')));
      const lv = (n.from === n.to || n.from === 1) ? 'Lv.' + n.to : 'Lv.' + (n.from - 1) + ' → Lv.' + n.to;
      tx.appendChild(el('span', null, L(n.series.name) + ' ' + lv + (n.title ? T('「', ' “') + L(n.title) + T('」', '”') : '')));
    }
    t.appendChild(tx);
    let box = document.getElementById('ac-toasts');
    if (!box) { box = el('div', 'ac-toasts'); box.id = 'ac-toasts'; document.body.appendChild(box); }
    box.appendChild(t);
    const S = window.LabSound;
    if (S && S.enabled()) { S.tone({ freq: 1047, dur: 0.12, gain: 0.4 }); S.tone({ freq: 1568, dur: 0.18, gain: 0.35, delay: 0.1 }); }
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 3400);
  }

  // ---------- 我的成就（排行榜頁） ----------
  const TIER = { 1: nm('銅', 'Bronze'), 2: nm('銀', 'Silver'), 3: nm('金', 'Gold'), 4: nm('紫晶', 'Amethyst'), 5: nm('鑽石', 'Diamond'), 6: nm('傳說', 'Legend') };
  // 10,000 以上用國際單位詞頭：k、M、G、T（例：3.25 k、1.2 M）；門檻整數直接寫 2 k、50 M
  function si(x) {
    x = Math.floor(x);
    if (x < 1e4) return x.toLocaleString();
    const P = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k']];
    for (let i = 0; i < P.length; i++) {
      if (x >= P[i][0]) { const v = x / P[i][0]; return String(v >= 100 ? Math.floor(v) : Math.floor(v * 100) / 100) + ' ' + P[i][1]; }
    }
    return String(x);
  }
  function fmtVal(sr, x) {
    if (sr && sr.time) { const h = x / 3600; return h >= 1 ? (Math.floor(h * 10) / 10).toLocaleString() + T(' 小時', ' h') : Math.floor(x / 60) + T(' 分', ' min'); }
    return (sr && sr.si ? si(x) : Math.floor(x).toLocaleString()) + (sr ? ' ' + L(sr.unit) : '');
  }
  function quote(t) { return T('「', '“') + t + T('」', '”'); }
  function totals(c) {
    let got = 0, all = 0;
    SERIES.forEach(function (sr) { all += levelsOf(sr, c); got += Math.min(levelOf(sr, c), levelsOf(sr, c)); });
    all += LIST.length;
    got += LIST.filter(function (a) { return me.got[a.id]; }).length;
    return { got: got, all: all };
  }
  function renderInto(box) {
    const draw = function () {
      box.innerHTML = '';
      if (!uid) { box.appendChild(el('p', 'lb-note', T('登入 Google 帳號後才能收集成就。', 'Sign in with Google to collect achievements.'))); return; }
      if (!me.loaded) { box.appendChild(el('p', 'lb-note', T('載入中…', 'Loading…'))); return; }
      const c = context();
      const tt = totals(c);
      box.appendChild(el('p', 'lb-note', T('已解鎖 ', 'Unlocked ') + tt.got.toLocaleString() + ' / ' + tt.all.toLocaleString() +
        T('　星星、操作、任務、解謎、大師任務以數量級遞增（1、2…9、10、20…，直到 k、M、G、T）；時間與天數類為級數遞增（第 k 級 = 基數 × (1 + 2 + … + k)）。色彩：銅、銀、金、紫晶、鑽石、傳說。',
          ' · Stars, interactions, missions, riddles and master missions climb by orders of magnitude (1, 2 … 9, 10, 20 … up to k, M, G, T); time and day series grow as a series (level k = base × (1 + 2 + … + k)). Colours: bronze, silver, gold, amethyst, diamond, legend.')));
      CATS.forEach(function (cat) {
        const sec = el('div', 'ac-cat');
        const grid = el('div', 'ac-grid');
        if (cat[0] === 'series') {
          sec.appendChild(el('h3', null, L(cat[1])));
          SERIES.forEach(function (sr) {
            const N = levelsOf(sr, c);
            if (!N) return;
            const k = levelOf(sr, c), v = sr.val(c) || 0;
            const card = el('div', 'ac-card ac-series tier' + (k ? band(sr, k, c) : 1) + (k ? ' on' : ''));
            const ico = el('span', 'ac-ico'); ico.innerHTML = BADGE; card.appendChild(ico);
            const tx = el('div', 'ac-tx');
            const head = el('strong');
            head.appendChild(document.createTextNode(L(sr.name) + ' '));
            head.appendChild(el('span', 'ac-lv', 'Lv.' + k + ' / ' + N));
            tx.appendChild(head);
            const ti = titleOf(sr, k, c);
            tx.appendChild(el('span', 'ac-title', ti ? quote(L(ti)) : T('尚未解鎖', 'Not yet unlocked')));
            if (k < N) {
              const lo = k ? threshold(sr, k) : 0, hi = threshold(sr, k + 1);
              const bar = el('span', 'ac-bar'); const fill = el('span', 'ac-fill');
              fill.style.width = Math.max(0, Math.min(100, 100 * (v - lo) / (hi - lo))) + '%';
              bar.appendChild(fill); tx.appendChild(bar);
              tx.appendChild(el('span', 'ac-prog', T('下一級 Lv.', 'Next: Lv.') + (k + 1) + T('：', ': ') + fmtVal(sr, v) + ' / ' + fmtVal(sr, hi)));
              const nt = nextTitle(sr, k, c);
              if (nt) tx.appendChild(el('span', 'ac-next', T('下一個稱號：', 'Next title: ') + quote(L(nt.t)) + T('（Lv.', ' (Lv.') + nt.level + T('）', ')')));
            } else {
              tx.appendChild(el('span', 'ac-prog', T('已達最高等級！', 'Maximum level reached!')));
            }
            // 所有稱號一覽
            const det = el('details', 'ac-titles');
            det.appendChild(el('summary', null, T('稱號一覽', 'All titles')));
            const ul = el('ul');
            Object.keys(sr.titles).forEach(function (key) {
              const lvN = key === 'all' ? N : +key;
              if (lvN > N) return;
              const li = el('li', k >= lvN ? 'got' : null, 'Lv.' + lvN + '　' + L(sr.titles[key]) + '　' + fmtVal(sr, threshold(sr, lvN)));
              ul.appendChild(li);
            });
            det.appendChild(ul);
            tx.appendChild(det);
            tx.appendChild(el('span', 'ac-tier', k ? L(TIER[band(sr, k, c)]) : ''));
            card.appendChild(tx);
            grid.appendChild(card);
          });
        } else {
          const items = LIST.filter(function (a) { return a.cat === cat[0]; });
          if (!items.length) return;
          const n1 = items.filter(function (a) { return me.got[a.id]; }).length;
          sec.appendChild(el('h3', null, L(cat[1]) + '　' + n1 + ' / ' + items.length));
          items.forEach(function (a) {
            const on = !!me.got[a.id];
            const card = el('div', 'ac-card tier' + (a.tier || 1) + (on ? ' on' : '') + (a.hidden ? ' secret' : ''));
            const ico = el('span', 'ac-ico'); ico.innerHTML = BADGE; card.appendChild(ico);
            const tx = el('div', 'ac-tx');
            tx.appendChild(el('strong', null, a.hidden && !on ? '？？？' : L(a.name)));
            tx.appendChild(el('span', null, a.hidden ? quote(L(a.riddle)) : L(a.desc)));
            tx.appendChild(el('span', 'ac-tier', L(TIER[a.tier || 1])));
            card.appendChild(tx);
            grid.appendChild(card);
          });
        }
        sec.appendChild(grid);
        box.appendChild(sec);
      });
      box.appendChild(el('p', 'lb-note ac-stats', T('我的累計：操作 ', 'My totals: ') + c.ops.toLocaleString() + T(' 次・操作時間 ', ' interactions · ') +
        fmtVal({ time: true }, c.seconds) + T('・玩過 ', ' · ') + c.modules + T(' 種實驗・連續 ', ' experiments · streak ') + c.streak + T(' 天・累計 ', ' days · ') + c.totalDays + T(' 天', ' days in total')));
    };
    renderers.push(draw);
    draw();
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  window.LabAchievements = {
    list: LIST, series: SERIES, renderInto: renderInto, si: si, _me: me,
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
