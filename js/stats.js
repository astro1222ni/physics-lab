/*
 * stats.js — 瀏覽人次、操作次數、累計操作時間
 *
 * 只累計匿名的數字，不收集任何個人資料。資料存放在 Firebase Realtime Database，
 * 透過 REST API 以「伺服器端遞增」寫入，多人同時使用也不會互相覆蓋。
 *
 * 用法：
 *   模組頁面  <script src="js/stats.js" data-module="electric-field"></script>
 *   首頁      <script src="js/stats.js" data-summary></script>
 *             並在各模組卡片加上 data-module="…"，會顯示該模組的數字。
 *
 * 計算方式：
 *   瀏覽人次 ── 每載入一次模組頁面 +1
 *   操作次數 ── 拖曳畫布、放開滑桿、按按鈕、切換勾選，每個動作 +1
 *   操作時間 ── 頁面在前景，且最近 30 秒內有操作時才計時
 *   目前在線 ── 每分鐘一個計數器 /online/<分鐘>：開著（在前景）的分頁每分鐘在裡面加 1 一次
 *               （全站 n、各實驗 m/<代號>），顯示的是上一分鐘的數字。不含任何代號或個人資料；
 *               每個分頁每分鐘只讀一個數字，流量和人數成正比（舊做法要下載全站名單，和人數平方成正比）。
 *               每分鐘第一個寫入的人順手刪掉 10 分鐘前的計數器。首頁顯示全站，實驗頁顯示該實驗。
 *               資料庫規則還沒換成新版（寫入被拒）時，自動退回舊的 /presence 心跳做法。
 *
 * 寫入次數：每個分頁每分鐘在自己的時間點（隨機錯開）送出一次，統計數字和在線計數合成一筆；
 *           離開或切到背景時再把沒送出的統計補送。
 */
