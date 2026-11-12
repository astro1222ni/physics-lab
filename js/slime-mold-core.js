/*
 * slime-mold-core.js — 「黏菌找路」的管網適應模型（與畫面無關，Node 可直接 require 做單元測試）
 *
 * 多頭絨泡菌（Physarum polycephalum）的變形體是一張原生質管子的網。原生質在管子裡流動，
 * 流得多的管子變粗、流得少的管子變細而消失。Tero、Kobayashi、Nakagaki（2007）把它寫成：
 *
 *   管子 ij 的導度 D_ij（Poiseuille：D = πr⁴/8η，所以管徑 r ∝ D^(1/4)），長度 L_ij。
 *   流量 Q_ij = D_ij (p_i − p_j) / L_ij。
 *   Kirchhoff：每個節點流進等於流出；食物源（入口）流進 I0、另一個食物源（出口）流出 I0。
 *   適應：dD_ij/dt = f(|Q_ij|) − D_ij。
 *
 * 第一部分（走迷宮，Nakagaki 2000、Tero 2007）：f(Q) = |Q|^μ。
 *   μ = 1：收斂到兩個食物之間的最短路徑（Bonifaci、Mehlhorn、Varma 2012 證明）。
 *   μ > 1：只剩一條路，但不一定是最短的（看一開始哪條粗）。
 *   μ < 1：好幾條路一起留下來；兩條平行路線的流量比 Q1/Q2 = (L2/L1)^(1/(1−μ))。
 *
 * 第二部分（多個食物源的網路，Tero 等 2010 東京鐵路網實驗的模型形式）：
 *   每一步隨機選一個食物源當入口（流進 I0），其他食物源平分流出；
 *   f(Q) = |Q|^γ / (1 + |Q|^γ)，γ = 1.8 左右。I0 大，網路多留幾條備援；I0 小，網路接近最小生成樹。
 *   Tero 2010 用光照代替山與湖（黏菌怕光）：這裡把山區管子的「有效長度」放大 (1 + M·h) 倍，h 是 0–1 的示意高度。
 *
 * 網路的評比（Tero 2010）：
 *   總長 TL、城市之間沿網路的平均距離 MD、容錯 FT（隨機斷一段管子，還能讓所有城市相連的機率，以長度加權）；
 *   TL、MD 都除以最小生成樹（MST）的值來比較。
 *
 * 數值：Kirchhoff 方程用帶狀 Cholesky 分解直接解（節點一列一列編號，帶寬約一列）；
 *   D 用半隱式更新 D ← (D + Δt·f) / (1 + Δt)，任何步長都穩定、D 不會變負。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SlimeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------
  // 亂數
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // 圖
  // ---------------------------------------------------------------------
  /**
   * 建立圖：nodes [[x, y], …]，edges [[a, b], …]；len 預設為兩點的距離。
   * 回傳 { n, m, x, y, ea, eb, len, cost, adj }：cost 是 Kirchhoff 用的有效長度（預設＝len）。
   */
  function graph(nodes, edges, lens) {
    const n = nodes.length, m = edges.length;
    const g = { n: n, m: m, x: new Float64Array(n), y: new Float64Array(n),
      ea: new Int32Array(m), eb: new Int32Array(m), len: new Float64Array(m), cost: new Float64Array(m), h: new Float64Array(n) };
    nodes.forEach(function (p, i) { g.x[i] = p[0]; g.y[i] = p[1]; });
    edges.forEach(function (e, k) {
      g.ea[k] = e[0]; g.eb[k] = e[1];
      g.len[k] = lens ? lens[k] : Math.hypot(nodes[e[0]][0] - nodes[e[1]][0], nodes[e[0]][1] - nodes[e[1]][1]);
      g.cost[k] = g.len[k];
    });
    g.adj = adjacency(g);
    return g;
  }
  function adjacency(g) {
    const adj = [];
    for (let i = 0; i < g.n; i++) adj.push([]);
    for (let e = 0; e < g.m; e++) { adj[g.ea[e]].push(e); adj[g.eb[e]].push(e); }
    return adj;
  }
  function other(g, e, i) { return g.ea[e] === i ? g.eb[e] : g.ea[e]; }

  // ---------------------------------------------------------------------
  // Kirchhoff：(Σ g_e (p_i − p_j)) + ε p_i = b_i
  // 節點是一列一列編號的，矩陣是帶狀的（帶寬＝一列的節點數左右），用帶狀 Cholesky 直接解：
  //   分解 n·w²/2 次運算，之後每個右手邊只要 2·n·w 次，同一步有好幾個食物源輪流當入口時很划算。
  // ---------------------------------------------------------------------
  function bandwidth(g) {
    let w = 1;
    for (let e = 0; e < g.m; e++) w = Math.max(w, Math.abs(g.ea[e] - g.eb[e]));
    return w;
  }
  /**
   * 依導度 cond（= D/L）組矩陣並分解。加上很小的 ε 讓矩陣正定：
   * 斷開、沒有注入的節點壓力是 0，對有流量的部分影響小於 1e-10。回傳分解結果 F。
   */
  function factor(g, cond, F) {
    const n = g.n, w = g.bw || (g.bw = bandwidth(g)), W = w + 1;
    if (!F || F.L.length !== n * W) F = { L: new Float64Array(n * W), n: n, w: w };
    const L = F.L;
    L.fill(0);
    let gmax = 0;
    for (let e = 0; e < g.m; e++) {
      const c = cond[e], i = Math.max(g.ea[e], g.eb[e]), j = Math.min(g.ea[e], g.eb[e]);
      L[i * W + w] += c; L[j * W + w] += c; L[i * W + w - (i - j)] -= c;
      if (c > gmax) gmax = c;
    }
    const eps = 1e-12 * (gmax || 1);
    for (let i = 0; i < n; i++) L[i * W + w] += eps;
    // L[i, j] 存在 L[i·W + w − (i − j)]
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - w);
      for (let j = i0; j <= i; j++) {
        let s = L[i * W + w - (i - j)];
        const k0 = Math.max(i0, j - w);
        for (let k = k0; k < j; k++) s -= L[i * W + w - (i - k)] * L[j * W + w - (j - k)];
        if (j === i) L[i * W + w] = Math.sqrt(Math.max(s, eps * 1e-6));
        else L[i * W + w - (i - j)] = s / L[j * W + w];
      }
    }
    return F;
  }
  /** 用分解結果解 A p = b（p 會被覆寫） */
  function backsolve(F, b, p) {
    const n = F.n, w = F.w, W = w + 1, L = F.L;
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let k = Math.max(0, i - w); k < i; k++) s -= L[i * W + w - (i - k)] * p[k];
      p[i] = s / L[i * W + w];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = p[i];
      for (let k = i + 1; k <= Math.min(n - 1, i + w); k++) s -= L[k * W + w - (k - i)] * p[k];
      p[i] = s / L[i * W + w];
    }
    return p;
  }
  /** 一次解完：cond、b → p */
  function solve(g, cond, b, p) {
    return backsolve(factor(g, cond), b, p || new Float64Array(g.n));
  }

  // ---------------------------------------------------------------------
  // 模擬
  // ---------------------------------------------------------------------
  /**
   * 建立模擬狀態。
   * o = { g, foods: [節點…], I0, rule: 'pow' | 'sig', mu, gamma, dt, noise, seed, D0 }
   *   'pow'：f = |Q|^μ（迷宮）；'sig'：f = |Q|^γ/(1+|Q|^γ)（網路）。
   *   兩個食物源：固定一進一出。三個以上：每個食物源輪流當入口（流進 I0、其他平分流出），
   *   f 取這幾種情況的平均——就是 Tero 2010「每一步隨機選一個入口」在步長很小時的平均效果，結果可以重現。
   */
  function create(o) {
    const g = o.g, m = g.m;
    const s = {
      g: g, foods: o.foods.slice(), I0: o.I0 == null ? 1 : o.I0, rule: o.rule || 'pow',
      mu: o.mu == null ? 1 : o.mu, gamma: o.gamma == null ? 1.8 : o.gamma, dt: o.dt || 0.2,
      D: new Float64Array(m), Q: new Float64Array(m), Qabs: new Float64Array(m), cond: new Float64Array(m),
      fsum: new Float64Array(m), b: new Float64Array(g.n), p: new Float64Array(g.n), F: null,
      t: 0, steps: 0, change: Infinity, pruned: 0
    };
    const r0 = rng((o.seed || 1) * 7919 + 13), noise = o.noise || 0, D0 = o.D0 || 1;
    for (let e = 0; e < m; e++) s.D[e] = D0 * (1 + noise * (2 * r0() - 1));
    return s;
  }

  function fval(s, q) {
    if (s.rule === 'pow') return Math.pow(q, s.mu);
    const qg = Math.pow(q, s.gamma);
    return qg / (1 + qg);
  }

  /**
   * 走一步：解 Kirchhoff、算流量、更新管子。回傳這一步 D 的最大變化率（相對）。
   * s.Q 是流量（兩個食物源時有方向；三個以上時是各種入口情況的 |Q| 平均）。
   */
  function step(s) {
    const g = s.g, m = g.m, D = s.D, cond = s.cond, b = s.b, p = s.p, Fd = s.foods, fs = s.fsum;
    for (let e = 0; e < m; e++) cond[e] = D[e] / g.cost[e];
    s.F = factor(g, cond, s.F);
    const qmin = 1e-9 * s.I0, cases = Fd.length <= 2 ? 1 : Fd.length;
    fs.fill(0);
    for (let e = 0; e < m; e++) s.Qabs[e] = 0;
    for (let k = 0; k < cases; k++) {
      b.fill(0);
      if (cases === 1) { b[Fd[0]] += s.I0; b[Fd[1]] -= s.I0; }
      else { const out = s.I0 / (Fd.length - 1); for (let j = 0; j < Fd.length; j++) b[Fd[j]] += (j === k ? s.I0 : -out); }
      backsolve(s.F, b, p);
      for (let e = 0; e < m; e++) {
        if (D[e] === 0) continue;
        const q = cond[e] * (p[g.ea[e]] - p[g.eb[e]]), qa = Math.abs(q);
        if (cases === 1) s.Q[e] = q;
        s.Qabs[e] += qa / cases;
        fs[e] += (qa < qmin ? 0 : fval(s, qa)) / cases;
      }
    }
    const dt = s.dt;
    let ch = 0;
    for (let e = 0; e < m; e++) {
      const d0 = D[e];
      if (d0 === 0) { s.Q[e] = 0; continue; }
      if (cases > 1) s.Q[e] = s.Qabs[e];
      let d1 = (d0 + dt * fs[e]) / (1 + dt);
      if (d1 < 1e-7) { d1 = 0; s.pruned++; }
      D[e] = d1;
      const c = Math.abs(d1 - d0) / (dt * Math.max(d0, 1e-3));
      if (c > ch) ch = c;
    }
    s.t += dt; s.steps++;
    s.change = ch;
    return ch;
  }

  /** 連續走 n 步（或到 change < tol 為止） */
  function run(s, n, tol) {
    for (let i = 0; i < n; i++) {
      step(s);
      if (tol && s.change < tol) return i + 1;
    }
    return n;
  }

  // ---------------------------------------------------------------------
  // 圖的分析
  // ---------------------------------------------------------------------
  /** 從 src 出發的 Dijkstra（只走 ok[e] 的邊，權重 w[e]）；回傳 { dist, prevE } */
  function dijkstra(g, src, w, ok) {
    const n = g.n, dist = new Float64Array(n).fill(Infinity), prevE = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[src] = 0;
    // 二元堆積
    const heap = [[0, src]];
    function push(it) {
      heap.push(it);
      let i = heap.length - 1;
      while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; const t = heap[i]; heap[i] = heap[j]; heap[j] = t; i = j; }
    }
    function pop() {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let k = i;
          if (l < heap.length && heap[l][0] < heap[k][0]) k = l;
          if (r < heap.length && heap[r][0] < heap[k][0]) k = r;
          if (k === i) break;
          const t = heap[i]; heap[i] = heap[k]; heap[k] = t; i = k;
        }
      }
      return top;
    }
    while (heap.length) {
      const it = pop(), u = it[1];
      if (done[u]) continue;
      done[u] = 1;
      const A = g.adj[u];
      for (let k = 0; k < A.length; k++) {
        const e = A[k];
        if (ok && !ok[e]) continue;
        const v = other(g, e, u), nd = it[0] + w[e];
        if (nd < dist[v]) { dist[v] = nd; prevE[v] = e; push([nd, v]); }
      }
    }
    return { dist: dist, prevE: prevE };
  }
  /** 沿 prevE 回溯路徑上的邊 */
  function pathEdges(g, prevE, to) {
    const out = [];
    let v = to;
    while (prevE[v] >= 0) { const e = prevE[v]; out.push(e); v = other(g, e, v); }
    return out;
  }

  /**
   * 分析一張子網（ok[e] = 1 的邊）對一組城市的表現：
   * { connected, TL, MD, FT, edges, bridgesLen, comps }
   *   TL：總長（len 的和，只算和城市連在一起的部分）；MD：所有城市對沿網路的平均最短距離；
   *   FT：1 −（斷掉會讓城市分開的邊的長度 ÷ TL）。
   */
  function netStats(g, ok, cities) {
    const n = g.n, m = g.m;
    // 只留和第一個城市連通的部分
    const comp = new Int32Array(n).fill(-1);
    let nc = 0;
    for (let i = 0; i < n; i++) {
      if (comp[i] >= 0) continue;
      const st = [i]; comp[i] = nc;
      while (st.length) {
        const u = st.pop(), A = g.adj[u];
        for (let k = 0; k < A.length; k++) { const e = A[k]; if (!ok[e]) continue; const v = other(g, e, u); if (comp[v] < 0) { comp[v] = nc; st.push(v); } }
      }
      nc++;
    }
    const c0 = comp[cities[0]];
    const connected = cities.every(function (c) { return comp[c] === c0; });
    // 和城市所在的連通塊有關的邊
    const isCity = new Uint8Array(n);
    cities.forEach(function (c) { isCity[c] = 1; });
    const cityComp = {};
    cities.forEach(function (c) { cityComp[comp[c]] = 1; });
    const use = new Uint8Array(m);
    let TL = 0, ne = 0;
    for (let e = 0; e < m; e++) if (ok[e] && cityComp[comp[g.ea[e]]]) { use[e] = 1; TL += g.len[e]; ne++; }
    // 平均距離
    let MD = 0, pairs = 0;
    if (connected) {
      for (let i = 0; i < cities.length; i++) {
        const r = dijkstra(g, cities[i], g.len, use);
        for (let j = i + 1; j < cities.length; j++) { MD += r.dist[cities[j]]; pairs++; }
      }
      MD = pairs ? MD / pairs : 0;
    } else MD = Infinity;
    // 橋（Tarjan，非遞迴），橋兩側都有城市才算「斷了會讓城市分開」
    const disc = new Int32Array(n).fill(-1), low = new Int32Array(n), sub = new Int32Array(n);
    let time = 0, bridgesLen = 0;
    const totalCity = {};
    cities.forEach(function (c) { totalCity[comp[c]] = (totalCity[comp[c]] || 0) + 1; });
    for (let r0 = 0; r0 < n; r0++) {
      if (disc[r0] >= 0 || !cityComp[comp[r0]]) continue;
      const stack = [[r0, -1, 0]];
      disc[r0] = low[r0] = time++; sub[r0] = isCity[r0];
      while (stack.length) {
        const top = stack[stack.length - 1], u = top[0], pe = top[1], A = g.adj[u];
        if (top[2] < A.length) {
          const e = A[top[2]++];
          if (!use[e] || e === pe) continue;
          const v = other(g, e, u);
          if (disc[v] < 0) { disc[v] = low[v] = time++; sub[v] = isCity[v]; stack.push([v, e, 0]); }
          else if (disc[v] < low[u]) low[u] = disc[v];
        } else {
          stack.pop();
          if (stack.length) {
            const par = stack[stack.length - 1][0];
            if (low[u] < low[par]) low[par] = low[u];
            sub[par] += sub[u];
            if (low[u] > disc[par]) {
              const tot = totalCity[comp[u]] || 0;
              if (sub[u] > 0 && sub[u] < tot) bridgesLen += g.len[pe];
            }
          }
        }
      }
    }
    const FT = TL > 0 ? 1 - bridgesLen / TL : 0;
    return { connected: connected, TL: TL, MD: MD, FT: FT, edges: ne, bridgesLen: bridgesLen, comps: nc };
  }

  /** 把一組城市對用「最便宜的路徑」嵌進格子（cost 權重），回傳邊的集合 ok */
  function embed(g, pairs, w) {
    const ok = new Uint8Array(g.m), cache = {};
    pairs.forEach(function (pr) {
      const a = pr[0], b = pr[1];
      if (!cache[a]) cache[a] = dijkstra(g, a, w);
      pathEdges(g, cache[a].prevE, b).forEach(function (e) { ok[e] = 1; });
    });
    return ok;
  }
  /** 城市之間的最小生成樹（兩城的距離＝格子上最便宜路徑的 w 總和），回傳城市對 */
  function mstPairs(g, cities, w) {
    const k = cities.length, Dm = [];
    for (let i = 0; i < k; i++) { const r = dijkstra(g, cities[i], w); Dm.push(cities.map(function (c) { return r.dist[c]; })); }
    const inT = new Uint8Array(k), best = new Float64Array(k).fill(Infinity), from = new Int32Array(k).fill(-1), out = [];
    best[0] = 0;
    for (let it = 0; it < k; it++) {
      let u = -1;
      for (let i = 0; i < k; i++) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i;
      inT[u] = 1;
      if (from[u] >= 0) out.push([cities[from[u]], cities[u]]);
      for (let v = 0; v < k; v++) if (!inT[v] && Dm[u][v] < best[v]) { best[v] = Dm[u][v]; from[v] = u; }
    }
    return out;
  }

  /** 目前的管網：D ≥ thr 的邊 */
  function alive(s, thr) {
    const ok = new Uint8Array(s.g.m), t = thr == null ? 1e-3 : thr;
    for (let e = 0; e < s.g.m; e++) if (s.D[e] >= t) ok[e] = 1;
    return ok;
  }

  // ---------------------------------------------------------------------
  // 迷宮
  // ---------------------------------------------------------------------
  /**
   * W × H 格的迷宮：先用深度優先挖出「完美迷宮」（任兩格只有一條路），再隨機拆掉 loops 面牆造出環路。
   * 回傳 { W, H, g, open: Set('i,j|i2,j2') }；格子 (i, j) 的節點編號 j·W + i，座標是格子中心。
   */
  function maze(W, H, loops, seed) {
    const rnd = rng(seed || 1), n = W * H, seen = new Uint8Array(n), open = {};
    function key(a, b) { return a < b ? a + ',' + b : b + ',' + a; }
    const st = [Math.floor(rnd() * n)];
    seen[st[0]] = 1;
    while (st.length) {
      const c = st[st.length - 1], i = c % W, j = (c - i) / W, nb = [];
      if (i > 0 && !seen[c - 1]) nb.push(c - 1);
      if (i < W - 1 && !seen[c + 1]) nb.push(c + 1);
      if (j > 0 && !seen[c - W]) nb.push(c - W);
      if (j < H - 1 && !seen[c + W]) nb.push(c + W);
      if (!nb.length) { st.pop(); continue; }
      const v = nb[Math.floor(rnd() * nb.length)];
      open[key(c, v)] = 1; seen[v] = 1; st.push(v);
    }
    // 還沒打通的內牆
    const walls = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = j * W + i;
      if (i < W - 1 && !open[key(c, c + 1)]) walls.push([c, c + 1]);
      if (j < H - 1 && !open[key(c, c + W)]) walls.push([c, c + W]);
    }
    for (let k = 0; k < loops && walls.length; k++) {
      const idx = Math.floor(rnd() * walls.length), w = walls.splice(idx, 1)[0];
      open[key(w[0], w[1])] = 1;
    }
    const nodes = [], edges = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) nodes.push([i + 0.5, j + 0.5]);
    Object.keys(open).forEach(function (k) { const p = k.split(','); edges.push([+p[0], +p[1]]); });
    edges.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return { W: W, H: H, g: graph(nodes, edges), open: open, key: key };
  }

  /** 無權重的 BFS 距離 */
  function bfs(g, src, ok) {
    const d = new Int32Array(g.n).fill(-1), q = [src];
    d[src] = 0;
    for (let h = 0; h < q.length; h++) {
      const u = q[h], A = g.adj[u];
      for (let k = 0; k < A.length; k++) { const e = A[k]; if (ok && !ok[e]) continue; const v = other(g, e, u); if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } }
    }
    return d;
  }

  /**
   * 兩個食物之間「互不相同的路線」：
   * 最短長度、在某條最短路徑上的邊、第二短的簡單路線長度（用拿掉最短路上每一條邊再找的方法，Yen 的第一步）。
   */
  function mazeRoutes(g, s, t) {
    const ds = bfs(g, s), dt = bfs(g, t), L = ds[t];
    const onShort = new Uint8Array(g.m);
    let nShortEdges = 0;
    for (let e = 0; e < g.m; e++) {
      const a = g.ea[e], b = g.eb[e];
      if (ds[a] + 1 + dt[b] === L || ds[b] + 1 + dt[a] === L) { onShort[e] = 1; nShortEdges++; }
    }
    // 第二短：拿掉一條最短路上的邊
    const r = dijkstra(g, s, g.len), path = pathEdges(g, r.prevE, t);
    let second = Infinity;
    path.forEach(function (e) {
      const ok = new Uint8Array(g.m).fill(1);
      ok[e] = 0;
      const d = bfs(g, s, ok)[t];
      if (d > 0 && d < second) second = d;
    });
    // 最短路徑有幾條（數路徑數）
    const order = [];
    for (let i = 0; i < g.n; i++) if (ds[i] >= 0) order.push(i);
    order.sort(function (a, b) { return ds[a] - ds[b]; });
    const cnt = new Float64Array(g.n);
    cnt[s] = 1;
    order.forEach(function (u) {
      g.adj[u].forEach(function (e) { const v = other(g, e, u); if (ds[v] === ds[u] + 1 && onShort[e]) cnt[v] += cnt[u]; });
    });
    return { shortest: L, second: second, onShort: onShort, nShortest: cnt[t], shortPath: path };
  }

  /**
   * 迷宮的結果：活著的管子（D ≥ thr）組成的網
   * { connected, edges, cyc, single, len, shortest, isShortest, onShortOnly, kept }
   *   single：剛好是一條從 s 到 t 的路（沒有分岔、沒有環）；cyc：環的數目（獨立環路數＝邊 − 點 + 連通塊）。
   */
  function mazeResult(s, routes, thr) {
    const g = s.g, ok = alive(s, thr), F = s.foods;
    const d = bfs(g, F[0], ok);
    const connected = d[F[1]] >= 0;
    let edges = 0, verts = 0, onlyShort = true, odd = false, maxD = 0;
    const deg = new Int32Array(g.n);
    for (let e = 0; e < g.m; e++) if (ok[e]) {
      edges++; deg[g.ea[e]]++; deg[g.eb[e]]++;
      if (!routes.onShort[e]) onlyShort = false;
      if (s.D[e] > maxD) maxD = s.D[e];
    }
    for (let i = 0; i < g.n; i++) if (deg[i] > 0) { verts++; if (deg[i] > 2) odd = true; }
    // 連通塊數
    const seen = new Uint8Array(g.n);
    let comps = 0;
    for (let i = 0; i < g.n; i++) {
      if (!deg[i] || seen[i]) continue;
      comps++;
      const st = [i]; seen[i] = 1;
      while (st.length) { const u = st.pop(); g.adj[u].forEach(function (e) { if (!ok[e]) return; const v = other(g, e, u); if (!seen[v]) { seen[v] = 1; st.push(v); } }); }
    }
    const cyc = edges - verts + comps;
    const single = connected && comps === 1 && cyc === 0 && !odd && deg[F[0]] === 1 && deg[F[1]] === 1;
    let total = 0;
    for (let e = 0; e < g.m; e++) total += g.len[e];
    return {
      connected: connected, edges: edges, cyc: cyc, single: single,
      len: single ? edges : (connected ? d[F[1]] : Infinity),
      shortest: routes.shortest, second: routes.second, nShortest: routes.nShortest,
      isShortest: single && edges === routes.shortest,
      onShortOnly: connected && onlyShort,
      kept: edges / (total || 1), maxD: maxD
    };
  }

  // ---------------------------------------------------------------------
  // 臺灣（簡化海岸線、示意地形、城市）
  // ---------------------------------------------------------------------
  const LAT0 = 23.7, LON0 = 120.95, KX = 111.32 * Math.cos(LAT0 * Math.PI / 180), KY = 110.57;
  /** 經緯度 → 公里（東、北） */
  function proj(lat, lon) { return [(lon - LON0) * KX, (lat - LAT0) * KY]; }
  // 簡化海岸線（逆時針，從富貴角開始往東），約 4–20 公里一點
  const COAST = [
    [25.297, 121.535], [25.21, 121.65], [25.14, 121.74], [25.13, 121.92], [25.01, 122.0], [24.86, 121.83], [24.72, 121.83],
    [24.59, 121.87], [24.46, 121.81], [24.3, 121.76], [24.2, 121.68], [23.98, 121.63], [23.78, 121.56], [23.6, 121.52],
    [23.48, 121.51], [23.3, 121.45], [23.1, 121.38], [22.88, 121.23], [22.75, 121.16], [22.61, 121.01], [22.46, 120.95],
    [22.34, 120.9], [22.2, 120.88], [21.99, 120.86], [21.9, 120.85], [21.92, 120.73], [22.0, 120.7], [22.07, 120.71],
    [22.19, 120.68], [22.37, 120.59], [22.46, 120.45], [22.5, 120.38], [22.61, 120.27], [22.82, 120.2], [22.99, 120.15],
    [23.13, 120.07], [23.27, 120.11], [23.38, 120.14], [23.46, 120.14], [23.58, 120.15], [23.7, 120.19], [23.79, 120.22],
    [23.94, 120.31], [24.06, 120.41], [24.17, 120.47], [24.27, 120.5], [24.38, 120.57], [24.44, 120.63], [24.49, 120.67],
    [24.62, 120.76], [24.7, 120.85], [24.85, 120.92], [24.92, 120.97], [25.05, 121.08], [25.12, 121.24], [25.16, 121.4],
    [25.18, 121.42], [25.26, 121.5]
  ];
  // 城市（縣市的主要車站附近）；on：預設是否放食物
  const CITIES = [
    { id: 'kee', zh: '基隆', en: 'Keelung', lat: 25.13, lon: 121.74, on: 1 },
    { id: 'tpe', zh: '臺北', en: 'Taipei', lat: 25.05, lon: 121.52, on: 1 },
    { id: 'tyn', zh: '桃園', en: 'Taoyuan', lat: 24.99, lon: 121.31, on: 1 },
    { id: 'hsz', zh: '新竹', en: 'Hsinchu', lat: 24.8, lon: 120.97, on: 1 },
    { id: 'mia', zh: '苗栗', en: 'Miaoli', lat: 24.57, lon: 120.82, on: 1 },
    { id: 'txg', zh: '臺中', en: 'Taichung', lat: 24.14, lon: 120.69, on: 1 },
    { id: 'chw', zh: '彰化', en: 'Changhua', lat: 24.08, lon: 120.54, on: 1 },
    { id: 'nto', zh: '南投', en: 'Nantou', lat: 23.91, lon: 120.68, on: 0 },
    { id: 'yun', zh: '雲林', en: 'Yunlin', lat: 23.71, lon: 120.54, on: 1 },
    { id: 'cyi', zh: '嘉義', en: 'Chiayi', lat: 23.48, lon: 120.45, on: 1 },
    { id: 'tnn', zh: '臺南', en: 'Tainan', lat: 22.99, lon: 120.21, on: 1 },
    { id: 'khh', zh: '高雄', en: 'Kaohsiung', lat: 22.64, lon: 120.3, on: 1 },
    { id: 'pif', zh: '屏東', en: 'Pingtung', lat: 22.67, lon: 120.49, on: 1 },
    { id: 'hch', zh: '恆春', en: 'Hengchun', lat: 22.0, lon: 120.75, on: 0 },
    { id: 'ttt', zh: '臺東', en: 'Taitung', lat: 22.79, lon: 121.12, on: 1 },
    { id: 'hun', zh: '花蓮', en: 'Hualien', lat: 23.99, lon: 121.6, on: 1 },
    { id: 'ila', zh: '宜蘭', en: 'Yilan', lat: 24.75, lon: 121.76, on: 1 }
  ];
  // 臺鐵主要路線（簡化成城市之間的連線）：縱貫線（山線、海線）、屏東線、南迴線、臺東線、北迴線、宜蘭線
  const RAIL = [['kee', 'tpe'], ['tpe', 'tyn'], ['tyn', 'hsz'], ['hsz', 'mia'], ['mia', 'txg'], ['mia', 'chw'], ['txg', 'chw'],
    ['chw', 'yun'], ['yun', 'cyi'], ['cyi', 'tnn'], ['tnn', 'khh'], ['khh', 'pif'], ['pif', 'ttt'], ['ttt', 'hun'],
    ['hun', 'ila'], ['ila', 'kee']];
  // 示意地形：中央山脈（含雪山山脈）與海岸山脈的脊線（緯度、經度、相對高度），高斯山脊
  const RIDGES = [
    { w: 22, pts: [[24.85, 121.62, 0.35], [24.6, 121.45, 0.75], [24.38, 121.23, 1.0], [23.9, 121.12, 0.95], [23.47, 120.96, 1.0],
      [22.95, 120.85, 0.8], [22.45, 120.76, 0.5], [22.05, 120.8, 0.22]] },
    { w: 5, pts: [[23.88, 121.53, 0.15], [23.5, 121.44, 0.32], [23.1, 121.31, 0.28], [22.85, 121.2, 0.12]] }
  ];
  const RIDGE_KM = RIDGES.map(function (r) { return { w: r.w, pts: r.pts.map(function (p) { const q = proj(p[0], p[1]); return [q[0], q[1], p[2]]; }) }; });

  /** 示意高度 0–1（乘 3500 公尺約是實際的山高） */
  function elev(x, y) {
    let h = 0;
    RIDGE_KM.forEach(function (r) {
      let best = Infinity, hb = 0;
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const a = r.pts[i], b = r.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        let u = ((x - a[0]) * dx + (y - a[1]) * dy) / L2;
        u = Math.max(0, Math.min(1, u));
        const px = a[0] + u * dx, py = a[1] + u * dy, d = Math.hypot(x - px, y - py);
        if (d < best) { best = d; hb = a[2] + u * (b[2] - a[2]); }
      }
      h = Math.max(h, hb * Math.exp(-best * best / (2 * r.w * r.w)));
    });
    return h;
  }
  const COAST_KM = COAST.map(function (p) { return proj(p[0], p[1]); });
  function inside(x, y, poly) {
    const P = poly || COAST_KM;
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i], b = P[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  /**
   * 臺灣的三角格子（邊長 spacing 公里），城市所在的格點移到城市的位置。
   * 回傳 { g, city: {id: 節點}, spacing }；g.h 是每個節點的示意高度。
   */
  function taiwan(spacing) {
    const a = spacing || 7, rowH = a * Math.sqrt(3) / 2;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    COAST_KM.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    const nodes = [], idx = {};
    const rows = Math.ceil((y1 - y0) / rowH) + 1, cols = Math.ceil((x1 - x0) / a) + 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x0 + c * a + (r % 2 ? a / 2 : 0), y = y0 + r * rowH;
      if (inside(x, y)) { idx[r + ',' + c] = nodes.length; nodes.push([x, y]); }
    }
    const edges = [];
    function link(k1, k2) {
      const i = idx[k1], j = idx[k2];
      if (i == null || j == null) return;
      const mx = (nodes[i][0] + nodes[j][0]) / 2, my = (nodes[i][1] + nodes[j][1]) / 2;
      if (inside(mx, my)) edges.push([i, j]);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (idx[r + ',' + c] == null) continue;
      link(r + ',' + c, r + ',' + (c + 1));
      const cA = r % 2 ? c : c - 1;   // 下一列的左右兩個鄰居
      link(r + ',' + c, (r + 1) + ',' + cA);
      link(r + ',' + c, (r + 1) + ',' + (cA + 1));
    }
    // 只留最大的連通塊
    const n0 = nodes.length, adj0 = [];
    for (let i = 0; i < n0; i++) adj0.push([]);
    edges.forEach(function (e) { adj0[e[0]].push(e[1]); adj0[e[1]].push(e[0]); });
    const comp = new Int32Array(n0).fill(-1);
    let best = -1, bestN = 0, nc = 0;
    for (let i = 0; i < n0; i++) {
      if (comp[i] >= 0) continue;
      const st = [i]; comp[i] = nc; let cnt = 0;
      while (st.length) { const u = st.pop(); cnt++; adj0[u].forEach(function (v) { if (comp[v] < 0) { comp[v] = nc; st.push(v); } }); }
      if (cnt > bestN) { bestN = cnt; best = nc; }
      nc++;
    }
    const map = new Int32Array(n0).fill(-1), nodes2 = [];
    for (let i = 0; i < n0; i++) if (comp[i] === best) { map[i] = nodes2.length; nodes2.push(nodes[i]); }
    const edges2 = edges.filter(function (e) { return map[e[0]] >= 0; }).map(function (e) { return [map[e[0]], map[e[1]]]; });
    // 城市：最近的格點搬到城市的位置
    const city = {}, used = {};
    CITIES.forEach(function (c) {
      const p = proj(c.lat, c.lon);
      let bi = -1, bd = Infinity;
      nodes2.forEach(function (q, i) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd && !used[i]) { bd = d; bi = i; } });
      used[bi] = 1; city[c.id] = bi; nodes2[bi] = [p[0], p[1]];
    });
    const g = graph(nodes2, edges2);
    for (let i = 0; i < g.n; i++) g.h[i] = elev(g.x[i], g.y[i]);
    g.eh = new Float64Array(g.m);
    for (let e = 0; e < g.m; e++) g.eh[e] = elev((g.x[g.ea[e]] + g.x[g.eb[e]]) / 2, (g.y[g.ea[e]] + g.y[g.eb[e]]) / 2);
    return { g: g, city: city, spacing: a };
  }

  /** 山區阻力：有效長度 = 長度 × (1 + M·h)（h 取邊的中點高度） */
  function setMountain(g, M) {
    for (let e = 0; e < g.m; e++) g.cost[e] = g.len[e] * (1 + M * (g.eh ? g.eh[e] : 0));
  }

  /** 臺鐵路線嵌進格子（沿平地走：山區阻力固定用 10）；回傳邊集合 */
  function railEdges(T) {
    const g = T.g, w = new Float64Array(g.m);
    for (let e = 0; e < g.m; e++) w[e] = g.len[e] * (1 + 10 * g.eh[e]);
    return embed(g, RAIL.map(function (r) { return [T.city[r[0]], T.city[r[1]]]; }), w);
  }
  /** 最小生成樹嵌進格子（城市之間沿目前的有效長度最省的路）；回傳邊集合 */
  function mstEdges(g, cities) {
    return embed(g, mstPairs(g, cities, g.cost), g.cost);
  }

  /** 管網的「最高點」：活著的管子經過的最大示意高度 */
  function maxElev(g, ok) {
    let h = 0;
    for (let e = 0; e < g.m; e++) if (ok[e] && g.eh[e] > h) h = g.eh[e];
    return h;
  }

  return {
    rng: rng, graph: graph, solve: solve, factor: factor, backsolve: backsolve, bandwidth: bandwidth, create: create, step: step, run: run, fval: fval,
    dijkstra: dijkstra, pathEdges: pathEdges, netStats: netStats, embed: embed, mstPairs: mstPairs, alive: alive,
    maze: maze, bfs: bfs, mazeRoutes: mazeRoutes, mazeResult: mazeResult,
    proj: proj, elev: elev, inside: inside, taiwan: taiwan, setMountain: setMountain, railEdges: railEdges, mstEdges: mstEdges, maxElev: maxElev,
    COAST: COAST, COAST_KM: COAST_KM, CITIES: CITIES, RAIL: RAIL
  };
});
