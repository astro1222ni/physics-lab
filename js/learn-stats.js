/* learn-stats.js — 物理自習室的匿名統計（第一階段）：瀏覽次數、操作次數、累積學習時間、目前在線
   11/21 站長要學習分支照龍騰網頁講義的「兩階段教室統計」做（原話：「將這個統計的方式通知"實驗室「學習」分支"工作串，請他一樣照做。」）。
   做法照龍騰 js/lt-stats.js 第一階段，資料用實驗室現成的路徑與規則（firebase/database.rules.json，不用改規則）：
   - /stats/<代號>：views（單元頁每載入一次 +1）、ops（按鈕、作答、拖圖）、seconds（學習時間）。代號＝learn-phy-5-1、exam-114-19…
     實驗室首頁的「全站累計」只加首頁列出的實驗，自習室的數字不會混進去。
   - /online/<分鐘>：開在前景的分頁每分鐘在 n（全站）與 m/<代號> 各加 1；大廳記在 learn-lobby。顯示上一分鐘的數字，至少算自己一個。
     第一筆在開頁後 2～5 秒就送（11/21），之後每分鐘一次。
   - 大廳 learn.html 也記自己的瀏覽與點擊（/stats/learn-lobby，不算學習時間），「物理自習室累計」＝大廳＋各單元（11/21 照龍騰「總覽也算」）。
   - 學習時間：旁白在播（LearnPlayer.snapshot.playing）就算；否則只算最近一次操作後 30 秒內。
   - 放哪裡：大廳首頁兩張大卡下面「物理自習室累計」；課本分頁 5-1 卡片下一行小字；學測分頁各學年度題目卡片下面「NNN 學測累計」；
     單元頁畫面上不放統計，只在右側「步驟・任務」側板頂端一行「現在有 N 人在學這一題／這一節」。
   - 讀到數字才出現；沒有資料庫設定（私人試玩版、本機）或連不上就整條藏起來。只記匿名數字，不收任何個人資料。
   測試：window.LAB_STATS_DB 指到假資料庫、window.LAB_STATS_WRITE_AT 指定每分鐘第幾秒寫（規劃\學習-學測114\fix1121\stats-test.cjs）。 */
