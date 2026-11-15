/* 首頁：個人狀態、科目星星和本機推薦。靜態入口不等待 Firebase。 */
(function () {
  'use strict';
  const T = (zh, en) => window.LabSettings ? LabSettings.t(zh, en) : zh;
  const status = document.getElementById('home-status'); if (!status) return;
  const version = document.currentScript.src.split('?')[1] || 'v=home-v2';
  function load(file) { return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = 'js/' + file + '?' + version; s.onload = resolve; s.onerror = reject; document.head.appendChild(s); }); }
  function el(tag, cls, value) { const e = document.createElement(tag); if (cls) e.className = cls; if (value != null) e.textContent = value; return e; }
  function link(href, value, cls) { const e = el('a', cls, value); e.href = href; return e; }
  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  let catalog = [], core, data = {}, user = null, admin = false, hist = {}, pending = 0;
  const title = x => T(x.zh, x.en);
  function recent() { return Object.keys(hist).filter(s => catalog.some(x => x.s === s)).sort((a, b) => hist[b].t - hist[a].t).slice(0, 3).map(s => catalog.find(x => x.s === s)); }
  function thumb(x) { const img = el('img', 'module-thumb'); img.dataset.thumb = x.s; img.alt = ''; img.width = 96; img.height = 54; img.loading = 'lazy'; return img; }
  function makeRecent(x, progress) {
    const a = link(x.s + '.html', '', 'recent-lab'); a.dataset.hansSubject = window.LAB_SUBJECTS.find(s => s.dom === x.d).id; a.appendChild(thumb(x)); const box = el('span'); box.appendChild(el('strong', '', title(x)));
    if (progress != null) box.appendChild(el('small', '', T('完成 ' + progress + '/' + x.n, progress + '/' + x.n + ' missions done')));
    a.appendChild(box); return a;
  }
  function renderStatus() {
    status.replaceChildren(); status.setAttribute('aria-busy', 'false');
    const left = el('div', 'status-main'), right = el('div', 'status-recent'), past = recent(), done = core.doneCounts(catalog, data.done || {});
    if (user && data.unavailable) {
      left.appendChild(el('strong', '', T('進度暫時載入不了', 'Your progress could not load yet.')));
      right.appendChild(el('p', '', T('先選一科玩玩，稍後再回來看看。', 'Pick a subject to play. Check back in a moment.')));
      status.append(left, right); document.querySelectorAll('.subject-stars').forEach(e => { e.hidden = true; }); return;
    }
    if (!user) {
      left.appendChild(el('strong', '', T('登入，收集倪的星星', 'Sign in. Start collecting Ni stars.')));
      left.appendChild(el('p', '', T('完成任務，留下進度，挑戰排行榜。', 'Save your missions and see your place on the leaderboard.')));
      const b = el('button', 'primary status-signin', T('用 Google 登入', 'Sign in with Google')); b.type = 'button'; b.onclick = () => window.LabAccount && LabAccount.signIn(); left.appendChild(b);
      right.appendChild(el('small', '', T('最近玩過', 'Recently played')));
      if (!past.length) right.appendChild(el('p', '', T('還沒玩過，從下面挑一科開始。', 'Your first lab is waiting. Pick a subject below.')));
      past.forEach(x => right.appendChild(makeRecent(x)));
    } else {
      left.appendChild(el('strong', 'status-nickname', data.profile?.nickname || T('探索者', 'Explorer')));
      if (admin) left.appendChild(link('admin.html', T('管理員・管理頁 →', 'Admin · Dashboard →'), 'admin-badge'));
      left.appendChild(el('b', 'status-stars', '★ ' + (+data.score?.stars || 0).toLocaleString()));
      const rank = read('labRank:' + user.uid, null), age = rank ? Math.max(0, Math.floor((Date.now() - rank.at) / 86400000)) : 0;
      left.appendChild(link('leaderboard.html', rank?.rank > 0 ? T('第 ' + rank.rank + ' 名・' + age + ' 天前更新', 'Rank ' + rank.rank + ' · updated ' + age + 'd ago') : T('看我的名次 →', 'See my rank →'), 'rank-cache'));
      const daily = data.daily || {}, today = Math.floor((Date.now() + 8 * 3600000) / 86400000), n = daily.d === today ? Math.min(10, Math.max(0, +daily.n || 0)) : 0;
      const a = link('daily.html', T('今日每日任務 ', 'Today’s missions ') + n + '/10', 'status-daily'), meter = el('progress'); meter.max = 10; meter.value = n; meter.setAttribute('aria-label', T('今日完成 ' + n + ' 個每日任務', n + ' daily missions completed today')); a.appendChild(meter); left.appendChild(a);
      right.appendChild(el('small', '', T('繼續上次的實驗', 'Continue your last lab')));
      if (past[0]) right.appendChild(makeRecent(past[0], done[past[0].s] || 0));
      else right.appendChild(el('p', '', T('挑一科，開始你的下一個發現。', 'Pick a subject. Find your next discovery.')));
      right.appendChild(link('leaderboard.html#my', T('我的星星與成就 →', 'My stars & achievements →'), 'status-achievements'));
    }
    status.append(left, right);
    document.querySelectorAll('.subject-card').forEach(a => { const n = +data.score?.s?.[a.dataset.subject] || 0, star = a.querySelector('.subject-stars'); star.hidden = !user || !n; star.textContent = n ? '★ ' + n.toLocaleString() : ''; });
    if (window.LabThumbs) LabThumbs.apply(status);
  }
  function renderRecommendations() {
    const done = core.doneCounts(catalog, data.done || {}), past = recent(), result = core.recommend(catalog, hist, done, Date.now(), user && past[0] ? past[0].s : '');
    document.getElementById('recommend-title').textContent = result.personal ? T('為你推薦', 'Picked for you') : T('從這裡開始', 'Start here');
    const root = document.getElementById('recommendations'); root.replaceChildren();
    result.items.forEach(it => {
      const x = it.lab, sb = window.LAB_SUBJECTS.find(s => s.dom === x.d), a = link(x.s + '.html', '', 'entry-card'), subjectCard = document.querySelector('.subject-card[data-subject="' + sb.id + '"]');
      a.dataset.hansSubject = sb.id; a.style.setProperty('--c', subjectCard.style.getPropertyValue('--c')); a.appendChild(thumb(x)); a.appendChild(el('span', 'subject-tag', T(sb.zh, sb.en))); a.appendChild(el('h3', '', title(x)));
      const p = it.reason && result.byId[it.reason.source], type = it.reason?.type; let reason;
      if (p) { const name = title(p);
        if (type === 'chapter') reason = T('同一章：你玩過〈' + name + '〉', 'Same chapter as ' + name);
        else if (type === 'cross') reason = T('跨科：和〈' + name + '〉同主題', 'Across subjects: related to ' + name);
        else if (type === 'branch') reason = T('同一領域：你玩過〈' + name + '〉', 'Same field as ' + name);
        else reason = T('因為你玩過〈' + name + '〉', 'Because you tried ' + name);
      } else reason = type === 'starter' ? T('從這一科的入門實驗開始。', 'A first lab in this subject.') : T('換個領域，試試新的發現。', 'Try a new field. Find a new idea.');
      a.appendChild(el('p', 'entry-note', reason)); root.appendChild(a);
    });
    if (window.LabThumbs) LabThumbs.apply(root);
  }
  async function accountChange(e) {
    const state = e.detail || {}, seq = ++pending; user = state.user || null; admin = !!state.admin; data = {};
    if (!core) return;
    if (user && window.LabAccount) { status.setAttribute('aria-busy', 'true'); try { data = await LabAccount.readHome(user.uid); } catch (e) { data = { unavailable: true }; } if (seq !== pending) return; }
    renderStatus(); renderRecommendations();
  }
  window.addEventListener('lab:account', accountChange);
  requestAnimationFrame(() => setTimeout(async () => {
    try { await Promise.all([load('home-core.js'), load('catalog.js')]); core = window.LabHomeCore; catalog = window.LAB_CATALOG; hist = core.trimHistory(read('labHist', {})); await accountChange({ detail: window.LabAccount ? LabAccount.state() : {} }); }
    catch (e) { status.setAttribute('aria-busy', 'false'); status.textContent = T('先選一科開始，登入功能稍後再試。', 'Pick a subject to begin. Sign-in can wait.'); }
  }, 0));
})();
