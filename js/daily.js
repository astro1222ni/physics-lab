/*
 * daily.js — 每日任務與寶物（需登入 Google 帳號；計算在 js/daily-core.js）
 *
 * 兩種用法：
 *   1. daily.html（頁面有 #dailyApp）：今天的十個每日任務、換日倒數、我的寶物、掉寶機率、規則。
 *   2. 實驗頁網址加 ?daily=<任務代號>（missions.js 自動載入本檔）：實驗上方顯示每日任務橫幅；
 *      任務達成時 missions.js 呼叫 LabDaily.completed(m, 這次是否也拿到星星)，在這裡擲骰、寫入、播放掉寶動畫。
 * 每個每日任務今天只能完成一次，十個做完這一天就結束。五種寶物獨立判定、銅幣必掉；機率只看難度，數量權重固定（11/16 站長）。
 * 資料（資料庫規則見 firebase/database.rules.json）：
 *   daily/<uid> = { d: 臺灣日序, picks: [十個任務代號], n: 今天完成了幾個（最多 10）, at: 上次完成的伺服器時間, done: { 任務代號: true } }
 *   bag/<uid>   = { cu, ag, au, dia, key（累計獲得，只增不減）, dm（累計完成的每日任務數）, used: { 寶物: 已使用數 }（之後的消費功能用） }
 *   每完成一個每日任務只 update 一次：n 加一、done 加一筆、dm 加一，各種掉落的寶物一起加上數量。
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

  // 實驗頁由 missions.js 動態載入本檔；沿用同一版本號載入每日任務的獨立樣式。
  if (!document.querySelector('link[data-daily-style]')) {
    const css = document.createElement('link'), src = new URL(document.currentScript.src);
    css.rel = 'stylesheet'; css.href = new URL('../daily.css', src).href + src.search;
    css.setAttribute('data-daily-style', ''); document.head.appendChild(css);
  }

  const D = { api: null, uid: null, offset: 0, rec: null, bag: {}, loaded: false, failed: false, saveFailed: false, msg: '', waiting: null };
  let queue = Promise.resolve();

  function now() { return Date.now() + D.offset; }
  function today() { return C.dayNumber(now()); }
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
  function ev(x) { return x >= 0.1 ? x.toFixed(2) : x >= 0.01 ? x.toFixed(3) : x.toFixed(4); }
  function pct(x) { return (100 * x).toFixed(1).replace(/\.0$/, '') + '%'; }

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
    chips.appendChild(el('span', 'dl-chip gold', T('銅幣必掉 · 五種獨立擲骰', 'Copper guaranteed · 5 independent rolls')));
    const p = C.dropChances(m.level);
    chips.appendChild(el('span', 'dl-chip dl-chip-odds', T('另有機會：', 'Also: ') + C.ITEMS.slice(1).map(function (it, i) {
      return T(it.zh, it.en) + ' ' + pct(p[i + 1]);
    }).join(T('、', ', '))));
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
      resumePending();
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
      all[k].forEach(function (m) { if (!m.hidden && !m.study) pool.push({ id: m.id, module: k, level: m.level }); });
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
  /*
   * 達成時離上一次完成還不到 10 秒（資料庫規則），要等一下才能寫入。
   * 等的時候先把這個任務記在本機（localStorage），中途離開這一頁也不會遺失：
   * 回到每日任務頁、或再打開任何每日任務實驗，載入後會自動補記（Codex 全面測試回報：冷卻中按「回每日任務」，完成就不見了）。
   * 本機紀錄只是「待寫入」的提醒，能不能記還是由資料庫規則決定（每天十個、每個一次、隔 10 秒）。
   */
  const PKEY = 'dl-pending-v1';
  function pendingRead() { try { return JSON.parse(localStorage.getItem(PKEY) || '{}') || {}; } catch (e) { return {}; } }
  function pendingIds() {
    const r = pendingRead()[D.uid];
    return r && r.d === today() && Array.isArray(r.ids) ? r.ids : [];
  }
  function pendingSet(id, on) {
    if (!D.uid) return;
    try {
      const all = pendingRead();
      const ids = pendingIds().filter(function (x) { return x !== id; });
      if (on) ids.push(id);
      if (ids.length) all[D.uid] = { d: today(), ids: ids }; else delete all[D.uid];
      localStorage.setItem(PKEY, JSON.stringify(all));
    } catch (e) { /* 私密瀏覽等：只是不能跨頁補記 */ }
  }
  /** 載入後把上次沒寫成的完成補記上去（已經換日、已經記過、不是今天的任務就丟掉） */
  function resumePending() {
    pendingIds().forEach(function (id) {
      const m = findMission(id);
      if (!m || !isPick(id) || doneToday(id)) { pendingSet(id, false); return; }
      completed(m, false);
    });
  }
  let waitTimer = 0;
  function waitTick() {
    clearInterval(waitTimer);
    waitTimer = setInterval(function () {
      if (!D.waiting) { clearInterval(waitTimer); return; }
      // 只更新倒數的字，不重畫整頁（避免焦點、捲動位置跳掉）
      if (st.daily) renderBanner();
      if (app) {
        const chip = app.querySelector('.dl-pending[data-id="' + D.waiting.id + '"]');
        if (chip) chip.textContent = T('記錄中…再 ' + waitLeft() + ' 秒', 'Recording… ' + waitLeft() + ' s');
      }
    }, 1000);
  }
  function waitLeft() { return D.waiting ? Math.max(0, Math.ceil((D.waiting.until - now()) / 1000)) : 0; }

  /** missions.js 呼叫：m 是剛達成的每日任務；newStars = 以前沒領過這個任務的星星（這次也拿到星星） */
  function completed(m, newStars) {
    queue = queue.then(function () { return reward(m, newStars); }).catch(function () { /* 下次再試 */ });
  }
  function reward(m, newStars) {
    if (!isPick(m.id)) { D.msg = T('每日任務已經換新了，請回每日任務頁看看今天的任務。', 'The daily missions have been refreshed — check today’s list.'); render(); return; }
    if (doneToday(m.id)) { toast(T('今天已經完成這個每日任務了，明天 00:00 會換新。', 'You have already cleared this daily mission today — new ones arrive at 00:00.')); return; }
    pendingSet(m.id, true);
    return writeWhenReady(m, newStars);
  }
  /** 寫入前先向伺服器重讀今天的紀錄（別的分頁可能剛記過），還不到 10 秒就等，等完再讀一次 */
  function writeWhenReady(m, newStars) {
    const uid = D.uid;
    return Promise.all([D.api.get('daily/' + uid), D.api.get('bag/' + uid), D.api.get('treasureBoard/' + uid), D.api.get('profiles/' + uid)]).then(function (records) {
      if (D.uid !== uid) return;
      const r = records[0];
      D.bag = records[1] || {};
      if (r && D.rec && r.d === D.rec.d) { D.rec.n = +r.n || 0; D.rec.at = +r.at || 0; D.rec.done = Object.assign({}, r.done || {}); }
      if (!isPick(m.id) || doneToday(m.id)) { pendingSet(m.id, false); D.waiting = null; render(); return; }
      // 資料庫規則：兩次完成的伺服器時間至少隔 10 秒（多留 0.3 秒，避免時鐘誤差剛好差一點被擋）
      const wait = Math.max(0, ((D.rec && D.rec.at) || 0) + C.GAP - now());
      if (wait > 0) {
        D.waiting = { id: m.id, until: now() + wait };
        waitTick(); render();
        return delay(wait + 300).then(function () { return writeWhenReady(m, newStars); });
      }
      const drops = C.roll(m.level);
      const P = 'daily/' + uid + '/', B = 'bag/' + uid + '/';
      const map = {};
      map[P + 'n'] = ((D.rec && D.rec.n) || 0) + 1;
      map[P + 'at'] = D.api.now();
      map[P + 'done/' + m.id] = true;
      map[B + 'dm'] = D.api.inc(1);
      drops.forEach(function (drop) { map[B + drop.item] = D.api.inc(drop.qty); });
      const nextBag = Object.assign({}, D.bag);
      drops.forEach(function (drop) { nextBag[drop.item] = (nextBag[drop.item] || 0) + drop.qty; });
      const profile = records[3] || {};
      map['treasureBoard/' + uid] = C.treasureRecord(nextBag, records[2], profile.nickname || st.nickname, profile.pub !== false, D.api.now());
      return D.api.update(map).then(function () {
        pendingSet(m.id, false); D.waiting = null;
        D.rec.n = ((D.rec && D.rec.n) || 0) + 1;
        D.rec.at = now();
        D.rec.done = D.rec.done || {}; D.rec.done[m.id] = true;
        drops.forEach(function (drop) { D.bag[drop.item] = (D.bag[drop.item] || 0) + drop.qty; });
        D.bag.dm = (D.bag.dm || 0) + 1;
        D.msg = '';
        // 有新星星時等原本的慶祝畫面結束；多次完成的掉寶畫面另以佇列依序播放。
        setTimeout(function () { showDrops(drops); }, newStars ? 2500 : 0);
        try { window.dispatchEvent(new CustomEvent('lab:loot', { detail: { drops: drops, first: newStars, bag: Object.assign({}, D.bag) } })); } catch (e) { /* 忽略 */ }
        render();
      }, function () {
        pendingSet(m.id, false); D.waiting = null;
        D.msg = T('這次完成沒有記錄成功（網路或資料庫規則的問題），請再做一次。', 'This clear was not recorded (network or database rules) — please try again.');
        render();
      });
    }).catch(function () {
      pendingSet(m.id, false); D.waiting = null;
      D.msg = T('無法核對每日紀錄與寶物，這次尚未記錄，請稍後再試。', 'Could not check your daily record and treasures. This clear was not recorded; please try again.');
      render();
    });
  }

  // ======================= 掉寶動畫與提示 =======================
  const SOUND = { cu: [659, 880], ag: [784, 1047, 1319], au: [880, 1175, 1568], dia: [988, 1319, 1760, 2093], key: [523, 784, 1047, 1568, 2093] };
  let dropQueue = Promise.resolve();
  function playNotes(notes, gain) {
    const sound = window.LabSound;
    if (sound && sound.enabled()) notes.forEach(function (freq, i) { sound.tone({ freq: freq, dur: 0.18, gain: gain, delay: i * 0.08, type: 'triangle' }); });
  }
  function showDrops(drops) {
    dropQueue = dropQueue.then(function () { return dropSequence(drops); }).catch(function () { /* 動畫失敗不影響已儲存的寶物 */ });
  }
  async function dropSequence(drops) {
    const ov = el('div', 'dl-loot');
    ov.setAttribute('role', 'status');
    ov.setAttribute('aria-live', 'polite');
    const box = el('div', 'dl-loot-box r-cu');
    const kicker = el('div', 'dl-drop-kicker', T('每日任務完成', 'Daily mission cleared'));
    box.appendChild(kicker);
    const title = el('h2', 'dl-loot-title', T('寶物來了！', 'Treasure incoming!'));
    box.appendChild(title);
    const progress = el('p', 'dl-loot-progress'); box.appendChild(progress);
    const art = el('div', 'dl-drop-art dl-loot-art');
    art.appendChild(el('span', 'dl-rays'));
    const ic = el('span', 'dl-ico'); art.appendChild(ic);
    box.appendChild(art);
    const name = el('div', 'dl-drop-name'); box.appendChild(name);
    const list = el('div', 'dl-loot-list');
    const tiles = drops.map(function (drop) {
      const tile = el('div', 'dl-loot-tile r-' + drop.item);
      tile.setAttribute('data-item', drop.item);
      const img = el('span', 'dl-ico'); img.innerHTML = icon(drop.item); tile.appendChild(img);
      tile.appendChild(el('span', 'dl-loot-label', itemName(drop.item)));
      tile.appendChild(el('strong', 'dl-loot-qty', '×' + drop.qty));
      list.appendChild(tile); return tile;
    });
    box.appendChild(list);
    const collect = el('button', 'dl-loot-collect', T('收下寶物', 'Collect treasures'));
    collect.type = 'button'; collect.hidden = true; box.appendChild(collect);
    ov.appendChild(box);
    document.body.appendChild(ov);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i];
      box.className = 'dl-loot-box r-' + drop.item;
      ic.innerHTML = icon(drop.item);
      name.textContent = itemName(drop.item) + ' ×' + drop.qty;
      progress.textContent = T('第 ' + (i + 1) + ' / ' + drops.length + ' 種寶物', 'Treasure ' + (i + 1) + ' / ' + drops.length);
      // 重新建立圖示可讓每種寶物各彈出一次；已揭曉的數量留在下方清單。
      art.classList.remove('revealing'); void art.offsetWidth; art.classList.add('revealing');
      tiles[i].classList.add('revealed');
      playNotes(SOUND[drop.item], 0.3);
      await delay(reduced ? 200 : 700);
    }
    const allFive = C.ITEMS.every(function (it) { return drops.some(function (drop) { return drop.item === it.id; }); });
    if (allFive) {
      box.className = 'dl-loot-box dl-loot-all r-au';
      title.textContent = T('五寶齊發', 'All Five Treasures!');
      kicker.textContent = T('銅・銀・金・鑽石・鑰匙', 'COPPER · SILVER · GOLD · DIAMOND · KEY');
      progress.textContent = T('同一次完成，五種寶物全都到手！', 'One clear. All five treasures are yours!');
      art.hidden = true;
      name.textContent = T('這份好運，值得慶祝！', 'A lucky moment worth celebrating!');
      // 手機喇叭可聽的上行音階與和弦；所有主頻均高於 250 Hz。
      playNotes([523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98, 2093], 0.32);
      const sound = window.LabSound;
      if (sound && sound.enabled()) [523.25, 659.25, 783.99].forEach(function (freq) { sound.tone({ freq: freq, dur: 0.65, gain: 0.14, delay: 0.64, type: 'triangle' }); });
    } else {
      title.textContent = T('這次的收穫', 'Your treasures');
      progress.textContent = T('已獲得 ' + drops.length + ' 種寶物', drops.length + ' treasure kinds collected');
    }
    collect.hidden = false;
    await new Promise(function (resolve) {
      let closed = false;
      const close = function () { if (closed) return; closed = true; clearTimeout(timer); ov.classList.add('out'); setTimeout(function () { ov.remove(); resolve(); }, 250); };
      const timer = setTimeout(close, allFive ? 4600 : 3000);
      collect.addEventListener('click', close, { once: true });
    });
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
    if (D.waiting && D.waiting.id === st.daily) {
      banner.classList.add('waiting');
      line.textContent = T('✓ 達成了！每日任務兩次完成至少要隔 10 秒，再 ' + waitLeft() + ' 秒就會自動記錄。現在回每日任務頁也沒關係，會自動補記。',
        '✓ Cleared! Two daily clears must be at least 10 s apart, so this one is recorded automatically in ' + waitLeft() + ' s. You can go back to the daily list now — it will still be recorded.');
      banner.appendChild(line);
    } else if (doneToday(st.daily)) {
      banner.classList.remove('waiting');
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
      box.appendChild(el('p', null, T('每日任務需要登入 Google 帳號：每天臺灣時間 00:00 換新十個任務，每次完成銅幣必掉，銀幣、金幣、鑽石與稀有鑰匙各自獨立判定，也可能五種全掉。',
        'Sign in with Google for ten daily missions at 00:00 Taiwan time. Every clear guarantees copper; silver, gold, diamonds and rare keys are rolled independently, so all five can drop together.')));
      const b = el('button', 'primary', T('用 Google 帳號登入', 'Sign in with Google'));
      b.type = 'button';
      b.addEventListener('click', function () { D.api.signIn().catch(function () {}); });
      box.appendChild(b);
      app.appendChild(box);
      app.appendChild(bagSection(true));
      app.appendChild(oddsSection());
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
      else if (pendingIds().indexOf(id) >= 0) {
        const pc = el('span', 'dl-done dl-pending', D.waiting && D.waiting.id === id ? T('記錄中…再 ' + waitLeft() + ' 秒', 'Recording… ' + waitLeft() + ' s') : T('記錄中…', 'Recording…'));
        pc.setAttribute('data-id', id);
        top.appendChild(pc);
      }
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
    sec.appendChild(el('h2', null, T('掉寶機率', 'Drop chances')));
    sec.appendChild(el('p', 'lb-note', T('每次完成至少獲得 1 枚銅幣。五種寶物各自獨立擲骰，可以同時掉落；其他寶物的機率隨任務難度提高，與星星數及星星比例無關。',
      'Every clear guarantees at least 1 copper coin. All five treasures are rolled independently and can drop together. Harder missions raise the other drop chances; stars and star share have no effect.')));
    sec.appendChild(el('p', 'lb-note', T('L 是任務等級（1–10），t = (L − 1) / 9。表中的百分比經四捨五入；數量與權重固定，不隨難度或星星改變。',
      'L is the mission level (1–10), and t = (L − 1) / 9. Percentages are rounded. Amounts and weights are fixed, regardless of difficulty or stars.')));
    sec.appendChild(C.oddsTable(document, T));
    sec.appendChild(el('h3', 'dl-odds-sub', T('每次完成的平均收穫', 'Average treasures per clear')));
    // 十個等級各一列（站長 11/16：★1–★10 都要有）
    const wrap = el('div', 'dl-table-wrap');
    const table = el('table', 'dl-table dl-ev-table'), head = el('thead'), hr = el('tr');
    [T('任務', 'Mission')].concat(C.ITEMS.map(function (it) { return T(it.zh, it.en); })).forEach(function (label) {
      const th = el('th', null, label); th.scope = 'col'; hr.appendChild(th);
    });
    head.appendChild(hr); table.appendChild(head);
    const body = el('tbody');
    for (let lv = 1; lv <= 10; lv++) {
      const tr = el('tr'), th = el('th', null, '★' + lv); th.scope = 'row'; tr.appendChild(th);
      C.ITEMS.forEach(function (it, i) { tr.appendChild(el('td', null, ev(C.dropChances(lv)[i] * C.qtyMean(it.id)))); });
      body.appendChild(tr);
    }
    table.appendChild(body); wrap.appendChild(table); sec.appendChild(wrap);
    sec.appendChild(el('p', 'lb-note', T('期望值＝該寶物的掉落機率 × 掉到時的平均數量。銅幣平均 2.33 枚、銀幣 1.67 枚、金幣 1.33 枚；鑽石與稀有鑰匙各 1 個。新任務與領過星星的任務採用相同掉寶規則。',
      'Expected value = that treasure’s drop chance × its average amount when it drops. The fixed average amounts are 2.33 copper, 1.67 silver, 1.33 gold, and 1 diamond or key. New and previously claimed missions use the same drop rules.')));
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
