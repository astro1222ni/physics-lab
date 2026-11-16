/* 用完整任務引擎的公開介面驗證步驟記錄；不載入瀏覽器、不連線。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '../js/missions.js'), 'utf8');
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('通過：' + name); }
async function engine(opts = {}) {
  const store = opts.store || new Map(), auth = [];
  const backend = {
    onAuth(cb) { auth.push(cb); }, getProfile() { return Promise.resolve({}); }, getDone() { return Promise.resolve({}); }
  };
  const script = { getAttribute(name) { return name === 'src' ? 'js/missions.js' : name === 'data-module' ? (opts.mod || 'equipotential') : null; } };
  const document = { currentScript: script, readyState: 'loading', addEventListener() {}, querySelector() { return null; } };
  const window = { LAB_MISSIONS_BACKEND: backend };
  const localStorage = {
    getItem(key) { if (opts.blocked) throw new Error('儲存被封鎖'); return store.get(key) || null; },
    setItem(key, value) { if (opts.blocked) throw new Error('儲存被封鎖'); store.set(key, value); }
  };
  vm.runInNewContext(code, { window, document, localStorage, location: { search: '' }, URLSearchParams, setTimeout, clearTimeout, console });
  await Promise.resolve(); await Promise.resolve();
  const LM = window.LabMission;
  return { LM, store, login(uid) { auth[0](uid ? { uid } : null); }, plain(value) { return JSON.parse(JSON.stringify(value)); } };
}
(async () => {
  const e = await engine(); e.login('u1');
  check('初始步驟保留 0/7，未曾完成', () => {
    const r = e.LM.reportSteps(0, 7); assert.equal(r.done, 0); assert.equal(r.total, 7); assert.equal(r.complete, false);
  });
  check('最好步驟數只增不減', () => { e.LM.reportSteps(5, 7); e.LM.reportSteps(2, 7); assert.equal(e.LM.steps().done, 5); });
  const full = e.LM.reportSteps(7, 7);
  check('全數完成後重設仍保留完成與原時間', () => {
    e.LM.reportSteps(0, 7); e.LM.reportSteps(7, 7);
    assert.ok(full.completedAt > 0); assert.equal(e.LM.steps().completedAt, full.completedAt); assert.equal(e.LM.steps().complete, true);
  });
  check('不接受負數、小數、超出總數或無效總數', () => {
    for (const pair of [[-1, 7], [8, 7], [1.5, 7], [0, 0], [NaN, 7], [1, Infinity], ['7', 7]]) assert.equal(e.LM.reportSteps(...pair), null);
    assert.equal(e.LM.steps().done, 7);
  });
  const reload = await engine({ store: e.store }); reload.login('u1');
  check('重新載入能讀回本人與模組的步驟成績', () => { assert.equal(reload.LM.steps().done, 7); assert.equal(reload.LM.steps().completedAt, full.completedAt); });
  check('不同帳號各自保存，不搬移舊帳號成績', () => {
    e.login('u2'); assert.equal(e.LM.steps(), null); e.LM.reportSteps(1, 7);
    e.login('u1'); assert.equal(e.LM.steps().done, 7); e.login('u2'); assert.equal(e.LM.steps().done, 1);
  });
  const modes = await engine(); modes.login('u1'); modes.LM.reportSteps(5, 7); modes.LM.reportSteps(4, 4);
  check('不同總數分別保存，4/4 不會變成 7/7', () => {
    const r = modes.LM.steps(); assert.equal(r.done, 4); assert.equal(r.total, 4); assert.equal(r.bestDone, 5);
    assert.equal(r.versions.find(v => v.total === 7).done, 5); assert.equal(r.complete, true);
  });
  const memory = await engine({ blocked: true }); memory.login('u1');
  check('localStorage 完全不可用時仍保留分頁內最好成績', () => {
    memory.LM.reportSteps(5, 7); memory.LM.reportSteps(1, 7); assert.equal(memory.LM.steps().done, 5);
    memory.LM.reportSteps(7, 7); assert.equal(memory.LM.steps().complete, true);
  });
  const guestStore = new Map([['lab-procedure:guest:equipotential', JSON.stringify({ 7: { done: 7, completedAt: 100 } })]]);
  const guest = await engine({ store: guestStore }); guest.login(null); guest.LM.reportSteps(2, 7); guest.login('u1');
  check('登入只接續這次訪客操作，不搬移過去訪客最好成績', () => { assert.equal(guest.LM.steps().done, 2); assert.equal(guest.LM.steps().complete, false); });
  const pending = await engine(); pending.LM.reportSteps(3, 7); pending.login('u1');
  check('身分尚在確認期間的回報接到正確帳號', () => { assert.equal(pending.LM.steps().done, 3); });
  const corrupt = await engine({ store: new Map([['lab-procedure:u1:equipotential', '{壞掉的 JSON']]) }); corrupt.login('u1');
  check('毀損儲存不影響新回報', () => { corrupt.LM.reportSteps(1, 7); assert.equal(corrupt.LM.steps().done, 1); });
  console.log(checks + ' 項步驟記錄測試全部通過。');
})().catch(e => { console.error(e); process.exitCode = 1; });
