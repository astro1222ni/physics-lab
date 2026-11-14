/*
 * mock-backend.js — 測試用的假 Firebase（任務、成就、留言、每日任務與寶物、各科排名），只給 Playwright 用，網站本身不會載入。
 *
 * 用法（Playwright）：
 *   await context.addInitScript({ path: 'tools/mock-backend.js' });
 *   // 預先登入：await context.addInitScript(() => localStorage.setItem('mockuser', 'u1'));
 *   // 管理員：uid 'admin1'（localStorage 'mocknext' = 'admin1' 後按登入）
 *   // 假的伺服器時間：localStorage 'mockoffset' = 毫秒（伺服器時間 = 本機時間 + 這個值；測試換日用）
 *   // 模擬「正式站還是舊規則」：localStorage 'mockoldrules' = '1'（拒絕各科星星 s/sa、每日任務 daily/、寶物 bag/）
 * 資料存在 localStorage 'mdb'，並模擬資料庫規則（firebase/database.rules.json）：
 *   任務只能領一次、星星數必須等於 missionDefs（1–20）、總分遞增正確、各科星星只增不減且加總不超過總星數；
 *   補發 bonus/<uid>/<任務>：只增不減、完成紀錄 + 補發 = missionDefs、總分剛好加上差額、必須和總分一起寫；
 *   每日任務的換日、兩次掉寶至少隔 10 秒、每天最多 45 次；寶物每次增加的上限、必須和每日任務一起寫入。
 * 任務完成前要先同步任務清單：以管理員登入並打開任何實驗頁或排行榜頁（missions.js 會自動同步），
 * 或直接在 'mdb'.missionDefs 預先放入 { 任務代號: { stars: 等級 } }。
 */
