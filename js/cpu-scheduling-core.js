/* cpu-scheduling-core.js — CPU 排程的計算核心（與畫面分離；Node 單元測試：tests/cpu-scheduling-core.test.js）
 *
 * 模型：單一 CPU，n 個行程，每個行程只有一段 CPU 工作（沒有 I/O）。行程 i 在到達時間 arr[i] 進入就緒佇列，
 * 需要 CPU 執行 burst[i] 個時間單位；優先權 pri[i] 的數字越小越優先（照 Silberschatz 的課本慣例）。
 *
 * 六種演算法：
 *   fcfs 先到先做（非搶先）：就緒佇列先進先出。
 *   sjf  最短優先（非搶先）：CPU 空下來時，挑執行時間最短的。
 *   srtf 最短剩餘時間優先（搶先）：有新行程到達時，若它的執行時間「嚴格小於」正在執行者的剩餘時間，就搶先。
 *   rr   輪流（時間片 q，搶先）：先進先出，每次最多執行 q；時間片用完還沒做完的回到佇列尾。
 *   pn   優先權（非搶先）；pp 優先權（搶先：新到達者的優先權數字「嚴格小於」正在執行者才搶先）。
 *
 * 平手規則（全部寫死、單元測試涵蓋）：
 *   1. 鍵值相同（執行時間、剩餘時間或優先權）時，先比到達時間，再比編號（編號小的先）。FCFS、RR 的佇列也照這個順序收新到達的行程。
 *   2. 搶先只在新到達者「嚴格」比較好時發生；一樣好時讓正在執行的繼續（不白白切換）。
 *   3. RR：行程在時間片用完的那一刻剛好做完，算做完（不回佇列）。
 *      同一時刻「新到達的行程」與「剛用完時間片的行程」都要進佇列時，預設新到達的先排（tie = 'new'，
 *      Stallings《Operating Systems》第 9 章五個行程 A–E 的例子就是這樣算，單元測試對照）；tie = 'old' 則讓剛被換下的先排。
 *      時間片用完時若佇列裡沒有別人（或排在最前面的就是它自己），它直接再拿一個時間片，不算切換。
 *
 * 情境切換成本 cs（≥ 0）：CPU 從一個行程直接換到另一個行程時，中間花 cs 個時間單位；切換結束的那一刻才從就緒佇列挑下一個
 *   （切換期間到達的行程也一起比）。CPU 閒置之後開始執行，不算切換。cs = 0 時切換照樣計次，只是不花時間。
 *
 * 指標（Silberschatz, Galvin, Gagne《Operating System Concepts》第 10 版 5.2 節的定義）：
 *   周轉時間 = 完成時間 − 到達時間；等待時間 = 在就緒佇列裡等待的時間總和 = 周轉時間 − 執行時間（含等切換的時間）；
 *   回應時間 = 第一次開始執行的時間 − 到達時間。
 * 時間都是整數或 0.5 的倍數，用一般浮點數就能精確表示。
 */
