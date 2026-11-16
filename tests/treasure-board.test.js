// 寶物排行純計算、模擬後端及正式規則的回歸測試；不連線外部服務。
'use strict';
const assert = require('assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const C = require('../js/daily-core.js');
const code = fs.readFileSync(path.join(__dirname, '../tools/mock-backend.js'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase/database.rules.json'), 'utf8')).rules.treasureBoard;
const NOW = Date.parse('2026-11-16T04:00:00Z');
const BAG = { cu: 5, ag: 4, au: 3, dia: 2, key: 1, dm: 4, used: { cu: 5, ag: 4, au: 3, dia: 2, key: 1 } };
const clone = x => JSON.parse(JSON.stringify(x));
function setup(board) {
  const db = { profiles: { u1: { nickname: 'NightOwl', pub: true } }, scores: { u1: { name: 'NightOwl', pub: true, stars: 3, last: 'projectile-3', at: NOW - 20000 } },
    completions: {}, missionDefs: {}, admins: {}, bag: { u1: clone(BAG) },
    daily: { u1: { d: C.dayNumber(NOW), n: 0, at: NOW - 20000, picks: ['projectile-1'] } }, treasureBoard: board ? { u1: board } : {} };
  const store = new Map([['mockuser', 'u1'], ['mdb', JSON.stringify(db)]]);
  const localStorage = { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)) };
  const window = { LabDailyCore: C };
  vm.runInNewContext(code, { window, localStorage, Date: { now: () => NOW }, setTimeout });
  return { api: window.LAB_MISSIONS_BACKEND, window, localStorage, before: db, read: () => JSON.parse(store.get('mdb')) };
}

// 執行實際 Firebase 規則字串，補足僅測模擬器無法發現規則路徑寫錯的缺口。
class Snapshot {
  constructor(tree, keys = []) { this.tree = tree; this.keys = keys; }
  val() { return this.keys.reduce((x, k) => x == null ? null : x[k], this.tree) ?? null; }
  child(key) { return new Snapshot(this.tree, this.keys.concat(key)); }
  parent() { return new Snapshot(this.tree, this.keys.slice(0, -1)); }
  exists() { return this.val() !== null; }
  isNumber() { return typeof this.val() === 'number'; }
  isString() { return typeof this.val() === 'string'; }
  isBoolean() { return typeof this.val() === 'boolean'; }
  hasChildren(keys) { return this.val() && typeof this.val() === 'object' && (keys ? keys.every(k => this.child(k).exists()) : Object.keys(this.val()).length > 0); }
}
function actualRulesAccept(before, after, uid = 'u1', authUid = 'u1', changedPaths) {
  const evaluate = (expr, keys, metric) => {
    if (typeof expr !== 'string') return expr;
    const text = expr.replace(/\$metric\.matches\((\/[^\n]+?\/)\)/g, '$1.test($metric)');
    return new Function('data', 'newData', 'root', 'auth', '$uid', '$metric', 'now', 'return ' + text)(
      new Snapshot(before, keys), new Snapshot(after, keys), new Snapshot(before), { uid: authUid }, uid, metric, NOW);
  };
  const keys = ['treasureBoard', uid], rec = after.treasureBoard[uid];
  if (!evaluate(rules.$uid['.write'], keys)) return false;
  function validate(node, at, metric) {
    // 部分路徑更新只套用受影響的子規則；祖先的整筆驗證仍必須執行。
    const current = at.join('/');
    if (changedPaths && !changedPaths.some(p => p === current || p.startsWith(current + '/') || current.startsWith(p + '/'))) return true;
    if (node['.validate'] !== undefined && !evaluate(node['.validate'], at, metric)) return false;
    const value = new Snapshot(after, at).val();
    if (!value || typeof value !== 'object') return true;
    return Object.keys(value).every(k => {
      if (node[k]) return validate(node[k], at.concat(k));
      const wildcard = Object.keys(node).find(n => n.startsWith('$') && n !== '$other');
      return wildcard ? validate(node[wildcard], at.concat(k), k) : node.$other ? validate(node.$other, at.concat(k)) : true;
    });
  }
  return !!rec && validate(rules.$uid, keys);
}
async function reject(e, map) {
  const before = e.localStorage.getItem('mdb');
  await assert.rejects(e.api.update(map), err => err.code === 'PERMISSION_DENIED');
  assert.strictEqual(e.localStorage.getItem('mdb'), before, '拒絕時不得寫入部分資料');
}
let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  ✓ ' + name); } catch (e) { process.exitCode = 1; console.error('  ✗ ' + name + '\n' + e.stack); } }
(async () => {
  await test('總價值為 12,345 銅；累計全用完也不扣除', () => {
    assert.deepStrictEqual(C.treasureTotals(BAG), { v: 12345, cu: 5, ag: 4, au: 3, dia: 2, key: 1 });
    assert.deepStrictEqual(C.treasureTotals(null), { v: 0, cu: 0, ag: 0, au: 0, dia: 0, key: 0 });
    assert.deepStrictEqual(rules['.indexOn'], C.TREASURE_METRICS);
    assert.strictEqual(C.treasureRecord(BAG, null, 'LegacyName', undefined, NOW).name, 'LegacyName', '舊帳號未設 pub 時預設公開');
  });
  await test('舊帳號缺榜時可補寫：正式規則及模擬器均接受', async () => {
    const e = setup(), record = C.treasureRecord(BAG, null, 'NightOwl', true, NOW);
    const after = clone(e.before); after.treasureBoard.u1 = record;
    assert.ok(actualRulesAccept(e.before, after));
    await e.api.update({ 'treasureBoard/u1': record });
    assert.ok(C.treasureMatches(e.read().treasureBoard.u1, BAG, 'NightOwl', true));
  });
  await test('新掉寶把 bag、dm、每日紀錄與公開榜一次寫入', async () => {
    const old = C.treasureRecord(BAG, null, 'NightOwl', true, NOW - 20000), e = setup(old);
    const next = { ...BAG, cu: BAG.cu + 5, ag: BAG.ag + 3, au: BAG.au + 2, dia: BAG.dia + 1, key: BAG.key + 1 };
    const record = C.treasureRecord(next, old, 'NightOwl', true, NOW);
    const map = { 'daily/u1/n': 1, 'daily/u1/at': e.api.now(), 'daily/u1/done/projectile-1': true, 'bag/u1/dm': e.api.inc(1), 'treasureBoard/u1': record };
    for (const [k, n] of Object.entries({ cu: 5, ag: 3, au: 2, dia: 1, key: 1 })) map['bag/u1/' + k] = e.api.inc(n);
    const after = clone(e.before); after.bag.u1 = next; after.treasureBoard.u1 = record;
    assert.ok(actualRulesAccept(e.before, after)); await e.api.update(map);
    assert.strictEqual(e.window.__writes, 1); assert.strictEqual(e.read().bag.u1.dm, 5);
    assert.strictEqual(e.read().treasureBoard.u1.v, C.treasureTotals(next).v);
  });
  for (const key of ['cu', 'ag', 'au', 'dia', 'key', 'v', 'extra', 'name', 'pub', 'at']) await test('拒絕竄改 ' + key + '，正式規則與模擬器一致', async () => {
    const e = setup(), row = C.treasureRecord(BAG, null, 'NightOwl', true, NOW);
    if (key === 'extra') row.extra = 1;
    else if (key === 'name') row.name = '';
    else if (key === 'pub') row.pub = 'false';
    else row[key] += 1;
    const after = clone(e.before); after.treasureBoard.u1 = row;
    assert.strictEqual(actualRulesAccept(e.before, after), false);
    await reject(e, { 'treasureBoard/u1': row });
  });
  await test('不能改別人的公開榜，且寶物袋仍只有本人可讀', async () => {
    const e = setup(), row = C.treasureRecord(BAG, null, 'NightOwl', true, NOW);
    const after = clone(e.before); after.treasureBoard.other = row;
    assert.strictEqual(actualRulesAccept(e.before, after, 'other'), false);
    await reject(e, { 'treasureBoard/other': row });
    await assert.rejects(e.api.get('bag/other'), err => err.code === 'PERMISSION_DENIED');
    assert.deepStrictEqual(clone(await e.api.get('treasureBoard')), {});
  });
  await test('達到時間不可倒填；未變動項目的時間不可更新', async () => {
    for (const mode of ['backdate', 'future', 'extra', 'missing', 'reset']) {
      const old = C.treasureRecord(BAG, null, 'NightOwl', true, NOW - 20000), e = setup(mode === 'reset' ? old : null);
      const row = C.treasureRecord(BAG, mode === 'reset' ? old : null, 'NightOwl', true, NOW);
      if (mode === 'backdate') row.ta.cu = NOW - 1;
      if (mode === 'future') row.ta.cu = NOW + 1;
      if (mode === 'extra') row.ta.extra = NOW;
      if (mode === 'missing') delete row.ta.cu;
      if (mode === 'reset') row.ta.cu = NOW;
      const after = clone(e.before); after.treasureBoard.u1 = row;
      assert.strictEqual(actualRulesAccept(e.before, after), false, mode);
      await reject(e, { 'treasureBoard/u1': row });
    }
  });
  await test('暱稱與不公開設定同時同步兩個榜，原有達到時間保留', async () => {
    const old = C.treasureRecord(BAG, null, 'NightOwl', true, NOW - 20000), e = setup(old);
    await C.updateTreasureProfile(e.api, 'u1', { nickname: 'SecretExplorer', pub: false });
    const db = e.read(), name = C.treasureName('SecretExplorer', false);
    assert.strictEqual(db.profiles.u1.nickname, 'SecretExplorer'); assert.strictEqual(db.profiles.u1.pub, false);
    assert.strictEqual(db.scores.u1.name, name); assert.strictEqual(db.scores.u1.pub, false);
    assert.strictEqual(db.treasureBoard.u1.name, name); assert.strictEqual(db.treasureBoard.u1.pub, false);
    assert.deepStrictEqual(db.treasureBoard.u1.ta, old.ta); assert.strictEqual(db.scores.u1.at, NOW - 20000);
    assert.ok(actualRulesAccept(e.before, db)); assert.strictEqual(e.window.__writes, 1);
  });
  await test('補正不一致紀錄，已一致的紀錄不需要再寫', async () => {
    const wrong = C.treasureRecord(BAG, null, 'NightOwl', true, NOW - 20000); wrong.cu = 2;
    assert.ok(!C.treasureMatches(wrong, BAG, 'NightOwl', true));
    const e = setup(wrong), row = C.treasureRecord(BAG, wrong, 'NightOwl', true, NOW);
    await e.api.update({ 'treasureBoard/u1': row });
    assert.ok(C.treasureMatches(row, BAG, 'NightOwl', true));
    assert.strictEqual(row.ta.cu, NOW); assert.strictEqual(row.ta.key, NOW - 20000);
  });
  await test('各榜同分同名次，依自己的達到時間排序，不受其他項目及改名時間影響', () => {
    const a = { uid: 'z', ...C.treasureRecord(BAG, null, 'A', true, 100) }, b = { uid: 'a', ...C.treasureRecord(BAG, null, 'B', true, 200) };
    const updated = C.treasureRecord({ ...BAG, cu: 6 }, a, 'Renamed', true, 300);
    const diamond = C.rankTreasures([b, { uid: 'z', ...updated }], 'dia');
    assert.deepStrictEqual(diamond.map(r => r.uid), ['z', 'a']); assert.deepStrictEqual(diamond.map(r => r.rank), [1, 1]);
    assert.deepStrictEqual(C.rankTreasures([a, b, { uid: 'c', ...C.treasureRecord({ cu: 1 }, null, 'C', true, 1) }], 'v').map(r => r.rank), [1, 1, 3]);
  });
  await test('第 100 名邊界同分補齊，自己的名次可在 100 名外', async () => {
    const e = setup(), db = e.read();
    for (let i = 0; i < 120; i++) db.treasureBoard['u' + String(i).padStart(3, '0')] = C.treasureRecord({ cu: i < 99 ? 20 : 10 }, null, 'P', true, 100 + i);
    db.treasureBoard.zEarliest = C.treasureRecord({ cu: 10 }, null, 'First', true, 1);
    e.localStorage.setItem('mdb', JSON.stringify(db));
    const sorted = C.rankTreasures(await e.api.topTreasures(100, 'cu'), 'cu').slice(0, 100);
    assert.strictEqual(sorted[99].uid, 'zEarliest'); assert.strictEqual(await e.api.countTreasureAbove(5, 'cu') + 1, 122);
  });
  await test('部分更新不能漏掉寶物袋一致性檢查', async () => {
    const stale = C.treasureRecord({ cu: 1 }, null, 'NightOwl', true, NOW - 20000), e = setup(stale);
    const after = clone(e.before); after.treasureBoard.u1.name = 'Renamed'; after.treasureBoard.u1.at = NOW;
    const paths = ['treasureBoard/u1/name', 'treasureBoard/u1/at'];
    assert.strictEqual(actualRulesAccept(e.before, after, 'u1', 'u1', paths), false);
    await reject(e, { 'treasureBoard/u1/name': 'Renamed', 'treasureBoard/u1/at': NOW });
  });
  await test('補寫新的累計量時，部分更新也不能沿用較早的達到時間', async () => {
    const previousBag = { ...BAG, cu: 4 }, stale = C.treasureRecord(previousBag, null, 'NightOwl', true, NOW - 20000), e = setup(stale);
    const after = clone(e.before); after.treasureBoard.u1 = { ...stale, ...C.treasureTotals(BAG), at: NOW };
    const paths = ['treasureBoard/u1/cu', 'treasureBoard/u1/v', 'treasureBoard/u1/at'];
    assert.strictEqual(actualRulesAccept(e.before, after, 'u1', 'u1', paths), false);
    await reject(e, { 'treasureBoard/u1/cu': 5, 'treasureBoard/u1/v': 12345, 'treasureBoard/u1/at': NOW });
  });
  await test('讀寫之間個人設定已改變時，拒絕舊暱稱或舊公開設定', async () => {
    for (const changes of [{ nickname: 'LatestName' }, { pub: false }]) {
      const e = setup(), db = e.read(); db.profiles.u1 = { ...db.profiles.u1, ...changes }; e.localStorage.setItem('mdb', JSON.stringify(db));
      const row = C.treasureRecord(BAG, null, 'NightOwl', true, NOW), after = clone(db); after.treasureBoard.u1 = row;
      assert.strictEqual(actualRulesAccept(db, after), false);
      await reject(e, { 'treasureBoard/u1': row });
    }
  });
  console.log(passed + ' 項測試通過');
})();
