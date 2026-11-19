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
  // 新科（資訊、地理、音樂）第一個實驗上線前不出現分頁（LAB_SUBJECT_SHOWN）
  const TABS = [{ id: 'all', zh: '全科總排名', en: 'All subjects' }].concat(SUBJ.filter(function (sb) { return !window.LAB_SUBJECT_SHOWN || window.LAB_SUBJECT_SHOWN(sb.id); }));
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

  // ---------- 多層收合（站長 11/16：「太長一串了，裡面所有的項目都要做收合。大抽屜裡面又有小抽屜……父、子、孫」） ----------
  // 用原生 <details>；每個抽屜的開合記在本機（lbFold:<鍵>），下次進來維持原樣。
  function fold(key, sumNodes, defOpen, cls) {
    const d = el('details', 'lb-fold' + (cls ? ' ' + cls : ''));
    let open = !!defOpen;
    try { const v = localStorage.getItem('lbFold:' + key); if (v !== null) open = v === '1'; } catch (e) { /* 無法讀取就用預設 */ }
    d.open = open;
    const sm = el('summary', 'lb-fold-sum');
    sumNodes.forEach(function (n) { sm.appendChild(n); });
    d.appendChild(sm);
    const body = el('div', 'lb-fold-body');
    d.appendChild(body);
    d.addEventListener('toggle', function () { try { localStorage.setItem('lbFold:' + key, d.open ? '1' : '0'); } catch (e) { /* 記不住也沒關係 */ } });
    return { d: d, body: body };
  }
  // 父層：頁面上每一大區（「我的狀態」永遠展開）
  const PARENT_OPEN = { board: true, treasureBoardPanel: true };
  ['treasures', 'treasureBoardPanel', 'board', 'achievements', 'progress', 'rules', 'admin'].forEach(function (id) {
    const sec = $(id); if (!sec) return;
    const h2 = sec.querySelector(':scope > h2'); if (!h2) return;
    const f = fold('p-' + id, [h2], PARENT_OPEN[id], 'lb-fold-p');
    Array.prototype.slice.call(sec.childNodes).forEach(function (n) { f.body.appendChild(n); });
    sec.appendChild(f.d);
    // 子層：規則說明的每個小節
    if (id === 'rules') {
      let cur = null;
      Array.prototype.slice.call(f.body.childNodes).forEach(function (n) {
        if (n.nodeType === 1 && n.tagName === 'H3') {
          const c = fold('r-' + (n.getAttribute('data-en') || n.textContent).toLowerCase().replace(/[^a-z0-9]+/g, '-'), [n], false, 'lb-fold-c');
          f.body.appendChild(c.d); cur = c.body; return;
        }
        if (cur) cur.appendChild(n);
      });
    }
  });
  // 子層：排行清單先顯示前 10 名，第 11–100 名收起來
  ['list', 'treasureList'].forEach(function (id) {
    const ol = $(id); if (!ol) return;
    ol.classList.add('lb-short');
    const btn = el('button', 'lb-more'); btn.type = 'button'; btn.hidden = true;
    btn.setAttribute('aria-controls', id);
    ol.insertAdjacentElement('afterend', btn);
    let expanded = false;
    try { expanded = localStorage.getItem('lbFold:more-' + id) === '1'; } catch (e) { /* 忽略 */ }
    function sync() {
      const n = ol.querySelectorAll(':scope > li:not(.lb-empty)').length;
      btn.hidden = n <= 10;
      ol.classList.toggle('lb-short', !expanded);
      btn.setAttribute('aria-expanded', String(expanded));
      btn.textContent = expanded ? T('▲ 收起第 11 名以後', '▲ Show top 10 only') : T('▼ 展開第 11–' + n + ' 名', '▼ Show ranks 11–' + n);
    }
    btn.addEventListener('click', function () {
      expanded = !expanded;
      try { localStorage.setItem('lbFold:more-' + id, expanded ? '1' : '0'); } catch (e) { /* 忽略 */ }
      sync();
    });
    new MutationObserver(sync).observe(ol, { childList: true });
    sync();
  });

  // 每日任務頁與排行榜使用同一張由核心機率公式產生的表。
  const dailyOdds = $('dailyOdds');
  if (dailyOdds && window.LabDailyCore) {
    const oddsBox = window.LabDailyCore.oddsTable(document, T);
    dailyOdds.appendChild(oddsBox);
    // 孫層：每日任務小節裡的兩張表各自收合
    Array.prototype.slice.call(oddsBox.children).forEach(function (n, i) {
      const cap = n.querySelector('caption');
      const g = fold('g-odds-' + i, [el('span', null, cap ? cap.textContent : '')], false, 'lb-fold-g');
      oddsBox.insertBefore(g.d, n); g.body.appendChild(n);
      if (cap) cap.remove();   // 表題已寫在抽屜摘要上，不重複
    });
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
      // 成績卡：存成圖片、分享到社群（js/sharecard.js，11/14）
      const sh = el('button', 'primary lb-share', T('分享我的成績（存成圖片）', 'Share my results (as an image)'));
      sh.type = 'button';
      sh.addEventListener('click', function () { LM.share({ scope: 'all', ranks: Object.assign({}, myRank) }); });
      box.appendChild(sh);
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
    row.appendChild(LabCatalogText.render(el('span', 'lb-prog-name'), T(m.zh, m.en)));
    const bar = el('span', 'lb-prog-bar');
    const fill = el('span', 'lb-prog-fill');
    fill.style.width = (total ? 100 * got / total : 0) + '%';
    bar.appendChild(fill);
    row.appendChild(bar);
    row.appendChild(el('span', 'lb-prog-num', done.length + ' / ' + list.length + T(' 任務　', ' missions · ') + got + ' / ' + total + ' ★'));
    return row;
  }

  // 孫層：每個實驗一個抽屜，摘要是進度列，展開看每個任務完成沒（隱藏任務不露出標題）
  function progressFold(m, all) {
    const row = progressRow(m, all);
    const sum = el('span', 'lb-prog');
    Array.prototype.slice.call(row.childNodes).forEach(function (n) { sum.appendChild(n); });
    const g = fold('m-' + m.id, [sum], false, 'lb-fold-g lb-fold-m');
    const ul = el('ul', 'lb-mlist');
    (all[m.id] || []).forEach(function (x) {
      const ok = !!st.done[x.id];
      const li = el('li', ok ? 'done' : null);
      li.appendChild(el('span', 'lb-m-mark', ok ? '✓' : '○'));
      li.appendChild(LabCatalogText.render(el('span', 'lb-m-name'), x.hidden ? T('隱藏任務', 'Hidden mission') : (x.title ? T(x.title.zh, x.title.en) : x.id)));
      li.appendChild(el('span', 'lb-m-star', (ok ? gotOf(x) : starsOf(x)) + ' ★'));
      ul.appendChild(li);
    });
    g.body.appendChild(ul);
    const go = el('a', 'lb-m-go', T('打開這個實驗 →', 'Open this lab →')); go.href = m.id + '.html';
    g.body.appendChild(go);
    return g.d;
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
      const c = fold('s-' + sb.id, [h], false, 'lb-fold-c');
      wrap.appendChild(c.d);
      // 科目（子）→ 分支（孫）→ 實驗（曾孫）→ 各任務
      const BR = window.LAB_MODULE_BRANCH || {}, BN = window.LAB_BRANCH_NAMES || {}, order = [], groups = {};
      mods.forEach(function (m) { const b = BR[m.id] || '-'; if (!groups[b]) { groups[b] = []; order.push(b); } groups[b].push(m); });
      order.forEach(function (b) {
        let bg = 0, bt = 0;
        groups[b].forEach(function (m) { (all[m.id] || []).forEach(function (x) { bt += starsOf(x); bg += gotOf(x); }); });
        const name = LabCatalogText.render(el('span', 'lb-br-name'), BN[b] ? T(BN[b].zh, BN[b].en) : (b === '-' ? T('其他', 'Other') : b));
        const num = el('small', 'lb-br-num', groups[b].length + T(' 個實驗・', ' labs · ') + bg + ' / ' + bt + ' ★');
        const g = fold('b-' + b, [name, num], false, 'lb-fold-g lb-fold-br');
        groups[b].forEach(function (m) { g.body.appendChild(progressFold(m, all)); });
        c.body.appendChild(g.d);
      });
    });
  }

  function setPub(pub) {
    const uid = st.user.uid;
    api.setPub(uid, pub).catch(function () { renderMe(); });
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
      top = rankList(list, t).slice(0, 100); // 邊界同分者已一起取回：排序後才截前 100 名
      renderList();
      if (st.user) {
        return api.getScore(st.user.uid).then(function (sc) {
          myScore = sc;
          if (!sc) { delete myRank.all; return; }
          return api.countAbove(sc.stars).then(function (n) {
            myRank.all = n + 1;
            try { localStorage.setItem('labRank:' + st.user.uid, JSON.stringify({ rank: n + 1, at: Date.now() })); } catch (e) { /* 無法保存時首頁顯示名次連結 */ }
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

  // ---------- 寶物排行：總價值與五種累計量，公開榜不讀取別人的 bag ----------
  const TC = window.LabDailyCore;
  let treasureMetric = 'v', treasureGeneration = 0;
  const treasureTitles = { v: ['寶物總價值', 'Total treasure value'], cu: ['銅幣', 'Copper coins'], ag: ['銀幣', 'Silver coins'], au: ['金幣', 'Gold coins'], dia: ['鑽石', 'Diamonds'], key: ['稀有鑰匙', 'Rare keys'] };
  const treasureTitle = function (key) { return T(treasureTitles[key][0], treasureTitles[key][1]); };
  // short：榜單每列只寫數字＋單位（「總價值」已在分頁與本人卡上），手機才不會把「銅」擠到第二行（主串 11/16）
  // 站長 11/16：榜單每列用 k、M、G、T 前綴（三位有效數字、無條件捨去，不會把 999,999 寫成 1000 k）
  function siShort(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n < 1000) return String(n);
    const units = ['k', 'M', 'G', 'T', 'P', 'E'];
    let i = -1, x = n;
    while (x >= 1000 && i < units.length - 1) { x /= 1000; i++; }
    const d = x >= 100 ? 0 : x >= 10 ? 1 : 2, k = Math.pow(10, d);
    return (Math.floor(x * k + 1e-9) / k).toFixed(d) + ' ' + units[i];
  }
  // 站長 11/16：「寶物的總值請以鑽石為單位計算。」資料庫的 v 仍以銅幣存（規則檢查加權和），只在顯示時換成鑽石（1 鑽石 = 1000 銅）
  function diamonds(v, short) {
    v = Math.max(0, Math.floor(Number(v) || 0));
    if (short && v >= 1e6) return siShort(Math.floor(v / 1000));
    return (v / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  function treasureAmount(row, metric, short) {
    if (metric === 'v') {
      const d = diamonds(row && row.v, short);
      return short ? T(d + ' 鑽石', d + ' diamonds') : T('總價值 ' + d + ' 顆鑽石', 'Value ' + d + ' diamonds');
    }
    const value = short ? siShort(row && row[metric]) : Number(row && row[metric] || 0).toLocaleString();
    return value + T(metric === 'dia' ? ' 顆' : metric === 'key' ? ' 把' : ' 枚', '');
  }
  function treasureTabs() {
    const box = $('treasureTabs'); box.innerHTML = '';
    TC.TREASURE_METRICS.forEach(function (key) {
      const button = el('button', 'tb-tab' + (treasureMetric === key ? ' selected' : ''), treasureTitle(key));
      button.type = 'button'; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(treasureMetric === key));
      button.setAttribute('aria-controls', 'treasureList'); button.dataset.metric = key;
      button.addEventListener('click', function () { treasureMetric = key; treasureTabs(); refreshTreasure(); box.querySelector('[data-metric="' + key + '"]').focus(); });
      box.appendChild(button);
    });
  }
  function refreshTreasure() {
    if (!api || !TC) return;
    const generation = ++treasureGeneration, metric = treasureMetric, uid = st.user && st.user.uid;
    $('treasureList').innerHTML = ''; $('treasureList').appendChild(el('li', 'lb-empty', T('載入中…', 'Loading…')));
    let syncFailed = false;
    const own = uid && st.ready ? LM.syncTreasure().catch(function () { syncFailed = true; return null; }) : Promise.resolve(null);
    own.then(function (mine) {
      return Promise.all([api.topTreasures(100, metric), uid ? api.get('bag/' + uid) : null]).then(function (r) {
        const totals = mine || TC.treasureTotals(r[1]);
        return Promise.all([r[0], totals, uid ? api.countTreasureAbove(totals[metric] || 0, metric) : null]);
      });
    }).then(function (r) {
      if (generation !== treasureGeneration || uid !== (st.user && st.user.uid)) return;
      const list = $('treasureList'); list.innerHTML = '';
      const rows = TC.rankTreasures(r[0], metric).slice(0, 100);
      rows.forEach(function (row) {
        const li = el('li', 'lb-row tb-row' + (row.uid === uid ? ' me' : '') + (row.rank <= 3 ? ' podium p' + row.rank : ''));
        li.dataset.uid = row.uid; li.appendChild(el('span', 'lb-rank', String(row.rank)));
        li.appendChild(el('span', 'lb-name', row.pub === false ? LM.mask(row.name) : String(row.name || '?')));
        const score = el('strong', 'tb-score', treasureAmount(row, metric, true)); score.title = treasureAmount(row, metric); li.appendChild(score); list.appendChild(li);
      });
      if (!rows.length) list.appendChild(el('li', 'lb-empty', T('還沒有人收集寶物，完成每日任務就能上榜！', 'No treasures collected yet. Clear a daily mission to join the board!')));
      const mine = $('treasureMe'); mine.innerHTML = '';
      if (uid) {
        const publicName = r[1].name || st.nickname || T('倪', 'You'), publicSetting = r[1].pub == null ? st.pub : r[1].pub;
        mine.appendChild(el('span', 'tb-myname', publicSetting ? publicName : LM.mask(publicName)));
        mine.appendChild(el('strong', 'tb-myrank', syncFailed ? T('排行資料尚未同步，請稍後重試', 'Ranking is not synced yet; please try again') : T('倪的名次：第 ' + (r[2] + 1) + ' 名', 'Your rank: ' + (r[2] + 1))));
        mine.appendChild(el('span', 'tb-myvalue', treasureAmount(r[1], metric)));
        if (!TC.treasureTotals(r[1]).v) mine.appendChild(el('small', null, T('完成每日任務即可開始收集；零枚也會顯示倪的名次。', 'Start collecting with a daily mission. Your rank is shown even at zero.')));
      } else mine.appendChild(el('span', 'lb-note', T('登入後會顯示倪的名次，即使不在前 100 名也看得到。', 'Sign in to see your rank, even outside the top 100.')));
    }).catch(function () {
      if (generation !== treasureGeneration) return;
      $('treasureList').innerHTML = ''; $('treasureList').appendChild(el('li', 'lb-empty', T('寶物排行暫時無法載入，請稍後再試。', 'The treasure ranking could not be loaded; please try again later.')));
      $('treasureMe').textContent = T('目前無法取得名次。', 'Your rank is unavailable right now.');
    });
  }
  function boardKind(kind) {
    const treasure = kind === 'treasure';
    $('board').hidden = treasure; $('treasureBoardPanel').hidden = !treasure;
    $('starsBoardButton').setAttribute('aria-selected', String(!treasure)); $('treasureBoardButton').setAttribute('aria-selected', String(treasure));
    if (treasure) refreshTreasure();
  }
  $('starsBoardButton').addEventListener('click', function () { boardKind('stars'); });
  $('treasureBoardButton').addEventListener('click', function () { boardKind('treasure'); });
  treasureTabs();
  TC.ITEMS.forEach(function (item) {
    const cell = el('div', 'tb-value r-' + item.id), art = el('span', 'dl-ico sm'); art.innerHTML = TC.icon(item.id); cell.appendChild(art);
    cell.appendChild(el('span', null, T(item.zh, item.en)));
    cell.appendChild(el('strong', null, diamonds(TC.TREASURE_WEIGHTS[item.id]) + T(' 鑽石', ' diamonds')));
    $('treasureValues').appendChild(cell);
  });
  if (LM) LM.on('profile', function () { refresh(); if (!$('treasureBoardPanel').hidden) refreshTreasure(); });
  renderTabs();
  let autoSynced = 0; // 本頁載入時 missions.js 已自動同步的任務數
  if (LM) LM.on('synced', function (n) { autoSynced += n; });
  if (window.LabAchievements) window.LabAchievements.renderInto($('achBox'));
  if (!LM) { renderMe(); return; }
  LM._ready().then(function (b) {
    api = b;
    if (!api) { renderMe(); return; }
    if (location.hash === '#treasure-board') { boardKind('treasure'); $('treasureBoardPanel').scrollIntoView({ block: 'start' }); }
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
    setInterval(function () { if (document.visibilityState === 'visible') { refresh(); if (!$('treasureBoardPanel').hidden) refreshTreasure(); } }, 60000);
    // 登入狀態或任務資料載入後重新整理
    let wasReady = null;
    setInterval(function () {
      const key = (st.user && st.user.uid) + '|' + st.ready;
      if (key !== wasReady) { wasReady = key; loaded.then(refresh); if (!$('treasureBoardPanel').hidden) refreshTreasure(); }
    }, 400);
  }).catch(function () { renderMe(); });
})();
