/*
 * daily-core.js — 每日任務的核心計算（與畫面分離，Node 單元測試：tests/daily-core.test.js）
 *
 *   - 換日：一律以臺灣時間（UTC+8）凌晨 00:00 為界，用伺服器時間計算，改本機時鐘沒有用。
 *   - 每天三個每日任務：簡單（1–3 級）、中等（4–6 級）、困難（7–10 級），從現有的一般任務抽出（不含隱藏任務），
 *     同一個人同一天結果固定，三個盡量來自不同實驗。
 *   - 掉寶：銅幣、銀幣、金幣、鑽石、稀有鑰匙。今天第一次完成某個每日任務一定掉一件；
 *     當天重做，每次完成有機率再掉。任務等級越高、累積的星星越多，稀有寶物的機率越高。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LabDailyCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;
  const TW = 8 * 3600000; // 臺灣時間 = UTC + 8 小時（沒有日光節約時間）

  /** 臺灣時間的日序（自 1970-01-01 起第幾天）；每天 00:00 加一 */
  function dayNumber(ms) { return Math.floor((ms + TW) / DAY); }
  /** 第 d 天臺灣時間 00:00 的 UTC 毫秒 */
  function dayStart(d) { return d * DAY - TW; }
  /** 距離下一次換日（臺灣時間 00:00）還有幾毫秒 */
  function msToReset(ms) { return dayStart(dayNumber(ms) + 1) - ms; }
  /** 第 d 天的臺灣日期：{ y, m, d, w（0 = 星期日） } */
  function dateOf(d) {
    const t = new Date(dayStart(d) + TW);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay() };
  }

  // ---------- 可重現的亂數：FNV-1a 雜湊 + mulberry32 ----------
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 每天三個任務 ----------
  const BANDS = [
    { id: 'easy', min: 1, max: 3, zh: '簡單', en: 'Easy' },
    { id: 'mid', min: 4, max: 6, zh: '中等', en: 'Medium' },
    { id: 'hard', min: 7, max: 10, zh: '困難', en: 'Hard' }
  ];
  function bandOf(level) {
    for (let i = 0; i < BANDS.length; i++) if (level >= BANDS[i].min && level <= BANDS[i].max) return BANDS[i];
    return BANDS[0];
  }
  /**
   * pool：[{ id, module, level }]（呼叫端先排除隱藏任務）。回傳三個任務代號（依簡單、中等、困難）。
   * 同一個 uid、同一天結果固定；先依代號排序，所以和載入順序無關。
   */
  function pick(pool, uid, day) {
    const r = rng(hash(String(uid) + ':' + day));
    const sorted = pool.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    const used = {}, out = [];
    BANDS.forEach(function (b) {
      const inBand = sorted.filter(function (m) { return m.level >= b.min && m.level <= b.max; });
      let c = inBand.filter(function (m) { return !used[m.module]; });
      if (!c.length) c = inBand;
      if (!c.length) return;
      const m = c[Math.floor(r() * c.length)];
      used[m.module] = true;
      out.push(m.id);
    });
    return out;
  }

  // ---------- 掉寶 ----------
  // sym：銅、銀、金用元素符號；鑽石是碳（C）的晶體
  const ITEMS = [
    { id: 'cu', zh: '銅幣', en: 'Copper coin', sym: 'Cu', min: 1, max: 5 },
    { id: 'ag', zh: '銀幣', en: 'Silver coin', sym: 'Ag', min: 1, max: 3 },
    { id: 'au', zh: '金幣', en: 'Gold coin', sym: 'Au', min: 1, max: 2 },
    { id: 'dia', zh: '鑽石', en: 'Diamond', sym: 'C', min: 1, max: 1 },
    { id: 'key', zh: '稀有鑰匙', en: 'Rare key', sym: '', min: 1, max: 1 }
  ];
  // 權重：運氣 0（1 級任務、0 顆星）→ 運氣 1（10 級任務、2000 顆星以上），兩端之間在對數上內插
  const W0 = [70, 22, 6.5, 1.3, 0.2];
  const W1 = [30, 32, 22, 11, 5];
  const STAR_CAP = 2000;
  /** 星星加成 0–1：越多越高、遞減增加，2000 顆星達到上限 */
  function starBoost(stars) {
    const S = Math.max(0, +stars || 0);
    return Math.min(1, Math.log(1 + S / 20) / Math.log(1 + STAR_CAP / 20));
  }
  function clampLevel(level) { return Math.max(1, Math.min(10, Math.round(+level) || 1)); }
  /** 運氣 0–1：任務等級占 60%、累積星星占 40% */
  function luck(level, stars) { return 0.6 * (clampLevel(level) - 1) / 9 + 0.4 * starBoost(stars); }
  /** 掉落各寶物的機率（加總為 1），順序同 ITEMS */
  function table(level, stars) {
    const r = luck(level, stars);
    const w = W0.map(function (b, i) { return Math.pow(b, 1 - r) * Math.pow(W1[i], r); });
    const sum = w.reduce(function (a, b) { return a + b; }, 0);
    return w.map(function (x) { return x / sum; });
  }
  /** 重做（今天已完成過）時，每次完成掉寶的機率 */
  function repeatChance(level, stars) { return 0.25 + 0.025 * clampLevel(level) + 0.10 * starBoost(stars); }
  /**
   * 擲一次：first = 今天第一次完成這個每日任務（一定掉）；否則依 repeatChance。
   * 回傳 { item, qty } 或 null（沒掉）。rand 預設 Math.random，測試時可傳入可重現的亂數。
   */
  function roll(level, stars, first, rand) {
    rand = rand || Math.random;
    if (!first && rand() >= repeatChance(level, stars)) return null;
    const p = table(level, stars);
    let u = rand(), i = 0;
    while (i < p.length - 1 && u >= p[i]) { u -= p[i]; i++; }
    const it = ITEMS[i];
    const qty = Math.min(it.max, it.min + Math.floor(rand() * (it.max - it.min + 1)));
    return { item: it.id, qty: qty };
  }

  // 限制（資料庫規則也有對應的上限）：兩次掉寶至少間隔 GAP 毫秒；每天重做掉寶最多 REPEAT_CAP 次
  const GAP = 12000;
  const REPEAT_CAP = 40;

  return {
    DAY: DAY, TW: TW, dayNumber: dayNumber, dayStart: dayStart, msToReset: msToReset, dateOf: dateOf,
    hash: hash, rng: rng, BANDS: BANDS, bandOf: bandOf, pick: pick,
    ITEMS: ITEMS, W0: W0, W1: W1, STAR_CAP: STAR_CAP, starBoost: starBoost, luck: luck, table: table,
    repeatChance: repeatChance, roll: roll, GAP: GAP, REPEAT_CAP: REPEAT_CAP
  };
});
