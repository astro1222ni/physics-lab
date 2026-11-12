/*
 * daily.js — 每日任務與寶物（需登入 Google 帳號；計算在 js/daily-core.js）
 *
 * 兩種用法：
 *   1. daily.html（頁面有 #dailyApp）：今天的三個每日任務、換日倒數、我的寶物、掉寶機率、規則。
 *   2. 實驗頁網址加 ?daily=<任務代號>（missions.js 自動載入本檔）：實驗上方顯示每日任務橫幅；
 *      任務達成時 missions.js 呼叫 LabDaily.completed(m, 這次是否也拿到星星)，在這裡擲骰、寫入、播放掉寶動畫。
 * 資料（資料庫規則見 firebase/database.rules.json）：
 *   daily/<uid> = { d: 臺灣日序, picks: { easy, mid, hard }, n: 今天掉寶次數, at: 上次掉寶的伺服器時間, done: { 任務代號: true } }
 *   bag/<uid>   = { cu, ag, au, dia, key, dm（累計完成的每日任務數） }
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
  const BAND_KEYS = ['easy', 'mid', 'hard'];

  const D = { api: null, uid: null, offset: 0, rec: null, bag: {}, loaded: false, failed: false, saveFailed: false, lastTry: 0, msg: '' };
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
  function picks() {
    const p = (D.rec && D.rec.picks) || {};
    return BAND_KEYS.map(function (k) { return p[k]; }).filter(Boolean);
  }
  function doneToday(id) { return !!(D.rec && D.rec.done && D.rec.done[id]); }
  function doneCount() { return D.rec && D.rec.done ? Object.keys(D.rec.done).length : 0; }
  function repeatsUsed() { return Math.max(0, ((D.rec && D.rec.n) || 0) - doneCount()); }
  /** 這個任務是不是今天的每日任務（已載入、沒有換日） */
  function active(id) { return !!(D.loaded && D.rec && D.rec.d === today() && picks().indexOf(id) >= 0); }
  function pct(x) { const v = 100 * x; return (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%'; }

  // ======================= 圖示 =======================
  let gid = 0;
  const COIN = {
    cu: ['#f8c9a4', '#c47a45', '#6e3818'],
    ag: ['#ffffff', '#c6ced5', '#5f6a74'],
    au: ['#fff4b0', '#e3ad1d', '#7f5300']
  };
  /** 寶物圖示（SVG 字串）：銅、銀、金幣刻元素符號；鑽石是碳的晶體；鑰匙最稀有 */
  function icon(id) {
    const g = 'dl' + (++gid);
    if (COIN[id]) {
      const c = COIN[id], sym = id === 'cu' ? 'Cu' : id === 'ag' ? 'Ag' : 'Au';
      return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><radialGradient id="' + g + '" cx="34%" cy="28%" r="78%">' +
        '<stop offset="0" stop-color="' + c[0] + '"/><stop offset=".55" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></radialGradient></defs>' +
        '<ellipse cx="32" cy="57" rx="20" ry="3.2" fill="#000" opacity=".18"/>' +
        '<circle cx="32" cy="33.6" r="26" fill="' + c[2] + '"/>' +
        '<circle cx="32" cy="31" r="26" fill="url(#' + g + ')"/>' +
        '<circle cx="32" cy="31" r="20.5" fill="none" stroke="' + c[2] + '" stroke-opacity=".5" stroke-width="1.6"/>' +
        '<circle cx="32" cy="31" r="24.2" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1" stroke-dasharray="1.4 2.2"/>' +
        '<text x="32" y="38.6" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-weight="700" font-size="20" fill="' + c[2] + '" fill-opacity=".9">' + sym + '</text>' +
        '<path d="M15.5 21.5A20 20 0 0 1 27 12.2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/></svg>';
    }
    if (id === 'dia') {
      return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
        '<ellipse cx="32" cy="59" rx="14" ry="2.6" fill="#000" opacity=".16"/>' +
        '<g stroke="#075985" stroke-width="1.1" stroke-linejoin="round">' +
        '<polygon points="9,24 21,11 15.5,24" fill="#bae6fd"/><polygon points="21,11 32,24 15.5,24" fill="#e0f2fe"/>' +
        '<polygon points="21,11 43,11 32,24" fill="#f8fdff"/><polygon points="43,11 48.5,24 32,24" fill="#bae6fd"/>' +
        '<polygon points="43,11 55,24 48.5,24" fill="#7dd3fc"/>' +
        '<polygon points="9,24 15.5,24 32,56" fill="#0ea5e9"/><polygon points="15.5,24 32,24 32,56" fill="#38bdf8"/>' +
        '<polygon points="32,24 48.5,24 32,56" fill="#0284c7"/><polygon points="48.5,24 55,24 32,56" fill="#0369a1"/></g>' +
        '<path d="M47 4l1.4 3.6L52 9l-3.6 1.4L47 14l-1.4-3.6L42 9l3.6-1.4z" fill="#fff"/>' +
        '<text x="32" y="21.6" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="9" fill="#075985" fill-opacity=".75">C</text></svg>';
    }
    if (id === 'key') {
      return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#f5d0fe"/><stop offset=".45" stop-color="#c026d3"/><stop offset="1" stop-color="#581c87"/></linearGradient>' +
        '<radialGradient id="' + g + 'h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e879f9" stop-opacity=".55"/><stop offset="1" stop-color="#e879f9" stop-opacity="0"/></radialGradient></defs>' +
        '<circle cx="32" cy="32" r="30" fill="url(#' + g + 'h)"/>' +
        '<circle cx="18.5" cy="32" r="10.5" fill="none" stroke="url(#' + g + ')" stroke-width="6.5"/>' +
        '<circle cx="18.5" cy="32" r="3.4" fill="#fdf4ff" stroke="#a21caf" stroke-width="1.2"/>' +
        '<path d="M28.5 28.6H57.6a2.2 2.2 0 0 1 2.2 2.2v2.4a2.2 2.2 0 0 1-2.2 2.2H56V44h-6.4v-8.6h-3V41.5h-5.4v-6.1H28.5z" fill="url(#' + g + ')" stroke="#4a044e" stroke-opacity=".5" stroke-width="1"/>' +
        '<path d="M12.6 25.2a8 8 0 0 1 6.2-3.4" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round"/>' +
        '<path d="M31 30.2H55" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/></svg>';
    }
    return '';
  }
  const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4.5" width="18" height="16.5" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15.2" r="2.7" fill="currentColor"/></svg>';
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  function itemName(id) { const it = C.ITEMS.filter(function (x) { return x.id === id; })[0]; return it ? T(it.zh, it.en) : id; }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function starBadge(n) {
    const b = el('span', 'ms-stars');
    b.innerHTML = STAR;
    b.appendChild(el('span', null, '×' + n));
    b.setAttribute('aria-label', n + T(' 顆倪的星星', ' Ni stars'));
    return b;
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
  /** 今天還沒有每日任務：抽三個並寫入資料庫（寫入失敗也照樣顯示，只是掉寶無法記錄） */
  function ensureToday() {
    const d = today();
    if (D.rec && D.rec.d === d && D.rec.picks) return Promise.resolve();
    const pool = [];
    const live = window.LAB_LIVE_MODULES || [];
    const all = LM.all();
    Object.keys(all).forEach(function (k) {
      if (live.indexOf(k) < 0) return;
      all[k].forEach(function (m) { if (!m.hidden) pool.push({ id: m.id, module: k, level: m.level }); });
    });
    const ids = C.pick(pool, D.uid, d);
    const p = {};
    ids.forEach(function (id, i) { p[BAND_KEYS[i]] = id; });
    const rec = { d: d, picks: p, n: 0, at: D.api.now() };
    D.rec = { d: d, picks: p, n: 0, at: now(), done: {} };
    return D.api.update({ ['daily/' + D.uid]: rec }).then(function () { D.saveFailed = false; }, function () { D.saveFailed = true; });
  }

  // ======================= 完成每日任務：擲骰與寫入 =======================
  /** missions.js 呼叫：m 是剛達成的每日任務；newStars = 這次也是第一次完成、會另外拿到星星 */
  function completed(m, newStars) {
    queue = queue.then(function () { return reward(m, newStars); }).catch(function () { /* 下次再試 */ });
  }
  function reward(m, newStars) {
    if (!active(m.id)) { D.msg = T('每日任務已經換新了，請回每日任務頁看看今天的任務。', 'The daily missions have been refreshed — check today’s list.'); render(); return; }
    const first = !doneToday(m.id);
    const t = now();
    if (!first) {
      if (repeatsUsed() >= C.REPEAT_CAP) {
        D.msg = T('今天重做掉寶的機會（' + C.REPEAT_CAP + ' 次）已經用完了，明天再來！', 'You have used all ' + C.REPEAT_CAP + ' repeat drops for today — come back tomorrow!');
        render(); toast(D.msg); return;
      }
      if (t - D.lastTry < C.GAP) {
        const s = Math.ceil((C.GAP - (t - D.lastTry)) / 1000);
        toast(T('太快了！再等 ' + s + ' 秒，重做才會再擲一次寶物。', 'Too fast! Wait ' + s + ' s before the next repeat counts.'));
        return;
      }
    }
    D.lastTry = t;
    const drop = C.roll(m.level, stars(), first);
    if (!drop) {
      toast(T('這次沒有掉寶（機率 ' + pct(C.repeatChance(m.level, stars())) + '）——再做一次試試看！',
        'No drop this time (chance ' + pct(C.repeatChance(m.level, stars())) + ') — try again!'));
      return;
    }
    // 資料庫規則：兩次掉寶的伺服器時間至少隔 10 秒
    const wait = Math.max(0, ((D.rec && D.rec.at) || 0) + 10500 - now());
    return delay(wait).then(function () {
      const P = 'daily/' + D.uid + '/', B = 'bag/' + D.uid + '/';
      const map = {};
      map[P + 'n'] = ((D.rec && D.rec.n) || 0) + 1;
      map[P + 'at'] = D.api.now();
      if (first) map[P + 'done/' + m.id] = true;
      map[B + drop.item] = D.api.inc(drop.qty);
      if (first) map[B + 'dm'] = D.api.inc(1);
      return D.api.update(map).then(function () {
        D.rec.n = ((D.rec && D.rec.n) || 0) + 1;
        D.rec.at = now();
        if (first) { D.rec.done = D.rec.done || {}; D.rec.done[m.id] = true; }
        D.bag[drop.item] = (D.bag[drop.item] || 0) + drop.qty;
        if (first) D.bag.dm = (D.bag.dm || 0) + 1;
        D.msg = '';
        setTimeout(function () { showDrop(drop, first); }, newStars ? 2500 : 0); // 有星星時，等星星的慶祝畫面結束
        try { window.dispatchEvent(new CustomEvent('lab:loot', { detail: { item: drop.item, qty: drop.qty, first: first, bag: Object.assign({}, D.bag) } })); } catch (e) { /* 忽略 */ }
        render();
      }, function () {
        D.msg = T('寶物沒有記錄成功（網路或資料庫規則的問題），請再做一次。', 'The treasure was not recorded (network or database rules) — please try again.');
        render();
      });
    });
  }

  // ======================= 掉寶動畫與提示 =======================
  const SOUND = { cu: [659, 880], ag: [784, 1047, 1319], au: [880, 1175, 1568], dia: [988, 1319, 1760, 2093], key: [523, 784, 1047, 1568, 2093] };
  function showDrop(drop, first) {
    const ov = el('div', 'dl-drop r-' + drop.item);
    ov.setAttribute('role', 'status');
    const box = el('div', 'dl-drop-box');
    box.appendChild(el('div', 'dl-drop-kicker', first ? T('今日首次完成獎勵', 'First clear today') : T('重做掉寶！', 'Repeat drop!')));
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
    if (m) { head.appendChild(bandChip(m.level)); head.appendChild(starBadge(m.level)); }
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
    if (!active(st.daily)) {
      banner.classList.add('expired');
      line.textContent = T('這不是今天的每日任務（每天臺灣時間 00:00 換新）。這個實驗照樣可以玩，但不會掉寶。', 'This is not one of today’s daily missions (they refresh at 00:00 Taiwan time). You can still play, but nothing will drop.');
      banner.appendChild(line);
      return;
    }
    banner.classList.remove('expired');
    const chips = el('div', 'dl-chips');
    const S = stars();
    if (m && !st.done[m.id]) chips.appendChild(el('span', 'dl-chip new', T('第一次完成另得 ', 'First clear also earns ') + m.level + T(' 顆星', ' stars')));
    else chips.appendChild(el('span', 'dl-chip', T('星星已領過：重做不再加星', 'Stars already earned: repeats add none')));
    if (doneToday(st.daily)) {
      chips.appendChild(el('span', 'dl-chip ok', T('✓ 今天已完成', '✓ Done today')));
      chips.appendChild(el('span', 'dl-chip', T('重做每次 ', 'Each repeat: ') + pct(C.repeatChance(m ? m.level : 1, S)) + T(' 機率掉寶', ' drop chance')));
      chips.appendChild(el('span', 'dl-chip', T('今天重做掉寶 ', 'Repeat drops today: ') + repeatsUsed() + ' / ' + C.REPEAT_CAP));
    } else {
      chips.appendChild(el('span', 'dl-chip gold', T('今天第一次完成：一定掉寶', 'First clear today: guaranteed drop')));
    }
    if (!st.on) chips.appendChild(el('span', 'dl-chip warn', T('請打開「任務模式」', 'Turn on “Mission mode”')));
    banner.appendChild(chips);
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

    // ---------- 今天的三個任務 ----------
    const sec = el('section', 'dl-missions');
    const h = el('h2', null, T('今天的任務', 'Today’s missions'));
    sec.appendChild(h);
    const n = doneCount();
    sec.appendChild(el('p', 'lb-note', T('已完成 ' + n + ' / ' + picks().length + '　今天重做掉寶 ' + repeatsUsed() + ' / ' + C.REPEAT_CAP + ' 次',
      'Done ' + n + ' / ' + picks().length + ' · repeat drops today ' + repeatsUsed() + ' / ' + C.REPEAT_CAP)));
    const grid = el('div', 'dl-grid');
    const S = stars();
    picks().forEach(function (id) {
      const m = findMission(id);
      if (!m) return;
      const card = el('article', 'dl-card band-' + C.bandOf(m.level).id + (doneToday(id) ? ' done' : ''));
      const top = el('div', 'dl-card-top');
      top.appendChild(bandChip(m.level));
      top.appendChild(starBadge(m.level));
      if (doneToday(id)) top.appendChild(el('span', 'dl-done', T('✓ 今天已完成', '✓ Done today')));
      card.appendChild(top);
      card.appendChild(el('span', 'dl-card-mod', moduleName(modOf(id))));
      card.appendChild(el('h3', 'dl-card-title', L(m.title)));
      card.appendChild(el('p', 'dl-card-desc', L(m.desc)));
      const chips = el('div', 'dl-chips');
      if (!st.done[id]) chips.appendChild(el('span', 'dl-chip new', T('第一次完成另得 ', 'First clear also earns ') + m.level + T(' 顆星', ' stars')));
      else chips.appendChild(el('span', 'dl-chip', T('以前完成過：不再加星，但可能掉寶', 'Done before: no stars, but treasure may drop')));
      chips.appendChild(el('span', 'dl-chip' + (doneToday(id) ? '' : ' gold'), doneToday(id)
        ? T('重做掉寶機率 ', 'Repeat drop chance ') + pct(C.repeatChance(m.level, S))
        : T('今天第一次完成：一定掉寶', 'First clear today: guaranteed drop')));
      card.appendChild(chips);
      const go = el('a', 'dl-go', doneToday(id) ? T('再做一次', 'Play again') : T('前往挑戰', 'Start the mission'));
      go.href = modOf(id) + '.html?daily=' + encodeURIComponent(id);
      card.appendChild(go);
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
    const row = el('div', 'dl-bag-row');
    C.ITEMS.forEach(function (it) {
      const tile = el('div', 'dl-item r-' + it.id);
      const ic = el('span', 'dl-ico');
      ic.innerHTML = icon(it.id);
      tile.appendChild(ic);
      tile.appendChild(el('span', 'dl-item-name', T(it.zh, it.en)));
      tile.appendChild(el('span', 'dl-item-n', preview ? '—' : String((D.bag[it.id] || 0).toLocaleString())));
      row.appendChild(tile);
    });
    sec.appendChild(row);
    if (!preview) sec.appendChild(el('p', 'lb-note', T('累計完成每日任務 ' + (D.bag.dm || 0) + ' 次。寶物的用途之後公布，先收藏起來吧！',
      'Daily missions completed: ' + (D.bag.dm || 0) + '. What treasures are for will be announced later — keep collecting!')));
    else sec.appendChild(el('p', 'lb-note', T('寶物的用途之後公布。', 'What treasures are for will be announced later.')));
    return sec;
  }

  function oddsSection() {
    const sec = el('section', 'dl-odds');
    const S = stars();
    sec.appendChild(el('h2', null, T('掉寶機率', 'Drop chances')));
    sec.appendChild(el('p', 'lb-note', T('依你目前的 ' + S.toLocaleString() + ' 顆星計算。任務越難、累積的星星越多，越容易掉出稀有寶物（星星加成到 ' + C.STAR_CAP.toLocaleString() + ' 顆星達到上限，目前 ' + Math.round(100 * C.starBoost(S)) + '%）。',
      'Based on your ' + S.toLocaleString() + ' stars. Harder missions and more stars make rare treasures likelier (the star bonus caps at ' + C.STAR_CAP.toLocaleString() + ' stars; yours is ' + Math.round(100 * C.starBoost(S)) + '%).')));
    const wrap = el('div', 'dl-table-wrap');
    const tb = el('table', 'dl-table');
    const thead = el('thead');
    const hr = el('tr');
    hr.appendChild(el('th', null, T('任務', 'Mission')));
    C.ITEMS.forEach(function (it) {
      const th = el('th', 'r-' + it.id);
      const ic = el('span', 'dl-ico sm'); ic.innerHTML = icon(it.id);
      th.appendChild(ic);
      th.appendChild(el('span', null, T(it.zh, it.en)));
      hr.appendChild(th);
    });
    hr.appendChild(el('th', 'dl-rep-col', T('重做掉寶', 'Repeat drop')));
    thead.appendChild(hr);
    tb.appendChild(thead);
    const body = el('tbody');
    const rows = picks().map(findMission).filter(Boolean);
    const shown = rows.length ? rows.map(function (m) { return { label: T(C.bandOf(m.level).zh, C.bandOf(m.level).en) + ' ★' + m.level, level: m.level }; })
      : [1, 5, 10].map(function (lv) { return { label: '★' + lv, level: lv }; });
    shown.forEach(function (r) {
      const tr = el('tr');
      const th = el('th', null, r.label);
      // 窄螢幕把「重做掉寶」改寫在任務名稱下面，表格才不會超出畫面
      th.appendChild(el('span', 'dl-rep-inline', T('重做 ', 'Repeat ') + pct(C.repeatChance(r.level, S))));
      tr.appendChild(th);
      C.table(r.level, S).forEach(function (p) { tr.appendChild(el('td', null, pct(p))); });
      tr.appendChild(el('td', 'dl-rep-col', pct(C.repeatChance(r.level, S))));
      body.appendChild(tr);
    });
    tb.appendChild(body);
    wrap.appendChild(tb);
    sec.appendChild(wrap);
    sec.appendChild(el('p', 'lb-note', T('今天第一次完成每個每日任務一定掉一件寶物（上表是掉到各種寶物的機率）；當天重做，每次完成依「重做掉寶」的機率再掉一件。數量：銅幣 1–5 枚、銀幣 1–3 枚、金幣 1–2 枚、鑽石與鑰匙各 1 個。',
      'Your first clear of each daily mission today always drops one treasure (the table shows which); each repeat that day drops one with the “Repeat drop” chance. Amounts: copper 1–5, silver 1–3, gold 1–2, diamond and key 1 each.')));
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
