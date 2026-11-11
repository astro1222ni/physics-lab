/* leaderboard.js — 倪的星星排行榜：前 100 名、自己的名次、公開設定、任務進度、管理員同步任務清單 */
(function () {
  'use strict';
  const LM = window.LabMission;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const $ = function (id) { return document.getElementById(id); };
  const st = LM ? LM._state : {};
  const MODS = window.LAB_MISSION_MODULES || [];
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';

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
  const loaded = Promise.all(MODS.map(function (m) {
    return new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = 'js/missions/' + m.id + '.js';
      s.onload = s.onerror = resolve;
      document.body.appendChild(s);
    });
  }));

  let api = null, top = [], myScore = null, myRank = null, admin = false;

  function rankList(list) {
    // 同分同名次（1, 2, 2, 4…）；同分時先達到者在前
    list.sort(function (a, b) { return (b.stars - a.stars) || ((a.at || 0) - (b.at || 0)); });
    let rank = 0, prev = null;
    list.forEach(function (r, i) { if (r.stars !== prev) { rank = i + 1; prev = r.stars; } r.rank = rank; });
    return list;
  }

  function renderList() {
    const ol = $('list');
    ol.innerHTML = '';
    if (!top.length) { ol.appendChild(el('li', 'lb-empty', T('還沒有人獲得星星，來當第一個吧！', 'Nobody has earned stars yet — be the first!'))); return; }
    const me = st.user && st.user.uid;
    top.forEach(function (r) {
      const li = el('li', 'lb-row' + (r.uid === me ? ' me' : '') + (r.rank <= 3 ? ' podium p' + r.rank : ''));
      li.appendChild(el('span', 'lb-rank', String(r.rank)));
      li.appendChild(el('span', 'lb-name', String(r.name || '?')));
      li.appendChild(stars(r.stars));
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
      ? T('目前第 ', 'Rank ') + myRank + T(' 名', '')
      : T('還沒有星星：到任何實驗打開「任務模式」開始吧！', 'No stars yet — open “Mission mode” on any experiment to begin!')));
    card.appendChild(info);
    box.appendChild(card);

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

  function renderProgress() {
    const sec = $('progress');
    if (!st.user || !st.ready) { sec.hidden = true; return; }
    sec.hidden = false;
    const wrap = $('progressList');
    wrap.innerHTML = '';
    const all = LM.all();
    MODS.forEach(function (m) {
      const list = all[m.id] || [];
      if (!list.length) return;
      const done = list.filter(function (x) { return st.done[x.id]; });
      const got = done.reduce(function (a, x) { return a + x.level; }, 0);
      const total = list.reduce(function (a, x) { return a + x.level; }, 0);
      const row = el('a', 'lb-prog');
      row.href = m.id + '.html';
      row.appendChild(el('span', 'lb-prog-name', T(m.zh, m.en)));
      const bar = el('span', 'lb-prog-bar');
      const fill = el('span', 'lb-prog-fill');
      fill.style.width = (total ? 100 * got / total : 0) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(el('span', 'lb-prog-num', done.length + ' / ' + list.length + T(' 任務　', ' missions · ') + got + ' / ' + total + ' ★'));
      wrap.appendChild(row);
    });
  }

  function setPub(pub) {
    const uid = st.user.uid;
    st.pub = pub;
    api.setPub(uid, pub).then(function () {
      if (myScore) return api.rename(uid, myScore, pub ? st.nickname : LM.mask(st.nickname), pub);
    }).then(refresh).catch(function () { refresh(); });
  }

  function refresh() {
    if (!api) return;
    api.top(100).then(function (list) {
      top = rankList(list);
      renderList();
      if (st.user) {
        return api.getScore(st.user.uid).then(function (sc) {
          myScore = sc;
          if (!sc) { myRank = null; return; }
          return api.countAbove(sc.stars).then(function (n) { myRank = n + 1; });
        });
      }
    }).then(function () { renderMe(); renderProgress(); }).catch(function () {
      $('list').innerHTML = '';
      $('list').appendChild(el('li', 'lb-empty', T('排行榜暫時無法載入，請稍後再試。', 'The leaderboard could not be loaded — please try again later.')));
      renderMe();
    });
  }

  // ---------- 管理員：同步任務清單（任務代號 → 星星數） ----------
  $('sync').addEventListener('click', function () {
    loaded.then(function () {
      const defs = {};
      const all = LM.all();
      Object.keys(all).forEach(function (k) { all[k].forEach(function (m) { defs[m.id] = m.level; }); });
      $('syncMsg').textContent = T('同步中…', 'Syncing…');
      return api.syncDefs(defs).then(function () {
        $('syncMsg').textContent = T('已同步 ', 'Synced ') + Object.keys(defs).length + T(' 個任務。', ' missions.');
      });
    }).catch(function () { $('syncMsg').textContent = T('同步失敗：請確認你是管理員，且資料庫規則已更新。', 'Sync failed: check you are an administrator and the database rules are up to date.'); });
  });

  if (!LM) { renderMe(); return; }
  LM._ready().then(function (b) {
    api = b;
    if (!api) { renderMe(); return; }
    let lastUid = null;
    api.onAuth(function (user) {
      const uid = user && user.uid;
      if (uid && uid !== lastUid) api.isAdmin(uid).then(function (a) { admin = a; $('admin').hidden = !a; });
      if (!uid) { admin = false; $('admin').hidden = true; }
      lastUid = uid;
    });
    refresh();
    // 登入狀態或任務資料載入後重新整理
    let wasReady = null;
    setInterval(function () {
      const key = (st.user && st.user.uid) + '|' + st.ready;
      if (key !== wasReady) { wasReady = key; loaded.then(refresh); }
    }, 400);
  }).catch(function () { renderMe(); });
})();
