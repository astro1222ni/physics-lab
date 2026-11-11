/*
 * mock-backend.js — 測試用的假 Firebase（任務、成就、留言），只給 Playwright 用，網站本身不會載入。
 *
 * 用法（Playwright）：
 *   await context.addInitScript({ path: 'tools/mock-backend.js' });
 *   // 預先登入：await context.addInitScript(() => localStorage.setItem('mockuser', 'u1'));
 *   // 管理員：uid 'admin1'（localStorage 'mocknext' = 'admin1' 後按登入）
 * 資料存在 localStorage 'mdb'，並模擬資料庫規則：任務只能領一次、星星數必須等於 missionDefs、總分遞增正確。
 * 任務完成前要先同步任務清單：以管理員登入並打開任何實驗頁或排行榜頁（missions.js 會自動同步），
 * 或直接在 'mdb'.missionDefs 預先放入 { 任務代號: { stars: 等級 } }。
 */
(function () {
  const load = () => JSON.parse(localStorage.getItem('mdb') || 'null') || { profiles: {}, completions: {}, scores: {}, missionDefs: {}, admins: { admin1: true } };
  const save = db => localStorage.setItem('mdb', JSON.stringify(db));
  const cbs = [];
  let user = localStorage.getItem('mockuser') ? { uid: localStorage.getItem('mockuser') } : null;
  const deny = () => Promise.reject({ code: 'PERMISSION_DENIED' });
  window.LAB_MISSIONS_BACKEND = {
    onAuth(cb) { cbs.push(cb); setTimeout(() => cb(user), 5); },
    signIn() { user = { uid: localStorage.getItem('mocknext') || 'u1' }; localStorage.setItem('mockuser', user.uid); cbs.forEach(c => c(user)); return Promise.resolve(); },
    getProfile(uid) { return Promise.resolve(load().profiles[uid] || {}); },
    setNickname(uid, n) { const db = load(); (db.profiles[uid] = db.profiles[uid] || {}).nickname = n; save(db); return Promise.resolve(); },
    setPub(uid, p) { const db = load(); (db.profiles[uid] = db.profiles[uid] || {}).pub = p; save(db); return Promise.resolve(); },
    getDone(uid) { return Promise.resolve(load().completions[uid] || {}); },
    getScore(uid) { return Promise.resolve(load().scores[uid] || null); },
    complete(uid, mid, stars, name, pub, prev) {
      const db = load(); const done = db.completions[uid] = db.completions[uid] || {};
      if (done[mid]) return deny();
      if (!db.missionDefs[mid] || db.missionDefs[mid].stars !== stars) return deny();
      const cur = db.scores[uid] ? db.scores[uid].stars : 0;
      if ((prev || 0) + stars !== cur + stars) return deny();
      done[mid] = { stars, at: Date.now() };
      db.scores[uid] = { stars: cur + stars, last: mid, name, pub, at: Date.now() }; save(db); return Promise.resolve();
    },
    rename(uid, score, name, pub) { const db = load(); const s = db.scores[uid]; if (!s || s.stars !== score.stars || s.last !== score.last) return deny(); s.name = name; s.pub = pub; save(db); return Promise.resolve(); },
    top(n) { const db = load(); return Promise.resolve(Object.keys(db.scores).map(k => Object.assign({ uid: k }, db.scores[k])).sort((a, b) => a.stars - b.stars).slice(-n)); },
    countAbove(stars) { const db = load(); return Promise.resolve(Object.values(db.scores).filter(s => s.stars >= stars + 1).length); },
    syncDefs(defs) { if (!user || !load().admins[user.uid]) return deny(); const db = load(); Object.keys(defs).forEach(k => db.missionDefs[k] = { stars: defs[k] }); save(db); return Promise.resolve(); },
    isAdmin(uid) { return Promise.resolve(!!load().admins[uid]); },
    get(path) { const db = load(); return Promise.resolve(path.split('/').reduce((o, k) => (o == null ? null : o[k]), db) ?? null); },
    update(map) { const db = load(); for (const [path, v] of Object.entries(map)) { const ks = path.split('/'); let o = db; ks.slice(0, -1).forEach(k => { o[k] = o[k] || {}; o = o[k]; }); const last = ks[ks.length - 1];
      if (ks[0] === 'achievements' && o[last]) return Promise.reject({ code: 'PERMISSION_DENIED' });
      o[last] = (v && v.__inc != null) ? (o[last] || 0) + v.__inc : v; } save(db); window.__writes = (window.__writes || 0) + 1; return Promise.resolve(); },
    inc(n) { return { __inc: n }; },
    now() { return Date.now(); }
  };
  window.LAB_COMMENTS_BACKEND = { onAuth(cb) { cbs.push(cb); setTimeout(() => cb(user), 5); }, signIn() { return window.LAB_MISSIONS_BACKEND.signIn(); }, signOut() {}, getNickname: uid => Promise.resolve((load().profiles[uid] || {}).nickname || null), setNickname: (u, n) => window.LAB_MISSIONS_BACKEND.setNickname(u, n), isAdmin: uid => Promise.resolve(!!load().admins[uid]), watchComments(m, cb) { cb([]); }, watchReports(m, cb) { cb({}); }, post() { return Promise.resolve(); }, remove() { return Promise.resolve(); }, report() { return Promise.resolve(); } };
})();
