/*
 * missions.js — 任務模式與「倪的星星」
 *
 * 模組頁面：
 *   1. 載入本檔與該模組的任務檔 js/missions/<模組>.js（任務檔呼叫 LabMission.register）。
 *   2. 模組程式在關鍵時刻回報事件：LabMission.emit('landed', { …物理量… })。
 * 任務定義：
 *   { id: 'projectile-1', level: 1–10, title: {zh, en}, desc: {zh, en}, check: function (ev, mem) → true/false }
 *   隱藏任務：{ id, level, hidden: true, riddle: {zh, en}, check }（只顯示隱晦提示，完成時也不說明原因）
 *   check(ev, mem)：ev = { type, data }；mem 為該任務在本頁的暫存物件（可記錄先前的事件）。
 * 規則：必須登入 Google 帳號、開啟任務模式才會判定；每個任務只能領一次星星（資料庫規則把關）。
 * 星星數 = 任務等級（1–10 顆「倪的星星」）。
 */
(function () {
  'use strict';

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const L = function (o) { return o ? T(o.zh, o.en || o.zh) : ''; };
  const EN = window.LabSettings && window.LabSettings.lang === 'en';

  const script = document.currentScript;
  const pageModule = script && script.getAttribute('data-module'); // 模組頁面才有；排行榜頁沒有
  const registry = {}; // moduleId → [mission]
  const hooks = { complete: [], ready: [] };
  function fire(name, arg) { hooks[name].forEach(function (f) { try { f(arg); } catch (e) { /* 忽略 */ } }); }
  const listeners = [];
  const state = {
    module: pageModule, user: null, nickname: null, pub: true,
    done: {}, on: false, ready: false, busy: false, msg: ''
  };
  let api = null;

  // ======================= 公開介面 =======================
  const LabMission = {
    register: function (moduleId, missions) {
      const have = {};
      (registry[moduleId] || []).forEach(function (m) { have[m.id] = true; });
      registry[moduleId] = (registry[moduleId] || []).concat(missions.filter(function (m) { return !have[m.id]; }).map(function (m) {
        return Object.assign({ mem: {} }, m);
      })); // 同一任務檔載入兩次也不會重複
      changed();
    },
    emit: function (type, data) {
      if (!state.on || !state.user || !state.nickname) return;
      const list = registry[state.module] || [];
      list.forEach(function (m) {
        if (state.done[m.id] || m.pending) return;
        let ok = false;
        try { ok = !!m.check({ type: type, data: data || {} }, m.mem); } catch (e) { ok = false; }
        if (ok) complete(m);
      });
    },
    all: function () { return registry; },
    on: function (name, fn) { if (hooks[name]) hooks[name].push(fn); },
    module: pageModule,
    mask: mask,
    // 排行榜頁用
    _state: state,
    _ready: function () { return api ? Promise.resolve(api) : (ready || Promise.resolve(null)); }
  };
  window.LabMission = LabMission;

  /** 不公開排名時：保留第一個與最後一個字，中間遮掉 */
  function mask(name) {
    const ch = Array.from(String(name || ''));
    if (ch.length <= 1) return '＊';
    if (ch.length === 2) return ch[0] + '＊';
    return ch[0] + '○'.repeat(Math.min(ch.length - 2, 8)) + ch[ch.length - 1];
  }
  function displayName() { return state.pub ? state.nickname : mask(state.nickname); }

  // ======================= Firebase =======================
  const cfg = window.LAB_FIREBASE || {};
  const enabled = !!(window.LAB_MISSIONS_BACKEND || (cfg.apiKey && cfg.authDomain && cfg.databaseURL && cfg.appId));

  function firebaseBackend() {
    return Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-database.js')
    ]).then(function (m) {
      const A = m[0], Au = m[1], D = m[2];
      const app = A.getApps().length ? A.getApp() : A.initializeApp(cfg);
      const auth = Au.getAuth(app);
      const db = D.getDatabase(app);
      const r = function (p) { return D.ref(db, p); };
      const provider = new Au.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return {
        onAuth: function (cb) { Au.onAuthStateChanged(auth, function (u) { cb(u ? { uid: u.uid } : null); }); },
        signIn: function () {
          return Au.signInWithPopup(auth, provider).catch(function (e) {
            if (e && /popup-blocked|operation-not-supported|web-storage-unsupported/.test(e.code || '')) return Au.signInWithRedirect(auth, provider);
            throw e;
          });
        },
        getProfile: function (uid) { return D.get(r('profiles/' + uid)).then(function (s) { return s.val() || {}; }); },
        setNickname: function (uid, n) { return D.set(r('profiles/' + uid + '/nickname'), n); },
        setPub: function (uid, pub) { return D.set(r('profiles/' + uid + '/pub'), pub); },
        getDone: function (uid) { return D.get(r('completions/' + uid)).then(function (s) { return s.val() || {}; }); },
        getScore: function (uid) { return D.get(r('scores/' + uid)).then(function (s) { return s.val(); }); },
        complete: function (uid, mid, stars, name, pub, prev) {
          const u = {};
          u['completions/' + uid + '/' + mid] = { stars: stars, at: D.serverTimestamp() };
          u['scores/' + uid] = { stars: (prev || 0) + stars, last: mid, name: name, pub: pub, at: D.serverTimestamp() };
          return D.update(D.ref(db), u);
        },
        rename: function (uid, score, name, pub) {
          return D.update(r('scores/' + uid), { name: name, pub: pub, stars: score.stars, last: score.last, at: score.at || 0 });
        },
        top: function (n) {
          return D.get(D.query(r('scores'), D.orderByChild('stars'), D.limitToLast(n))).then(function (s) {
            const list = [];
            s.forEach(function (c) { list.push(Object.assign({ uid: c.key }, c.val())); });
            return list;
          });
        },
        countAbove: function (stars) {
          return D.get(D.query(r('scores'), D.orderByChild('stars'), D.startAt(stars + 1))).then(function (s) { return s.size; });
        },
        syncDefs: function (defs) {
          const u = {};
          Object.keys(defs).forEach(function (id) { u['missionDefs/' + id] = { stars: defs[id] }; });
          return D.update(D.ref(db), u);
        },
        isAdmin: function (uid) { return D.get(r('admins/' + uid)).then(function (s) { return s.val() === true; }).catch(function () { return false; }); },
        // 通用：讀取、多路徑寫入、伺服器端遞增與時間戳（成就系統使用）
        get: function (path) { return D.get(r(path)).then(function (s) { return s.val(); }); },
        update: function (map) { return D.update(D.ref(db), map); },
        inc: function (n) { return D.increment(n); },
        now: function () { return D.serverTimestamp(); }
      };
    });
  }

  function guard(fn, ms) {
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () { reject({ code: 'timeout' }); }, ms || 15000);
      Promise.resolve().then(fn).then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  let ready = null;
  if (enabled) {
    ready = (window.LAB_MISSIONS_BACKEND ? Promise.resolve(window.LAB_MISSIONS_BACKEND) : firebaseBackend()).then(function (b) {
      api = b;
      api.onAuth(function (user) {
        state.user = user;
        state.nickname = null;
        state.done = {};
        state.ready = !user;
        changed();
        if (!user) return;
        Promise.all([api.getProfile(user.uid).catch(function () { return {}; }), api.getDone(user.uid).catch(function () { return {}; })]).then(function (r) {
          if (!state.user || state.user.uid !== user.uid) return;
          state.nickname = r[0].nickname || null;
          state.pub = r[0].pub !== false;
          state.done = r[1] || {};
          state.ready = true;
          changed();
          fire('ready', state);
        });
      });
      return api;
    }).catch(function () { state.msg = T('任務系統暫時無法載入。', 'Missions could not be loaded right now.'); changed(); });
  }

  // ======================= 完成任務 =======================
  // 同時完成多個任務時依序寫入（每次都以最新的總分為基準，資料庫規則才會通過）
  let queue = Promise.resolve();
  function complete(m) {
    if (!api || !state.user) return;
    m.pending = true;
    queue = queue.then(function () { return completeNow(m); }, function () { return completeNow(m); });
  }
  function completeNow(m) {
    const uid = state.user.uid, stars = m.level;
    return guard(function () { return api.getScore(uid); }).then(function (sc) {
      return guard(function () { return api.complete(uid, m.id, stars, displayName(), state.pub, sc ? sc.stars : 0); });
    }).then(function () {
      state.done[m.id] = { stars: stars, at: Date.now() };
      m.pending = false;
      celebrate(m);
      changed();
      fire('complete', m);
    }).catch(function (e) {
      m.pending = false;
      const c = (e && (e.code || e.message)) || '';
      state.msg = /PERMISSION_DENIED|permission/i.test(c)
        ? T('星星沒有記錄成功：這個任務可能已經完成過，或任務清單尚未同步。', 'The stars were not recorded: this mission may already be done, or the mission list is not synced yet.')
        : T('網路連線有問題，星星沒有記錄成功，請再試一次。', 'Network problem — the stars were not recorded. Please try again.');
      changed();
    });
  }

  // ======================= 介面 =======================
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function changed() { listeners.forEach(function (f) { f(); }); }

  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
  function starBadge(n) {
    const b = el('span', 'ms-stars');
    b.innerHTML = STAR;
    b.appendChild(el('span', null, '×' + n));
    b.setAttribute('aria-label', n + T(' 顆倪的星星', ' Ni stars'));
    return b;
  }

  // 慶祝畫面依序顯示：同時完成多個任務時，一個接一個出現，不會疊在一起
  let showUntil = 0;
  function celebrate(m) {
    const now = Date.now(), wait = Math.max(0, showUntil - now);
    showUntil = now + wait + (m.hidden ? 1600 : 2200) + 350;
    setTimeout(function () { showCelebrate(m); }, wait);
  }
  function showCelebrate(m) {
    const ov = el('div', 'ms-celebrate');
    ov.setAttribute('role', 'status');
    const box = el('div', 'ms-celebrate-box');
    const burst = el('div', 'ms-burst');
    for (let i = 0; i < 12; i++) {
      const s = el('span', 'ms-spark');
      s.innerHTML = STAR;
      s.style.setProperty('--a', (i * 30) + 'deg');
      burst.appendChild(s);
    }
    box.appendChild(burst);
    box.appendChild(el('div', 'ms-celebrate-title', m.hidden ? T('隱藏任務完成！', 'Hidden mission complete!') : T('任務完成！', 'Mission complete!')));
    if (!m.hidden) box.appendChild(el('div', 'ms-celebrate-name', L(m.title)));
    const gain = el('div', 'ms-celebrate-gain');
    gain.innerHTML = STAR;
    gain.appendChild(el('span', null, '+' + m.level + T(' 顆倪的星星', ' Ni stars')));
    box.appendChild(gain);
    ov.appendChild(box);
    document.body.appendChild(ov);
    const S = window.LabSound;
    if (S && S.enabled()) {
      [784, 988, 1175, 1568].forEach(function (f, i) { S.tone({ freq: f, dur: 0.16, gain: 0.45, delay: i * 0.09, type: 'triangle' }); });
    }
    const close = function () { ov.classList.add('out'); setTimeout(function () { ov.remove(); }, 300); };
    ov.addEventListener('click', close);
    setTimeout(close, m.hidden ? 1600 : 2200);
  }

  function buildPanel() {
    const list = registry[state.module];
    if (!list || !list.length) return;
    const wrap = el('section', 'ms-wrap');
    const bar = el('div', 'ms-bar');
    const toggle = el('button', 'ms-toggle');
    toggle.type = 'button';
    toggle.innerHTML = STAR;
    const tLabel = el('span', null, T('任務模式', 'Mission mode'));
    toggle.appendChild(tLabel);
    toggle.setAttribute('aria-expanded', 'false');
    const summary = el('span', 'ms-summary');
    const board = el('a', 'ms-board-link', T('倪的星星排行榜', 'Ni Stars leaderboard'));
    board.href = 'leaderboard.html';
    bar.appendChild(toggle);
    bar.appendChild(summary);
    bar.appendChild(board);
    const panel = el('div', 'ms-panel');
    panel.hidden = true;
    wrap.appendChild(bar);
    wrap.appendChild(panel);

    const anchor = document.querySelector('.stats-bar') || document.querySelector('header.top');
    if (anchor) anchor.insertAdjacentElement('afterend', wrap);
    else (document.querySelector('.wrap') || document.body).prepend(wrap);

    toggle.addEventListener('click', function () {
      state.on = !state.on;
      try { sessionStorage.setItem('ms-on:' + state.module, state.on ? '1' : ''); } catch (e) { /* 忽略 */ }
      if (state.on) list.forEach(function (m) { m.mem = {}; }); // 開啟時重新開始判定
      changed();
    });
    try { state.on = !!sessionStorage.getItem('ms-on:' + state.module); } catch (e) { /* 忽略 */ }

    function render() {
      const total = list.reduce(function (a, m) { return a + m.level; }, 0);
      const got = list.reduce(function (a, m) { return a + (state.done[m.id] ? m.level : 0); }, 0);
      const n = list.filter(function (m) { return state.done[m.id]; }).length;
      toggle.classList.toggle('on', state.on);
      toggle.setAttribute('aria-expanded', String(state.on));
      tLabel.textContent = state.on ? T('任務模式：開', 'Mission mode: on') : T('任務模式', 'Mission mode');
      summary.textContent = state.user && state.ready
        ? T('已完成 ', 'Done ') + n + ' / ' + list.length + T('　星星 ', ' · stars ') + got + ' / ' + total
        : (EN ? list.length + ' missions' : '共 ' + list.length + ' 個任務');
      panel.hidden = !state.on;
      if (!state.on) return;
      panel.innerHTML = '';

      if (!enabled) { panel.appendChild(el('p', 'ms-note', T('任務系統尚未啟用。', 'Missions are not available yet.'))); return; }
      if (!state.user) {
        panel.appendChild(el('p', 'ms-note', T('任務模式需要先登入 Google 帳號，完成任務才能獲得「倪的星星」並登上排行榜。',
          'Sign in with Google to earn Ni stars and appear on the leaderboard.')));
        const b = el('button', 'primary ms-signin', T('用 Google 帳號登入', 'Sign in with Google'));
        b.type = 'button';
        b.addEventListener('click', function () { if (api) api.signIn().catch(function () {}); });
        panel.appendChild(b);
      } else if (state.ready && !state.nickname) {
        const f = el('form', 'ms-nick');
        const lab = el('label', null, T('先取一個暱稱（1–20 字）。暱稱會公開顯示在排行榜上，請為自己的暱稱負責。',
          'Choose a nickname (1–20 characters). It is shown publicly on the leaderboard — you are responsible for it.'));
        lab.htmlFor = 'ms-nick-input';
        const inp = el('input'); inp.id = 'ms-nick-input'; inp.maxLength = 20;
        const save = el('button', 'primary', T('儲存暱稱', 'Save')); save.type = 'submit';
        f.appendChild(lab); f.appendChild(inp); f.appendChild(save);
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          const v = String(inp.value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
          if (!v) return;
          guard(function () { return api.setNickname(state.user.uid, v); }).then(function () { state.nickname = v; changed(); fire('ready', state); })
            .catch(function () { state.msg = T('暱稱儲存失敗，請再試一次。', 'Could not save the nickname.'); changed(); });
        });
        panel.appendChild(f);
      } else {
        panel.appendChild(el('p', 'ms-note', T('任務模式開啟中：操作實驗達成條件，就會自動完成任務。每個任務只能領一次星星。',
          'Mission mode is on: reach a goal by working the experiment and the mission completes automatically. Each mission pays out once.')));
      }
      if (state.msg) panel.appendChild(el('p', 'ms-msg', state.msg));
      const rules = el('details', 'ms-rules');
      rules.appendChild(el('summary', null, T('星星怎麼賺？', 'How do I earn stars?')));
      const ul = el('ul');
      [T('必須登入 Google 帳號並打開任務模式，才會判定與記錄。', 'Sign in with Google and turn on Mission mode — only then are missions checked and recorded.'),
        T('任務難度分 1～10 級，完成後獲得與等級相同數量的「倪的星星」。', 'Missions have levels 1–10; completing one earns that many Ni stars.'),
        T('每個任務只能領一次星星，重複完成不會再得星。', 'Each mission pays out once; repeating it earns nothing more.'),
        T('隱藏任務只有一句隱晦的提示，完成時不會說明原因，需要自己反覆嘗試。', 'Hidden missions only give a cryptic hint and are never explained — keep experimenting.'),
        T('成就是收藏用的徽章，不加星星；排行榜只看星星。', 'Achievements are collectible badges and add no stars; the leaderboard counts stars only.')
      ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
      rules.appendChild(ul);
      const more = el('a', null, T('完整規則與排行榜 →', 'Full rules and leaderboard →'));
      more.href = 'leaderboard.html#rules';
      rules.appendChild(more);
      panel.appendChild(rules);

      // 任務清單可收合，讓實驗畫面不會被推得太遠
      const det = el('details', 'ms-details');
      let open = true;
      try { open = sessionStorage.getItem('ms-open:' + state.module) !== '0'; } catch (e) { /* 忽略 */ }
      det.open = open;
      det.appendChild(el('summary', null, T('任務清單（', 'Mission list (') + list.length + T('）', ')')));
      det.addEventListener('toggle', function () {
        try { sessionStorage.setItem('ms-open:' + state.module, det.open ? '1' : '0'); } catch (e) { /* 忽略 */ }
      });
      const ol = el('ol', 'ms-list');
      list.slice().sort(function (a, b) { return (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0) || a.level - b.level; }).forEach(function (m) {
        const li = el('li', 'ms-item' + (state.done[m.id] ? ' done' : '') + (m.hidden ? ' hidden-m' : ''));
        const head = el('div', 'ms-head');
        head.appendChild(starBadge(m.level));
        head.appendChild(el('strong', 'ms-title', m.hidden ? T('隱藏任務', 'Hidden mission') : L(m.title)));
        if (state.done[m.id]) head.appendChild(el('span', 'ms-check', T('✓ 已完成', '✓ Done')));
        li.appendChild(head);
        li.appendChild(el('p', 'ms-desc', m.hidden ? T('「', '“') + L(m.riddle) + T('」', '”') : L(m.desc)));
        ol.appendChild(li);
      });
      det.appendChild(ol);
      panel.appendChild(det);
    }
    listeners.push(render);
    render();
  }

  function start() {
    // 模組的任務檔在本檔之後載入；等 DOM 完成再建立面板
    if (state.module) buildPanel();
    if (enabled && !window.LabAchievements && script) {
      const a = document.createElement('script');
      a.src = script.getAttribute('src').replace(/missions\.js/, 'achievements.js');
      document.body.appendChild(a);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
})();
