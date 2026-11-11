/*
 * achievements.js — 成就系統（需登入 Google 帳號）
 *
 * 由 missions.js 自動載入。登入後：
 *   - 記錄個人累計：操作次數、操作時間（來自 stats.js 的 lab:statsflush 事件）、玩過哪些實驗、每天玩過哪些實驗、特殊旗標。
 *   - 依累計資料、完成的任務與星星數判定成就；解鎖時跳出提示並寫入資料庫（每個成就只解鎖一次）。
 * 成就是收藏用的徽章，不加星星（星星只能靠任務取得）。
 * 隱藏成就只顯示一句謎語；解鎖後顯示名稱，但不說明條件。
 * 資料：userStats/<uid>/{ops, seconds, modules/<模組>, days/<YYYYMMDD>/<模組>, flags/<旗標>}、achievements/<uid>/<成就>
 */
(function () {
  'use strict';
  const LM = window.LabMission;
  if (!LM || window.LabAchievements) return;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const L = function (o) { return o ? T(o.zh, o.en || o.zh) : ''; };
  const st = LM._state;

  // ---------- 全站已上線的實驗清單（js/missions/index.js） ----------
  function liveModules() { return window.LAB_LIVE_MODULES || []; }
  const listReady = window.LAB_LIVE_MODULES ? Promise.resolve() : new Promise(function (resolve) {
    const s = document.createElement('script');
    const self = document.querySelector('script[src*="achievements.js"]');
    s.src = self ? self.getAttribute('src').replace(/achievements\.js/, 'missions/index.js') : 'js/missions/index.js';
    s.onload = s.onerror = resolve;
    document.body.appendChild(s);
  });

  // ---------- 成就定義 ----------
  // check(c)：c = { ops, seconds, modules, days, flags, missions, hiddenDone, stars, complete, nickname, liveCount, perModule, lastDone }
  function tiered(id, n, name, desc, test, tier) { return { id: id, tier: tier, name: name, desc: desc, check: test }; }
  const LIST = [
    { id: 'hello', tier: 1, name: { zh: '初來乍到', en: 'Hello, lab!' }, desc: { zh: '登入並取好暱稱。', en: 'Sign in and choose a nickname.' }, check: function (c) { return !!c.nickname; } },
    tiered('explore-3', 3, { zh: '好奇寶寶', en: 'Curious mind' }, { zh: '玩過 3 種實驗。', en: 'Try 3 different experiments.' }, function (c) { return c.modules >= 3; }, 1),
    tiered('explore-6', 6, { zh: '實驗室常客', en: 'Lab regular' }, { zh: '玩過 6 種實驗。', en: 'Try 6 different experiments.' }, function (c) { return c.modules >= 6; }, 2),
    tiered('explore-all', 0, { zh: '全能物理學家', en: 'All-round physicist' }, { zh: '玩過網站上所有的實驗。', en: 'Try every experiment on the site.' }, function (c) { return c.liveCount > 0 && c.liveVisited >= c.liveCount; }, 3),
    tiered('ops-100', 0, { zh: '動手做', en: 'Hands on' }, { zh: '累計操作 100 次。', en: 'Make 100 interactions.' }, function (c) { return c.ops >= 100; }, 1),
    tiered('ops-1000', 0, { zh: '熟能生巧', en: 'Practice makes perfect' }, { zh: '累計操作 1,000 次。', en: 'Make 1,000 interactions.' }, function (c) { return c.ops >= 1000; }, 2),
    tiered('ops-10000', 0, { zh: '萬次實驗者', en: 'Ten thousand trials' }, { zh: '累計操作 10,000 次。', en: 'Make 10,000 interactions.' }, function (c) { return c.ops >= 10000; }, 3),
    tiered('time-10m', 0, { zh: '專注十分鐘', en: 'Ten focused minutes' }, { zh: '累計操作時間 10 分鐘。', en: 'Spend 10 minutes experimenting.' }, function (c) { return c.seconds >= 600; }, 1),
    tiered('time-1h', 0, { zh: '一小時的探索', en: 'An hour of discovery' }, { zh: '累計操作時間 1 小時。', en: 'Spend 1 hour experimenting.' }, function (c) { return c.seconds >= 3600; }, 2),
    tiered('time-10h', 0, { zh: '十小時的物理人', en: 'Ten-hour physicist' }, { zh: '累計操作時間 10 小時。', en: 'Spend 10 hours experimenting.' }, function (c) { return c.seconds >= 36000; }, 3),
    tiered('mission-1', 0, { zh: '任務新手', en: 'First mission' }, { zh: '完成 1 個任務。', en: 'Complete 1 mission.' }, function (c) { return c.missions >= 1; }, 1),
    tiered('mission-10', 0, { zh: '任務達人', en: 'Mission expert' }, { zh: '完成 10 個任務。', en: 'Complete 10 missions.' }, function (c) { return c.missions >= 10; }, 2),
    tiered('mission-30', 0, { zh: '任務大師', en: 'Mission master' }, { zh: '完成 30 個任務。', en: 'Complete 30 missions.' }, function (c) { return c.missions >= 30; }, 3),
    tiered('stars-10', 0, { zh: '第一把星光', en: 'A handful of starlight' }, { zh: '累積 10 顆倪的星星。', en: 'Collect 10 Ni stars.' }, function (c) { return c.stars >= 10; }, 1),
    tiered('stars-50', 0, { zh: '星光閃耀', en: 'Shining bright' }, { zh: '累積 50 顆倪的星星。', en: 'Collect 50 Ni stars.' }, function (c) { return c.stars >= 50; }, 2),
    tiered('stars-100', 0, { zh: '百星之人', en: 'Hundred-star scholar' }, { zh: '累積 100 顆倪的星星。', en: 'Collect 100 Ni stars.' }, function (c) { return c.stars >= 100; }, 3),
    tiered('stars-300', 0, { zh: '銀河收藏家', en: 'Galaxy collector' }, { zh: '累積 300 顆倪的星星。', en: 'Collect 300 Ni stars.' }, function (c) { return c.stars >= 300; }, 4),
    tiered('hidden-1', 0, { zh: '秘密發現者', en: 'Secret finder' }, { zh: '完成 1 個隱藏任務。', en: 'Complete 1 hidden mission.' }, function (c) { return c.hiddenDone >= 1; }, 2),
    tiered('hidden-5', 0, { zh: '解謎高手', en: 'Riddle master' }, { zh: '完成 5 個隱藏任務。', en: 'Complete 5 hidden missions.' }, function (c) { return c.hiddenDone >= 5; }, 3),
    tiered('complete-module', 0, { zh: '全制霸', en: 'Clean sweep' }, { zh: '完成某一個實驗的所有任務（含隱藏任務）。', en: 'Complete every mission of one experiment, hidden ones included.' }, function (c) { return c.fullModules >= 1; }, 3),
    tiered('streak-3', 0, { zh: '三日不懈', en: 'Three days running' }, { zh: '連續 3 天都有做實驗。', en: 'Experiment on 3 days in a row.' }, function (c) { return c.streak >= 3; }, 2),
    tiered('streak-7', 0, { zh: '一週不間斷', en: 'A week without a break' }, { zh: '連續 7 天都有做實驗。', en: 'Experiment on 7 days in a row.' }, function (c) { return c.streak >= 7; }, 3),
    // ---------- 隱藏成就：只有謎語 ----------
    { id: 'secret-a', tier: 3, hidden: true, name: { zh: '守夜人', en: 'Night watch' }, riddle: { zh: '月亮也還沒睡。', en: 'Even the Moon is still awake.' }, check: function (c) { return !!c.flags.night; } },
    { id: 'secret-b', tier: 3, hidden: true, name: { zh: '晨光', en: 'First light' }, riddle: { zh: '比太陽更早醒來。', en: 'Awake before the Sun.' }, check: function (c) { return !!c.flags.dawn; } },
    { id: 'secret-c', tier: 2, hidden: true, name: { zh: '世界公民', en: 'Citizen of the world' }, riddle: { zh: '換一種語言看世界。', en: 'See the world in other words.' }, check: function (c) { return !!c.flags.lang; } },
    { id: 'secret-d', tier: 3, hidden: true, name: { zh: '周遊列國', en: 'Grand tour' }, riddle: { zh: '一天之內，走遍天下。', en: 'The whole world in a single day.' }, check: function (c) { return c.maxDayModules >= 5; } },
    { id: 'secret-e', tier: 4, hidden: true, name: { zh: '終極答案', en: 'The ultimate answer' }, riddle: { zh: '生命、宇宙以及一切。', en: 'Life, the universe and everything.' }, check: function (c) { return c.stars === 6 * 7; } },
    { id: 'secret-f', tier: 4, hidden: true, name: { zh: '整點報時', en: 'On the hour' }, riddle: { zh: '鐘聲響起的那一刻。', en: 'The moment the bell rings.' }, check: function (c) { return !!c.lastDone && c.lastDone.minute === 0; } }
  ];

  // ---------- 狀態 ----------
  let api = null, uid = null;
  const me = { stats: { ops: 0, seconds: 0, modules: {}, days: {}, flags: {} }, got: {}, loaded: false };
  let lastDone = null;
  const renderers = [];

  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }
  function streak(days) {
    let n = 0;
    const d = new Date();
    if (!days[dayKey(d)]) d.setDate(d.getDate() - 1); // 今天還沒玩也不中斷
    while (days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function context() {
    const s = me.stats, all = LM.all();
    const done = st.done || {};
    const ids = Object.keys(done);
    let hidden = 0, full = 0;
    Object.keys(all).forEach(function (k) {
      const list = all[k];
      if (list.length && list.every(function (m) { return done[m.id]; })) full++;
    });
    ids.forEach(function (id) { if (/-h\d+$/.test(id)) hidden++; });
    const live = liveModules();
    const mods = s.modules || {};
    let maxDay = 0;
    Object.keys(s.days || {}).forEach(function (k) { maxDay = Math.max(maxDay, Object.keys(s.days[k] || {}).length); });
    return {
      ops: s.ops || 0, seconds: s.seconds || 0, modules: Object.keys(mods).length, flags: s.flags || {},
      liveCount: live.length, liveVisited: live.filter(function (m) { return mods[m]; }).length,
      missions: ids.length, hiddenDone: hidden, fullModules: full,
      stars: ids.reduce(function (a, id) { return a + (done[id].stars || 0); }, 0),
      nickname: st.nickname, streak: streak(s.days || {}), maxDayModules: maxDay, lastDone: lastDone
    };
  }

  // ---------- 判定與解鎖 ----------
  let evaluating = false;
  function evaluate() {
    if (!api || !uid || !me.loaded || !st.ready || evaluating) return;
    const c = context();
    const fresh = LIST.filter(function (a) { return !me.got[a.id] && safe(a, c); });
    if (!fresh.length) return;
    evaluating = true;
    const map = {};
    fresh.forEach(function (a) { map['achievements/' + uid + '/' + a.id] = { at: api.now() }; });
    api.update(map).then(function () {
      fresh.forEach(function (a, i) { me.got[a.id] = { at: Date.now() }; setTimeout(function () { toast(a); }, i * 900); });
      renderers.forEach(function (f) { f(); });
    }).catch(function () { /* 下次再試 */ }).then(function () { evaluating = false; });
  }
  function safe(a, c) { try { return !!a.check(c); } catch (e) { return false; } }

  // ---------- 累計資料 ----------
  function record(extra) {
    if (!api || !uid) return;
    const map = {};
    const mod = LM.module;
    const today = dayKey();
    if (mod) {
      if (!me.stats.modules[mod]) { me.stats.modules[mod] = true; map['userStats/' + uid + '/modules/' + mod] = true; }
      me.stats.days[today] = me.stats.days[today] || {};
      if (!me.stats.days[today][mod]) { me.stats.days[today][mod] = true; map['userStats/' + uid + '/days/' + today + '/' + mod] = true; }
    }
    const h = new Date().getHours();
    const flag = function (k, on) { if (on && !me.stats.flags[k]) { me.stats.flags[k] = true; map['userStats/' + uid + '/flags/' + k] = true; } };
    flag('night', mod && (h >= 23 || h < 4));
    flag('dawn', mod && h >= 4 && h < 6);
    flag('lang', window.LabSettings && window.LabSettings.lang !== 'zh-Hant');
    if (extra) {
      if (extra.ops) { me.stats.ops += extra.ops; map['userStats/' + uid + '/ops'] = api.inc(extra.ops); }
      if (extra.seconds) { me.stats.seconds += extra.seconds; map['userStats/' + uid + '/seconds'] = api.inc(extra.seconds); }
    }
    if (!Object.keys(map).length) { evaluate(); return; }
    api.update(map).catch(function () { /* 忽略 */ }).then(evaluate);
  }

  window.addEventListener('lab:statsflush', function (e) {
    const d = e.detail || {};
    if (!uid) return;
    record({ ops: Math.min(300, d.ops || 0), seconds: Math.min(180, d.seconds || 0) });
  });

  LM.on('complete', function () {
    const d = new Date();
    lastDone = { minute: d.getMinutes(), hour: d.getHours() };
    evaluate();
  });

  function load() {
    if (!api || !uid) return;
    Promise.all([api.get('userStats/' + uid).catch(function () { return null; }), api.get('achievements/' + uid).catch(function () { return null; })]).then(function (r) {
      const s = r[0] || {};
      me.stats = { ops: s.ops || 0, seconds: s.seconds || 0, modules: s.modules || {}, days: s.days || {}, flags: s.flags || {} };
      me.got = r[1] || {};
      me.loaded = true;
      record();
      renderers.forEach(function (f) { f(); });
    });
  }

  // ---------- 解鎖提示 ----------
  const BADGE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4 7.2 16.9l.9-5.4L4.2 7.7l5.4-.8z"/><path d="M7.5 15.5L6 22l6-3 6 3-1.5-6.5" opacity=".6"/></svg>';
  function toast(a) {
    const t = document.createElement('div');
    t.className = 'ac-toast tier' + (a.tier || 1);
    t.setAttribute('role', 'status');
    t.innerHTML = '<span class="ac-ico">' + BADGE + '</span>';
    const tx = document.createElement('span');
    tx.className = 'ac-tx';
    const h = document.createElement('strong');
    h.textContent = a.hidden ? T('隱藏成就解鎖！', 'Hidden achievement unlocked!') : T('成就解鎖！', 'Achievement unlocked!');
    const n = document.createElement('span');
    n.textContent = L(a.name);
    tx.appendChild(h); tx.appendChild(n);
    t.appendChild(tx);
    let box = document.getElementById('ac-toasts');
    if (!box) { box = document.createElement('div'); box.id = 'ac-toasts'; box.className = 'ac-toasts'; document.body.appendChild(box); }
    box.appendChild(t);
    const S = window.LabSound;
    if (S && S.enabled()) { S.tone({ freq: 1047, dur: 0.12, gain: 0.4 }); S.tone({ freq: 1568, dur: 0.18, gain: 0.35, delay: 0.1 }); }
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 3200);
  }

  // ---------- 我的成就（排行榜頁） ----------
  function renderInto(box) {
    const draw = function () {
      box.innerHTML = '';
      if (!uid) { box.appendChild(el('p', 'lb-note', T('登入 Google 帳號後才能收集成就。', 'Sign in with Google to collect achievements.'))); return; }
      if (!me.loaded) { box.appendChild(el('p', 'lb-note', T('載入中…', 'Loading…'))); return; }
      const got = LIST.filter(function (a) { return me.got[a.id]; }).length;
      box.appendChild(el('p', 'lb-note', T('已解鎖 ', 'Unlocked ') + got + ' / ' + LIST.length + T('　（隱藏成就解鎖前只顯示謎語）', ' (hidden ones show only a riddle until unlocked)')));
      const grid = el('div', 'ac-grid');
      LIST.forEach(function (a) {
        const on = !!me.got[a.id];
        const card = el('div', 'ac-card tier' + (a.tier || 1) + (on ? ' on' : '') + (a.hidden ? ' secret' : ''));
        const ico = el('span', 'ac-ico');
        ico.innerHTML = BADGE;
        card.appendChild(ico);
        const tx = el('div', 'ac-tx');
        tx.appendChild(el('strong', null, a.hidden && !on ? '？？？' : L(a.name)));
        tx.appendChild(el('span', null, a.hidden ? '「' + L(a.riddle) + '」' : L(a.desc)));
        card.appendChild(tx);
        grid.appendChild(card);
      });
      box.appendChild(grid);
      const c = context();
      box.appendChild(el('p', 'lb-note ac-stats', T('我的累計：操作 ', 'My totals: ') + (c.ops).toLocaleString() + T(' 次・操作時間 ', ' interactions · ') + fmtTime(c.seconds) + T('・玩過 ', ' · ') + c.modules + T(' 種實驗・連續 ', ' experiments · streak ') + c.streak + T(' 天', ' days')));
    };
    renderers.push(draw);
    draw();
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function fmtTime(sec) {
    const m = Math.floor(sec / 60), h = Math.floor(m / 60);
    return h ? h + T(' 小時 ', ' h ') + (m % 60) + T(' 分', ' min') : m + T(' 分', ' min');
  }

  window.LabAchievements = { list: LIST, renderInto: renderInto, _me: me };

  // ---------- 啟動 ----------
  Promise.all([LM._ready(), listReady]).then(function (r) {
    api = r[0];
    if (!api) return;
    LM.on('ready', function () { if (uid) { record(); } });
    api.onAuth(function (user) {
      uid = user ? user.uid : null;
      me.loaded = false;
      me.got = {};
      renderers.forEach(function (f) { f(); });
      if (uid) load();
    });
  });
  document.dispatchEvent(new Event('lab:achievements-ready'));
})();
