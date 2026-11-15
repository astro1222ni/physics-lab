/* 首頁：只讀個人的五個小節點；科目入口與每日活動先出現。 */
(function () {
  'use strict';
  const T = (zh, en) => window.LabSettings ? LabSettings.t(zh, en) : zh;
  const status = document.getElementById('home-status'); if (!status) return;
  const version = document.currentScript.src.split('?')[1] || 'v=home-v2';
  function load(file) { return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'js/' + file + '?' + version; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); }); }
  function el(tag, cls, value) { const e = document.createElement(tag); if (cls) e.className = cls; if (value != null) e.textContent = value; return e; }
  function link(href, value, cls) { const e = el('a', cls, value); e.href = href; return e; }
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  const treasureNames = { cu: ['銅幣', 'Copper coin'], ag: ['銀幣', 'Silver coin'], au: ['金幣', 'Gold coin'], dia: ['鑽石', 'Diamond'], key: ['稀有鑰匙', 'Rare key'] };
  let catalog = [], core, data = {}, user = null, admin = false, hist = {}, pending = 0, iconSerial = 0;
  const title = x => T(x.zh, x.en);
  function equalKeys() {
    const root = document.querySelector('.subject-groups'), cards = [...root.querySelectorAll('.subject-card')];
    root.style.removeProperty('--subject-key-min');
    root.style.setProperty('--subject-key-min', Math.ceil(Math.max(...cards.map(a => a.getBoundingClientRect().height))) + 'px');
  }
  window.addEventListener('resize', equalKeys);
  // 11/15 站長：四大類區塊點開才展開；記住每個人上次開了哪幾塊（只存在這台裝置）
  document.querySelectorAll('details.subject-group').forEach(d => {
    const open = read('labHomeGroups', {});
    if (open[d.dataset.group]) d.open = true;
    d.addEventListener('toggle', () => {
      const o = read('labHomeGroups', {}); o[d.dataset.group] = d.open ? 1 : 0;
      try { localStorage.setItem('labHomeGroups', JSON.stringify(o)); } catch (e) {}
      if (d.open) equalKeys();
    });
  });
  const clock = () => Date.now() + (window.LAB_MISSIONS_BACKEND ? +(localStorage.getItem('mockoffset') || 0) : 0);
  function recent() { return Object.keys(hist).filter(s => catalog.some(x => x.s === s)).sort((a, b) => hist[b].t - hist[a].t).slice(0, 3).map(s => catalog.find(x => x.s === s)); }
  function thumb(x) { const img = el('img', 'module-thumb'); img.dataset.thumb = x.s; img.alt = ''; img.width = 96; img.height = 60; img.loading = 'lazy'; return img; }
  function makeRecent(x, progress) {
    const a = link(x.s + '.html', '', 'recent-lab'); a.dataset.hansSubject = window.LAB_SUBJECTS.find(s => s.dom === x.d).id; a.appendChild(thumb(x)); const box = el('span'); box.appendChild(el('strong', '', title(x)));
    if (progress != null) box.appendChild(el('small', '', T('完成 ' + progress + '/' + x.n, progress + '/' + x.n + ' missions done')));
    a.appendChild(box); return a;
  }
  // 骨架直接沿用實際版型和字串，讓英文換行與特大字也先佔到正確高度。
  function renderSkeleton() {
    const member = !!read('labHomeSignedIn', 0), hasPast = Object.keys(read('labHist', {})).length > 0;
    const copy = (tag, cls, zh, en) => { const e = el(tag, cls, T(zh, en)); e.dataset.en = en; return e; };
    const shell = el('div', 'status-skeleton'); shell.setAttribute('aria-hidden', 'true');
    const left = el('div', 'status-main'), right = el('div', 'status-recent');
    if (member) {
      const summary = el('span', 'status-summary'); summary.appendChild(copy('span', 'status-nickname', '探索者', 'Explorer'));
      const row = el('span', 'status-score-row'); row.append(el('b', 'status-stars', '★ 999'), copy('span', 'rank-cache', '全科第 99 名', 'Rank 99 overall')); summary.appendChild(row);
      const bag = el('span', 'status-treasures'); for (let i = 0; i < 5; i++) { const it = el('span', 'treasure-count'), icon = el('span', 'treasure-placeholder'); it.append(icon, el('span', '', '99')); bag.appendChild(it); } summary.appendChild(bag); left.appendChild(summary);
      right.appendChild(copy('small', '', '繼續上次的實驗', 'Continue your last lab'));
      if (hasPast) { const recent = el('span', 'recent-lab'); recent.appendChild(el('span', 'module-thumb')); const box = el('span'); box.append(copy('strong', '', '上次的實驗', 'Your last lab'), copy('small', '', '完成 0/00', '0/00 missions done')); recent.appendChild(box); right.appendChild(recent); }
      else right.appendChild(copy('p', '', '挑一科，開始你的下一個發現。', 'Pick a subject. Find your next discovery.'));
    } else {
      left.append(copy('strong', 'guest-title', '登入，收集倪的星星', 'Sign in. Start collecting Ni stars.'), copy('p', '', '星星、名次、寶物都會留下來。', 'Keep your stars, rank and treasures.'));
      if (hasPast) { right.classList.add('has-pills'); right.appendChild(copy('small', '', '最近玩過', 'Recently played')); const pills = el('div', 'recent-pills'); for (let i = 0; i < 3; i++) { const pill = el('span', 'recent-lab'); pill.append(el('span', 'module-thumb'), el('strong', '', '…')); pills.appendChild(pill); } right.appendChild(pills); }
      else right.appendChild(copy('p', 'no-history', '還沒玩過，從下面挑一科開始。', 'Your first lab is waiting. Pick a subject below.'));
    }
    const cta = el('button', 'status-primary home-cta'); cta.disabled = true; cta.append(el('span', member ? 'star-icon' : 'google-icon', member ? '★' : 'G'), copy('span', '', member ? '我的星星與成就 →' : '登入，看我的星星與成就', member ? 'My stars & achievements →' : 'Sign in to see my stars & achievements'));
    const footer = el('div', 'status-links'); footer.appendChild(copy('span', 'skeleton-board', '全站排行榜 →', 'Leaderboard →'));
    shell.append(left, right, cta, footer); status.replaceChildren(shell);
    if (member) {
      const box = document.getElementById('daily-content'); box.classList.add('daily-is-pending');
      const progress = el('div', 'daily-progress'), dots = el('span', 'daily-dots'); for (let i = 0; i < 10; i++) dots.appendChild(el('i')); progress.append(dots, copy('span', '', '今天完成 0/10', '0/10 done today'));
      box.replaceChildren(progress, copy('p', 'daily-countdown', '0 小時 00 分後換新', 'New set in 0 h 00 min'));
    } else {
      document.getElementById('daily-content').replaceChildren(copy('p', 'daily-description', '每天 00:00 換新十個。完成拿星星，還有機會掉寶物。', 'Ten new missions every day at 00:00. Earn stars and a chance at treasure.'));
    }
    document.getElementById('daily-title').textContent = T('今天的十個任務', 'Today’s 10 missions');
    document.querySelector('.daily-meta > span').textContent = T('每日任務', 'Daily missions');
    document.getElementById('daily-peek').textContent = T('先看看 →', 'Take a look →');
    document.querySelector('#daily-actions button').textContent = T('登入，開始每日任務', 'Sign in to start');
  }
  function treasureIcon(id) {
    const svg = document.querySelector('.treasure-fan [data-treasure="' + id + '"] svg').cloneNode(true), prefix = 'homebag' + (++iconSerial);
    svg.querySelectorAll('[id]').forEach(n => { const old = n.id; n.id = prefix + old; svg.querySelectorAll('[fill]').forEach(p => { if (p.getAttribute('fill') === 'url(#' + old + ')') p.setAttribute('fill', 'url(#' + n.id + ')'); }); });
    return svg;
  }
  function signIn(destination) {
    try { sessionStorage.setItem('labAfterLogin', destination); } catch (e) { return; }
    if (window.LabAccount) LabAccount.signIn();
  }
  function primary(destination, signedText, guestText, cls) {
    const b = user ? link(destination + '.html', signedText, cls) : el('button', cls, guestText); b.classList.add('home-cta');
    if (!user) { b.type = 'button'; b.disabled = !(window.LabAccount && LabAccount.state().ready); b.onclick = () => signIn(destination); }
    return b;
  }
  function renderStatus() {
    status.replaceChildren(); status.setAttribute('aria-busy', 'false'); status.classList.toggle('is-member', !!user);
    try { localStorage.setItem('labHomeSignedIn', user ? '1' : '0'); } catch (e) {}
    if (user) document.documentElement.dataset.homeMember = '1'; else delete document.documentElement.dataset.homeMember;
    const left = el('div', 'status-main'), right = el('div', 'status-recent'), past = recent(), done = core.doneCounts(catalog, data.done || {});
    if (user && data.unavailable) {
      left.appendChild(el('strong', '', T('進度暫時載入不了', 'Your progress could not load yet.')));
      right.appendChild(el('p', '', T('先選一科玩玩，稍後再回來看看。', 'Pick a subject to play. Check back in a moment.')));
    } else if (!user) {
      left.appendChild(el('strong', 'guest-title', T('登入，收集倪的星星', 'Sign in. Start collecting Ni stars.')));
      left.appendChild(el('p', '', T('星星、名次、寶物都會留下來。', 'Keep your stars, rank and treasures.')));
      if (!past.length) right.appendChild(el('p', 'no-history', T('還沒玩過，從下面挑一科開始。', 'Your first lab is waiting. Pick a subject below.')));
      else { right.classList.add('has-pills'); right.appendChild(el('small', '', T('最近玩過', 'Recently played'))); const pills = el('div', 'recent-pills'); past.forEach(x => pills.appendChild(makeRecent(x))); right.appendChild(pills); }
    } else {
      const summary = link('leaderboard.html', '', 'status-summary'); summary.appendChild(el('span', 'status-nickname', data.profile?.nickname || T('探索者', 'Explorer')));
      const row = el('span', 'status-score-row'); row.appendChild(el('b', 'status-stars', '★ ' + (+data.score?.stars || 0).toLocaleString()));
      const rank = read('labRank:' + user.uid, null), n = core.rankNumber(rank, clock()), rankText = el('span', 'rank-cache', n ? T('全科第 ' + n + ' 名', 'Rank ' + n + ' overall') : T('看我的名次', 'See my rank'));
      if (n) rankText.title = T(Math.floor((clock() - rank.at) / 86400000) + ' 天前更新', 'Updated ' + Math.floor((clock() - rank.at) / 86400000) + 'd ago'); row.appendChild(rankText); summary.appendChild(row);
      const bag = el('span', 'status-treasures');
      core.holdings(data.bag).forEach(it => { const item = el('span', 'treasure-count' + (it.left ? '' : ' is-zero')); item.dataset.item = it.id; item.setAttribute('aria-label', T(...treasureNames[it.id]) + T('，現在剩下 ', ', remaining ') + it.left); item.append(treasureIcon(it.id), el('span', '', it.left.toLocaleString())); bag.appendChild(item); });
      summary.appendChild(bag); left.appendChild(summary);
      right.appendChild(el('small', '', T('繼續上次的實驗', 'Continue your last lab')));
      if (past[0]) right.appendChild(makeRecent(past[0], done[past[0].s] || 0));
      else right.appendChild(el('p', '', T('挑一科，開始你的下一個發現。', 'Pick a subject. Find your next discovery.')));
    }
    const cta = primary('leaderboard', T('我的星星與成就 →', 'My stars & achievements →'), T('登入，看我的星星與成就', 'Sign in to see my stars & achievements'), 'status-primary');
    const icon = el('span', user ? 'star-icon' : 'google-icon', user ? '★' : ''); if (!user && window.LabAccount) icon.innerHTML = LabAccount.googleIcon(); icon.setAttribute('aria-hidden', 'true'); cta.prepend(icon);
    const footer = el('div', 'status-links'); footer.appendChild(link('leaderboard.html#board', T('全站排行榜 →', 'Leaderboard →'))); if (admin) footer.appendChild(link('admin.html', T('管理員・管理頁 →', 'Admin · Dashboard →'), 'admin-badge'));
    status.append(left, right, cta, footer);
    document.querySelectorAll('.subject-card').forEach(a => { const n = +data.score?.s?.[a.dataset.subject] || 0, star = a.querySelector('.subject-stars'); star.hidden = !user || data.unavailable || !n; star.textContent = n ? '★ ' + n.toLocaleString() : ''; });
    if (window.LabThumbs) LabThumbs.apply(status);
  }
  function renderDaily() {
    const content = document.getElementById('daily-content'), actions = document.getElementById('daily-actions'); content.classList.remove('daily-is-pending'); content.replaceChildren(); actions.replaceChildren();
    if (user && !data.unavailable) {
      const n = core.dailyProgress(data.daily, clock()), dots = el('span', 'daily-dots'); dots.setAttribute('aria-hidden', 'true'); for (let i = 0; i < 10; i++) dots.appendChild(el('i', i < n ? 'done' : ''));
      const line = el('div', 'daily-progress'); line.append(dots, el('span', '', T('今天完成 ' + n + '/10', n + '/10 done today'))); content.appendChild(line);
      const mins = Math.max(1, Math.ceil(core.msToReset(clock()) / 60000)), h = Math.floor(mins / 60), m = mins % 60;
      content.appendChild(el('p', 'daily-countdown', n === 10 ? T('今天全部完成！明天 00:00 再來。', 'All done today! New missions at 00:00.') : T(h + ' 小時 ' + m + ' 分後換新', 'New set in ' + h + ' h ' + m + ' min')));
    } else content.appendChild(el('p', 'daily-description', user ? T('進度暫時載入不了，先到任務頁看看。', 'Progress could not load yet. Take a look at the missions.') : T('每天 00:00 換新十個。完成拿星星，還有機會掉寶物。', 'Ten new missions every day at 00:00. Earn stars and a chance at treasure.')));
    actions.appendChild(primary('daily', T('去做每日任務 →', 'Go to daily missions →'), T('登入，開始每日任務', 'Sign in to start'), 'daily-primary'));
    document.getElementById('daily-peek').hidden = !!user;
  }
  function renderRecommendations() {
    const done = core.doneCounts(catalog, data.done || {}), past = recent(), result = core.recommend(catalog, hist, done, clock(), user && past[0] ? past[0].s : '');
    document.getElementById('recommend-title').textContent = result.personal ? T('為你推薦', 'Picked for you') : T('從這裡開始', 'Start here');
    const root = document.getElementById('recommendations'); root.replaceChildren();
    result.items.forEach(it => {
      const x = it.lab, sb = window.LAB_SUBJECTS.find(s => s.dom === x.d), a = link(x.s + '.html', '', 'entry-card'), subjectCard = document.querySelector('.subject-card[data-subject="' + sb.id + '"]');
      a.dataset.hansSubject = sb.id; a.style.setProperty('--c', subjectCard.style.getPropertyValue('--c')); a.appendChild(thumb(x)); a.appendChild(el('span', 'subject-tag', T(sb.zh, sb.en))); a.appendChild(el('h3', '', title(x)));
      const p = it.reason && result.byId[it.reason.source], type = it.reason?.type; let reason;
      if (p) { const name = core.shortName(title(p));
        if (type === 'chapter') reason = T('同一章：你玩過〈' + name + '〉', 'Same chapter as ' + name);
        else if (type === 'cross') reason = T('跨科：和〈' + name + '〉同主題', 'Across subjects: related to ' + name);
        else if (type === 'branch') reason = T('同一領域：你玩過〈' + name + '〉', 'Same field as ' + name);
        else reason = T('因為你玩過〈' + name + '〉', 'Because you tried ' + name);
      } else reason = type === 'starter' ? T(x.bzh + '入門', 'Starter · ' + x.ben) : T('換個領域，試試新的發現。', 'Try a new field. Find a new idea.');
      const note = el('p', 'entry-note', reason); note.title = reason; a.appendChild(note); root.appendChild(a);
    });
    if (window.LabThumbs) LabThumbs.apply(root);
  }
  async function accountChange(e) {
    const state = e.detail || {}, seq = ++pending, nextUser = state.user || null; user = nextUser; admin = !!state.admin; data = {};
    if (!core) return;
    let fetched = {};
    if (nextUser && window.LabAccount) { status.setAttribute('aria-busy', 'true'); try { fetched = await LabAccount.readHome(nextUser.uid); } catch (e) { fetched = { unavailable: true }; } }
    if (seq !== pending) return; data = fetched;
    renderStatus(); renderDaily(); renderRecommendations(); equalKeys();
  }
  try { renderSkeleton(); } catch (e) { /* 儲存空間不可用時，保留靜態骨架。 */ }
  window.addEventListener('lab:account', accountChange);
  document.fonts.ready.then(equalKeys);
  requestAnimationFrame(equalKeys);
  document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(equalKeys));
  setInterval(() => { if (core) renderDaily(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && core) renderDaily(); });
  window.addEventListener('storage', e => { if (e.key === 'mockoffset' && core) renderDaily(); });
  requestAnimationFrame(() => setTimeout(async () => {
    try { await Promise.all([load('home-core.js'), load('catalog.js')]); core = window.LabHomeCore; catalog = window.LAB_CATALOG; hist = core.trimHistory(read('labHist', {})); await accountChange({ detail: window.LabAccount ? LabAccount.state() : {} }); }
    catch (e) { status.setAttribute('aria-busy', 'false'); status.textContent = T('先選一科開始，登入功能稍後再試。', 'Pick a subject to begin. Sign-in can wait.'); }
  }, 0));
})();
