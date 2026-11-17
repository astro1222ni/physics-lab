/*
 * comments.js — Google 登入與實驗留言區
 *
 * 每頁：右上角（齒輪旁）的登入按鈕。
 * 模組頁（有 <script data-module="…">）：頁尾前的留言區。
 *
 * 隱私設計：留言只顯示使用者自訂的暱稱，不顯示 Google 姓名、大頭照或電子郵件。
 * 安全設計：權限由 firebase/database.rules.json 把關（只能刪自己的留言、管理員可刪任何留言、
 *           20 秒內不能連續留言、長度上限 500 字、被 3 人以上檢舉的留言自動隱藏）。
 *
 * Firebase 設定來自 js/firebase-config.js；apiKey 留空時整個功能停用。
 * 測試時可設定 window.LAB_COMMENTS_BACKEND 換成假的後端（介面同 firebaseBackend）。
 */
(function () {
  'use strict';

  const cfg = window.LAB_FIREBASE || {};
  if (!window.LAB_COMMENTS_BACKEND && !(cfg.apiKey && cfg.authDomain && cfg.databaseURL && cfg.appId)) return;

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const MAX_LEN = 500;
  const NICK_MAX = 20;
  const HIDE_AFTER_REPORTS = 3;
  const EN = window.LabSettings && window.LabSettings.lang === 'en';
  const t = function (zh, en) { return EN ? en : zh; };

  const modScript = document.querySelector('script[data-module]');
  const moduleId = modScript ? modScript.getAttribute('data-module') : null;
  const accountScript = document.currentScript && document.currentScript.src;
  let accountTreasureP = null;
  function saveProfileNickname(uid, name) {
    if (window.LabMission) return window.LabMission._ready().then(function (backend) { return backend.setNickname(uid, name); });
    // 首頁及一般說明頁不一定有任務系統；改暱稱時才載入共用的寶物計算。
    if (!accountTreasureP) accountTreasureP = window.LabDailyCore ? Promise.resolve() : new Promise(function (resolve, reject) {
      const script = document.createElement('script'); script.src = accountScript.replace(/comments\.js/, 'daily-core.js');
      script.onload = resolve; script.onerror = function () { accountTreasureP = null; reject(new Error('寶物資料載入失敗')); }; document.body.appendChild(script);
    });
    return accountTreasureP.then(function () { return window.LabDailyCore.updateTreasureProfile(api, uid, { nickname: name }); });
  }

  // ======================= Firebase 後端 =======================
  function firebaseBackend() {
    return Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-database.js')
    ]).then(function (m) {
      const A = m[0], Au = m[1], D = m[2];
      const app = A.getApps().length ? A.getApp() : A.initializeApp(cfg); // 任務系統可能已先初始化
      const auth = Au.getAuth(app);
      const db = D.getDatabase(app);
      const provider = new Au.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      Au.getRedirectResult(auth).catch(function () { try { sessionStorage.removeItem('labAfterLogin'); } catch (e) {} });
      const r = function (p) { return D.ref(db, p); };
      // 免費方案同時連線上限 100：分頁切到背景 3 分鐘就斷開即時連線，回到前景再接上（只在已經連過線時才處理，避免替沒用到資料庫的訪客開連線）
      let live = false, off = false, offTimer = null;
      document.addEventListener('visibilitychange', function () {
        if (!live) return;
        if (document.hidden) {
          clearTimeout(offTimer);
          offTimer = setTimeout(function () { off = true; D.goOffline(db); }, 180000);
        } else {
          clearTimeout(offTimer);
          if (off) { off = false; D.goOnline(db); }
        }
      });

      return {
        onAuth: function (cb) { Au.onAuthStateChanged(auth, function (u) { cb(u ? { uid: u.uid } : null); }); },
        signIn: function () {
          if (window.LabInApp && LabInApp.escape()) return new Promise(function () {}); // App 內建瀏覽器：改用手機瀏覽器開（settings.js）
          return Au.signInWithPopup(auth, provider).catch(function (e) {
            if (e && /popup-blocked|operation-not-supported|web-storage-unsupported/.test(e.code || '')) {
              return Au.signInWithRedirect(auth, provider);
            }
            throw e;
          });
        },
        signOut: function () { return Au.signOut(auth); },
        getNickname: function (uid) { return D.get(r('profiles/' + uid + '/nickname')).then(function (s) { return s.val(); }); },
        setNickname: function (uid, n) { return D.set(r('profiles/' + uid + '/nickname'), n); },
        get: function (path) { return D.get(r(path)).then(function (s) { return s.val(); }); },
        update: function (map) { return D.update(D.ref(db), map); },
        now: function () { return D.serverTimestamp(); },
        isAdmin: function (uid) { return D.get(r('admins/' + uid)).then(function (s) { return s.val() === true; }).catch(function () { return false; }); },
        homeRead: function (path) { return D.get(r(path)).then(function (s) { return s.val(); }); },
        watchComments: function (mod, cb) {
          live = true;
          D.onValue(D.query(r('comments/' + mod), D.orderByChild('createdAt'), D.limitToLast(100)), function (snap) {
            const list = [];
            snap.forEach(function (c) { list.push(Object.assign({ id: c.key }, c.val())); });
            cb(list);
          }, function (err) { cb(null, err); });
        },
        watchReports: function (mod, cb) {
          D.onValue(r('reports/' + mod), function (s) { cb(s.val() || {}); }, function () { cb({}); });
        },
        post: function (mod, uid, nickname, text) {
          const key = D.push(r('comments/' + mod)).key;
          const u = {};
          u['comments/' + mod + '/' + key] = { uid: uid, nickname: nickname, text: text, createdAt: D.serverTimestamp() };
          u['rateLimit/' + uid] = D.serverTimestamp();
          return D.update(D.ref(db), u); // 根節點：ref(db) 不能寫成 ref(db, '')
        },
        remove: function (mod, id) { return D.remove(r('comments/' + mod + '/' + id)); },
        report: function (mod, id, uid) { return D.set(r('reports/' + mod + '/' + id + '/' + uid), true); }
      };
    });
  }

  // ======================= 小工具 =======================
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(text, cls, onClick) {
    const b = el('button', cls, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function timeAgo(ms) {
    if (typeof ms !== 'number') return '';
    const s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return t('剛剛', 'just now');
    if (s < 3600) return Math.floor(s / 60) + t(' 分鐘前', ' min ago');
    if (s < 86400) return Math.floor(s / 3600) + t(' 小時前', ' h ago');
    if (s < 86400 * 7) return Math.floor(s / 86400) + t(' 天前', ' days ago');
    const d = new Date(ms);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }
  function errText(e) {
    const c = (e && (e.code || e.message)) || '';
    if (/PERMISSION_DENIED|permission/i.test(c)) return t('送出失敗：留言太頻繁（請隔 20 秒），或內容不符合規定。', 'Could not post: please wait 20 seconds between comments, or check the content.');
    if (/popup-closed|cancelled-popup/.test(c)) return t('已取消登入。', 'Sign-in cancelled.');
    if (/unauthorized-domain/.test(c)) return t('這個網址尚未獲准使用登入，請聯絡網站管理者。', 'Sign-in is not enabled for this address yet.');
    if (/timeout/.test(c)) return t('伺服器沒有回應，請檢查網路後再試一次。', 'The server did not respond — check your connection and try again.');
    if (/network/i.test(c)) return t('網路連線有問題，請稍後再試。', 'Network problem — please try again.');
    return t('發生錯誤，請稍後再試。', 'Something went wrong — please try again.');
  }
  const G_ICON = '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>';

  // ======================= 狀態 =======================
  const state = { user: null, nickname: null, admin: false, comments: null, reports: {}, ready: false, busy: false, msg: '' };
  let hookedProfile = false; // 任務系統的暱稱變動只掛一次
  let api = null;
  const listeners = [];
  function changed() {
    listeners.forEach(function (f) { f(); });
    if (document.body && document.body.hasAttribute('data-home-v2')) window.dispatchEvent(new CustomEvent('lab:account', { detail: { user: state.user, admin: state.admin, ready: state.ready } }));
  }
  // 首頁沿用同一個登入連線，四個個人節點各讀一次；不載入任務引擎或排行榜。
  const homeReads = {};
  function readHome(uid) {
    if (!homeReads[uid]) {
      const backend = window.LAB_MISSIONS_BACKEND;
      const get = p => backend ? backend.get(p) : api.homeRead(p);
      homeReads[uid] = Promise.all(['profiles', 'scores', 'daily', 'completions', 'bag'].map(p => get(p + '/' + uid))).then(r => ({ profile: r[0] || {}, score: r[1] || {}, daily: r[2] || {}, done: r[3] || {}, bag: r[4] || {} }));
    }
    return homeReads[uid];
  }
  window.LabAccount = { state: function () { return { user: state.user, admin: state.admin, ready: state.ready }; }, readHome: readHome, googleIcon: function () { return G_ICON; }, signIn: function () { if (api) return signIn(); } };

  // 把可能同步丟出錯誤的呼叫包成 Promise，並加上逾時，避免畫面卡住
  function guard(fn, ms) {
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () { reject({ code: 'timeout' }); }, ms || 15000);
      Promise.resolve().then(fn).then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function signIn() {
    state.msg = '';
    return api.signIn().catch(function (e) { try { sessionStorage.removeItem('labAfterLogin'); } catch (_) {} state.msg = errText(e); changed(); });
  }

  function afterLogin() {
    let destination; try { destination = sessionStorage.getItem('labAfterLogin'); sessionStorage.removeItem('labAfterLogin'); } catch (e) { return false; }
    if (destination !== 'leaderboard' && destination !== 'daily') return false;
    location.assign(destination + '.html'); return true;
  }

  // ======================= 右上角登入按鈕 =======================
  function buildAccount() {
    const wrap = document.querySelector('.wrap') || document.body;
    const btn = button('', 'lab-account');
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    const menu = el('div', 'lab-account-menu');
    menu.hidden = true;
    wrap.appendChild(btn);
    wrap.appendChild(menu);
    document.documentElement.classList.add('has-account');
    // 頁首第一行（麵包屑或站名）右側留出登入鈕＋齒輪實際佔的寬度（隨語言、字級、登入狀態改變），標題才不會被按鈕蓋住
    function reserve() {
      if (btn.hidden || !btn.offsetParent) return;
      const room = wrap.getBoundingClientRect().right - 16 - btn.getBoundingClientRect().left + 10;
      if (room > 0) document.documentElement.style.setProperty('--head-reserve', Math.ceil(room) + 'px');
    }
    if ('ResizeObserver' in window) new ResizeObserver(reserve).observe(btn);
    window.addEventListener('resize', reserve);
    setTimeout(reserve, 0);

    function close() { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
    btn.addEventListener('click', function () {
      if (!state.ready) return;
      if (!state.user) { signIn(); return; }
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('pointerdown', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); } });

    function render() {
      btn.innerHTML = '';
      if (!state.ready) { btn.hidden = true; return; }
      btn.hidden = false;
      if (!state.user) {
        btn.innerHTML = G_ICON;
        btn.appendChild(el('span', null, t('登入', 'Sign in')));
        btn.setAttribute('aria-label', t('用 Google 帳號登入', 'Sign in with Google'));
        close();
        return;
      }
      const name = state.nickname || t('已登入', 'Signed in');
      btn.appendChild(el('span', 'lab-account-avatar', (state.nickname || '我').slice(0, 1)));
      btn.appendChild(el('span', 'lab-account-name', name));
      btn.setAttribute('aria-label', t('帳號選單：', 'Account: ') + name);
      menu.innerHTML = '';
      menu.appendChild(el('p', 'lab-account-who', state.nickname ? t('暱稱：', 'Nickname: ') + state.nickname : t('尚未設定暱稱', 'No nickname yet')));
      if (state.admin) menu.appendChild(el('p', 'lab-account-admin', t('管理員', 'Administrator')));
      const lb = document.createElement('a');
      lb.className = 'lab-account-link';
      lb.href = 'leaderboard.html';
      lb.textContent = t('★ 我的星星與成就', '★ My stars & achievements');
      menu.appendChild(lb);
      if (state.admin) { // 管理員：使用者與紀錄（admin.html，11/14）
        const ad = document.createElement('a');
        ad.className = 'lab-account-link';
        ad.href = 'admin.html';
        ad.textContent = t('管理頁：使用者與紀錄', 'Admin: users and records');
        menu.appendChild(ad);
      }
      menu.appendChild(button(t('設定暱稱', 'Change nickname'), null, function () { close(); askNickname(); }));
      menu.appendChild(button(t('登出', 'Sign out'), null, function () { close(); api.signOut(); }));
    }
    listeners.push(render);
    render();
  }

  function askNickname() {
    const sec = document.getElementById('comments');
    if (sec) {
      state.editingNick = true;
      changed();
      sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const n = window.prompt(t('請輸入暱稱（1–20 字）：', 'Choose a nickname (1–20 characters):'), state.nickname || '');
      if (n != null) saveNickname(n);
    }
  }
  function cleanNick(n) { return String(n || '').replace(/\s+/g, ' ').trim().slice(0, NICK_MAX); }
  function saveNickname(n) {
    n = cleanNick(n);
    if (!n) return Promise.resolve();
    return guard(function () { return saveProfileNickname(state.user.uid, n); }).then(function () {
      state.nickname = n;
      state.editingNick = false;
      state.msg = '';
      changed();
    }).catch(function (e) { state.msg = errText(e); changed(); });
  }

  // ======================= 留言區 =======================
  function buildComments() {
    const sec = el('section', 'comments');
    sec.id = 'comments';
    const h = el('h2');
    const title = el('span', null, t('留言區', 'Comments'));
    const count = el('span', 'c-count');
    h.appendChild(title);
    h.appendChild(count);
    const note = el('p', 'c-note');
    note.appendChild(document.createTextNode(t('留言會公開顯示你的暱稱與內容，請勿留下電話、地址、學校等個人資料，並尊重他人。',
      'Your nickname and comment are public. Please do not share personal details such as phone numbers or addresses, and be kind.')));
    const pl = el('a', null, t('隱私說明', 'Privacy'));
    pl.href = 'privacy.html';
    note.appendChild(document.createTextNode(' '));
    note.appendChild(pl);
    const compose = el('div', 'c-compose');
    const msg = el('p', 'c-msg');
    msg.setAttribute('aria-live', 'polite');
    const list = el('ol', 'c-list');
    sec.appendChild(h);
    sec.appendChild(note);
    sec.appendChild(compose);
    sec.appendChild(msg);
    sec.appendChild(list);

    const anchor = document.querySelector('footer.site');
    if (anchor) anchor.insertAdjacentElement('beforebegin', sec);
    else (document.querySelector('.wrap') || document.body).appendChild(sec);

    let draft = '';
    let lastComposeKey = '';
    // 給「留言與 bug 回報」側板用：把文字放進留言框、捲過去並聚焦（未登入時先存成草稿，登入後出現在框裡）
    window.LabComments = {
      compose: function (text) {
        if (typeof text === 'string') draft = text;
        const ta = sec.querySelector('.c-form textarea');
        if (ta && typeof text === 'string') { ta.value = text; ta.dispatchEvent(new Event('input')); }
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // 上方的縮圖、相關實驗會在捲動途中長高，平滑捲動停早了就再對齊一次
        [700, 1400].forEach(function (ms) {
          setTimeout(function () { const top = sec.getBoundingClientRect().top; if (top > 120 || top < -40) sec.scrollIntoView({ block: 'start' }); }, ms);
        });
        setTimeout(function () {
          const t2 = sec.querySelector('.c-form textarea') || sec.querySelector('.c-compose button, .c-compose input');
          if (t2) {
            t2.focus({ preventScroll: true });
            if (t2.setSelectionRange && typeof text === 'string') { const i = t2.value.indexOf('\n') > 0 ? t2.value.indexOf('\n', t2.value.indexOf('\n') + 1) : t2.value.length; t2.setSelectionRange(i, i); }
          }
        }, 450);
      },
      count: function () { return state.comments ? state.comments.length : null; }
    };
    buildFeedbackTab();

    function renderCompose() {
      const key = [state.ready, !!state.user, state.nickname, state.editingNick, state.busy].join('|');
      if (key === lastComposeKey) return; // 避免重畫時清掉正在輸入的文字
      lastComposeKey = key;
      compose.innerHTML = '';
      if (!state.ready) { compose.appendChild(el('p', 'c-hint', t('載入中…', 'Loading…'))); return; }
      if (!state.user) {
        compose.appendChild(el('p', 'c-hint', t('登入 Google 帳號後就可以留言。只會顯示你自己取的暱稱。', 'Sign in with Google to comment. Only the nickname you choose is shown.')));
        const b = button('', 'c-google', signIn);
        b.innerHTML = G_ICON;
        b.appendChild(el('span', null, t('用 Google 帳號登入', 'Sign in with Google')));
        compose.appendChild(b);
        return;
      }
      if (!state.nickname || state.editingNick) {
        const f = el('form', 'c-nick');
        const lab = el('label', null, t('請取一個暱稱（1–20 字），留言時會顯示這個名字，不會顯示你的 Google 姓名。',
          'Choose a nickname (1–20 characters). It is shown with your comments instead of your Google name.'));
        lab.htmlFor = 'c-nick-input';
        const inp = el('input');
        inp.id = 'c-nick-input';
        inp.maxLength = NICK_MAX;
        inp.value = state.nickname || '';
        inp.autocomplete = 'nickname';
        const row = el('div', 'c-row');
        row.appendChild(inp);
        row.appendChild(button(t('儲存暱稱', 'Save'), 'primary', function () { saveNickname(inp.value); }));
        if (state.nickname) row.appendChild(button(t('取消', 'Cancel'), null, function () { state.editingNick = false; changed(); }));
        f.appendChild(lab);
        f.appendChild(row);
        f.addEventListener('submit', function (e) { e.preventDefault(); saveNickname(inp.value); });
        compose.appendChild(f);
        return;
      }
      const f = el('form', 'c-form');
      const who = el('p', 'c-who');
      who.appendChild(document.createTextNode(t('以「', 'Commenting as “')));
      who.appendChild(el('strong', null, state.nickname));
      who.appendChild(document.createTextNode(t('」的身分留言 ', '” ')));
      who.appendChild(button(t('修改暱稱', 'change'), 'c-link', function () { state.editingNick = true; changed(); }));
      const ta = el('textarea');
      ta.maxLength = MAX_LEN;
      ta.rows = 3;
      ta.value = draft;
      ta.placeholder = t('分享你的觀察、問題或想法…', 'Share an observation, a question or an idea…');
      ta.setAttribute('aria-label', t('留言內容', 'Comment'));
      const counter = el('span', 'c-counter');
      const upd = function () { draft = ta.value; counter.textContent = ta.value.length + ' / ' + MAX_LEN; };
      ta.addEventListener('input', upd);
      upd();
      const row = el('div', 'c-row c-row-end');
      row.appendChild(counter);
      const send = button(state.busy ? t('送出中…', 'Posting…') : t('送出留言', 'Post'), 'primary');
      send.type = 'submit';
      send.disabled = state.busy;
      row.appendChild(send);
      f.appendChild(who);
      f.appendChild(ta);
      f.appendChild(row);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        const text = ta.value.replace(/\s+$/, '').replace(/^\s+/, '');
        if (!text || state.busy) return;
        state.busy = true;
        state.msg = '';
        changed();
        guard(function () { return api.post(moduleId, state.user.uid, state.nickname, text); }).then(function () {
          try { window.dispatchEvent(new Event('lab:commented')); } catch (e) { /* 成就系統用 */ }
          draft = '';
          state.busy = false;
          lastComposeKey = '';
          changed();
        }).catch(function (err) {
          state.busy = false;
          state.msg = errText(err);
          changed();
        });
      });
      compose.appendChild(f);
    }

    function renderList() {
      list.innerHTML = '';
      if (state.comments === null) { count.textContent = ''; return; }
      const items = state.comments.slice().reverse(); // 新的在上
      count.textContent = '（' + items.length + '）';
      if (EN) count.textContent = ' (' + items.length + ')';
      if (!items.length) {
        list.appendChild(el('li', 'c-empty', t('還沒有留言，來當第一個吧！', 'No comments yet — be the first!')));
        return;
      }
      const me = state.user && state.user.uid;
      items.forEach(function (c) {
        const reps = state.reports[c.id] || {};
        const nRep = Object.keys(reps).length;
        const hidden = nRep >= HIDE_AFTER_REPORTS;
        const li = el('li', 'c-item' + (c.uid === me ? ' mine' : '') + (hidden ? ' flagged' : ''));
        const head = el('div', 'c-head');
        head.appendChild(el('strong', 'c-name', String(c.nickname || '?')));
        const time = el('time', 'c-time', timeAgo(c.createdAt));
        if (typeof c.createdAt === 'number') time.dateTime = new Date(c.createdAt).toISOString();
        head.appendChild(time);
        if (state.admin && nRep) head.appendChild(el('span', 'c-flag', t('被檢舉 ', 'reported ') + nRep + t(' 次', '×')));
        li.appendChild(head);
        if (hidden && !state.admin && c.uid !== me) {
          li.appendChild(el('p', 'c-hidden', t('這則留言被多人檢舉，已暫時隱藏，等待管理員確認。', 'This comment was reported by several people and is hidden until a moderator reviews it.')));
        } else {
          li.appendChild(el('p', 'c-text', String(c.text || '')));
        }
        const acts = el('div', 'c-acts');
        if (me && (c.uid === me || state.admin)) {
          acts.appendChild(button(t('刪除', 'Delete'), 'c-link', function () {
            if (!window.confirm(t('確定要刪除這則留言嗎？', 'Delete this comment?'))) return;
            guard(function () { return api.remove(moduleId, c.id); }).catch(function (e) { state.msg = errText(e); changed(); });
          }));
        }
        if (me && c.uid !== me) {
          if (reps[me]) acts.appendChild(el('span', 'c-done', t('已檢舉', 'Reported')));
          else acts.appendChild(button(t('檢舉', 'Report'), 'c-link', function () {
            if (!window.confirm(t('這則留言不當嗎？檢舉後，若有多人檢舉會自動隱藏。', 'Report this comment as inappropriate? It is hidden automatically after several reports.'))) return;
            guard(function () { return api.report(moduleId, c.id, me); }).catch(function (e) { state.msg = errText(e); changed(); });
          }));
        }
        if (acts.childNodes.length) li.appendChild(acts);
        list.appendChild(li);
      });
    }

    listeners.push(function () {
      renderCompose();
      msg.textContent = state.msg;
      renderList();
    });
    changed();
    setInterval(renderList, 60000); // 更新「幾分鐘前」
  }

  // ======================= 首次進站：鼓勵登入（可以「先逛逛」跳過） =======================
  // 每個瀏覽器只出現一次；已登入、排行榜頁、隱私說明頁不出現。登入只是為了任務、星星、成就與留言，操作實驗不需要登入。
  const WELCOME_KEY = 'lab-welcome-v1';
  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  let welcome = null;
  // ======================= 留言與 bug 回報側板（站長 11/16） =======================
  // 站長原話：「每一個實驗都增加一個側板︰留言與 bug 回報。直接導入連到該實驗室的留言區」
  // 11/16 先在等位線試，同日站長要求直接全站開啟（FEEDBACK_ALL = true）；要暫時只開部分實驗就改回 false、填 FEEDBACK_PILOT。
  const FEEDBACK_ALL = true;
  const FEEDBACK_PILOT = ['equipotential'];
  function deviceLine() {
    const ua = navigator.userAgent || '';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : t('其他', 'other');
    const os = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iOS/iPadOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
    const root = document.documentElement;
    const th = root.getAttribute('data-theme');
    const dark = th === 'dark' || (!th && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    return window.innerWidth + '×' + window.innerHeight + '・' + (dark ? t('深色', 'dark') : t('淺色', 'light')) + '・' + (root.lang || '') + '・' + br + (os ? '・' + os : '');
  }
  function buildFeedbackTab() {
    if (!moduleId || !(FEEDBACK_ALL || FEEDBACK_PILOT.indexOf(moduleId) >= 0)) return;
    if (document.querySelector('.fb-tab')) return;
    const tab = el('button', 'fb-tab');
    tab.type = 'button';
    tab.setAttribute('aria-haspopup', 'dialog');
    tab.setAttribute('aria-expanded', 'false');
    tab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>';
    tab.appendChild(el('span', null, t('留言・回報', 'Feedback')));
    tab.setAttribute('aria-label', t('留言與 bug 回報', 'Comments and bug reports'));
    const panel = el('aside', 'fb-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('留言與 bug 回報', 'Comments and bug reports'));
    panel.hidden = true;
    const head = el('div', 'fb-head');
    head.appendChild(el('h2', null, t('留言與 bug 回報', 'Comments & bug reports')));
    head.appendChild(button(t('關閉', 'Close'), 'fb-close', function () { toggle(false); }));
    const intro = el('p', 'fb-intro', t('想分享觀察、問問題，或發現畫面怪怪的、數字不對、按了沒反應，都可以在這個實驗的留言區告訴倪老師。',
      'Share an observation, ask a question, or tell Mr. Ni if something looks wrong, a number seems off or a button does nothing, right in this lab’s comments.'));
    const count = el('p', 'fb-count');
    const goC = button(t('💬 到本實驗的留言區留言', '💬 Go to this lab’s comments'), 'primary fb-big', function () {
      toggle(false); if (window.LabComments) LabComments.compose();
    });
    const goB = button(t('🐞 回報 bug（幫你填好格式）', '🐞 Report a bug (template filled in)'), 'fb-big', function () {
      toggle(false);
      const tpl = t('【Bug 回報】\n哪一步、按了什麼：\n看到什麼：\n應該是：\n（裝置：', '[Bug report]\nWhat I did: \nWhat I saw: \nWhat I expected: \n(Device: ') + deviceLine() + t('）', ')');
      if (window.LabComments) LabComments.compose(tpl);
    });
    const note = el('p', 'fb-note', t('留言要先用 Google 登入，只會公開你的暱稱。請不要寫姓名、學校、電話等個人資料。寫清楚「在第幾步、選了什麼」，倪老師比較好找到問題。',
      'Posting needs a Google sign-in; only your nickname is shown. Please do not include your name, school or phone number. Saying which step and settings you used helps a lot.'));
    [head, intro, count, goC, goB, note].forEach(function (n) { panel.appendChild(n); });
    document.body.appendChild(tab);
    document.body.appendChild(panel);
    let last = null;
    function toggle(on) {
      panel.hidden = !on;
      tab.setAttribute('aria-expanded', String(on));
      document.documentElement.classList.toggle('fb-open', on);
      if (on) {
        last = document.activeElement;
        const n = window.LabComments ? LabComments.count() : null;
        count.textContent = n == null ? '' : n ? t('這個實驗目前有 ' + n + ' 則留言。', 'This lab has ' + n + ' comment' + (n === 1 ? '' : 's') + '.') : t('還沒有人留言，歡迎當第一個！', 'No comments yet. Be the first!');
        goC.focus();
      } else if (last && last.focus && document.contains(last)) last.focus({ preventScroll: true });
    }
    tab.addEventListener('click', function () { toggle(panel.hidden); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) toggle(false); });
    document.addEventListener('pointerdown', function (e) { if (!panel.hidden && !panel.contains(e.target) && !tab.contains(e.target)) toggle(false); });
  }

  function welcomeSeen() { try { return !!localStorage.getItem(WELCOME_KEY); } catch (e) { return true; } }
  function welcomeMark(v) { try { localStorage.setItem(WELCOME_KEY, v); } catch (e) { /* 無法記錄時照樣關閉 */ } }
  // 實驗頁先讓學生玩一下：操作 3 次，或頁面在前景停留 40 秒，才跳登入提示（站長 11/12 同意）；首頁照舊
  let engaged = !moduleId, engageCbs = null;
  function whenEngaged(cb) {
    if (engaged) { cb(); return; }
    if (engageCbs) { engageCbs.push(cb); return; }
    engageCbs = [cb];
    let ops = 0, secs = 0, timer = null;
    const done = function (wait) {
      if (engaged) return;
      engaged = true;
      clearInterval(timer);
      document.removeEventListener('change', onChange, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', onDown, true);
      const cbs = engageCbs; engageCbs = null;
      setTimeout(function () { cbs.forEach(function (f) { f(); }); }, wait); // 第 3 次操作後稍等，不打斷正在拖曳的手
    };
    const count = function () { if (++ops >= 3) done(1500); };
    // 只算真的手動操作（頁面程式自己送出的 change／click 不算）
    const onChange = function (e) { if (e.isTrusted && e.target.matches && e.target.matches('input, select, textarea')) count(); };
    const onClick = function (e) { if (e.isTrusted && e.target.closest && e.target.closest('.lab button, .lab [role="button"]')) count(); };
    const onDown = function (e) { if (e.isTrusted && e.target.closest && e.target.closest('canvas, svg, .stage') && !e.target.closest('button, [role="button"]')) count(); }; // 按鈕裡的圖示由 click 算
    document.addEventListener('change', onChange, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onDown, true);
    timer = setInterval(function () { if (document.visibilityState === 'visible' && ++secs >= 40) done(0); }, 1000);
  }
  function maybeWelcome() {
    if (welcome || state.user || welcomeSeen()) return;
    if (document.documentElement.classList.contains('lab-embed')) return; // 嵌入在別的網頁裡：不跳登入提示
    if (/(?:privacy|leaderboard)\.html$/.test(location.pathname)) return;
    const back = el('div', 'lab-welcome');
    const box = el('div', 'lab-welcome-box');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'lab-welcome-title');
    const badge = el('div', 'lab-welcome-star');
    badge.innerHTML = STAR_SVG;
    box.appendChild(badge);
    const h = el('h2', null, t('登入，開始收集倪的星星！', 'Sign in and start collecting Ni stars!'));
    h.id = 'lab-welcome-title';
    box.appendChild(h);
    box.appendChild(el('p', 'lab-welcome-lead', t('每個實驗都有「任務模式」：動手操作實驗、達成指定的目標，就能獲得「倪的星星」。',
      'Every experiment has a “Mission mode”: work the simulation to reach a goal and you earn Ni stars.')));
    const ul = el('ul', 'lab-welcome-list');
    [[t('任務分 10 級，越難星星越多（1～10 顆）', 'Missions have 10 levels — harder ones earn more stars (1 to 10)')],
     [t('累積星星登上排行榜前 100 名', 'Collect stars and climb into the top 100')],
     [t('還有公開與隱藏的成就等你解鎖', 'Unlock public and hidden achievements')]].forEach(function (r) {
      const li = el('li');
      li.innerHTML = STAR_SVG;
      li.appendChild(el('span', null, r[0]));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    const go = button('', 'primary lab-welcome-go', function () {
      msg.textContent = '';
      welcome.signing = true;
      api.signIn().catch(function (e) { welcome && (welcome.signing = false); msg.textContent = errText(e); });
    });
    go.innerHTML = G_ICON;
    go.appendChild(el('span', null, t('用 Google 帳號登入', 'Sign in with Google')));
    const skip = button(t('先逛逛', 'Just look around'), 'lab-welcome-skip', function () { closeWelcome('skip'); });
    const acts = el('div', 'lab-welcome-actions');
    acts.appendChild(go);
    acts.appendChild(skip);
    box.appendChild(acts);
    const msg = el('p', 'lab-welcome-msg');
    msg.setAttribute('role', 'alert');
    box.appendChild(msg);
    const fine = el('p', 'lab-welcome-fine', t('不登入也可以操作所有實驗；之後隨時可以按右上角的「登入」。網站只顯示你自訂的暱稱，不會顯示 Google 姓名、大頭照或電子郵件。',
      'You can use every experiment without signing in, and sign in later from the top-right corner. Only the nickname you choose is ever shown — never your Google name, photo or email. '));
    const pv = document.createElement('a');
    pv.href = 'privacy.html';
    pv.textContent = t('隱私說明', 'Privacy');
    fine.appendChild(pv);
    box.appendChild(fine);
    back.appendChild(box);
    back.addEventListener('pointerdown', function (e) { if (e.target === back) closeWelcome('skip'); });
    back.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeWelcome('skip'); return; }
      if (e.key !== 'Tab') return;
      const f = [].slice.call(box.querySelectorAll('button, a[href]'));
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    });
    welcome = { el: back, prev: document.activeElement, signing: false };
    document.body.appendChild(back);
    go.focus({ preventScroll: true });
  }
  function closeWelcome(how) {
    if (!welcome) return;
    welcomeMark(how);
    const w = welcome;
    welcome = null;
    w.el.classList.add('out');
    setTimeout(function () { w.el.remove(); }, 250);
    if (w.prev && w.prev.focus && document.contains(w.prev)) w.prev.focus({ preventScroll: true });
    // 從提示登入的實驗頁：直接打開任務模式
    if (how === 'signed' && w.signing) {
      const tg = document.querySelector('.ms-toggle');
      if (tg && !tg.classList.contains('on')) { tg.click(); tg.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  }

  // 捲到留言區附近才開始即時讀取留言（每個即時監聽都佔一條連線；免費方案同時連線上限 100，全班同時上課時要省著用）
  function watchWhenNear() {
    let started = false;
    const go = function () {
      if (started) return;
      started = true;
      api.watchComments(moduleId, function (list) { state.comments = list || []; changed(); });
      api.watchReports(moduleId, function (reps) { state.reports = reps || {}; changed(); });
    };
    const sec = document.getElementById('comments');
    if (!sec || !('IntersectionObserver' in window) || location.hash === '#comments') { go(); return; }
    const io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); go(); }
    }, { rootMargin: '600px 0px' });
    io.observe(sec);
  }

  // ======================= 啟動 =======================
  function start() {
    buildAccount();
    if (moduleId) buildComments();
    const ready = window.LAB_COMMENTS_BACKEND ? Promise.resolve(window.LAB_COMMENTS_BACKEND) : firebaseBackend();
    ready.then(function (backend) {
      api = backend;
      api.onAuth(function (user) {
        try { localStorage.setItem('labHomeSignedIn', user ? '1' : '0'); } catch (e) {}
        if (user && afterLogin()) return;
        state.user = user;
        state.nickname = null;
        state.admin = false;
        state.editingNick = false;
        state.ready = true;
        changed();
        if (user) closeWelcome('signed');
        else setTimeout(function () { whenEngaged(maybeWelcome); }, 600); // 讓頁面先出現；實驗頁等學生先操作幾下再提示
        if (user) {
          const nick = document.body.hasAttribute('data-home-v2') ? readHome(user.uid).then(function (d) { return d.profile.nickname; }) : api.getNickname(user.uid);
          Promise.all([nick.catch(function () { return null; }), api.isAdmin(user.uid)]).then(function (r) {
            if (!state.user || state.user.uid !== user.uid) return;
            const ms = window.LabMission && window.LabMission._state; // 任務系統可能剛自動取好暱稱（11/17）
            state.nickname = r[0] || (ms && ms.user && ms.user.uid === user.uid && ms.nickname) || null;
            state.admin = !!r[1];
            changed();
          });
          // 任務系統自動取暱稱或改暱稱後，帳號選單跟著換
          if (window.LabMission && !hookedProfile) {
            hookedProfile = true;
            window.LabMission.on('profile', function (ms) {
              if (state.user && ms && ms.user && ms.user.uid === state.user.uid && ms.nickname && ms.nickname !== state.nickname) { state.nickname = ms.nickname; changed(); }
            });
          }
        }
      });
      if (moduleId) watchWhenNear();
    }).catch(function () {
      state.ready = false;
      state.msg = t('留言功能暫時無法載入。', 'Comments could not be loaded right now.');
      changed();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
