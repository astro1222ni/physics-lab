/*
 * daily.js — 每日任務與寶物（需登入 Google 帳號；計算在 js/daily-core.js）
 *
 * 兩種用法：
 *   1. daily.html（頁面有 #dailyApp）：今天的十個每日任務、換日倒數、我的寶物、掉寶機率、規則。
 *   2. 實驗頁網址加 ?daily=<任務代號>（missions.js 自動載入本檔）：實驗上方顯示每日任務橫幅；
 *      任務達成時 missions.js 呼叫 LabDaily.completed(m, 這次是否也拿到星星)，在這裡擲骰、寫入、播放掉寶動畫。
 * 每個每日任務今天只能完成一次，十個做完這一天就結束（11/12 站長）。每次完成依機率掉寶（新任務照樣得星，掉寶機率和做過的任務一樣）。
 * 資料（資料庫規則見 firebase/database.rules.json）：
 *   daily/<uid> = { d: 臺灣日序, picks: [十個任務代號], n: 今天完成了幾個（最多 10）, at: 上次完成的伺服器時間, done: { 任務代號: true } }
 *   bag/<uid>   = { cu, ag, au, dia, key（累計獲得，只增不減）, dm（累計完成的每日任務數）, used: { 寶物: 已使用數 }（之後的消費功能用） }
 *   每完成一個每日任務寫一次：n 加一、done 加一筆、dm 加一，掉寶時該寶物再加上數量（一次最多一種寶物，規則會檢查）。
 * 換日：臺灣時間 00:00，以伺服器時間為準。
 */
