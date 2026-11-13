/* missions/cpu-scheduling.js — CPU 排程的任務（一般任務星星 = 等級；隱藏任務 = 等級 × 2）
 * 事件（js/cpu-scheduling.js 發出，都在使用者操作之後）：
 *   'run'：排程跑到最後一刻（按「播放」「單步」「直接跑完」），或已經在最後一刻時改了工作表或設定（畫面直接顯示新結果）。
 *     { src（'play'／'step'／'end'／'update'）, algo（'fcfs'／'sjf'／'srtf'／'rr'／'pn'／'pp'）, q（時間片）, cs（情境切換成本）,
 *       tie（RR 同一時刻：'new' 新到達的先排、'old' 剛被換下的先排）, n（行程數）, arr[]、burst[]、pri[]（工作表）,
 *       sheet（'default'／'random'／'preset'／'hand'）, edits（親手改過的格數）,
 *       avgW、avgT、avgR（平均等待、周轉、回應時間）, maxW, wait[]、tat[]、resp[]、fin[]、first[]（每個行程）,
 *       switches（情境切換次數）, preempts（被搶先）, expires（用完時間片回佇列）, renews（時間片用完但沒人在等、繼續做）,
 *       gap（第一個行程到達之後 CPU 閒置的時間）, idle, csTime, csShare（切換時間占總時間的比例）, makespan, util,
 *       sameAsFcfs（甘特圖和 FCFS 完全相同）, ganttKinds（六種方法共有幾種不同的甘特圖）,
 *       otherTieW（RR 換另一種同一時刻規則時的平均等待時間）,
 *       all：{ <方法>: { avgW, avgT, avgR, switches, preempts, expires, gap, csTime, makespan, fin[], wait[] } }（同一張表、同樣設定的六種方法）,
 *       zero：{ <方法>: 情境切換成本為 0 時的平均等待時間 }, rrW[20]、rrSw[20]（RR 在 q = 1…20 的平均等待時間與切換次數） }
 */
