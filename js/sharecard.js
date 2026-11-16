/*
 * sharecard.js — 成績卡（11/14 站長要求）：把任務成績畫成一張圖，可以存到手機或電腦、直接分享到社群，或複製圖片。
 *
 * LabShareCard.open(opts)
 *   opts.scope：'all'（全部科目）、'subj'（選科目）、'mods'（選實驗）；opts.subj、opts.mods 是預先勾選的科目與實驗
 *   opts.ranks：{ all: 名次, phy: 名次… }（排行榜頁才有）；opts.bag：寶物（排行榜頁才有）
 * 卡片只放暱稱（可選完整、頭尾字或不顯示）、星星、任務、成就與網址，不放姓名、學校、帳號或電子郵件。
 * 卡片尺寸 1080×1350（4:5，Instagram、Threads、Facebook、LINE 都適用），固定配色，不跟網站深淺色。
 * 分享：navigator.share({ files })（手機的分享選單，可選 IG、LINE、FB…）；不支援時只有「存成圖片」與「複製圖片」。
 */
(function () {
  'use strict';
  if (window.LabShareCard) return;
  const LM = window.LabMission;
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const L = function (o) { return o ? T(o.zh, o.en || o.zh) : ''; };
  const SITE = 'https://lab.astroni.org/';
  const W = 1080, H = 1350;
  const SUBJ = window.LAB_SUBJECTS || [];
  const subjOf = function (mod) { return window.LAB_SUBJECT_OF ? window.LAB_SUBJECT_OF(mod) : 'phy'; };
  const starsOf = function (x) { return LM && LM.starsOf ? LM.starsOf(x) : x.level; };
  const self = document.currentScript;
  const base = self ? self.getAttribute('src').replace(/js\/sharecard\.js.*$/, '') : '';
  const ver = self ? ((self.getAttribute('src') || '').match(/\?v=\d+/) || [''])[0] : '';
  // 各科代表色（卡片固定用深底，所以取亮一點的色）
  const SC = { phy: '#5eb8ff', chem: '#ff8a65', bio: '#7bd88f', earth: '#c9a46a', math: '#b39dff', info: '#4dd0c8', geog: '#e6c15a', music: '#ff7fb6' };

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function modList() { return window.LAB_MISSION_MODULES || []; }
  function modName(id) { const m = modList().filter(function (x) { return x.id === id; })[0]; return m ? L(m) : id; }
  function subjName(id) { const s = SUBJ.filter(function (x) { return x.id === id; })[0]; return s ? L(s) : id; }
  function live(id) { const lv = window.LAB_LIVE_MODULES; return !lv || lv.indexOf(id) >= 0; }

  // 沿用現有目錄的名稱與說明，不另建關鍵字清單；科目頁上已有的卡片同義詞也一起比對。
  let catalogP = null;
  function loadCatalog() {
    if (window.LAB_CATALOG) return Promise.resolve();
    if (!catalogP) catalogP = new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = base + 'js/catalog.js' + ver;
      s.onload = s.onerror = resolve;
      document.head.appendChild(s);
    });
    return catalogP;
  }
  function searchText(text) {
    text = String(text || '').normalize('NFKC').toLowerCase();
    const settings = window.LabSettings;
    return settings && settings.toHans ? settings.toHans(text) : text;
  }
  function modKeywords(id) {
    const m = modList().filter(function (it) { return it.id === id; })[0] || {};
    const c = (window.LAB_CATALOG || []).filter(function (it) { return it.s === id; })[0] || {};
    const words = [id, m.zh, m.en, c.zh, c.en, c.dzh, c.den];
    document.querySelectorAll('[data-module][data-keywords]').forEach(function (card) {
      if (card.getAttribute('data-module') === id) words.push(card.getAttribute('data-keywords'));
    });
    return words.filter(Boolean).join(' ');
  }

  // 使用既有的個人使用紀錄；成就系統已載入時直接重用，否則只讀本人節點。
  function loadActivity() {
    const me = window.LabAchievements && window.LabAchievements._me;
    if (me && me.loaded) return Promise.resolve(me.stats || {});
    const uid = LM._state.user.uid;
    return new Promise(function (resolve) {
      const timer = setTimeout(function () { resolve({}); }, 5000);
      Promise.resolve(LM._ready ? LM._ready() : null).then(function (api) {
        return api && api.get ? api.get('userStats/' + uid) : {};
      }).catch(function () { return {}; }).then(function (stats) { clearTimeout(timer); resolve(stats || {}); });
    });
  }

  function orderedMods(mods, opts, stats) {
    const order = (window.LAB_LIVE_MODULES || modList().map(function (m) { return m.id; })).slice().reverse()
      .filter(function (id) { return mods[id]; });
    const launch = {}, completed = {}, visited = {};
    order.forEach(function (id, i) { launch[id] = i; });
    Object.keys(LM._state.done || {}).forEach(function (id) {
      const mod = id.replace(/-(h?\d+)$/, '');
      completed[mod] = Math.max(completed[mod] || 0, +LM._state.done[id].at || 0);
    });
    Object.keys(stats.modules || {}).forEach(function (id) { if (stats.modules[id]) visited[id] = 0; });
    Object.keys(stats.days || {}).forEach(function (day) {
      if (!/^\d{8}$/.test(day)) return;
      // 雲端每天打開的實驗只有日期，沿用臺灣日期精度，不虛構當天的操作時刻。
      const at = Date.parse(day.slice(0, 4) + '-' + day.slice(4, 6) + '-' + day.slice(6) + 'T00:00:00+08:00');
      Object.keys(stats.days[day] || {}).forEach(function (id) {
        if (stats.days[day][id]) visited[id] = Math.max(visited[id] || 0, at || 0);
      });
    });
    try {
      const history = JSON.parse(localStorage.getItem('labHist') || '{}') || {};
      Object.keys(history).forEach(function (id) {
        const h = history[id];
        if (h && (h.v > 0 || h.o > 0 || h.s > 0)) visited[id] = Math.max(visited[id] || 0, +h.t || 0);
      });
    } catch (e) { /* 本機紀錄無法讀取時，仍可依本人的雲端紀錄排序。 */ }
    const current = LM.module && (opts.mods || []).indexOf(LM.module) >= 0 ? LM.module : null;
    function group(id) { return id in completed ? 0 : id in visited ? 1 : 2; }
    return order.sort(function (a, b) {
      return Number(b === current) - Number(a === current) || group(a) - group(b) ||
        (group(a) === 0 ? completed[b] - completed[a] : (visited[b] || 0) - (visited[a] || 0)) || launch[a] - launch[b];
    });
  }

  function procedureText(p) {
    if (!p.total) return T('實驗步驟：尚無紀錄', 'Procedure not recorded');
    return (p.complete ? T('✓ 實驗步驟全部完成 ', 'Procedure complete ') : T('實驗步驟 ', 'Procedure ')) + p.done + '/' + p.total;
  }
  const procedurePages = {};
  function loadProcedure(mod) {
    const saved = LM.steps && LM.steps(mod);
    if (saved) return Promise.resolve(saved);
    const root = mod === LM.module && document.querySelector('ol.steps#steps');
    if (root) return Promise.resolve({ done: 0, total: root.children.length, complete: false });
    // 未玩過的實驗只讀原頁的步驟結構，不載入或執行它的物理程式。
    // 動態清單尚無總數時明寫「尚無紀錄」，不把任務數當成步驟數。
    if (!procedurePages[mod]) procedurePages[mod] = fetch(base + mod + '.html').then(function (r) {
      if (!r.ok) return null;
      return r.text().then(function (html) {
        const steps = new DOMParser().parseFromString(html, 'text/html').querySelector('ol.steps#steps');
        return steps ? { done: 0, total: steps.children.length, complete: false } : null;
      });
    }).catch(function () { return null; });
    return procedurePages[mod];
  }

  // 以實際列高分張，長清單每個實驗都有自己的位置，文字不縮成讀不清的小字。
  function cardPages(data) {
    const capacity = H - 170 - 40 - 776 - (data.procedureLabel ? 48 : 0);
    const pages = [], rows = [];
    let height = 0;
    data.rows.forEach(function (row) {
      const h = row.procedure ? 116 : 74;
      if (height + h > capacity && rows.length) { pages.push(rows.splice(0)); height = 0; }
      rows.push(row); height += h;
    });
    if (rows.length || !pages.length) pages.push(rows);
    return pages.map(function (part, i) {
      return Object.assign({}, data, { rows: part, rowMax: Math.max.apply(null, data.rows.map(function (r) { return r.s; }).concat([1])), scopeLabel: data.scopeLabel + (pages.length > 1 ? ' · ' + (i + 1) + '/' + pages.length : '') });
    });
  }

  // ---------- 載入：所有任務定義、QR 程式庫 ----------
  let qrLib = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (!qrLib) qrLib = new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = base + 'vendor/qrcode/qrcode.js' + ver;
      s.onload = function () { resolve(window.qrcode || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return qrLib;
  }

  // ---------- 統計：每個實驗的任務數、完成數、星星 ----------
  function tally() {
    const all = LM.all(), done = (LM._state && LM._state.done) || {};
    const mods = {};
    Object.keys(all).forEach(function (mod) {
      if (!live(mod)) return;
      const t = { id: mod, subj: subjOf(mod), n: 0, d: 0, s: 0, S: 0 };
      all[mod].forEach(function (m) {
        t.n++; t.S += starsOf(m);
        if (done[m.id]) { t.d++; t.s += (+done[m.id].stars || 0); }
      });
      mods[mod] = t;
    });
    return mods;
  }
  function sum(list) {
    return list.reduce(function (a, t) { a.n += t.n; a.d += t.d; a.s += t.s; a.S += t.S; return a; }, { n: 0, d: 0, s: 0, S: 0 });
  }

  // ---------- 畫卡片 ----------
  const FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Heiti TC", system-ui, sans-serif';
  function f(px, w) { return (w || 400) + ' ' + px + 'px ' + FONT; }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function star(c, cx, cy, R, fill) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? R * 0.42 : R, a = -Math.PI / 2 + i * Math.PI / 5;
      c.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    c.closePath();
    const g = c.createLinearGradient(cx, cy - R, cx, cy + R);
    g.addColorStop(0, '#fff1a8'); g.addColorStop(0.45, fill || '#ffc93c'); g.addColorStop(1, '#e09a00');
    c.fillStyle = g; c.fill();
  }
  function fit(c, text, maxW, px, w) { // 字太長就縮小字級，最小 0.7 倍，再不行就截斷
    let s = px;
    c.font = f(s, w);
    while (c.measureText(text).width > maxW && s > px * 0.7) { s -= 1; c.font = f(s, w); }
    if (c.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && c.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  function draw(canvas, d, qr) {
    const c = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    // 背景：深藍綠漸層＋方格紙（實驗紀錄本的感覺）＋右上的光
    const bg = c.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f2a33'); bg.addColorStop(0.55, '#123b3f'); bg.addColorStop(1, '#0b1f2a');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.045)'; c.lineWidth = 1;
    for (let x = 0; x <= W; x += 36) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
    for (let y = 0; y <= H; y += 36) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
    const glow = c.createRadialGradient(W * 0.82, H * 0.12, 10, W * 0.82, H * 0.12, 520);
    glow.addColorStop(0, 'rgba(255,201,60,0.20)'); glow.addColorStop(1, 'rgba(255,201,60,0)');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);

    const X = 72, RW = W - X * 2;
    // 標誌：週期表鎳格
    const tx = X, ty = 64, ts = 112;
    rr(c, tx, ty, ts, ts, 16);
    const tg = c.createLinearGradient(tx, ty, tx, ty + ts);
    tg.addColorStop(0, '#2a4a52'); tg.addColorStop(1, '#173238');
    c.fillStyle = tg; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#5f9f92'; c.stroke();
    c.fillStyle = '#cfe7e1'; c.textBaseline = 'alphabetic';
    // 核種寫法（站長 11/14）：左上「倪」放質量數的位置、左下原子序 28、Ni 偏右
    c.font = f(20, 700); c.textAlign = 'left'; c.fillText('倪', tx + 12, ty + 30);
    c.fillText('28', tx + 12, ty + ts - 12);
    c.font = f(50, 800); c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.fillText('Ni', tx + ts / 2 + 14, ty + ts / 2 + 18);
    c.textAlign = 'left';
    c.fillStyle = '#ffffff'; c.font = f(40, 800);
    c.fillText(fit(c, T('讓倪動手⚡高中全科模擬實驗室', 'Astro Ni Lab'), RW - ts - 28, 40, 800), tx + ts + 28, ty + 52);
    c.fillStyle = '#9cc7bf'; c.font = f(26, 500);
    c.fillText(T('Astro Ni Lab・倪的星星成績卡', 'Ni Stars report card'), tx + ts + 28, ty + 94);

    // 名字與範圍
    let y = 270;
    c.fillStyle = '#ffffff'; c.font = f(54, 800);
    c.fillText(fit(c, d.name || T('一位實驗家', 'A young scientist'), RW, 54, 800), X, y);
    y += 50;
    c.fillStyle = '#9cc7bf'; c.font = f(30, 500);
    c.fillText(fit(c, d.scopeLabel + '　' + d.date, RW, 30, 500), X, y);

    // 大星星
    y += 40;
    rr(c, X, y, RW, 230, 28);
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fill();
    c.strokeStyle = 'rgba(255,201,60,0.55)'; c.lineWidth = 2; c.stroke();
    star(c, X + 120, y + 115, 78);
    c.fillStyle = '#ffd75e'; c.font = f(120, 800);
    c.fillText(String(d.total.s), X + 230, y + 150);
    const sw = c.measureText(String(d.total.s)).width;
    c.fillStyle = '#e8d9a8'; c.font = f(34, 600);
    c.fillText(d.ofAll ? '/ ' + d.total.S + T(' 顆星', ' stars') : T('顆倪的星星', 'Ni stars'), X + 240 + sw, y + 148);
    c.fillStyle = '#cfe7e1'; c.font = f(30, 500);
    c.fillText(fit(c, d.sub, RW - 260, 30, 500), X + 232, y + 196);
    y += 230;

    // 三格小統計
    y += 28;
    const cw = (RW - 2 * 20) / 3;
    d.chips.forEach(function (ch, i) {
      const cx = X + i * (cw + 20);
      rr(c, cx, y, cw, 118, 20);
      c.fillStyle = 'rgba(255,255,255,0.07)'; c.fill();
      c.fillStyle = '#ffffff'; c.font = f(46, 800); c.textAlign = 'center';
      c.fillText(fit(c, ch[0], cw - 24, 46, 800), cx + cw / 2, y + 60);
      c.fillStyle = '#9cc7bf'; c.font = f(24, 500);
      c.fillText(fit(c, ch[1], cw - 24, 24, 500), cx + cw / 2, y + 96);
      c.textAlign = 'left';
    });
    y += 118 + 40;

    if (d.procedureLabel) {
      c.fillStyle = '#9fe0be'; c.font = f(30, 700);
      c.fillText(fit(c, d.procedureLabel, RW, 30, 700), X, y + 22);
      y += 48;
    }

    // 明細列：名稱、進度條、數字
    const fy0 = H - 170 - 40;
    const maxS = d.rowMax || Math.max.apply(null, d.rows.map(function (r) { return r.s; }).concat([1]));
    d.rows.forEach(function (r) {
      const rowH = r.procedure ? 116 : 74;
      if (y + rowH > fy0) return; // 對直接呼叫繪圖介面的外部工具也保留邊界。
      const col = SC[r.subj] || '#5eb8ff';
      c.fillStyle = col; rr(c, X, y + 8, 10, 46, 5); c.fill();
      c.fillStyle = '#ffffff'; c.font = f(30, 700);
      c.fillText(fit(c, r.name, RW * 0.5, 30, 700), X + 26, y + 34);
      c.fillStyle = '#9cc7bf'; c.font = f(24, 500); c.textAlign = 'right';
      c.fillText(d.ofAll ? r.d + ' / ' + r.n + T(' 任務　', ' missions · ') + r.s + ' / ' + r.S + ' ★'
        : r.d + T(' 個任務　', (r.d === 1 ? ' mission · ' : ' missions · ')) + r.s + ' ★', X + RW, y + 34);
      c.textAlign = 'left';
      rr(c, X + 26, y + 48, RW - 26, 12, 6); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fill();
      const p = d.ofAll ? (r.S ? r.s / r.S : 0) : r.s / maxS; // 選實驗：占該實驗全部星星；科目：和自己最多的一科比
      if (p > 0) { rr(c, X + 26, y + 48, Math.max(12, (RW - 26) * p), 12, 6); c.fillStyle = col; c.fill(); }
      if (r.procedure) {
        const step = r.procedure;
        c.fillStyle = step.complete ? '#9fe0be' : '#cfe7e1'; c.font = f(32, step.complete ? 700 : 500);
        c.fillText(fit(c, procedureText(step), RW - 26, 32, step.complete ? 700 : 500), X + 26, y + 91);
        if (!step.complete) {
          rr(c, X + 26, y + 100, RW - 26, 8, 4); c.fillStyle = 'rgba(255,255,255,0.10)'; c.fill();
          if (step.done > 0 && step.total > 0) {
            rr(c, X + 26, y + 100, (RW - 26) * step.done / step.total, 8, 4); c.fillStyle = '#9fe0be'; c.fill();
          }
        }
      }
      y += rowH;
    });

    // 頁尾：網址、QR code
    const fy = H - 170;
    c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X, fy - 24); c.lineTo(X + RW, fy - 24); c.stroke();
    c.fillStyle = '#ffffff'; c.font = f(34, 800);
    c.fillText(T('一起來動手做實驗！', 'Come and try the experiments!'), X, fy + 30);
    c.fillStyle = '#ffd75e'; c.font = f(32, 700);
    c.fillText(d.url.replace(/^https:\/\//, '').replace(/\/$/, ''), X, fy + 78);
    c.fillStyle = '#9cc7bf'; c.font = f(22, 500);
    c.fillText(T('免安裝・免登入就能操作；登入後完成任務收集星星', 'No install, no sign-in needed; sign in to collect stars'), X, fy + 116);
    if (qr) {
      const n = qr.getModuleCount(), q = 132, m = 8, cell = (q - m * 2) / n, qx = X + RW - q, qy = fy - 4;
      rr(c, qx, qy, q, q, 12); c.fillStyle = '#ffffff'; c.fill();
      c.fillStyle = '#0f2a33';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect(qx + m + k * cell, qy + m + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }

  // ---------- 對話框 ----------
  let box = null;
  function close() { if (box) { box.remove(); box = null; document.removeEventListener('keydown', onKey); } }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(opts) {
    opts = opts || {};
    if (!LM || !LM._state || !LM._state.user) return;
    close();
    box = el('div', 'lab-sc');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', T('分享我的成績', 'Share my results'));
    const card = el('div', 'lab-sc-card');
    box.appendChild(card);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    card.appendChild(el('p', 'lab-sc-note', T('準備中…', 'Preparing…')));
    const uid = LM._state.user.uid;
    Promise.all([LM.loadAll ? LM.loadAll() : null, loadQR(), loadCatalog(), loadActivity()]).then(function (result) {
      if (card.isConnected && LM._state.user && LM._state.user.uid === uid) build(card, opts, result[3]);
    });
  }

  function build(card, opts, stats) {
    const st = LM._state;
    const mods = tally();
    // 先依最近完成，再依既有操作紀錄；未玩過的才用上線倒序。一般勾選不改變順序。
    const ordered = orderedMods(mods, opts, stats);
    const keywords = {};
    ordered.forEach(function (id) { keywords[id] = modKeywords(id); });
    const played = ordered.filter(function (k) { return mods[k].d > 0; });
    const subjs = SUBJ.filter(function (s) { return Object.keys(mods).some(function (k) { return mods[k].subj === s.id; }); });
    let scope = opts.scope || 'all';
    const pickS = {}, pickM = {};
    (opts.subj || []).forEach(function (s) { pickS[s] = true; });
    (opts.mods || []).forEach(function (m) { pickM[m] = true; });
    if (!Object.keys(pickS).length && subjs[0]) {
      // 預設勾星星最多的科目
      const best = subjs.map(function (s) { return [s.id, sum(Object.keys(mods).filter(function (k) { return mods[k].subj === s.id; }).map(function (k) { return mods[k]; })).s]; })
        .sort(function (a, b) { return b[1] - a[1]; })[0];
      pickS[best[0]] = true;
    }
    if (!Object.keys(pickM).length && played[0]) pickM[played[0]] = true;
    let nameMode = st.nickname ? (st.pub === false ? 'mask' : 'full') : 'none';

    card.innerHTML = '';
    const head = el('div', 'lab-sc-head');
    head.appendChild(el('strong', null, T('分享我的成績', 'Share my results')));
    const x = el('button', 'lab-sc-x', '×'); x.type = 'button'; x.setAttribute('aria-label', T('關閉', 'Close'));
    x.addEventListener('click', close);
    head.appendChild(x);
    card.appendChild(head);

    const body = el('div', 'lab-sc-body');
    card.appendChild(body);
    const side = el('div', 'lab-sc-side');
    const prev = el('div', 'lab-sc-prev');
    body.appendChild(prev); body.appendChild(side);
    const img = el('img'); img.alt = T('成績卡預覽', 'Report card preview');
    prev.appendChild(img);
    prev.appendChild(el('p', 'lab-sc-tip', T('手機也可以長按圖片儲存。', 'On a phone you can also long-press the image to save it.')));
    const pager = el('div', 'lab-sc-pages'); pager.hidden = true;
    pager.setAttribute('aria-label', T('成績卡換頁', 'Report card pages'));
    const previous = el('button', null, T('上一張', 'Previous')), next = el('button', null, T('下一張', 'Next'));
    previous.type = next.type = 'button';
    const pageLabel = el('span'); pageLabel.setAttribute('role', 'status');
    pager.appendChild(previous); pager.appendChild(pageLabel); pager.appendChild(next); prev.appendChild(pager);
    const pageTip = el('p', 'lab-sc-tip', T('多張成績卡可換頁，逐張儲存、複製或分享。', 'Use the page buttons to save, copy or share each card.'));
    pageTip.hidden = true; prev.appendChild(pageTip);

    // 範圍
    const fs1 = el('fieldset', 'lab-sc-fs');
    fs1.appendChild(el('legend', null, T('卡片內容', 'What to show')));
    [['all', T('全部科目', 'All subjects')], ['subj', T('選科目', 'Choose subjects')], ['mods', T('選實驗', 'Choose experiments')]].forEach(function (o) {
      const lab = el('label', 'lab-sc-opt');
      const r = el('input'); r.type = 'radio'; r.name = 'sc-scope'; r.value = o[0]; r.checked = scope === o[0];
      r.addEventListener('change', function () { scope = o[0]; picks(); redraw(); });
      lab.appendChild(r); lab.appendChild(el('span', null, o[1]));
      fs1.appendChild(lab);
    });
    side.appendChild(fs1);
    const search = el('input', 'lab-sc-search');
    search.type = 'search'; search.autocomplete = 'off';
    search.placeholder = T('搜尋實驗：名稱或關鍵字', 'Search experiments: name or keyword');
    search.setAttribute('aria-label', search.placeholder);
    search.setAttribute('aria-controls', 'lab-sc-picks');
    search.addEventListener('input', picks);
    side.appendChild(search);
    const pickBox = el('div', 'lab-sc-picks');
    pickBox.id = 'lab-sc-picks';
    side.appendChild(pickBox);

    // 名字
    const fs2 = el('fieldset', 'lab-sc-fs');
    fs2.appendChild(el('legend', null, T('卡片上的名字', 'Name on the card')));
    [['full', T('完整暱稱', 'Full nickname')], ['mask', T('只顯示頭尾字', 'First and last character only')], ['none', T('不顯示', 'Hide')]].forEach(function (o) {
      if (o[0] !== 'none' && !st.nickname) return;
      const lab = el('label', 'lab-sc-opt');
      const r = el('input'); r.type = 'radio'; r.name = 'sc-name'; r.value = o[0]; r.checked = nameMode === o[0];
      r.addEventListener('change', function () { nameMode = o[0]; redraw(); });
      lab.appendChild(r); lab.appendChild(el('span', null, o[1]));
      fs2.appendChild(lab);
    });
    side.appendChild(fs2);
    side.appendChild(el('p', 'lab-sc-note', T('卡片不會放你的姓名、學校或帳號。分享前請確認暱稱不是真實姓名。', 'The card never shows your real name, school or account. Make sure your nickname is not your real name before sharing.')));

    const acts = el('div', 'lab-sc-acts');
    side.appendChild(acts);
    const msg = el('p', 'lab-sc-msg'); msg.setAttribute('aria-live', 'polite');
    side.appendChild(msg);

    function picks() {
      pickBox.innerHTML = '';
      search.hidden = scope !== 'mods';
      if (scope === 'all') return;
      const query = searchText(search.value).trim();
      const list = scope === 'subj'
        ? subjs.map(function (s) { return { id: s.id, name: L(s), on: pickS }; })
        : ordered.filter(function (id) { return !query || searchText(keywords[id]).includes(query); })
          .map(function (m) { return { id: m, name: modName(m), on: pickM }; });
      pickBox.scrollTop = 0;
      if (!list.length) {
        const note = el('p', 'lab-sc-note', T('找不到符合的實驗', 'No matching experiments'));
        note.setAttribute('role', 'status'); pickBox.appendChild(note); return;
      }
      list.forEach(function (it) {
        const lab = el('label', 'lab-sc-chip');
        const cb = el('input'); cb.type = 'checkbox'; cb.value = it.id; cb.checked = !!it.on[it.id];
        cb.addEventListener('change', function () { if (cb.checked) it.on[it.id] = true; else delete it.on[it.id]; redraw(); });
        lab.appendChild(cb); lab.appendChild(el('span', null, it.name));
        pickBox.appendChild(lab);
      });
    }

    function data() {
      const now = new Date();
      const date = now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate();
      const name = nameMode === 'full' ? st.nickname : nameMode === 'mask' ? LM.mask(st.nickname) : '';
      const ach = window.LabAchievements && window.LabAchievements._me ? Object.keys(window.LabAchievements._me.got || {}).length : null;
      const ranks = opts.ranks || {};
      let rows = [], total, scopeLabel, sub = '', url = SITE, chips, procedureLabel = '';
      const procedures = LM.allSteps ? LM.allSteps() : {};
      const modsIn = function (pred) { return Object.keys(mods).filter(pred).map(function (k) { return mods[k]; }); };
      if (scope === 'mods') {
        const ms = Object.keys(pickM).filter(function (m) { return mods[m]; });
        total = sum(ms.map(function (m) { return mods[m]; }));
        // 站長 11/16：實驗步驟只放在「單一個實驗」的成績卡，給老師檢核那一個實驗用；勾好幾個實驗、全部科目、選科目都不顯示
        const one = ms.length === 1;
        rows = ms.map(function (m) { const t = mods[m]; return { name: modName(m), subj: t.subj, d: t.d, n: t.n, s: t.s, S: t.S, procedure: one ? (procedures[m] || procedureDefs[m]) : null }; });
        scopeLabel = ms.length === 1 ? modName(ms[0]) : T(ms.length + ' 個實驗', ms.length + ' experiments');
        if (ms.length === 1) url = SITE + ms[0] + '.html';
        sub = T('完成 ', 'Completed ') + total.d + ' / ' + total.n + T(' 個任務', ' missions');
        chips = [[String(total.d), T('完成任務', 'Missions done')], [Math.round(total.S ? 100 * total.s / total.S : 0) + '%', T('星星進度', 'Star progress')],
          [String(ms.length), T('實驗', ms.length === 1 ? 'Experiment' : 'Experiments')]];
      } else {
        const ss = scope === 'all' ? subjs.map(function (s) { return s.id; }) : subjs.map(function (s) { return s.id; }).filter(function (s) { return pickS[s]; });
        const inS = modsIn(function (k) { return ss.indexOf(mods[k].subj) >= 0; });
        total = sum(inS);
        if (ss.length === 1) {
          // 單一科目：明細列出這一科完成過任務的實驗（星星多的在前）
          rows = inS.filter(function (t) { return t.d > 0; }).sort(function (a, b) { return b.s - a.s; })
            .map(function (t) { return { name: modName(t.id), subj: t.subj, d: t.d, n: t.n, s: t.s, S: t.S }; });
        } else {
          rows = ss.map(function (s) {
            const t = sum(inS.filter(function (m) { return m.subj === s; }));
            return { name: subjName(s), subj: s, d: t.d, n: t.n, s: t.s, S: t.S };
          }).filter(function (r) { return r.d > 0; }).sort(function (a, b) { return b.s - a.s; });
        }
        scopeLabel = scope === 'all' ? T('全部科目', 'All subjects') : ss.map(subjName).join(T('、', ', '));
        const rk = scope === 'all' ? ranks.all : (ss.length === 1 ? ranks[ss[0]] : 0);
        sub = (rk ? T((scope === 'all' ? '全科' : subjName(ss[0])) + '排名第 ' + rk + ' 名', (scope === 'all' ? 'Overall' : subjName(ss[0])) + ' rank #' + rk) + T('・', ' · ') : '') +
          T('完成 ', 'Completed ') + total.d + T(' 個任務', ' missions');
        const touched = inS.filter(function (t) { return t.d > 0; }).length;
        chips = [[String(total.d), T('完成任務', 'Missions done')], [String(touched), T('挑戰過的實驗', 'Experiments tried')]];
        if (scope !== 'all' && rk) chips.push([T('第 ' + rk + ' 名', '#' + rk), T(subjName(ss[0]) + '排名', subjName(ss[0]) + ' rank')]);
        else if (ach != null) chips.push([String(ach), T('成就', 'Achievements')]);
        else chips.push([String(ss.length), T('科目', 'Subjects')]);
      }
      return { name: name, date: date, total: total, rows: rows, scopeLabel: scopeLabel, sub: sub, chips: chips, url: url, ofAll: scope === 'mods', procedureLabel: procedureLabel };
    }

    const canvas = el('canvas');
    const procedureDefs = {};
    let blob = null, d = null, pages = [], pageIndex = 0, revision = 0;
    function redraw() {
      const ticket = ++revision;
      acts.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      let selected = scope === 'mods' ? Object.keys(pickM).filter(function (m) { return mods[m]; }) : [];
      if (selected.length !== 1) selected = [];   // 只有單一實驗才讀步驟
      Promise.all(selected.map(function (m) { return loadProcedure(m).then(function (p) { procedureDefs[m] = p; }); })).then(function () {
        if (ticket !== revision || !card.isConnected) return;
        d = data(); pages = cardPages(d); pageIndex = 0; drawPage();
      });
    }
    function drawPage() {
      const ticket = ++revision, page = pages[pageIndex];
      acts.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      pager.hidden = pageTip.hidden = pages.length <= 1;
      previous.disabled = pageIndex === 0; next.disabled = pageIndex + 1 === pages.length;
      pageLabel.textContent = (pageIndex + 1) + ' / ' + pages.length;
      let qr = null;
      if (window.qrcode) { qr = window.qrcode(0, 'M'); qr.addData(d.url, 'Byte'); qr.make(); }
      draw(canvas, page, qr);
      blob = null;
      canvas.toBlob(function (b) {
        if (ticket !== revision || !card.isConnected || !b) return;
        blob = b;
        if (img.src) URL.revokeObjectURL(img.src);
        img.alt = T('成績卡預覽', 'Report card preview') + ' · ' + page.scopeLabel + ' · ' + (page.procedureLabel || page.rows.filter(function (r) { return r.procedure; }).map(function (r) { return r.name + ': ' + procedureText(r.procedure); }).join('; '));
        img.src = URL.createObjectURL(b);
        acts.querySelectorAll('button').forEach(function (button) { button.disabled = false; });
      }, 'image/png');
      msg.textContent = '';
    }
    previous.addEventListener('click', function () { if (pageIndex > 0) { pageIndex--; drawPage(); } });
    next.addEventListener('click', function () { if (pageIndex + 1 < pages.length) { pageIndex++; drawPage(); } });
    function fileName() {
      const n = new Date();
      return 'astro-ni-lab-' + n.getFullYear() + String(n.getMonth() + 1).padStart(2, '0') + String(n.getDate()).padStart(2, '0') + (pages.length > 1 ? '-' + (pageIndex + 1) : '') + '.png';
    }
    function whenBlob() { return blob ? Promise.resolve(blob) : new Promise(function (res) { canvas.toBlob(res, 'image/png'); }); }
    function shareText() {
      const detail = d.procedureLabel || d.rows.filter(function (r) { return r.procedure; }).map(function (r) { return r.name + ': ' + procedureText(r.procedure); }).join('\n');
      const text = T('我在「讓倪動手⚡高中全科模擬實驗室」拿到 ' + d.total.s + ' 顆倪的星星！一起來動手做實驗：', 'I earned ' + d.total.s + ' Ni stars at Astro Ni Lab! Try the experiments: ') + d.url + (detail ? '\n' + detail : '');
      return window.LabSettings && window.LabSettings.toHans ? window.LabSettings.toHans(text) : text;
    }

    // 分享（手機的分享選單）
    const probe = new File([new Blob([''], { type: 'image/png' })], 'x.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [probe] })) {
      const b = el('button', 'primary', T('分享到社群…', 'Share…')); b.type = 'button';
      b.addEventListener('click', function () {
        whenBlob().then(function (bl) {
          const file = new File([bl], fileName(), { type: 'image/png' });
          return navigator.share({ files: [file], text: shareText() });
        }).catch(function (e) { if (!e || e.name !== 'AbortError') msg.textContent = T('這個瀏覽器沒辦法直接分享，請先存成圖片再上傳。', 'This browser cannot share directly. Save the image and upload it instead.'); });
      });
      acts.appendChild(b);
    }
    const save = el('button', acts.children.length ? null : 'primary', T('存成圖片', 'Save image')); save.type = 'button';
    save.addEventListener('click', function () {
      whenBlob().then(function (bl) {
        const a = el('a'); a.href = URL.createObjectURL(bl); a.download = fileName();
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        msg.textContent = T('已存成圖片（在下載資料夾或相簿）。', 'Saved (check your downloads or photos).');
      });
    });
    acts.appendChild(save);
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      const cp = el('button', null, T('複製圖片', 'Copy image')); cp.type = 'button';
      cp.addEventListener('click', function () {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': whenBlob() })])
          .then(function () { msg.textContent = T('已複製，可以直接貼到聊天或貼文。', 'Copied — paste it into a chat or post.'); })
          .catch(function () { msg.textContent = T('沒辦法複製，請改用「存成圖片」。', 'Could not copy. Use “Save image” instead.'); });
      });
      acts.appendChild(cp);
    }
    const cpText = el('button', null, T('複製分享文字', 'Copy share text')); cpText.type = 'button';
    cpText.addEventListener('click', function () {
      (navigator.clipboard ? navigator.clipboard.writeText(shareText()) : Promise.reject())
        .then(function () { msg.textContent = T('已複製文字與網址。', 'Copied the text and link.'); })
        .catch(function () { msg.textContent = shareText(); });
    });
    acts.appendChild(cpText);

    picks();
    redraw();
    x.focus();
  }

  window.LabShareCard = { open: open, _draw: draw };
})();
