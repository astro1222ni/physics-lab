// 以真正的模擬後端核對原子寫入、舊版相容性及各欄上限，不連線 Firebase。
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const C = require('../js/daily-core.js');
const source = fs.readFileSync(path.join(__dirname, '../tools/mock-backend.js'), 'utf8');
const caps = { cu: 5, ag: 3, au: 2, dia: 1, key: 1, dm: 1 };
const time = Date.parse('2026-11-16T04:00:00Z');

function setup(bag = { cu: 20, ag: 8, au: 3, dia: 2, key: 1, dm: 9 }) {
  const db = { profiles: {}, completions: {}, scores: {}, missionDefs: {}, admins: {},
    daily: { u1: { d: C.dayNumber(time), picks: ['projectile-1'], n: 0, at: time - 20000 } }, bag: { u1: bag } };
  const values = new Map([['mdb', JSON.stringify(db)], ['mockuser', 'u1']]);
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, String(value)) };
  const window = {};
  vm.runInNewContext(source, { window, localStorage: storage, Date: { now: () => time }, setTimeout });
  const api = window.LAB_MISSIONS_BACKEND;
  const map = { 'daily/u1/n': 1, 'daily/u1/at': api.now(), 'daily/u1/done/projectile-1': true, 'bag/u1/dm': api.inc(1) };
  return { api, map, storage, window, read: () => JSON.parse(storage.getItem('mdb')) };
}

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { process.exitCode = 1; console.error('  ✗ ' + name + '\n    ' + e.stack); }
}
async function rejectedWithoutWrite(env, map) {
  const before = env.storage.getItem('mdb');
  await assert.rejects(env.api.update(map), e => e.code === 'PERMISSION_DENIED');
  assert.strictEqual(env.storage.getItem('mdb'), before, '拒絕時不可留下每日紀錄或部分寶物');
  assert.strictEqual(env.window.__writes || 0, 0);
}

(async () => {
  await test('五種寶物及 dm 同時加到上限，一次原子寫入成功', async () => {
    const e = setup();
    Object.keys(caps).forEach(k => { e.map['bag/u1/' + k] = e.api.inc(caps[k]); });
    await e.api.update(e.map);
    assert.deepStrictEqual(e.read().bag.u1, { cu: 25, ag: 11, au: 5, dia: 3, key: 2, dm: 10 });
    assert.strictEqual(e.read().daily.u1.n, 1);
    assert.strictEqual(e.read().daily.u1.done['projectile-1'], true);
    assert.strictEqual(e.window.__writes, 1);
  });
  await test('空寶物袋也可一次新增五種', async () => {
    const e = setup({});
    Object.keys(caps).forEach(k => { e.map['bag/u1/' + k] = e.api.inc(caps[k]); });
    await e.api.update(e.map);
    assert.deepStrictEqual(e.read().bag.u1, caps);
  });
  await test('舊版相容：每次只加一種，或只記 dm，都仍可寫入', async () => {
    for (const item of [null, 'cu', 'ag', 'au', 'dia', 'key']) {
      const e = setup();
      if (item) e.map['bag/u1/' + item] = e.api.inc(caps[item]);
      await e.api.update(e.map);
      assert.strictEqual(e.window.__writes, 1);
    }
  });
  for (const item of Object.keys(caps)) await test(item + ' 超過原本單次上限時，整筆拒絕', async () => {
    const e = setup(); e.map['bag/u1/' + item] = e.api.inc(caps[item] + 1);
    await rejectedWithoutWrite(e, e.map);
  });
  await test('持有數不可減少、不可寫字串或額外欄位', async () => {
    for (const [item, value] of [['cu', -1], ['ag', '9'], ['surprise', 1]]) {
      const e = setup(); e.map['bag/u1/' + item] = value;
      await rejectedWithoutWrite(e, e.map);
    }
  });
  await test('寶物必須伴隨每日完成次數加一；只改寶物或只換時間均拒絕', async () => {
    const e = setup(); await rejectedWithoutWrite(e, { 'bag/u1/cu': e.api.inc(1) });
    const f = setup(); await rejectedWithoutWrite(f, { 'daily/u1/at': f.api.now(), 'bag/u1/cu': f.api.inc(1) });
  });
  await test('不能寫其他帳號的寶物', async () => {
    const e = setup(); e.map['bag/other/cu'] = e.api.inc(1);
    await rejectedWithoutWrite(e, e.map);
  });
  await test('正式規則僅移除單種限制，各欄上限與只增不減仍有效', () => {
    const bag = JSON.parse(fs.readFileSync(path.join(__dirname, '../firebase/database.rules.json'), 'utf8')).rules.bag.$uid;
    assert.strictEqual(bag['.validate'], undefined);
    assert.match(bag['.write'], /child\('daily'\)/);
    for (const [item, cap] of Object.entries(caps)) {
      const validate = new Function('data', 'newData', 'return ' + bag[item]['.validate']);
      const snap = value => ({ exists: () => value !== null, val: () => value, isNumber: () => typeof value === 'number' });
      assert.ok(validate(snap(null), snap(cap)), item + ' 新增上限');
      assert.ok(validate(snap(10), snap(10 + cap)), item + ' 累計上限');
      assert.ok(!validate(snap(10), snap(11 + cap)), item + ' 不得超過');
      assert.ok(!validate(snap(10), snap(9)), item + ' 不得減少');
    }
  });
  console.log(passed + ' 項測試通過');
})();
