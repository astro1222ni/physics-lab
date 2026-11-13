/*
 * achievements.js — 成就系統（需登入 Google 帳號）
 *
 * 由 missions.js 自動載入。登入後：
 *   - 記錄個人累計：操作次數、操作時間（stats.js 的 lab:statsflush 事件）、留言數（comments.js 的 lab:commented）、
 *     玩過哪些實驗、每天玩過哪些實驗、特殊旗標。
 *   - 載入全站任務定義，依累計資料、完成的任務、星星與名次判定成就；解鎖時跳出提示並寫入資料庫（每個成就只解鎖一次）。
 * 成就是收藏用的徽章，不加星星（星星只能靠任務取得）。
 * 等級：1 銅、2 銀、3 金、4 紫晶、5 傳說。隱藏成就只顯示謎語；解鎖後顯示名稱，但不說明條件。
 * 資料：userStats/<uid>/{ops, seconds, comments, modules/<模組>, days/<YYYYMMDD>/<模組>, flags/<旗標>}、achievements/<uid>/<成就>、
 *       bag/<uid>（每日任務的寶物，js/daily.js）
 * 分類（11/12 站長要求）：「全科」成就＋物理、化學、生物、地球科學各科的成就（各科星星、探索、全制霸、分支制霸、各科排行榜）。
 *   各科成就代號以科目開頭（phy-stars-3、earth-rank-100…）；已上線的成就代號一律不改。
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
  const ver = self ? ((self.getAttribute('src') || '').match(/\?v=\d+/) || [''])[0] : ''; // 動態載入的任務檔沿用版本號，避免舊快取

  // ---------- 載入全站實驗清單與所有任務定義（只註冊，不在本頁判定） ----------
  function loadScript(src) {
    return new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = src; s.onload = s.onerror = resolve;
      document.body.appendChild(s);
    });
  }
  // 只有登入後才需要全站任務定義（判定成就）；沒登入的訪客不下載這幾十個檔案，實驗頁開得更快
  let listP = null;
  function listReady() {
    if (!listP && LM.loadAll) listP = LM.loadAll();
    if (!listP) listP = (window.LAB_LIVE_MODULES ? Promise.resolve() : loadScript(base + 'missions/index.js' + ver)).then(function () {
      const all = LM.all();
      return Promise.all((window.LAB_MISSION_MODULES || []).filter(function (m) { return !all[m.id]; })
        .map(function (m) { return loadScript(base + 'missions/' + m.id + '.js' + ver); }));
    });
    // 章對照表（章制霸用；由 tools/build-catalog.cjs 從首頁產生）
    if (!chapP) chapP = Promise.all([listP, window.LAB_CHAPTERS ? null : loadScript(base + 'chapter-map.js' + ver)]);
    return chapP;
  }
  let chapP = null;
  const live = function () { return window.LAB_LIVE_MODULES || []; };
  const branchOf = function (m) { return (window.LAB_MODULE_BRANCH || {})[m]; };
  const subjOf = function (m) { return window.LAB_SUBJECT_OF ? window.LAB_SUBJECT_OF(m) : 'phy'; };
  // 各科目（與 missions/index.js 的 LAB_SUBJECTS 相同；這裡先寫好，成就定義不必等清單載入）
  const SUBJ = [
    { id: 'phy', zh: '物理', en: 'Physics', short: '物理' },
    { id: 'chem', zh: '化學', en: 'Chemistry', short: '化學' },
    { id: 'bio', zh: '生物', en: 'Biology', short: '生物' },
    { id: 'earth', zh: '地球科學', en: 'Earth Science', short: '地科' },
    { id: 'math', zh: '數學', en: 'Mathematics', short: '數學' },
    { id: 'info', zh: '資訊科技', en: 'Information Technology', short: '資訊' },
    { id: 'geog', zh: '地理', en: 'Geography', short: '地理' },
    { id: 'music', zh: '音樂', en: 'Music', short: '音樂' }
  ];
  // 跨科成就（cross-*）的五科：說明寫明「物理、化學、生物、地球科學、數學」，之後加的科目不改它的條件
  const CROSS5 = ['phy', 'chem', 'bio', 'earth', 'math'];
  // 分頁要不要顯示這一科：新科等第一個實驗上線（missions/index.js 的 LAB_SUBJECT_SHOWN）
  const shownSubj = function (sid) { return !window.LAB_SUBJECT_SHOWN || window.LAB_SUBJECT_SHOWN(sid); };
  const BRANCH_SUBJ = { mech: 'phy', thermo: 'phy', wave: 'phy', optics: 'phy', em: 'phy', modern: 'phy', astro: 'earth', geo: 'earth', atmo: 'earth', ocean: 'earth', cell: 'bio', genetics: 'bio', physiology: 'bio', ecology: 'bio', evolution: 'bio', biotech: 'bio',
    algebra: 'math', geometry: 'math', vectors: 'math', probability: 'math', calculus: 'math',
    matter: 'chem', reaction: 'chem', equilibrium: 'chem', acidbase: 'chem', organic: 'chem',
    data: 'info', algo: 'info', prog: 'info', system: 'info', network: 'info', ai: 'info',
    mapping: 'geog', gis: 'geog', climate: 'geog', landform: 'geog', population: 'geog', economy: 'geog',
    tone: 'music', tuning: 'music', harmony: 'music', instruments: 'music', rhythm: 'music', audio: 'music' };

  // ---------- 成就定義 ----------
  // 一、等級系列：第 k 級門檻 = 基數 × k(k+1)/2（級數遞增，越後面差距越大）；探索、全制霸以實驗數量為準（每多一種實驗一級）。
  //     每 10 級（及少數特別等級）有專屬稱號。成就代號為「系列-等級」，例如 ops-12。
  // 二、單一成就：起步、分支制霸、排行榜、隱藏成就。
  const CATS = [
    ['series', { zh: '等級成就', en: 'Levelled achievements' }],
    ['start', { zh: '起步', en: 'Getting started' }], ['branch', { zh: '分支制霸', en: 'Branch mastery' }], ['cross', { zh: '跨科', en: 'Across subjects' }],
    ['daily', { zh: '每日任務與寶物', en: 'Daily missions & treasures' }],
    ['rank', { zh: '排行榜', en: 'Leaderboard' }], ['secret', { zh: '隱藏成就', en: 'Hidden achievements' }]
  ];
  const nm = function (zh, en) { return { zh: zh, en: en }; };
  const SERIES = [
    { key: 'ops', name: nm('動手實驗', 'Hands-on'), unit: nm('次操作', 'interactions'), mag: [2, 9], val: function (c) { return c.ops; },
      titlesAt: { 100: nm('動手的開始', 'Hands on'), 1e3: nm('熟能生巧', 'Practice makes perfect'), 1e4: nm('萬次求真', 'Ten thousand trials for truth'), 1e5: nm('百折不撓的實驗家', 'Unbending experimenter'), 1e6: nm('千錘百鍊', 'Forged by a thousand blows'), 1e7: nm('實驗的化身', 'Experiment incarnate'), 1e8: nm('永動之手', 'Perpetual-motion hands'), 1e9: nm('宇宙的實驗室', 'Laboratory of the cosmos') } },
    { key: 'time', name: nm('專注時光', 'Focused time'), unit: nm('', ''), time: true, levels: 70, base: 600, val: function (c) { return c.seconds; },
      titles: { 1: nm('專注的十分鐘', 'Ten focused minutes'), 10: nm('沉浸於科學', 'Immersed in science'), 20: nm('一晝夜的追尋', 'A day and a night of searching'), 30: nm('百小時的修行', 'A hundred hours of practice'), 40: nm('時間的主人', 'Master of time'), 50: nm('光陰的雕刻者', 'Sculptor of time'), 60: nm('永恆的觀測者', 'Eternal observer'), 70: nm('宇宙的時鐘', 'Clock of the cosmos') } },
    { key: 'mission', name: nm('任務', 'Missions'), unit: nm('個任務', 'missions'), mag: [0, 6], val: function (c) { return c.missions; },
      titlesAt: { 1: nm('初試啼聲', 'First mission'), 10: nm('任務達人', 'Mission expert'), 100: nm('百題斬', 'A hundred conquered'), 1e3: nm('千題之境', 'Realm of a thousand problems'), 1e4: nm('智慧的燈塔', 'Lighthouse of wisdom'), 1e5: nm('科學的守護者', 'Guardian of science'), 1e6: nm('全知者', 'The all-knowing') } },
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
      titles: { 3: nm('好奇的眼睛', 'Curious eyes'), 6: nm('實驗室漫遊者', 'Lab wanderer'), 10: nm('跨界探險家', 'Explorer across fields'), 15: nm('科學版圖拓荒者', 'Pioneer of the map of science'),
        25: nm('實驗室的老朋友', 'Old friend of the lab'), 50: nm('五十種好奇', 'Fifty curiosities'), 100: nm('百科全書', 'Encyclopedia'), 200: nm('博物學家', 'Naturalist'), 300: nm('包羅萬象', 'All phenomena'), all: nm('萬物之理', 'Theory of everything') } },
    { key: 'full', name: nm('全制霸', 'Clean sweep'), unit: nm('個實驗全部完成', 'experiments fully completed'), linear: true, levelsFn: function (c) { return c.moduleTotal; }, val: function (c) { return c.fullModules; },
      titles: { 1: nm('一門通', 'One subject mastered'), 3: nm('三門精通', 'Three subjects mastered'), 5: nm('五項全能', 'Pentathlon'), 10: nm('十項全能', 'Decathlon'),
        20: nm('二十面體', 'Icosahedron'), 50: nm('半百功成', 'Fifty mastered'), 100: nm('百戰百勝', 'A hundred victories'), 200: nm('兩百座高峰', 'Two hundred summits'), 300: nm('群山之巔', 'Above all the mountains'), all: nm('萬物歸一', 'All things as one') } },
    // 章制霸：首頁每一章（js/chapter-map.js）的已上線實驗全部完成；實驗越多章越多，等級跟著增加
    { key: 'chapter', name: nm('章制霸', 'Chapter mastery'), unit: nm('章全部完成', 'chapters fully completed'), linear: true, levelsFn: function (c) { return c.chapterTotal; }, val: function (c) { return c.chapterFull; },
      titles: { 1: nm('一章讀通', 'One chapter through'), 3: nm('三章融會', 'Three chapters woven together'), 5: nm('五章貫通', 'Five chapters connected'), 10: nm('十章在胸', 'Ten chapters by heart'),
        20: nm('二十章的學者', 'Scholar of twenty chapters'), 50: nm('半部科學史', 'Half a history of science'), 100: nm('百章成書', 'A book of a hundred chapters'), all: nm('全書在胸', 'The whole book by heart') } },
    // 分支制霸（系列）：分支越多等級越多；每個分支另有自己的分支成就
    { key: 'branches', name: nm('分支制霸', 'Branch mastery'), unit: nm('個分支全部完成', 'branches fully completed'), linear: true, levelsFn: function (c) { return c.branchTotal; }, val: function (c) { return c.branchFull; },
      titles: { 1: nm('一脈相承', 'One branch mastered'), 3: nm('三江匯流', 'Three rivers meet'), 5: nm('五嶽歸來', 'Back from the five peaks'), 10: nm('十方通達', 'Open in all ten directions'), 20: nm('科學的地圖', 'The map of science'), all: nm('科學的全景', 'The whole panorama of science') } },
    { key: 'daily', name: nm('每日任務', 'Daily missions'), unit: nm('個每日任務', 'daily missions'), mag: [0, 5], val: function (c) { return c.bag.dm || 0; },
      titlesAt: { 1: nm('日日新', 'New every day'), 10: nm('每日的習慣', 'A daily habit'), 100: nm('百日之功', 'A hundred days of work'), 1e3: nm('千日修行', 'A thousand days of practice'), 1e4: nm('時間的朋友', 'Friend of time'), 1e5: nm('永恆的日常', 'The eternal everyday') } }
  ];
  // 各科的等級系列：各科星星（數量級）、探索（玩過幾種該科實驗）、全制霸（該科幾個實驗全部完成）
  const SUBJ_TITLES = {
    phy: {
      stars: { 10: nm('蘋果落下的瞬間', 'The moment the apple fell'), 100: nm('站在巨人的肩膀上', 'On the shoulders of giants'), 1e3: nm('力與光的交響', 'A symphony of force and light'), 1e4: nm('場的低語', 'Whispers of the field'), 1e5: nm('量子躍遷', 'Quantum leap'), 1e6: nm('大統一之夢', 'The dream of unification') },
      explore: { 1: nm('物理初心', 'A physicist at heart'), 5: nm('實驗室常客', 'Lab regular'), 15: nm('物理版圖拓荒者', 'Pioneer of the physics map'), 30: nm('物理博物學家', 'Naturalist of physics'), 40: nm('實驗室的主人', 'Master of the lab'), all: nm('物理全覽', 'All of physics') },
      full: { 1: nm('一門通', 'One lab mastered'), 3: nm('三門精通', 'Three labs mastered'), 10: nm('十項全能', 'Decathlon'), 20: nm('二十項全能', 'Icosathlon'), 30: nm('三十而立', 'Standing firm at thirty'), 40: nm('四十不惑', 'No doubts at forty'), all: nm('物理大統一', 'Grand unification') },
      chapter: { 1: nm('讀通一章', 'One chapter of physics'), 5: nm('從牛頓到馬克士威', 'From Newton to Maxwell'), 10: nm('費曼的講義', "Feynman's lectures"), all: nm('物理的全書', 'The whole book of physics') }
    },
    chem: {
      stars: { 10: nm('第一滴試劑', 'The first drop of reagent'), 100: nm('週期表的旅人', 'Traveller of the periodic table'), 1e3: nm('鍵結的藝術', 'The art of the bond'), 1e4: nm('催化之手', "The catalyst's touch"), 1e5: nm('分子建築師', 'Molecular architect'), 1e6: nm('煉金術的真相', 'The truth behind alchemy') },
      explore: { 1: nm('化學初心', 'A chemist at heart'), 5: nm('實驗桌的常客', 'Regular at the bench'), 10: nm('試管森林的漫遊者', 'Wanderer in a forest of test tubes'), 20: nm('燒杯裡的宇宙', 'A universe in a beaker'), 40: nm('元素的知音', 'Friend of the elements'), 60: nm('化學百景', 'A hundred views of chemistry'), all: nm('化學全覽', 'All of chemistry') },
      full: { 1: nm('一門通', 'One lab mastered'), 3: nm('三門精通', 'Three labs mastered'), 5: nm('五味調和', 'Five flavours in balance'), 10: nm('精煉之手', 'Refining hands'), 20: nm('結晶的耐心', 'The patience of crystals'), 40: nm('反應的指揮家', 'Conductor of reactions'), 60: nm('拉瓦節的傳人', 'Heir of Lavoisier'), all: nm('物質的主宰', 'Master of matter') },
      chapter: { 1: nm('讀通一章', 'One chapter of chemistry'), 5: nm('從原子到分子', 'From atoms to molecules'), 10: nm('化學的語法', 'The grammar of chemistry'), all: nm('化學的全書', 'The whole book of chemistry') }
    },
    bio: {
      stars: { 10: nm('第一個細胞', 'The first cell'), 100: nm('顯微鏡下的世界', 'The world under the microscope'), 1e3: nm('演化之樹', 'The tree of evolution'), 1e4: nm('基因的密碼', 'The genetic code'), 1e5: nm('生態的平衡', 'Balance of the ecosystem'), 1e6: nm('生命的奧祕', 'The mystery of life') },
      explore: { 1: nm('生物初心', 'A biologist at heart'), 5: nm('田野調查員', 'Field researcher'), 10: nm('標本箱的主人', 'Keeper of the specimen box'), 20: nm('生態的漫遊者', 'Wanderer of ecosystems'), 40: nm('達爾文的航程', "Darwin's voyage"), 60: nm('生命百態', 'Life in all its forms'), all: nm('生物全覽', 'All of biology') },
      full: { 1: nm('一門通', 'One lab mastered'), 3: nm('三門精通', 'Three labs mastered'), 5: nm('五界通曉', 'Knower of the five kingdoms'), 10: nm('生命之網', 'The web of life'), 20: nm('雙螺旋的旋律', 'Melody of the double helix'), 40: nm('演化的長河', 'The long river of evolution'), 60: nm('林奈的分類學', "Linnaeus's taxonomy"), all: nm('生命的全貌', 'The whole of life') },
      chapter: { 1: nm('讀通一章', 'One chapter of biology'), 5: nm('從細胞到生態系', 'From cells to ecosystems'), 10: nm('生命的教科書', 'The textbook of life'), all: nm('生物的全書', 'The whole book of biology') }
    },
    earth: {
      stars: { 10: nm('仰望星空', 'Looking up at the stars'), 100: nm('讀懂岩層', 'Reading the rock layers'), 1e3: nm('季風的旋律', 'The melody of the monsoon'), 1e4: nm('板塊的脈動', 'Pulse of the plates'), 1e5: nm('蒼穹之眼', 'Eye of the heavens'), 1e6: nm('蓋婭的知音', "Gaia's confidant") },
      explore: { 1: nm('地科初心', 'An earth scientist at heart'), 3: nm('天地行者', 'Walker of heaven and earth'), 10: nm('看雲的人', 'Cloud watcher'), 20: nm('地層的讀者', 'Reader of the strata'), 40: nm('繞地球一圈', 'Once around the world'), 60: nm('行星的旅人', 'Planetary traveller'), all: nm('行遍天地', 'Across heaven and earth') },
      full: { 1: nm('一門通', 'One lab mastered'), 3: nm('三門精通', 'Three labs mastered'), 5: nm('颱風眼的平靜', 'Calm in the eye of the storm'), 10: nm('大陸漂移', 'Continental drift'), 20: nm('季風的使者', 'Messenger of the monsoon'), 40: nm('地質年代', 'Geologic time'), 60: nm('蓋婭的守護者', 'Guardian of Gaia'), all: nm('通曉天地', 'Knower of heaven and earth') },
      chapter: { 1: nm('讀通一章', 'One chapter of earth science'), 5: nm('從地心到星空', 'From the core to the stars'), 10: nm('地球的傳記', 'A biography of the Earth'), all: nm('地科的全書', 'The whole book of earth science') }
    },
    math: {
      stars: { 10: nm('數的啟蒙', 'The dawn of number'), 100: nm('幾何的優雅', 'The elegance of geometry'), 1e3: nm('通往無窮的階梯', 'A staircase to infinity'), 1e4: nm('微積分的鑰匙', 'The key of calculus'), 1e5: nm('歐拉的恆等式', "Euler's identity"), 1e6: nm('宇宙的語言', 'The language of the universe') },
      explore: { 1: nm('數學初心', 'A mathematician at heart'), 5: nm('圖形的旅人', 'Traveller among graphs'), 10: nm('函數的花園', 'Garden of functions'), 20: nm('證明的樂趣', 'The joy of proof'), 40: nm('無窮的旅程', 'Journey to infinity'), 60: nm('數學的星空', 'The starry sky of mathematics'), all: nm('數學全覽', 'All of mathematics') },
      full: { 1: nm('一門通', 'One lab mastered'), 3: nm('三門精通', 'Three labs mastered'), 5: nm('黃金比例', 'The golden ratio'), 10: nm('十進位的秩序', 'The order of base ten'), 20: nm('歐幾里得的公設', "Euclid's postulates"), 40: nm('高斯的天才', "Gauss's genius"), 60: nm('希爾伯特的問題', "Hilbert's problems"), all: nm('萬物皆數', 'All is number') },
      chapter: { 1: nm('讀通一章', 'One chapter of mathematics'), 5: nm('從數到函數', 'From numbers to functions'), 10: nm('幾何原本', 'The Elements'), all: nm('數學的全書', 'The whole book of mathematics') }
    },
    info: {
      stars: { 10: nm('第一個位元', 'The first bit'), 100: nm('邏輯閘的火花', 'Spark of the logic gate'), 1e3: nm('演算法的節拍', 'The rhythm of algorithms'), 1e4: nm('封包的旅程', 'Journey of a packet'), 1e5: nm('圖靈的機器', "Turing's machine"), 1e6: nm('數位宇宙', 'The digital universe') },
      explore: { 1: nm('開機', 'Booting up'), 5: nm('程式的旅人', 'Traveller through code'), 10: nm('資料的花園', 'Garden of data'), 20: nm('除錯的樂趣', 'The joy of debugging'), 40: nm('網路的漫遊者', 'Roamer of the network'), 60: nm('運算的星空', 'The starry sky of computation'), all: nm('資訊全覽', 'All of computing') },
      full: { 1: nm('一門通', 'One lab mastered'), 3: nm('三門精通', 'Three labs mastered'), 5: nm('二進位的秩序', 'The order of binary'), 10: nm('排序的藝術', 'The art of sorting'), 20: nm('布爾的代數', "Boole's algebra"), 40: nm('夏農的資訊', "Shannon's information"), 60: nm('范紐曼的架構', "Von Neumann's architecture"), all: nm('萬物皆位元', 'It from bit') },
      chapter: { 1: nm('讀通一章', 'One chapter of computing'), 5: nm('從位元到網路', 'From bits to networks'), 10: nm('程式設計的藝術', 'The art of programming'), all: nm('資訊的全書', 'The whole book of computing') }
    },
    geog: {
      stars: { 10: nm('打開地圖', 'Unfolding the map'), 100: nm('等高線的起伏', 'Rise and fall of contours'), 1e3: nm('經緯的網', 'The net of latitude and longitude'), 1e4: nm('季風與聚落', 'Monsoons and settlements'), 1e5: nm('洪堡的足跡', "Humboldt's footsteps"), 1e6: nm('世界的形狀', 'The shape of the world') },
      explore: { 1: nm('出發的旅人', 'A traveller sets out'), 5: nm('地圖的讀者', 'Reader of maps'), 10: nm('河流的追尋', 'Following the river'), 20: nm('城市的觀察者', 'Watcher of cities'), 40: nm('大陸的行者', 'Walker of continents'), 60: nm('地球的旅人', 'Traveller of the Earth'), all: nm('地理全覽', 'All of geography') },
      full: { 1: nm('一門通', 'One lab mastered'), 3: nm('三門精通', 'Three labs mastered'), 5: nm('比例尺的精準', 'Precision of scale'), 10: nm('托勒密的世界', "Ptolemy's world"), 20: nm('麥哲倫的航線', "Magellan's route"), 40: nm('柯本的氣候', "Köppen's climates"), 60: nm('地球的全貌', 'The whole face of the Earth'), all: nm('天涯若比鄰', 'The world next door') },
      chapter: { 1: nm('讀通一章', 'One chapter of geography'), 5: nm('從地圖到世界', 'From maps to the world'), 10: nm('地理大發現', 'The age of discovery'), all: nm('地理的全書', 'The whole book of geography') }
    },
    music: {
      stars: { 10: nm('第一個音', 'The first note'), 100: nm('泛音的階梯', 'The ladder of overtones'), 1e3: nm('五度的循環', 'The circle of fifths'), 1e4: nm('和聲的殿堂', 'The hall of harmony'), 1e5: nm('巴哈的賦格', "Bach's fugue"), 1e6: nm('天體的音樂', 'Music of the spheres') },
      explore: { 1: nm('聽見聲音', 'Hearing the sound'), 5: nm('音階的旅人', 'Traveller of scales'), 10: nm('樂器的花園', 'Garden of instruments'), 20: nm('節奏的舞者', 'Dancer of rhythm'), 40: nm('和聲的行者', 'Walker of harmony'), 60: nm('聲音的星空', 'The starry sky of sound'), all: nm('音樂全覽', 'All of music') },
      full: { 1: nm('一門通', 'One lab mastered'), 3: nm('三門精通', 'Three labs mastered'), 5: nm('純律的和諧', 'Harmony of just intonation'), 10: nm('平均律的鍵盤', 'The well-tempered keyboard'), 20: nm('傅立葉的耳朵', "Fourier's ear"), 40: nm('交響的織體', 'Texture of the symphony'), 60: nm('畢達哥拉斯的天籟', "Pythagoras's music of the heavens"), all: nm('萬物皆有聲', 'Everything sings') },
      chapter: { 1: nm('讀通一章', 'One chapter of music'), 5: nm('從一根弦到樂團', 'From one string to an orchestra'), 10: nm('音樂的物理', 'The physics of music'), all: nm('音樂的全書', 'The whole book of music') }
    }
  };
  SUBJ.forEach(function (sb) {
    const id = sb.id, tt = SUBJ_TITLES[id];
    SERIES.push(
      { key: id + '-stars', subj: id, name: nm(sb.short + '之星', sb.en + ' stars'), unit: nm('顆星', 'stars'), mag: [1, 6], val: function (c) { return c.by[id].stars; }, titlesAt: tt.stars },
      { key: id + '-explore', subj: id, name: nm(sb.short + '探索', 'Exploring ' + sb.en), unit: nm('種實驗', 'experiments'), linear: true, levelsFn: function (c) { return c.by[id].live; }, val: function (c) { return c.by[id].visited; }, titles: tt.explore },
      { key: id + '-full', subj: id, name: nm(sb.short + '全制霸', sb.en + ' clean sweep'), unit: nm('個實驗全部完成', 'experiments fully completed'), linear: true, levelsFn: function (c) { return c.by[id].moduleTotal; }, val: function (c) { return c.by[id].full; }, titles: tt.full },
      { key: id + '-chapter', subj: id, name: nm(sb.short + '章制霸', sb.en + ' chapter mastery'), unit: nm('章全部完成', 'chapters fully completed'), linear: true, levelsFn: function (c) { return c.by[id].chapters; }, val: function (c) { return c.by[id].chapFull; }, titles: tt.chapter }
    );
  });
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
  function levelsOf(s, c) {
    if (s.subj && !(c.by[s.subj] && c.by[s.subj].live)) return 0; // 這一科還沒有實驗
    return s.linear ? Math.max(0, s.levelsFn(c) || 0) : s.levels;
  }
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
    { id: 'branch-astro', tier: 5, cat: 'branch', name: nm('伽利略的望遠鏡', "Galileo's telescope"), desc: nm('完成天文分支所有實驗的所有任務。', 'Complete every mission in Astronomy.'), check: function (c) { return c.branchDone.astro; } },
    { id: 'branch-geo', tier: 5, cat: 'branch', name: nm('魏格納的拼圖', "Wegener's jigsaw"), desc: nm('完成固體地球分支所有實驗的所有任務。', 'Complete every mission in Solid Earth.'), check: function (c) { return c.branchDone.geo; } },
    { id: 'branch-atmo', tier: 5, cat: 'branch', name: nm('霍華德的雲', "Howard's clouds"), desc: nm('完成大氣分支所有實驗的所有任務。', 'Complete every mission in Atmosphere.'), check: function (c) { return c.branchDone.atmo; } },
    { id: 'branch-ocean', tier: 5, cat: 'branch', name: nm('牛頓的潮汐', "Newton's tides"), desc: nm('完成海洋分支所有實驗的所有任務。', 'Complete every mission in Ocean.'), check: function (c) { return c.branchDone.ocean; } },
    { id: 'branch-genetics', tier: 5, cat: 'branch', name: nm('孟德爾的豌豆', "Mendel's peas"), desc: nm('完成遺傳分支所有實驗的所有任務。', 'Complete every mission in Genetics.'), check: function (c) { return c.branchDone.genetics; } },
    { id: 'branch-matter', tier: 5, cat: 'branch', name: nm('門得列夫的週期表', "Mendeleev's table"), desc: nm('完成物質與結構分支所有實驗的所有任務。', 'Complete every mission in Matter and Structure.'), check: function (c) { return c.branchDone.matter; } },
    { id: 'branch-cell', tier: 5, cat: 'branch', name: nm('虎克的軟木塞', "Hooke's cork"), desc: nm('完成細胞與分子分支所有實驗的所有任務。', 'Complete every mission in Cells and Molecules.'), check: function (c) { return c.branchDone.cell; } },
    { id: 'branch-physiology', tier: 5, cat: 'branch', name: nm('霍奇金與赫胥黎的烏賊', "Hodgkin and Huxley's squid"), desc: nm('完成生理分支所有實驗的所有任務。', 'Complete every mission in Physiology.'), check: function (c) { return c.branchDone.physiology; } },
    { id: 'branch-ecology', tier: 5, cat: 'branch', name: nm('沃爾泰拉的漁網', "Volterra's fishing net"), desc: nm('完成生態分支所有實驗的所有任務。', 'Complete every mission in Ecology.'), check: function (c) { return c.branchDone.ecology; } },
    { id: 'branch-evolution', tier: 5, cat: 'branch', name: nm('加拉巴哥的雀鳥', "Galápagos finches"), desc: nm('完成演化分支所有實驗的所有任務。', 'Complete every mission in Evolution.'), check: function (c) { return c.branchDone.evolution; } },
    { id: 'branch-biotech', tier: 5, cat: 'branch', name: nm('穆利斯的試管', "Mullis's test tube"), desc: nm('完成生物與科技分支所有實驗的所有任務。', 'Complete every mission in Biology and Technology.'), check: function (c) { return c.branchDone.biotech; } },
    { id: 'branch-equilibrium', tier: 5, cat: 'branch', name: nm('勒沙特列的天平', "Le Chatelier's balance"), desc: nm('完成反應速率與平衡分支所有實驗的所有任務。', 'Complete every mission in Rates and Equilibrium.'), check: function (c) { return c.branchDone.equilibrium; } },
    { id: 'branch-acidbase', tier: 5, cat: 'branch', name: nm('阿瑞尼斯的離子', "Arrhenius's ions"), desc: nm('完成酸鹼與氧化還原分支所有實驗的所有任務。', 'Complete every mission in Acids, Bases and Redox.'), check: function (c) { return c.branchDone.acidbase; } },
    { id: 'branch-geometry', tier: 5, cat: 'branch', name: nm('阿波羅尼奧斯的圓錐', "Apollonius's cones"), desc: nm('完成三角與幾何分支所有實驗的所有任務。', 'Complete every mission in Trigonometry and Geometry.'), check: function (c) { return c.branchDone.geometry; } },
    { id: 'branch-vectors', tier: 5, cat: 'branch', name: nm('漢彌爾頓的四元數', "Hamilton's quaternions"), desc: nm('完成向量與空間分支所有實驗的所有任務。', 'Complete every mission in Vectors and Space.'), check: function (c) { return c.branchDone.vectors; } },
    { id: 'branch-probability', tier: 5, cat: 'branch', name: nm('巴斯卡的三角形', "Pascal's triangle"), desc: nm('完成機率與統計分支所有實驗的所有任務。', 'Complete every mission in Probability and Statistics.'), check: function (c) { return c.branchDone.probability; } },
    { id: 'branch-calculus', tier: 5, cat: 'branch', name: nm('牛頓與萊布尼茲的流數', 'Fluxions of Newton and Leibniz'), desc: nm('完成微積分分支所有實驗的所有任務。', 'Complete every mission in Calculus.'), check: function (c) { return c.branchDone.calculus; } },
    { id: 'branch-reaction', tier: 5, cat: 'branch', name: nm('赫斯的熱量帳本', "Hess's ledger of heat"), desc: nm('完成化學反應與能量分支所有實驗的所有任務。', 'Complete every mission in Reactions and Energy.'), check: function (c) { return c.branchDone.reaction; } },
    { id: 'branch-organic', tier: 5, cat: 'branch', name: nm('凱庫勒的環之夢', "Kekulé's dream of the ring"), desc: nm('完成有機與生活化學分支所有實驗的所有任務。', 'Complete every mission in Organic and Everyday Chemistry.'), check: function (c) { return c.branchDone.organic; } },
    { id: 'branch-algebra', tier: 5, cat: 'branch', name: nm('納皮爾的對數表', "Napier's tables"), desc: nm('完成代數與函數分支所有實驗的所有任務。', 'Complete every mission in Algebra and Functions.'), check: function (c) { return c.branchDone.algebra; } },
    { id: 'branch-data', tier: 5, cat: 'branch', name: nm('萊布尼茲的二進位', "Leibniz's binary"), desc: nm('完成資料表示分支所有實驗的所有任務。', 'Complete every mission in Data Representation.'), check: function (c) { return c.branchDone['data']; } },
    { id: 'branch-algo', tier: 5, cat: 'branch', name: nm('花拉子米的算書', "Al-Khwarizmi's book of reckoning"), desc: nm('完成演算法分支所有實驗的所有任務。', 'Complete every mission in Algorithms.'), check: function (c) { return c.branchDone['algo']; } },
    { id: 'branch-prog', tier: 5, cat: 'branch', name: nm('愛達的筆記', "Ada's notes"), desc: nm('完成程式設計分支所有實驗的所有任務。', 'Complete every mission in Programming.'), check: function (c) { return c.branchDone['prog']; } },
    { id: 'branch-system', tier: 5, cat: 'branch', name: nm('范紐曼的藍圖', "Von Neumann's blueprint"), desc: nm('完成計算機系統分支所有實驗的所有任務。', 'Complete every mission in Computer Systems.'), check: function (c) { return c.branchDone['system']; } },
    { id: 'branch-network', tier: 5, cat: 'branch', name: nm('凱撒的密碼', "Caesar's cipher"), desc: nm('完成網路與資訊安全分支所有實驗的所有任務。', 'Complete every mission in Networks and Security.'), check: function (c) { return c.branchDone['network']; } },
    { id: 'branch-ai', tier: 5, cat: 'branch', name: nm('圖靈的模仿遊戲', "Turing's imitation game"), desc: nm('完成人工智慧分支所有實驗的所有任務。', 'Complete every mission in Artificial Intelligence.'), check: function (c) { return c.branchDone['ai']; } },
    { id: 'branch-mapping', tier: 5, cat: 'branch', name: nm('麥卡托的航海圖', "Mercator's chart"), desc: nm('完成地圖與地理技能分支所有實驗的所有任務。', 'Complete every mission in Maps and Geographic Skills.'), check: function (c) { return c.branchDone['mapping']; } },
    { id: 'branch-gis', tier: 5, cat: 'branch', name: nm('史諾的霍亂地圖', "Snow's cholera map"), desc: nm('完成空間資訊科技分支所有實驗的所有任務。', 'Complete every mission in Geospatial Technology.'), check: function (c) { return c.branchDone['gis']; } },
    { id: 'branch-climate', tier: 5, cat: 'branch', name: nm('柯本的氣候圖', "Köppen's climate map"), desc: nm('完成氣候與自然景觀分支所有實驗的所有任務。', 'Complete every mission in Climate and Natural Landscapes.'), check: function (c) { return c.branchDone['climate']; } },
    { id: 'branch-landform', tier: 5, cat: 'branch', name: nm('戴維斯的侵蝕輪迴', "Davis's cycle of erosion"), desc: nm('完成地形與水文分支所有實驗的所有任務。', 'Complete every mission in Landforms and Water.'), check: function (c) { return c.branchDone['landform']; } },
    { id: 'branch-population', tier: 5, cat: 'branch', name: nm('馬爾薩斯的人口論', "Malthus's essay on population"), desc: nm('完成人口與都市分支所有實驗的所有任務。', 'Complete every mission in Population and Cities.'), check: function (c) { return c.branchDone['population']; } },
    { id: 'branch-economy', tier: 5, cat: 'branch', name: nm('杜能的孤立國', "Von Thünen's isolated state"), desc: nm('完成產業、交通與全球化分支所有實驗的所有任務。', 'Complete every mission in Economy, Transport and Globalization.'), check: function (c) { return c.branchDone['economy']; } },
    { id: 'branch-tone', tier: 5, cat: 'branch', name: nm('亥姆霍茲的共鳴器', "Helmholtz's resonators"), desc: nm('完成樂音與聽覺分支所有實驗的所有任務。', 'Complete every mission in Musical Sound and Hearing.'), check: function (c) { return c.branchDone['tone']; } },
    { id: 'branch-tuning', tier: 5, cat: 'branch', name: nm('畢達哥拉斯的單弦琴', "Pythagoras's monochord"), desc: nm('完成音律與音階分支所有實驗的所有任務。', 'Complete every mission in Tuning and Scales.'), check: function (c) { return c.branchDone['tuning']; } },
    { id: 'branch-harmony', tier: 5, cat: 'branch', name: nm('拉摩的和聲學', "Rameau's treatise on harmony"), desc: nm('完成和聲分支所有實驗的所有任務。', 'Complete every mission in Harmony.'), check: function (c) { return c.branchDone['harmony']; } },
    { id: 'branch-instruments', tier: 5, cat: 'branch', name: nm('克拉尼的沙圖', "Chladni's sand figures"), desc: nm('完成樂器的科學分支所有實驗的所有任務。', 'Complete every mission in The Science of Instruments.'), check: function (c) { return c.branchDone['instruments']; } },
    { id: 'branch-rhythm', tier: 5, cat: 'branch', name: nm('梅爾策爾的節拍器', "Maelzel's metronome"), desc: nm('完成節奏與曲式分支所有實驗的所有任務。', 'Complete every mission in Rhythm and Form.'), check: function (c) { return c.branchDone['rhythm']; } },
    { id: 'branch-audio', tier: 5, cat: 'branch', name: nm('賽賓的音樂廳', "Sabine's concert hall"), desc: nm('完成空間、錄音與數位音樂分支所有實驗的所有任務。', 'Complete every mission in Rooms, Recording and Digital Music.'), check: function (c) { return c.branchDone['audio']; } },
    // ---------- 跨科：五個科目都要有 ----------
    { id: 'cross-visit', tier: 2, cat: 'cross', name: nm('博物學家的好奇心', "A naturalist's curiosity"), desc: nm('物理、化學、生物、地球科學、數學，五科都至少玩過一種實驗。', 'Try at least one experiment in each of the five subjects.'), check: function (c) { return c.subjVisited >= 5; } },
    { id: 'cross-mission', tier: 3, cat: 'cross', name: nm('文藝復興人', 'Renaissance mind'), desc: nm('五科都至少完成一個任務。', 'Complete at least one mission in each of the five subjects.'), check: function (c) { return c.subjMission >= 5; } },
    { id: 'cross-full', tier: 4, cat: 'cross', name: nm('達文西的筆記本', "Leonardo's notebooks"), desc: nm('五科都至少有一個實驗的任務全部完成。', 'Fully complete at least one experiment in each of the five subjects.'), check: function (c) { return c.subjFull >= 5; } },
    { id: 'cross-chapter', tier: 5, cat: 'cross', name: nm('亞里斯多德的百科', "Aristotle's encyclopedia"), desc: nm('五科都至少有一章的實驗全部完成。', 'Fully complete at least one chapter in each of the five subjects.'), check: function (c) { return c.subjChapter >= 5; } },
    { id: 'cross-branch', tier: 6, cat: 'cross', name: nm('洪堡的宇宙', "Humboldt's Cosmos"), desc: nm('五科都至少制霸一個分支。', 'Master at least one branch in each of the five subjects.'), check: function (c) { return c.subjBranch >= 5; } },
    { id: 'rank-100', tier: 3, cat: 'rank', name: nm('榜上有名', 'On the board'), desc: nm('進入排行榜前 100 名（至少 1 k 顆星）。', 'Reach the top 100 (with at least 1 k stars).'), check: function (c) { return c.rank > 0 && c.rank <= 100 && c.stars >= 1e3; } },
    { id: 'rank-10', tier: 5, cat: 'rank', name: nm('十大科學名人', 'Top ten scientists'), desc: nm('進入排行榜前 10 名（至少 1 M 顆星，且排行榜上至少 100 人）。', 'Reach the top 10 (with at least 1 M stars, among 100 or more players).'), check: function (c) { return c.rank > 0 && c.rank <= 10 && c.stars >= 1e6 && c.boardSize >= 100; } },
    { id: 'rank-1', tier: 6, cat: 'rank', name: nm('站上巔峰', 'Top of the world'), desc: nm('登上排行榜第 1 名（至少 1 G 顆星，且排行榜上至少 1,000 人）。', 'Reach number 1 (with at least 1 G stars, among 1,000 or more players).'), check: function (c) { return c.rank === 1 && c.stars >= 1e9 && c.boardSize >= 1000; } },
    // ---------- 每日任務與寶物 ----------
    { id: 'loot-first', tier: 1, cat: 'daily', name: nm('第一份寶物', 'First treasure'), desc: nm('第一次在每日任務中獲得寶物。', 'Win your first treasure from a daily mission.'), check: function (c) { return c.bagTotal > 0; } },
    { id: 'loot-diamond', tier: 4, cat: 'daily', name: nm('碳的極致', 'Carbon perfected'), desc: nm('獲得第一顆鑽石。', 'Find your first diamond.'), check: function (c) { return (c.bag.dia || 0) > 0; } },
    { id: 'loot-key', tier: 5, cat: 'daily', name: nm('祕境之鑰', 'Key to the hidden realm'), desc: nm('獲得第一把稀有鑰匙。', 'Find your first rare key.'), check: function (c) { return (c.bag.key || 0) > 0; } },
    { id: 'loot-all', tier: 5, cat: 'daily', name: nm('五寶齊聚', 'All five treasures'), desc: nm('銅幣、銀幣、金幣、鑽石、稀有鑰匙都至少擁有一個。', 'Own at least one copper, silver and gold coin, diamond and rare key.'), check: function (c) { return ['cu', 'ag', 'au', 'dia', 'key'].every(function (k) { return (c.bag[k] || 0) > 0; }); } },
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
    { id: 'secret-k', tier: 6, cat: 'secret', hidden: true, name: nm('三力交會', 'Where three forces meet'), riddle: nm('三種不同的語言，在同一天被你說出。', 'Three different languages, all spoken by you in a single day.'), check: function (c) { return c.maxDayBranches >= 3; } },
    { id: 'secret-l', tier: 6, cat: 'secret', hidden: true, name: nm('五賢會談', 'A meeting of five sages'), riddle: nm('一天之內，和五位先賢各說上一句話。', 'In a single day, a word with each of five sages.'), check: function (c) { return c.maxDaySubjects >= 5; } }
  ];
  // 分支制霸歸到各科；各科排行榜成就（門檻依該科目前全部任務的星星總數，實驗越多門檻越高）
  LIST.forEach(function (a) { if (a.cat === 'branch') { a.branch = a.id.replace(/^branch-/, ''); a.subj = BRANCH_SUBJ[a.branch]; } });
  SUBJ.forEach(function (sb) {
    const id = sb.id;
    const need = function (c, f) { const b = c.by[id]; return b.totalStars > 0 && b.stars >= Math.ceil(f * b.totalStars); };
    LIST.push(
      { id: id + '-rank-100', tier: 3, cat: 'rank', subj: id, name: nm(sb.short + '榜上有名', 'On the ' + sb.en + ' board'),
        desc: nm('進入' + sb.zh + '排行榜前 100 名（至少拿到' + sb.zh + '全部星星的 10%）。', 'Reach the ' + sb.en + ' top 100 (with at least 10% of all ' + sb.en + ' stars).'),
        check: function (c) { const b = c.by[id]; return b.rank > 0 && b.rank <= 100 && need(c, 0.1); } },
      { id: id + '-rank-10', tier: 5, cat: 'rank', subj: id, name: nm(sb.short + '十傑', 'Top ten in ' + sb.en),
        desc: nm('進入' + sb.zh + '排行榜前 10 名（至少拿到' + sb.zh + '全部星星的 40%，且該科排行榜上至少 50 人）。', 'Reach the ' + sb.en + ' top 10 (with at least 40% of all ' + sb.en + ' stars, among 50 or more players).'),
        check: function (c) { const b = c.by[id]; return b.rank > 0 && b.rank <= 10 && need(c, 0.4) && b.board >= 50; } },
      { id: id + '-rank-1', tier: 6, cat: 'rank', subj: id, name: nm(sb.short + '之巔', 'Summit of ' + sb.en),
        desc: nm('登上' + sb.zh + '排行榜第 1 名（至少拿到' + sb.zh + '全部星星的 70%，且該科排行榜上至少 100 人）。', 'Reach number 1 in ' + sb.en + ' (with at least 70% of all ' + sb.en + ' stars, among 100 or more players).'),
        check: function (c) { const b = c.by[id]; return b.rank === 1 && need(c, 0.7) && b.board >= 100; } }
    );
  });
  function isPrime(x) { if (x < 2 || x % 2 === 0) return x === 2; for (let i = 3; i * i <= x; i += 2) if (x % i === 0) return false; return true; }

  // ---------- 狀態 ----------
  let api = null, uid = null, rank = 0, boardSize = 0;
  const rankBy = {}, boardBy = {};
  const me = { stats: { ops: 0, seconds: 0, comments: 0, modules: {}, days: {}, flags: {} }, got: {}, bag: {}, loaded: false };
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
    const branchDone = {}, branchLive = {};
    let branchTotal = 0, branchFullN = 0;
    const isFull = function (m) { return !!(all[m] && all[m].length && all[m].every(function (x) { return done[x.id]; })); };
    const hasMissions = function (m) { return !!(all[m] && all[m].length); };
    Object.keys(BRANCH_SUBJ).forEach(function (b) {
      const liveIn = live().filter(function (m) { return branchOf(m) === b; });
      branchLive[b] = liveIn.length > 0;
      const ready = liveIn.length > 0 && liveIn.every(hasMissions);
      branchDone[b] = ready && branchFull[b] === liveIn.length;
      if (ready) { branchTotal++; if (branchDone[b]) branchFullN++; }
    });
    // 章制霸：首頁每一章（js/chapter-map.js）的已上線實驗都有任務，且全部完成
    let chapterTotal = 0, chapterFull = 0;
    const chapBy = {};
    (window.LAB_CHAPTERS || []).forEach(function (ch) {
      const liveIn = ch.m.filter(function (m) { return live().indexOf(m) >= 0; });
      if (!liveIn.length || !liveIn.every(hasMissions)) return;
      const ok = liveIn.every(isFull), sj = BRANCH_SUBJ[ch.b] || subjOf(liveIn[0]);
      chapterTotal++; if (ok) chapterFull++;
      const cb = chapBy[sj] = chapBy[sj] || { n: 0, full: 0 };
      cb.n++; if (ok) cb.full++;
    });
    // 同一天完成任務涵蓋幾個分支、幾個科目
    const dayBranches = {}, daySubjects = {};
    ids.forEach(function (id) {
      const at = done[id].at;
      const mod = id.replace(/-(h?\d+)$/, '');
      const b = branchOf(mod);
      if (typeof at === 'number' && b) {
        const k = dayKey(new Date(at));
        (dayBranches[k] = dayBranches[k] || {})[b] = true;
        (daySubjects[k] = daySubjects[k] || {})[subjOf(mod)] = true;
      }
    });
    let maxDayBranches = 0, maxDaySubjects = 0;
    Object.keys(dayBranches).forEach(function (k) { maxDayBranches = Math.max(maxDayBranches, Object.keys(dayBranches[k]).length); });
    Object.keys(daySubjects).forEach(function (k) { maxDaySubjects = Math.max(maxDaySubjects, Object.keys(daySubjects[k]).length); });
    const mods = s.modules || {};
    // 各科：星星、任務數、可得星星總數、已上線與玩過的實驗、全部完成的實驗、章、分支、名次
    const by = {};
    SUBJ.forEach(function (sb) {
      const cb = chapBy[sb.id] || { n: 0, full: 0 };
      by[sb.id] = { stars: 0, missions: 0, totalStars: 0, live: 0, visited: 0, moduleTotal: 0, full: 0, chapters: cb.n, chapFull: cb.full,
        branchDone: Object.keys(BRANCH_SUBJ).filter(function (b) { return BRANCH_SUBJ[b] === sb.id && branchDone[b]; }).length,
        rank: rankBy[sb.id] || 0, board: boardBy[sb.id] || 0 };
    });
    Object.keys(all).forEach(function (k) {
      const list = all[k], b = by[subjOf(k)];
      if (!list.length || !b) return;
      b.moduleTotal++;
      if (list.every(function (m) { return done[m.id]; })) b.full++;
      list.forEach(function (m) { b.totalStars += LM.starsOf ? LM.starsOf(m) : m.level; });
    });
    ids.forEach(function (id) { const b = by[subjOf(id.replace(/-(h?\d+)$/, ''))]; if (b) { b.stars += done[id].stars || 0; b.missions++; } });
    live().forEach(function (m) { const b = by[subjOf(m)]; if (b) { b.live++; if (mods[m]) b.visited++; } });
    const bag = me.bag || {};
    let maxDay = 0;
    Object.keys(s.days || {}).forEach(function (k) { maxDay = Math.max(maxDay, Object.keys(s.days[k] || {}).length); });
    return {
      ops: s.ops || 0, seconds: s.seconds || 0, comments: s.comments || 0, modules: Object.keys(mods).length, flags: s.flags || {},
      liveCount: live().length, liveVisited: live().filter(function (m) { return mods[m]; }).length,
      missions: ids.length, hiddenDone: hidden, hiddenTotal: hiddenTotal, fullModules: full, moduleTotal: moduleTotal,
      level10: l10, level10Total: l10Total, branchDone: branchDone, branchLive: branchLive, maxDayBranches: maxDayBranches, maxDaySubjects: maxDaySubjects,
      chapterTotal: chapterTotal, chapterFull: chapterFull, branchTotal: branchTotal, branchFull: branchFullN,
      subjVisited: CROSS5.filter(function (id) { return by[id] && by[id].visited > 0; }).length,
      subjMission: CROSS5.filter(function (id) { return by[id] && by[id].missions > 0; }).length,
      subjFull: CROSS5.filter(function (id) { return by[id] && by[id].full > 0; }).length,
      subjChapter: CROSS5.filter(function (id) { return by[id] && by[id].chapFull > 0; }).length,
      subjBranch: CROSS5.filter(function (id) { return by[id] && by[id].branchDone > 0; }).length,
      stars: ids.reduce(function (a, id) { return a + (done[id].stars || 0); }, 0),
      nickname: st.nickname, streak: streak(s.days || {}), totalDays: Object.keys(s.days || {}).length,
      longestGap: longestGap(s.days || {}), maxDayModules: maxDay, lastDone: lastDone, rank: rank, boardSize: boardSize,
      by: by, bag: bag, bagTotal: ['cu', 'ag', 'au', 'dia', 'key'].reduce(function (a, k) { return a + (bag[k] || 0); }, 0)
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
  window.addEventListener('lab:loot', function (e) { if (uid && e.detail && e.detail.bag) { me.bag = e.detail.bag; evaluate(); } });
  LM.on('complete', function () {
    const d = new Date();
    lastDone = { minute: d.getMinutes(), hour: d.getHours() };
    evaluate();
  });

  function load() {
    if (!api || !uid) return;
    Promise.all([api.get('userStats/' + uid).catch(function () { return null; }), api.get('achievements/' + uid).catch(function () { return null; }),
      api.get('bag/' + uid).catch(function () { return null; })]).then(function (r) {
      const s = r[0] || {};
      me.stats = { ops: s.ops || 0, seconds: s.seconds || 0, comments: s.comments || 0, modules: s.modules || {}, days: s.days || {}, flags: s.flags || {} };
      me.got = r[1] || {};
      me.bag = r[2] || {};
      me.loaded = true;
      record();
      renderers.forEach(function (f) { f(); });
    });
  }

  // ---------- 解鎖提示 ----------
  const BADGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z"/><path d="M7.5 15.5L6 22l6-3 6 3-1.5-6.5" opacity=".6"/></svg>';
  // 同時解鎖很多個時排隊：手機寬度一次只顯示 1 張、寬螢幕最多 3 張，不蓋住畫布與按鈕（試玩回報：390 px 一次跳出 6 張）
  const toastWait = [];
  let toastLive = 0;
  function toast(n) {
    const max = window.innerWidth <= 600 ? 1 : 3;
    if (toastLive >= max) { toastWait.push(n); return; }
    toastLive++;
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
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () {
        t.remove();
        toastLive--;
        if (toastWait.length) toast(toastWait.shift());
      }, 400);
    }, toastWait.length ? 2600 : 3400);
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
  // 分頁：'all' = 全科成就（沒有科目的），其他 = 該科的成就；該科還沒有實驗時不列入
  function inTab(x, tab) { return tab === 'all' ? !x.subj : x.subj === tab; }
  // 分支成就要等該分支有已上線的實驗才列出（例如有機化學還沒有實驗時不顯示）；已解鎖的照樣顯示
  function avail(x, c) {
    if (x.subj && !(c.by[x.subj] && c.by[x.subj].live)) return false;
    return !x.branch || !!c.branchLive[x.branch] || !!me.got[x.id];
  }
  function totals(c, tab) {
    let got = 0, all = 0;
    SERIES.forEach(function (sr) { if (!inTab(sr, tab)) return; all += levelsOf(sr, c); got += Math.min(levelOf(sr, c), levelsOf(sr, c)); });
    LIST.forEach(function (a) { if (!inTab(a, tab) || !avail(a, c)) return; all++; if (me.got[a.id]) got++; });
    return { got: got, all: all };
  }
  let acTab = 'all';
  try { acTab = sessionStorage.getItem('ac-tab') || 'all'; } catch (e) { /* 忽略 */ }
  function renderInto(box) {
    const draw = function () {
      box.innerHTML = '';
      if (!uid) { box.appendChild(el('p', 'lb-note', T('登入 Google 帳號後才能收集成就。', 'Sign in with Google to collect achievements.'))); return; }
      if (!me.loaded) { box.appendChild(el('p', 'lb-note', T('載入中…', 'Loading…'))); return; }
      const c = context();
      // 分頁：全科、物理、化學、生物、地球科學、數學（新科等第一個實驗上線才出現）
      const tabs = el('div', 'sb-tabs');
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', T('成就分類', 'Achievement categories'));
      [{ id: 'all', zh: '全科', en: 'All subjects' }].concat(SUBJ.filter(function (sb) { return shownSubj(sb.id); })).forEach(function (sb) {
        const t2 = totals(c, sb.id);
        const b = el('button', 'sb-tab sb-' + sb.id);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(acTab === sb.id));
        b.appendChild(el('span', null, T(sb.zh, sb.en)));
        b.appendChild(el('span', 'sb-n', t2.all ? t2.got.toLocaleString() + '/' + t2.all.toLocaleString() : T('製作中', 'soon')));
        b.addEventListener('click', function () {
          acTab = sb.id;
          try { sessionStorage.setItem('ac-tab', acTab); } catch (e) { /* 忽略 */ }
          draw();
          const again = box.querySelector('.sb-tab.sb-' + sb.id);
          if (again) again.focus();
        });
        tabs.appendChild(b);
      });
      box.appendChild(tabs);
      if (acTab !== 'all' && !(c.by[acTab] && c.by[acTab].live)) {
        const sb = SUBJ.filter(function (x) { return x.id === acTab; })[0] || SUBJ[0];
        box.appendChild(el('p', 'sb-soon', T(sb.zh + '的實驗製作中，上線後就能收集' + sb.zh + '的成就。', sb.en + ' experiments are on the way — their achievements unlock once they go live.')));
        return;
      }
      const tt = totals(c, acTab);
      box.appendChild(el('p', 'lb-note', T('已解鎖 ', 'Unlocked ') + tt.got.toLocaleString() + ' / ' + tt.all.toLocaleString() +
        T('　星星、操作、任務、解謎、大師任務以數量級遞增（1、2…9、10、20…，直到 k、M、G、T）；時間與天數類為級數遞增（第 k 級 = 基數 × (1 + 2 + … + k)）。色彩：銅、銀、金、紫晶、鑽石、傳說。',
          ' · Stars, interactions, missions, riddles and master missions climb by orders of magnitude (1, 2 … 9, 10, 20 … up to k, M, G, T); time and day series grow as a series (level k = base × (1 + 2 + … + k)). Colours: bronze, silver, gold, amethyst, diamond, legend.')));
      CATS.forEach(function (cat) {
        const sec = el('div', 'ac-cat');
        const grid = el('div', 'ac-grid');
        if (cat[0] === 'series') {
          sec.appendChild(el('h3', null, L(cat[1])));
          SERIES.forEach(function (sr) {
            if (!inTab(sr, acTab)) return;
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
          const items = LIST.filter(function (a) { return a.cat === cat[0] && inTab(a, acTab) && avail(a, c); });
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
      if (acTab === 'all') box.appendChild(el('p', 'lb-note ac-stats', T('我的累計：操作 ', 'My totals: ') + c.ops.toLocaleString() + T(' 次・操作時間 ', ' interactions · ') +
        fmtVal({ time: true }, c.seconds) + T('・玩過 ', ' · ') + c.modules + T(' 種實驗・連續 ', ' experiments · streak ') + c.streak + T(' 天・累計 ', ' days · ') + c.totalDays + T(' 天', ' days in total')));
    };
    renderers.push(draw);
    draw();
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  window.LabAchievements = {
    list: LIST, series: SERIES, renderInto: renderInto, si: si, _me: me,
    // subj 省略：全科名次；否則是該科名次
    setRank: function (r, size, subj) {
      if (subj) { rankBy[subj] = r || 0; boardBy[subj] = size || 0; } else { rank = r || 0; boardSize = size || 0; }
      evaluate();
    },
    subjects: SUBJ
  };

  // ---------- 啟動 ----------
  Promise.resolve(LM._ready()).then(function (a) {
    api = a;
    if (!api) return;
    LM.on('ready', function () { if (uid) record(); });
    api.onAuth(function (user) {
      uid = user ? user.uid : null;
      me.loaded = false;
      me.got = {};
      renderers.forEach(function (f) { f(); });
      if (!uid) return;
      const u = uid;
      listReady().then(function () { if (uid === u) load(); });
    });
  });
  // 打開任務模式時記錄（成就「接下挑戰」）
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('.ms-toggle')) setTimeout(function () { if (uid && st.on) record(); }, 50);
  }, true);
})();
