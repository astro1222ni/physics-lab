// 以 Node 執行：node tests/daily-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/daily-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function near(a, b, tol, msg) { assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b}，得到 ${a}（容許 ${tol}）`); }

// 臺灣 2026-11-12 00:00 = UTC 2026-11-11 16:00
const MID = Date.UTC(2026, 10, 11, 16, 0, 0);

test('換日在臺灣時間 00:00：前一毫秒是昨天、當下是今天', () => {
  const d = C.dayNumber(MID);
  assert.strictEqual(C.dayNumber(MID - 1), d - 1);
  assert.strictEqual(C.dayNumber(MID + C.DAY - 1), d);
  assert.strictEqual(C.dayNumber(MID + C.DAY), d + 1);
  assert.strictEqual(C.dayStart(d), MID);
});

test('臺灣日期與星期正確（2026-11-12 是星期四）', () => {
  const x = C.dateOf(C.dayNumber(MID + 5 * 3600000));
  assert.deepStrictEqual(x, { y: 2026, m: 11, d: 12, w: 4 });
  const y = C.dateOf(C.dayNumber(Date.UTC(2026, 11, 31, 15, 59, 59))); // 臺灣 12/31 23:59:59
  assert.deepStrictEqual([y.y, y.m, y.d], [2026, 12, 31]);
  const z = C.dateOf(C.dayNumber(Date.UTC(2026, 11, 31, 16, 0, 0))); // 臺灣 2027/1/1 00:00
  assert.deepStrictEqual([z.y, z.m, z.d], [2027, 1, 1]);
});

test('倒數到下一次換日', () => {
  assert.strictEqual(C.msToReset(MID), C.DAY);
  assert.strictEqual(C.msToReset(MID + C.DAY - 1), 1);
  assert.strictEqual(C.msToReset(MID - 1000), 1000);
});

// 假任務池：12 個實驗，每個實驗 1–10 級各一個
const pool = [];
for (let k = 0; k < 12; k++) for (let lv = 1; lv <= 10; lv++) pool.push({ id: 'mod' + k + '-' + lv, module: 'mod' + k, level: lv });

test('每天三個任務：簡單、中等、困難各一，來自三個不同實驗', () => {
  for (let day = 20000; day < 20400; day++) {
    const p = C.pick(pool, 'uid' + (day % 7), day);
    assert.strictEqual(p.length, 3);
    const ms = p.map(id => pool.find(m => m.id === id));
    assert.ok(ms[0].level >= 1 && ms[0].level <= 3, '簡單');
    assert.ok(ms[1].level >= 4 && ms[1].level <= 6, '中等');
    assert.ok(ms[2].level >= 7 && ms[2].level <= 10, '困難');
    assert.strictEqual(new Set(ms.map(m => m.module)).size, 3, '不同實驗');
  }
});

test('同一人同一天結果固定、與任務池順序無關；換一天或換一個人就不同', () => {
  const a = C.pick(pool, 'abc', 20500);
  const shuffled = pool.slice().reverse();
  assert.deepStrictEqual(C.pick(shuffled, 'abc', 20500), a);
  let diffDay = 0, diffUser = 0;
  for (let i = 1; i <= 30; i++) {
    if (C.pick(pool, 'abc', 20500 + i).join() !== a.join()) diffDay++;
    if (C.pick(pool, 'abc' + i, 20500).join() !== a.join()) diffUser++;
  }
  assert.ok(diffDay >= 28 && diffUser >= 28, `換日不同 ${diffDay}/30、換人不同 ${diffUser}/30`);
});

test('任務池只有一個實驗時仍能抽出三個；某個難度沒有任務時就少一個', () => {
  const one = pool.filter(m => m.module === 'mod0');
  assert.strictEqual(C.pick(one, 'x', 1).length, 3);
  const noHard = pool.filter(m => m.level <= 6);
  assert.strictEqual(C.pick(noHard, 'x', 1).length, 2);
});

test('長期來看每個任務都抽得到（均勻）', () => {
  const easy = pool.filter(m => m.level <= 3);
  const count = {};
  const N = 36000;
  for (let day = 0; day < N; day++) { const id = C.pick(pool, 'u', day)[0]; count[id] = (count[id] || 0) + 1; }
  const exp = N / easy.length;
  easy.forEach(m => near(count[m.id] || 0, exp, exp * 0.2, m.id));
});

test('掉寶機率加總為 1，且都大於 0', () => {
  for (let lv = 1; lv <= 10; lv++) for (const s of [0, 10, 100, 1000, 5000]) {
    const p = C.table(lv, s);
    near(p.reduce((a, b) => a + b, 0), 1, 1e-12);
    p.forEach(x => assert.ok(x > 0));
  }
});

