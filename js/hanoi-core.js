/* hanoi-core.js — 「河內塔」的計算核心（與畫面分離；Node 單元測試：tests/hanoi-core.test.js）
 *
 * 狀態：三根柱子 0、1、2（畫面上叫 A、B、C），盤子 1（最小）到 n（最大）。
 *   每個盤子在哪一根柱子上就決定了整個狀態（同一根柱子上一定是大的在下面），所以合法狀態剛好 3^n 個。
 *   pos[d] = 盤 d 所在的柱子（d = 1..n，pos[0] 不用）；編碼 code = Σ pos[d]·3^(d−1)；文字 'AABC…'（第 1 個字母是盤 1）。
 * 最少步數：T(n) = 2T(n−1) + 1、T(1) = 1，所以 T(n) = 2^n − 1（Graham、Knuth、Patashnik《Concrete Mathematics》1.1 節）。
 * 尺規函數：最佳解的第 k 步搬的是盤 ν2(k) + 1，ν2(k) = k 的二進位尾端 0 的個數（OEIS A001511）。
 * 任意狀態到「全部在柱 t」的最短步數（由最大的盤往下看）：
 *   盤 k 已在 t → 只要處理盤 1..k−1（目標仍是 t）；
 *   盤 k 不在 t → 先把盤 1..k−1 全搬到第三根柱 o，再搬盤 k，再把 1..k−1 從 o 搬到 t：
 *     d(k, t) = d(k−1, o) + 1 + (2^(k−1) − 1) = d(k−1, o) + 2^(k−1)。
 * 一般狀態之間：最大的盤若要換柱，最短路上它不是直接搬一次，就是經過第三根柱搬兩次（Hinz 1992）。
 * 狀態圖（Hanoi graph）：每個狀態一個點、每個合法移動一條邊，畫起來是謝爾賓斯基三角形（layout）。
 *
 * Session：頁面與任務證明共用的操作邏輯（親手移動、上一步、重來、打亂、自動解、廣度優先搜尋、挑戰、傳說計算），
 *   在關鍵時刻呼叫 opts.emit(type, data)；頁面把它轉給 LabMission.emit，任務證明直接收集。
 */