(function (root) {
  'use strict';
  const ALGOS = ['fcfs', 'sjf', 'srtf', 'rr', 'pn', 'pp'];
  const PREEMPTIVE = { srtf: true, rr: true, pp: true };
  const LIMITS = { nMin: 3, nMax: 8, arrMax: 30, burstMin: 1, burstMax: 20, priMin: 1, priMax: 9, qMin: 1, qMax: 20, csMax: 2 };
  const EPS = 1e-9;

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
  const clampInt = function (v, lo, hi) { v = Math.round(+v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo; };

  /** 把一個行程的欄位限制在合法範圍（到達 0–30、執行 1–20、優先權 1–9，都是整數） */
  function sanitize(p) {
    return { arr: clampInt(p.arr, 0, LIMITS.arrMax), burst: clampInt(p.burst, LIMITS.burstMin, LIMITS.burstMax), pri: clampInt(p.pri == null ? 1 : p.pri, LIMITS.priMin, LIMITS.priMax) };
  }

  /** 第 i 個隨機行程（同一個種子、同一個 i 一定得到同一個行程；增加行程數時舊的行程不變） */
  function randomProc(seed, i) {
    const r = rng((seed * 7919 + i * 104729 + 13) >>> 0);
    r(); r();
    return { arr: Math.floor(r() * 13), burst: 1 + Math.floor(r() * 10), pri: 1 + Math.floor(r() * 5) };
  }
  /** 有種子的隨機工作表：n 個行程，到達 0–12、執行 1–10、優先權 1–5 */
  function randomSheet(seed, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(randomProc(seed, i));
    return out;
  }

  /**
   * 排程模擬（事件驅動）。procs: [{arr, burst, pri}]；opt: { q, cs, tie: 'new'|'old' }
   * 回傳：
   *   segs   甘特圖：{ kind: 'run', p, t0, t1, end: 'finish'|'expire'|'preempt' } | { kind: 'cs', t0, t1, from, to } | { kind: 'idle', t0, t1 }
   *   ticks  RR 時間片用完卻沒有換人、直接續用的時刻 { t, p }
   *   frames 每個事件之後的狀態 { t, state: 'idle'|'run'|'cs'|'end', cur, ready: [行程…], rem: [剩餘…], from }（畫面用來重建任何時刻的就緒佇列）
   *   events { t, type: 'arrive'|'start'|'preempt'|'expire'|'renew'|'finish', p, by }
   *   fin, first, wait, tat, resp（每個行程），avgW、avgT、avgR、maxW、switches、preempts、expires、idle（全部閒置）、gap（第一個行程到達之後的閒置）、
   *   csTime、makespan、busy、util、csShare
   */
  function schedule(procs, algo, opt) {
    opt = opt || {};
    if (ALGOS.indexOf(algo) < 0) throw new Error('沒有這種演算法：' + algo);
    const n = procs.length;
    const q = Math.max(1, +opt.q || 4);
    const cs = Math.max(0, +opt.cs || 0);
    const oldFirst = opt.tie === 'old';
    const arr = procs.map(function (p) { return +p.arr; });
    const bur = procs.map(function (p) { return +p.burst; });
    const pri = procs.map(function (p) { return p.pri == null ? 1 : +p.pri; });
    const order = procs.map(function (_, i) { return i; }).sort(function (a, b) { return arr[a] - arr[b] || a - b; });
    const rem = bur.slice();
    const fin = new Array(n).fill(null), first = new Array(n).fill(null);
    const segs = [], ticks = [], frames = [], events = [];
    let t = 0, ai = 0, done = 0;
    let state = 'idle', cur = -1, segStart = 0, sliceEnd = Infinity, csEnd = 0, csFrom = -1;
    const ready = [];
    let switches = 0, preempts = 0, expires = 0, idle = 0, csTime = 0;

    const keyOf = algo === 'sjf' ? function (p) { return bur[p]; }
      : algo === 'srtf' ? function (p) { return rem[p]; }
        : (algo === 'pn' || algo === 'pp') ? function (p) { return pri[p]; } : null;
    /** a 是否比 b 優先（鍵值 → 到達時間 → 編號） */
    function better(a, b) {
      const ka = keyOf(a), kb = keyOf(b);
      if (ka < kb - EPS) return true;
      if (ka > kb + EPS) return false;
      if (arr[a] !== arr[b]) return arr[a] < arr[b];
      return a < b;
    }
    function nextArr() { return ai < n ? arr[order[ai]] : Infinity; }
    function admit(upTo) {
      while (ai < n && arr[order[ai]] <= upTo + EPS) {
        const p = order[ai++];
        ready.push(p);
        events.push({ t: arr[p], type: 'arrive', p: p });
      }
    }
    function pick() {
      if (!keyOf) return ready.shift();
      let bi = 0;
      for (let i = 1; i < ready.length; i++) if (better(ready[i], ready[bi])) bi = i;
      return ready.splice(bi, 1)[0];
    }
    function frame() {
      frames.push({ t: t, state: state, cur: cur, ready: ready.slice(), rem: rem.slice(), from: state === 'cs' ? csFrom : -1 });
    }
    function start(p) {
      if (first[p] === null) first[p] = t;
      state = 'run'; cur = p; segStart = t;
      sliceEnd = algo === 'rr' ? t + q : Infinity;
      events.push({ t: t, type: 'start', p: p });
    }
    function closeRun(why) { segs.push({ kind: 'run', p: cur, t0: segStart, t1: t, end: why }); }
    /** 正在執行的行程停下來（做完、時間片用完或被搶先）之後：佇列空就閒置；否則切換到下一個 */
    function afterStop(prev) {
      cur = -1;
      if (!ready.length) {
        if (done === n) { state = 'end'; return; }
        state = 'idle'; segStart = t; return;
      }
      switches++;
      if (cs > 0) { state = 'cs'; csFrom = prev; csEnd = t + cs; segStart = t; return; }
      start(pick());
    }

    frame();
    let guard = 0;
    while (state !== 'end') {
      if (++guard > 200000) throw new Error('排程模擬沒有結束');
      if (state === 'idle') {
        const ta = nextArr();
        if (ta > t + EPS) { segs.push({ kind: 'idle', t0: t, t1: ta }); idle += ta - t; t = ta; }
        admit(t);
        start(pick());
        frame();
        continue;
      }
      if (state === 'cs') {
        const ta = nextArr();
        if (ta < csEnd - EPS) { t = ta; admit(t); frame(); continue; }
        t = csEnd;
        csTime += cs;
        admit(t);
        const p = pick();
        segs.push({ kind: 'cs', t0: segStart, t1: t, from: csFrom, to: p });
        start(p);
        frame();
        continue;
      }
      // state === 'run'
      const tEnd = Math.min(t + rem[cur], sliceEnd);
      const ta = nextArr();
      if (ta < tEnd - EPS) {
        // 執行中有行程到達
        rem[cur] -= ta - t; t = ta;
        const before = ready.length;
        admit(t);
        if (algo === 'srtf' || algo === 'pp') {
          let best = -1;
          for (let i = before; i < ready.length; i++) {
            const p = ready[i];
            if (keyOf(p) < keyOf(cur) - EPS && (best < 0 || better(p, best))) best = p;
          }
          if (best >= 0) {
            closeRun('preempt'); preempts++;
            events.push({ t: t, type: 'preempt', p: cur, by: best });
            ready.push(cur);
            afterStop(cur);
          }
        }
        frame();
        continue;
      }
      rem[cur] -= tEnd - t; t = tEnd;
      if (rem[cur] <= EPS) {
        rem[cur] = 0;
        closeRun('finish'); fin[cur] = t; done++;
        events.push({ t: t, type: 'finish', p: cur });
        admit(t);
        afterStop(cur);
        frame();
        continue;
      }
      // RR：時間片用完
      if (oldFirst) { ready.push(cur); admit(t); } else { admit(t); ready.push(cur); }
      if (ready[0] === cur) {
        ready.shift();
        sliceEnd = t + q;
        ticks.push({ t: t, p: cur });
        events.push({ t: t, type: 'renew', p: cur });
        frame();
        continue;
      }
      closeRun('expire'); expires++;
      events.push({ t: t, type: 'expire', p: cur });
      afterStop(cur);
      frame();
    }

    const wait = [], tat = [], resp = [];
    let sW = 0, sT = 0, sR = 0, maxW = 0, makespan = 0, busy = 0;
    for (let i = 0; i < n; i++) {
      tat.push(fin[i] - arr[i]);
      wait.push(fin[i] - arr[i] - bur[i]);
      resp.push(first[i] - arr[i]);
      sW += wait[i]; sT += tat[i]; sR += resp[i];
      maxW = Math.max(maxW, wait[i]);
      makespan = Math.max(makespan, fin[i]);
      busy += bur[i];
    }
    const firstArr = n ? arr[order[0]] : 0;
    return {
      algo: algo, q: q, cs: cs, tie: oldFirst ? 'old' : 'new', n: n,
      segs: segs, ticks: ticks, frames: frames, events: events,
      fin: fin, first: first, wait: wait, tat: tat, resp: resp,
      avgW: n ? sW / n : 0, avgT: n ? sT / n : 0, avgR: n ? sR / n : 0, maxW: maxW,
      switches: switches, preempts: preempts, expires: expires,
      idle: idle, gap: idle - firstArr, csTime: csTime,
      makespan: makespan, busy: busy,
      util: makespan > 0 ? busy / makespan : 0,
      csShare: makespan > 0 ? csTime / makespan : 0
    };
  }

  /** 六種演算法一起算（同樣的 q、cs、tie） */
  function runAll(procs, opt) {
    const out = {};
    ALGOS.forEach(function (a) { out[a] = schedule(procs, a, opt); });
    return out;
  }

  /** 任意時刻 t 的狀態（畫面用）：{ state, cur, ready, rem, from } */
  function stateAt(res, t) {
    const F = res.frames;
    let lo = 0, hi = F.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (F[mid].t <= t + EPS) lo = mid; else hi = mid - 1; }
    const f = F[lo];
    const rem = f.rem.slice();
    if (f.state === 'run' && f.cur >= 0) rem[f.cur] = Math.max(0, rem[f.cur] - (t - f.t));
    return { t: t, state: f.state, cur: f.cur, ready: f.ready, rem: rem, from: f.from };
  }

  /** 甘特圖的「指紋」：只看執行段（誰在什麼時間執行），用來比較兩種排程是否完全一樣 */
  function ganttKey(res) {
    return res.segs.filter(function (s) { return s.kind === 'run'; }).map(function (s) { return s.p + '@' + s.t0 + '-' + s.t1; }).join(',');
  }
  function sameGantt(a, b) { return ganttKey(a) === ganttKey(b); }

  /** 排程是否合理（測試用）：回傳錯誤訊息清單，空的表示沒問題 */
  function validate(procs, res) {
    const errs = [];
    const n = procs.length;
    const runTime = new Array(n).fill(0);
    let tPrev = 0;
    res.segs.forEach(function (s, k) {
      if (s.t1 < s.t0 - EPS) errs.push('第 ' + k + ' 段時間倒流');
      if (Math.abs(s.t0 - tPrev) > EPS) errs.push('第 ' + k + ' 段沒有接在前一段後面（' + tPrev + ' → ' + s.t0 + '）');
      tPrev = s.t1;
      if (s.kind === 'run') {
        runTime[s.p] += s.t1 - s.t0;
        if (s.t0 < procs[s.p].arr - EPS) errs.push('P' + (s.p + 1) + ' 在到達之前就執行');
      }
      if (s.kind === 'idle') {
        for (let i = 0; i < n; i++) {
          if (procs[i].arr <= s.t0 + EPS && res.fin[i] > s.t0 + EPS) errs.push('閒置 [' + s.t0 + ', ' + s.t1 + '] 時 P' + (i + 1) + ' 在等');
          if (procs[i].arr > s.t0 + EPS && procs[i].arr < s.t1 - EPS) errs.push('閒置 [' + s.t0 + ', ' + s.t1 + '] 時 P' + (i + 1) + ' 已經到達');
        }
      }
    });
    if (Math.abs(tPrev - res.makespan) > EPS) errs.push('甘特圖結束在 ' + tPrev + '，最後完成時間是 ' + res.makespan);
    for (let i = 0; i < n; i++) {
      if (Math.abs(runTime[i] - procs[i].burst) > EPS) errs.push('P' + (i + 1) + ' 執行了 ' + runTime[i] + '，應該是 ' + procs[i].burst);
      if (res.wait[i] < -EPS) errs.push('P' + (i + 1) + ' 等待時間是負的');
      if (res.resp[i] > res.wait[i] + EPS) errs.push('P' + (i + 1) + ' 回應時間比等待時間長');
    }
    return errs;
  }

  /** 就緒佇列長度對時間的積分（＝所有行程等待時間的總和；測試與讀數用） */
  function queueArea(res) {
    const F = res.frames;
    let s = 0;
    for (let k = 0; k + 1 < F.length; k++) s += F[k].ready.length * (F[k + 1].t - F[k].t);
    return s;
  }

  // ---------- 暴力驗證用 ----------
  function permutations(n) {
    const out = [], a = [];
    const used = new Array(n).fill(false);
    (function rec() {
      if (a.length === n) { out.push(a.slice()); return; }
      for (let i = 0; i < n; i++) if (!used[i]) { used[i] = true; a.push(i); rec(); a.pop(); used[i] = false; }
    })();
    return out;
  }
  /** 照指定的順序、不搶先，每個行程盡早開始（可能先空等後面的人到）：回傳平均等待時間 */
  function orderWait(procs, perm, cs) {
    let t = 0, s = 0, last = -1;
    perm.forEach(function (i) {
      const p = procs[i];
      let st = Math.max(t, p.arr);
      if (cs && last >= 0 && st <= t + EPS) st = t + cs;   // 直接接著上一個：要花切換時間
      s += st - p.arr;
      t = st + p.burst; last = i;
    });
    return s / procs.length;
  }
  /** 所有不搶先排程（n! 種順序，每個盡早開始）的平均等待時間：{ min, max, minPerm, maxPerm } */
  function nonPreemptiveRange(procs) {
    let min = Infinity, max = -Infinity, minPerm = null, maxPerm = null;
    permutations(procs.length).forEach(function (pm) {
      const w = orderWait(procs, pm, 0);
      if (w < min - EPS) { min = w; minPerm = pm; }
      if (w > max + EPS) { max = w; maxPerm = pm; }
    });
    return { min: min, max: max, minPerm: minPerm, maxPerm: maxPerm };
  }
  /** 所有排程（可以搶先、可以故意閒置；時間以 1 為單位切開）中最小的平均等待時間：動態規劃窮舉，n ≤ 6 而且時間不太長時用 */
  function optimalPreemptive(procs) {
    const n = procs.length;
    const arr = procs.map(function (p) { return p.arr; }), bur = procs.map(function (p) { return p.burst; });
    const T = Math.max.apply(null, arr) + bur.reduce(function (s, v) { return s + v; }, 0);
    const memo = new Map();
    function f(t, rem) {
      let left = 0;
      for (let i = 0; i < n; i++) left += rem[i];
      if (!left) return 0;
      if (t >= T) return Infinity;
      const key = t + '|' + rem.join(',');
      if (memo.has(key)) return memo.get(key);
      let present = 0;
      for (let i = 0; i < n; i++) if (rem[i] > 0 && arr[i] <= t) present++;
      let best = f(t + 1, rem);   // 閒置一個單位
      for (let i = 0; i < n; i++) if (rem[i] > 0 && arr[i] <= t) {
        rem[i]--;
        best = Math.min(best, f(t + 1, rem));
        rem[i]++;
      }
      best += present;
      memo.set(key, best);
      return best;
    }
    const totalTat = f(0, bur.slice());
    return (totalTat - bur.reduce(function (s, v) { return s + v; }, 0)) / n;
  }

  /** RR 的時間片從 1 掃到 qMax：每個 q 的平均等待時間與切換次數 */
  function rrScan(procs, opt, qMax) {
    qMax = qMax || LIMITS.qMax;
    const w = [], sw = [];
    for (let q = 1; q <= qMax; q++) {
      const r = schedule(procs, 'rr', { q: q, cs: opt && opt.cs, tie: opt && opt.tie });
      w.push(r.avgW); sw.push(r.switches);
    }
    return { avgW: w, switches: sw };
  }

  function fmt(v, d) {
    if (v == null || !isFinite(v)) return '—';
    const k = Math.pow(10, d == null ? 2 : d);
    const r = Math.round(v * k) / k;
    return String(Object.is(r, -0) ? 0 : r);
  }

  const API = {
    ALGOS: ALGOS, PREEMPTIVE: PREEMPTIVE, LIMITS: LIMITS,
    rng: rng, sanitize: sanitize, randomProc: randomProc, randomSheet: randomSheet,
    schedule: schedule, runAll: runAll, stateAt: stateAt, ganttKey: ganttKey, sameGantt: sameGantt,
    validate: validate, queueArea: queueArea,
    permutations: permutations, orderWait: orderWait, nonPreemptiveRange: nonPreemptiveRange, optimalPreemptive: optimalPreemptive,
    rrScan: rrScan, fmt: fmt
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CpuSchedCore = API;
})(typeof window !== 'undefined' ? window : this);