(function () {
  'use strict';

  // Firebase Realtime Database 網址來自 js/firebase-config.js；留空時統計功能停用，頁面照常運作。
  const DB_URL = (window.LAB_FIREBASE && window.LAB_FIREBASE.databaseURL) || '';

  const IDLE_LIMIT = 30;     // 秒：超過這段時間沒有操作就停止計時
  const REFRESH_EVERY = 120; // 秒：實驗頁多久從伺服器更新一次總數（本機累積的數字會即時加上去）
  const HOME_REFRESH = 300;  // 秒：首頁多久更新一次全站累計
  const ONLINE_WINDOW = 150; // 秒：舊做法：這段時間內有心跳就算在線
  const BEAT_EVERY = 60;     // 秒：舊做法：心跳間隔
  const ONLINE_EVERY = 60;   // 秒：舊做法：多久更新一次在線人數
  const KEEP_MINUTES = 10;   // 新做法：保留幾分鐘的在線計數器

  const script = document.currentScript;
  const db = (window.LAB_STATS_DB || DB_URL).replace(/\/+$/, '');
  if (!db || !script || !window.fetch) return;

  const moduleId = script.getAttribute('data-module');
  const isSummary = script.hasAttribute('data-summary');
  if (moduleId && !/^[a-z0-9-]{1,40}$/.test(moduleId)) return;

  // ---------- 格式 ----------
  const EN = window.LabSettings && window.LabSettings.lang === 'en';
  function fmtInt(n) { return Math.round(n || 0).toLocaleString(EN ? 'en-US' : 'zh-TW'); }
  function fmtTime(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + (EN ? ' s' : ' 秒');
    const m = Math.floor(sec / 60), h = Math.floor(m / 60);
    if (h === 0) return m + (EN ? ' min' : ' 分');
    if (h >= 100) return fmtInt(h) + (EN ? ' h' : ' 小時');
    return EN ? h + ' h ' + (m % 60) + ' min' : h + ' 小時 ' + (m % 60) + ' 分';
  }

  function bar(items, extraClass) {
    const el = document.createElement('div');
    el.className = 'stats-bar' + (extraClass ? ' ' + extraClass : '');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = items.map(function (it) {
      return '<span class="stat"><span class="stat-label">' + it[0] + '</span><span class="stat-value" data-k="' + it[1] + '">—</span></span>';
    }).join('') +
      // 目前在線：成功讀到人數後才顯示（資料庫規則尚未更新或連線失敗時保持隱藏）
      '<span class="stat stat-online" hidden><span class="stat-label"><span class="online-dot" aria-hidden="true"></span>' +
      (EN ? 'Online now' : '目前在線') + '</span><span class="stat-value" data-k="online">—</span></span>';
    return el;
  }
  function setOnline(el, n) {
    const item = el.querySelector('.stat-online');
    if (n == null) { item.hidden = true; return; }
    item.hidden = false;
    el.querySelector('[data-k="online"]').textContent = fmtInt(n) + (EN ? '' : ' 人');
  }
  // 瀏覽人次、操作次數用國際單位詞頭（站長 11/14：「改以前綴詞 k M G… 表示」）：
  // 1,000 以上寫 3.39 k、246 k、1.25 M（取三位有效數字、無條件捨去），滑鼠停留看完整數字。
  function fmtSI(n) {
    const x = Math.floor(n || 0);
    const P = [[1e15, 'P'], [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k']];
    for (let i = 0; i < P.length; i++) {
      if (x >= P[i][0]) {
        const v = x / P[i][0];
        const d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
        return (Math.floor(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + ' ' + P[i][1];
      }
    }
    return String(x);
  }
  function setCount(el, k, n) {
    const v = el.querySelector('[data-k="' + k + '"]');
    v.textContent = fmtSI(n);
    v.title = fmtInt(n);
  }
  function fill(el, s) {
    setCount(el, 'views', s.views);
    setCount(el, 'ops', s.ops);
    el.querySelector('[data-k="seconds"]').textContent = fmtTime(s.seconds);
  }
  const ITEMS = EN
    ? [['Views', 'views'], ['Interactions', 'ops'], ['Time spent', 'seconds']]
    : [['瀏覽人次', 'views'], ['操作次數', 'ops'], ['累計操作時間', 'seconds']];
  function insertAfterHeader(el) {
    const top = document.querySelector('header.top');
    if (top) top.insertAdjacentElement('afterend', el);
    else document.body.prepend(el);
  }

  function getJSON(path, query) {
    return fetch(db + path + '.json' + (query || ''), { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ======================= 目前在線人數 =======================
  const here = moduleId || 'home';
  let skew = 0; // 伺服器時間 − 本機時間（毫秒）：分鐘以伺服器時間為準
  function serverNow() { return Date.now() + skew; }
  function inc(n) { return { '.sv': { increment: n } }; }

  /** 對時：寫入共用的 /clock（伺服器填入現在時間），回應就是伺服器時間；同一分頁 30 分鐘內沿用 */
  function syncClock() {
    try {
      const c = JSON.parse(sessionStorage.getItem('lab-skew') || 'null');
      if (c && Math.abs(Date.now() - c.at) < 1800000 && isFinite(c.s)) { skew = c.s; return Promise.resolve(); }
    } catch (e) { /* 忽略 */ }
    const t0 = Date.now();
    return fetch(db + '/clock.json', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ '.sv': 'timestamp' })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (t) {
      if (typeof t !== 'number') return;
      const t1 = Date.now();
      skew = Math.round(t - (t0 + t1) / 2);
      try { sessionStorage.setItem('lab-skew', JSON.stringify({ s: skew, at: t1 })); } catch (e) { /* 忽略 */ }
    }).catch(function () { /* 對時失敗就用本機時間 */ });
  }

  // ---------- 舊做法（資料庫規則還沒換新版時才用）：每個分頁一個隨機代號的心跳 ----------
  let sid = null;
  try { sid = sessionStorage.getItem('lab-sid'); } catch (e) { /* 無法記錄時每頁一個新代號 */ }
  if (!sid || !/^[a-z0-9]{16}$/.test(sid)) {
    sid = '';
    for (let i = 0; i < 16; i++) sid += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36));
    try { sessionStorage.setItem('lab-sid', sid); } catch (e) { /* 忽略 */ }
  }
  const presence = db + '/presence/' + sid + '.json';
  function beat() {
    if (document.visibilityState !== 'visible') return Promise.resolve();
    return fetch(presence, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: { '.sv': 'timestamp' }, m: here })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      if (d && typeof d.t === 'number') skew = d.t - Date.now();
    }).catch(function () { /* 下次心跳再試 */ });
  }
  function leave() {
    try { fetch(presence, { method: 'DELETE', keepalive: true }).catch(function () {}); } catch (e) { /* 忽略 */ }
  }
  /** 舊做法的在線人數；onlyHere 時只算這個實驗 */
  function countOnline(onlyHere) {
    const cutoff = Math.floor(serverNow() - ONLINE_WINDOW * 1000);
    return getJSON('/presence', '?orderBy=' + encodeURIComponent('"t"') + '&startAt=' + cutoff).then(function (all) {
      all = all || {};
      return Object.keys(all).filter(function (k) { return !onlyHere || (all[k] && all[k].m === here); }).length;
    });
  }
  /** 舊做法：清掉超過 10 分鐘沒有心跳的代號（每次最多 50 個） */
  function sweepOld() {
    const old = Math.floor(serverNow() - 600000);
    getJSON('/presence', '?orderBy=' + encodeURIComponent('"t"') + '&endAt=' + old + '&limitToFirst=50').then(function (all) {
      const keys = Object.keys(all || {});
      if (!keys.length) return;
      const body = {};
      keys.forEach(function (k) { body[k] = null; });
      return fetch(db + '/presence.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }).catch(function () { /* 忽略 */ });
  }
  let legacyOn = false;
  function startLegacy(targetBar, onlyHere) {
    if (legacyOn) return;
    legacyOn = true;
    const show = function () {
      countOnline(onlyHere).then(function (n) { setOnline(targetBar, Math.max(n, document.visibilityState === 'visible' ? 1 : 0)); })
        .catch(function () { setOnline(targetBar, null); });
    };
    beat().then(function () { show(); if (Math.random() < 0.2) sweepOld(); });
    setTimeout(beat, 4000);
    setInterval(function () { if (document.visibilityState === 'visible') beat(); }, BEAT_EVERY * 1000);
    setInterval(function () { if (document.visibilityState === 'visible') show(); }, ONLINE_EVERY * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') leave();
      else beat().then(show);
    });
    window.addEventListener('pagehide', leave);
  }

  // ---------- 新做法：每分鐘一個計數器 ----------
  let onlineMode = 'new';     // 'new'：每分鐘計數器；'old'：退回舊心跳
  let onlineChecked = false;  // 新規則是否已經寫入成功過
  // 這個分頁在每分鐘的第幾秒送出，全站錯開（LAB_STATS_WRITE_AT 只給測試用）
  const writeAt = typeof window.LAB_STATS_WRITE_AT === 'number' ? window.LAB_STATS_WRITE_AT : 2 + Math.random() * 50;
  let lastWriteMin = -1, lastShowMin = -1, writing = false;
  let onlineBar = null, onlineOnlyHere = false;
  let extraParts = null; // 模組頁：() => { body, done(ok) }，把統計數字一起送出

  function showOnline() {
    if (onlineMode !== 'new' || !onlineBar) return;
    const prev = Math.floor(serverNow() / 60000) - 1;
    getJSON('/online/' + prev + (onlineOnlyHere ? '/m/' + here : '/n')).then(function (n) {
      if (onlineMode !== 'new') return;
      // 剛打開的分頁不在上一分鐘的數字裡；至少算自己一個
      setOnline(onlineBar, Math.max(+n || 0, document.visibilityState === 'visible' ? 1 : 0));
    }).catch(function () { setOnline(onlineBar, null); });
  }
  /** 刪掉 KEEP_MINUTES 分鐘以前的計數器（每分鐘由第一個寫入的人做） */
  function sweepBuckets(min) {
    getJSON('/online', '?orderBy=' + encodeURIComponent('"k"') + '&endAt=' + (min - KEEP_MINUTES) + '&limitToFirst=5').then(function (all) {
      const keys = Object.keys(all || {});
      if (!keys.length) return;
      const body = {};
      keys.forEach(function (k) { body[k] = null; });
      return fetch(db + '/online.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }).catch(function () { /* 忽略 */ });
  }
  /** 每分鐘一次：在線計數＋統計數字合成一筆寫入 */
  function minuteWrite(min, withOnline) {
    const body = {};
    let any = false;
    if (withOnline) {
      const b = 'online/' + min + '/';
      body[b + 'k'] = min; body[b + 'n'] = inc(1); body[b + 'm/' + here] = inc(1);
      any = true;
    }
    const extra = extraParts ? extraParts() : null;
    if (extra) { Object.keys(extra.body).forEach(function (k) { body[k] = extra.body[k]; any = true; }); }
    if (!any) return;
    writing = true;
    fetch(db + '/.json', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true
    }).then(function (r) {
      if (r.ok) {
        if (extra) extra.done(true);
        if (!withOnline) return;
        onlineChecked = true;
        return r.json().then(function (d) {
          const n = d && d['online/' + min + '/n'];
          if (n === 1 || Math.random() < 0.01) sweepBuckets(min);
        }).catch(function () { /* 忽略 */ });
      }
      // 規則拒絕（還沒貼新版規則、或本機時鐘差太多）：退回舊做法，統計數字單獨重送
      if (withOnline && !onlineChecked && (r.status === 400 || r.status === 401 || r.status === 403)) {
        onlineMode = 'old';
        if (extra) extra.done(false);
        writing = false;
        if (onlineBar) startLegacy(onlineBar, onlineOnlyHere);
        minuteWrite(min, false);
        return 'retried';
      }
      throw new Error('HTTP ' + r.status);
    }).catch(function () {
      if (extra) extra.done(false);
    }).then(function (x) { if (x !== 'retried') writing = false; });
  }
  function onlineTick() {
    if (document.visibilityState !== 'visible' || writing) return;
    const t = serverNow(), min = Math.floor(t / 60000), sec = (t % 60000) / 1000;
    if (min !== lastWriteMin && sec >= writeAt) { lastWriteMin = min; minuteWrite(min, onlineMode === 'new'); }
    if (onlineMode === 'new' && min !== lastShowMin && sec >= Math.min(writeAt + 3, 59)) { lastShowMin = min; showOnline(); }
  }
  function startPresence(targetBar, onlyHere) {
    onlineBar = targetBar; onlineOnlyHere = onlyHere;
    syncClock().then(function () {
      lastShowMin = Math.floor(serverNow() / 60000);
      showOnline();
      onlineTick();
      setInterval(onlineTick, 1000);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && onlineMode === 'new') showOnline();
    });
  }

  // ======================= 首頁：所有模組的累計 =======================
  if (isSummary) {
    const totalBar = bar(ITEMS, 'stats-total');
    totalBar.insertAdjacentHTML('afterbegin', '<span class="stats-title">' + (EN ? 'Site total' : '全站累計') + '</span>');
    insertAfterHeader(totalBar);
    const refresh = function () {
      getJSON('/stats').then(function (all) {
        all = all || {};
        const sum = { views: 0, ops: 0, seconds: 0 };
        // 只加總首頁上列出的模組
        const listed = {};
        document.querySelectorAll('[data-module]').forEach(function (el) {
          if (el !== script) listed[el.getAttribute('data-module')] = true;
        });
        Object.keys(listed).forEach(function (k) {
          const m = all[k] || {};
          ['views', 'ops', 'seconds'].forEach(function (f) { sum[f] += +m[f] || 0; });
        });
        fill(totalBar, sum);
        document.querySelectorAll('[data-module]').forEach(function (card) {
          if (card === script) return;
          const s = all[card.getAttribute('data-module')] || {};
          let line = card.querySelector('.module-stats');
          if (!line) {
            line = document.createElement('p');
            line.className = 'module-stats';
            card.appendChild(line);
          }
          line.textContent = EN
            ? fmtInt(s.views) + ' views · ' + fmtInt(s.ops) + ' interactions · ' + fmtTime(s.seconds)
            : '瀏覽 ' + fmtInt(s.views) + '・操作 ' + fmtInt(s.ops) + ' 次・' + fmtTime(s.seconds);
        });
      }).catch(function () { totalBar.hidden = true; });
    };
    refresh();
    setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, HOME_REFRESH * 1000);
    startPresence(totalBar, false);
    return;
  }

  if (!moduleId) return;

  // ======================= 模組頁面：記錄並顯示 =======================
  const path = '/stats/' + moduleId;
  const statsBar = bar(ITEMS);
  insertAfterHeader(statsBar);

  let server = { views: 0, ops: 0, seconds: 0 };
  const pending = { views: 1, ops: 0, seconds: 0 }; // 這次載入算一次瀏覽
  let lastActive = -Infinity;
  let sending = false;

  function render() {
    fill(statsBar, {
      views: server.views + pending.views,
      ops: server.ops + pending.ops,
      seconds: server.seconds + pending.seconds
    });
  }

  function take() {
    // 每次送出的上限與資料庫規則（firebase/database.rules.json）一致，超出的部分下次再送
    return {
      views: Math.min(pending.views, 1),
      ops: Math.min(pending.ops, 300),
      seconds: Math.min(pending.seconds, 180)
    };
  }
  function settle(sent) {
    ['views', 'ops', 'seconds'].forEach(function (k) {
      pending[k] -= sent[k];
      server[k] += sent[k];
    });
    try { window.dispatchEvent(new CustomEvent('lab:statsflush', { detail: { module: moduleId, views: sent.views, ops: sent.ops, seconds: sent.seconds } })); } catch (e) { /* 舊瀏覽器忽略 */ }
  }
  /** 給每分鐘的合併寫入用：要送的欄位，和送完之後的處理 */
  function statsParts() {
    if (sending) return null;
    const sent = take();
    const body = {};
    let any = false;
    ['views', 'ops', 'seconds'].forEach(function (k) {
      if (sent[k] > 0) { body['stats/' + moduleId + '/' + k] = { '.sv': { increment: sent[k] } }; any = true; }
    });
    if (!any) return null;
    sending = true;
    return { body: body, done: function (ok) { if (ok) settle(sent); sending = false; render(); } };
  }
  /** 離開或切到背景時：把還沒送出的統計單獨補送 */
  function flush() {
    if (sending) return;
    const sent = take();
    const body = {};
    let any = false;
    ['views', 'ops', 'seconds'].forEach(function (k) {
      if (sent[k] > 0) { body[k] = { '.sv': { increment: sent[k] } }; any = true; }
    });
    if (!any) return;
    sending = true;
    fetch(db + path + '.json', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      settle(sent);
    }).catch(function () { /* 失敗時保留在 pending，下次再送 */ })
      .then(function () { sending = false; render(); });
  }

  function refresh() {
    if (sending) return; // 避免與送出中的資料重複計算
    getJSON(path).then(function (s) {
      s = s || {};
      server = { views: +s.views || 0, ops: +s.ops || 0, seconds: +s.seconds || 0 };
      render();
    }).catch(function () { statsBar.hidden = true; });
  }

  // ---------- 操作偵測 ----------
  function activity() { lastActive = performance.now(); }
  function op() { pending.ops++; activity(); render(); }

  document.addEventListener('change', function (e) {
    if (e.target.matches('input, select, textarea')) op();
  }, true);
  document.addEventListener('click', function (e) {
    if (e.target.closest('button, [role="button"]')) op();
  }, true);
  document.addEventListener('pointerdown', function (e) {
    if (e.target.closest('canvas, svg, .stage')) op();
  }, true);
  ['input', 'pointermove', 'keydown', 'wheel', 'touchmove'].forEach(function (t) {
    document.addEventListener(t, activity, { capture: true, passive: true });
  });

  // ---------- 計時與定期送出 ----------
  let sinceRefresh = 0;
  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    if ((performance.now() - lastActive) / 1000 <= IDLE_LIMIT) { pending.seconds++; render(); }
    if (++sinceRefresh >= REFRESH_EVERY) { sinceRefresh = 0; refresh(); }
  }, 1000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', function () { flush(true); });

  extraParts = statsParts; // 這次瀏覽和之後的操作，跟著每分鐘的寫入一起送出
  refresh();
  startPresence(statsBar, true);
})();
