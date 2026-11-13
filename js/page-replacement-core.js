/* page-replacement-core.js — 分頁置換的計算核心（與畫面分離；Node 單元測試：tests/page-replacement-core.test.js）
 *
 * 模型：需求分頁（demand paging）。記憶體有 f 個框（frame），依序處理參考字串（reference string）裡的每一頁：
 *   頁已經在某個框裡 → 命中（hit）；不在 → 缺頁（page fault），把它載入：有空框就放進編號最小的空框，
 *   沒有空框就依演算法挑一個「犧牲頁」換出，新頁放進它原本的框。一開始記憶體是空的，第一次載入也算缺頁（教科書的算法）。
 *
 * 四種演算法與平手規則（全部寫死，單元測試涵蓋）：
 *   fifo 先進先出：換出「最早載入」的頁（載入時刻都不同，不會平手）。命中不改變載入時刻。
 *   lru  最近最少使用：換出「最久沒被用到」的頁（每一步只用一頁，最後使用時刻都不同，不會平手）。
 *   lfu  最不常使用：換出「被用到次數最少」的頁；次數相同時，換其中「最久沒被用到」的（等於在平手的頁之間用 LRU）。
 *        次數的算法有兩種（opt.lfuKeep）：
 *          false（預設）：從載入那一刻起算，換出時歸零；再被載入時從 1 重新算。
 *          true：整個參考字串從頭算起的總次數，換出也保留（Mattson 等人 1970 討論的 LFU，是堆疊演算法）。
 *   opt  最佳（Belady 1966 的 MIN）：換出「下一次被用到的時刻最晚」的頁；之後都不再用到的頁視為無限遠。
 *        之後都不再用到的頁不只一個時，換其中「最久沒被用到」的（和 LFU 一樣用 LRU 平手）。這個平手規則只看參考字串、
 *        和框數無關，所以 OPT 保有「包含性質」（Mattson 1970 的堆疊演算法）；換成「最早載入」就不一定。OPT 的缺頁次數和平手規則無關（單元測試驗證）。
 *
 * 參考：Silberschatz, Galvin, Gagne《Operating System Concepts》第 10 版第 10 章 10.4 節；
 *       Belady (1966) IBM Systems Journal 5(2)；Belady, Nelson, Shedler (1969) CACM 12(6)；Mattson et al. (1970) IBM Systems Journal 9(2)。
 */