(function () {
  'use strict';
  if (!window.LabMission) return;
  // 小工具寫在這裡（排行榜頁只載入任務檔、不載入核心）
  const EPS = 1e-6;
  const ALGOS = ['fcfs', 'sjf', 'srtf', 'rr', 'pn', 'pp'];
  const isRun = function (ev) { return ev.type === 'run'; };
  const same = function (a, b) { return Math.abs(a - b) < EPS; };
  const less = function (a, b) { return a < b - EPS; };
  const maxOf = function (a) { return Math.max.apply(null, a); };
  const minOf = function (a) { return Math.min.apply(null, a); };
  const sheetKey = function (d) { return d.arr.join(',') + '|' + d.burst.join(',') + '|' + d.q + '|' + d.cs; };

  LabMission.register('cpu-scheduling', [
    {
      id: 'cpu-scheduling-1', level: 1,
      title: { zh: '排完每一個', en: 'Everyone gets done' },
      desc: { zh: '按「播放」或「直接跑完」，讓每一個行程都做完。', en: 'Press “Play” or “Run to the end” so that every process finishes.' },
      check: function (ev) { return isRun(ev); }
    },
    {
      id: 'cpu-scheduling-2', level: 2,
      title: { zh: '輪到下一位', en: 'Next, please' },
      desc: { zh: '選「RR」跑到最後，而且至少有一個行程用完時間片、回到佇列最後面。', en: 'Choose “RR” and run to the end, with at least one process using up its quantum and going to the back of the queue.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.algo === 'rr' && d.expires >= 1; }
    },
    {
      id: 'cpu-scheduling-3', level: 2,
      title: { zh: 'CPU 在發呆', en: 'The CPU daydreams' },
      desc: { zh: '把某個行程的到達時間改晚，讓 CPU 在第一個行程到達之後閒置一段時間，再跑到最後。', en: 'Make some process arrive later so that the CPU sits idle for a while after the first process has arrived, then run to the end.' },
      check: function (ev) { return isRun(ev) && ev.data.gap > EPS; }
    },
    {
      id: 'cpu-scheduling-4', level: 3,
      title: { zh: '護航效應', en: 'The convoy effect' },
      desc: { zh: '選「FCFS」跑到最後，讓它的平均等待時間至少 5，而且至少是 SJF 的 3 倍。', en: 'Choose “FCFS” and run to the end, with an average waiting time of at least 5 and at least 3 times that of SJF.' },
      check: function (ev) {
        const d = ev.data;
        return isRun(ev) && d.algo === 'fcfs' && d.avgW >= 5 - EPS && d.avgW >= 3 * d.all.sjf.avgW - EPS;
      }
    },
    {
      id: 'cpu-scheduling-5', level: 4,
      title: { zh: '短工作插隊', en: 'The short job cuts in' },
      desc: { zh: '選「SRTF」跑到最後，讓它的平均等待時間比 SJF 少至少 2。', en: 'Choose “SRTF” and run to the end, with an average waiting time at least 2 less than SJF’s.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.algo === 'srtf' && d.all.sjf.avgW - d.avgW >= 2 - EPS; }
    },
    {
      id: 'cpu-scheduling-6', level: 4,
      title: { zh: '輪流比較好', en: 'Taking turns pays off' },
      desc: { zh: '至少 5 個行程，選「RR」跑到最後，讓平均等待時間比 FCFS 少。', en: 'With at least 5 processes, choose “RR” and run to the end with a smaller average waiting time than FCFS.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.algo === 'rr' && d.n >= 5 && less(d.avgW, d.all.fcfs.avgW); }
    },
    {
      id: 'cpu-scheduling-7', level: 5,
      title: { zh: '急事先辦', en: 'Urgent business first' },
      desc: { zh: '選「優先權（可搶先）」跑到最後，讓正在執行的行程至少兩次被更優先的行程搶走 CPU。', en: 'Choose “Priority (preemptive)” and run to the end, with a running process losing the CPU to a more urgent one at least twice.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.algo === 'pp' && d.preempts >= 2; }
    },
    {
      id: 'cpu-scheduling-8', level: 5,
      title: { zh: '切換的代價', en: 'The price of switching' },
      desc: { zh: '選「RR」，調大「情境切換成本」，讓切換花掉的時間至少占總時間的 30%，跑到最後。', en: 'Choose “RR”, raise the “Context-switch cost” and run to the end with switching taking at least 30% of the total time.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.algo === 'rr' && d.cs > 0 && d.csShare >= 0.3 - EPS; }
    },
    {
      id: 'cpu-scheduling-9', level: 6,
      title: { zh: '回應快、完成慢', en: 'Quick to answer, slow to finish' },
      desc: { zh: '選「RR」跑到最後，讓它的平均回應時間是六種方法中最短的，平均周轉時間卻是最長的（都不能平手）。', en: 'Choose “RR” and run to the end so that its average response time is the shortest of all six algorithms while its average turnaround time is the longest (no ties).' },
      check: function (ev) {
        const d = ev.data;
        if (!isRun(ev) || d.algo !== 'rr') return false;
        return ALGOS.every(function (a) { return a === 'rr' || (less(d.avgR, d.all[a].avgR) && less(d.all[a].avgT, d.avgT)); });
      }
    },
    {
      id: 'cpu-scheduling-10', level: 6,
      title: { zh: '最好的時間片', en: 'The best quantum' },
      desc: { zh: '選「RR」，調整「時間片 q（RR）」，讓平均等待時間是 q = 1 到 20 之中最少的，而且比 q = 1 和 FCFS 都少，跑到最後。', en: 'Choose “RR” and adjust the “Time quantum q (RR)” so that the average waiting time is the least for q = 1 to 20 and less than both q = 1 and FCFS, then run to the end.' },
      check: function (ev) {
        const d = ev.data;
        return isRun(ev) && d.algo === 'rr' && same(d.avgW, minOf(d.rrW)) && less(d.avgW, d.rrW[0]) && less(d.avgW, d.all.fcfs.avgW);
      }
    },
    {
      id: 'cpu-scheduling-11', level: 8,
      title: { zh: '十與五', en: 'Ten and five' },
      desc: { zh: '至少 4 個行程，讓 FCFS 的平均等待時間剛好是 10、SJF 剛好是 5，跑到最後。', en: 'With at least 4 processes, make FCFS’s average waiting time exactly 10 and SJF’s exactly 5, then run to the end.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.n >= 4 && same(d.all.fcfs.avgW, 10) && same(d.all.sjf.avgW, 5); }
    },

    // ---------- 隱藏任務（只給謎語；完成時只恭喜，不說原因） ----------
    {
      // 完美接力：至少 5 個行程，沒有人等過一刻，CPU 從第一個行程到達起也沒閒過
      id: 'cpu-scheduling-h1', level: 3, hidden: true,
      riddle: { zh: '門口從沒有人枯等，櫃台也從沒空過一刻——而且來了不只四位客人。', en: 'Nobody ever stood waiting at the door, and the counter was never empty for a moment — and more than four customers came.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.n >= 5 && same(maxOf(d.wait), 0) && same(d.gap, 0); }
    },
    {
      // RR 同一時刻的兩種排隊規則：同一張表、同樣的 q、沒有切換成本，先看過預設規則，再改成「被換下的先排」，平均等待時間差了至少 1
      id: 'cpu-scheduling-h2', level: 4, hidden: true,
      riddle: { zh: '同一瞬間，一位推門進來，一位被請回隊尾。誰先排？兩種答案你都看過了，而且差得可不只一點點。', en: 'At the same instant, one walks in through the door and another is sent back to the end of the line. Who queues first? You have seen both answers, and they differ by more than a little.' },
      check: function (ev, mem) {
        const d = ev.data;
        if (!isRun(ev) || d.algo !== 'rr') return false;
        const k = sheetKey(d);
        const seen = mem.seen = mem.seen || {};
        if (!seen[k]) {
          const keys = Object.keys(seen);
          if (keys.length > 60) delete seen[keys[0]];
          seen[k] = {};
        }
        seen[k][d.tie] = true;
        return d.tie === 'old' && d.cs === 0 && !!seen[k].new && Math.abs(d.avgW - d.otherTieW) >= 1 - EPS;
      }
    },
    {
      // 最糟的順序：至少 5 個行程同時到達、執行時間嚴格由長到短，用 FCFS 跑——所有順序中平均等待最多
      id: 'cpu-scheduling-h3', level: 5, hidden: true,
      riddle: { zh: '大象先過橋，螞蟻殿後。同時抵達的一大群旅人，從來沒有等得這麼久過。', en: 'The elephant crosses the bridge first and the ant goes last. A large party arriving together has never waited this long.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRun(ev) || d.algo !== 'fcfs' || d.n < 5) return false;
        for (let i = 1; i < d.n; i++) if (d.arr[i] !== d.arr[0] || d.burst[i] >= d.burst[i - 1]) return false;
        return true;
      }
    },
    {
      // 搶先接力：SRTF、沒有切換成本、至少 5 個行程，每一個後到的都搶先，而且都在任何人做完之前到達
      id: 'cpu-scheduling-h4', level: 6, hidden: true,
      riddle: { zh: '後浪推前浪，一浪接一浪，中間不曾停歇：每一位後來的，都把台上那位推了下去。至少五浪。', en: 'Wave after wave without a pause, each pushing the one before it off the stage: every newcomer took the stage from whoever stood there. At least five waves.' },
      check: function (ev) {
        const d = ev.data;
        return isRun(ev) && d.algo === 'srtf' && d.cs === 0 && d.n >= 5 && d.preempts === d.n - 1 && maxOf(d.arr) < minOf(d.fin) - EPS;
      }
    },
    {
      // 時間片邊界：RR（預設規則）的 q 比最長的執行時間短，甘特圖卻和 FCFS 一模一樣（時間片用完時都沒人在等，至少續用 2 次），
      // 有人等過、至少 4 個行程，而且這張表上 FCFS 不是最好的順序（SJF 比它少）
      id: 'cpu-scheduling-h5', level: 6, hidden: true,
      riddle: { zh: '鐘聲響了一次又一次，卻始終沒有人來換班。明明先來後到不是最聰明的排法，輪班表卻和它一模一樣。', en: 'The bell rang again and again, but nobody ever came to take over. First come, first served was not the smartest order here, and yet the rota matched it exactly.' },
      check: function (ev) {
        const d = ev.data;
        return isRun(ev) && d.algo === 'rr' && d.tie === 'new' && d.n >= 4 && d.sameAsFcfs && d.q < maxOf(d.burst) && d.renews >= 2 &&
          d.avgW > EPS && less(d.all.sjf.avgW, d.all.fcfs.avgW);
      }
    },
    {
      // 飢餓（Silberschatz 課本以「傳聞」記載：1973 年 MIT 關掉 IBM 7094 時，找到 1967 年送出、從沒執行的低優先權行程）：
      // SRTF 或優先權（可搶先）、沒有切換成本、至少 6 個行程；唯一最早到達的行程最後才做完，等待至少 20，
      // 而且至少 5 個行程是在別人已經做完之後才到的（源源不絕的新工作）
      id: 'cpu-scheduling-h6', level: 7, hidden: true,
      riddle: { zh: '傳說有一台老電腦退休那天，人們在它的佇列裡找到一個等了六年、從來沒輪到的工作。讓最早來的那一位，眼看後來的人一個接一個先走。', en: 'Legend has it that on the day an old computer was retired, people found a job in its queue that had waited six years and never run. Make the first to arrive watch everyone who came later leave before it.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRun(ev) || (d.algo !== 'srtf' && d.algo !== 'pp') || d.cs !== 0 || d.n < 6) return false;
        const a0 = minOf(d.arr), e = d.arr.indexOf(a0);
        let firstDone = Infinity, late = 0;
        for (let i = 0; i < d.n; i++) {
          if (i === e) continue;
          if (d.arr[i] === a0 || d.fin[i] >= d.fin[e] - EPS) return false;
          firstDone = Math.min(firstDone, d.fin[i]);
        }
        for (let i = 0; i < d.n; i++) if (i !== e && d.arr[i] >= firstDone - EPS) late++;
        return d.wait[e] >= 20 - EPS && late >= 5;
      }
    },
    {
      // 周轉時間全部相同：至少 5 個行程，有人等過，但每個行程從到達到完成都花一樣久
      // （例如 FCFS：第一個最長，之後每一個都在前一個到達後「自己的執行時間」那麼久才到）
      id: 'cpu-scheduling-h7', level: 7, hidden: true,
      riddle: { zh: '有人一進門就被招呼，有人得在門口等；可是每一位從進門到離開，花的時間都一模一樣。至少五位。', en: 'Some were served the moment they walked in, others had to wait at the door; yet every one of them spent exactly the same time from coming in to leaving. At least five.' },
      check: function (ev) {
        const d = ev.data;
        return isRun(ev) && d.n >= 5 && d.avgW > EPS && d.tat.every(function (v) { return same(v, d.tat[0]); });
      }
    },
    {
      // SJF 被打敗：到達時間不同時，非搶先的 SJF 不一定最好；優先權（不搶先）的平均等待時間比 SJF 少
      id: 'cpu-scheduling-h8', level: 8, hidden: true,
      riddle: { zh: '「最短的先走」原來不是最好的辦法：一位不看長短、只看名牌的守門人，讓大家等得更少。', en: '“Shortest first” turns out not to be the best rule: a doorkeeper who ignores length and only reads name tags makes everyone wait less.' },
      check: function (ev) { const d = ev.data; return isRun(ev) && d.algo === 'pn' && less(d.avgW, d.all.sjf.avgW); }
    },
    {
      // RR 走出最佳解：RR（預設規則、沒有切換成本、至少 4 個行程）至少兩次用完時間片，平均等待時間卻和 SRTF（所有排程中的最小值）一樣，
      // 而且比 FCFS 和 SJF 都少
      id: 'cpu-scheduling-h9', level: 8, hidden: true,
      riddle: { zh: '一位只會喊「下一位」的值日生，竟然排出了只有先知才排得出的名單——而且它真的喊過好幾次。', en: 'A monitor who can only call “Next!” came up with the line-up that only a prophet could plan — and it really did call it more than once.' },
      check: function (ev) {
        const d = ev.data;
        return isRun(ev) && d.algo === 'rr' && d.tie === 'new' && d.cs === 0 && d.n >= 4 && d.expires >= 2 &&
          same(d.avgW, d.all.srtf.avgW) && less(d.avgW, d.all.fcfs.avgW) && less(d.avgW, d.all.sjf.avgW);
      }
    },
    {
      // 六位裁判：六種方法的平均等待時間完全相同而且大於 0，但甘特圖不全一樣；至少 5 個行程，執行時間互不相同
      id: 'cpu-scheduling-h10', level: 10, hidden: true,
      riddle: { zh: '六位裁判，六本規則，走了不同的路，卻宣讀了同一個判決。被告沒有兩位一樣高，而且真的有人等過。', en: 'Six judges, six rulebooks, different roads — and yet the very same verdict. No two of the accused are the same height, and someone really did wait.' },
      check: function (ev) {
        const d = ev.data;
        if (!isRun(ev) || d.n < 5 || d.ganttKinds < 2 || !(d.avgW > EPS)) return false;
        for (let i = 0; i < d.n; i++) for (let j = i + 1; j < d.n; j++) if (d.burst[i] === d.burst[j]) return false;
        return ALGOS.every(function (a) { return same(d.all[a].avgW, d.avgW); });
      }
    }
  ]);
})();
