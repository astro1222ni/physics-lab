/* leaderboard.js — 倪的星星排行榜：全科總排名與各科排名（前 100 名）、自己的名次、公開設定、我的寶物、各科任務進度、管理員同步任務清單 */
(function () {
  'use strict';
  const LM = window.LabMission;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const st = LM ? LM._state : {};
  /** 任務的星星數（隱藏任務是等級的 2 倍）、我在這個任務領到的星星（含補發） */
  const starsOf = function (x) { return LM && LM.starsOf ? LM.starsOf(x) : x.level; };
  const gotOf = function (x) { const d = st.done && st.done[x.id]; return d ? (+d.stars || 0) : 0; };
  const MODS = window.LAB_MISSION_MODULES || [];
  const SUBJ = window.LAB_SUBJECTS || [{ id: 'phy', zh: '物理', en: 'Physics' }];
  const TABS = [{ id: 'all', zh: '全科總排名', en: 'All subjects' }].concat(SUBJ);
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  const subjOf = function (mod) { return window.LAB_SUBJECT_OF ? window.LAB_SUBJECT_OF(mod) : 'phy'; };
  const liveIn = function (sid) { return (window.LAB_LIVE_MODULES || []).filter(function (m) { return subjOf(m) === sid; }).length; };

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function stars(n) {
    const s = el('span', 'lb-stars');
    s.innerHTML = STAR;
    s.appendChild(el('span', null, String(n)));
    return s;
  }

  // ---------- 載入所有模組的任務檔（只註冊任務，不會在這頁判定） ----------
  const loaded = LM && LM.loadAll ? LM.loadAll() : Promise.resolve();

  let api = null, top = [], myScore = null, admin = false;
  let tab = 'all';
  try { tab = sessionStorage.getItem('lb-tab') || 'all'; } catch (e) { /* 忽略 */ }
  if (!TABS.some(function (t) { return t.id === tab; })) tab = 'all';
  const myRank = {}; // 'all'、'phy'… → 名次（沒有星星時不列）
  let ranksAt = 0;

  function valOf(r, t) { return t === 'all' ? (r.stars || 0) : ((r.s && r.s[t]) || 0); }
  function timeOf(r, t) { return t === 'all' ? (r.at || 0) : ((r.sa && r.sa[t]) || r.at || 0); }
  function rankList(list, t) {
    // 同分同名次（1, 2, 2, 4…）；同分時先達到者在前；該科沒有星星的人不列入
    list = list.filter(function (r) { return valOf(r, t) > 0; });
    list.sort(function (a, b) { return (valOf(b, t) - valOf(a, t)) || (timeOf(a, t) - timeOf(b, t)); });
    let rank = 0, prev = null;
    list.forEach(function (r, i) { const v = valOf(r, t); if (v !== prev) { rank = i + 1; prev = v; } r.rank = rank; });
    return list;
  }
  function tabName(t) { const x = TABS.filter(function (y) { return y.id === t; })[0]; return x ? T(x.zh, x.en) : t; }

  // ---------- 排行榜分頁 ----------
  function renderTabs() {
    const box = $('boardTabs');
    box.innerHTML = '';
    TABS.forEach(function (t) {
      const b = el('button', 'sb-tab sb-' + t.id);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(tab === t.id));
      b.setAttribute('aria-controls', 'list');
      b.appendChild(el('span', null, T(t.zh, t.en)));
      if (t.id !== 'all' && !liveIn(t.id)) b.appendChild(el('span', 'sb-n', T('製作中', 'soon')));
      b.addEventListener('click', function () {
        if (tab === t.id) return;
        tab = t.id;
        try { sessionStorage.setItem('lb-tab', tab); } catch (e) { /* 忽略 */ }
        renderTabs();
        const again = box.querySelector('.sb-' + t.id);
        if (again) again.focus();
        top = [];
        $('list').innerHTML = '';
        $('list').appendChild(el('li', 'lb-empty', T('載入中…', 'Loading…')));
        refresh();
      });
      box.appendChild(b);
    });
    $('boardTitle').textContent = tab === 'all' ? T('全科總排名・前 100 名', 'All subjects · top 100') : tabName(tab) + T('排名・前 100 名', ' · top 100');
  }

  function renderList() {
    const ol = $('list');
    ol.innerHTML = '';
    if (tab !== 'all' && !liveIn(tab)) {
      ol.appendChild(el('li', 'lb-empty sb-soon', T(tabName(tab) + '的實驗製作中，上線後就會有' + tabName(tab) + '排名，敬請期待！', tabName(tab) + ' experiments are on the way — the ranking opens when they go live.')));
      return;
    }
    if (!top.length) { ol.appendChild(el('li', 'lb-empty', T('還沒有人獲得星星，來當第一個吧！', 'Nobody has earned stars yet — be the first!'))); return; }
    const me = st.user && st.user.uid;
    top.forEach(function (r) {
      const li = el('li', 'lb-row' + (r.uid === me ? ' me' : '') + (r.rank <= 3 ? ' podium p' + r.rank : ''));
      li.appendChild(el('span', 'lb-rank', String(r.rank)));
      li.appendChild(el('span', 'lb-name', String(r.name || '?')));
      li.appendChild(stars(valOf(r, tab)));
      ol.appendChild(li);
    });
  }

  function renderMe() {
    const box = $('me');
    box.innerHTML = '';
    if (!api) { box.appendChild(el('p', 'lb-note', T('排行榜暫時無法載入。', 'The leaderboard could not be loaded.'))); return; }
    if (!st.user) {
      box.appendChild(el('p', 'lb-note', T('登入 Google 帳號後，可以看到自己的名次並開始累積星星。', 'Sign in with Google to see your rank and start collecting stars.')));
      const b = el('button', 'primary', T('用 Google 帳號登入', 'Sign in with Google'));
      b.type = 'button';
      b.addEventListener('click', function () { api.signIn().catch(function () {}); });
      box.appendChild(b);
      return;
    }
    if (!st.ready) { box.appendChild(el('p', 'lb-note', T('載入中…', 'Loading…'))); return; }
    const card = el('div', 'lb-card');
    const big = el('div', 'lb-big');
    big.appendChild(stars(myScore ? myScore.stars : 0));
    card.appendChild(big);
    const info = el('div', 'lb-info');
    info.appendChild(el('div', 'lb-myname', st.nickname ? (st.pub ? st.nickname : LM.mask(st.nickname)) : T('（尚未設定暱稱）', '(no nickname yet)')));
    info.appendChild(el('div', 'lb-myrank', myScore
      ? T('全科總排名第 ', 'Overall rank ') + (myRank.all || '…') + T(' 名', '')
      : T('還沒有星星：到任何實驗打開「任務模式」開始吧！', 'No stars yet — open “Mission mode” on any experiment to begin!')));
    card.appendChild(info);
    box.appendChild(card);
    // 各科星星與名次
    if (myScore) {
      const row = el('div', 'lb-myrank-subj');
      SUBJ.forEach(function (sb) {
        if (!liveIn(sb.id)) return;
        const v = (myScore.s && myScore.s[sb.id]) || 0;
        const chip = el('span', 'dl-chip sb-' + sb.id, T(sb.zh, sb.en) + ' ★' + v + (v > 0 && myRank[sb.id] ? T('・第 ' + myRank[sb.id] + ' 名', ' · rank ' + myRank[sb.id]) : ''));
        row.appendChild(chip);
      });
      box.appendChild(row);
    }

    if (st.nickname) {
      const f = el('fieldset', 'lb-pub');
      f.appendChild(el('legend', null, T('排行榜上的暱稱', 'Name on the leaderboard')));
      [[true, T('公開完整暱稱', 'Show my full nickname')], [false, T('不公開（只顯示第一個與最後一個字）', 'Hide it (show only the first and last character)')]].forEach(function (o) {
        const lab = el('label');
        const r = el('input'); r.type = 'radio'; r.name = 'pub'; r.checked = st.pub === o[0];
        r.addEventListener('change', function () { setPub(o[0]); });
        lab.appendChild(r);
        lab.appendChild(el('span', null, o[1] + (o[0] ? '' : T('，例如「', ' — e.g. “') + LM.mask(st.nickname) + T('」', '”'))));
        f.appendChild(lab);
      });
      f.appendChild(el('p', 'lb-note', T('暱稱會公開顯示，請為自己的暱稱負責。', 'Your nickname is public — you are responsible for it.')));
      box.appendChild(f);
    }
  }

  // ---------- 我的寶物（每日任務掉的寶物：左＝累計獲得、右＝現在剩下；格子在 js/daily-core.js） ----------
  let bag = null, bagUid = null, bagErr = false;
  function renderBag() {
    const sec = $('treasures');
    const C = window.LabDailyCore;
    if (!sec) return;
    if (!C || !api || !st.user) { sec.hidden = true; return; }
    sec.hidden = false;
    const box = $('bagBox');
    box.innerHTML = '';
    if (!bag) { box.appendChild(el('p', 'lb-note', bagErr ? T('寶物暫時無法載入，請稍後重新整理。', 'Treasures could not be loaded — please refresh later.') : T('載入中…', 'Loading…'))); return; }
    box.appendChild(C.bagGrid(document, bag, T));
    const p = el('p', 'lb-note', T('累計完成每日任務 ' + (bag.dm || 0) + ' 個。每格左邊是累計獲得（總共拿過多少），右邊是現在剩下；寶物的用途之後公布，用掉時只有「現在剩下」會減少。',
      'Daily missions completed: ' + (bag.dm || 0) + '. In each box, left is all-time (everything you have won) and right is what you have left now; what treasures are for will be announced later, and spending them lowers only “left now”.'));
    p.appendChild(document.createTextNode(' '));
    const a = el('a', null, T('今天的每日任務 →', 'Today’s daily missions →'));
    a.href = 'daily.html';
    p.appendChild(a);
    box.appendChild(p);
  }
  function loadBag() {
    if (!api || !st.user) { bag = null; bagUid = null; renderBag(); return; }
    const uid = st.user.uid;
    if (bagUid !== uid) { bag = null; bagErr = false; bagUid = uid; renderBag(); }
    api.get('bag/' + uid).then(function (b) {
      if (bagUid !== uid) return;
      bag = b || {}; bagErr = false; renderBag();
    }).catch(function () { if (bagUid === uid) { bagErr = !bag; renderBag(); } });
  }

  function progressRow(m, all) {
    const list = all[m.id] || [];
    const done = list.filter(function (x) { return st.done[x.id]; });
    const got = done.reduce(function (a, x) { return a + gotOf(x); }, 0);
    const total = list.reduce(function (a, x) { return a + starsOf(x); }, 0);
    const row = el('a', 'lb-prog');
    row.href = m.id + '.html';
    row.appendChild(el('span', 'lb-prog-name', T(m.zh, m.en)));
    const bar = el('span', 'lb-prog-bar');
    const fill = el('span', 'lb-prog-fill');
    fill.style.width = (total ? 100 * got / total : 0) + '%';
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(el('span', 'lb-prog-num', done.length + ' / ' + list.length + T(' 任務　', ' missions · ') + got + ' / ' + total + ' ★'));
    return row;
  }

  function renderProgress() {
    const sec = $('progress');
    if (!st.user || !st.ready) { sec.hidden = true; return; }
    sec.hidden = false;
    const wrap = $('progressList');
    wrap.innerHTML = '';
    const all = LM.all();
    // 最上面：全部任務的總星數與總進度
    let gotAll = 0, totalAll = 0, doneAll = 0, countAll = 0;
    MODS.forEach(function (m) {
      (all[m.id] || []).forEach(function (x) {
        countAll++; totalAll += starsOf(x);
        if (st.done[x.id]) { doneAll++; gotAll += gotOf(x); }
      });
    });
    if (countAll) {
      const pct = totalAll ? 100 * gotAll / totalAll : 0;
      const tot = el('div', 'lb-prog lb-prog-total');
      const head = el('div', 'lb-prog-total-head');
      head.appendChild(el('span', 'lb-prog-name', T('全部任務', 'All missions')));
      const big = el('span', 'lb-prog-total-stars');
      big.appendChild(stars(gotAll));
      big.appendChild(el('span', 'lb-prog-total-of', ' / ' + totalAll));
      head.appendChild(big);
      tot.appendChild(head);
      const bar = el('span', 'lb-prog-bar');
      const fill = el('span', 'lb-prog-fill');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(totalAll));
      bar.setAttribute('aria-valuenow', String(gotAll));
      bar.setAttribute('aria-label', T('總星數進度', 'Total star progress'));
      tot.appendChild(bar);
      tot.appendChild(el('span', 'lb-prog-num', T('已完成 ', 'Completed ') + doneAll + ' / ' + countAll + T(' 個任務　星星 ', ' missions · ') +
        (pct >= 99.95 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)) + T('%', '% of the stars')));
      wrap.appendChild(tot);
    }
    // 依科目分組
    SUBJ.forEach(function (sb) {
      const mods = MODS.filter(function (m) { return subjOf(m.id) === sb.id && (all[m.id] || []).length; });
      if (!mods.length) return;
      let got = 0, total = 0;
      mods.forEach(function (m) { (all[m.id] || []).forEach(function (x) { total += starsOf(x); got += gotOf(x); }); });
      const h = el('h3', 'lb-subj-head sb-' + sb.id);
      h.appendChild(el('span', null, T(sb.zh, sb.en)));
      h.appendChild(el('small', null, got + ' / ' + total + ' ★'));
      wrap.appendChild(h);
      mods.forEach(function (m) { wrap.appendChild(progressRow(m, all)); });
    });
  }

  function setPub(pub) {
    const uid = st.user.uid;
    st.pub = pub;
    api.setPub(uid, pub).then(function () {
      if (myScore) return api.rename(uid, myScore, pub ? st.nickname : LM.mask(st.nickname), pub);
    }).then(refresh).catch(function () { refresh(); });
  }

  /** 自己在各科的名次：每次載入頁面算一次，之後每 5 分鐘更新（每科一次查詢） */
  function myRanks(sc) {
    if (!sc) return Promise.resolve();
    if (Date.now() - ranksAt < 300000 && Object.keys(myRank).length) return Promise.resolve();
    ranksAt = Date.now();
    return Promise.all(SUBJ.map(function (sb) {
      const v = (sc.s && sc.s[sb.id]) || 0;
      if (!v || !liveIn(sb.id)) { delete myRank[sb.id]; return null; }
      return api.countAbove(v, sb.id).then(function (n) {
        myRank[sb.id] = n + 1;
        if (window.LabAchievements) {
          // 進入前 10 名時才另外數該科排行榜的人數（成就門檻用）
          const size = n < 10 ? api.countAbove(0, sb.id) : Promise.resolve(0);
          return size.then(function (s) { window.LabAchievements.setRank(n + 1, s, sb.id); });
        }
      }).catch(function () { /* 忽略 */ });
    }));
  }

  function refresh() {
    if (!api) return;
    const t = tab;
    const want = t !== 'all' && !liveIn(t) ? Promise.resolve([]) : api.top(100, t === 'all' ? undefined : t);
    want.then(function (list) {
      if (t !== tab) return;
      top = rankList(list, t);
      renderList();
      if (st.user) {
        return api.getScore(st.user.uid).then(function (sc) {
          myScore = sc;
          if (!sc) { delete myRank.all; return; }
          return api.countAbove(sc.stars).then(function (n) {
            myRank.all = n + 1;
            if (window.LabAchievements) {
              // 排行榜成就：進入前 10 名時才數排行榜總人數（門檻要求至少 100、1,000 人）
              const size = n < 10 ? api.countAbove(0) : Promise.resolve(t === 'all' ? top.length : 0);
              return size.then(function (s) { window.LabAchievements.setRank(n + 1, s); });
            }
          }).then(function () { return myRanks(sc); });
        });
      }
    }).then(function () { renderMe(); renderProgress(); loadBag(); }).catch(function () {
      $('list').innerHTML = '';
      $('list').appendChild(el('li', 'lb-empty', T('排行榜暫時無法載入，請稍後再試。', 'The leaderboard could not be loaded — please try again later.')));
      renderMe();
      loadBag();
    });
  }

  // ---------- 管理員：同步任務清單（任務代號 → 星星數） ----------
  $('sync').addEventListener('click', function () {
    loaded.then(function () {
      const defs = {};
      const all = LM.all();
      Object.keys(all).forEach(function (k) { all[k].forEach(function (m) { defs[m.id] = starsOf(m); }); });
      $('syncMsg').textContent = T('同步中…', 'Syncing…');
      return api.syncDefs(defs).then(function () {
        $('syncMsg').textContent = T('已同步 ', 'Synced ') + Object.keys(defs).length + T(' 個任務。', ' missions.');
      });
    }).catch(function () { $('syncMsg').textContent = T('同步失敗：請確認你是管理員，且資料庫規則已更新。', 'Sync failed: check you are an administrator and the database rules are up to date.'); });
  });

  renderTabs();
  let autoSynced = 0; // 本頁載入時 missions.js 已自動同步的任務數
  if (LM) LM.on('synced', function (n) { autoSynced += n; });
  if (window.LabAchievements) window.LabAchievements.renderInto($('achBox'));
  if (!LM) { renderMe(); return; }
  LM._ready().then(function (b) {
    api = b;
    if (!api) { renderMe(); return; }
    let lastUid = null;
    api.onAuth(function (user) {
      const uid = user && user.uid;
      if (uid !== lastUid) { ranksAt = 0; Object.keys(myRank).forEach(function (k) { delete myRank[k]; }); }
      if (uid && uid !== lastUid) api.isAdmin(uid).then(function (a) {
        admin = a; $('admin').hidden = !a;
        if (!a) return;
        // 管理員打開排行榜時，自動同步所有模組的任務清單
        loaded.then(function () { return LM._autoSync(); }).then(function (n) {
          if (autoSynced > 0) $('syncMsg').textContent = T('已自動同步 ', 'Auto-synced ') + autoSynced + T(' 個新任務。', ' new missions.');
          else if (n === 0) $('syncMsg').textContent = T('任務清單已是最新，不需要同步。', 'The mission list is already up to date.');
        });
      });
      if (!uid) { admin = false; $('admin').hidden = true; }
      lastUid = uid;
    });
    refresh();
    // 每 60 秒自動更新排行榜與名次（只在頁面顯示時）
    setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, 60000);
    // 登入狀態或任務資料載入後重新整理
    let wasReady = null;
    setInterval(function () {
      const key = (st.user && st.user.uid) + '|' + st.ready;
      if (key !== wasReady) { wasReady = key; loaded.then(refresh); }
    }, 400);
  }).catch(function () { renderMe(); });
})();