(function (root) {
  'use strict';
  const ALGOS = ['fifo', 'lru', 'lfu', 'opt'];
  const LIMITS = { lenMin: 1, lenMax: 30, pageMax: 99, framesMin: 1, framesMax: 7, kindsMin: 2, kindsMax: 10, randLenMin: 6, randLenMax: 30 };
  const INF = Infinity;

  /** 有種子的亂數產生器（mulberry32），回傳 [0, 1) 的均勻亂數 */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 解析使用者輸入的參考字串（只在本機處理，不用 eval）。
   * 分隔：空白、逗號（半形或全形）、頓號、分號、斜線。小數點不是分隔（2.5 是錯的輸入）。整串只有數字、沒有任何分隔時，一個數字就是一頁。
   * 回傳 { ok: true, refs } 或 { ok: false, code, token }：
   *   code = 'empty'（沒有任何頁）／'long'（超過 LIMITS.lenMax 頁）／'token'（不是 0–99 的整數）。
   */
  function parse(text) {
    const s = String(text == null ? '' : text).slice(0, 400).trim();
    if (!s) return { ok: false, code: 'empty' };
    let toks;
    if (/^[0-9]+$/.test(s)) toks = s.split('');
    else toks = s.split(/[\s,，、;；\/]+/).filter(function (x) { return x.length > 0; });
    if (!toks.length) return { ok: false, code: 'empty' };
    const refs = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (!/^[0-9]{1,2}$/.test(t)) return { ok: false, code: 'token', token: t.slice(0, 8) };
      refs.push(parseInt(t, 10));
    }
    if (refs.length > LIMITS.lenMax) return { ok: false, code: 'long', n: refs.length };
    return { ok: true, refs: refs };
  }
  function format(refs) { return refs.join(' '); }

  /** 隨機參考字串：頁面 0…kinds−1；有區域性（約 45% 的機會重用最近 4 個參考中的一頁）。同一個種子永遠得到同一串。 */
  function randomRefs(seed, len, kinds) {
    len = Math.max(LIMITS.randLenMin, Math.min(LIMITS.randLenMax, Math.round(len)));
    kinds = Math.max(LIMITS.kindsMin, Math.min(LIMITS.kindsMax, Math.round(kinds)));
    const r = rng(seed * 7919 + len * 31 + kinds);
    const out = [];
    for (let i = 0; i < len; i++) {
      if (i >= 2 && r() < 0.45) {
        const back = 1 + Math.floor(r() * Math.min(4, i));
        out.push(out[i - back]);
      } else out.push(Math.floor(r() * kinds));
    }
    return out;
  }

  /** nextUse[t]：位置 t 的頁「下一次」出現的位置（沒有就是 Infinity） */
  function nextUses(refs) {
    const nu = new Array(refs.length), last = {};
    for (let t = refs.length - 1; t >= 0; t--) {
      const p = refs[t];
      nu[t] = last[p] === undefined ? INF : last[p];
      last[p] = t;
    }
    return nu;
  }

  /**
   * 模擬一種演算法。opt：{ lfuKeep（LFU 換出後保留次數，預設 false）, optTie（'fifo' 預設／'last' 之後不再用到的頁平手時換最晚載入的，只供測試）}
   * 回傳 { algo, frames, n, faults, hits, steps[] }，steps[t] = {
   *   t, page, hit, idx（命中或載入的框）, victim（換出的頁，沒有就是 null）, filled（放進空框）,
   *   mem[]（這一步之後每個框的頁，空框是 null）, key[]（這一步之後每個框的「決策值」：fifo 載入時刻、lru 最後使用時刻、
   *   lfu 次數、opt 下一次用到的位置〔Infinity = 不再用到〕）, cand[]（缺頁且要換出時，決策當下每個框的決策值）, faults（到這一步為止的缺頁數）}
   */
  function simulate(refs, frames, algo, opt) {
    opt = opt || {};
    const F = Math.max(1, Math.min(LIMITS.framesMax, Math.round(frames)));
    const n = refs.length;
    const mem = new Array(F).fill(null), load = new Array(F).fill(-1), last = new Array(F).fill(-1), cnt = new Array(F).fill(0);
    const total = {}; // lfuKeep：每一頁從頭算起的總次數
    const nu = nextUses(refs);
    const nextOf = new Array(F).fill(INF); // opt：每個框裡的頁下一次用到的位置
    const steps = [];
    let faults = 0;
    const keyOf = function (i, t) {
      if (mem[i] === null) return null;
      if (algo === 'fifo') return load[i];
      if (algo === 'lru') return last[i];
      if (algo === 'lfu') return cnt[i];
      return nextOf[i];
    };
    for (let t = 0; t < n; t++) {
      const p = refs[t];
      let idx = mem.indexOf(p);
      const st = { t: t, page: p, hit: idx >= 0, idx: -1, victim: null, filled: false, cand: null };
      total[p] = (total[p] || 0) + 1;
      if (idx >= 0) {
        last[idx] = t;
        cnt[idx] = opt.lfuKeep ? total[p] : cnt[idx] + 1;
        nextOf[idx] = nu[t];
      } else {
        faults++;
        idx = mem.indexOf(null);
        if (idx >= 0) st.filled = true;
        else {
          st.cand = mem.map(function (_, i) { return keyOf(i, t); });
          idx = 0;
          for (let i = 1; i < F; i++) {
            if (algo === 'fifo') { if (load[i] < load[idx]) idx = i; }
            else if (algo === 'lru') { if (last[i] < last[idx]) idx = i; }
            else if (algo === 'lfu') { if (cnt[i] < cnt[idx] || (cnt[i] === cnt[idx] && last[i] < last[idx])) idx = i; }
            else {
              const a = nextOf[i], b = nextOf[idx];
              if (a > b) idx = i;
              else if (a === b && a === INF) {
                if (opt.optTie === 'last' ? load[i] > load[idx] : opt.optTie === 'fifo' ? load[i] < load[idx] : last[i] < last[idx]) idx = i;
              }
            }
          }
          st.victim = mem[idx];
        }
        mem[idx] = p; load[idx] = t; last[idx] = t;
        cnt[idx] = opt.lfuKeep ? total[p] : 1;
        nextOf[idx] = nu[t];
      }
      st.idx = idx;
      st.mem = mem.slice();
      st.key = mem.map(function (_, i) { return keyOf(i, t); });
      st.faults = faults;
      steps.push(st);
    }
    return { algo: algo, frames: F, n: n, faults: faults, hits: n - faults, steps: steps };
  }
  function faultsOf(refs, frames, algo, opt) { return simulate(refs, frames, algo, opt).faults; }
  /** 四種演算法一起跑 */
  function runAll(refs, frames, opt) {
    const out = {};
    ALGOS.forEach(function (a) { out[a] = simulate(refs, frames, a, opt); });
    return out;
  }
  /** 框數 1…7 的缺頁次數：{ fifo: [7 個], lru: […], lfu: […], opt: […] } */
  function curves(refs, opt) {
    const out = {};
    ALGOS.forEach(function (a) {
      out[a] = [];
      for (let f = 1; f <= LIMITS.framesMax; f++) out[a].push(faultsOf(refs, f, a, opt));
    });
    return out;
  }
  /** 曲線上「多一個框、缺頁反而變多」的地方：回傳 [f, …]（f 框 → f + 1 框變多） */
  function anomalies(curve) {
    const out = [];
    for (let k = 0; k + 1 < curve.length; k++) if (curve[k + 1] > curve[k]) out.push(k + 1);
    return out;
  }
  /** 不同頁的個數（= 冷啟動的缺頁次數下限） */
  function distinct(refs) { const s = {}; refs.forEach(function (p) { s[p] = true; }); return Object.keys(s).length; }
  /** LRU 的堆疊距離（Mattson 1970）：每一次參考，這一頁在 LRU 堆疊裡的深度（1 = 剛剛才用過；第一次出現是 Infinity）。
   *  f 個框時 LRU 的缺頁次數 = 堆疊距離 > f 的參考個數。 */
  function stackDistances(refs) {
    const stack = [], out = [];
    refs.forEach(function (p) {
      const i = stack.indexOf(p);
      out.push(i < 0 ? INF : i + 1);
      if (i >= 0) stack.splice(i, 1);
      stack.unshift(p);
    });
    return out;
  }
  /** 每一步記憶體裡的頁的集合（排序後的字串），測試「包含性質」用 */
  function residentSets(res) { return res.steps.map(function (s) { return s.mem.filter(function (x) { return x !== null; }).sort(function (a, b) { return a - b; }); }); }

  /** 跑完時還留在 LFU 記憶體裡、而且後半段（位置 ≥ n/2）一次也沒被用到的頁，其中最大的次數；沒有就是 0 */
  function lfuStale(refs, res) {
    const n = refs.length, lastAt = {};
    refs.forEach(function (p, t) { lastAt[p] = t; });
    const st = res.steps[n - 1];
    let best = 0;
    if (!st) return 0;
    st.mem.forEach(function (p, i) { if (p !== null && 2 * lastAt[p] < n && st.key[i] > best) best = st.key[i]; });
    return best;
  }
  /** 任務事件裡和字串、框數有關的量（頁面與任務證明共用，保證兩邊一樣） */
  function summary(refs, frames, lfuKeep) {
    const o = { lfuKeep: !!lfuKeep }, faults = {};
    ALGOS.forEach(function (a) { faults[a] = faultsOf(refs, frames, a, o); });
    return {
      n: refs.length, frames: frames, lfuKeep: !!lfuKeep, distinct: distinct(refs),
      faults: faults, curves: curves(refs, o),
      lfuAlt: faultsOf(refs, frames, 'lfu', { lfuKeep: !lfuKeep }),
      lfuStale: lfuStale(refs, simulate(refs, frames, 'lfu', o))
    };
  }

  function fmt(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const k = Math.pow(10, d == null ? 2 : d);
    const r = Math.round(v * k) / k;
    return String(Object.is(r, -0) ? 0 : r);
  }

  const API = {
    ALGOS: ALGOS, LIMITS: LIMITS, rng: rng, parse: parse, format: format, randomRefs: randomRefs,
    nextUses: nextUses, simulate: simulate, faultsOf: faultsOf, runAll: runAll, curves: curves, anomalies: anomalies,
    distinct: distinct, stackDistances: stackDistances, residentSets: residentSets, lfuStale: lfuStale, summary: summary, fmt: fmt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PageReplCore = API;
})(typeof window !== 'undefined' ? window : this);