(function () {
  const load = () => JSON.parse(localStorage.getItem('mdb') || 'null') || { profiles: {}, completions: {}, scores: {}, missionDefs: {}, admins: { admin1: true } };
  const save = db => localStorage.setItem('mdb', JSON.stringify(db));
  const clock = () => Date.now() + (+localStorage.getItem('mockoffset') || 0);
  const cbs = [];
  let user = localStorage.getItem('mockuser') ? { uid: localStorage.getItem('mockuser') } : null;
  const deny = (why) => { window.__denied = (window.__denied || []).concat(why || 'denied'); return Promise.reject({ code: 'PERMISSION_DENIED', message: why }); };
  const NOW = '__now__';
  // 把「伺服器現在時間」的記號換成數字
  function resolveNow(v, t) {
    if (v && v.__now) return t;
    if (v && typeof v === 'object' && v.__inc == null) { const o = Array.isArray(v) ? [] : {}; Object.keys(v).forEach(k => { o[k] = resolveNow(v[k], t); }); return o; }
    return v;
  }
  const get = (db, path) => path.split('/').reduce((o, k) => (o == null ? null : o[k]), db) ?? null;
  const SUBJ = ['phy', 'chem', 'bio', 'earth', 'math', 'info', 'geog', 'music'];
  const TW = 8 * 3600000, DAY = 86400000;

  // ---------- 規則：各科星星 ----------
  const oldRules = () => !!localStorage.getItem('mockoldrules');
  function checkScore(oldS, newS, t) {
    if (!newS) return null;
    if (oldRules() && (newS.s || newS.sa)) return 'scores: 舊規則不認得 s／sa';
    if (oldS && oldS.s && !newS.s) return 'scores: s 不能拿掉';
    if (newS.s) {
      let sum = 0;
      for (const k of Object.keys(newS.s)) {
        if (!SUBJ.includes(k) || typeof newS.s[k] !== 'number') return 'scores: s/' + k + ' 不合法';
        const prev = oldS && oldS.s && oldS.s[k] != null ? oldS.s[k] : 0;
        if (newS.s[k] < prev) return 'scores: s/' + k + ' 不能減少';
        sum += newS.s[k];
      }
      if (sum > newS.stars) return 'scores: 各科加總超過總星數';
    }
    if (newS.sa) for (const k of Object.keys(newS.sa)) {
      const prev = oldS && oldS.sa ? oldS.sa[k] : undefined;
      if (!SUBJ.includes(k) || (newS.sa[k] !== t && newS.sa[k] !== prev)) return 'scores: sa/' + k + ' 必須是現在時間或不變';
    }
    return null;
  }
  // ---------- 規則：每日任務 ----------
  function checkDaily(o, n, t) {
    if (oldRules()) return 'daily: 舊規則沒有這個節點';
    if (!n) return 'daily: 不能刪除';
    if (n.d == null || !n.picks || n.n == null || n.at == null) return 'daily: 缺欄位';
    if (n.at !== t) return 'daily: at 必須是現在時間';
    if (!(n.d * DAY <= t + TW && t + TW < (n.d + 1) * DAY)) return 'daily: 日序和伺服器時間不符';
    if (typeof n.n !== 'number' || n.n < 0 || n.n > 10) return 'daily: n 超出範圍（一天最多完成 10 個）';
    const same = o && o.d === n.d;
    if (same) {
      if (!(n.n === o.n || (n.n === o.n + 1 && t - o.at >= 10000))) return 'daily: n 只能加一，且兩次至少隔 10 秒';
      for (const k of Object.keys(n.picks)) if (o.picks && o.picks[k] != null && o.picks[k] !== n.picks[k]) return 'daily: 同一天不能換任務';
    } else if (n.n > 1) return 'daily: 換日後 n 最多 1';
    for (const k of Object.keys(n.picks)) if (!/^([0-9]|easy|mid|hard)$/.test(k)) return 'daily: picks 鍵不合法';
    for (const k of Object.keys(n.done || {})) {
      const had = same && o.done && o.done[k];
      if (!had && n.n !== (same ? o.n + 1 : 1)) return 'daily: 新完成的任務必須伴隨掉寶';
    }
    for (const k of Object.keys(n)) if (!['d', 'picks', 'n', 'at', 'done'].includes(k)) return 'daily: 多餘欄位 ' + k;
    return null;
  }
  // ---------- 規則：寶物 ----------
  const MAX = { cu: 5, ag: 3, au: 2, dia: 1, key: 1, dm: 1 };
  function checkBag(o, n, oldDaily, newDaily, t) {
    if (oldRules()) return 'bag: 舊規則沒有這個節點';
    if (!n) return 'bag: 不能刪除';
    if (!newDaily || newDaily.at !== t || !(newDaily.n >= 1)) return 'bag: 必須同時寫入每日任務';
    if (oldDaily && oldDaily.d === newDaily.d && newDaily.n !== oldDaily.n + 1) return 'bag: 每日任務次數必須加一';
    if (['cu', 'ag', 'au', 'dia', 'key'].filter(k => ((o && o[k]) ?? null) !== (n[k] ?? null)).length > 1) return 'bag: 一次最多一種寶物';
    for (const k of Object.keys(n)) {
      if (JSON.stringify(n[k]) === JSON.stringify(o && o[k])) continue; // 和正式規則一樣：只檢查有變動的欄位
      if (MAX[k] == null) return 'bag: 多餘欄位 ' + k;
      const prev = (o && o[k]) || 0;
      if (typeof n[k] !== 'number' || n[k] < prev || n[k] > prev + MAX[k]) return 'bag: ' + k + ' 增加超過上限';
    }
    return null;
  }

  window.LAB_MISSIONS_BACKEND = {
    onAuth(cb) { cbs.push(cb); setTimeout(() => cb(user), 5); },
    signIn() { user = { uid: localStorage.getItem('mocknext') || 'u1' }; localStorage.setItem('mockuser', user.uid); cbs.forEach(c => c(user)); return Promise.resolve(); },
    getProfile(uid) { return Promise.resolve(load().profiles[uid] || {}); },
    setNickname(uid, n) { const db = load(); (db.profiles[uid] = db.profiles[uid] || {}).nickname = n; save(db); return Promise.resolve(); },
    setPub(uid, p) { const db = load(); (db.profiles[uid] = db.profiles[uid] || {}).pub = p; save(db); return Promise.resolve(); },
    getDone(uid) { return Promise.resolve(load().completions[uid] || {}); },
    getScore(uid) { return Promise.resolve(load().scores[uid] || null); },
    getBonus(uid) { return Promise.resolve((load().bonus || {})[uid] || {}); },
    topUp(uid, mid, bonus, rec0) {
      const db = load(); db.bonus = db.bonus || {};
      if (!user || user.uid !== uid) return deny('bonus: 不是本人');
      const comp = (db.completions[uid] || {})[mid];
      const old = (db.bonus[uid] || {})[mid] || 0;
      if (!comp) return deny('bonus: 沒有完成紀錄');
      if (typeof bonus !== 'number' || !(bonus > old)) return deny('bonus: 只能增加');
      if (!db.missionDefs[mid] || comp.stars + bonus !== db.missionDefs[mid].stars) return deny('bonus: 完成紀錄 + 補發必須等於任務清單的星星數');
      const oldS = db.scores[uid] || null;
      if (!oldS) return deny('bonus: 沒有總分紀錄');
      const t = clock();
      const rec = Object.assign({}, rec0, { at: t });
      if (rec0.sa) { rec.sa = {}; Object.keys(rec0.sa).forEach(k => { rec.sa[k] = rec0.sa[k] === true ? t : rec0.sa[k]; }); }
      if (rec.last !== mid) return deny('bonus: 總分的 last 必須是這個任務');
      if (rec.stars !== oldS.stars + bonus - old) return deny('bonus: 總分必須剛好加上補發的差額');
      const why = checkScore(oldS, rec, t);
      if (why) return deny(why);
      (db.bonus[uid] = db.bonus[uid] || {})[mid] = bonus;
      db.scores[uid] = rec; save(db); return Promise.resolve();
    },
    complete(uid, mid, stars, name, pub, prev, sub) {
      const db = load(); const done = db.completions[uid] = db.completions[uid] || {};
      if (done[mid]) return deny('complete: 已完成');
      if (!db.missionDefs[mid] || db.missionDefs[mid].stars !== stars) return deny('complete: 任務清單不符');
      const old = db.scores[uid] || null;
      const cur = old ? old.stars : 0;
      if ((prev || 0) + stars !== cur + stars) return deny('complete: 總分基準不符');
      const t = clock();
      const rec = { stars: cur + stars, last: mid, name, pub, at: t };
      if (sub) {
        rec.s = Object.assign({}, sub.s);
        rec.sa = {};
        Object.keys(sub.sa).forEach(k => { rec.sa[k] = sub.sa[k] === true ? t : sub.sa[k]; });
      }
      const why = checkScore(old, rec, t);
      if (why) return deny(why);
      done[mid] = { stars, at: t };
      db.scores[uid] = rec; save(db); return Promise.resolve();
    },
    rename(uid, score, name, pub) { const db = load(); const s = db.scores[uid]; if (!s || s.stars !== score.stars || s.last !== score.last) return deny('rename'); s.name = name; s.pub = pub; save(db); return Promise.resolve(); },
    top(n, subj) {
      const db = load();
      const v = r => subj ? ((r.s && r.s[subj]) || null) : r.stars;
      // 和 Firebase 一樣：沒有這個欄位的排最前面（null 最小），取最後 n 筆
      const all = Object.keys(db.scores).map(k => Object.assign({ uid: k }, db.scores[k])).sort((a, b) => (v(a) == null ? -1 : v(a)) - (v(b) == null ? -1 : v(b)));
      const list = all.slice(-n);
      // 和正式版一樣：取滿 n 筆時，把邊界分數的同分者全部補進來（正式版用 equalTo 再查一次）
      if (list.length < n) return Promise.resolve(list);
      const edge = Math.min(...list.map(r => v(r) || 0));
      if (!(edge > 0)) return Promise.resolve(list);
      return Promise.resolve(list.concat(all.slice(0, -n).filter(r => v(r) === edge)));
    },
    countAbove(stars, subj) { const db = load(); return Promise.resolve(Object.values(db.scores).filter(s => (subj ? ((s.s && s.s[subj]) || -Infinity) : s.stars) >= stars + 1).length); },
    serverOffset() { return Promise.resolve(+localStorage.getItem('mockoffset') || 0); },
    syncDefs(defs) { if (!user || !load().admins[user.uid]) return deny('syncDefs'); if (Object.values(defs).some(v => !(v >= 1 && v <= 20))) return deny('syncDefs: 星星數必須是 1–20'); const db = load(); Object.keys(defs).forEach(k => db.missionDefs[k] = { stars: defs[k] }); save(db); return Promise.resolve(); },
    isAdmin(uid) { return Promise.resolve(!!load().admins[uid]); },
    get(path) {
      // 模擬讀取規則：個人資料只有本人能讀；整個集合（profiles、completions…）只有管理員能讀（11/14 管理頁）
      const ks = path.split('/'), PRIV = ['profiles', 'completions', 'bonus', 'userStats', 'achievements', 'daily', 'bag'];
      if (PRIV.includes(ks[0])) {
        const adm = user && load().admins[user.uid];
        if (ks.length === 1 && !adm) return deny(path + ': 只有管理員能讀整個集合');
        if (ks.length > 1 && !adm && (!user || ks[1] !== user.uid)) return deny(path + ': 不是本人');
      }
      return Promise.resolve(get(load(), path));
    },
    update(map) {
      const before = load(), db = load(), t = clock();
      const touched = { daily: {}, bag: {}, scores: {} };
      for (const [path, v0] of Object.entries(map)) {
        const ks = path.split('/');
        if (['daily', 'bag', 'userStats', 'achievements'].includes(ks[0]) && (!user || ks[1] !== user.uid)) return deny(path + ': 不是本人');
        let o = db;
        ks.slice(0, -1).forEach(k => { o[k] = o[k] || {}; o = o[k]; });
        const last = ks[ks.length - 1];
        if (ks[0] === 'achievements' && o[last]) return deny('achievements: 已解鎖');
        const v = resolveNow(v0, t);
        o[last] = (v && v.__inc != null) ? (o[last] || 0) + v.__inc : v;
        if (touched[ks[0]]) touched[ks[0]][ks[1]] = true;
      }
      for (const uid of Object.keys(touched.daily)) { const why = checkDaily(get(before, 'daily/' + uid), get(db, 'daily/' + uid), t); if (why) return deny(why); }
      for (const uid of Object.keys(touched.bag)) { const why = checkBag(get(before, 'bag/' + uid), get(db, 'bag/' + uid), get(before, 'daily/' + uid), get(db, 'daily/' + uid), t); if (why) return deny(why); }
      for (const uid of Object.keys(touched.scores)) { const why = checkScore(get(before, 'scores/' + uid), get(db, 'scores/' + uid), t); if (why) return deny(why); }
      save(db); window.__writes = (window.__writes || 0) + 1; return Promise.resolve();
    },
    inc(n) { return { __inc: n }; },
    now() { return { __now: NOW }; }
  };
  window.LAB_COMMENTS_BACKEND = { onAuth(cb) { cbs.push(cb); setTimeout(() => cb(user), 5); }, signIn() { return window.LAB_MISSIONS_BACKEND.signIn(); }, signOut() {}, getNickname: uid => Promise.resolve((load().profiles[uid] || {}).nickname || null), setNickname: (u, n) => window.LAB_MISSIONS_BACKEND.setNickname(u, n), isAdmin: uid => Promise.resolve(!!load().admins[uid]), watchComments(m, cb) { cb([]); }, watchReports(m, cb) { cb({}); }, post() { return Promise.resolve(); }, remove() { return Promise.resolve(); }, report() { return Promise.resolve(); } };
})();
