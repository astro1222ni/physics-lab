/* missions/page-replacement.js — 分頁置換的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/page-replacement.js 發出，都在使用者操作之後）：
 *   'run'：參考字串跑到最後一步（按「播放」「單步」「直接跑完」），或已經在最後一步時改了字串、框數或 LFU 的算法（畫面直接顯示新結果）。
 *     { src（'play'／'step'／'end'／'update'）, refs[]（參考字串）, n（長度）, frames（框數 1–7）,
 *       sheet（字串的來源：'default' 預設／'preset' 範例／'random' 隨機產生／'hand' 自己輸入；按「倒過來」不改來源）, preset（範例代號或 ''）,
 *       lfuKeep（LFU 換出後保留次數）, distinct（不同頁的個數）,
 *       faults：{ fifo, lru, lfu, opt }（目前框數的缺頁次數；lfu 照目前的算法）,
 *       curves：{ fifo[7], lru[7], lfu[7], opt[7] }（框數 1…7 的缺頁次數）,
 *       lfuAlt（LFU 換另一種次數算法時，目前框數的缺頁次數）,
 *       lfuStale（跑完時還留在 LFU 記憶體裡、而且後半段一次也沒被用到的頁，其中最大的次數；沒有就是 0） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  // 小工具寫在這裡（排行榜頁只載入任務檔、不載入核心）
  const isRun = function (ev) { return ev.type === 'run'; };
  const key = function (refs) { return refs.join(','); };
  const BELADY = '1,2,3,4,1,2,5,1,2,3,4,5';
  const allDistinct = function (refs) { const s = {}; for (let i = 0; i < refs.length; i++) { if (s[refs[i]]) return false; s[refs[i]] = true; } return true; };
  /** 目前框數 f 比 f − 1 個框多了幾次缺頁（f = 1 時是 0） */
  const rise = function (curve, f) { return f >= 2 ? curve[f - 1] - curve[f - 2] : 0; };
  /** 記住看過的（字串, 框數）組合；最多記 80 組 */
  function remember(mem, name, k, v) {
    const m = mem[name] = mem[name] || {};
    if (!m[k]) { const ks = Object.keys(m); if (ks.length > 80) delete m[ks[0]]; m[k] = {}; }
    m[k][v] = true;
    return m[k];
  }

  LabMission.register('page-replacement', [
    {
      id: 'page-replacement-1', level: 1,
      title: { zh: '跑完一回', en: 'All the way through' },
      desc: { zh: '按「播放」或「直接跑完」，讓參考字串的每一頁都處理完。', en: 'Press “Play” or “Run to the end” so that every page in the reference string is handled.' },
      check: function (ev) { return isRun(ev); }
    },
    {
      id: 'page-replacement-2', level: 2,
      title: { zh: '命中過半', en: 'Hits win' },
      desc: { zh: '框數不超過 3、參考字串至少 12 個而且至少有 4 種不同的頁，讓 LRU 的命中率達到 50% 以上，跑到最後。', en: 'With at most 3 frames and a reference string of at least 12 with at least 4 different pages, make LRU’s hit ratio at least 50%, then run to the end.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.frames <= 3 && d.n >= 12 && d.distinct >= 4 && 2 * (d.n - d.faults.lru) >= d.n; }
    },
    {
      id: 'page-replacement-3', level: 3,
      title: { zh: '多一個框，反而更慢', en: 'One more frame, more faults' },
      desc: { zh: '選範例「Belady 的經典字串」，用 3 個框跑到最後，再改成 4 個框跑到最後：FIFO 的缺頁次數不減反增。', en: 'Choose the example “Belady’s classic string”, run it to the end with 3 frames, then with 4 frames: FIFO’s page faults go up instead of down.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isRun(ev)) return false;
        const seen = remember(mem, 'fr', key(d.refs), d.frames);
        const f = d.frames, c = d.curves.fifo;
        return (seen[f - 1] && rise(c, f) > 0) || (seen[f + 1] && rise(c, f + 1) > 0);
      }
    },
    {
      id: 'page-replacement-4', level: 4,
      title: { zh: '追上先知', en: 'Catching the prophet' },
      desc: { zh: '參考字串至少 15 個。調「框數」，找出 LRU 最少要幾個框，缺頁次數才不多於 OPT 只用 3 個框的次數，用那個框數跑到最後。', en: 'With a reference string of at least 15, adjust the “Frames” to find the fewest frames with which LRU has no more page faults than OPT has with just 3 frames, and run to the end with that many.' },
      check: function (ev) {
        const d = ev.data, f = d.frames, L = d.curves.lru, o3 = d.curves.opt[2];
        return isRun(ev) && d.n >= 15 && f >= 4 && L[f - 1] <= o3 && L[f - 2] > o3;
      }
    },
    {
      id: 'page-replacement-5', level: 4,
      title: { zh: 'LRU 輸給 FIFO', en: 'LRU loses to FIFO' },
      desc: { zh: '自己輸入或按「隨機產生」得到一個參考字串，框數至少 3，讓 LRU 的缺頁次數比 FIFO 多，跑到最後。', en: 'Type a reference string or press “Random”, use at least 3 frames, and make LRU have more page faults than FIFO, then run to the end.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && (d.sheet === 'hand' || d.sheet === 'random') && d.frames >= 3 && d.faults.lru > d.faults.fifo; }
    },
    {
      id: 'page-replacement-6', level: 5,
      title: { zh: '繞圈子的陷阱', en: 'The loop trap' },
      desc: { zh: '至少 4 個框、參考字串至少 12 個，而且不同的頁剛好比框數多 1 個：讓 LRU 每一次都缺頁，跑到最後。', en: 'With at least 4 frames, a reference string of at least 12 and exactly one more distinct page than frames, make LRU fault on every single reference, then run to the end.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.frames >= 4 && d.n >= 12 && d.distinct === d.frames + 1 && d.faults.lru === d.n; }
    },
    {
      id: 'page-replacement-7', level: 5,
      title: { zh: '只付見面禮', en: 'Only the first-time fee' },
      desc: { zh: '至少 2 個框、參考字串至少 12 個，不同的頁比框數至少多 2 個，卻讓四種方法都只在每一頁第一次出現時缺頁，跑到最後。', en: 'With at least 2 frames, a reference string of at least 12 and at least two more distinct pages than frames, make all four algorithms fault only the first time each page appears, then run to the end.' },
      check: function (ev) {
        const d = ev.data;
        return isRun(ev) && d.frames >= 2 && d.n >= 12 && d.distinct >= d.frames + 2 && ['fifo', 'lru', 'lfu', 'opt'].every(function (a) { return d.faults[a] === d.distinct; });
      }
    },
    {
      id: 'page-replacement-8', level: 6,
      title: { zh: '過去的熱門', en: 'Yesterday’s favourite' },
      desc: { zh: '讓一頁在前半段被用了很多次（至少 3 次）、後半段都不再用，卻一直占著 LFU 的框；LFU 的缺頁次數比 LRU 多至少 3，跑到最後。', en: 'Make a page that was used many times (at least 3) in the first half and never in the second half keep hogging one of LFU’s frames, with LFU having at least 3 more page faults than LRU, then run to the end.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.frames >= 2 && d.lfuStale >= 3 && d.faults.lfu >= d.faults.lru + 3; }
    },
    {
      id: 'page-replacement-9', level: 7,
      title: { zh: '我的 Belady 異常', en: 'My own Belady anomaly' },
      desc: { zh: '自己輸入或按「隨機產生」，找一個不是經典例子的參考字串，用某個框數跑到最後時，FIFO 的缺頁比少一個框時還多。', en: 'Type a reference string or press “Random” — not the classic example — and run it to the end with a number of frames at which FIFO has more page faults than with one frame fewer.' },
      check: function (ev) {
        const d = ev.data;
        return isRun(ev) && (d.sheet === 'hand' || d.sheet === 'random') && key(d.refs) !== BELADY && rise(d.curves.fifo, d.frames) > 0;
      }
    },
    {
      id: 'page-replacement-10', level: 8,
      title: { zh: '先知遙遙領先', en: 'The prophet far ahead' },
      desc: { zh: '框數至少 3、參考字串不超過 20 個，讓 FIFO、LRU、LFU 的缺頁次數都比 OPT 多至少 4 次，跑到最後。', en: 'With at least 3 frames and a reference string of at most 20, make FIFO, LRU and LFU each have at least 4 more page faults than OPT, then run to the end.' },
      check: function (ev) {
        const d = ev.data, o = d.faults.opt;
        return isRun(ev) && d.frames >= 3 && d.n <= 20 && d.faults.fifo >= o + 4 && d.faults.lru >= o + 4 && d.faults.lfu >= o + 4;
      }
    },

    // ---------- 隱藏任務（只給謎語；完成時只恭喜，不說原因） ----------
    {
      // 一面之緣：至少 10 頁、每一頁都不一樣，用最多的 7 個框——記憶體再大也全部缺頁（只有冷啟動缺頁）
      id: 'page-replacement-h1', level: 3, hidden: true,
      riddle: { zh: '每位客人都只來一次；就算把店開到最大，也等不到一位回頭客。', en: 'Every customer comes exactly once; even with the shop at its largest, not one of them ever comes back.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.n >= 10 && d.frames === 7 && allDistinct(d.refs); }
    },
    {
      // 單人房：自己輸入的字串、只有 1 個框（四種方法都一樣，只有「緊接著再用同一頁」才命中），至少 12 個參考、至少 4 種頁，命中率卻至少一半
      id: 'page-replacement-h2', level: 4, hidden: true,
      riddle: { zh: '只有一張椅子的小店，卻有一半的客人不必等。', en: 'A little shop with a single chair — and yet half of the customers never had to wait.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.sheet === 'hand' && d.frames === 1 && d.n >= 12 && d.distinct >= 4 && 2 * (d.n - d.faults.lru) >= d.n; }
    },
    {
      // 記仇與健忘：同一個字串（8–12 個參考）、同樣框數，LFU 兩種次數算法（換出歸零／保留）都跑到最後看過，缺頁次數差至少 2
      id: 'page-replacement-h3', level: 5, hidden: true,
      riddle: { zh: '一位把舊帳記一輩子，一位一出門就忘；走同一條街，兩人的帳差了不只一筆。', en: 'One keeps every old score for life, the other forgets the moment he walks out; down the same street, their accounts differ by more than one entry.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isRun(ev)) return false;
        const seen = remember(mem, 'lfu', key(d.refs) + '|' + d.frames, d.lfuKeep ? 'k' : 'r');
        return !!(seen.k && seen.r) && d.n >= 8 && d.n <= 12 && Math.abs(d.faults.lfu - d.lfuAlt) >= 2;
      }
    },
    {
      // 倒帶：自己輸入的字串（8–12 個參考）跑到最後，再按「倒過來」用同樣框數跑到最後；LRU 與 OPT 的缺頁不變（Silberschatz 10.4 節），FIFO 差至少 2
      id: 'page-replacement-h4', level: 6, hidden: true,
      riddle: { zh: '把日子倒著過一遍，兩位的帳本一頁不差；只有排隊的那一位，算出了別的數。', en: 'Live the days over backwards: two of the account books match page for page, and only the one who keeps a queue comes up with a different sum.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isRun(ev)) return false;
        const runs = mem.runs = mem.runs || [];
        const k = key(d.refs), rk = key(d.refs.slice().reverse());
        let ok = false;
        if (k !== rk && d.sheet === 'hand' && d.n >= 8 && d.n <= 12) {
          for (let i = 0; i < runs.length; i++) {
            const r = runs[i];
            if (r.k === rk && r.f === d.frames && r.lru === d.faults.lru && r.opt === d.faults.opt && Math.abs(r.fifo - d.faults.fifo) >= 2) { ok = true; break; }
          }
        }
        runs.push({ k: k, f: d.frames, fifo: d.faults.fifo, lru: d.faults.lru, opt: d.faults.opt });
        if (runs.length > 40) runs.shift();
        return ok;
      }
    },
    {
      // 只看過去也能和先知一樣準：至少 3 個框、至少 15 個參考，連 OPT 都躲不掉至少 3 次置換（OPT ≥ 不同頁數 + 3），LRU = OPT，FIFO 至少多 3
      id: 'page-replacement-h5', level: 6, hidden: true,
      riddle: { zh: '只會回頭看的人，竟然和看得見明天的人一樣準；老老實實排隊的那位卻沒有。', en: 'The one who only looks back turned out exactly as sharp as the one who can see tomorrow; the one who simply keeps a queue did not.' },
      check: function (ev) {
        const d = ev.data, F = d.faults;
        return isRun(ev) && d.frames >= 3 && d.n >= 15 && F.opt >= d.distinct + 3 && F.lru === F.opt && F.fifo >= F.opt + 3;
      }
    },
    {
      // 七層樓梯：LRU 的缺頁次數從 1 個框到 7 個框「每多一個框剛好少 1 次」——堆疊距離 2、3、…、7 每一種剛好出現一次（Mattson 1970）
      id: 'page-replacement-h6', level: 7, hidden: true,
      riddle: { zh: '七層樓梯，每一階都剛好站著一個人在等。', en: 'A staircase of seven steps, and on every step exactly one person stands waiting.' },
      check: function (ev) {
        const d = ev.data, c = d.curves.lru;
        if (!isRun(ev)) return false;
        for (let k = 0; k + 1 < c.length; k++) if (c[k] - c[k + 1] !== 1) return false;
        return true;
      }
    },
    {
      // 名次顛倒：至少 3 個框、參考字串不超過 12 個、有真正的置換（OPT 多於不同頁數），FIFO 和 OPT 一樣少，LRU 比較多，LFU 又更多
      id: 'page-replacement-h7', level: 7, hidden: true,
      riddle: { zh: '短短一段路上，最老實的那一位和先知並肩；越會算計的，跑得越慢。', en: 'Over a short stretch of road, the plainest of them runs shoulder to shoulder with the prophet; the more they calculate, the slower they go.' },
      check: function (ev) {
        const d = ev.data, F = d.faults;
        return isRun(ev) && d.frames >= 3 && d.n <= 12 && F.opt > d.distinct && F.fifo === F.opt && F.lru > F.fifo && F.lfu > F.lru;
      }
    },
    {
      // 大號的 Belady 異常：用目前的框數跑到最後，FIFO 比少一個框時多了至少 2 次缺頁
      id: 'page-replacement-h8', level: 8, hidden: true,
      riddle: { zh: '多給一間房，卻多跑了兩趟。', en: 'Given one more room, it made two more trips.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && rise(d.curves.fifo, d.frames) >= 2; }
    },
    {
      // LRU 處處輸給 FIFO：框數 2、3、4、5、6 每一種，LRU 的缺頁都比 FIFO 多
      id: 'page-replacement-h9', level: 9, hidden: true,
      riddle: { zh: '從兩間房比到六間房，只記得最近的那位，竟然一次也沒贏過只會排隊的那位。', en: 'From two rooms up to six, the one who remembers what happened last never once beat the one who just keeps a queue.' },
      check: function (ev) {
        const d = ev.data, L = d.curves.lru, Q = d.curves.fifo;
        if (!isRun(ev)) return false;
        for (let f = 2; f <= 6; f++) if (!(L[f - 1] > Q[f - 1])) return false;
        return true;
      }
    },
    {
      // LFU 也有 Belady 異常：換出就歸零的 LFU 不是堆疊演算法；用目前的框數跑到最後，LFU 比少一個框時缺頁更多
      id: 'page-replacement-h10', level: 10, hidden: true,
      riddle: { zh: '人們都說只有排隊的那位會越幫越忙；數人頭的那位，其實也會——只要它不記舊帳。', en: 'People say only the one who keeps a queue can be made worse by more help; the one who counts heads can too — as long as it keeps no old scores.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && !d.lfuKeep && rise(d.curves.lfu, d.frames) > 0; }
    }
  ]);
})();
