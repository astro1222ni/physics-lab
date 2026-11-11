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
 *   目前在線 ── 開著（在前景）的頁面每 60 秒送出一次心跳：每個分頁一個隨機代號＋所在頁面，
 *               不含任何個人資料；150 秒內有心跳的代號算在線。離開或切到背景時刪除自己的代號，
 *               超過 10 分鐘沒有心跳的代號由其他訪客順手清掉。首頁顯示全站，實驗頁顯示該實驗。
 */
(function () {
  'use strict';

  // Firebase Realtime Database 網址來自 js/firebase-config.js；留空時統計功能停用，頁面照常運作。
  const DB_URL = (window.LAB_FIREBASE && window.LAB_FIREBASE.databaseURL) || '';

  const IDLE_LIMIT = 30;     // 秒：超過這段時間沒有操作就停止計時
  const FLUSH_EVERY = 15;    // 秒：累積多久送出一次
  const REFRESH_EVERY = 60;  // 秒：多久從伺服器更新一次總數
  const ONLINE_WINDOW = 150; // 秒：這段時間內有心跳就算在線
  const BEAT_EVERY = 60;     // 秒：心跳間隔
  const ONLINE_EVERY = 30;   // 秒：多久更新一次在線人數

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
  function fill(el, s) {
    el.querySelector('[data-k="views"]').textContent = fmtInt(s.views);
    el.querySelector('[data-k="ops"]').textContent = fmtInt(s.ops);
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

  // ======================= 目前在線人數（匿名心跳） =======================
  const here = moduleId || 'home';
  let skew = 0; // 伺服器時間 − 本機時間（毫秒），用伺服器時間判斷誰還在線
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
  /** 在線人數；onlyHere 時只算這個實驗 */
  function countOnline(onlyHere) {
    const cutoff = Math.floor(Date.now() + skew - ONLINE_WINDOW * 1000);
    return getJSON('/presence', '?orderBy=' + encodeURIComponent('"t"') + '&startAt=' + cutoff).then(function (all) {
      all = all || {};
      return Object.keys(all).filter(function (k) { return !onlyHere || (all[k] && all[k].m === here); }).length;
    });
  }
  /** 清掉超過 10 分鐘沒有心跳的代號（每次最多 50 個） */
  function sweep() {
    const old = Math.floor(Date.now() + skew - 600000);
    getJSON('/presence', '?orderBy=' + encodeURIComponent('"t"') + '&endAt=' + old + '&limitToFirst=50').then(function (all) {
      const keys = Object.keys(all || {});
      if (!keys.length) return;
      const body = {};
      keys.forEach(function (k) { body[k] = null; });
      return fetch(db + '/presence.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }).catch(function () { /* 忽略 */ });
  }
  function startPresence(targetBar, onlyHere) {
    const show = function () {
      countOnline(onlyHere).then(function (n) { setOnline(targetBar, Math.max(n, document.visibilityState === 'visible' ? 1 : 0)); })
        .catch(function () { setOnline(targetBar, null); });
    };
    beat().then(function () { show(); if (Math.random() < 0.2) sweep(); });
    // 同一分頁換頁時，上一頁離開時的刪除可能晚一步才到；幾秒後再補一次心跳
    setTimeout(beat, 4000);
    setInterval(function () { if (document.visibilityState === 'visible') beat(); }, BEAT_EVERY * 1000);
    setInterval(function () { if (document.visibilityState === 'visible') show(); }, ONLINE_EVERY * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') leave();
      else beat().then(show);
    });
    window.addEventListener('pagehide', leave);
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
    setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, REFRESH_EVERY * 1000);
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

  function flush(final, done) {
    if (sending && !final) return;
    // 每次送出的上限與資料庫規則（firebase/database.rules.json）一致，超出的部分下次再送
    const sent = {
      views: Math.min(pending.views, 1),
      ops: Math.min(pending.ops, 300),
      seconds: Math.min(pending.seconds, 180)
    };
    const body = {};
    let any = false;
    ['views', 'ops', 'seconds'].forEach(function (k) {
      if (sent[k] > 0) { body[k] = { '.sv': { increment: sent[k] } }; any = true; }
    });
    if (!any) { if (done) done(); return; }
    sending = true;
    fetch(db + path + '.json', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: !!final
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      ['views', 'ops', 'seconds'].forEach(function (k) {
        pending[k] -= sent[k];
        server[k] += sent[k];
      });
      try { window.dispatchEvent(new CustomEvent('lab:statsflush', { detail: { module: moduleId, views: sent.views, ops: sent.ops, seconds: sent.seconds } })); } catch (e) { /* 舊瀏覽器忽略 */ }
    }).catch(function () { /* 失敗時保留在 pending，下次再送 */ })
      .then(function () { sending = false; render(); if (done) done(); });
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
  let sinceFlush = 0, sinceRefresh = 0;
  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    if ((performance.now() - lastActive) / 1000 <= IDLE_LIMIT) { pending.seconds++; render(); }
    if (++sinceFlush >= FLUSH_EVERY) { sinceFlush = 0; flush(false); }
    if (++sinceRefresh >= REFRESH_EVERY) { sinceRefresh = 0; refresh(); }
  }, 1000);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', function () { flush(true); });

  flush(false, refresh); // 先記錄這次瀏覽，再讀取總數
  startPresence(statsBar, true);
})();
