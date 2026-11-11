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
 */
(function () {
  'use strict';

  // Firebase Realtime Database 網址來自 js/firebase-config.js；留空時統計功能停用，頁面照常運作。
  const DB_URL = (window.LAB_FIREBASE && window.LAB_FIREBASE.databaseURL) || '';

  const IDLE_LIMIT = 30;     // 秒：超過這段時間沒有操作就停止計時
  const FLUSH_EVERY = 15;    // 秒：累積多久送出一次
  const REFRESH_EVERY = 60;  // 秒：多久從伺服器更新一次總數

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
    }).join('');
    return el;
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

  function getJSON(path) {
    return fetch(db + path + '.json', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
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
    setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, REFRESH_EVERY * 1000);
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
})();
