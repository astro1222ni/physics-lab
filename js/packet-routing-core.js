/* packet-routing-core.js — 「網路封包與路由」的計算核心（與畫面分離，Node 單元測試：tests/packet-routing-core.test.js）
 *
 * 一個小小的網路：幾台路由器、兩台主機（你的電腦 PC、伺服器 SV），每條連線有延遲（毫秒）。全部是模擬，不連任何真實網路。
 * - 封包：表頭 4 位元組（來源、目的、序號、TTL 各 1 位元組，簡化的玩具表頭）＋資料（每個 ASCII 字元 1 位元組）。
 * - 連線：每個方向一條先進先出的佇列，傳輸速率 RATE 位元組／毫秒；儲存轉送（路由器收完整個封包才轉送）。
 *   一個封包過一條線：等佇列 → 傳輸時間（大小 ÷ 速率）→ 傳播延遲（連線的延遲）。
 * - TTL：每經過一台路由器減 1，減到 0 就丟掉（RFC 791、RFC 1812 5.3.1）；追蹤路由的探測封包被丟掉時，路由器回報 ICMP Time Exceeded（RFC 792）。
 * - 路由表兩種：
 *     連結狀態（像 OSPF，RFC 2328）：每台路由器知道整張網路，用 Dijkstra 以「延遲總和」找最短路；網路一變就立刻重算（假設通知瞬間傳遍）。
 *     距離向量（像 RIP，RFC 2453）：只用「跳數」，每一輪和鄰居交換距離表（Bellman–Ford），16 代表無限大（到不了）；
 *       可選水平分割（毒性逆轉）。同一個下一站傳來的消息一律採用（即使變差），別的鄰居要嚴格更好才換（RFC 2453 3.9.2）。
 * - 可靠傳輸（簡化的 TCP）：伺服器每收到一包就回傳這一包的確認（ACK）；送出端等不到確認就逾時重送，
 *   逾時時間 RTO = 2 × 平滑往返時間（RFC 793 原始做法：SRTT = 0.875 SRTT + 0.125 RTT），重送過的封包不拿來量往返時間（Karn）。
 *   同一包重送 MAX_RETX 次還是沒有確認，就放棄（傳送失敗）。
 * - 亂數（隨機遺失）用固定種子（mulberry32），同樣的操作得到同樣的結果。
 * 物理（資訊）誠實：時間、TTL、路由表、遺失與重送都由這裡算；畫面只是把算好的狀態畫出來。
 */
