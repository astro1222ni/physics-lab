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

test('掉寶機率加總為 1，且都大於 0', () => {
  for (let lv = 1; lv <= 10; lv++) for (const s of [0, 10, 100, 1000, 5000]) {
    const p = C.table(lv, s, 5000);
    near(p.reduce((a, b) => a + b, 0), 1, 1e-12);
    p.forEach(x => assert.ok(x > 0));
  }
});

test('兩個端點：1 級沒有星星、10 級拿到全站所有星星', () => {
  const lo = C.table(1, 0, 500), hi = C.table(10, 500, 500);
  const n = a => { const s = a.reduce((x, y) => x + y, 0); return a.map(x => x / s); };
  n(C.W0).forEach((x, i) => near(lo[i], x, 1e-12, C.ITEMS[i].id));
  n(C.W1).forEach((x, i) => near(hi[i], x, 1e-12, C.ITEMS[i].id));
  near(lo[4], 0.002, 1e-12, '最低的鑰匙機率 0.2%');
  near(hi[4], 0.05, 1e-12, '最高的鑰匙機率 5%');
});

test('任務越難、星星越多，鑽石與鑰匙越容易掉、銅幣越少', () => {
  for (const s of [0, 50, 500, 3000]) for (let lv = 1; lv < 10; lv++) {
    const a = C.table(lv, s, 3000), b = C.table(lv + 1, s, 3000);
    assert.ok(b[3] > a[3] && b[4] > a[4] && b[0] < a[0], `等級 ${lv}→${lv + 1}，星星 ${s}`);
  }
  for (let lv = 1; lv <= 10; lv++) for (const [s1, s2] of [[0, 10], [10, 100], [100, 1000], [1000, 1999]]) {
    const a = C.table(lv, s1, 3000), b = C.table(lv, s2, 3000);
    assert.ok(b[3] > a[3] && b[4] > a[4] && b[0] < a[0], `星星 ${s1}→${s2}，等級 ${lv}`);
  }
});

test('星星加成 ＝ 玩家星星 ÷ 全站總星數：0 是 0、拿滿是 1、遞增；全站總星數變多時下降', () => {
  assert.strictEqual(C.starBoost(0, 500), 0);
  assert.strictEqual(C.starBoost(500, 500), 1);
  near(C.starBoost(125, 500), 0.25, 1e-12);
  assert.strictEqual(C.starBoost(1e6, 500), 1, '超過也只到 1');
  assert.strictEqual(C.starBoost(300, 0), 0, '全站總星數不明時不加成');
  assert.strictEqual(C.starBoost(300), 0);
  for (let s = 0; s < 500; s += 37) assert.ok(C.starBoost(s + 37, 500) > C.starBoost(s, 500));
  for (let t = 400; t < 2000; t += 100) assert.ok(C.starBoost(300, t + 100) < C.starBoost(300, t), '總星數 ' + t + '→' + (t + 100));
});

test('全站總星數：所有實驗的所有任務等級加總', () => {
  assert.strictEqual(C.siteStars({ a: [{ level: 3 }, { level: 10 }], b: [{ level: 1 }], c: [] }), 14);
  assert.strictEqual(C.siteStars(null), 0);
  // 隱藏任務的星星是等級的 2 倍
  assert.strictEqual(C.siteStars({ a: [{ level: 3 }, { level: 4, hidden: true }] }), 11);
});

test('每次完成的掉寶機率介於 27.5% 與 60% 之間，隨等級與星星遞增', () => {
  near(C.repeatChance(1, 0, 500), 0.25, 1e-12);
  near(C.repeatChance(10, 500, 500), 1, 1e-12);
  near(C.repeatChance(1, 500, 500), 0.5, 1e-12);
  near(C.repeatChance(10, 0, 500), 0.6, 1e-12);
  near(C.repeatChance(5, 250, 500), ((0.25 + 0.35 * 4 / 9) + (0.5 + 0.5 * 4 / 9)) / 2, 1e-12);
  for (let lv = 1; lv < 10; lv++) assert.ok(C.repeatChance(lv + 1, 100, 500) > C.repeatChance(lv, 100, 500));
  assert.ok(C.repeatChance(5, 200, 800) < C.repeatChance(5, 200, 400), '星星沒增加、全站總星數變多 → 機率下降');
});