test('兩個端點：1 級 0 顆星、10 級 2000 顆星', () => {
  const lo = C.table(1, 0), hi = C.table(10, 2000);
  const n = a => { const s = a.reduce((x, y) => x + y, 0); return a.map(x => x / s); };
  n(C.W0).forEach((x, i) => near(lo[i], x, 1e-12, C.ITEMS[i].id));
  n(C.W1).forEach((x, i) => near(hi[i], x, 1e-12, C.ITEMS[i].id));
  near(lo[4], 0.002, 1e-12, '最低的鑰匙機率 0.2%');
  near(hi[4], 0.05, 1e-12, '最高的鑰匙機率 5%');
});

test('任務越難、星星越多，鑽石與鑰匙越容易掉、銅幣越少', () => {
  for (const s of [0, 50, 500, 3000]) for (let lv = 1; lv < 10; lv++) {
    const a = C.table(lv, s), b = C.table(lv + 1, s);
    assert.ok(b[3] > a[3] && b[4] > a[4] && b[0] < a[0], `等級 ${lv}→${lv + 1}，星星 ${s}`);
  }
  for (let lv = 1; lv <= 10; lv++) for (const [s1, s2] of [[0, 10], [10, 100], [100, 1000], [1000, 1999]]) {
    const a = C.table(lv, s1), b = C.table(lv, s2);
    assert.ok(b[3] > a[3] && b[4] > a[4] && b[0] < a[0], `星星 ${s1}→${s2}，等級 ${lv}`);
  }
});

test('星星加成：0 顆是 0、2000 顆以上是 1、遞增', () => {
  assert.strictEqual(C.starBoost(0), 0);
  assert.strictEqual(C.starBoost(2000), 1);
  assert.strictEqual(C.starBoost(1e6), 1);
  for (let s = 0; s < 2000; s += 37) assert.ok(C.starBoost(s + 37) > C.starBoost(s));
});

test('重做掉寶機率介於 27.5% 與 60% 之間，隨等級與星星遞增', () => {
  near(C.repeatChance(1, 0), 0.275, 1e-12);
  near(C.repeatChance(10, 2000), 0.6, 1e-12);
  for (let lv = 1; lv < 10; lv++) assert.ok(C.repeatChance(lv + 1, 100) > C.repeatChance(lv, 100));
});

test('第一次完成一定掉寶，數量在範圍內', () => {
  const r = C.rng(42);
  for (let i = 0; i < 5000; i++) {
    const d = C.roll(1 + (i % 10), i, true, r);
    assert.ok(d, '一定掉');
    const it = C.ITEMS.find(x => x.id === d.item);
    assert.ok(d.qty >= it.min && d.qty <= it.max && Number.isInteger(d.qty), d.item + ' ×' + d.qty);
  }
});

test('抽樣分布符合機率表（蒙地卡羅，20 萬次）', () => {
  const r = C.rng(7);
  for (const [lv, s] of [[2, 0], [9, 800]]) {
    const N = 200000, cnt = [0, 0, 0, 0, 0];
    let drops = 0;
    for (let i = 0; i < N; i++) { const d = C.roll(lv, s, false, r); if (d) { drops++; cnt[C.ITEMS.findIndex(x => x.id === d.item)]++; } }
    near(drops / N, C.repeatChance(lv, s), 0.005, '重做掉寶率');
    const p = C.table(lv, s);
    cnt.forEach((c, i) => near(c / drops, p[i], Math.max(0.004, p[i] * 0.08), C.ITEMS[i].id));
  }
});

test('數量平均：銅幣 1–5 平均 3、銀幣 1–3 平均 2', () => {
  const r = C.rng(99);
  const sum = { cu: 0, ag: 0 }, n = { cu: 0, ag: 0 };
  for (let i = 0; i < 100000; i++) { const d = C.roll(1, 0, true, r); if (sum[d.item] != null) { sum[d.item] += d.qty; n[d.item]++; } }
  near(sum.cu / n.cu, 3, 0.05, '銅幣');
  near(sum.ag / n.ag, 2, 0.05, '銀幣');
});

test('難度分段', () => {
  assert.strictEqual(C.bandOf(1).id, 'easy');
  assert.strictEqual(C.bandOf(3).id, 'easy');
  assert.strictEqual(C.bandOf(4).id, 'mid');
  assert.strictEqual(C.bandOf(6).id, 'mid');
  assert.strictEqual(C.bandOf(7).id, 'hard');
  assert.strictEqual(C.bandOf(10).id, 'hard');
});

console.log(`${passed} 項測試通過`);