(function (root) {
  'use strict';
  const HEADER = 4;          // 表頭位元組
  const RATE = 4;            // 傳輸速率：位元組／毫秒
  const INF = 16;            // RIP 的「無限大」
  const CTRL_TTL = 16;       // 確認、ICMP 等控制封包的 TTL
  const RTO_INIT = 100, RTO_MIN = 20, RTO_MAX = 400;
  const MAX_RETX = 4;        // 同一包最多重送幾次
  const DV_PERIOD = 6;       // 自動交換：每幾毫秒交換一輪
  const TRACE_MAX = 16;      // 追蹤路由最多送到 TTL = 16
  const TRACE_WAIT = 150;    // 一個探測封包等多久沒有回音就記「*」
  const TRACE_GIVEUP = 3;    // 連續 3 站都是「*」就停（真正的 traceroute 會一直試到最大跳數，這裡為了不讓學生乾等）
  const MSG_MAX = 48, K_MIN = 1, K_MAX = 16, TTL_MAX = 32;

  // ---------------- 網路 ----------------
  // 座標是 0–1 的相對位置（寬畫布）；延遲單位毫秒（連結狀態的成本 = 延遲）。
  const NETWORKS = {
    city: {
      zh: '城市網路（8 台路由器）', en: 'City network (8 routers)',
      nodes: [['PC', 0.045, 0.5], ['R1', 0.165, 0.5], ['R2', 0.33, 0.17], ['R3', 0.33, 0.83], ['R4', 0.45, 0.5],
        ['R5', 0.62, 0.17], ['R6', 0.62, 0.83], ['R7', 0.73, 0.5], ['R8', 0.84, 0.5], ['SV', 0.955, 0.5]],
      links: [['PC', 'R1', 1], ['R1', 'R2', 4], ['R1', 'R3', 5], ['R1', 'R4', 2], ['R2', 'R4', 3], ['R3', 'R4', 2],
        ['R2', 'R5', 7], ['R3', 'R6', 3], ['R5', 'R7', 3], ['R6', 'R7', 2], ['R5', 'R8', 6], ['R6', 'R8', 6], ['R7', 'R8', 2], ['R8', 'SV', 1]]
    },
    ring: {
      zh: '環狀網路（6 台路由器）', en: 'Ring network (6 routers)',
      nodes: [['PC', 0.05, 0.5], ['R1', 0.2, 0.5], ['R2', 0.36, 0.16], ['R3', 0.64, 0.16], ['R4', 0.8, 0.5], ['R5', 0.64, 0.84], ['R6', 0.36, 0.84], ['SV', 0.95, 0.5]],
      links: [['PC', 'R1', 1], ['R1', 'R2', 3], ['R2', 'R3', 3], ['R3', 'R4', 3], ['R4', 'R5', 2], ['R5', 'R6', 2], ['R6', 'R1', 2], ['R4', 'SV', 1]]
    },
    grid: {
      zh: '方格網路（9 台路由器）', en: 'Grid network (9 routers)',
      nodes: [['PC', 0.05, 0.5], ['R1', 0.2, 0.15], ['R2', 0.5, 0.15], ['R3', 0.8, 0.15], ['R4', 0.2, 0.5], ['R5', 0.5, 0.5], ['R6', 0.8, 0.5],
        ['R7', 0.2, 0.85], ['R8', 0.5, 0.85], ['R9', 0.8, 0.85], ['SV', 0.95, 0.5]],
      links: [['PC', 'R4', 1], ['R1', 'R2', 2], ['R2', 'R3', 2], ['R4', 'R5', 6], ['R5', 'R6', 6], ['R7', 'R8', 3], ['R8', 'R9', 3],
        ['R1', 'R4', 2], ['R4', 'R7', 3], ['R2', 'R5', 2], ['R5', 'R8', 2], ['R3', 'R6', 2], ['R6', 'R9', 3], ['R6', 'SV', 1]]
    }
  };
  const NET_IDS = ['city', 'ring', 'grid'];

  function buildNet(id) {
    const def = NETWORKS[id] || NETWORKS.city;
    const idx = {};
    const nodes = def.nodes.map(function (n, i) { idx[n[0]] = i; return { i: i, id: n[0], host: n[0] === 'PC' || n[0] === 'SV', x: n[1], y: n[2] }; });
    const links = def.links.map(function (l, i) {
      const a = idx[l[0]], b = idx[l[1]];
      return { i: i, a: a, b: b, cost: l[2], cost0: l[2], up: true, access: nodes[a].host || nodes[b].host };
    });
    const net = { id: def === NETWORKS[id] ? id : 'city', nodes: nodes, links: links, pc: idx.PC, sv: idx.SV, idx: idx };
    net.routers = nodes.filter(function (n) { return !n.host; }).map(function (n) { return n.i; });
    net.gw = {};
    links.forEach(function (l) { if (l.access) { const h = nodes[l.a].host ? l.a : l.b; net.gw[h] = { router: h === l.a ? l.b : l.a, link: l.i }; } });
    return net;
  }
  function cloneNet(net) {
    const c = buildNet(net.id);
    net.links.forEach(function (l, i) { c.links[i].cost = l.cost; c.links[i].up = l.up; });
    return c;
  }
  function other(l, u) { return l.a === u ? l.b : l.a; }
  /** u 的鄰居（只算通的連線），依連線順序 */
  function nbrs(net, u) {
    const out = [];
    net.links.forEach(function (l) { if (l.up && (l.a === u || l.b === u)) out.push({ v: other(l, u), link: l }); });
    return out;
  }
  function linkBetween(net, u, v) {
    for (let i = 0; i < net.links.length; i++) { const l = net.links[i]; if ((l.a === u && l.b === v) || (l.a === v && l.b === u)) return l; }
    return null;
  }
  function topoKey(net) { return net.id + '|' + net.links.map(function (l) { return (l.up ? '' : 'x') + l.cost; }).join(','); }
  function costEdited(net) { return net.links.some(function (l) { return l.cost !== l.cost0; }); }
  /** 從 s 能不能走到 t（只走通的連線；主機不轉送） */
  function connected(net, s, t) {
    const seen = {}; seen[s] = true;
    const q = [s];
    while (q.length) {
      const u = q.shift();
      if (u === t) return true;
      if (net.nodes[u].host && u !== s) continue;
      nbrs(net, u).forEach(function (e) { if (!seen[e.v]) { seen[e.v] = true; q.push(e.v); } });
    }
    return false;
  }

  // ---------------- 連結狀態：Dijkstra ----------------
  /** 從路由器 r 出發的 Dijkstra（成本 = 延遲）；同樣近時先處理編號小的點，嚴格變小才更新，所以結果固定。 */
  function dijkstra(net, r) {
    const n = net.nodes.length, dist = new Array(n).fill(Infinity), first = new Array(n).fill(-1), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    dist[r] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      if (net.nodes[u].host && u !== r) continue;           // 主機不轉送別人的封包
      nbrs(net, u).forEach(function (e) {
        const d = dist[u] + e.link.cost;
        if (d < dist[e.v]) { dist[e.v] = d; prev[e.v] = u; first[e.v] = u === r ? e.v : first[u]; }
      });
    }
    return { dist: dist, first: first, prev: prev };
  }
  function lsTables(net) {
    const n = net.nodes.length, next = [], dist = [];
    for (let r = 0; r < n; r++) {
      if (net.nodes[r].host) { next.push(null); dist.push(null); continue; }
      const d = dijkstra(net, r);
      next.push(d.first); dist.push(d.dist);
    }
    return { next: next, dist: dist };
  }

  // ---------------- 距離向量：RIP 式的 Bellman–Ford ----------------
  /** 冷啟動：每台路由器只知道自己（0）與直接相連的鄰居（1） */
  function dvCold(net) {
    const n = net.nodes.length, metric = [], next = [];
    for (let r = 0; r < n; r++) {
      if (net.nodes[r].host) { metric.push(null); next.push(null); continue; }
      const m = new Array(n).fill(INF), x = new Array(n).fill(-1);
      m[r] = 0; x[r] = r;
      nbrs(net, r).forEach(function (e) { m[e.v] = 1; x[e.v] = e.v; });
      metric.push(m); next.push(x);
    }
    return { metric: metric, next: next, climb: metric.map(function (m) { return m ? new Array(n).fill(0) : null; }), round: 0, converged: false };
  }
  /** 一輪同步交換：每台路由器用「上一輪」鄰居告訴它的距離更新自己。回傳 { changed, climb（這一輪數到 16 的最長連續上升次數）} */
  function dvRound(net, dv, split) {
    const n = net.nodes.length, om = dv.metric, on = dv.next;
    const nm = [], nx = [];
    let changed = false, climbDone = 0;
    const climbTo = {};
    const advert = function (from, to, d) { return split && on[from][d] === to ? INF : om[from][d]; };
    for (let r = 0; r < n; r++) {
      if (net.nodes[r].host) { nm.push(null); nx.push(null); continue; }
      const nb = nbrs(net, r);
      const m = new Array(n).fill(INF), x = new Array(n).fill(-1);
      for (let d = 0; d < n; d++) {
        if (d === r) { m[d] = 0; x[d] = r; continue; }
        if (nb.some(function (e) { return e.v === d; })) { m[d] = 1; x[d] = d; continue; }   // 直接相連
        let best = INF, via = -1;
        const cur = on[r][d];
        const curOk = cur >= 0 && !net.nodes[cur].host && nb.some(function (e) { return e.v === cur; });
        if (curOk) { best = Math.min(INF, advert(cur, r, d) + 1); via = cur; }        // 原本的下一站說什麼就信什麼
        nb.forEach(function (e) {
          if (net.nodes[e.v].host || e.v === cur) return;
          const c = Math.min(INF, advert(e.v, r, d) + 1);
          if (c < best) { best = c; via = e.v; }                                        // 別的鄰居要嚴格更好才換
        });
        m[d] = best; x[d] = best < INF ? via : (curOk ? cur : -1);
      }
      nm.push(m); nx.push(x);
    }
    for (let r = 0; r < n; r++) {
      if (!nm[r]) continue;
      for (let d = 0; d < n; d++) {
        const a = om[r][d], b = nm[r][d];
        if (a !== b || (b < INF && on[r][d] !== nx[r][d])) changed = true;
        if (b > a && a < INF) {
          dv.climb[r][d]++;
          if (b >= INF) { climbDone = Math.max(climbDone, dv.climb[r][d]); climbTo[d] = Math.max(climbTo[d] || 0, dv.climb[r][d]); dv.climb[r][d] = 0; }
        } else dv.climb[r][d] = 0;
      }
    }
    dv.metric = nm; dv.next = nx; dv.round++; dv.converged = !changed;
    return { changed: changed, climb: climbDone, climbTo: climbTo };
  }
  /** 連線斷了：兩端立刻把經過這條線的路標成 16（偵測到介面斷線）；接回：兩端立刻加回直接相連的路 */
  function dvLinkChange(net, dv, link) {
    [link.a, link.b].forEach(function (r) {
      if (net.nodes[r].host) return;
      const v = other(link, r), m = dv.metric[r], x = dv.next[r];
      if (!link.up) {
        for (let d = 0; d < m.length; d++) if (x[d] === v && d !== r) { m[d] = INF; dv.climb[r][d] = 0; }
      } else { m[v] = 1; x[v] = v; dv.climb[r][v] = 0; }
    });
    dv.converged = false;
  }

  // ---------------- 圖論小工具 ----------------
  /** 路由器之間最少要剪幾條線才能把 s、t 分開（單位容量最大流 = 邊不相交的路徑數，Menger 定理）；只算路由器之間的線，全部當成通的 */
  function minCut(net, s, t) {
    const n = net.nodes.length, cap = [];
    for (let i = 0; i < n; i++) cap.push(new Array(n).fill(0));
    net.links.forEach(function (l) { if (!l.access) { cap[l.a][l.b] += 1; cap[l.b][l.a] += 1; } });
    let flow = 0;
    for (;;) {
      const prev = new Array(n).fill(-1); prev[s] = s;
      const q = [s];
      while (q.length && prev[t] < 0) { const u = q.shift(); for (let v = 0; v < n; v++) if (prev[v] < 0 && cap[u][v] > 0) { prev[v] = u; q.push(v); } }
      if (prev[t] < 0) break;
      for (let v = t; v !== s; v = prev[v]) { cap[prev[v]][v]--; cap[v][prev[v]]++; }
      flow++;
    }
    return flow;
  }
  function pathDelay(net, path) {
    let s = 0;
    for (let i = 1; i < path.length; i++) { const l = linkBetween(net, path[i - 1], path[i]); if (!l) return -1; s += l.cost; }
    return s;
  }
  /** 經過的路由器是不是每一台剛好一次 */
  function isHamilton(net, path) {
    const rs = path.filter(function (v) { return !net.nodes[v].host; });
    if (rs.length !== net.routers.length) return false;
    const seen = {};
    for (let i = 0; i < rs.length; i++) { if (seen[rs[i]]) return false; seen[rs[i]] = true; }
    return true;
  }
  /** 依路由表從 PC 一站一站走到 SV（不轉送也不丟封包，只是查表）；回傳 { path, ok, loop } */
  function followPath(net, nextHop) {
    const path = [net.pc], seen = {};
    let u = net.gw[net.pc].router;
    const acc = net.links[net.gw[net.pc].link];
    if (!acc.up) return { path: path, ok: false, loop: false };
    path.push(u);
    while (u !== net.sv) {
      if (seen[u]) return { path: path, ok: false, loop: true };
      seen[u] = true;
      const nh = nextHop(u, net.sv);
      if (nh < 0) return { path: path, ok: false, loop: false };
      u = nh; path.push(u);
      if (path.length > 64) return { path: path, ok: false, loop: true };
    }
    return { path: path, ok: true, loop: false };
  }
  /** 這種網路狀態下，演算法收斂後會選的路（距離向量從冷啟動交換到收斂） */
  function bestPath(net, algo) {
    if (algo === 'dv') {
      const dv = dvCold(net);
      for (let k = 0; k < 40 && !dv.converged; k++) dvRound(net, dv, true);
      return followPath(net, function (r, d) { return dvNextOf(net, dv, r, d); });
    }
    const ls = lsTables(net);
    return followPath(net, function (r, d) { return lsNextOf(net, ls, r, d); });
  }
  function lsNextOf(net, ls, r, d) { const x = ls.next[r] ? ls.next[r][d] : -1; return x == null ? -1 : x; }
  function dvNextOf(net, dv, r, d) {
    if (!dv.metric[r] || dv.metric[r][d] >= INF) return -1;
    const x = dv.next[r][d];
    if (x < 0) return -1;
    const l = linkBetween(net, r, x);
    return l && l.up ? x : -1;
  }

  // ---------------- 訊息切成封包、儲存轉送的理論時間 ----------------
  /** 訊息切成封包：每包 k 個字元（最後一包可能比較少） */
  function split(msg, k) {
    const out = [];
    for (let i = 0; i < msg.length; i += k) out.push(msg.slice(i, i + k));
    if (!out.length) out.push('');
    return out;
  }
  /** 只留可列印的 ASCII（每個字元 1 位元組），最多 MSG_MAX 個 */
  function cleanMsg(s) { return String(s == null ? '' : s).replace(/[^\x20-\x7E]/g, '').slice(0, MSG_MAX); }
  /** 沒有遺失、沒有其他流量時，整封訊息走一條路（每條線的延遲 props）送完的時間：儲存轉送＋先進先出 */
  function theoryTime(props, M, k) {
    const sizes = split('x'.repeat(M), k).map(function (p) { return HEADER + p.length; });
    let prevFinish = new Array(props.length).fill(0), last = 0;
    sizes.forEach(function (sz) {
      const tx = sz / RATE, fin = [];
      let ready = 0;
      for (let h = 0; h < props.length; h++) {
        const start = Math.max(ready, prevFinish[h]);
        fin.push(start + tx);
        ready = start + tx + props[h];
      }
      prevFinish = fin;
      last = ready;
    });
    return last;
  }
  /** P 個一樣大的封包（每包 L 位元組）走 N 條線：(N + P − 1)·L/R ＋ 傳播延遲總和（教科書的儲存轉送公式） */
  function pipelineFormula(props, P, L) {
    return (props.length + P - 1) * L / RATE + props.reduce(function (a, b) { return a + b; }, 0);
  }
  function bestSizes(props, M) {
    let best = Infinity, ks = [];
    for (let k = K_MIN; k <= K_MAX; k++) {
      const t = theoryTime(props, M, k);
      if (t < best - 1e-9) { best = t; ks = [k]; } else if (Math.abs(t - best) <= 1e-9) ks.push(k);
    }
    return { time: best, ks: ks };
  }

  /** 有種子的亂數（mulberry32），回傳 [0, 1) */
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

  // =====================================================================
  // 模擬世界：事件驅動（依時間先後處理；同時間依加入順序），完全可重現
  // =====================================================================
  function World(netId) {
    this.net = buildNet(netId || 'city');
    this.t = 0;
    this.algo = 'ls';
    this.split = true;
    this.auto = true;
    this.ls = lsTables(this.net);
    this.dv = null;
    this.evq = [];
    this.evSeq = 0;
    this.pkts = [];
    this.pid = 0;
    this.busy = {};
    this.job = null;
    this.jobN = 0;
    this.seedBase = 2026;
    this.dvPending = false;
    this.handlers = [];
  }
  const W = World.prototype;
  W.on = function (fn) { this.handlers.push(fn); };
  W.emit = function (type, data) { this.handlers.forEach(function (h) { h(type, data); }); };
  W.node = function (i) { return this.net.nodes[i]; };
  W.name = function (i) { return i >= 0 ? this.net.nodes[i].id : '?'; };
  W.schedule = function (t, type, data) {
    const ev = { t: t, s: this.evSeq++, type: type, data: data };
    const q = this.evq;
    let lo = 0, hi = q.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; const e = q[mid]; if (e.t < t || (e.t === t && e.s < ev.s)) lo = mid + 1; else hi = mid; }
    q.splice(lo, 0, ev);
    return ev;
  };
  /** 時間往前推 dt 毫秒，依序處理這段時間內的事件 */
  W.advance = function (dt) {
    const end = this.t + Math.max(0, dt);
    let n = 0;
    while (this.evq.length && this.evq[0].t <= end && n < 20000) { const ev = this.evq.shift(); this.t = Math.max(this.t, ev.t); this.process(ev); n++; }
    this.t = end;
    return n;
  };
  /** 直接跳到下一個事件（單步） */
  W.stepEvent = function () {
    if (!this.evq.length) return false;
    const t = this.evq[0].t;
    while (this.evq.length && this.evq[0].t === t) { const ev = this.evq.shift(); this.t = Math.max(this.t, ev.t); this.process(ev); }
    return true;
  };
  W.nextEventTime = function () { return this.evq.length ? this.evq[0].t : Infinity; };
  /** 有沒有封包在網路上（在佇列或在線上） */
  W.busyNet = function () { return this.pkts.length > 0; };
  W.idle = function () { return !this.evq.length && !this.pkts.length; };

  // ---------- 路由 ----------
  W.recompute = function () { this.ls = lsTables(this.net); };
  W.nextHop = function (r, d) {
    const net = this.net, g = net.gw[d];
    if (g && g.router === r) return net.links[g.link].up ? d : -1;
    return this.algo === 'dv' && this.dv ? dvNextOf(net, this.dv, r, d) : lsNextOf(net, this.ls, r, d);
  };
  W.currentPath = function () { const self = this; return followPath(this.net, function (r, d) { return self.nextHop(r, d); }); };
  W.setAlgo = function (algo) {
    algo = algo === 'dv' ? 'dv' : 'ls';
    if (algo === this.algo) return;
    this.algo = algo;
    if (algo === 'dv') { this.dv = dvCold(this.net); this.kickDv(); }
    else { this.dv = null; this.dvPending = false; }
  };
  W.setSplit = function (on) { this.split = !!on; if (this.dv) { this.dv.converged = false; this.kickDv(); } };
  W.setAuto = function (on) { this.auto = !!on; this.kickDv(); };
  W.kickDv = function () {
    if (this.algo !== 'dv' || !this.dv || !this.auto || this.dvPending || this.dv.converged) return;
    this.dvPending = true;
    this.schedule(this.t + DV_PERIOD, 'dvRound', { manual: false });
  };
  /** 交換一輪；manual：使用者按「交換一輪」 */
  W.dvExchange = function (manual) {
    if (this.algo !== 'dv' || !this.dv) return null;
    const r = dvRound(this.net, this.dv, this.split);
    const out = { round: this.dv.round, converged: this.dv.converged, climb: r.climb, climbSv: r.climbTo[this.net.sv] || 0, split: this.split, auto: this.auto, manual: !!manual, net: this.net.id };
    this.emit('dv', out);
    return out;
  };
  W.topologyChanged = function (link) {
    this.recompute();
    if (this.dv && link) dvLinkChange(this.net, this.dv, link);
    if (this.job) this.job.topoChanged = true;
    this.kickDv();
  };

  // ---------- 連線 ----------
  W.setLink = function (i, up) {
    const l = this.net.links[i];
    if (!l || l.up === !!up) return false;
    l.up = !!up;
    if (!l.up) {
      // 線上與排隊等這條線的封包全部遺失
      const self = this;
      this.pkts.slice().forEach(function (p) { if (p.where && p.where.link === i) self.lose(p, 'cut'); });
      delete this.busy[i * 2]; delete this.busy[i * 2 + 1];
    }
    this.topologyChanged(l);
    return true;
  };
  W.setCost = function (i, c) {
    const l = this.net.links[i];
    c = Math.max(1, Math.min(20, Math.round(c)));
    if (!l || l.cost === c) return false;
    l.cost = c;
    this.recompute();
    if (this.job) this.job.topoChanged = true;
    return true;
  };
  W.restoreAll = function () {
    const self = this;
    let any = false;
    this.net.links.forEach(function (l) { if (!l.up) { l.up = true; any = true; if (self.dv) dvLinkChange(self.net, self.dv, l); } });
    if (any) this.topologyChanged(null);
    return any;
  };

  // ---------- 封包 ----------
  W.newPkt = function (o) {
    const p = Object.assign({ id: ++this.pid, ttl: CTRL_TTL, size: HEADER, hops: [], visits: {}, looped: false, where: null, job: this.job ? this.job.n : 0 }, o);
    p.ttl0 = p.ttl;
    p.hops = [p.src];
    // 隨機遺失：每個封包有 loss 的機率在路上遺失，遺失在第幾條線也由亂數決定（固定種子，可重現）
    const j = this.job;
    if (j && j.n === p.job && j.loss > 0 && j.rand() < j.loss) {
      let n = 1;
      if (this.node(p.src).host) { const cp = this.currentPath(); n = cp.ok ? cp.path.length - 1 : 2; }
      else n = Math.max(1, p.probeK || 1);
      p.loseAt = Math.floor(j.rand() * n);
    }
    this.pkts.push(p);
    return p;
  };
  W.removePkt = function (p) { const k = this.pkts.indexOf(p); if (k >= 0) this.pkts.splice(k, 1); p.dead = true; };
  /** 從節點 u 經連線 link 送出（先進先出、儲存轉送） */
  W.sendOn = function (p, u, link) {
    const v = other(link, u), dir = link.a === u ? 0 : 1, key = link.i * 2 + dir;
    const start = Math.max(this.t, this.busy[key] || 0);
    const tx = p.size / RATE;
    this.busy[key] = start + tx;
    p.where = { link: link.i, from: u, to: v, start: start, tx: tx, prop: link.cost, qAt: this.t };
    if (p.loseAt === p.hops.length - 1) { p.where.lossAt = start + (tx + link.cost) / 2; p.ev = this.schedule(p.where.lossAt, 'lose', { p: p }); }
    else p.ev = this.schedule(start + tx + link.cost, 'arrive', { p: p });
  };
  W.hostSend = function (p, h) {
    const g = this.net.gw[h], l = this.net.links[g.link];
    if (!l.up) { this.drop(p, h, 'noroute'); return null; }
    this.sendOn(p, h, l);
    return p.where;
  };
  /** 路由器 r 自己發出的封包（ICMP）：不減 TTL，直接查表送出 */
  W.routerSend = function (p, r) {
    const nh = this.nextHop(r, p.dst);
    if (nh < 0) { this.drop(p, r, 'noroute'); return; }
    this.sendOn(p, r, linkBetween(this.net, r, nh));
  };
  W.lose = function (p, reason) {
    const at = p.where ? p.where : null;
    this.removePkt(p);
    this.dropStats(p, reason);
    this.emit('fx', { kind: 'lost', p: p, reason: reason, where: at, t: this.t });
    if (p.kind === 'data') this.dataDropped(p, reason, -1);
  };
  W.drop = function (p, node, reason) {
    this.removePkt(p);
    this.dropStats(p, reason);
    this.emit('fx', { kind: 'drop', p: p, reason: reason, node: node, t: this.t });
    if (p.kind === 'data') this.dataDropped(p, reason, node);
  };
  W.dropStats = function (p, reason) {
    const j = this.job;
    if (!j || j.n !== p.job || j.ended) return;
    if (p.kind === 'data' || p.kind === 'ack') j.lostAll++;
    if (p.kind === 'data') { j.lost[reason] = (j.lost[reason] || 0) + 1; j.lostData++; if (p.looped) j.looped = true; }
  };
  W.dataDropped = function (p, reason, node) {
    const j = this.job;
    if (!j || j.n !== p.job || j.ended) return;
    this.emit('dropped', { reason: reason, looped: p.looped, algo: this.algo, ttl: p.ttl0, at: node >= 0 ? this.name(node) : '', seq: p.seq });
  };

  W.process = function (ev) {
    const d = ev.data;
    if (ev.type === 'arrive') { if (!d.p.dead && d.p.ev === ev) this.arrive(d.p); }
    else if (ev.type === 'lose') { if (!d.p.dead && d.p.ev === ev) this.lose(d.p, 'loss'); }
    else if (ev.type === 'timeout') this.onTimeout(d);
    else if (ev.type === 'traceWait') this.onTraceWait(d);
    else if (ev.type === 'dvRound') {
      this.dvPending = false;
      if (this.algo === 'dv' && this.dv && this.auto) { this.dvExchange(false); this.kickDv(); }
    }
  };
  W.arrive = function (p) {
    const v = p.where.to;
    p.where = null;
    p.hops.push(v);
    if (this.node(v).host) {
      this.removePkt(p);
      if (v === p.dst) { this.emit('fx', { kind: 'hostArrive', p: p, node: v, t: this.t }); this.atHost(p, v); }
      else this.drop(p, v, 'noroute');
      return;
    }
    p.visits[v] = (p.visits[v] || 0) + 1;
    if (p.visits[v] > 1) p.looped = true;
    this.emit('fx', { kind: 'hop', p: p, node: v, t: this.t });
    p.ttl -= 1;                                           // 每經過一台路由器 TTL 減 1
    if (p.ttl <= 0) {
      this.drop(p, v, 'ttl');
      if (p.kind === 'probe') this.icmp(v, p, 'ttl');
      return;
    }
    const nh = this.nextHop(v, p.dst);
    if (nh < 0) {
      this.drop(p, v, 'noroute');
      if (p.kind === 'probe') this.icmp(v, p, 'unreach');
      return;
    }
    this.sendOn(p, v, linkBetween(this.net, v, nh));
  };
  W.icmp = function (r, probe, kind) {
    const j = this.job;
    if (!j || j.n !== probe.job || j.kind !== 'trace') return;
    const q = this.newPkt({ kind: 'icmp', src: r, dst: this.net.pc, probeK: probe.probeK, reporter: r, icmpKind: kind, job: probe.job });
    this.routerSend(q, r);
  };

  // ---------- 傳送訊息 ----------
  /** 傳送一封訊息（之前的工作會被取消）。opt：{ msg, k, ttl, loss（0–1）} */
  W.send = function (opt) {
    this.cancelJob();
    const msg = cleanMsg(opt.msg);
    const k = Math.max(K_MIN, Math.min(K_MAX, Math.round(opt.k || 5)));
    const parts = split(msg, k);
    const n = ++this.jobN;
    const intact = cloneNet(this.net); intact.links.forEach(function (l) { l.up = true; });
    const ib = bestPath(intact, this.algo);
    const self = this;
    const cutOnIntact = ib.ok && ib.path.some(function (v, i) { if (!i) return false; const l = linkBetween(self.net, ib.path[i - 1], v); return l && !l.up; });
    const j = this.job = {
      n: n, kind: 'msg', t0: this.t, msg: msg, k: k, M: msg.length, P: parts.length, parts: parts,
      ttl: Math.max(1, Math.min(TTL_MAX, Math.round(opt.ttl || 16))), loss: Math.max(0, Math.min(0.5, opt.loss || 0)),
      seed: this.seedBase + n, rand: rng(this.seedBase + n),
      algo0: this.algo, topo0: topoKey(this.net), topoChanged: false, cutOnIntact: cutOnIntact,
      acked: [], attempts: [], sendAt: [], srtt: null, rto: RTO_INIT, retx: 0, sent: 0, sendDone: false, failed: false, ended: false,
      have: [], nextSeq: 0, text: '', ooo: 0, dup: 0, maxSeq: -1, arrivals: [], first: [], recvDone: false, tDone: -1,
      lost: { cut: 0, ttl: 0, loss: 0, noroute: 0 }, lostData: 0, lostAll: 0, looped: false, loopDelivered: false
    };
    for (let s = 0; s < j.P; s++) { j.attempts[s] = 0; this.sendData(s); }
    this.emit('fx', { kind: 'start', job: j, t: this.t });
    return j;
  };
  W.sendData = function (s) {
    const j = this.job, net = this.net;
    j.attempts[s]++;
    j.sent++;
    const p = this.newPkt({ kind: 'data', src: net.pc, dst: net.sv, seq: s, payload: j.parts[s], size: HEADER + j.parts[s].length, ttl: j.ttl, attempt: j.attempts[s] });
    const w = this.hostSend(p, net.pc);
    const start = w ? w.start : this.t;
    j.sendAt[s] = start;
    this.schedule(start + j.rto, 'timeout', { job: j.n, seq: s, attempt: j.attempts[s] });
    return p;
  };
  W.onTimeout = function (d) {
    const j = this.job;
    if (!j || j.n !== d.job || j.ended || j.acked[d.seq] || d.attempt !== j.attempts[d.seq]) return;
    if (j.attempts[d.seq] > MAX_RETX) { this.fail(); return; }
    j.retx++;
    this.emit('fx', { kind: 'retx', seq: d.seq, t: this.t });
    this.sendData(d.seq);
  };
  W.fail = function () {
    const j = this.job, net = this.net;
    j.failed = true; j.ended = true;
    const routerCuts = net.links.filter(function (l) { return !l.up && !l.access; }).length;
    const accessCut = net.links.some(function (l) { return !l.up && l.access; });
    const out = {
      algo: this.algo, net: net.id, msg: j.msg, text: j.text, P: j.P, k: j.k,
      partition: !connected(net, net.pc, net.sv), accessCut: accessCut, routerCuts: routerCuts,
      minCut: minCut(net, net.gw[net.pc].router, net.gw[net.sv].router), topo: topoKey(net), time: this.t - j.t0, delivered: j.recvDone
    };
    this.emit('failed', out);
    this.emit('fx', { kind: 'failed', job: j, t: this.t });
  };
  W.atHost = function (p, h) {
    const j = this.job, net = this.net;
    const mine = j && j.n === p.job && !j.ended;
    if (p.kind === 'data' && h === net.sv) {
      if (!mine) return;
      // 回傳這一包的確認
      const a = this.newPkt({ kind: 'ack', src: net.sv, dst: net.pc, seq: p.seq, job: p.job });
      this.hostSend(a, net.sv);
      if (j.have[p.seq]) { j.dup++; this.emit('fx', { kind: 'dup', p: p, t: this.t }); return; }
      j.have[p.seq] = true;
      const ooo = p.seq < j.maxSeq;
      if (ooo) j.ooo++;
      j.maxSeq = Math.max(j.maxSeq, p.seq);
      j.arrivals.push(p.seq);
      j.first[p.seq] = { path: p.hops.slice(), ttl: p.ttl, looped: p.looped, t: this.t };
      if (p.looped) { j.loopDelivered = true; j.looped = true; }
      while (j.have[j.nextSeq]) { j.text += j.parts[j.nextSeq]; j.nextSeq++; }
      this.emit('fx', { kind: 'deliver', p: p, ooo: ooo, t: this.t });
      if (j.nextSeq === j.P && !j.recvDone) { j.recvDone = true; j.tDone = this.t; this.emit('delivered', this.summary()); }
      return;
    }
    if (p.kind === 'ack' && h === net.pc) {
      if (!mine || j.acked[p.seq]) return;
      j.acked[p.seq] = true;
      if (j.attempts[p.seq] === 1) {                       // Karn：重送過的不量
        const rtt = this.t - j.sendAt[p.seq];
        j.srtt = j.srtt == null ? rtt : 0.875 * j.srtt + 0.125 * rtt;
        j.rto = Math.max(RTO_MIN, Math.min(RTO_MAX, 2 * j.srtt));
      }
      this.emit('fx', { kind: 'ack', p: p, t: this.t });
      if (j.acked.filter(Boolean).length === j.P) {
        j.sendDone = true;
        const sum = this.summary();
        j.ended = true;
        this.emit('finished', sum);
        this.emit('fx', { kind: 'done', job: j, t: this.t });
      }
      return;
    }
    if ((p.kind === 'icmp' || p.kind === 'reply') && h === net.pc) { if (mine) this.traceReply(p); return; }
    if (p.kind === 'probe' && h === net.sv) {
      if (!mine) return;
      const r = this.newPkt({ kind: 'reply', src: net.sv, dst: net.pc, probeK: p.probeK, reporter: net.sv, icmpKind: 'reached', job: p.job });
      this.hostSend(r, net.sv);
    }
  };
  /** 送達時的總結（任務判定用） */
  W.summary = function () {
    const j = this.job, net = this.net, self = this;
    const paths = {}, list = [];
    let tmin = Infinity, tmax = -Infinity, ham = false;
    j.first.forEach(function (f) {
      const key = f.path.map(function (v) { return self.name(v); }).join('>');
      if (!paths[key]) { paths[key] = f.path; list.push(key); }
      tmin = Math.min(tmin, f.ttl); tmax = Math.max(tmax, f.ttl);
      if (isHamilton(net, f.path)) ham = true;
    });
    const single = list.length === 1 ? paths[list[0]] : null;
    const ls = lsTables(net);
    const lsp = followPath(net, function (r, d) { return lsNextOf(net, ls, r, d); });
    let best = { time: -1, ks: [] };
    if (single && !j.topoChanged) {
      const props = [];
      for (let i = 1; i < single.length; i++) props.push(linkBetween(net, single[i - 1], single[i]).cost);
      best = bestSizes(props, j.M);
    }
    return {
      algo: this.algo, net: net.id, k: j.k, M: j.M, P: j.P, ttl: j.ttl, loss: Math.round(j.loss * 100),
      time: Math.round(((j.recvDone ? j.tDone : this.t) - j.t0) * 1000) / 1000, finish: Math.round((this.t - j.t0) * 1000) / 1000, retx: j.retx, sent: j.sent,
      lost: Object.assign({}, j.lost), lostData: j.lostData, lostAll: j.lostAll, ooo: j.ooo, dup: j.dup,
      paths: list.length, path: single ? list[0] : '', hops: single ? single.length - 2 : -1,
      pathDelay: single ? pathDelay(net, single) : -1, lsDelay: lsp.ok ? pathDelay(net, lsp.path) : -1,
      ttlMin: tmin, ttlMax: tmax, looped: j.looped, loopDelivered: j.loopDelivered, hamilton: ham,
      lastFirst: j.P >= 3 && j.arrivals[0] === j.P - 1, firstSeq: j.arrivals[0],
      msg: j.msg, cutOnIntact: j.cutOnIntact, costEdited: costEdited(net), topo: j.topo0, topoChanged: j.topoChanged,
      bestKs: best.ks, bestTime: best.time, split: this.split, auto: this.auto
    };
  };

  // ---------- 追蹤路由 ----------
  W.trace = function (opt) {
    this.cancelJob();
    const n = ++this.jobN;
    const j = this.job = { n: n, kind: 'trace', t0: this.t, loss: Math.max(0, Math.min(0.5, (opt && opt.loss) || 0)), seed: this.seedBase + n, rand: rng(this.seedBase + n),
      k: 0, lines: [], ended: false, sentAt: 0 };
    this.emit('fx', { kind: 'start', job: j, t: this.t });
    this.nextProbe();
    return j;
  };
  W.nextProbe = function () {
    const j = this.job;
    if (j.k >= TRACE_MAX) { this.endTrace(false); return; }
    j.k++;
    j.sentAt = this.t;
    const p = this.newPkt({ kind: 'probe', src: this.net.pc, dst: this.net.sv, probeK: j.k, ttl: j.k });
    this.hostSend(p, this.net.pc);
    this.schedule(this.t + TRACE_WAIT, 'traceWait', { job: j.n, k: j.k });
  };
  W.traceReply = function (p) {
    const j = this.job;
    if (j.kind !== 'trace' || p.probeK !== j.k || j.lines.length >= j.k) return;
    j.lines.push({ k: j.k, node: p.reporter, kind: p.icmpKind, rtt: Math.round((this.t - j.sentAt) * 100) / 100 });
    this.emit('fx', { kind: 'traceLine', line: j.lines[j.lines.length - 1], t: this.t });
    if (p.icmpKind === 'reached') this.endTrace(true);
    else if (p.icmpKind === 'unreach') this.endTrace(false);
    else this.nextProbe();
  };
  W.onTraceWait = function (d) {
    const j = this.job;
    if (!j || j.kind !== 'trace' || j.ended || j.n !== d.job || j.k !== d.k || j.lines.length >= j.k) return;
    j.lines.push({ k: j.k, node: -1, kind: 'timeout', rtt: -1 });
    this.emit('fx', { kind: 'traceLine', line: j.lines[j.lines.length - 1], t: this.t });
    const L = j.lines.length;
    if (L >= TRACE_GIVEUP && j.lines.slice(L - TRACE_GIVEUP).every(function (l) { return l.node < 0; })) this.endTrace(false);   // 連續幾站都沒有回音就停
    else this.nextProbe();
  };
  W.endTrace = function (reached) {
    const j = this.job, self = this;
    j.ended = true;
    const names = j.lines.map(function (l) { return l.node >= 0 ? self.name(l.node) : '*'; });
    const seen = {};
    let repeat = false;
    // 迴圈：同一台路由器兩次回報「TTL 用完」（目的地不可達的回報不算）
    j.lines.forEach(function (l) { if (l.node >= 0 && l.kind === 'ttl' && !self.node(l.node).host) { if (seen[l.node]) repeat = true; seen[l.node] = true; } });
    this.emit('trace', { algo: this.algo, net: this.net.id, topoChanged: !!j.topoChanged, reached: !!reached, lines: j.lines.length, names: names, repeat: repeat, routers: Object.keys(seen).length, split: this.split, auto: this.auto, loss: Math.round(j.loss * 100) });
    this.emit('fx', { kind: 'traceEnd', job: j, t: this.t });
  };

  /** 取消目前的工作：網路上的封包全部清掉、計時器作廢 */
  W.cancelJob = function () {
    if (this.job) this.job.ended = true;
    const self = this;
    this.pkts.slice().forEach(function (p) { self.removePkt(p); });
    this.evq = this.evq.filter(function (e) { return e.type === 'dvRound'; });
    this.busy = {};
  };
  /** 換網路：全部重來（演算法與選項保留） */
  W.reset = function (netId) {
    this.cancelJob();
    this.job = null;
    this.net = buildNet(netId || this.net.id);
    this.recompute();
    this.evq = [];
    this.dvPending = false;
    if (this.algo === 'dv') { this.dv = dvCold(this.net); this.kickDv(); }
  };

  const api = {
    HEADER: HEADER, RATE: RATE, INF: INF, CTRL_TTL: CTRL_TTL, RTO_INIT: RTO_INIT, RTO_MIN: RTO_MIN, RTO_MAX: RTO_MAX, MAX_RETX: MAX_RETX,
    DV_PERIOD: DV_PERIOD, TRACE_MAX: TRACE_MAX, TRACE_WAIT: TRACE_WAIT, TRACE_GIVEUP: TRACE_GIVEUP, MSG_MAX: MSG_MAX, K_MIN: K_MIN, K_MAX: K_MAX, TTL_MAX: TTL_MAX,
    NETWORKS: NETWORKS, NET_IDS: NET_IDS,
    buildNet: buildNet, cloneNet: cloneNet, nbrs: nbrs, linkBetween: linkBetween, topoKey: topoKey, connected: connected,
    dijkstra: dijkstra, lsTables: lsTables, dvCold: dvCold, dvRound: dvRound, dvLinkChange: dvLinkChange,
    minCut: minCut, pathDelay: pathDelay, isHamilton: isHamilton, followPath: followPath, bestPath: bestPath, lsNextOf: lsNextOf, dvNextOf: dvNextOf,
    split: split, cleanMsg: cleanMsg, theoryTime: theoryTime, pipelineFormula: pipelineFormula, bestSizes: bestSizes, rng: rng,
    World: World
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RoutingCore = api;
})(typeof window !== 'undefined' ? window : this);