test('sure = true 時一定掉寶，數量在範圍內', () => {
  const r = C.rng(42);
  for (let i = 0; i < 5000; i++) {
    const d = C.roll(1 + (i % 10), i, 5000, true, r);
    assert.ok(d, '一定掉');
    const it = C.ITEMS.find(x => x.id === d.item);
    assert.ok(d.qty >= it.min && d.qty <= it.max && Number.isInteger(d.qty), d.item + ' ×' + d.qty);
  }
});

test('抽樣分布符合機率表（蒙地卡羅，20 萬次）', () => {
  const r = C.rng(7);
  for (const [lv, s, t] of [[2, 0, 500], [9, 800, 1000]]) {
    const N = 200000, cnt = [0, 0, 0, 0, 0];
    let drops = 0;
    for (let i = 0; i < N; i++) { const d = C.roll(lv, s, t, false, r); if (d) { drops++; cnt[C.ITEMS.findIndex(x => x.id === d.item)]++; } }
    near(drops / N, C.repeatChance(lv, s, t), 0.005, '掉寶率');
    const p = C.table(lv, s, t);
    cnt.forEach((c, i) => near(c / drops, p[i], Math.max(0.004, p[i] * 0.08), C.ITEMS[i].id));
  }
});

test('數量跟運氣連動：運氣 0 偏少、運氣 1 偏多；鑽石與鑰匙固定 1 個', () => {
  // 運氣 0（1 級、沒有星星）：銅幣權重 5:4:3:2:1 → 平均 7/3；運氣 1（10 級、拿滿星星）倒過來 → 平均 11/3
  near(C.qtyMean('cu', 1, 0, 500), 7 / 3, 1e-12); near(C.qtyMean('cu', 10, 500, 500), 11 / 3, 1e-12);
  near(C.qtyMean('ag', 1, 0, 500), 5 / 3, 1e-12); near(C.qtyMean('ag', 10, 500, 500), 7 / 3, 1e-12);
  near(C.qtyMean('au', 1, 0, 500), 4 / 3, 1e-12); near(C.qtyMean('au', 10, 500, 500), 5 / 3, 1e-12);
  for (const id of ['dia', 'key']) for (const [lv, s] of [[1, 0], [10, 500]]) {
    assert.deepStrictEqual(C.qtyTable(id, lv, s, 500), [1]);
    assert.strictEqual(C.qtyMean(id, lv, s, 500), 1);
  }
  for (const id of ['cu', 'ag', 'au']) {
    for (let lv = 1; lv <= 10; lv++) near(C.qtyTable(id, lv, 200, 500).reduce((a, b) => a + b, 0), 1, 1e-12);
    for (let lv = 1; lv < 10; lv++) assert.ok(C.qtyMean(id, lv + 1, 200, 500) > C.qtyMean(id, lv, 200, 500), id + ' 等級 ' + lv);
    assert.ok(C.qtyMean(id, 5, 400, 500) > C.qtyMean(id, 5, 100, 500), id + ' 星星比例越高越多');
    assert.ok(C.qtyMean(id, 5, 200, 1000) < C.qtyMean(id, 5, 200, 400), id + ' 全站總星數變多、星星沒跟上 → 變少');
  }
});

test('抽樣的數量分布符合 qtyTable（蒙地卡羅）', () => {
  const r = C.rng(99);
  for (const [lv, s] of [[1, 0], [10, 500]]) {
    const cnt = {}, tot = {};
    for (let i = 0; i < 150000; i++) {
      const d = C.roll(lv, s, 500, true, r);
      const it = C.ITEMS.find(x => x.id === d.item);
      assert.ok(d.qty >= it.min && d.qty <= it.max, d.item + ' ×' + d.qty);
      (cnt[d.item] = cnt[d.item] || []); cnt[d.item][d.qty - it.min] = (cnt[d.item][d.qty - it.min] || 0) + 1; tot[d.item] = (tot[d.item] || 0) + 1;
    }
    for (const id of ['cu', 'ag']) C.qtyTable(id, lv, s, 500).forEach((p, j) => near((cnt[id][j] || 0) / tot[id], p, 0.02, id + ' ×' + (j + 1) + '（' + lv + ' 級）'));
    for (const id of ['dia', 'key']) if (tot[id]) assert.strictEqual(cnt[id].length, 1, id + ' 只會掉 1 個');
  }
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