(function () {
  'use strict';
  const LM = window.LabMission, C = window.LabDailyCore;
  if (!LM || !C || window.LabDaily) return;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const L = function (o) { return o ? T(o.zh, o.en || o.zh) : ''; };
  const st = LM._state;
  const app = document.getElementById('dailyApp');

  const D = { api: null, uid: null, offset: 0, rec: null, bag: {}, loaded: false, failed: false, saveFailed: false, msg: '' };
  let queue = Promise.resolve();

  function now() { return Date.now() + D.offset; }
  function today() { return C.dayNumber(now()); }
  function stars() { return Object.keys(st.done || {}).reduce(function (a, id) { return a + (+st.done[id].stars || 0); }, 0); }
  function modOf(id) { return String(id).replace(/-(h?\d+)$/, ''); }
  function findMission(id) {
    const list = LM.all()[modOf(id)] || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function moduleName(mod) {
    const m = (window.LAB_MISSION_MODULES || []).filter(function (x) { return x.id === mod; })[0];
    return m ? T(m.zh, m.en) : mod;
  }
  /** 今天的每日任務代號（依難度排列）；舊版紀錄的 { easy, mid, hard } 也讀得懂 */
  function picks() {
    const p = (D.rec && D.rec.picks) || [];
    const ids = Array.isArray(p) ? p.slice() : ['easy', 'mid', 'hard'].map(function (k) { return p[k]; }).concat(Object.keys(p).filter(function (k) { return /^[0-9]$/.test(k); }).sort().map(function (k) { return p[k]; }));
    return ids.filter(function (id, i) { return id && ids.indexOf(id) === i; });
  }
  function isLegacy() { const p = D.rec && D.rec.picks; return !!(p && !Array.isArray(p) && (p.easy || p.mid || p.hard)); }
  function doneToday(id) { return !!(D.rec && D.rec.done && D.rec.done[id]); }
  function doneCount() { return picks().filter(doneToday).length; }
  /** 這個任務是不是今天的每日任務（已載入、沒有換日） */
  function isPick(id) { return !!(D.loaded && D.rec && D.rec.d === today() && picks().indexOf(id) >= 0); }
  /** 今天的每日任務、而且今天還沒完成（只有這時候才判定、掉寶） */
  function active(id) { return isPick(id) && !doneToday(id); }
  function pct(x) { const v = 100 * x; return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%'; }

  // ======================= 圖示 =======================
  const icon = C.icon; // 寶物圖示在 daily-core.js（排行榜頁也用）
  const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4.5" width="18" height="16.5" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15.2" r="2.7" fill="currentColor"/></svg>';
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  const STAR_O = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.4l2.4 5 5.4.7-4 3.7 1 5.4L12 16.6l-4.8 2.6 1-5.4-4-3.7 5.4-.7z" fill="none" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  function itemName(id) { const it = C.ITEMS.filter(function (x) { return x.id === id; })[0]; return it ? T(it.zh, it.en) : id; }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  /**
   * 星星徽章（11/12 站長：已經無法再取得的星星，和完成可以拿到的新星星，要在畫面與文字上分開）
   *   'new'：以前沒領過，完成可得 n 顆新星星（金色實心）
   *   'got'：以前已領過，重做不再加星（灰色空心）
   *   不傳：只顯示等級
   */
  function starBadge(n, state) {
    const b = el('span', 'ms-stars' + (state ? ' dl-star-' + state : ''));
    b.innerHTML = state === 'got' ? STAR_O : STAR;
    b.appendChild(el('span', null, state === 'new' ? T('+' + n + ' 顆星', '+' + n + ' stars') : state === 'got' ? T(n + ' 顆星已領過', n + ' stars claimed') : '×' + n));
    b.setAttribute('aria-label', state === 'new' ? T('完成可得 ' + n + ' 顆新的倪的星星', 'Clear it to earn ' + n + ' new Ni stars')
      : state === 'got' ? T('這個任務的 ' + n + ' 顆星以前已經領過，不會再加星', 'This mission’s ' + n + ' stars were already claimed — no more stars')
        : n + T(' 顆倪的星星', ' Ni stars'));
    return b;
  }
  /** 這個任務的星星狀態：登入且任務資料載入後才知道 */
  function starState(id) { return st.user && st.ready ? (st.done[id] ? 'got' : 'new') : null; }
  /** 一個還沒完成的每日任務的說明：星星可得或已領過，以及掉寶機率（新任務與做過的任務一樣） */
  function rewardChips(m) {
    const chips = el('div', 'dl-chips');
    if (st.done[m.id]) chips.appendChild(el('span', 'dl-chip got', T('星星已領過：不再加星', 'Stars already claimed: none to add')));
    else chips.appendChild(el('span', 'dl-chip new', T('新任務：完成得 ' + m.level + ' 顆星', 'New: clear it for ' + m.level + ' stars')));
    chips.appendChild(el('span', 'dl-chip gold', T('掉寶機率 ', 'Treasure chance ') + pct(C.repeatChance(m.level, stars()))));
    return chips;
  }
  function bandChip(level) {
    const b = C.bandOf(level);
    return el('span', 'dl-band dl-band-' + b.id, T(b.zh, b.en));
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ======================= 載入與換日 =======================
  function load() {
    const uid = D.uid;
    D.loaded = false; D.failed = false; D.loading = true;
    render();
    Promise.all([
      D.api.serverOffset ? D.api.serverOffset().catch(function () { return 0; }) : 0,
      D.api.get('daily/' + uid).catch(function () { return null; }),
      D.api.get('bag/' + uid).catch(function () { return null; }),
      LM.loadAll()
    ]).then(function (r) {
      if (D.uid !== uid) return;
      D.offset = +r[0] || 0;
      D.rec = r[1];
      D.bag = r[2] || {};
      return ensureToday();
    }).then(function () {
      D.loading = false;
      if (D.uid !== uid) return;
      D.loaded = true;
      render();
    }).catch(function () { D.loading = false; D.failed = true; render(); });
  }
  /**
   * 今天還沒有每日任務：抽十個並寫入資料庫（寫入失敗也照樣顯示，只是掉寶無法記錄）。
   * 今天的紀錄還是舊版（每天三個）：保留已抽到、已完成的任務，補滿到十個。
   */
  function ensureToday() {
    const d = today();
    const legacy = !!(D.rec && D.rec.d === d && isLegacy());
    if (D.rec && D.rec.d === d && D.rec.picks && !legacy) return Promise.resolve();
    const pool = [];
    const live = window.LAB_LIVE_MODULES || [];
    const all = LM.all();
    Object.keys(all).forEach(function (k) {
      if (live.indexOf(k) < 0) return;
      all[k].forEach(function (m) { if (!m.hidden) pool.push({ id: m.id, module: k, level: m.level }); });
    });
    const ids = C.pick(pool, D.uid, d, legacy ? picks() : null);
    const done = legacy && D.rec.done ? D.rec.done : {};
    const n = legacy ? (+D.rec.n || 0) : 0;
    const rec = { d: d, picks: ids, n: n, at: D.api.now() };
    if (Object.keys(done).length) rec.done = done;
    D.rec = { d: d, picks: ids, n: n, at: now(), done: Object.assign({}, done) };
    return D.api.update({ ['daily/' + D.uid]: rec }).then(function () { D.saveFailed = false; }, function () { D.saveFailed = true; });
  }

  // ======================= 完成每日任務：擲骰與寫入 =======================
  /** missions.js 呼叫：m 是剛達成的每日任務；newStars = 以前沒領過這個任務的星星（這次也拿到星星） */
  function completed(m, newStars) {
    queue = queue.then(function () { return reward(m, newStars); }).catch(function () { /* 下次再試 */ });
  }
  function reward(m, newStars) {
    if (!isPick(m.id)) { D.msg = T('每日任務已經換新了，請回每日任務頁看看今天的任務。', 'The daily missions have been refreshed — check today’s list.'); render(); return; }
    if (doneToday(m.id)) { toast(T('今天已經完成這個每日任務了，明天 00:00 會換新。', 'You have already cleared this daily mission today — new ones arrive at 00:00.')); return; }
    const drop = C.roll(m.level, stars(), false);
    // 資料庫規則：兩次完成的伺服器時間至少隔 10 秒
    const wait = Math.max(0, ((D.rec && D.rec.at) || 0) + C.GAP - now());
    return delay(wait).then(function () {
      const P = 'daily/' + D.uid + '/', B = 'bag/' + D.uid + '/';
      const map = {};
      map[P + 'n'] = ((D.rec && D.rec.n) || 0) + 1;
      map[P + 'at'] = D.api.now();
      map[P + 'done/' + m.id] = true;
      map[B + 'dm'] = D.api.inc(1);
      if (drop) map[B + drop.item] = D.api.inc(drop.qty);
      return D.api.update(map).then(function () {
        D.rec.n = ((D.rec && D.rec.n) || 0) + 1;
        D.rec.at = now();
        D.rec.done = D.rec.done || {}; D.rec.done[m.id] = true;
        if (drop) D.bag[drop.item] = (D.bag[drop.item] || 0) + drop.qty;
        D.bag.dm = (D.bag.dm || 0) + 1;
        D.msg = '';
        const left = picks().length - doneCount();
        if (drop) setTimeout(function () { showDrop(drop); }, newStars ? 2500 : 0); // 有星星時，等星星的慶祝畫面結束
        else toast(T('這次沒有掉寶（掉寶機率 ' + pct(C.repeatChance(m.level, stars())) + '）。', 'No treasure this time (drop chance ' + pct(C.repeatChance(m.level, stars())) + ').') +
          (left ? T('今天還有 ' + left + ' 個每日任務。', ' ' + left + ' daily missions left today.') : T('今天的每日任務全部完成了！', ' All of today’s daily missions are done!')));
        try { window.dispatchEvent(new CustomEvent('lab:loot', { detail: { item: drop ? drop.item : null, qty: drop ? drop.qty : 0, first: newStars, bag: Object.assign({}, D.bag) } })); } catch (e) { /* 忽略 */ }
        render();
      }, function () {
        D.msg = T('這次完成沒有記錄成功（網路或資料庫規則的問題），請再做一次。', 'This clear was not recorded (network or database rules) — please try again.');
        render();
      });
    });
  }

  // ======================= 掉寶動畫與提示 =======================
  const SOUND = { cu: [659, 880], ag: [784, 1047, 1319], au: [880, 1175, 1568], dia: [988, 1319, 1760, 2093], key: [523, 784, 1047, 1568, 2093] };
  function showDrop(drop) {
    const ov = el('div', 'dl-drop r-' + drop.item);
    ov.setAttribute('role', 'status');
    const box = el('div', 'dl-drop-box');
    box.appendChild(el('div', 'dl-drop-kicker', T('掉寶了！', 'Treasure!')));
    const art = el('div', 'dl-drop-art');
    art.appendChild(el('span', 'dl-rays'));
    const ic = el('span', 'dl-ico');
    ic.innerHTML = icon(drop.item);
    art.appendChild(ic);
    box.appendChild(art);
    box.appendChild(el('div', 'dl-drop-name', itemName(drop.item) + ' ×' + drop.qty));
    if (drop.item === 'key' || drop.item === 'dia') box.appendChild(el('div', 'dl-drop-rare', drop.item === 'key' ? T('稀有！', 'Rare!') : T('閃閃發亮！', 'Sparkling!')));
    ov.appendChild(box);
    document.body.appendChild(ov);
    const S = window.LabSound;
    if (S && S.enabled()) (SOUND[drop.item] || []).forEach(function (f, i) { S.tone({ freq: f, dur: 0.16, gain: 0.4, delay: i * 0.09, type: 'triangle' }); });
    const close = function () { ov.classList.add('out'); setTimeout(function () { ov.remove(); }, 300); };
    setTimeout(close, drop.item === 'key' || drop.item === 'dia' ? 3400 : 2600);
  }
  function toast(text) {
    let box = document.getElementById('dl-toasts');
    if (!box) { box = el('div', 'dl-toasts'); box.id = 'dl-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = el('div', 'dl-toast', text);
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, 3200);
  }

  // ======================= 實驗頁：每日任務橫幅 =======================
  let banner = null;
  function renderBanner() {
    if (!st.daily) return;
    if (!banner) {
      banner = el('section', 'dl-banner');
      banner.setAttribute('aria-live', 'polite');
      const wrap = document.querySelector('.ms-wrap');
      const anchor = wrap || document.querySelector('.stats-bar') || document.querySelector('header.top');
      if (wrap) wrap.insertAdjacentElement('beforebegin', banner);
      else if (anchor) anchor.insertAdjacentElement('afterend', banner);
      else (document.querySelector('.wrap') || document.body).prepend(banner);
    }
    banner.innerHTML = '';
    const head = el('div', 'dl-banner-head');
    const tag = el('a', 'dl-tag');
    tag.href = 'daily.html';
    tag.innerHTML = CAL;
    tag.appendChild(el('span', null, T('每日任務', 'Daily mission')));
    head.appendChild(tag);
    const m = findMission(st.daily);
    if (m) { head.appendChild(bandChip(m.level)); head.appendChild(starBadge(m.level, starState(m.id))); }
    const back = el('a', 'dl-back', T('回每日任務', 'All daily missions'));
    back.href = 'daily.html';
    head.appendChild(back);
    banner.appendChild(head);
    if (m) {
      banner.appendChild(el('strong', 'dl-banner-title', L(m.title)));
      banner.appendChild(el('p', 'dl-banner-desc', L(m.desc)));
    }
    const line = el('p', 'dl-banner-status');
    if (!st.user) {
      line.textContent = T('每日任務需要登入 Google 帳號，才能記錄完成與寶物。', 'Sign in with Google to record daily missions and treasures.');
      banner.appendChild(line);
      const b = el('button', 'primary dl-signin', T('用 Google 帳號登入', 'Sign in with Google'));
      b.type = 'button';
      b.addEventListener('click', function () { if (D.api) D.api.signIn().catch(function () {}); });
      banner.appendChild(b);
      return;
    }
    if (!st.nickname && st.ready) {
      line.textContent = T('請在下方的任務面板先取好暱稱，才會開始判定。', 'Choose a nickname in the mission panel below to start.');
      banner.appendChild(line);
      return;
    }
    if (!D.loaded) { line.textContent = D.failed ? T('每日任務暫時無法載入。', 'Daily missions could not be loaded.') : T('載入中…', 'Loading…'); banner.appendChild(line); return; }
    if (!isPick(st.daily)) {
      banner.classList.add('expired');
      line.textContent = T('這不是今天的每日任務（每天臺灣時間 00:00 換新）。這個實驗照樣可以玩，但不會掉寶。', 'This is not one of today’s daily missions (they refresh at 00:00 Taiwan time). You can still play, but nothing will drop.');
      banner.appendChild(line);
      return;
    }
    banner.classList.remove('expired');
    if (doneToday(st.daily)) {
      const left = picks().length - doneCount();
      line.textContent = T('✓ 今天已經完成這個每日任務（每個每日任務一天只能完成一次）。', '✓ You have cleared this daily mission today (each one counts once a day). ') +
        (left ? T('今天還有 ' + left + ' 個每日任務沒完成。', left + ' daily missions left today.') : T('今天的十個每日任務全部完成了，明天 00:00 換新！', 'All of today’s daily missions are done — new ones at 00:00!'));
      banner.appendChild(line);
    } else if (m) {
      const chips = rewardChips(m);
      if (!st.on) chips.appendChild(el('span', 'dl-chip warn', T('請打開「任務模式」', 'Turn on “Mission mode”')));
      banner.appendChild(chips);
    }
    if (D.saveFailed) banner.appendChild(el('p', 'ms-msg', T('今天的每日任務沒有存進資料庫（資料庫規則可能還沒更新），寶物暫時無法記錄。', 'Today’s missions could not be saved (database rules may be out of date); treasures cannot be recorded yet.')));
    if (D.msg) banner.appendChild(el('p', 'ms-msg', D.msg));
  }

  // ======================= daily.html =======================
  let clockEl = null, shownDay = null;
  function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60, se = s % 60;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':' + String(se).padStart(2, '0');
  }
  function tick() {
    if (clockEl) clockEl.textContent = fmtCountdown(C.msToReset(now()));
    const d = today();
    if (shownDay != null && d !== shownDay) { shownDay = d; if (D.uid) load(); else render(); }
  }
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function renderPage() {
    if (!app) return;
    app.innerHTML = '';
    const d = today();
    shownDay = d;
    const dt = C.dateOf(d);
    // ---------- 日期與倒數 ----------
    const head = el('section', 'dl-today');
    const date = el('div', 'dl-date');
    date.appendChild(el('span', 'dl-date-main', T(dt.y + ' 年 ' + dt.m + ' 月 ' + dt.d + ' 日（星期' + WEEK[dt.w] + '）', WEEK_EN[dt.w] + ' ' + dt.d + ' ' + MON_EN[dt.m - 1] + ' ' + dt.y)));
    date.appendChild(el('span', 'dl-date-sub', T('臺灣時間', 'Taiwan time')));
    head.appendChild(date);
    const cd = el('div', 'dl-countdown');
    cd.appendChild(el('span', 'dl-cd-label', T('距離換新', 'Refreshes in')));
    clockEl = el('span', 'dl-cd-time', fmtCountdown(C.msToReset(now())));
    clockEl.setAttribute('role', 'timer');
    cd.appendChild(clockEl);
    head.appendChild(cd);
    app.appendChild(head);

    // ---------- 登入與暱稱 ----------
    if (!D.api) { app.appendChild(el('p', 'lb-note', T('每日任務暫時無法載入。', 'Daily missions could not be loaded.'))); return; }
    if (!st.user) {
      const box = el('section', 'dl-signin-box');
      box.appendChild(el('p', null, T('每日任務需要登入 Google 帳號：每天臺灣時間 00:00 換新三個任務，完成可以掉落銅幣、銀幣、金幣、鑽石，運氣好還有稀有鑰匙。',
        'Daily missions need a Google sign-in: three new missions every day at 00:00 Taiwan time, dropping copper, silver and gold coins, diamonds — and, with luck, a rare key.')));
      const b = el('button', 'primary', T('用 Google 帳號登入', 'Sign in with Google'));
      b.type = 'button';
      b.addEventListener('click', function () { D.api.signIn().catch(function () {}); });
      box.appendChild(b);
      app.appendChild(box);
      app.appendChild(bagSection(true));
      return;
    }
    if (!st.ready || (!D.loaded && !D.failed)) { app.appendChild(el('p', 'lb-note', T('載入中…', 'Loading…'))); return; }
    if (D.failed) { app.appendChild(el('p', 'ms-msg', T('每日任務暫時無法載入，請稍後重新整理。', 'Daily missions could not be loaded — please refresh later.'))); return; }
    if (!st.nickname) app.appendChild(nickForm());
    if (D.saveFailed) app.appendChild(el('p', 'ms-msg', T('今天的每日任務沒有存進資料庫（資料庫規則可能還沒更新），寶物暫時無法記錄。', 'Today’s missions could not be saved (database rules may be out of date); treasures cannot be recorded yet.')));

    // ---------- 今天的十個任務 ----------
    const sec = el('section', 'dl-missions');
    const h = el('h2', null, T('今天的任務', 'Today’s missions'));
    sec.appendChild(h);
    const n = doneCount(), total = picks().length;
    sec.appendChild(el('p', 'lb-note dl-progress-line', n >= total && total
      ? T('今天的 ' + total + ' 個每日任務全部完成了！明天臺灣時間 00:00 換新。', 'All ' + total + ' of today’s daily missions are done! New ones arrive at 00:00 Taiwan time.')
      : T('已完成 ' + n + ' / ' + total + '。每個每日任務今天只能完成一次，' + total + ' 個做完，這一天就結束。', 'Done ' + n + ' / ' + total + '. Each daily mission counts once today; when all ' + total + ' are done, that’s it for the day.')));
    // 圖例：可以拿到的新星星和已經領過的星星
    const lg = el('div', 'dl-legend');
    [['new', T('完成可以拿到的新星星', 'new stars you earn by clearing it')], ['got', T('以前已經領過，完成不會再加星', 'already claimed — clearing it adds no stars')]].forEach(function (x) {
      const item = el('span', 'dl-legend-item');
      const b = starBadge('N', x[0]);
      b.removeAttribute('aria-label');
      b.setAttribute('aria-hidden', 'true');
      item.appendChild(b);
      item.appendChild(el('span', null, (x[0] === 'new' ? T('「+N 顆星」', '“+N stars”: ') : T('「N 顆星已領過」', '“N stars claimed”: ')) + T('＝', '') + x[1]));
      lg.appendChild(item);
    });
    lg.appendChild(el('span', 'dl-legend-item dl-legend-note', T('兩種任務的掉寶機率一樣。', 'Both kinds have the same treasure chance.')));
    sec.appendChild(lg);
    const grid = el('div', 'dl-grid');
    picks().forEach(function (id) {
      const m = findMission(id);
      if (!m) return;
      const today_ = doneToday(id);
      const card = el('article', 'dl-card band-' + C.bandOf(m.level).id + (today_ ? ' done' : '') + (st.done[id] ? ' stars-got' : ' stars-new'));
      const top = el('div', 'dl-card-top');
      top.appendChild(bandChip(m.level));
      top.appendChild(starBadge(m.level, starState(id)));
      if (today_) top.appendChild(el('span', 'dl-done', T('✓ 今天已完成', '✓ Done today')));
      card.appendChild(top);
      card.appendChild(el('span', 'dl-card-mod', moduleName(modOf(id))));
      card.appendChild(el('h3', 'dl-card-title', L(m.title)));
      card.appendChild(el('p', 'dl-card-desc', L(m.desc)));
      if (today_) {
        card.appendChild(el('p', 'dl-card-closed', T('今天已經完成，這個每日任務明天 00:00 才會換新。', 'Cleared today — this daily mission is closed until 00:00.')));
        const open = el('a', 'dl-open', T('打開實驗（不再計分）', 'Open the experiment (no more rewards)'));
        open.href = modOf(id) + '.html';
        card.appendChild(open);
      } else {
        card.appendChild(rewardChips(m));
        const go = el('a', 'dl-go', T('前往挑戰', 'Start the mission'));
        go.href = modOf(id) + '.html?daily=' + encodeURIComponent(id);
        card.appendChild(go);
      }
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    if (D.msg) sec.appendChild(el('p', 'ms-msg', D.msg));
    app.appendChild(sec);

    app.appendChild(bagSection(false));
    app.appendChild(oddsSection());
  }

  function bagSection(preview) {
    const sec = el('section', 'dl-bag');
    sec.appendChild(el('h2', null, T('我的寶物', 'My treasures')));
    sec.appendChild(C.bagGrid(document, preview ? null : D.bag, T));
    sec.appendChild(el('p', 'lb-note', preview ? T('寶物的用途之後公布。', 'What treasures are for will be announced later.')
      : T('累計完成每日任務 ' + (D.bag.dm || 0) + ' 個。寶物的用途之後公布；之後用掉寶物時，「現在剩下」會減少，「累計獲得」不變。',
        'Daily missions completed: ' + (D.bag.dm || 0) + '. What treasures are for will be announced later; spending them lowers “Left now” but never “All-time”.')));
    return sec;
  }

  function oddsSection() {
    const sec = el('section', 'dl-odds');
    const S = stars();
    sec.appendChild(el('h2', null, T('掉寶機率', 'Drop chances')));
    sec.appendChild(el('p', 'lb-note', T('依你目前的 ' + S.toLocaleString() + ' 顆星計算。任務越難、累積的星星越多，越容易掉寶，也越容易掉出稀有寶物（星星加成到 ' + C.STAR_CAP.toLocaleString() + ' 顆星達到上限，目前 ' + Math.round(100 * C.starBoost(S)) + '%）。',
      'Based on your ' + S.toLocaleString() + ' stars. Harder missions and more stars make drops — and rare treasures — likelier (the star bonus caps at ' + C.STAR_CAP.toLocaleString() + ' stars; yours is ' + Math.round(100 * C.starBoost(S)) + '%).')));
    const wrap = el('div', 'dl-table-wrap');
    const tb = el('table', 'dl-table');
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', null, T('任務', 'Mission')));
    hr.appendChild(el('th', 'dl-rep-col', T('掉寶機率', 'Drop chance')));
    C.ITEMS.forEach(function (it) {
      const th = el('th', 'r-' + it.id);
      const ic = el('span', 'dl-ico sm'); ic.innerHTML = icon(it.id);
      th.appendChild(ic);
      th.appendChild(el('span', null, T(it.zh, it.en)));
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    tb.appendChild(thead);
    const body = el('tbody');
    // 今天的任務用到的等級（去掉重複、由低到高）；還沒有任務時列 1、5、10 級
    const levels = picks().map(findMission).filter(Boolean).map(function (m) { return m.level; })
      .filter(function (lv, i, a) { return a.indexOf(lv) === i; }).sort(function (x, y) { return x - y; });
    (levels.length ? levels : [1, 5, 10]).forEach(function (lv) {
      const tr = el('tr');
      const th = el('th', null, (levels.length ? T(C.bandOf(lv).zh, C.bandOf(lv).en) + ' ' : '') + '★' + lv);
      // 窄螢幕把「掉寶機率」改寫在任務名稱下面，表格才不會超出畫面
      th.appendChild(el('span', 'dl-rep-inline', T('掉寶 ', 'Drop ') + pct(C.repeatChance(lv, S))));
      tr.appendChild(th);
      tr.appendChild(el('td', 'dl-rep-col', pct(C.repeatChance(lv, S))));
      C.table(lv, S).forEach(function (p) { tr.appendChild(el('td', null, pct(p))); });
      body.appendChild(tr);
    });
    tb.appendChild(body);
    wrap.appendChild(tb);
    sec.appendChild(wrap);
    sec.appendChild(el('p', 'lb-note', T('每完成一個每日任務，先依「掉寶機率」決定有沒有掉寶（新任務和做過的任務一樣）；掉寶時，是哪一種寶物看銅幣到鑰匙各欄的機率。數量：銅幣 1–5 枚、銀幣 1–3 枚、金幣 1–2 枚、鑽石 1 顆、稀有鑰匙 1 把。',
      'Each daily mission you clear first rolls the “Drop chance” (the same for new missions and ones you have done); if something drops, the copper-to-key columns give which treasure it is. Amounts: copper 1–5, silver 1–3, gold 1–2, one diamond, one rare key.')));
    return sec;
  }

  function nickForm() {
    const f = el('form', 'ms-nick dl-nick');
    const lab = el('label', null, T('先取一個暱稱（1–20 字）才能開始。暱稱會公開顯示在排行榜上，請為自己的暱稱負責。',
      'Choose a nickname (1–20 characters) to begin. It is shown publicly on the leaderboard — you are responsible for it.'));
    lab.htmlFor = 'dl-nick-input';
    const inp = el('input'); inp.id = 'dl-nick-input'; inp.maxLength = 20;
    const save = el('button', 'primary', T('儲存暱稱', 'Save')); save.type = 'submit';
    f.appendChild(lab); f.appendChild(inp); f.appendChild(save);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      const v = String(inp.value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!v) return;
      D.api.setNickname(st.user.uid, v).then(function () { st.nickname = v; render(); })
        .catch(function () { D.msg = T('暱稱儲存失敗，請再試一次。', 'Could not save the nickname.'); render(); });
    });
    return f;
  }

  function render() {
    if (app) renderPage();
    if (st.daily) renderBanner();
  }

  window.LabDaily = { active: active, completed: completed, icon: icon, render: render, _D: D };

  // ======================= 啟動 =======================
  Promise.resolve(LM._ready()).then(function (api) {
    D.api = api;
    render();
    if (!api) return;
    // 登入狀態、任務資料載入完成時重新載入
    let key = null;
    const watch = function () {
      const k = (st.user && st.user.uid) + '|' + st.ready + '|' + !!st.nickname + '|' + st.on;
      if (k === key) return;
      const prevUid = D.uid;
      key = k;
      D.uid = st.user ? st.user.uid : null;
      if (D.uid !== prevUid) { D.rec = null; D.bag = {}; D.loaded = false; D.failed = false; D.msg = ''; }
      if (D.uid && st.ready && !D.loaded && !D.loading && !D.failed) load();
      else render();
    };
    watch();
    setInterval(watch, 400);
    LM.on('complete', function () { setTimeout(render, 50); });
  });
  if (app) setInterval(tick, 1000);
})();
