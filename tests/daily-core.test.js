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

test('每天十個任務：簡單 4、中等 3、困難 3，依難度排列，來自十個不同實驗、任務不重複', () => {
  assert.strictEqual(C.PER_DAY, 10);
  for (let day = 20000; day < 20400; day++) {
    const p = C.pick(pool, 'uid' + (day % 7), day);
    assert.strictEqual(p.length, 10);
    const ms = p.map(id => pool.find(m => m.id === id));
    ms.slice(0, 4).forEach(m => assert.ok(m.level >= 1 && m.level <= 3, '簡單'));
    ms.slice(4, 7).forEach(m => assert.ok(m.level >= 4 && m.level <= 6, '中等'));
    ms.slice(7).forEach(m => assert.ok(m.level >= 7 && m.level <= 10, '困難'));
    assert.strictEqual(new Set(ms.map(m => m.module)).size, 10, '不同實驗');
    assert.strictEqual(new Set(p).size, 10, '任務不重複');
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

test('實驗不夠十個時，同一個實驗可以出現兩次但任務不重複；某個難度任務不夠就少抽', () => {
  const one = pool.filter(m => m.module === 'mod0');
  const p1 = C.pick(one, 'x', 1);
  assert.strictEqual(p1.length, 9, '一個實驗只有 3 個簡單任務：3 + 3 + 3');
  assert.strictEqual(new Set(p1).size, 9);
  const noHard = pool.filter(m => m.level <= 6);
  assert.strictEqual(C.pick(noHard, 'x', 1).length, 7, '沒有困難任務：4 + 3');
  const few = pool.filter(m => m.module === 'mod0' && m.level <= 4);
  assert.strictEqual(C.pick(few, 'x', 1).length, 4, '簡單只有 3 個、中等 1 個');
});

test('換版保留今天已抽到的任務，再補滿到十個', () => {
  const keep = ['mod3-2', 'mod5-5', 'mod7-9'];
  for (let day = 21000; day < 21050; day++) {
    const p = C.pick(pool, 'k', day, keep);
    assert.strictEqual(p.length, 10);
    keep.forEach(id => assert.ok(p.includes(id), '保留 ' + id));
    const ms = p.map(id => pool.find(m => m.id === id));
    assert.strictEqual(ms.filter(m => m.level <= 3).length, 4);
    assert.strictEqual(ms.filter(m => m.level >= 7).length, 3);
    assert.strictEqual(new Set(p).size, 10);
  }
});

test('長期來看每個任務都抽得到（均勻）', () => {
  const easy = pool.filter(m => m.level <= 3);
  const count = {};
  const N = 36000;
  for (let day = 0; day < N; day++) { const id = C.pick(pool, 'u', day)[0]; count[id] = (count[id] || 0) + 1; }
  const exp = N / easy.length;
  easy.forEach(m => near(count[m.id] || 0, exp, exp * 0.2, m.id));
});

test('1、5、10 級機率符合公式，五種獨立機率不必加總為 1', () => {
  for (const [lv, expected] of [[1, [1, .30, .10, .02, .005]], [5, [1, 13 / 30, .18, 23 / 450, 11 / 600]], [10, [1, .60, .28, .09, .035]]]) {
    C.dropChances(lv).forEach((p, i) => near(p, expected[i], 1e-12, lv + ' 級 ' + C.ITEMS[i].id));
  }
  for (let lv = 1; lv <= 10; lv++) {
    const p = C.dropChances(lv);
    assert.strictEqual(p[0], 1);
    for (let i = 1; i < 5; i++) assert.ok(p[i] > 0 && p[i] < p[i - 1], '越稀有越難掉');
    if (lv < 10) C.dropChances(lv + 1).slice(1).forEach((x, i) => assert.ok(x > p[i + 1]));
  }
});

test('等級邊界：超出範圍限在 1–10，無效值當作 1 級', () => {
  for (const lv of [0, -4, NaN, undefined]) assert.deepStrictEqual(C.dropChances(lv), C.dropChances(1));
  for (const lv of [11, 100]) assert.deepStrictEqual(C.dropChances(lv), C.dropChances(10));
});

test('銅幣必掉；同次可五種全掉，依銅銀金鑽鑰排序且數量不超過上限', () => {
  assert.deepStrictEqual(C.roll(1, () => 0), C.ITEMS.map(it => ({ item: it.id, qty: 1 })));
  const solo = [0, .999999, .999999, .999999, .999999, .999999];
  assert.deepStrictEqual(C.roll(10, () => solo.shift()), [{ item: 'cu', qty: 5 }]);
  const hi = [0, .999999, 0, .999999, 0, .999999, 0, .999999, 0, .999999];
  assert.deepStrictEqual(C.roll(10, () => hi.shift()), C.ITEMS.map(it => ({ item: it.id, qty: it.max })));
  const rand = C.rng(42);
  for (let n = 0; n < 10000; n++) {
    const drops = C.roll(1 + n % 10, rand);
    assert.ok(drops.length >= 1 && drops.length <= 5);
    assert.strictEqual(drops[0].item, 'cu');
    assert.strictEqual(new Set(drops.map(x => x.item)).size, drops.length);
    drops.forEach(drop => {
      const it = C.ITEMS.find(x => x.id === drop.item);
      assert.ok(Number.isInteger(drop.qty) && drop.qty >= it.min && drop.qty <= it.max);
    });
  }
});

test('機率界線：亂數等於機率時不掉，前面未掉仍可掉鑽石與鑰匙', () => {
  for (const lv of [1, 5, 10]) {
    const p = C.dropChances(lv), rolls = [0, 0, ...p.slice(1)];
    assert.deepStrictEqual(C.roll(lv, () => rolls.shift()), [{ item: 'cu', qty: 1 }]);
    const rareOnly = [0, 0, .999999, .999999, 0, 0, 0, 0];
    assert.deepStrictEqual(C.roll(lv, () => rareOnly.shift()).map(x => x.item), ['cu', 'dia', 'key']);
  }
});

test('獨立性：三個等級各 20 萬次，頻率誤差在 1 個百分點內，聯合機率符合乘積', () => {
  for (const lv of [1, 5, 10]) {
    const rand = C.rng(111600 + lv), N = 200000, counts = [0, 0, 0, 0, 0];
    const pairs = Array.from({ length: 5 }, () => Array(5).fill(0));
    for (let n = 0; n < N; n++) {
      const seen = new Set(C.roll(lv, rand).map(x => x.item));
      C.ITEMS.forEach((it, i) => {
        if (!seen.has(it.id)) return;
        counts[i]++;
        C.ITEMS.forEach((jt, j) => { if (seen.has(jt.id)) pairs[i][j]++; });
      });
    }
    const p = C.dropChances(lv);
    counts.forEach((count, i) => near(count / N, p[i], .01, lv + ' 級 ' + C.ITEMS[i].id));
    for (let i = 1; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      near(pairs[i][j] / N, p[i] * p[j], .003, lv + ' 級 ' + C.ITEMS[i].id + ' 與 ' + C.ITEMS[j].id);
    }
    assert.strictEqual(counts[0], N);
  }
});

test('數量權重及平均數固定，不隨等級改變', () => {
  const weights = { cu: [5, 4, 3, 2, 1], ag: [3, 2, 1], au: [2, 1], dia: [1], key: [1] };
  C.ITEMS.forEach(it => {
    const w = weights[it.id], sum = w.reduce((a, b) => a + b, 0);
    assert.deepStrictEqual(C.qtyTable(it.id), w.map(x => x / sum));
    assert.strictEqual(C.qtyTable(it.id).length, it.max - it.min + 1);
  });
  near(C.qtyMean('cu'), 7 / 3, 1e-12); near(C.qtyMean('ag'), 5 / 3, 1e-12); near(C.qtyMean('au'), 4 / 3, 1e-12);
  assert.strictEqual(C.qtyMean('dia'), 1); assert.strictEqual(C.qtyMean('key'), 1);
});

test('抽樣數量符合固定權重：1 級及 10 級各 20 萬次，誤差在 1 個百分點內', () => {
  for (const lv of [1, 10]) {
    const rand = C.rng(991116 + lv), counts = {}, totals = {};
    for (let n = 0; n < 200000; n++) C.roll(lv, rand).forEach(drop => {
      counts[drop.item] = counts[drop.item] || Array(5).fill(0);
      counts[drop.item][drop.qty - 1]++;
      totals[drop.item] = (totals[drop.item] || 0) + 1;
    });
    C.ITEMS.forEach(it => C.qtyTable(it.id).forEach((p, j) => near(counts[it.id][j] / totals[it.id], p, .01, lv + ' 級 ' + it.id + ' ×' + (j + 1))));
  }
});

test('和星星無關：同等級不同星星與全站總星數，使用相同亂數結果完全相同', () => {
  for (const lv of [1, 5, 10]) {
    const samples = [[0, 500], [125, 500], [500, 500], [500, 50000]].map(([stars, total]) => {
      const rand = C.rng(1611 + lv);
      // 新介面只取等級與亂數；額外的舊星星資料也不能改變掉落及數量。
      assert.deepStrictEqual(C.dropChances(lv, stars, total), C.dropChances(lv));
      C.ITEMS.forEach(it => assert.deepStrictEqual(C.qtyTable(it.id, lv, stars, total), C.qtyTable(it.id)));
      return Array.from({ length: 2000 }, () => C.roll(lv, rand, stars, total));
    });
    samples.slice(1).forEach(sample => assert.deepStrictEqual(sample, samples[0]));
  }
});

test('星星比例與總星數保留給統計，隱藏任務的星星加倍', () => {
  assert.strictEqual(C.starBoost(0, 500), 0); assert.strictEqual(C.starBoost(500, 500), 1);
  near(C.starBoost(125, 500), .25, 1e-12);
  assert.strictEqual(C.starBoost(1e6, 500), 1); assert.strictEqual(C.starBoost(300, 0), 0);
  assert.strictEqual(C.siteStars({ a: [{ level: 3 }, { level: 10 }], b: [{ level: 1 }], c: [] }), 14);
  assert.strictEqual(C.siteStars(null), 0);
  assert.strictEqual(C.siteStars({ a: [{ level: 3 }, { level: 4, hidden: true }] }), 11);
});

test('持有數：現在剩下 = 累計獲得 − 已使用，不會小於 0', () => {
  const h = C.holdings({ cu: 12, ag: 3, au: 1, dia: 0, dm: 7, used: { cu: 5, ag: 9 } });
  assert.deepStrictEqual(h.map(x => x.id), ['cu', 'ag', 'au', 'dia', 'key']);
  assert.deepStrictEqual(h.map(x => [x.total, x.used, x.left]), [[12, 5, 7], [3, 3, 0], [1, 0, 1], [0, 0, 0], [0, 0, 0]]);
  assert.deepStrictEqual(C.holdings(null).map(x => x.left), [0, 0, 0, 0, 0]);
  assert.deepStrictEqual(C.holdings({ cu: -3, ag: 'x', au: 2.7 }).map(x => x.total), [0, 0, 2, 0, 0]);
});

test('寶物圖示五種都有，漸層代號不重複', () => {
  const svgs = C.ITEMS.map(it => C.icon(it.id));
  svgs.forEach((x, i) => assert.ok(/^<svg[\s\S]*<\/svg>$/.test(x), C.ITEMS[i].id));
  const ids = svgs.join('').match(/id="[^"]+"/g);
  assert.strictEqual(new Set(ids).size, ids.length);
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
