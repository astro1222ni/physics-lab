/*
 * daily-core.js — 每日任務的核心計算（與畫面分離，Node 單元測試：tests/daily-core.test.js）
 *
 *   - 換日：一律以臺灣時間（UTC+8）凌晨 00:00 為界，用伺服器時間計算，改本機時鐘沒有用。
 *   - 每天十個每日任務：簡單（1–3 級）4 個、中等（4–6 級）3 個、困難（7–10 級）3 個，從現有的一般任務抽出（不含隱藏任務），
 *     同一個人同一天結果固定，盡量來自不同實驗。每個今天只能完成一次，十個做完這一天就結束。
 *   - 掉寶：銅幣、銀幣、金幣、鑽石、稀有鑰匙，每次完成最多一件。每完成一個每日任務都依 repeatChance 的機率掉寶（25%–100%：星星比例 0 時 ★1–★10 為 25%–60%，全拿滿時 50%–100%），
 *     以前沒領過星星的任務照樣得星，但掉寶機率和做過的任務一樣（11/12 站長）。任務等級越高、玩家的星星占全站總星數的比例越高，掉寶與稀有寶物的機率越高，
 *     掉到的數量也越偏多（銅幣 1–5、銀幣 1–3、金幣 1–2；鑽石與稀有鑰匙最多 1 個）。
 *   - 持有數：累計獲得（只增不減）與現在剩下（累計獲得 − 已使用）；另有寶物圖示與「我的寶物」格子（瀏覽器用）。
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

  // ---------- 每天十個任務（11/12 站長：「每一天有十個隨機的每日任務，這十個做完，這一天就不能再多做了」） ----------
  const BANDS = [
    { id: 'easy', min: 1, max: 3, n: 4, zh: '簡單', en: 'Easy' },
    { id: 'mid', min: 4, max: 6, n: 3, zh: '中等', en: 'Medium' },
    { id: 'hard', min: 7, max: 10, n: 3, zh: '困難', en: 'Hard' }
  ];
  const PER_DAY = BANDS.reduce(function (a, b) { return a + b.n; }, 0);
  function bandOf(level) {
    for (let i = 0; i < BANDS.length; i++) if (level >= BANDS[i].min && level <= BANDS[i].max) return BANDS[i];
    return BANDS[0];
  }
  /**
   * pool：[{ id, module, level }]（呼叫端先排除隱藏任務）。回傳 PER_DAY 個任務代號（簡單 4、中等 3、困難 3，依難度排列）。
   * 盡量來自不同實驗；不同實驗不夠時才讓同一個實驗出現兩次（任務一定不重複）。某個難度的任務不夠時就少抽幾個。
   * keep：一定要保留的任務代號（換版時保留今天已抽到的任務），算在各自難度的名額裡。
   * 同一個 uid、同一天結果固定；先依代號排序，所以和載入順序無關。
   */
  function pick(pool, uid, day, keep) {
    const r = rng(hash(String(uid) + ':' + day));
    const sorted = pool.slice().sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    const usedMod = {}, usedId = {}, out = [];
    const kept = sorted.filter(function (m) { return (keep || []).indexOf(m.id) >= 0; });
    kept.forEach(function (m) { usedMod[m.module] = true; usedId[m.id] = true; });
    BANDS.forEach(function (b) {
      const inBand = sorted.filter(function (m) { return m.level >= b.min && m.level <= b.max; });
      const mine = kept.filter(function (m) { return m.level >= b.min && m.level <= b.max; }).slice(0, b.n);
      mine.forEach(function (m) { out.push(m.id); });
      for (let k = mine.length; k < b.n; k++) {
        let c = inBand.filter(function (m) { return !usedId[m.id] && !usedMod[m.module]; });
        if (!c.length) c = inBand.filter(function (m) { return !usedId[m.id]; });
        if (!c.length) break;
        const m = c[Math.floor(r() * c.length)];
        usedMod[m.module] = true; usedId[m.id] = true;
        out.push(m.id);
      }
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
  // 權重：運氣 0（1 級任務、星星比例 0）→ 運氣 1（10 級任務、拿到全站所有星星），兩端之間在對數上內插
  const W0 = [70, 22, 6.5, 1.3, 0.2];
  const W1 = [30, 32, 22, 11, 5];
  /**
   * 星星加成 0–1 ＝ 玩家目前的星星 ÷ 全站目前可以拿到的總星數（11/12 站長）。
   * 全站新增任務、總星數變多時，玩家的星星沒跟上，比例就下降，掉寶機率也跟著下降。
   * total 不明（任務清單還沒載入）時當作 0，不會高估。
   */
  function starBoost(stars, total) {
    const S = Math.max(0, +stars || 0), T = +total || 0;
    return T > 0 ? Math.min(1, S / T) : 0;
  }
  /** 全站目前可以拿到的總星數：每個任務的星數加總（一般任務＝等級，隱藏任務＝等級 × 2，和 missions.js 的 starsOf 一致）。lists 是 { 模組: [任務…] } */
  function siteStars(lists) {
    let t = 0;
    Object.keys(lists || {}).forEach(function (k) { (lists[k] || []).forEach(function (m) { t += Math.max(0, +m.level || 0) * (m.hidden ? 2 : 1); }); });
    return t;
  }
  function clampLevel(level) { return Math.max(1, Math.min(10, Math.round(+level) || 1)); }
  /** 運氣 0–1：任務等級占 60%、星星比例占 40% */
  function luck(level, stars, total) { return 0.6 * (clampLevel(level) - 1) / 9 + 0.4 * starBoost(stars, total); }
  /** 掉落各寶物的機率（加總為 1），順序同 ITEMS */
  function table(level, stars, total) {
    const r = luck(level, stars, total);
    const w = W0.map(function (b, i) { return Math.pow(b, 1 - r) * Math.pow(W1[i], r); });
    const sum = w.reduce(function (a, b) { return a + b; }, 0);
    return w.map(function (x) { return x / sum; });
  }
  /** 完成一個每日任務時掉寶的機率（新任務與做過的任務一樣；11/12 站長） */
  // 11/13 站長：星星比例 0 時 ★1 的 25% 到 ★10 的 60%；全拿滿時 ★1 的 50% 到 ★10 的 100%；中間依比例線性內插
  function repeatChance(level, stars, total) {
    const L = clampLevel(level), b = starBoost(stars, total);
    const lo = 0.25 + 0.35 * (L - 1) / 9, hi = 0.5 + 0.5 * (L - 1) / 9;
    return Math.min(1, lo + b * (hi - lo));
  }
  /**
   * 掉到某種寶物時，各數量的機率（由少到多，加總為 1）。跟掉寶機率用同一個運氣（任務難度＋星星比例；11/12 站長「掉寶數量也隨之連動」）：
   * 運氣 0 時越少越容易（銅幣 1–5 枚的權重 5:4:3:2:1），運氣 1 時倒過來（1:2:3:4:5），中間線性內插。
   * 鑽石與稀有鑰匙最多 1 個（站長），所以固定 [1]。
   */
  function qtyTable(itemId, level, stars, total) {
    const it = ITEMS.filter(function (x) { return x.id === itemId; })[0];
    if (!it) return [1];
    const n = it.max - it.min + 1;
    if (n <= 1) return [1];
    const r = luck(level, stars, total);
    const w = [];
    for (let j = 0; j < n; j++) w.push((1 - r) * (n - j) + r * (j + 1));
    const sum = w.reduce(function (a, b) { return a + b; }, 0);
    return w.map(function (x) { return x / sum; });
  }
  /** 掉到某種寶物時的平均數量 */
  function qtyMean(itemId, level, stars, total) {
    const it = ITEMS.filter(function (x) { return x.id === itemId; })[0];
    if (!it) return 1;
    return qtyTable(itemId, level, stars, total).reduce(function (a, p, j) { return a + p * (it.min + j); }, 0);
  }
  /**
   * 擲一次：依 repeatChance 決定有沒有掉；sure = true 時一定掉（目前每日任務不用，保留給之後的活動）。
   * 掉的話只掉一種寶物；數量照 qtyTable（銅幣 1–5、銀幣 1–3、金幣 1–2，運氣越好越偏多；鑽石與鑰匙 1）。
   * 回傳 { item, qty } 或 null（沒掉）。rand 預設 Math.random，測試時可傳入可重現的亂數。
   */
  function roll(level, stars, total, sure, rand) {
    rand = rand || Math.random;
    if (!sure && rand() >= repeatChance(level, stars, total)) return null;
    const p = table(level, stars, total);
    let u = rand(), i = 0;
    while (i < p.length - 1 && u >= p[i]) { u -= p[i]; i++; }
    const it = ITEMS[i];
    const q = qtyTable(it.id, level, stars, total);
    let v = rand(), j = 0;
    while (j < q.length - 1 && v >= q[j]) { v -= q[j]; j++; }
    return { item: it.id, qty: Math.min(it.max, it.min + j) };
  }

  // 每個每日任務今天只能完成一次；兩次完成至少隔 GAP 毫秒（資料庫規則：10 秒）。
  const GAP = 10500;

  // ---------- 持有數：累計獲得與現在剩下 ----------
  // bag/<uid> 的 cu、ag、au、dia、key 是「累計獲得」（只增不減）。之後有消費功能時，
  // 用掉的數量記在 bag/<uid>/used/<寶物>（同樣只增不減、不超過累計獲得）。
  // 現在剩下 = 累計獲得 − 已使用。
  function holdings(bag) {
    bag = bag || {};
    const used = bag.used || {};
    const n = function (v) { v = Math.floor(+v || 0); return v > 0 ? v : 0; };
    return ITEMS.map(function (it) {
      const total = n(bag[it.id]);
      const u = Math.min(total, n(used[it.id]));
      return { id: it.id, zh: it.zh, en: it.en, total: total, used: u, left: total - u };
    });
  }

  // ---------- 寶物圖示（SVG 字串）：銅、銀、金幣刻元素符號；鑽石是碳的晶體；鑰匙最稀有 ----------
  let gid = 0;
  const COIN = {
    cu: ['#f8c9a4', '#c47a45', '#6e3818'],
    ag: ['#ffffff', '#c6ced5', '#5f6a74'],
    au: ['#fff4b0', '#e3ad1d', '#7f5300']
  };
  function icon(id) {
    const g = 'dl' + (++gid);
    if (COIN[id]) {
      const c = COIN[id], sym = id === 'cu' ? 'Cu' : id === 'ag' ? 'Ag' : 'Au';
      return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><radialGradient id="' + g + '" cx="34%" cy="28%" r="78%">' +
        '<stop offset="0" stop-color="' + c[0] + '"/><stop offset=".55" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></radialGradient></defs>' +
        '<ellipse cx="32" cy="57" rx="20" ry="3.2" fill="#000" opacity=".18"/>' +
        '<circle cx="32" cy="33.6" r="26" fill="' + c[2] + '"/>' +
        '<circle cx="32" cy="31" r="26" fill="url(#' + g + ')"/>' +
        '<circle cx="32" cy="31" r="20.5" fill="none" stroke="' + c[2] + '" stroke-opacity=".5" stroke-width="1.6"/>' +
        '<circle cx="32" cy="31" r="24.2" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1" stroke-dasharray="1.4 2.2"/>' +
        '<text x="32" y="38.6" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-weight="700" font-size="20" fill="' + c[2] + '" fill-opacity=".9">' + sym + '</text>' +
        '<path d="M15.5 21.5A20 20 0 0 1 27 12.2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/></svg>';
    }
    if (id === 'dia') {
      return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">' +
        '<ellipse cx="32" cy="59" rx="14" ry="2.6" fill="#000" opacity=".16"/>' +
        '<g stroke="#075985" stroke-width="1.1" stroke-linejoin="round">' +
        '<polygon points="9,24 21,11 15.5,24" fill="#bae6fd"/><polygon points="21,11 32,24 15.5,24" fill="#e0f2fe"/>' +
        '<polygon points="21,11 43,11 32,24" fill="#f8fdff"/><polygon points="43,11 48.5,24 32,24" fill="#bae6fd"/>' +
        '<polygon points="43,11 55,24 48.5,24" fill="#7dd3fc"/>' +
        '<polygon points="9,24 15.5,24 32,56" fill="#0ea5e9"/><polygon points="15.5,24 32,24 32,56" fill="#38bdf8"/>' +
        '<polygon points="32,24 48.5,24 32,56" fill="#0284c7"/><polygon points="48.5,24 55,24 32,56" fill="#0369a1"/></g>' +
        '<path d="M47 4l1.4 3.6L52 9l-3.6 1.4L47 14l-1.4-3.6L42 9l3.6-1.4z" fill="#fff"/>' +
        '<text x="32" y="21.6" text-anchor="middle" font-family="Georgia, serif" font-weight="700" font-size="9" fill="#075985" fill-opacity=".75">C</text></svg>';
    }
    if (id === 'key') {
      return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#f5d0fe"/><stop offset=".45" stop-color="#c026d3"/><stop offset="1" stop-color="#581c87"/></linearGradient>' +
        '<radialGradient id="' + g + 'h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#e879f9" stop-opacity=".55"/><stop offset="1" stop-color="#e879f9" stop-opacity="0"/></radialGradient></defs>' +
        '<circle cx="32" cy="32" r="30" fill="url(#' + g + 'h)"/>' +
        '<circle cx="18.5" cy="32" r="10.5" fill="none" stroke="url(#' + g + ')" stroke-width="6.5"/>' +
        '<circle cx="18.5" cy="32" r="3.4" fill="#fdf4ff" stroke="#a21caf" stroke-width="1.2"/>' +
        '<path d="M28.5 28.6H57.6a2.2 2.2 0 0 1 2.2 2.2v2.4a2.2 2.2 0 0 1-2.2 2.2H56V44h-6.4v-8.6h-3V41.5h-5.4v-6.1H28.5z" fill="url(#' + g + ')" stroke="#4a044e" stroke-opacity=".5" stroke-width="1"/>' +
        '<path d="M12.6 25.2a8 8 0 0 1 6.2-3.4" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round"/>' +
        '<path d="M31 30.2H55" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/></svg>';
    }
    return '';
  }

  /**
   * 瀏覽器用：「我的寶物」格子（daily.html 與排行榜頁共用）。
   * 每格：圖示、名稱，下面左右並排兩個數字：左＝累計獲得、右＝現在剩下（11/12 站長指定的順序）。
   * bag = null 時數字畫成「—」（未登入的預覽）。T(zh, en) 是中英文切換函式。
   */
  function bagGrid(doc, bag, T) {
    const mk = function (tag, cls, text) { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const fmt = function (v) { return bag ? v.toLocaleString() : '—'; };
    const num = function (cls, v, label) {
      const box = mk('span', 'dl-num ' + cls);
      box.appendChild(mk('span', 'dl-num-v', fmt(v)));
      box.appendChild(mk('span', 'dl-num-l', label));
      return box;
    };
    const row = mk('div', 'dl-bag-row');
    holdings(bag).forEach(function (h) {
      const tile = mk('div', 'dl-item r-' + h.id);
      const ic = mk('span', 'dl-ico');
      ic.innerHTML = icon(h.id);
      tile.appendChild(ic);
      tile.appendChild(mk('span', 'dl-item-name', T(h.zh, h.en)));
      const nums = mk('span', 'dl-nums');
      nums.appendChild(num('total', h.total, T('累計獲得', 'All-time')));
      nums.appendChild(num('left', h.left, T('現在剩下', 'Left now')));
      tile.appendChild(nums);
      if (bag) {
        tile.setAttribute('role', 'group');
        tile.setAttribute('aria-label', T(h.zh + '：累計獲得 ' + h.total + '，現在剩下 ' + h.left, h.en + ': ' + h.total + ' all-time, ' + h.left + ' left now'));
      }
      row.appendChild(tile);
    });
    return row;
  }

  return {
    DAY: DAY, TW: TW, dayNumber: dayNumber, dayStart: dayStart, msToReset: msToReset, dateOf: dateOf,
    hash: hash, rng: rng, BANDS: BANDS, PER_DAY: PER_DAY, bandOf: bandOf, pick: pick,
    ITEMS: ITEMS, W0: W0, W1: W1, starBoost: starBoost, siteStars: siteStars, luck: luck, table: table,
    repeatChance: repeatChance, qtyTable: qtyTable, qtyMean: qtyMean, roll: roll, GAP: GAP,
    holdings: holdings, icon: icon, bagGrid: bagGrid
  };
});
