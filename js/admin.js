/*
 * admin.js — 管理頁（11/14 站長要求「個人明細也要」）：列出每個帳號的暱稱、星星、完成任務、成就、使用紀錄、每日任務與寶物。
 *
 * 只有 admins/<uid> = true 的帳號能讀到資料：資料庫規則在 profiles、completions、bonus、userStats、achievements、daily、bag
 * 的上一層開放管理員讀取（firebase/database.rules.json）。規則還沒貼到 Firebase 主控台時，這些讀取會被拒絕，頁面會說明。
 * 不讀、也不顯示 Google 姓名與電子郵件（資料庫裡本來就沒有）。這一頁不寫入任何資料。
 */
(function () {
  'use strict';
  const LM = window.LabMission;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const L = function (o) { return o ? T(o.zh, o.en || o.zh) : ''; };
  const $ = function (id) { return document.getElementById(id); };
  const MODS = window.LAB_MISSION_MODULES || [];
  const SUBJ = window.LAB_SUBJECTS || [];
  const subjOf = function (mod) { return window.LAB_SUBJECT_OF ? window.LAB_SUBJECT_OF(mod) : 'phy'; };
  const starsOf = function (x) { return LM && LM.starsOf ? LM.starsOf(x) : x.level; };
  const PATHS = ['profiles', 'completions', 'bonus', 'userStats', 'achievements', 'daily', 'bag'];
  const TREASURE = [['cu', '銅幣', 'Copper'], ['ag', '銀幣', 'Silver'], ['au', '金幣', 'Gold'], ['dia', '鑽石', 'Diamonds'], ['key', '稀有鑰匙', 'Rare keys']];

  let api = null, uid = null, users = [], open = null;
  const modName = {}, mission = {};
  MODS.forEach(function (m) { modName[m.id] = m; });

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtTime(t) {
    if (!t) return '—';
    const d = new Date(t);
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtDur(s) {
    s = Math.floor(s || 0);
    if (s < 60) return s + T(' 秒', ' s');
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + T(' 小時 ', ' h ') + m + T(' 分', ' min') : m + T(' 分', ' min');
  }
  function dayToTime(k) { // 'YYYYMMDD' → 當天中午的時間
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(k);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : 0;
  }
  function dayLabel(k) { return k.slice(0, 4) + '/' + k.slice(4, 6) + '/' + k.slice(6, 8); }
  function subjName(id) { const s = SUBJ.filter(function (x) { return x.id === id; })[0]; return s ? L(s) : id; }

  // ---------- 成就名稱 ----------
  function achName(id) {
    const A = window.LabAchievements;
    if (!A) return id;
    const a = (A.list || []).filter(function (x) { return x.id === id; })[0];
    if (a) return L(a.name);
    const m = /^(.*)-(\d+|all)$/.exec(id);
    const sr = m && (A.series || []).filter(function (s) { return s.key === m[1]; })[0];
    return sr ? L(sr.name) + ' Lv.' + m[2] : id;
  }

  // ---------- 整理每個帳號 ----------
  function build(d) {
    const ids = {};
    ['scores'].concat(PATHS).forEach(function (k) { Object.keys(d[k] || {}).forEach(function (u) { ids[u] = 1; }); });
    return Object.keys(ids).map(function (u) {
      const prof = (d.profiles || {})[u] || {}, sc = (d.scores || {})[u] || {};
      const comp = (d.completions || {})[u] || {}, bonus = (d.bonus || {})[u] || {};
      const us = (d.userStats || {})[u] || {}, ach = (d.achievements || {})[u] || {};
      const daily = (d.daily || {})[u] || null, bag = (d.bag || {})[u] || null;
      const days = Object.keys(us.days || {}).sort();
      let last = sc.at || 0;
      Object.keys(comp).forEach(function (k) { last = Math.max(last, comp[k].at || 0); });
      Object.keys(ach).forEach(function (k) { last = Math.max(last, ach[k].at || 0); });
      if (daily && daily.at) last = Math.max(last, daily.at);
      if (days.length) last = Math.max(last, dayToTime(days[days.length - 1]));
      let stars = 0;
      Object.keys(comp).forEach(function (k) { stars += (+comp[k].stars || 0) + (+bonus[k] || 0); });
      return {
        uid: u, nick: prof.nickname || sc.name || '', pub: prof.pub !== false && sc.pub !== false,
        stars: Math.max(stars, sc.stars || 0), s: sc.s || {}, comp: comp, bonus: bonus,
        done: Object.keys(comp).length, ach: ach, nAch: Object.keys(ach).length,
        mods: Object.keys(us.modules || {}), days: days, seconds: us.seconds || 0, ops: us.ops || 0, comments: us.comments || 0,
        flags: Object.keys(us.flags || {}), usDays: us.days || {}, daily: daily, bag: bag, last: last
      };
    });
  }

  // ---------- 畫面 ----------
  function gate(msg, withSignIn) {
    const g = $('gate');
    g.hidden = false;
    g.innerHTML = '';
    g.appendChild(el('p', null, msg));
    if (withSignIn) {
      const b = el('button', 'primary', T('用 Google 帳號登入', 'Sign in with Google'));
      b.type = 'button';
      b.addEventListener('click', function () { api.signIn().catch(function () { /* 視窗被關掉 */ }); });
      g.appendChild(b);
    }
    $('main').hidden = true;
  }

  function tile(label, value, note) {
    const t = el('div', 'adm-tile');
    t.appendChild(el('span', 'adm-tile-v', value));
    t.appendChild(el('span', 'adm-tile-k', label));
    if (note) t.appendChild(el('span', 'adm-tile-n', note));
    return t;
  }
  function renderTiles() {
    const box = $('tiles');
    box.innerHTML = '';
    const now = Date.now(), wk = now - 7 * 864e5, mo = now - 30 * 864e5;
    const sum = function (f) { return users.reduce(function (a, u) { return a + f(u); }, 0); };
    box.appendChild(tile(T('帳號數', 'Accounts'), String(users.length)));
    box.appendChild(tile(T('近 7 天活躍', 'Active in 7 days'), String(users.filter(function (u) { return u.last >= wk; }).length),
      T('近 30 天 ', '30 days: ') + users.filter(function (u) { return u.last >= mo; }).length));
    box.appendChild(tile(T('有星星的人', 'With stars'), String(users.filter(function (u) { return u.stars > 0; }).length)));
    box.appendChild(tile(T('完成任務（人次）', 'Missions done'), sum(function (u) { return u.done; }).toLocaleString()));
    box.appendChild(tile(T('累計操作時間', 'Total time'), fmtDur(sum(function (u) { return u.seconds; }))));
  }

  function sorted() {
    const q = ($('q').value || '').trim().toLowerCase();
    const key = $('sort').value;
    const f = {
      recent: function (u) { return u.last; }, stars: function (u) { return u.stars; }, done: function (u) { return u.done; },
      seconds: function (u) { return u.seconds; }, days: function (u) { return u.days.length; }, mods: function (u) { return u.mods.length; }
    }[key] || function (u) { return u.last; };
    return users.filter(function (u) { return !q || u.nick.toLowerCase().indexOf(q) >= 0 || u.uid.toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return f(b) - f(a) || b.last - a.last; });
  }

  function renderRows() {
    const tb = $('rows');
    tb.innerHTML = '';
    const list = sorted();
    $('count').textContent = T('共 ', '') + list.length + T(' 個帳號（點一列看個人明細）', ' accounts (select a row for details)');
    list.forEach(function (u) {
      const tr = el('tr');
      tr.tabIndex = 0;
      if (open === u.uid) tr.className = 'on';
      const nameTd = el('td', 'adm-name');
      nameTd.appendChild(el('span', null, u.nick || T('（未設暱稱）', '(no nickname)')));
      nameTd.appendChild(el('small', null, u.uid.slice(0, 8) + '…'));
      tr.appendChild(nameTd);
      [u.stars, u.done, u.nAch, u.mods.length, u.days.length].forEach(function (v) { tr.appendChild(el('td', 'num', String(v))); });
      tr.appendChild(el('td', 'num', fmtDur(u.seconds)));
      tr.appendChild(el('td', 'num', fmtTime(u.last)));
      const pick = function () { open = u.uid; renderRows(); renderDetail(u); };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      tb.appendChild(tr);
    });
  }

  function h3(sec, text) { sec.appendChild(el('h3', 'adm-h3', text)); }
  function kv(dl, k, v) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
  function table(head, rows, numCols) {
    numCols = numCols || [];
    const w = el('div', 'adm-scroll'), t = el('table', 'adm-table adm-sub');
    const tr = el('tr');
    head.forEach(function (h, i) { tr.appendChild(el('th', numCols.indexOf(i) >= 0 ? 'num' : null, h)); });
    const th = el('thead'); th.appendChild(tr); t.appendChild(th);
    const tb = el('tbody');
    rows.forEach(function (r) { const x = el('tr'); r.forEach(function (c, i) { x.appendChild(el('td', numCols.indexOf(i) >= 0 ? 'num' : null, c)); }); tb.appendChild(x); });
    t.appendChild(tb); w.appendChild(t);
    return w;
  }

  function renderDetail(u) {
    const sec = $('detail');
    sec.hidden = false;
    sec.innerHTML = '';
    const head = el('div', 'adm-dhead');
    head.appendChild(el('h2', null, u.nick || T('（未設暱稱）', '(no nickname)')));
    const close = el('button', null, T('關閉', 'Close'));
    close.type = 'button';
    close.addEventListener('click', function () { open = null; sec.hidden = true; renderRows(); });
    head.appendChild(close);
    sec.appendChild(head);

    const dl = el('dl', 'adm-kv');
    kv(dl, T('使用者代號', 'User ID'), u.uid);
    kv(dl, T('排行榜顯示', 'Leaderboard name'), u.pub ? T('公開暱稱', 'Nickname shown') : T('不公開（只顯示頭尾字）', 'Hidden (first and last characters only)'));
    kv(dl, T('星星', 'Stars'), String(u.stars) + (Object.keys(u.s).length ? T('（', ' (') + Object.keys(u.s).map(function (k) { return subjName(k) + ' ' + u.s[k]; }).join(T('、', ', ')) + T('）', ')') : ''));
    kv(dl, T('最近活動', 'Last active'), fmtTime(u.last));
    kv(dl, T('操作', 'Interactions'), u.ops.toLocaleString() + T(' 次，累計 ', ' · ') + fmtDur(u.seconds) + T('，留言 ', ' · comments ') + u.comments);
    kv(dl, T('使用天數', 'Days used'), u.days.length + (u.days.length ? T('（第一天 ', ' (first ') + dayLabel(u.days[0]) + T('）', ')') : ''));
    sec.appendChild(dl);

    // 任務完成紀錄：先列各科小計，再列每一筆（新到舊）
    h3(sec, T('任務完成紀錄（', 'Missions completed (') + u.done + T(' 個）', ')'));
    const bySubj = {};
    const rows = Object.keys(u.comp).map(function (k) {
      const m = mission[k], c = u.comp[k];
      const mod = m ? m.mod : k.replace(/-h?\d+$/, '');
      const sb = subjOf(mod);
      const got = (+c.stars || 0) + (+u.bonus[k] || 0);
      bySubj[sb] = bySubj[sb] || { n: 0, s: 0 };
      bySubj[sb].n++; bySubj[sb].s += got;
      return { at: c.at || 0, cells: [fmtTime(c.at), subjName(sb), modName[mod] ? L(modName[mod]) : mod,
        (m ? (m.hidden ? T('【隱藏】', '[hidden] ') : '') + L(m.title) : k), String(got)] };
    }).sort(function (a, b) { return b.at - a.at; });
    if (rows.length) {
      sec.appendChild(el('p', 'lb-note', Object.keys(bySubj).map(function (k) { return subjName(k) + T(' ', ': ') + bySubj[k].n + T(' 個／', ' done, ') + bySubj[k].s + ' ★'; }).join(T('　', ' · '))));
      sec.appendChild(table([T('時間', 'Time'), T('科目', 'Subject'), T('實驗', 'Experiment'), T('任務', 'Mission'), '★'], rows.map(function (r) { return r.cells; }), [4]));
    } else sec.appendChild(el('p', 'lb-note', T('還沒有完成任務。', 'No missions yet.')));

    // 成就
    h3(sec, T('成就（', 'Achievements (') + u.nAch + T(' 個）', ')'));
    const achRows = Object.keys(u.ach).map(function (k) { return { at: u.ach[k].at || 0, cells: [fmtTime(u.ach[k].at), achName(k)] }; })
      .sort(function (a, b) { return b.at - a.at; });
    if (achRows.length) sec.appendChild(table([T('時間', 'Time'), T('成就', 'Achievement')], achRows.map(function (r) { return r.cells; })));
    else sec.appendChild(el('p', 'lb-note', T('還沒有成就。', 'No achievements yet.')));

    // 每日任務與寶物
    h3(sec, T('每日任務與寶物', 'Daily missions and treasures'));
    const dd = el('dl', 'adm-kv');
    if (u.daily) kv(dd, T('最近一次每日任務', 'Latest daily missions'), T('完成 ', 'Done ') + Object.keys(u.daily.done || {}).length + ' / 10' + T('（', ' (') + fmtTime(u.daily.at) + T('）', ')'));
    if (u.bag) {
      kv(dd, T('累計完成每日任務', 'Daily missions done in all'), String(u.bag.dm || 0));
      kv(dd, T('寶物（累計獲得）', 'Treasures (all-time)'), TREASURE.map(function (t) { return T(t[1], t[2]) + ' ' + (u.bag[t[0]] || 0); }).join(T('、', ', ')));
    }
    if (!u.daily && !u.bag) kv(dd, T('每日任務', 'Daily missions'), T('沒有紀錄', 'None'));
    sec.appendChild(dd);

    // 使用紀錄：每天打開了哪些實驗（新到舊，最多 60 天）
    h3(sec, T('使用紀錄（打開過 ', 'Usage (opened ') + u.mods.length + T(' 個實驗）', ' experiments)'));
    const dayRows = u.days.slice().reverse().slice(0, 60).map(function (k) {
      const ms = Object.keys(u.usDays[k] || {});
      return [dayLabel(k), ms.map(function (m) { return modName[m] ? L(modName[m]) : m; }).join(T('、', ', ')), String(ms.length)];
    });
    if (dayRows.length) sec.appendChild(table([T('日期', 'Date'), T('打開的實驗', 'Experiments opened'), T('個數', 'Count')], dayRows, [2]));
    if (u.days.length > 60) sec.appendChild(el('p', 'lb-note', T('只列最近 60 天。', 'Showing the latest 60 days.')));
    if (u.flags.length) sec.appendChild(el('p', 'lb-note', T('特殊紀錄：', 'Flags: ') + u.flags.map(function (f) {
      return { night: T('深夜（23–4 點）用過', 'used late at night'), dawn: T('清晨（4–6 點）用過', 'used at dawn'), lang: T('切換過語言', 'switched language'), mm: T('開過任務模式', 'used mission mode') }[f] || f;
    }).join(T('、', ', '))));

    sec.focus({ preventScroll: true });
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- 匯出 CSV ----------
  function exportCsv() {
    const sj = SUBJ.map(function (s) { return s.id; });
    const head = ['uid', 'nickname', 'stars'].concat(sj.map(function (s) { return 'stars_' + s; }))
      .concat(['missions', 'achievements', 'experiments', 'days', 'seconds', 'ops', 'comments', 'last_active', 'daily_done_total', 'cu', 'ag', 'au', 'dia', 'key']);
    const q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [head.join(',')].concat(sorted().map(function (u) {
      const b = u.bag || {};
      return [u.uid, u.nick, u.stars].concat(sj.map(function (s) { return u.s[s] || 0; }))
        .concat([u.done, u.nAch, u.mods.length, u.days.length, u.seconds, u.ops, u.comments, u.last ? new Date(u.last).toISOString() : '',
          b.dm || 0, b.cu || 0, b.ag || 0, b.au || 0, b.dia || 0, b.key || 0]).map(q).join(',');
    }));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'astro-ni-lab-users-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  // ---------- 讀資料 ----------
  function load() {
    gate(T('讀取資料中…', 'Loading…'));
    const missionsReady = (LM && LM.loadAll ? LM.loadAll() : Promise.resolve()).then(function () {
      const all = LM ? LM.all() : {};
      Object.keys(all).forEach(function (mod) { all[mod].forEach(function (m) { mission[m.id] = { mod: mod, title: m.title, hidden: !!m.hidden, stars: starsOf(m) }; }); });
    }).catch(function () { /* 任務名稱讀不到就顯示代號 */ });
    const reads = ['scores'].concat(PATHS).map(function (p) {
      return api.get(p).then(function (v) { return [p, v || {}]; }, function (e) { return [p, null, e]; });
    });
    Promise.all([missionsReady].concat(reads)).then(function (r) {
      const d = {}, denied = [];
      r.slice(1).forEach(function (x) { if (x[1] === null) denied.push(x[0]); else d[x[0]] = x[1]; });
      if (denied.length) {
        gate(T('資料庫規則還沒更新，管理員讀不到：', 'The database rules are not updated yet; the administrator cannot read: ') + denied.join(T('、', ', ')) +
          T('。請把 firebase/database.rules.json 貼到 Firebase 主控台的「規則」分頁並發布，再重新整理這一頁。', '. Paste firebase/database.rules.json into the Rules tab of the Firebase console, publish, and reload this page.'));
        return;
      }
      users = build(d);
      $('gate').hidden = true;
      $('main').hidden = false;
      renderTiles();
      renderRows();
      if (open) { const u = users.filter(function (x) { return x.uid === open; })[0]; if (u) renderDetail(u); }
    });
  }

  $('q').addEventListener('input', renderRows);
  $('sort').addEventListener('change', renderRows);
  $('csv').addEventListener('click', exportCsv);
  $('reload').addEventListener('click', function () { if (api && uid) load(); });

  if (!LM) { gate(T('任務系統沒有載入。', 'The mission system did not load.')); return; }
  gate(T('連線中…', 'Connecting…'));
  Promise.resolve(LM._ready()).then(function (a) {
    api = a;
    if (!api) { gate(T('暫時連不上資料庫。', 'Cannot reach the database right now.')); return; }
    api.onAuth(function (user) {
      uid = user ? user.uid : null;
      users = []; open = null; $('detail').hidden = true;
      if (!user) { gate(T('請用管理員的 Google 帳號登入。', 'Please sign in with the administrator’s Google account.'), true); return; }
      api.isAdmin(user.uid).then(function (ok) {
        if (uid !== user.uid) return;
        if (!ok) { gate(T('這一頁只有網站管理員能看。', 'Only the site administrator can see this page.')); return; }
        load();
      });
    });
  });
})();