(function (root) {
  'use strict';
  const PEG = ['A', 'B', 'C'];
  const MAX_N = 10;          // 頁面的盤子數上限
  const GRAPH_MAX = 7;       // 狀態圖最多畫到 7 個盤子（3^7 = 2187 個點）；再多就太密，不畫
  const QUIZ_N = 10;         // 挑戰題一律是 10 個盤子、從 A 搬到 C 的最佳解
  const YEAR = 31557600;     // 一年 = 365.25 天的秒數（儒略年）

  // ---------------------------------------------------------------- 小工具
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
  const pow2 = function (k) { return Math.pow(2, k); };
  const pow3 = function (k) { return Math.pow(3, k); };
  function minMoves(n) { return pow2(n) - 1; }
  /** 尺規函數：k ≥ 1 時傳回二進位尾端 0 的個數 + 1（= 最佳解第 k 步搬的盤子） */
  function ruler(k) {
    k = Math.floor(k);
    if (!(k >= 1)) return 0;
    let z = 0;
    while (k % 2 === 0) { k /= 2; z++; }
    return z + 1;
  }
  function trailingZeros(k) { return ruler(k) - 1; }
  function third(a, b) { return 3 - a - b; }

  // ---------------------------------------------------------------- 狀態
  function perfect(n, peg) { const p = [0]; for (let d = 1; d <= n; d++) p.push(peg); return p; }
  function encode(pos, n) { let c = 0; for (let d = n; d >= 1; d--) c = c * 3 + pos[d]; return c; }
  function decode(code, n) { const p = [0]; for (let d = 1; d <= n; d++) { p.push(code % 3); code = Math.floor(code / 3); } return p; }
  function str(pos, n) { let s = ''; for (let d = 1; d <= n; d++) s += PEG[pos[d]]; return s; }
  function parse(s) { const p = [0]; for (let i = 0; i < s.length; i++) p.push(PEG.indexOf(s[i].toUpperCase())); return p; }
  /** 每根柱子最上面的盤（沒有盤時是 0） */
  function tops(pos, n) {
    const t = [0, 0, 0];
    for (let d = n; d >= 1; d--) t[pos[d]] = d;
    return t;
  }
  /** 每根柱子由下而上的盤子 */
  function stacks(pos, n) {
    const s = [[], [], []];
    for (let d = n; d >= 1; d--) s[pos[d]].push(d);
    return s;
  }
  /** 全部在同一根柱子上時傳回那根柱子，否則 −1 */
  function perfectPeg(pos, n) {
    for (let d = 2; d <= n; d++) if (pos[d] !== pos[1]) return -1;
    return n >= 1 ? pos[1] : -1;
  }
  /** 從柱 a 搬到柱 b 合法嗎？傳回 { ok, disk, onto, reason } */
  function check(pos, n, a, b) {
    if (a === b) return { ok: false, reason: 'same' };
    const t = tops(pos, n);
    if (!t[a]) return { ok: false, reason: 'empty' };
    if (t[b] && t[b] < t[a]) return { ok: false, reason: 'big', disk: t[a], onto: t[b] };
    return { ok: true, disk: t[a], onto: t[b] };
  }
  function legalMoves(pos, n) {
    const out = [], t = tops(pos, n);
    for (let a = 0; a < 3; a++) {
      if (!t[a]) continue;
      for (let b = 0; b < 3; b++) if (a !== b && (!t[b] || t[b] > t[a])) out.push([a, b]);
    }
    return out;
  }

  // ---------------------------------------------------------------- 最短步數（公式）
  /** 盤 1..k 從目前狀態全部搬到柱 t 的最少步數（由大往小） */
  function distToPerfect(pos, k, t) {
    let s = 0;
    for (let d = k; d >= 1; d--) {
      if (pos[d] !== t) { s += pow2(d - 1); t = third(pos[d], t); }
    }
    return s;
  }
  /** 最短路（一串移動）：盤 1..k 全部搬到 t。用遞迴寫，結果與 BFS 的最短步數相同（測試） */
  function pathToPerfect(pos, k, t) {
    const p = pos.slice(), out = [];
    (function solve(k, t) {
      if (k === 0) return;
      if (p[k] === t) { solve(k - 1, t); return; }
      const from = p[k], o = third(from, t);
      solve(k - 1, o);
      out.push({ disk: k, from: from, to: t }); p[k] = t;
      hanoiInto(k - 1, o, t, third(o, t), out, p);
    })(k, t);
    return out;
  }
  function hanoiInto(k, from, to, via, out, p) {
    if (k === 0) return;
    hanoiInto(k - 1, from, via, to, out, p);
    out.push({ disk: k, from: from, to: to });
    if (p) p[k] = to;
    hanoiInto(k - 1, via, to, from, out, p);
  }
  /** 標準的遞迴解：把 n 個盤子從 from 搬到 to */
  function hanoiMoves(n, from, to) { const out = []; hanoiInto(n, from, to, third(from, to), out, null); return out; }
  /**
   * 不用遞迴的解法：奇數步搬最小的盤，永遠往同一個方向繞（n 是奇數時 from → to → via → from，偶數時 from → via → to → from）；
   * 偶數步做「不動最小盤」的那唯一一個合法移動。
   */
  function iterativeMoves(n, from, to) {
    const via = third(from, to), cyc = n % 2 ? [from, to, via] : [from, via, to];
    const p = perfect(n, from), out = [], total = minMoves(n);
    let small = 0; // 最小盤在 cyc 的第幾個位置
    for (let k = 1; k <= total; k++) {
      if (k % 2) {
        const a = cyc[small], b = cyc[(small + 1) % 3];
        out.push({ disk: 1, from: a, to: b }); p[1] = b; small = (small + 1) % 3;
      } else {
        const t = tops(p, n), s = p[1];
        const x = (s + 1) % 3, y = (s + 2) % 3;
        let a, b;
        if (!t[x]) { a = y; b = x; } else if (!t[y]) { a = x; b = y; } else if (t[x] < t[y]) { a = x; b = y; } else { a = y; b = x; }
        out.push({ disk: t[a], from: a, to: b }); p[t[a]] = b;
      }
    }
    return out;
  }
  /** 最佳解（from → to、n 個盤）第 k 步的移動，不必把前面的步驟做一遍 */
  function moveAt(k, n, from, to) {
    const d = ruler(k), m = (k / pow2(d - 1) + 1) / 2;   // 這是盤 d 的第 m 次移動
    const via = third(from, to), cyc = (n - d) % 2 === 0 ? [from, to, via] : [from, via, to];
    return { disk: d, from: cyc[(m - 1) % 3], to: cyc[m % 3], m: m };
  }
  /** 最佳解第 k 步之後的狀態：盤 d 已經搬了 ⌊(k + 2^(d−1)) / 2^d⌋ 次，每次沿自己固定的方向前進一格 */
  function stateAt(k, n, from, to) {
    const via = third(from, to), p = [0];
    for (let d = 1; d <= n; d++) {
      const m = Math.floor((k + pow2(d - 1)) / pow2(d));
      const cyc = (n - d) % 2 === 0 ? [from, to, via] : [from, via, to];
      p.push(cyc[m % 3]);
    }
    return p;
  }

  // ---------------------------------------------------------------- 狀態圖
  function neighbors(code, n) {
    const p = decode(code, n), out = [];
    legalMoves(p, n).forEach(function (mv) {
      const d = tops(p, n)[mv[0]];
      out.push(code + (mv[1] - mv[0]) * pow3(d - 1));
    });
    return out;
  }
  /** 廣度優先搜尋：從 src 出發的距離表（Int32Array，3^n 格）、拜訪順序與層數 */
  function bfs(src, n) {
    const N = pow3(n), dist = new Int32Array(N).fill(-1), order = new Int32Array(N);
    let head = 0, tail = 0;
    dist[src] = 0; order[tail++] = src;
    const p = new Int8Array(n + 1), t = [0, 0, 0];
    while (head < tail) {
      const c = order[head++];
      let x = c;
      for (let d = 1; d <= n; d++) { p[d] = x % 3; x = (x - p[d]) / 3; }
      t[0] = t[1] = t[2] = 0;
      for (let d = n; d >= 1; d--) t[p[d]] = d;
      for (let a = 0; a < 3; a++) {
        if (!t[a]) continue;
        for (let b = 0; b < 3; b++) {
          if (a === b || (t[b] && t[b] < t[a])) continue;
          const m = c + (b - a) * pow3(t[a] - 1);
          if (dist[m] < 0) { dist[m] = dist[c] + 1; order[tail++] = m; }
        }
      }
    }
    return { dist: dist, order: order, count: tail, layers: dist[order[tail - 1]] };
  }
  /** 謝爾賓斯基三角形的座標：A 左下、B 上、C 右下；每往小一號，子三角形內把另外兩根柱子的角互換（鏡射） */
  const VX = [0, 0.5, 1], VY = [0, Math.sqrt(3) / 2, 0];
  function layout(n) {
    const N = pow3(n), xy = new Float64Array(2 * N), S = pow2(n) - 1;
    for (let c = 0; c < N; c++) {
      const p = decode(c, n);
      const perm = [0, 1, 2];
      let x = 0, y = 0;
      for (let d = n; d >= 1; d--) {
        const corner = perm[p[d]];
        x += pow2(d - 1) * VX[corner]; y += pow2(d - 1) * VY[corner];
        // 子三角形裡：p[d] 以外的兩根柱子互換
        const a = (p[d] + 1) % 3, b = (p[d] + 2) % 3, tmp = perm[a]; perm[a] = perm[b]; perm[b] = tmp;
      }
      xy[2 * c] = S ? x / S : 0.5; xy[2 * c + 1] = S ? y / S : 0;
    }
    return xy;
  }
  /** 每條邊一次：[a, b, 搬的盤] */
  function edges(n) {
    const out = [], N = pow3(n);
    for (let c = 0; c < N; c++) {
      const p = decode(c, n), t = tops(p, n);
      legalMoves(p, n).forEach(function (mv) {
        const m = c + (mv[1] - mv[0]) * pow3(t[mv[0]] - 1);
        if (m > c) out.push([c, m, t[mv[0]]]);
      });
    }
    return out;
  }
  /**
   * 兩個狀態的最大盤在不同柱子（i ≠ j）時：
   *   d1 = 最大盤只搬一次（i → j）的最短步數 = 盤 1..n−1 到第三柱 k + 1 + 從全在 k 到目標的 1..n−1；
   *   d2 = 最大盤經過第三柱搬兩次（i → k → j）= 1..n−1 到 j + 1 + (2^(n−1) − 1) + 1 + 從全在 i 到目標的 1..n−1。
   * 真正的最短步數 = min(d1, d2)（Hinz 1992；測試與 BFS 比對）。同一根柱子時傳回 null。
   */
  function bigMoveDists(s, t, n) {
    const i = s[n], j = t[n];
    if (i === j) return null;
    const k = third(i, j);
    return { i: i, j: j, d1: distToPerfect(s, n - 1, k) + 1 + distToPerfect(t, n - 1, k), d2: distToPerfect(s, n - 1, j) + 1 + (pow2(n - 1) - 1) + 1 + distToPerfect(t, n - 1, i) };
  }
  /** 狀態圖的半徑（從最好的起點，廣度優先搜尋要幾層才拜訪完）：n ≥ 3 時 = 3·2^(n−2)（測試以 BFS 驗證 n ≤ 7） */
  function radius(n) { return n === 1 ? 1 : n === 2 ? 3 : 3 * pow2(n - 2); }
  /**
   * 單行道（循環）的河內塔：只准 A → B → C → A 一個方向搬（dir = −1 時反過來）。
   * 整疊往前一格最少 Q(n) 步、往前兩格最少 R(n) 步：Q(n) = 2R(n−1) + 1，R(n) = 2R(n−1) + Q(n−1) + 2，Q(0) = R(0) = 0
   * （測試以只准單一方向的 BFS 驗證 n ≤ 7）。
   */
  function cyclicCounts(n) {
    let q = 0, r = 0;
    for (let k = 1; k <= n; k++) { const q2 = 2 * r + 1, r2 = 2 * r + q + 2; q = q2; r = r2; }
    return { q: q, r: r };
  }
  function cyclicMoves(n, from, steps, dir) {
    dir = dir === -1 ? 2 : 1;
    const out = [], nx = function (p, k) { return (p + k * dir) % 3; };
    (function go(k, a, s) {
      if (k === 0) return;
      if (s === 1) { go(k - 1, a, 2); out.push({ disk: k, from: a, to: nx(a, 1) }); go(k - 1, nx(a, 2), 2); }
      else { go(k - 1, a, 2); out.push({ disk: k, from: a, to: nx(a, 1) }); go(k - 1, nx(a, 2), 1); out.push({ disk: k, from: nx(a, 1), to: nx(a, 2) }); go(k - 1, a, 2); }
    })(n, from, steps);
    return out;
  }

  // ---------------------------------------------------------------- 遞迴的呼叫樹（自動解用）
  /**
   * 節點：{ id, kind: 'hanoi'（搬整疊）| 'solve'（從目前狀態搬到 t）, k, from, to, via, parent, depth, instr: [...], L, R }
   *   instr：{ type: 'call', child } 或 { type: 'move', idx }（idx 是第幾步，從 1 起）；L..R 是這個呼叫做的所有移動。
   * 標準遞迴 hanoi(k, from, to, via)：先 hanoi(k−1, from, via, to)、搬盤 k、再 hanoi(k−1, via, to, from)；k = 1 時只搬一次。
   */
  function Tree() { this.nodes = []; this.moves = []; }
  Tree.prototype.add = function (o) { o.id = this.nodes.length; o.instr = []; this.nodes.push(o); return o; };
  Tree.prototype.move = function (node, disk, from, to, p) {
    this.moves.push({ disk: disk, from: from, to: to, node: node.id });
    if (p) p[disk] = to;
    node.instr.push({ type: 'move', idx: this.moves.length });
  };
  function hanoiNode(tr, k, from, to, via, parent, depth, p) {
    const nd = tr.add({ kind: 'hanoi', k: k, from: from, to: to, via: via, parent: parent, depth: depth });
    nd.L = tr.moves.length + 1;
    if (k > 1) nd.instr.push({ type: 'call', child: hanoiNode(tr, k - 1, from, via, to, nd.id, depth + 1, p).id });
    tr.move(nd, k, from, to, p);
    if (k > 1) nd.instr.push({ type: 'call', child: hanoiNode(tr, k - 1, via, to, from, nd.id, depth + 1, p).id });
    nd.R = tr.moves.length;
    return nd;
  }
  function hanoiTree(n, from, to) {
    const tr = new Tree();
    hanoiNode(tr, n, from, to, third(from, to), -1, 0, null);
    return tr;
  }
  /** 從任意狀態：solve(k, t) = 盤 k 已在 t 就只處理 1..k−1；否則 solve(k−1, o)、搬盤 k、hanoi(k−1, o, t) */
  function solveTree(pos, n, t) {
    const tr = new Tree(), p = pos.slice();
    function done(k, t) { for (let d = 1; d <= k; d++) if (p[d] !== t) return false; return true; }
    function solve(k, t, parent, depth) {
      if (k === 0 || done(k, t)) return null;
      const nd = tr.add({ kind: 'solve', k: k, from: p[k], to: t, via: third(p[k], t), parent: parent, depth: depth });
      nd.L = tr.moves.length + 1;
      if (p[k] === t) {
        nd.via = -1;
        const c = solve(k - 1, t, nd.id, depth + 1);
        if (c) nd.instr.push({ type: 'call', child: c.id });
      } else {
        const from = p[k], o = third(from, t);
        const c = solve(k - 1, o, nd.id, depth + 1);
        if (c) nd.instr.push({ type: 'call', child: c.id });
        tr.move(nd, k, from, t, p);
        if (k > 1) nd.instr.push({ type: 'call', child: hanoiNode(tr, k - 1, o, t, from, nd.id, depth + 1, p).id });
      }
      nd.R = tr.moves.length;
      return nd;
    }
    solve(n, t, -1, 0);
    return tr;
  }
  /** 從根到 frame 的路徑（呼叫堆疊） */
  function stackOf(tree, frame) {
    const out = [];
    for (let id = frame; id >= 0; id = tree.nodes[id].parent) out.unshift(tree.nodes[id]);
    return out;
  }
  /** 呼叫框 node 在已做 m 步時，下一個要做的是第幾個指令（全部做完時 = 指令數） */
  function pcOf(tree, node, m) {
    for (let i = 0; i < node.instr.length; i++) {
      const it = node.instr[i];
      if (it.type === 'move' ? it.idx > m : tree.nodes[it.child].R > m) return i;
    }
    return node.instr.length;
  }

  // ---------------------------------------------------------------- 傳說：搬 N 個盤子要多久
  function legendTime(N, rate) {
    const steps = (BigInt(1) << BigInt(N)) - BigInt(1);
    const sec = Number(steps) / rate;
    return { steps: steps.toString(), seconds: sec, years: sec / YEAR };
  }

  // ---------------------------------------------------------------- 挑戰題
  /** 隨機出一個 k（1..2^QUIZ_N − 1）：先等機率選答案盤 d，再選 k = 2^(d−1)·(奇數)，免得一半的題目答案都是 1 */
  function quizK(rand) {
    const d = 1 + Math.floor(rand() * QUIZ_N);
    const odd = pow2(QUIZ_N - d) ;             // 奇數 j 的個數：k = 2^(d−1)·(2i+1) ≤ 2^N − 1 → i < 2^(N−d)
    const i = Math.floor(rand() * odd);
    return pow2(d - 1) * (2 * i + 1);
  }

  // =====================================================================
  // Session：頁面的全部操作與任務事件
  // =====================================================================
  function Session(opts) {
    opts = opts || {};
    this.emitFn = opts.emit || function () {};
    this.rand = opts.rng || rng((Date.now() ^ 0x5eed) >>> 0);
    this.n = opts.n || 4;
    this.home = 0;                                 // 「重來」時塔放在 A
    this.target = { kind: 'peg', peg: 2 };         // 目標柱預設 C
    this.tdist = null;                             // 自訂目標時的距離表（BFS）
    this.hintOn = false;
    this.alg = 'rec';
    this.quiz = { kind: null, k: 0, ans: null, open: false, streak: 0, kindStreak: { disk: 0, move: 0 } };
    this.pos = perfect(this.n, this.home);
    this.lastSrc = 'init';
    this.auto = null;
    this.newSegment('perfect');
  }
  const SP = Session.prototype;
  SP.emit = function (type, data) { this.emitFn(type, data); };
  SP.code = function () { return encode(this.pos, this.n); };
  SP.state = function () { return str(this.pos, this.n); };
  SP.targetName = function () { return this.target.kind === 'peg' ? PEG[this.target.peg] : 'custom'; };
  SP.targetPos = function () { return this.target.kind === 'peg' ? perfect(this.n, this.target.peg) : this.target.pos; };
  SP.distOf = function (pos) {
    return this.target.kind === 'peg' ? distToPerfect(pos, this.n, this.target.peg) : this.tdist[encode(pos, this.n)];
  };
  SP.dist = function () { return this.distOf(this.pos); };
  SP.solved = function () { return this.dist() === 0; };
  SP.top = function (peg) { return tops(this.pos, this.n)[peg]; };
  /** 開始新的一段（重來、打亂、改盤數、改目標、全部清除）：步數歸零，從目前狀態算起 */
  SP.newSegment = function (kind) {
    const pp = perfectPeg(this.pos, this.n);
    this.stack = [];
    this.seg = {
      startCode: this.code(), startPos: this.pos.slice(), startKind: kind || (pp >= 0 ? 'perfect' : 'other'),
      startPerfect: pp, startDist: this.dist(), hint: this.hintOn
    };
    this.cnt = { hand: 0, auto: 0, bigHand: 0, big: [0, 0, 0] };
    this.undoRun = null;
    this.handRun = 0; this.tour = [];
    this.illegal = 0;
    this.auto = null;
  };
  SP.bigPegs = function () {
    const n = this.n, m = { };
    m[this.seg.startPos[n]] = 1;
    for (let p = 0; p < 3; p++) if (this.cnt.big[p]) m[p] = 1;
    return [0, 1, 2].filter(function (p) { return m[p]; }).map(function (p) { return PEG[p]; }).join('');
  };
  SP.reset = function () { this.pos = perfect(this.n, this.home); this.lastSrc = 'reset'; this.newSegment('perfect'); };
  SP.setN = function (n) {
    n = Math.max(1, Math.min(MAX_N, Math.round(n)));
    if (n === this.n) return false;
    this.n = n;
    if (this.target.kind === 'custom') { this.target = { kind: 'peg', peg: 2 }; this.tdist = null; }
    this.pos = perfect(n, this.home); this.lastSrc = 'n';
    this.newSegment('perfect');
    return true;
  };
  SP.setTarget = function (peg) {
    if (this.target.kind === 'peg' && this.target.peg === peg) return false;
    this.target = { kind: 'peg', peg: peg }; this.tdist = null;
    this.lastSrc = 'target';
    this.newSegment(this.seg.startKind === 'shuffled' && this.stack.length === 0 ? 'shuffled' : null);
    return true;
  };
  SP.setCustom = function (code) {
    if (this.n > GRAPH_MAX) return false;
    this.target = { kind: 'custom', code: code, pos: decode(code, this.n) };
    this.tdist = bfs(code, this.n).dist;
    this.lastSrc = 'target';
    this.newSegment(this.seg.startKind === 'shuffled' && this.stack.length === 0 ? 'shuffled' : null);
    return true;
  };
  SP.shuffle = function () {
    const n = this.n;
    if (n < 2) { this.reset(); return; }
    let p;
    do { p = [0]; for (let d = 1; d <= n; d++) p.push(Math.floor(this.rand() * 3)); } while (perfectPeg(p, n) >= 0 || this.distOf(p) === 0);
    this.pos = p; this.lastSrc = 'shuffle';
    this.newSegment('shuffled');
  };
  SP.clearAll = function () { this.lastSrc = 'clear'; this.newSegment(null); this.quiz.streak = 0; this.quiz.kindStreak = { disk: 0, move: 0 }; this.quiz.open = false; };
  SP.setHint = function (on) { this.hintOn = !!on; if (on) this.seg.hint = true; };

  /** 親手（或自動）搬：從柱 a 到柱 b。不合法時送 'illegal'，傳回 { ok:false, … } */
  SP.tryMove = function (a, b, src) {
    const c = check(this.pos, this.n, a, b);
    if (!c.ok) {
      if (c.reason === 'big') {
        this.illegal++;
        this.emit('illegal', { n: this.n, disk: c.disk, onto: c.onto, from: PEG[a], to: PEG[b], src: src || 'hand', count: this.illegal });
      }
      return c;
    }
    return this.doMove(a, b, src || 'hand');
  };
  SP.doMove = function (a, b, src) {
    const n = this.n, disk = this.top(a);
    if (src === 'hand') {
      if (this.auto) this.auto.valid = false;
      if (this.handRun === 0) {
        this.tour = [];
        const p0 = perfectPeg(this.pos, n);
        if (p0 >= 0) this.tour.push({ peg: p0, at: 0 });
      }
      this.handRun++;
    } else { this.handRun = 0; this.tour = []; }
    this.pos[disk] = b;
    const d = this.dist();
    this.stack.push({ disk: disk, from: a, to: b, src: src, d: d, code: this.code() });
    this.cnt[src === 'hand' ? 'hand' : 'auto']++;
    if (disk === n) { this.cnt.big[b]++; if (src === 'hand') this.cnt.bigHand++; }
    this.lastSrc = src;
    this.undoRun = null;
    let tour3 = -1;
    if (src === 'hand') {
      const pp = perfectPeg(this.pos, n);
      if (pp >= 0 && (!this.tour.length || this.tour[this.tour.length - 1].peg !== pp)) this.tour.push({ peg: pp, at: this.handRun });
      const L = this.tour.length;
      if (L >= 3) {
        const x = this.tour[L - 3], y = this.tour[L - 2], z = this.tour[L - 1];
        if (x.peg !== y.peg && y.peg !== z.peg && x.peg !== z.peg) tour3 = z.at - x.at;
      }
    }
    const pp = perfectPeg(this.pos, n);
    const mv = { ok: true, disk: disk, from: a, to: b, src: src, dist: d };
    this.emit('move', {
      src: src, n: n, disk: disk, from: PEG[a], to: PEG[b], moves: this.stack.length, dist: d, state: this.state(),
      target: this.targetName(), perfect: pp >= 0 ? PEG[pp] : '', startPerfect: this.seg.startPerfect >= 0 ? PEG[this.seg.startPerfect] : '',
      bigPegs: this.bigPegs(), bigHand: this.cnt.bigHand, tour3: tour3, hint: this.seg.hint
    });
    if (d === 0) this.emit('solved', this.solvedData(src));
    return mv;
  };
  /** 最長的「最佳尾段」：從最後一步往前，每一步都讓離目標的距離剛好少 1 */
  SP.tail = function () {
    const st = this.stack, n = this.n;
    let i = st.length - 1, len = 0, hand = true, big = 0;
    for (; i >= 0; i--) {
      const before = i > 0 ? st[i - 1].d : this.seg.startDist;
      if (before !== st[i].d + 1) break;
      len++;
      if (st[i].src !== 'hand') hand = false;
      if (st[i].disk === n) big++;
    }
    const start = i + 1 > 0 ? decode(st[i].code, n) : this.seg.startPos.slice();
    const pp = perfectPeg(start, n);
    return { len: len, start: str(start, n), startPos: start, startPerfect: pp >= 0 ? PEG[pp] : '', startDist: this.distOf(start), hand: hand && len > 0, big: big };
  };
  SP.solvedData = function (src) {
    const n = this.n, st = this.stack, tl = this.tail();
    let lastAuto = -1, firstHand = st.length;
    st.forEach(function (m, i) { if (m.src !== 'hand') lastAuto = i; else if (firstHand === st.length) firstHand = i; });
    let d1 = null, d2 = null, rot = 0;
    if (st.length) {
      const r0 = (st[0].to - st[0].from + 3) % 3;
      rot = st.every(function (m) { return (m.to - m.from + 3) % 3 === r0; }) ? (r0 === 1 ? 1 : -1) : 0;
    }
    if (this.target.kind === 'custom') {
      const bm = bigMoveDists(tl.startPos, this.target.pos, n);
      if (bm) { d1 = bm.d1; d2 = bm.d2; }
    }
    return {
      n: n, moves: st.length, src: src, handAll: this.cnt.auto === 0 && st.length > 0, handMoves: this.cnt.hand, autoMoves: this.cnt.auto,
      autoFirst: lastAuto < firstHand, startKind: this.seg.startKind, startPerfect: this.seg.startPerfect >= 0 ? PEG[this.seg.startPerfect] : '',
      startDist: this.seg.startDist, hint: this.seg.hint, target: this.targetName(), goal: str(this.targetPos(), n), illegal: this.illegal,
      tail: { len: tl.len, start: tl.start, startPerfect: tl.startPerfect, startDist: tl.startDist, hand: tl.hand, big: tl.big },
      d1: d1, d2: d2, rot: rot
    };
  };
  /** 上一步（把最後一步倒回去） */
  SP.undo = function () {
    if (!this.stack.length) return null;
    const wasSolved = this.solved(), lenBefore = this.stack.length;
    const m = this.stack.pop(), n = this.n;
    this.pos[m.disk] = m.from;
    this.cnt[m.src === 'hand' ? 'hand' : 'auto']--;
    if (m.disk === n) { this.cnt.big[m.to]--; if (m.src === 'hand') this.cnt.bigHand--; }
    if (this.auto) this.auto.valid = false;
    this.handRun = 0; this.tour = [];
    this.lastSrc = 'undo';
    if (!this.undoRun) this.undoRun = { count: 0, fromSolved: wasSolved, solvedLen: lenBefore };
    this.undoRun.count++;
    this.emit('undo', {
      n: n, moves: this.stack.length, disk: m.disk, undoRun: this.undoRun.count, fromSolved: this.undoRun.fromSolved, solvedLen: this.undoRun.solvedLen,
      atStart: this.stack.length === 0, startPerfect: this.seg.startPerfect >= 0 ? PEG[this.seg.startPerfect] : '', dist: this.dist()
    });
    return m;
  };

  // ---------------------------------------------------------------- 自動解
  /** 規劃自動解：完美狀態用標準遞迴（或最小盤輪流），其他狀態用「從目前狀態」的遞迴 */
  SP.plan = function (alg) {
    alg = alg || this.alg;
    if (this.target.kind !== 'peg') return { ok: false, reason: 'custom' };
    if (this.solved()) return { ok: false, reason: 'solved' };
    const n = this.n, t = this.target.peg, pp = perfectPeg(this.pos, n);
    if (alg === 'iter' && pp < 0) return { ok: false, reason: 'iter' };
    const a = { alg: alg, n: n, from: pp, target: t, m: 0, frame: 0, presses: 0, skips: 0, stepMoves: 0, skipMoves: 0, fromPerfect: pp >= 0, valid: true, tree: null, moves: null, same: null, startLen: this.stack.length };
    if (pp >= 0) {
      a.tree = hanoiTree(n, pp, t);
      if (alg === 'iter') {
        a.moves = iterativeMoves(n, pp, t);
        const rec = a.tree.moves;
        a.same = a.moves.length === rec.length && a.moves.every(function (m, i) { return m.disk === rec[i].disk && m.from === rec[i].from && m.to === rec[i].to; });
        a.tree = null;
      } else a.moves = a.tree.moves;
    } else { a.tree = solveTree(this.pos, n, t); a.moves = a.tree.moves; }
    this.auto = a;
    return { ok: true, auto: a };
  };
  SP.autoReady = function () { return !!(this.auto && this.auto.valid && this.auto.m < this.auto.moves.length && this.auto.alg === this.alg); };
  SP.ensurePlan = function () { return this.autoReady() ? { ok: true, auto: this.auto } : this.plan(this.alg); };
  SP.autoDo = function (a, upto, kind) {
    const out = [];
    while (a.m < upto) {
      const mv = a.moves[a.m];
      a.m++;
      if (kind === 'skip') a.skipMoves++; else a.stepMoves++;
      if (a.tree && kind !== 'skip') a.frame = mv.node;
      out.push(this.doMove(mv.from, mv.to, 'auto'));
      if (!a.valid) break;
    }
    if (a.m >= a.moves.length && a.valid) {
      this.emit('auto', { n: a.n, alg: a.alg, from: a.from >= 0 ? PEG[a.from] : '', target: PEG[a.target], moves: a.moves.length, stepMoves: a.stepMoves, skipMoves: a.skipMoves, presses: a.presses,
        skips: a.skips, fromPerfect: a.fromPerfect, same: a.same, startLen: a.startLen });
      a.valid = false; a.finished = true;
    }
    return out;
  };
  /** 「單步」（user = true 時算一次操作；自動播放每一格呼叫 user = false） */
  SP.autoStep = function (user) {
    const r = this.ensurePlan();
    if (!r.ok) return r;
    const a = r.auto;
    if (user) a.presses++;
    return { ok: true, moves: this.autoDo(a, a.m + 1, 'step') };
  };
  /** 按「自動解」開始播放（算一次操作） */
  SP.autoPlay = function () {
    const r = this.ensurePlan();
    if (r.ok) r.auto.presses++;
    return r;
  };
  /** 「跳過子問題」：把目前呼叫框的下一個指令整個做完（下一個是遞迴呼叫，就一口氣做完那個呼叫） */
  SP.autoSkip = function () {
    if (this.alg !== 'rec') return { ok: false, reason: 'iter' };
    const r = this.ensurePlan();
    if (!r.ok) return r;
    const a = r.auto, tr = a.tree;
    a.presses++; a.skips++;
    let f = tr.nodes[a.frame];
    for (;;) {
      const i = pcOf(tr, f, a.m);
      if (i < f.instr.length) {
        const it = f.instr[i];
        const upto = it.type === 'move' ? it.idx : tr.nodes[it.child].R;
        a.frame = f.id;
        return { ok: true, moves: this.autoDo(a, upto, 'skip') };
      }
      if (f.parent < 0) return { ok: true, moves: [] };
      f = tr.nodes[f.parent];
      a.frame = f.id;
    }
  };

  // ---------------------------------------------------------------- 廣度優先搜尋、挑戰、傳說
  SP.bfsRun = function () {
    const n = this.n, src = this.code(), r = bfs(src, n);
    const tcode = this.target.kind === 'peg' ? encode(perfect(n, this.target.peg), n) : this.target.code;
    const pp = perfectPeg(this.pos, n);
    const out = { n: n, start: this.state(), startPerfect: pp >= 0 ? PEG[pp] : '', layers: r.layers, visited: r.count, dist: r.dist[tcode], target: this.targetName(), lastSrc: this.lastSrc };
    this.emit('bfs', out);
    return { data: out, res: r, tcode: tcode };
  };
  SP.quizNew = function (kind) {
    const k = quizK(this.rand), mv = moveAt(k, QUIZ_N, 0, 2);
    this.quiz.kind = kind === 'move' ? 'move' : 'disk';
    this.quiz.k = k; this.quiz.ans = mv; this.quiz.open = true;
    return { kind: this.quiz.kind, k: k };
  };
  /** 回答：盤題給盤號；搬法題給 [from, to] */
  SP.quizAnswer = function (ans) {
    const q = this.quiz;
    if (!q.open) return null;
    const ok = q.kind === 'disk' ? ans === q.ans.disk : (ans && ans[0] === q.ans.from && ans[1] === q.ans.to);
    q.open = false;
    q.kindStreak[q.kind] = ok ? q.kindStreak[q.kind] + 1 : 0;
    q.streak = q.kindStreak[q.kind];
    const out = { kind: q.kind, ok: !!ok, streak: q.streak, k: q.k };
    this.emit('quiz', out);
    return Object.assign({ ans: q.ans }, out);
  };
  SP.legend = function (N, rate) {
    const lt = legendTime(N, rate);
    this.emit('legend', { N: N, rate: rate, years: lt.years, seconds: lt.seconds });
    return lt;
  };

  const api = {
    PEG: PEG, MAX_N: MAX_N, GRAPH_MAX: GRAPH_MAX, QUIZ_N: QUIZ_N, YEAR: YEAR,
    rng: rng, pow2: pow2, pow3: pow3, minMoves: minMoves, ruler: ruler, trailingZeros: trailingZeros, third: third,
    perfect: perfect, encode: encode, decode: decode, str: str, parse: parse, tops: tops, stacks: stacks, perfectPeg: perfectPeg,
    check: check, legalMoves: legalMoves, distToPerfect: distToPerfect, pathToPerfect: pathToPerfect,
    hanoiMoves: hanoiMoves, iterativeMoves: iterativeMoves, moveAt: moveAt, stateAt: stateAt,
    neighbors: neighbors, bfs: bfs, layout: layout, edges: edges, bigMoveDists: bigMoveDists, radius: radius, cyclicCounts: cyclicCounts, cyclicMoves: cyclicMoves,
    hanoiTree: hanoiTree, solveTree: solveTree, stackOf: stackOf, pcOf: pcOf,
    legendTime: legendTime, quizK: quizK, Session: Session
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HanoiCore = api;
})(typeof window !== 'undefined' ? window : this);
