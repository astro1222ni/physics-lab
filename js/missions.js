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
 * 星星數 = 任務等級（1–10 顆「倪的星星」）；隱藏任務要自己猜，星星是等級的 2 倍（11/12 站長：「隱藏任務的星星給的數量要再更大方一點」）。
 * 補發：bonus/<uid>/<任務> 記錄完成後補上的星星（例如隱藏任務改成加倍以前完成的人）；完成紀錄的星星 + 補發 = 目前的星星數。
 * 各科排名：scores/<uid> 另外記錄各科星星 s/<科目>（phy、chem、bio、earth、math）與各科最後得星時間 sa/<科目>。
 * 每日任務：每天十個、每個一天一次；銅幣必掉，其他寶物獨立判定。寶物排行按累計獲得與總價值計算。
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
  const hooks = { complete: [], ready: [], synced: [], profile: [] };
  function fire(name, arg) { hooks[name].forEach(function (f) { try { f(arg); } catch (e) { /* 忽略 */ } }); }
  const listeners = [];
  const state = {
    module: pageModule, user: null, nickname: null, pub: true,
    done: {}, on: false, ready: false, busy: false, msg: '',
    daily: dailyParam()
  };
  /** 每日任務模式：網址的 ?daily=<任務代號>，而且這個任務屬於本頁的實驗 */
  function dailyParam() {
    let v = null;
    try { v = new URLSearchParams(location.search).get('daily'); } catch (e) { return null; }
    if (!pageModule || !v || !/^[a-z0-9-]{1,60}$/.test(v)) return null;
    return v.replace(/-(h?\d+)$/, '') === pageModule ? v : null;
  }
  let api = null;

  /** 任務的星星數：一般任務 = 等級；隱藏任務 = 等級 × 2（要瞎猜，給得大方一點） */
  const HIDDEN_X = 2;
  function starsOf(m) { return m ? (m.hidden ? HIDDEN_X : 1) * m.level : 0; }

  // ======================= 公開介面 =======================
  // 實驗模式／學習模式分開（站長 11/16：「同一個實驗的實驗模式跟學習模式的星星數是統一計算，但是要賺取星星，要各自到這兩個不同的界面去賺取」）
  // js/modegate.js 在 <html data-lab-mode> 寫 lab／learn／choose：實驗模式只判定一般與隱藏任務，學習模式只判定自學任務（study: true），入口畫面都不判定。
  // 沒有 modegate 的頁面沒有這個屬性，照舊全部判定。
  function modeAllows(m) {
    const mode = document.documentElement.getAttribute('data-lab-mode');
    if (!mode) return true;
    if (mode === 'lab') return !m.study;
    if (mode === 'learn') return !!m.study;
    return false;
  }
  const LabMission = {
    modeAllows: modeAllows,
    register: function (moduleId, missions) {
      const have = {};
      (registry[moduleId] || []).forEach(function (m) { have[m.id] = true; });
      registry[moduleId] = (registry[moduleId] || []).concat(missions.filter(function (m) { return !have[m.id]; }).map(function (m) {
        return Object.assign({ mem: {} }, m);
      })); // 同一任務檔載入兩次也不會重複
      changed();
    },
    emit: function (type, data) {
      lastEv[type] = { data: data || {}, seq: ++evSeq };
      if (!state.on || !state.user || !state.nickname) return;
      if (window.LabShare && window.LabShare.restoring) return; // 打開分享連結還原設定時不算完成任務
      const list = registry[state.module] || [];
      const LD = window.LabDaily;
      list.forEach(function (m) {
        // 今天還沒完成的每日任務：以前完成過也照樣判定（不再加星，銅幣仍必掉）；今天完成後就不再判定
        const daily = state.daily === m.id && LD && LD.active(m.id);
        if ((state.done[m.id] && !daily) || m.pending) return;
        if (!modeAllows(m)) return;
        let ok = false;
        try { ok = !!m.check({ type: type, data: data || {} }, m.mem); } catch (e) { ok = false; }
        if (!ok) return;
        if (daily) { m.mem = {}; LD.completed(m, !state.done[m.id]); } // 判定記憶歸零：再領一次要重新做一遍
        if (!state.done[m.id]) complete(m);
      });
      nearMiss(type, list);
    },
    all: function () { return registry; },
    /** 任務還差什麼：[[ok（true／false／null＝接下來要做的動作）, 中文, English], …]；沒有定義或還沒資料時是 null */
    needOf: function (m) { return needOf(m); },
    /** 實驗代號 → 科目（phy、chem、bio、earth、math）；需要 missions/index.js（loadIndex） */
    subjectOf: function (mod) { return window.LAB_SUBJECT_OF ? window.LAB_SUBJECT_OF(mod) : 'phy'; },
    /** 載入 missions/index.js（實驗清單、分支、科目） */
    loadIndex: function () { return loadIndex(); },
    /** 載入全站所有任務檔（只註冊，不在本頁判定）；多處呼叫只下載一次 */
    loadAll: function () { return loadAll(); },
    /** 成績卡（js/sharecard.js，按下才載入）：存成圖片、分享到社群 */
    share: function (opts) {
      return loadAll().then(function () {
        return window.LabShareCard ? null : loadScript(base + 'sharecard.js' + ver);
      }).then(function () { if (window.LabShareCard) window.LabShareCard.open(opts); });
    },
    /** 回報本實驗的引導步驟；只保留最好成績，不改任務或各模組的判定。 */
    reportSteps: reportSteps,
    /** 讀取本人的步驟成績；省略代號時讀取本實驗，沒有紀錄則回傳 null。 */
    steps: function (mod) { return procedureSummary(readProcedure(mod || pageModule)); },
    /** 成績卡跨實驗統計使用；只讀目前這位玩家的本機紀錄。 */
    allSteps: function () {
      const out = {};
      (window.LAB_MISSION_MODULES || Object.keys(registry).map(function (id) { return { id: id }; })).forEach(function (m) {
        const result = LabMission.steps(m.id); if (result) out[m.id] = result;
      });
      return out;
    },
    /** 依完成紀錄（任務代號 → { stars }）算出各科星星 */
    subjectStars: function (done) { return subjectStars(done); },
    /** 任務的星星數（隱藏任務是等級的 2 倍）；排行榜、成就、每日任務都用這個算 */
    starsOf: starsOf,
    HIDDEN_X: HIDDEN_X,
    on: function (name, fn) { if (hooks[name]) hooks[name].push(fn); },
    module: pageModule,
    mask: mask,
    // 排行榜頁用
    _state: state,
    _ready: function () { return api ? Promise.resolve(api) : (ready || Promise.resolve(null)); },
    _autoSync: function () { return autoSync(); },
    syncTreasure: function () { return syncTreasure(); }
  };
  window.LabMission = LabMission;

  // ======================= 引導步驟：本人、本實驗、最好成績 =======================
  // 現行 userStats 的白名單不接受步驟物件，因此只存本機，絕不試寫不合規的雲端欄位。
  // 同一實驗可能有四步或七步等不同模式，分別保留，避免把較短流程的完成套到較長流程。
  const procedureMemory = Object.create(null);
  let procedureOwner = null, pendingProcedure = {}, guestProcedure = {};
  function procedureKey(mod) { return 'lab-procedure:' + encodeURIComponent(procedureOwner || 'pending') + ':' + mod; }
  function mergeProcedure(a, b) {
    const out = {};
    [a, b].forEach(function (record) { Object.keys(record || {}).forEach(function (key) {
      const total = Number(key), v = record[key];
      if (!Number.isInteger(total) || total <= 0 || total > 10000 || !v || !Number.isInteger(v.done) || v.done < 0 || v.done > total) return;
      const old = out[key] || { done: 0, completedAt: 0 };
      const at = Number.isFinite(v.completedAt) && v.completedAt > 0 && v.done === total ? v.completedAt : 0;
      out[key] = { done: Math.max(old.done, v.done), completedAt: old.completedAt && at ? Math.min(old.completedAt, at) : old.completedAt || at };
    }); });
    return out;
  }
  function readProcedure(mod) {
    if (!mod || !/^[a-z0-9-]{1,40}$/.test(mod)) return {};
    const key = procedureKey(mod);
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { /* 儲存被封鎖時仍保留本分頁成績。 */ }
    return (procedureMemory[key] = mergeProcedure(stored, procedureMemory[key]));
  }
  function saveProcedure(mod, record) {
    const key = procedureKey(mod);
    procedureMemory[key] = record;
    try { localStorage.setItem(key, JSON.stringify(record)); } catch (e) { /* 本分頁仍可分享，不要求開啟瀏覽器儲存。 */ }
  }
  function procedureSummary(record) {
    const versions = Object.keys(record).map(function (total) {
      return { done: record[total].done, total: Number(total), completedAt: record[total].completedAt || 0 };
    });
    if (!versions.length) return null;
    versions.sort(function (a, b) {
      return Number(!!b.completedAt) - Number(!!a.completedAt) || b.done - a.done || b.total - a.total;
    });
    const best = versions[0];
    return { done: best.done, total: best.total, complete: !!best.completedAt, completedAt: best.completedAt,
      bestDone: Math.max.apply(null, versions.map(function (v) { return v.done; })), versions: versions };
  }
  function reportSteps(done, total) {
    if (!pageModule || !Number.isInteger(done) || !Number.isInteger(total) || total <= 0 || total > 10000 || done < 0 || done > total) return null;
    const sample = {}; sample[total] = { done: done, completedAt: done === total ? Date.now() : 0 };
    if (procedureOwner === null) {
      pendingProcedure = mergeProcedure(pendingProcedure, sample);
      return procedureSummary(pendingProcedure);
    }
    if (procedureOwner === 'guest') guestProcedure = mergeProcedure(guestProcedure, sample);
    const old = readProcedure(pageModule), next = mergeProcedure(old, sample);
    if (JSON.stringify(old) !== JSON.stringify(next)) saveProcedure(pageModule, next);
    return procedureSummary(next);
  }
  function procedureAuth(user) {
    const previous = procedureOwner;
    procedureOwner = user ? user.uid : 'guest';
    const carry = previous === null ? pendingProcedure : previous === 'guest' && user ? guestProcedure : {};
    if (pageModule) {
      // 只接續這次未登入操作的步驟；不搬移其他帳號或過去別人的訪客紀錄。
      if (Object.keys(carry).length) saveProcedure(pageModule, mergeProcedure(readProcedure(pageModule), carry));
    }
    pendingProcedure = {};
    guestProcedure = !user ? mergeProcedure(previous === 'guest' ? guestProcedure : {}, carry) : {};
  }
  function observeProcedure() {
    if (!enabled) procedureAuth(null);
    const root = pageModule && document.querySelector('ol.steps#steps');
    if (!root) return;
    function sample() {
      const items = Array.prototype.filter.call(root.children, function (li) { return li.tagName === 'LI'; });
      if (items.length) reportSteps(items.filter(function (li) { return li.classList.contains('done'); }).length, items.length);
    }
    new MutationObserver(sample).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    sample();
  }

  // ======================= 載入全站清單與任務檔 =======================
  const base = script ? script.getAttribute('src').replace(/missions\.js.*$/, '') : 'js/';
  const ver = script ? ((script.getAttribute('src') || '').match(/\?v=\d+/) || [''])[0] : '';
  function loadScript(src) {
    return new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = src; s.onload = s.onerror = resolve;
      document.body.appendChild(s);
    });
  }
  let indexP = null, allP = null;
  let treasureCoreP = null, treasureSyncP = null, treasureSyncUid = null;
  function treasureCore() {
    if (window.LabDailyCore) return Promise.resolve(window.LabDailyCore);
    // 先讓 HTML 裡的靜態腳本載入；避免登入補寫在解析途中重複載入核心，重設 SVG 代號。
    if (document.readyState === 'loading') return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    }).then(treasureCore);
    if (!treasureCoreP) treasureCoreP = loadScript(base + 'daily-core.js' + ver).then(function () {
      if (!window.LabDailyCore) { treasureCoreP = null; throw new Error('寶物核心載入失敗'); }
      return window.LabDailyCore;
    });
    return treasureCoreP;
  }
  /** 登入補齊公開榜；同一帳號同時要求同步時共用一次查核。 */
  function syncTreasure() {
    if (!api || !state.user || !state.ready) return Promise.resolve(null);
    const uid = state.user.uid;
    if (treasureSyncP && treasureSyncUid === uid) return treasureSyncP;
    treasureSyncUid = uid;
    const job = treasureCore().then(function (C) {
      return Promise.all([api.get('bag/' + uid), api.get('treasureBoard/' + uid), api.get('profiles/' + uid)]).then(function (r) {
        if (!state.user || state.user.uid !== uid) return null;
        // 其他分頁可能已改名或設為不公開，不能把本頁快取的舊設定寫回去。
        const profile = r[2] || {}, name = profile.nickname, pub = profile.pub !== false;
        if (!name) return null;
        if (!r[1] && !C.treasureTotals(r[0]).v) return null;
        if (C.treasureMatches(r[1], r[0], name, pub)) return r[1];
        const record = C.treasureRecord(r[0], r[1], name, pub, api.now());
        return api.update({ ['treasureBoard/' + uid]: record }).then(function () { return api.get('treasureBoard/' + uid); });
      });
    });
    treasureSyncP = job;
    return job.finally(function () { if (treasureSyncP === job) treasureSyncP = null; });
  }
  function loadIndex() {
    if (!indexP) indexP = window.LAB_SUBJECT_OF ? Promise.resolve() : loadScript(base + 'missions/index.js' + ver);
    return indexP;
  }
  function loadAll() {
    if (!allP) allP = loadIndex().then(function () {
      return Promise.all((window.LAB_MISSION_MODULES || []).filter(function (m) { return !registry[m.id]; })
        .map(function (m) { return loadScript(base + 'missions/' + m.id + '.js' + ver); }));
    });
    return allP;
  }
  function subjectStars(done) {
    const s = {};
    Object.keys(done || {}).forEach(function (id) {
      const k = LabMission.subjectOf(id.replace(/-(h?\d+)$/, ''));
      s[k] = (s[k] || 0) + (+done[id].stars || 0);
    });
    return s;
  }

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
          if (window.LabInApp && LabInApp.escape()) return new Promise(function () {}); // App 內建瀏覽器：改用手機瀏覽器開（settings.js）
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
        getBonus: function (uid) { return D.get(r('bonus/' + uid)).then(function (s) { return s.val() || {}; }); },
        // 補發：bonus 與總分、各科星星一起寫（資料庫規則要求兩者同時改、總分剛好加上差額）
        topUp: function (uid, mid, bonus, rec) {
          const u = {};
          u['bonus/' + uid + '/' + mid] = bonus;
          const o = Object.assign({}, rec, { at: D.serverTimestamp() });
          if (rec.sa) { o.sa = {}; Object.keys(rec.sa).forEach(function (k) { o.sa[k] = rec.sa[k] === true ? D.serverTimestamp() : rec.sa[k]; }); }
          u['scores/' + uid] = o;
          return D.update(D.ref(db), u);
        },
        // sub：{ s: { 科目: 星星 }, sa: { 科目: 時間，或 true = 伺服器現在時間 } }
        complete: function (uid, mid, stars, name, pub, prev, sub) {
          const u = {};
          u['completions/' + uid + '/' + mid] = { stars: stars, at: D.serverTimestamp() };
          const rec = { stars: (prev || 0) + stars, last: mid, name: name, pub: pub, at: D.serverTimestamp() };
          if (sub) {
            rec.s = sub.s;
            rec.sa = {};
            Object.keys(sub.sa).forEach(function (k) { rec.sa[k] = sub.sa[k] === true ? D.serverTimestamp() : sub.sa[k]; });
          }
          u['scores/' + uid] = rec;
          return D.update(D.ref(db), u);
        },
        rename: function (uid, score, name, pub) {
          return D.update(r('scores/' + uid), { name: name, pub: pub, stars: score.stars, last: score.last, at: score.at || 0 });
        },
        // subj：省略是全科總排名；'phy' 等是該科排名
        top: function (n, subj) {
          const key = subj ? 's/' + subj : 'stars';
          const rows = function (s) { const list = []; s.forEach(function (c) { list.push(Object.assign({ uid: c.key }, c.val())); }); return list; };
          return D.get(D.query(r('scores'), D.orderByChild(key), D.limitToLast(n))).then(function (s) {
            const list = rows(s);
            // 資料庫只照分數截取前 n 筆：第 n 名剛好有人同分時，較早達到的同分者可能被擠掉（Codex 試玩 11/12 抓到）。
            // 把邊界分數的人全部取回，由畫面照「同分先達到者在前」排序後再取前 n 名。
            if (list.length < n) return list;
            const edge = Math.min.apply(null, list.map(function (x) { return subj ? ((x.s && x.s[subj]) || 0) : (x.stars || 0); }));
            if (!(edge > 0)) return list;
            return D.get(D.query(r('scores'), D.orderByChild(key), D.equalTo(edge), D.limitToFirst(1000))).then(function (t) {
              const seen = {};
              list.forEach(function (x) { seen[x.uid] = 1; });
              rows(t).forEach(function (x) { if (!seen[x.uid]) list.push(x); });
              return list;
            });
          });
        },
        countAbove: function (stars, subj) {
          return D.get(D.query(r('scores'), D.orderByChild(subj ? 's/' + subj : 'stars'), D.startAt(stars + 1))).then(function (s) { return s.size; });
        },
        topTreasures: function (n, metric) {
          const key = /^(v|cu|ag|au|dia|key)$/.test(metric) ? metric : 'v';
          const rows = function (snapshot) { const list = []; snapshot.forEach(function (child) { list.push(Object.assign({ uid: child.key }, child.val())); }); return list; };
          return D.get(D.query(r('treasureBoard'), D.orderByChild(key), D.limitToLast(n))).then(function (snapshot) {
            const list = rows(snapshot);
            if (list.length < n) return list;
            // 包含零枚的同分邊界也要補齊，依各項目的達到時間排序後才取前 100 名。
            const edge = Math.min.apply(null, list.map(function (row) { return row[key] || 0; }));
            return D.get(D.query(r('treasureBoard'), D.orderByChild(key), D.equalTo(edge))).then(function (same) {
              const seen = {}; list.forEach(function (row) { seen[row.uid] = true; });
              rows(same).forEach(function (row) { if (!seen[row.uid]) list.push(row); });
              return list;
            });
          });
        },
        countTreasureAbove: function (value, metric) {
          const key = /^(v|cu|ag|au|dia|key)$/.test(metric) ? metric : 'v';
          return D.get(D.query(r('treasureBoard'), D.orderByChild(key), D.startAt(value + 1))).then(function (snapshot) { return snapshot.size; });
        },
        /** 伺服器時間 − 本機時間（毫秒）：每日任務換日以伺服器時間為準 */
        serverOffset: function () {
          return new Promise(function (resolve) {
            const t = setTimeout(function () { resolve(0); }, 8000);
            D.onValue(r('.info/serverTimeOffset'), function (s) { clearTimeout(t); resolve(+s.val() || 0); }, { onlyOnce: true });
          });
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
      // 任務、每日與排行榜入口共用此更新，讓個人設定和兩個公開榜一起寫入。
      api.setNickname = function (uid, name) {
        return treasureCore().then(function (C) { return C.updateTreasureProfile(api, uid, { nickname: name }); }).then(function () {
          if (state.user && state.user.uid === uid) { state.nickname = name; changed(); fire('profile', state); }
        });
      };
      api.setPub = function (uid, pub) {
        return treasureCore().then(function (C) { return C.updateTreasureProfile(api, uid, { pub: pub }); }).then(function () {
          if (state.user && state.user.uid === uid) { state.pub = pub; changed(); fire('profile', state); }
        });
      };
      api.onAuth(function (user) {
        state.user = user;
        procedureAuth(user);
        state.nickname = null;
        state.done = {};
        state.ready = !user;
        changed();
        if (!user) return;
        // 管理員登入時，自動把本頁任務同步到資料庫（不必再手動按「同步任務清單」）
        if (api.isAdmin) api.isAdmin(user.uid).then(function (a) {
          if (!a || !state.user || state.user.uid !== user.uid) return;
          adminUid = user.uid;
          afterLoad(autoSync);
        });
        Promise.all([api.getProfile(user.uid).catch(function () { return {}; }), api.getDone(user.uid).catch(function () { return {}; }),
          api.getBonus ? api.getBonus(user.uid).catch(function () { return {}; }) : Promise.resolve({})]).then(function (r) {
          if (!state.user || state.user.uid !== user.uid) return;
          state.nickname = r[0].nickname || null;
          state.pub = r[0].pub !== false;
          state.done = mergeBonus(r[1] || {}, r[2] || {});
          state.ready = true;
          changed();
          fire('ready', state);
          syncSubjects(user.uid);
          syncBonus(user.uid);
          syncTreasure().catch(function () { /* 規則未發布或網路失敗：下次登入再補，排行頁可重試 */ });
        });
      });
      return api;
    }).catch(function () { procedureAuth(null); state.msg = T('任務系統暫時無法載入。', 'Missions could not be loaded right now.'); changed(); });
  }

  // ======================= 管理員：自動同步任務清單 =======================
  // 比對資料庫 missionDefs 與本頁已註冊的任務；有新任務或星星數不同時才寫入（只增改、不刪除）。
  // 回傳寫入的任務數；非管理員或失敗時回傳 -1。
  let adminUid = null;
  function afterLoad(fn) {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', function () { fn(); }, { once: true });
  }
  function autoSync() {
    if (!api || !api.get || !adminUid || !state.user || state.user.uid !== adminUid) return Promise.resolve(-1);
    return guard(function () { return api.get('missionDefs'); }).then(function (cur) {
      cur = cur || {};
      const defs = {};
      Object.keys(registry).forEach(function (k) {
        registry[k].forEach(function (m) { if (!cur[m.id] || cur[m.id].stars !== starsOf(m)) defs[m.id] = starsOf(m); });
      });
      const n = Object.keys(defs).length;
      if (!n) return 0;
      return guard(function () { return api.syncDefs(defs); }).then(function () {
        state.adminMsg = T('（管理員）已自動同步 ', '(Admin) Auto-synced ') + n + T(' 個任務到資料庫。', ' missions to the database.');
        changed();
        fire('synced', n);
        return n;
      });
    }).catch(function () { return -1; });
  }

  // ======================= 各科星星：補齊舊紀錄 =======================
  // 各科排名上線前就有星星的人，scores 裡沒有各科數字：依完成紀錄補上（只增不減；資料庫規則限制各科加總不超過總星數）
  function syncSubjects(uid) {
    if (!api || !api.get || !api.update) return;
    loadIndex().then(function () { return api.get('scores/' + uid); }).then(function (sc) {
      if (!sc || !state.user || state.user.uid !== uid) return;
      const target = subjectStars(state.done), cur = sc.s || {};
      const map = {};
      let sum = 0;
      Object.keys(Object.assign({}, cur, target)).forEach(function (k) {
        const v = Math.max(cur[k] || 0, target[k] || 0);
        sum += v;
        if (cur[k] !== v) { map['scores/' + uid + '/s/' + k] = v; map['scores/' + uid + '/sa/' + k] = api.now(); }
      });
      if (!Object.keys(map).length || sum > (sc.stars || 0)) return;
      return api.update(map);
    }).catch(function () { /* 下次登入再補 */ });
  }

  // ======================= 補發星星 =======================
  // done[id].stars 是「目前領到的星星」（完成紀錄 + 補發），base 是完成當時記的星星
  function mergeBonus(done, bonus) {
    Object.keys(done).forEach(function (id) {
      const b = +bonus[id] || 0;
      done[id] = Object.assign({}, done[id], { base: +done[id].stars || 0, bonus: b, stars: (+done[id].stars || 0) + b });
    });
    return done;
  }
  // 已完成、但領到的星星比現在的星星數少（例如隱藏任務改成加倍以前完成的）：補發差額。
  // 只看本頁已註冊的任務（實驗頁是本實驗，排行榜與每日任務頁是全站），以資料庫 missionDefs 的星星數為準。
  let bonusBusy = false;
  function syncBonus(uid) {
    if (!api || !api.topUp || !api.get || bonusBusy || !state.ready) return Promise.resolve(0);
    const need = [];
    Object.keys(registry).forEach(function (k) {
      registry[k].forEach(function (m) { const d = state.done[m.id]; if (d && d.stars < starsOf(m)) need.push(m); });
    });
    if (!need.length) return Promise.resolve(0);
    bonusBusy = true;
    let added = 0;
    let chain = loadIndex();
    need.forEach(function (m) {
      chain = chain.then(function () {
        if (!state.user || state.user.uid !== uid) return;
        return guard(function () { return api.get('missionDefs/' + m.id + '/stars'); }).then(function (def) {
          const d = state.done[m.id];
          if (!d || !(def > d.stars)) return; // 任務清單還沒同步成新的星星數：下次再補
          const delta = def - d.stars, bonus = def - d.base;
          return guard(function () { return api.getScore(uid); }).then(function (sc) {
            if (!sc) return;
            const subj = LabMission.subjectOf(m.id.replace(/-(h?\d+)$/, ''));
            const rec = { stars: sc.stars + delta, last: m.id, name: sc.name, pub: sc.pub };
            if (sc.s) {
              rec.s = Object.assign({}, sc.s); rec.s[subj] = (rec.s[subj] || 0) + delta;
              rec.sa = Object.assign({}, sc.sa || {}); rec.sa[subj] = true;
            }
            return guard(function () { return api.topUp(uid, m.id, bonus, rec); }).then(function () {
              d.bonus = bonus; d.stars = def; added += delta;
            });
          });
        }).catch(function () { /* 下次再補 */ });
      });
    });
    return chain.then(function () {
      bonusBusy = false;
      if (added) {
        state.msg = T('已補發 ' + added + ' 顆星：隱藏任務的星星改成等級的 2 倍，以前完成的也補上了。',
          'You received ' + added + ' bonus stars: hidden missions now pay twice their level, including ones you finished before.');
        changed();
        fire('complete', null);
      }
      return added;
    }, function () { bonusBusy = false; return added; });
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
    const uid = state.user.uid;
    let stars = starsOf(m);
    // 以資料庫 missionDefs 的星星數為準（星星數剛改、管理員還沒同步時照舊值記錄，同步後由 syncBonus 補發差額）
    const defP = api.get ? guard(function () { return api.get('missionDefs/' + m.id + '/stars'); }).catch(function () { return null; }) : Promise.resolve(null);
    return loadIndex().then(function () { return defP; }).then(function (def) {
      if (def >= 1) stars = def;
      return guard(function () { return api.getScore(uid); });
    }).then(function (sc) {
      // 各科星星：沿用資料庫裡的數字（舊紀錄沒有時，依完成紀錄補算），再加上這個任務所屬科目的星星
      const subj = LabMission.subjectOf(state.module);
      const s = Object.assign({}, (sc && sc.s) || subjectStars(state.done));
      const sa = Object.assign({}, (sc && sc.sa) || {});
      s[subj] = (s[subj] || 0) + stars;
      Object.keys(s).forEach(function (k) { if (sa[k] == null || k === subj) sa[k] = true; });
      const prevStars = sc ? sc.stars : 0;
      return guard(function () { return api.complete(uid, m.id, stars, displayName(), state.pub, prevStars, { s: s, sa: sa }); }).catch(function (e) {
        // 資料庫規則還是舊版（不認得各科星星）時，改用舊格式再寫一次：總星數照樣記錄，各科星星等規則更新後由 syncSubjects 補算。
        // 已經有各科紀錄的人代表新規則已生效，就不退回。
        const c = (e && (e.code || e.message)) || '';
        if ((sc && sc.s) || !/PERMISSION_DENIED|permission/i.test(c)) throw e;
        return guard(function () { return api.complete(uid, m.id, stars, displayName(), state.pub, prevStars); });
      });
    }).then(function () {
      state.done[m.id] = { stars: stars, base: stars, bonus: 0, at: Date.now() };
      m.gained = stars;
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
  // ======================= 還差什麼（站長 11/16） =======================
  // 站長：「學生他會覺得他已經完成了那個任務，可是他卻不知道他自己少了些什麼東西。」
  // 任務可以定義 need(ctx)：回傳逐條條件 [ok, 中文, English]，ok 為 null 表示「接下來要做的動作」；
  // ctx.last(事件) 是該事件最後一次的資料、ctx.seq(事件) 是它的先後順序。needOn 列出「做了這個動作卻沒過關就提醒」的事件。
  const lastEv = {}; let evSeq = 0;
  const needOpen = {}, nearShown = {};
  const needCtx = { last: function (t) { return lastEv[t] ? lastEv[t].data : null; }, seq: function (t) { return lastEv[t] ? lastEv[t].seq : 0; } };
  function needOf(m) {
    if (!m || m.hidden || typeof m.need !== 'function') return null;
    try { const r = m.need(needCtx); return Array.isArray(r) && r.length ? r : null; } catch (e) { return null; }
  }
  function fillNeed(ul, m) {
    const items = needOf(m);
    ul.innerHTML = '';
    if (!items) { ul.appendChild(el('li', 'ms-need-act', T('先動手操作一次，這裡就會列出還差哪些條件。', 'Try it once and the missing conditions will be listed here.'))); return; }
    items.forEach(function (x) {
      const li = el('li', x[0] === true ? 'ms-need-ok' : x[0] === false ? 'ms-need-no' : 'ms-need-act');
      li.appendChild(el('span', 'ms-need-mark', x[0] === true ? '✓' : x[0] === false ? '✗' : '→'));
      li.appendChild(el('span', null, T(x[1], x[2] || x[1])));
      ul.appendChild(li);
    });
  }
  function needBox(m) {
    needTimer();
    const det = el('details', 'ms-need');
    det.appendChild(el('summary', null, T('還差什麼？', 'What’s missing?')));
    const ul = el('ul'); det.appendChild(ul); det._m = m;
    if (needOpen[m.id]) { det.open = true; fillNeed(ul, m); }
    det.addEventListener('toggle', function () { needOpen[m.id] = det.open; if (det.open) fillNeed(ul, m); });
    return det;
  }
  let needTick = 0; // 打開的「還差什麼」每秒更新一次（第一次出現時才啟動）
  function needTimer() {
    if (needTick) return;
    needTick = setInterval(function () {
      if (document.hidden) return;
      document.querySelectorAll('details.ms-need[open]').forEach(function (d) { if (d._m) fillNeed(d.querySelector('ul'), d._m); });
    }, 1000);
  }
  /** 做了動作卻沒過關、而且已經做到一半以上的條件：跳一張「差一點」，列出還沒做到的條件（同一個任務 20 秒內只跳一次） */
  function nearMiss(type, list) {
    let best = null;
    list.forEach(function (m) {
      if (m.hidden || state.done[m.id] || !m.needOn || m.needOn.indexOf(type) < 0) return;
      const items = needOf(m); if (!items) return;
      const known = items.filter(function (x) { return x[0] !== null; });
      const ok = known.filter(function (x) { return x[0]; }).length;
      const miss = known.filter(function (x) { return !x[0]; });
      if (!miss.length || !ok || ok / known.length < 0.5) return;
      const score = ok / known.length - m.level * 0.001;
      if (!best || score > best.score) best = { m: m, miss: miss, score: score };
    });
    if (!best) return;
    const now = Date.now();
    if (nearShown[best.m.id] && now - nearShown[best.m.id] < 20000) return;
    nearShown[best.m.id] = now;
    showNear(best.m, best.miss);
  }
  let nearBox = null, nearTimer = 0;
  function showNear(m, miss) {
    if (!nearBox) {
      nearBox = el('div', 'ms-near'); nearBox.setAttribute('role', 'status'); nearBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(nearBox);
    }
    nearBox.innerHTML = '';
    const head = el('div', 'ms-near-head');
    head.appendChild(el('strong', null, T('差一點！', 'Almost!') + ' ★' + starsOf(m) + ' ' + L(m.title)));
    const x = el('button', 'ms-near-x', '×'); x.type = 'button'; x.setAttribute('aria-label', T('關閉', 'Close'));
    x.addEventListener('click', function () { nearBox.hidden = true; });
    head.appendChild(x); nearBox.appendChild(head);
    const ul = el('ul');
    miss.slice(0, 3).forEach(function (it) { ul.appendChild(el('li', null, '✗ ' + T(it[1], it[2] || it[1]))); });
    nearBox.appendChild(ul);
    const more = el('button', 'ms-near-more', T('看全部條件', 'See every condition')); more.type = 'button';
    more.addEventListener('click', function () {
      nearBox.hidden = true; needOpen[m.id] = true;
      if (window.LabSide && LabSide.instance) LabSide.instance.open('missions');
      listeners.forEach(function (fn) { fn(); });
      setTimeout(function () {
        const li = document.querySelector('.labside-mission[data-mid="' + m.id + '"]') || document.querySelector('[data-mid="' + m.id + '"]');
        if (li && li.getClientRects().length) { const detail = li.querySelector('details.ms-need'); if (detail) detail.open = true; li.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }, 80);
    });
    nearBox.appendChild(more);
    nearBox.hidden = false;
    clearTimeout(nearTimer); nearTimer = setTimeout(function () { nearBox.hidden = true; }, 9000);
  }

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
  /** 「已得 / 共」的星星徽章（任務區標題用） */
  function starTally(got, total) {
    const b = el('span', 'ms-stars');
    b.innerHTML = STAR;
    b.appendChild(el('span', null, got + ' / ' + total));
    b.setAttribute('aria-label', T('已得 ' + got + ' 顆，共 ' + total + ' 顆倪的星星', got + ' of ' + total + ' Ni stars'));
    return b;
  }
  /** 介面偏好（展開／收合、只看未完成、右側欄）：記在本機、全站共用；讀不到就用預設值 */
  function pref(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } }

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
    gain.appendChild(el('span', null, '+' + (m.gained || starsOf(m)) + T(' 顆倪的星星', ' Ni stars')));
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
    const dlink = el('a', 'ms-board-link ms-daily-link', T('每日任務', 'Daily missions'));
    dlink.href = 'daily.html';
    bar.appendChild(toggle);
    bar.appendChild(summary);
    bar.appendChild(dlink);
    bar.appendChild(board);
    const panel = el('div', 'ms-panel');
    panel.hidden = true;
    wrap.appendChild(bar);
    wrap.appendChild(panel);

    const anchor = document.querySelector('.stats-bar') || document.querySelector('header.top');
    if (anchor) anchor.insertAdjacentElement('afterend', wrap);
    else (document.querySelector('.wrap') || document.body).prepend(wrap);
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', T('任務', 'Missions'));

    // 橫式寬螢幕：任務模式開啟時，任務面板變成貼在右側的一欄（跟著畫面、自己捲動），實驗往左讓出空間，
    // 邊操作邊看得到任務；收起時只留右邊緣一個小標籤。直式與窄螢幕維持放在實驗上方。
    const dockMq = window.matchMedia ? window.matchMedia('(min-width: 1240px) and (orientation: landscape)') : null;
    const dockTab = el('button', 'ms-dock-tab');
    dockTab.type = 'button';
    dockTab.innerHTML = STAR;
    const dockTabText = el('span');
    dockTab.appendChild(dockTabText);
    dockTab.setAttribute('aria-label', T('展開任務欄', 'Open the mission panel'));
    dockTab.addEventListener('click', function () {
      setPref('ms-dock', '1'); render();
      const b = panel.querySelector('.ms-dock-close'); if (b) b.focus();
    });
    document.body.appendChild(dockTab);
    let dockWas = '';
    function applyDock() {
      const root = document.documentElement;
      const can = !!(dockMq && dockMq.matches) && state.on && !root.classList.contains('lab-projector') && !root.classList.contains('lab-embed');
      const mode = !can ? '' : pref('ms-dock', '1') === '1' ? 'open' : 'closed';
      root.classList.toggle('ms-docked', mode === 'open');
      root.classList.toggle('ms-dock-closed', mode === 'closed');
      if (mode !== dockWas) { dockWas = mode; window.dispatchEvent(new Event('resize')); } // 實驗畫布照新的寬度重畫
      return mode;
    }
    if (dockMq) {
      const onMq = function () { render(); };
      if (dockMq.addEventListener) dockMq.addEventListener('change', onMq); else if (dockMq.addListener) dockMq.addListener(onMq);
    }

    toggle.addEventListener('click', function () {
      state.on = !state.on;
      msPref = state.on;
      try { sessionStorage.setItem('ms-on:' + state.module, state.on ? '1' : '0'); } catch (e) { /* 忽略 */ }
      if (state.on) list.forEach(function (m) { m.mem = {}; }); // 開啟時重新開始判定
      changed();
    });
    /* 任務模式開關：這個分頁裡自己按過就照自己的選擇（'1' 開、'0' 或舊版的 '' 關）；
       沒按過時，用 Google 帳號登入就預設開啟、沒登入就預設關閉（11/13 站長要求） */
    let msPref = null;
    try { const v = sessionStorage.getItem('ms-on:' + state.module); msPref = v === '1' ? true : v === null ? null : false; } catch (e) { /* 忽略 */ }
    state.on = msPref === true || (msPref === null && !!state.user);
    if (state.daily) state.on = true; // 每日任務模式：一進來就開任務模式
    listeners.push(function () {
      if (msPref !== null || state.daily) return;
      const want = !!state.user;
      if (state.on !== want) { state.on = want; if (want) list.forEach(function (m) { m.mem = {}; }); }
    });

    function render() {
      const total = list.reduce(function (a, m) { return a + starsOf(m); }, 0);
      const got = list.reduce(function (a, m) { return a + (state.done[m.id] ? state.done[m.id].stars || 0 : 0); }, 0);
      const n = list.filter(function (m) { return state.done[m.id]; }).length;
      toggle.classList.toggle('on', state.on);
      toggle.setAttribute('aria-expanded', String(state.on));
      tLabel.textContent = state.on ? T('任務模式：開', 'Mission mode: on') : T('任務模式', 'Mission mode');
      summary.textContent = state.user && state.ready
        ? T('已完成 ', 'Done ') + n + ' / ' + list.length + T('　星星 ', ' · stars ') + got + ' / ' + total
        : (EN ? list.length + ' missions' : '共 ' + list.length + ' 個任務');
      const dock = applyDock();
      dockTabText.textContent = T('任務 ', 'Missions ') + n + '/' + list.length;
      panel.hidden = !state.on || dock === 'closed';
      if (!state.on) return;
      panel.innerHTML = '';
      if (dock === 'open') {
        const dh = el('div', 'ms-dock-head');
        const ttl = el('strong', 'ms-dock-title');
        ttl.innerHTML = STAR;
        ttl.appendChild(el('span', null, T('任務', 'Missions')));
        dh.appendChild(ttl);
        dh.appendChild(el('span', 'ms-summary', summary.textContent));
        const x = el('button', 'ms-dock-close', T('收起 ›', 'Hide ›'));
        x.type = 'button';
        x.setAttribute('aria-label', T('收起任務欄', 'Hide the mission panel'));
        x.addEventListener('click', function () { setPref('ms-dock', '0'); render(); dockTab.focus(); });
        dh.appendChild(x);
        panel.appendChild(dh);
      }

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
        if (state.ready && list.some(function (m) { return state.done[m.id]; })) {
          const sh = el('button', 'ms-share', T('分享我的成績（存成圖片）', 'Share my results (as an image)'));
          sh.type = 'button';
          sh.addEventListener('click', function () { LabMission.share({ scope: 'mods', mods: [state.module] }); });
          panel.appendChild(sh);
        }
      }
      if (state.msg) panel.appendChild(el('p', 'ms-msg', state.msg));
      if (state.adminMsg) panel.appendChild(el('p', 'ms-note', state.adminMsg));
      const rules = el('details', 'ms-rules');
      rules.appendChild(el('summary', null, T('星星怎麼賺？', 'How do I earn stars?')));
      const ul = el('ul');
      [T('必須登入 Google 帳號並打開任務模式，才會判定與記錄。', 'Sign in with Google and turn on Mission mode — only then are missions checked and recorded.'),
        T('任務難度分 1～10 級，完成後獲得與等級相同數量的「倪的星星」。', 'Missions have levels 1–10; completing one earns that many Ni stars.'),
        T('隱藏任務要自己猜，星星是等級的 2 倍。', 'Hidden missions take guesswork, so they pay twice their level in stars.'),
        T('每個任務只能領一次星星，重複完成不會再得星。', 'Each mission pays out once; repeating it earns nothing more.'),
        T('隱藏任務只有一句隱晦的提示，完成時不會說明原因，需要自己反覆嘗試。', 'Hidden missions only give a cryptic hint and are never explained — keep experimenting.'),
        T('成就是收藏用的徽章，不加星星；排行榜只看星星。', 'Achievements are collectible badges and add no stars; the leaderboard counts stars only.')
      ].forEach(function (t) { ul.appendChild(el('li', null, t)); });
      rules.appendChild(ul);
      const more = el('a', null, T('完整規則與排行榜 →', 'Full rules and leaderboard →'));
      more.href = 'leaderboard.html#rules';
      rules.appendChild(more);
      panel.appendChild(rules);

      // 一般任務與隱藏任務各一區，各有展開／收合按鈕（站長 11/12：隱藏任務增加到 10 個，清單變長）
      const undone = pref('ms-undone', '0') === '1';
      const tools = el('div', 'ms-tools');
      const fBtn = el('button', 'ms-filter', T('只看未完成', 'Unfinished only'));
      fBtn.type = 'button';
      fBtn.setAttribute('aria-pressed', String(undone));
      fBtn.addEventListener('click', function () { setPref('ms-undone', undone ? '0' : '1'); render(); });
      tools.appendChild(fBtn);
      panel.appendChild(tools);
      const lm = document.documentElement.getAttribute('data-lab-mode');
      if (lm === 'lab' || lm === 'learn') {
        panel.appendChild(el('p', 'ms-mode-note', lm === 'lab'
          ? T('實驗模式：這裡列一般與隱藏任務；自學任務在「學習模式」。上方星星是兩邊合計。', 'Lab mode: missions and hidden missions are listed here; self-study missions are in Learning mode. The star total above includes both.')
          : T('學習模式：這裡列自學任務；一般與隱藏任務在「實驗模式」。上方星星是兩邊合計。', 'Learning mode: self-study missions are listed here; missions and hidden missions are in Lab mode. The star total above includes both.')));
      }
      const byLevel = function (a, b) { return a.level - b.level; };
      // 一般任務：寬螢幕預設展開；手機預設收合成一行，實驗不會被推得太遠
      // 實驗模式只列一般與隱藏任務，學習模式只列自學任務（站長：「實驗模式不應該出現自學的任務」）
      if (lm !== 'learn') {
        section('pub', T('一般任務', 'Missions'), list.filter(function (m) { return !m.hidden && !m.study; }).sort(byLevel), !!(dockMq && dockMq.matches), undone);
        section('hid', T('隱藏任務', 'Hidden missions'), list.filter(function (m) { return m.hidden; }).sort(byLevel), false, undone);
      }
      if (lm !== 'lab') section('study', T('自學任務', 'Self-study missions'), list.filter(function (m) { return m.study; }).sort(byLevel), lm === 'learn', undone);
    }

    /** 一區任務：標題按鈕（完成數、星星數、展開／收合）＋清單；開關狀態記在本機，全站共用 */
    function section(key, name, items, defOpen, undone) {
      if (!items.length) return;
      const open = pref('ms-sec-' + key, defOpen ? '1' : '0') === '1';
      const n = items.filter(function (m) { return state.done[m.id]; }).length;
      const got = items.reduce(function (a, m) { return a + (state.done[m.id] ? state.done[m.id].stars || 0 : 0); }, 0);
      const total = items.reduce(function (a, m) { return a + starsOf(m); }, 0);
      const sec = el('section', 'ms-sec ms-sec-' + key + (open ? ' open' : ''));
      const id = 'ms-' + key + '-' + state.module;
      const btn = el('button', 'ms-sec-btn');
      btn.type = 'button';
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-controls', id);
      btn.appendChild(el('span', 'ms-sec-name', name));
      btn.appendChild(el('span', 'ms-sec-count', n + ' / ' + items.length));
      btn.appendChild(starTally(got, total));
      btn.appendChild(el('span', 'ms-sec-act', open ? T('收合', 'Hide') : T('展開', 'Show')));
      btn.addEventListener('click', function () { setPref('ms-sec-' + key, open ? '0' : '1'); render(); });
      sec.appendChild(btn);
      const shown = undone ? items.filter(function (m) { return !state.done[m.id]; }) : items;
      const box = el(key === 'hid' ? 'ul' : 'ol', key === 'hid' ? 'ms-hgrid' : 'ms-list');
      box.id = id;
      box.hidden = !open;
      if (!shown.length) box.appendChild(el('li', 'ms-alldone', T('這一區全部完成了！', 'All done here!')));
      shown.forEach(function (m) {
        const done = !!state.done[m.id];
        if (key === 'hid') {
          const li = el('li', 'ms-hcard' + (done ? ' done' : ''));
          const head = el('div', 'ms-head');
          head.appendChild(starBadge(starsOf(m)));
          if (done) head.appendChild(el('span', 'ms-check', T('✓ 已完成', '✓ Done')));
          li.appendChild(head);
          li.appendChild(el('p', 'ms-desc', T('「', '“') + L(m.riddle) + T('」', '”')));
          box.appendChild(li);
          return;
        }
        const li = el('li', 'ms-item' + (done ? ' done' : ''));
        const head = el('div', 'ms-head');
        head.appendChild(starBadge(starsOf(m)));
        head.appendChild(el('strong', 'ms-title', L(m.title)));
        if (done) head.appendChild(el('span', 'ms-check', T('✓ 已完成', '✓ Done')));
        li.appendChild(head);
        li.appendChild(el('p', 'ms-desc', L(m.desc)));
        li.dataset.mid = m.id;
        if (!done && typeof m.need === 'function') li.appendChild(needBox(m));
        box.appendChild(li);
      });
      sec.appendChild(box);
      panel.appendChild(sec);
    }
    listeners.push(render);
    render();
  }

  function start() {
    observeProcedure();
    // 模組的任務檔在本檔之後載入；等 DOM 完成再建立面板
    if (state.module) buildPanel();
    if (enabled && !window.LabAchievements && script) {
      const a = document.createElement('script');
      a.src = script.getAttribute('src').replace(/missions\.js/, 'achievements.js');
      document.body.appendChild(a);
    }
    // 每日任務模式：載入每日任務的計算與介面
    if (enabled && state.daily && !window.LabDaily) {
      treasureCore().then(function () {
        if (!window.LabDaily) return loadScript(base + 'daily.js' + ver);
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
})();