(function () {
  'use strict';
  var DB = String(window.LAB_STATS_DB || (window.LAB_FIREBASE && window.LAB_FIREBASE.databaseURL) || '').replace(/\/+$/, '');
  if (!DB || !window.fetch) return;
  var api = window.LearnStats = {};
  var IDLE = 30, REFRESH_EVERY = 120, KEEP_MINUTES = 10, MOD_RE = /^[a-z0-9-]{1,40}$/;
  var en = function () { return !!(window.LabSettings && LabSettings.lang === 'en'); };
  var T = function (z, e) { return en() ? e : z; };

  function fmtInt(n) { return Math.round(n || 0).toLocaleString(en() ? 'en-US' : 'zh-TW'); }
  function fmtSI(n) {
    var x = Math.floor(n || 0), P = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']];
    for (var i = 0; i < P.length; i++) if (x >= P[i][0]) { var v = x / P[i][0], d = v >= 100 ? 0 : v >= 10 ? 1 : 2; return (Math.floor(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d) + ' ' + P[i][1]; }
    return String(x);
  }
  function fmtTime(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + T(' 秒', ' s');
    var m = Math.floor(sec / 60), h = Math.floor(m / 60), d = Math.floor(h / 24), out = [];
    if (d > 0) out.push(fmtInt(d) + T(' 天', ' d'));
    if (h > 0) out.push((h % 24) + T(' 小時', ' h'));
    out.push((m % 60) + T(' 分', ' min'));
    return out.join(' ');
  }
  function getJSON(p) { return fetch(DB + p + '.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  function inc(n) { return { '.sv': { increment: n } }; }

  // 對時：分鐘以伺服器時間為準（和實驗室 stats.js 共用 sessionStorage 的 lab-skew）
  var skew = 0;
  function serverNow() { return Date.now() + skew; }
  function syncClock() {
    try { var c = JSON.parse(sessionStorage.getItem('lab-skew') || 'null'); if (c && Math.abs(Date.now() - c.at) < 1800000 && isFinite(c.s)) { skew = c.s; return Promise.resolve(); } } catch (e) { /* 略 */ }
    var t0 = Date.now();
    return fetch(DB + '/clock.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ '.sv': 'timestamp' }) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (t) { if (typeof t !== 'number') return; var t1 = Date.now(); skew = Math.round(t - (t0 + t1) / 2); try { sessionStorage.setItem('lab-skew', JSON.stringify({ s: skew, at: t1 })); } catch (e) { /* 略 */ } })
      .catch(function () { /* 對時失敗就用本機時間 */ });
  }

  // ---------- 畫面：沿用實驗室首頁的 .stats-bar 樣式 ----------
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function bar(zh, enT) {
    var b = el('div', 'stats-bar learn-stats',
      '<span class="stats-title">' + T(zh, enT) + '</span>' +
      '<span class="stat"><span class="stat-label">' + T('瀏覽次數', 'Views') + '</span><span class="stat-value" data-k="views">—</span></span>' +
      '<span class="stat"><span class="stat-label">' + T('操作次數', 'Actions') + '</span><span class="stat-value" data-k="ops">—</span></span>' +
      '<span class="stat stat-time"><span class="stat-label">' + T('累積學習時間', 'Time studied') + '</span><span class="stat-value" data-k="seconds">—</span></span>' +
      '<span class="stat stat-on" hidden><span class="stat-label"><i class="online-dot" aria-hidden="true"></i>' + T('目前在線', 'Online now') + '</span><span class="stat-value" data-k="online">—</span></span>');
    b.hidden = true; b.setAttribute('aria-live', 'polite');
    return b;
  }
  function fill(b, s) {
    ['views', 'ops'].forEach(function (k) { var v = b.querySelector('[data-k="' + k + '"]'); v.textContent = fmtSI(s[k]) + T(' 次', ''); v.title = fmtInt(s[k]); });
    b.querySelector('[data-k="seconds"]').textContent = fmtTime(s.seconds);
    b.hidden = false;
  }
  function setOnline(b, n) {
    var it = b.querySelector('.stat-on'); if (n == null || b.hidden) { it.hidden = true; return; }
    it.hidden = false; b.querySelector('[data-k="online"]').textContent = fmtInt(n) + T(' 人', '');
  }
  function line(r) {   // 卡片下一行小字：每段不斷開，只在「・」之間換行（龍騰 11/21 的斷行教訓）
    return '<span class="ls-seg">' + T('瀏覽 ', 'Views ') + fmtSI(r.views) + T(' 次', '') + '</span>・<span class="ls-seg">' + T('操作 ', 'Actions ') + fmtSI(r.ops) + T(' 次', '') +
      '</span>・<span class="ls-seg">' + T('學習 ', 'Studied ') + fmtTime(r.seconds) + '</span>';
  }

  // ---------- 在線：每分鐘一個計數器（同實驗室新做法） ----------
  var here = '', showKeys = [], onlineCb = null, extraParts = null, onlineN = null;
  var writeAt = typeof window.LAB_STATS_WRITE_AT === 'number' ? window.LAB_STATS_WRITE_AT : 2 + Math.random() * 50;
  var lastWriteMin = -1, lastShowMin = -1, writing = false;
  // 11/21 龍騰串補的缺口②：開頁後 2～5 秒先送第一筆（在線＋瀏覽），短暫造訪也算得到；之後照每分鐘亂數那一秒
  var firstAt = typeof window.LAB_STATS_FIRST_MS === 'number' ? window.LAB_STATS_FIRST_MS : 2000 + Math.random() * 3000;
  function showOnline() {
    if (!showKeys.length) return;
    getJSON('/online/' + (Math.floor(serverNow() / 60000) - 1) + '/m').then(function (m) {
      m = m || {}; var n = 0; showKeys.forEach(function (k) { n += +m[k] || 0; });
      onlineN = Math.max(n, document.visibilityState === 'visible' ? 1 : 0);   // 剛打開的分頁不在上一分鐘的數字裡：至少算自己
      if (onlineCb) onlineCb(onlineN, m);
    }).catch(function () { onlineN = null; if (onlineCb) onlineCb(null, null); });
  }
  function sweep(min) {
    fetch(DB + '/online.json?orderBy=' + encodeURIComponent('"k"') + '&endAt=' + (min - KEEP_MINUTES) + '&limitToFirst=5', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (all) { var keys = Object.keys(all || {}); if (!keys.length) return; var body = {}; keys.forEach(function (k) { body[k] = null; });
        return fetch(DB + '/online.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); })
      .catch(function () { /* 略 */ });
  }
  function minuteWrite(min) {
    var b = 'online/' + min + '/', body = {};
    body[b + 'k'] = min; body[b + 'n'] = inc(1); body[b + 'm/' + here] = inc(1);
    var extra = extraParts ? extraParts() : null;
    if (extra) Object.keys(extra.body).forEach(function (k) { body[k] = extra.body[k]; });
    writing = true;
    fetch(DB + '/.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); if (extra) extra.done(true);
        return r.json().then(function (d) { var n = d && d['online/' + min + '/n']; if (n === 1 || Math.random() < 0.01) sweep(min); }).catch(function () { /* 略 */ }); })
      .catch(function () { if (extra) extra.done(false); })
      .then(function () { writing = false; });
  }
  function tick() {
    if (document.visibilityState !== 'visible' || writing) return;
    var t = serverNow(), min = Math.floor(t / 60000), sec = (t % 60000) / 1000;
    if (min !== lastWriteMin && (lastWriteMin < 0 ? performance.now() >= firstAt : sec >= writeAt)) { lastWriteMin = min; minuteWrite(min); }
    if (min !== lastShowMin && sec >= Math.min(writeAt + 3, 59)) { lastShowMin = min; showOnline(); }
  }
  function startOnline() {
    syncClock().then(function () { lastShowMin = Math.floor(serverNow() / 60000); showOnline(); tick(); setInterval(tick, 1000); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') showOnline(); });
  }

  // ---------- 單元頁：計數與學習時間 ----------
  function startCounting(mod, opt) {
    var learn = !(opt && opt.learn === false);   // 大廳：記瀏覽與點擊，不累計學習秒數
    var path = '/stats/' + mod, pending = { views: 1, ops: 0, seconds: 0 }, tot = { ops: 0, seconds: 0 }, sending = false, lastActive = -Infinity;
    function take() { return { views: Math.min(pending.views, 1), ops: Math.min(pending.ops, 300), seconds: Math.min(pending.seconds, 180) }; }   // 每次上限同資料庫規則
    function settle(sent) { ['views', 'ops', 'seconds'].forEach(function (k) { pending[k] -= sent[k]; }); }
    function parts() {
      if (sending) return null;
      var sent = take(), body = {}, any = false;
      ['views', 'ops', 'seconds'].forEach(function (k) { if (sent[k] > 0) { body['stats/' + mod + '/' + k] = inc(sent[k]); any = true; } });
      if (!any) return null;
      sending = true;
      return { body: body, done: function (ok) { if (ok) settle(sent); sending = false; } };
    }
    function flush() {
      if (sending) return;
      var sent = take(), body = {}, any = false;
      ['views', 'ops', 'seconds'].forEach(function (k) { if (sent[k] > 0) { body[k] = inc(sent[k]); any = true; } });
      if (!any) return;
      sending = true;
      fetch(DB + path + '.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); settle(sent); })
        .catch(function () { /* 留著下次再送 */ })
        .then(function () { sending = false; });
    }
    function activity() { lastActive = performance.now(); }
    function op() { pending.ops++; tot.ops++; activity(); }
    document.addEventListener('change', function (e) { if (e.target.matches && e.target.matches('input, select, textarea')) op(); }, true);
    var CLICK = 'button, summary, [role="button"], [role="tab"]' + (learn ? '' : ', a[href]');
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest(CLICK)) op(); }, true);
    document.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('canvas, svg')) op(); }, true);
    ['input', 'pointermove', 'keydown', 'wheel', 'touchmove', 'scroll'].forEach(function (t) { document.addEventListener(t, activity, { capture: true, passive: true }); });
    if (learn) setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      var idle = (performance.now() - lastActive) / 1000, p = window.LearnPlayer, busy = false;
      try { busy = !!(p && p.snapshot && p.snapshot.playing); } catch (e) { /* 略 */ }
      if (idle <= IDLE || busy) { pending.seconds++; tot.seconds++; }
    }, 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
    window.addEventListener('pagehide', flush);
    extraParts = parts;
    api._pending = function () { return { ops: tot.ops, seconds: tot.seconds, left: { views: pending.views, ops: pending.ops, seconds: pending.seconds } }; };   // 測試用
  }

  // ---------- 第二階段：每題第一次作答、完成人次（/qstats，規則 7558fc3b，做法同龍騰 lt-stats.js） ----------
  // - 學測頁：q/<題號>（例 q/19）；選錯時 m/<勾的選項組合>（例 m/CD）。done＝聽完全部解題。
  // - 5-1：q/7-1、q/7-2、q/7-3；選錯時 m/<選項字母或 m0／m1>。done＝每一頁都看過。
  // - 只算這個瀏覽器的第一次作答；老師上課模式（?class=1）不算。單獨一包 PATCH，不併進在線心跳；失敗就丟掉，不重送。
  // - 學生看得到：學測「全國資料」下面、5-1 回饋下面一行「本站第一次作答 N 人次，第一次就答對 X%」（滿 5 人次才出現）。
  var QK_RE = /^[a-z0-9_-]{1,40}$/, MYTH_RE = /^[A-Za-z0-9-]{1,32}$/, MIN_N = +window.LAB_QS_MIN || 5;
  // 學測頁：新版 exam.js 提供 ExamPaper（含學年度）；還沒換的舊頁只有 Exam114，也要認得（11/21 主串補）
  function examPaper() { return window.ExamPaper || (window.Exam114 ? { year: 114, number: Exam114.number } : null); }
  var NOCOUNT = /[?&]class=1(&|$)/.test(location.search);
  function unitMod() {
    var me = document.querySelector('script[src*="learn-stats.js"]');
    var E = examPaper(), m = E ? 'exam-' + E.year + '-' + E.number : (me && me.dataset.module) || '';
    return MOD_RE.test(m) ? m : '';
  }
  function pct(a, b) { return b ? Math.round(a / b * 100) : 0; }
  function startAnswers(mod) {
    var KEY = 'ls-qs-' + mod, st = {};
    try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { st = {}; }
    st.sent = st.sent || {};
    function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 略 */ } }
    function send(paths) {
      var body = {}; paths.forEach(function (x) { body['qstats/' + mod + '/' + x] = inc(1); });
      fetch(DB + '/.json', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true })
        .then(function (r) { if (r.ok) qCache = null; }).catch(function () { /* 丟掉 */ });
    }
    document.addEventListener('learn:answer', function (e) {
      var d = e.detail || {}, k = String(d.item == null ? '' : d.item).toLowerCase();
      if (NOCOUNT || !QK_RE.test(k) || st.sent[k]) return;
      st.sent[k] = 1; save();
      var paths = ['q/' + k + '/n'];
      if (d.ok) paths.push('q/' + k + '/ok'); else if (d.myth && MYTH_RE.test(d.myth)) paths.push('q/' + k + '/m/' + d.myth);
      send(paths);
    });
    document.addEventListener('learn:done', function () { if (NOCOUNT || st.done) return; st.done = 1; save(); send(['done']); });
    api._qs = function () { return { sent: Object.keys(st.sent), done: !!st.done }; };   // 測試用
  }
  var qCache = null, qAt = 0;
  function qData(mod) {
    if (qCache && Date.now() - qAt < 60000) return qCache;
    qAt = Date.now(); qCache = getJSON('/qstats/' + mod + '/q').then(function (v) { return v || {}; });
    qCache.catch(function () { qCache = null; });
    return qCache;
  }
  api.fillRates = function (root) {
    var mod = unitMod(); if (!mod) return;
    var els = [].slice.call((root || document).querySelectorAll('.ls-qrate[data-q]')); if (!els.length) return;
    qData(mod).then(function (Q) {
      els.forEach(function (x) {
        var d = Q[String(x.getAttribute('data-q')).toLowerCase()] || {}, n = +d.n || 0;
        if (n < MIN_N) { x.hidden = true; return; }   // 人數太少，百分比沒意義
        var my = x.getAttribute('data-myth'), c = my && d.m ? +d.m[my] || 0 : 0;
        x.innerHTML = '<span class="ls-seg">' + T('本站第一次作答 ', 'On this site, ') + fmtInt(n) + T(' 人次，', ' first attempts: ') + '</span><span class="ls-seg">' +
          T('第一次就答對 <b>' + pct(+d.ok || 0, n) + '%</b>', '<b>' + pct(+d.ok || 0, n) + '%</b> right the first time') + '</span>' +
          (c ? '<span class="ls-qrate-m">' + T('第一次就和你選一樣的：<b>' + pct(c, n) + '%</b>', 'Picked the same as you first time: <b>' + pct(c, n) + '%</b>') + '</span>' : '');
        x.hidden = false;
      });
    }, function () { els.forEach(function (x) { x.hidden = true; }); });
  };

  // ---------- 兩種頁面 ----------
  function start() {
    var units = (window.LAB_LEARN_UNITS || []).map(function (u) { return u.id; }).filter(function (m) { return MOD_RE.test(m); });
    if (document.body.classList.contains('learn-lobby-page')) {
      here = 'learn-lobby'; showKeys = [here].concat(units);
      var all = {}, bars = [];
      // 大廳首頁：兩張大卡下面「物理自習室累計」
      var home = document.getElementById('lobby-home'), bHome = bar('物理自習室累計', 'Physics Study Room total');
      if (home) { home.insertAdjacentElement('afterend', bHome); bars.push([bHome, [here].concat(units)]); }   // 累計＝大廳自己＋各單元
      // 學測分頁：每個學年度的題目卡片下面「NNN 學測累計」（114 起；113 上架後自動多一條）
      var years = {};
      units.forEach(function (m) { var y = /^exam-(\d{3})-/.exec(m); if (y) (years[y[1]] = years[y[1]] || []).push(m); });
      Object.keys(years).forEach(function (y) {
        var grid = document.querySelector('#exam-' + y + ' .exam-entries'); if (!grid) return;
        var b = bar(y + ' 學測累計', (+y + 1911) + ' GSAT total'); grid.insertAdjacentElement('afterend', b); bars.push([b, years[y]]);
      });
      var keys = [here].concat(units);
      Promise.all(keys.map(function (m) { return getJSON('/stats/' + m).then(function (v) { return v || {}; }, function () { return null; }); })).then(function (rows) {
        if (rows.every(function (r) { return r === null; })) return;   // 連不上：整個不顯示
        rows.forEach(function (r, i) { all[keys[i]] = r || {}; });
        bars.forEach(function (x) {
          var sum = { views: 0, ops: 0, seconds: 0 };
          x[1].forEach(function (m) { ['views', 'ops', 'seconds'].forEach(function (k) { sum[k] += +(all[m] || {})[k] || 0; }); });
          fill(x[0], sum);
        });
        // 課本分頁：5-1 卡片下一行小字
        var card = document.querySelector('#unit-link .unit-copy');
        if (card && all['learn-phy-5-1']) { var s = el('small', 'ls-line', line(all['learn-phy-5-1'])); s.setAttribute('data-mod', 'learn-phy-5-1'); card.appendChild(s); }
      });
      onlineCb = function (n, m) {
        bars.forEach(function (x) {
          if (x[0] === bHome) { setOnline(bHome, n); return; }
          var k = 0; x[1].forEach(function (mm) { k += +(m && m[mm]) || 0; }); setOnline(x[0], m ? k : null);
        });
        var on = m ? +m['learn-phy-5-1'] || 0 : 0, l = document.querySelector('.ls-line[data-mod="learn-phy-5-1"]');
        if (l) { var o = l.querySelector('.ls-on'); if (!o) { o = el('span', 'ls-on'); l.appendChild(o); } o.innerHTML = on ? ' <span class="ls-seg"><i class="online-dot" aria-hidden="true"></i>' + fmtInt(on) + T(' 人在學', ' studying') + '</span>' : ''; }
      };
      startCounting(here, { learn: false });
      startOnline();
      return;
    }
    // 單元頁：學測頁照題號，5-1 照 script 的 data-module
    var mod = unitMod();
    if (!mod) return;
    here = mod; showKeys = [here];
    var head = document.getElementById('side-header'), p = el('p', 'ls-here'); p.hidden = true;
    if (head) head.insertAdjacentElement('afterend', p);
    onlineCb = function (n) {
      if (n == null) { p.hidden = true; return; }
      p.innerHTML = '<i class="online-dot" aria-hidden="true"></i>' + T('現在有 <b>' + fmtInt(n) + '</b> 人在學這一' + (examPaper() ? '題' : '節'), '<b>' + fmtInt(n) + '</b> studying this ' + (examPaper() ? 'question' : 'section') + ' now');
      p.hidden = false;
    };
    startCounting(here);
    startAnswers(here);
    api.fillRates(document);
    startOnline();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); });
  else setTimeout(start, 0);
})();
