/* river-meander-core.js — 「曲流、牛軛湖與河道變遷」的數學核心（與畫面無關，Node 可直接 require）
 *
 * 模型：曲流遷移的中心線模型（Ikeda、Parker 與 Sawai 1981；Howard 與 Knutson 1984；寫法參考 Sylvester 等 2019 的 meanderpy）。
 *   河道用一條中心線（一串節點，從上游 0 號排到下游）表示，河寬 W 處處相同。
 *   1. 無因次曲率 c = W·C，C = (x′y″ − y′x″) / (x′² + y′²)^{3/2}（向左彎為正）。
 *   2. 「名目遷移速率」R0 = k·c（k：河岸可蝕性，m/yr）。
 *   3. 實際遷移速率 R1(s) = Ω·R0(s) + Γ·∫ R0(s − ξ) e^{−αξ} dξ ／ ∫ e^{−αξ} dξ（只往上游積分）。
 *      Ω = −1、Γ = 2.5；α = 2·Cf／D（Cf 河床摩擦係數 0.01、D 平均水深）。上游彎道的水流慣性讓最強的侵蝕落在彎頂下游，
 *      所以曲流一邊長大、一邊往下游移動。
 *   4. 節點沿右手方向的法線移動 R1·dt（R1 > 0 往右岸移）：彎道外側（凹岸、攻擊坡）被沖蝕，內側（凸岸、滑走坡）堆積。
 *   5. 兩段不相鄰的河道中心線距離小於 CUT·W（兩岸碰在一起）就截彎取直：中間那一段離開河道，成為牛軛湖。
 *   6. 節點間距維持在 W／2 左右（太遠插點、太近刪點）；時間步長依最大遷移速率自動縮小，每步最多移動 0.1 個節點間距。
 * 水深與寬深比固定 W／D = 25，所以 α·W = 2·Cf·25 = 0.5：河寬變大，整個曲流的形狀等比例放大（曲流波長約 10–14 倍河寬）。
 * 橫剖面：彎道的河床橫向坡度 ∝ 曲率（Ikeda 等 1981，h(n) = D·(1 + A·C·n)，A = 2.89，n 往凹岸為正），
 *   所以凹岸深、凸岸淺；淺到 0 的地方就是露出水面的沙洲。
 * 亂數：用固定的種子（mulberry32），同樣的種子、同樣的操作就得到同樣的河道。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MeanderCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OMEGA = -1, GAMMA = 2.5, CF = 0.01, WD = 25, A_BED = 2.89, CUT = 1.0;
  const END_W = 8;                              // 進出口附近 8W 內的遷移逐漸減弱到 0（河道從固定的進出口平順地接出來）
  const NOISE = 0.03;                           // 小擾動：每年隨機側移約 0.03W，波長 12–22W（代表流量、河床、河岸物質的小變化）
  const VALLEY_L = 8000, VALLEY_H = 4000;      // 河谷範圍（m）：x 0 → 8000（水往右流），y −2000 → 2000
  const HIST_DT = 20, HIST_MAX = 40;            // 每 20 年留一條舊河道（曲流痕跡），最多 40 條
  const OX_MAX = 60;                            // 最多記住 60 個牛軛湖（最舊的先消失）
  const FILL_YR = 400;                          // 牛軛湖淤滿成溼地大約需要的年數（畫面用；不影響河道）
  const DT_MAX = 1;                             // 每步最多 1 年

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

  // 建立一條新河道：直線加上小小的隨機擾動
  function create(opts) {
    const o = opts || {};
    const W = o.W != null ? o.W : 80, k = o.k != null ? o.k : 8, seed = o.seed != null ? o.seed : 1;
    const r = {
      W, k, seed, t: 0, x: [], y: [], oxbows: [], hist: [], cuts: 0, artCuts: 0, nextHist: HIST_DT, rnd: rng(seed), lastCut: null, events: [],
      // 任務用的紀錄：這條河曾經到過的最大彎曲度、兩次自然截彎的最短間隔（年）、最近一次自然截彎的時間、人工拉直的時刻
      maxSin: 1, minGap: Infinity, minGap3: Infinity, minGap4: Infinity, lastNat: null, prevNat: null, prev2Nat: null, straightAt: null
    };
    const ds = W / 2, n = Math.round(VALLEY_L / ds);
    // 擾動：四個波長 10–22 倍河寬的正弦（相位隨機），加一點白雜訊；振幅和河寬成正比
    const R = r.rnd, modes = [];
    for (let j = 0; j < 4; j++) modes.push({ lam: W * (10 + 12 * R()), ph: R() * 6.283, a: W * (0.08 + 0.08 * R()) });
    for (let i = 0; i <= n; i++) {
      const x = i * VALLEY_L / n;
      const env = Math.sqrt(Math.sin(Math.PI * i / n));   // 兩端固定在河谷中線
      let y = 0;
      for (let j = 0; j < 4; j++) y += Math.sin(2 * Math.PI * x / modes[j].lam + modes[j].ph) * modes[j].a;
      y += (R() - 0.5) * W * 0.06;
      r.x.push(x); r.y.push(y * env);
    }
    r.y[0] = 0; r.y[n] = 0;
    return r;
  }

  function params(r) {
    const D = r.W / WD;
    return { W: r.W, D, alpha: 2 * CF / D, k: r.k };
  }

  // 曲率（1/m），用中央差分；兩端為 0
  function curvature(x, y) {
    const n = x.length, C = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) {
      const dx1 = x[i] - x[i - 1], dy1 = y[i] - y[i - 1], dx2 = x[i + 1] - x[i], dy2 = y[i + 1] - y[i];
      const l1 = Math.hypot(dx1, dy1), l2 = Math.hypot(dx2, dy2);
      if (l1 === 0 || l2 === 0) continue;
      const cr = dx1 * dy2 - dy1 * dx2, dt = dx1 * dx2 + dy1 * dy2;
      const ang = Math.atan2(cr, dt);              // 轉角（向左為正）
      C[i] = ang / ((l1 + l2) / 2);
    }
    return C;
  }

  // 遷移速率 R1（m/yr）：上游指數加權的卷積用遞迴算（O(n)）
  //   S_i = ∫ R0(s_i − ξ) e^{−αξ} dξ、G_i = ∫ e^{−αξ} dξ（從 0 積到上游端），R0 在節點之間當作線性，每一段精確積分：
  //   長度 h 的一段貢獻 R0_i·I0 + (R0_{i−1} − R0_i)·I1/h，I0 = (1 − e^{−αh})/α，I1 = (1 − e^{−αh}(1 + αh))/α²
  function migration(r) {
    const p = params(r), x = r.x, y = r.y, n = x.length, al = p.alpha;
    const C = curvature(x, y), R0 = new Float64Array(n), R1 = new Float64Array(n);
    for (let i = 0; i < n; i++) R0[i] = p.k * p.W * C[i];
    let S = 0, G = 0;
    for (let i = 1; i < n; i++) {
      const h = Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
      if (h > 0) {
        const e = Math.exp(-al * h), I0 = (1 - e) / al, I1 = (1 - e * (1 + al * h)) / (al * al);
        S = S * e + R0[i] * I0 + (R0[i - 1] - R0[i]) * I1 / h;
        G = G * e + I0;
      }
      R1[i] = G > 0 ? OMEGA * R0[i] + GAMMA * S / G : 0;
    }
    R1[0] = 0; R1[n - 1] = 0;
    // 進出口附近逐漸減弱（平滑的 smoothstep）
    const Ls = END_W * p.W;
    let s = 0, Ltot = 0;
    for (let i = 1; i < n; i++) Ltot += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    for (let i = 1; i < n - 1; i++) {
      s += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
      const u = Math.min(1, s / Ls, (Ltot - s) / Ls);
      if (u < 1) R1[i] *= u * u * (3 - 2 * u);
    }
    return { C, R0, R1 };
  }

  // 節點重新取樣：間距維持在 [0.5, 1.5] × W/2
  function resample(r) {
    const ds = r.W / 2, x = r.x, y = r.y, nx = [x[0]], ny = [y[0]];
    for (let i = 1; i < x.length; i++) {
      const px = nx[nx.length - 1], py = ny[ny.length - 1];
      const d = Math.hypot(x[i] - px, y[i] - py);
      if (d < ds * 0.5 && i < x.length - 1) continue;
      if (d > ds * 1.5) {
        const m = Math.ceil(d / ds);
        for (let j = 1; j < m; j++) { nx.push(px + (x[i] - px) * j / m); ny.push(py + (y[i] - py) * j / m); }
      }
      nx.push(x[i]); ny.push(y[i]);
    }
    r.x = nx; r.y = ny;
  }

  // 找截彎取直：沿河道距離超過 3W、但直線距離小於 CUT·W 的兩點（用格子加速）
  function findCut(r) {
    const x = r.x, y = r.y, n = x.length, d0 = CUT * r.W, cell = d0;
    const s = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    const grid = new Map();
    const key = (a, b) => a * 100003 + b;
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(x[i] / cell), gy = Math.floor(y[i] / cell);
      // 先和格子裡已有、而且在上游夠遠的點比較：找最上游的那一對（i 由小到大，j < i）
      let best = -1;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const L = grid.get(key(gx + a, gy + b));
        if (!L) continue;
        for (let q = 0; q < L.length; q++) {
          const j = L[q];
          if (s[i] - s[j] < 3 * r.W) continue;
          if (Math.hypot(x[i] - x[j], y[i] - y[j]) < d0 && (best < 0 || j < best)) best = j;
        }
      }
      if (best >= 0) return { i: best, j: i };
      const kk = key(gx, gy);
      if (!grid.has(kk)) grid.set(kk, []);
      grid.get(kk).push(i);
    }
    return null;
  }

  // 截掉 i 與 j 之間的河道，存成牛軛湖
  function doCut(r, i, j, artificial) {
    const ox = { x: r.x.slice(i, j + 1), y: r.y.slice(i, j + 1), t0: r.t, art: !!artificial };
    let L = 0;
    for (let q = 1; q < ox.x.length; q++) L += Math.hypot(ox.x[q] - ox.x[q - 1], ox.y[q] - ox.y[q - 1]);
    ox.len = L;
    r.x.splice(i + 1, j - i - 1); r.y.splice(i + 1, j - i - 1);
    r.oxbows.push(ox);
    if (r.oxbows.length > OX_MAX) r.oxbows.shift();
    if (artificial) r.artCuts++; else r.cuts++;
    r.lastCut = { t: r.t, len: L, art: !!artificial, x: (r.x[i] + r.x[i + 1]) / 2, y: (r.y[i] + r.y[i + 1]) / 2 };
    r.events.push(r.lastCut);
    if (r.events.length > 200) r.events.shift();
    if (!artificial) {
      if (r.lastNat != null) r.minGap = Math.min(r.minGap, r.t - r.lastNat);
      if (r.prevNat != null) r.minGap3 = Math.min(r.minGap3, r.t - r.prevNat);   // 連續三次自然截彎的時距
      if (r.prev2Nat != null) r.minGap4 = Math.min(r.minGap4, r.t - r.prev2Nat);   // 連續四次
      r.prev2Nat = r.prevNat; r.prevNat = r.lastNat; r.lastNat = r.t;
    }
    resample(r);
    return ox;
  }

  // 前進一步（自動決定步長，最多 maxDt 年）；回傳實際前進的年數
  function step(r, maxDt) {
    const lim = Math.min(maxDt != null ? maxDt : DT_MAX, DT_MAX);
    const m = migration(r), x = r.x, y = r.y, n = x.length;
    let vmax = 0;
    for (let i = 0; i < n; i++) vmax = Math.max(vmax, Math.abs(m.R1[i]));
    const dt = Math.min(lim, vmax > 0 ? 0.1 * (r.W / 2) / vmax : lim);
    const nx = x.slice(), ny = y.slice();
    // 小擾動（只有用 create 建立、帶亂數的河才有；測試用的自訂河道沒有）：三個隨機相位的正弦，振幅是高斯亂數
    const modes = [];
    if (r.rnd) {
      for (let j = 0; j < 3; j++) {
        const u1 = Math.max(1e-12, r.rnd()), u2 = r.rnd();
        const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        modes.push({ a: NOISE * r.W * Math.sqrt(dt) * g, kx: 2 * Math.PI / (r.W * (12 + 10 * r.rnd())), ph: 2 * Math.PI * r.rnd() });
      }
    }
    let Ltot = 0;
    if (modes.length) for (let i = 1; i < n; i++) Ltot += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    const Ls = END_W * r.W;
    const lim2 = VALLEY_H / 2 - r.W;
    let s = 0;
    for (let i = 1; i < n - 1; i++) {
      const tx = x[i + 1] - x[i - 1], ty = y[i + 1] - y[i - 1], l = Math.hypot(tx, ty) || 1;
      s += Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
      // 右手法線 (ty, −tx)/l
      let mv = m.R1[i] * dt;
      if (modes.length) {
        const u = Math.min(1, s / Ls, (Ltot - s) / Ls), env = u * u * (3 - 2 * u);
        let k2 = 0; for (let j = 0; j < 3; j++) k2 += modes[j].a * Math.sin(modes[j].kx * s + modes[j].ph);
        mv += k2 * env;
      }
      nx[i] = x[i] + mv * ty / l;
      ny[i] = y[i] - mv * tx / l;
      // 河谷兩側是谷壁：中心線不超出 ±(VALLEY_H/2 − W)；也不越過河谷的上下游兩端
      if (ny[i] > lim2) ny[i] = lim2; else if (ny[i] < -lim2) ny[i] = -lim2;
      if (nx[i] < 0) nx[i] = 0; else if (nx[i] > VALLEY_L) nx[i] = VALLEY_L;
    }
    r.x = nx; r.y = ny; r.t += dt;
    resample(r);
    r.maxSin = Math.max(r.maxSin, sinuosity(r));
    let c, guard = 0;
    while ((c = findCut(r)) && guard++ < 10) doCut(r, c.i, c.j, false);
    if (r.t >= r.nextHist) {
      r.hist.push({ t: r.t, x: Float32Array.from(r.x), y: Float32Array.from(r.y) });
      if (r.hist.length > HIST_MAX) r.hist.shift();
      r.nextHist += HIST_DT;
    }
    return dt;
  }

  // 前進到至少 years 年之後（每一步的長短只由河道本身決定，所以不論畫面怎麼分段，同樣的操作得到同樣的河道）
  function advance(r, years) {
    const end = r.t + years;
    let g = 0;
    while (r.t < end - 1e-9 && g++ < 100000) step(r);
    return r;
  }

  // 人工截彎取直：在 (px, py) 附近找一個彎道的頸部，挖一條直的新河道
  // 條件：點擊處離河道 2W 內；找出涵蓋該處的一段河道，兩端直線距離 ≤ maxNeck（預設 12W），沿河道長度 ≥ 1.25 倍直線距離，而且至少省下 3W；
  // 符合的裡面挑頸部最窄（新河道最短）的那一段：工程上截彎取直都是從彎道的頸部挖過去
  function artificialCut(r, px, py, maxNeck) {
    const x = r.x, y = r.y, n = x.length, W = r.W, lim = (maxNeck || 12) * W;
    let k = -1, dk = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.hypot(x[i] - px, y[i] - py); if (d < dk) { dk = d; k = i; } }
    if (k < 0 || dk > 2 * W) return null;
    const s = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
    let best = null;
    for (let i = k; i >= 1 && s[k] - s[i] < 40 * W; i--) {
      for (let j = k; j < n - 1 && s[j] - s[k] < 40 * W; j++) {
        const d = Math.hypot(x[j] - x[i], y[j] - y[i]);
        if (d > lim || s[j] - s[i] < 1.25 * d || s[j] - s[i] - d < 3 * W) continue;
        const gain = (s[j] - s[i]) - d, loop = s[j] - s[i];
        if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) <= 1e-9 && loop < best.loop)) best = { i, j, d, gain, loop };
      }
    }
    if (!best) return null;
    const before = sinuosity(r);
    // 新河道：直線連接 i、j（中間插點）
    const ox = doCut(r, best.i, best.j, true);
    const after = sinuosity(r);
    // 從曲流河（曾經到過 2.5）拉直到接近直線（1.2 以下）
    if (r.maxSin >= 2.5 && after <= 1.2 && r.straightAt == null) r.straightAt = r.t;
    r.lastArt = { t: r.t, neck: best.d, saved: best.gain, before, after };
    return { ox, neck: best.d, saved: best.gain, before, after };
  }

  function length(r) {
    let L = 0;
    for (let i = 1; i < r.x.length; i++) L += Math.hypot(r.x[i] - r.x[i - 1], r.y[i] - r.y[i - 1]);
    return L;
  }
  // 彎曲度 = 河道長度 ÷ 河谷長度（兩端直線距離）
  function sinuosity(r) {
    const n = r.x.length;
    return length(r) / Math.hypot(r.x[n - 1] - r.x[0], r.y[n - 1] - r.y[0]);
  }

  // 平均曲流波長（沿河谷方向）：曲率正負交替的拐點，每兩個拐點是半個波長；只算曲率夠明顯的彎
  function wavelength(r) {
    const C = curvature(r.x, r.y), n = r.x.length, W = r.W, xs = [];
    // 平滑一下再找拐點，避免小抖動
    const sm = new Float64Array(n);
    for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let j = -3; j <= 3; j++) { const q = i + j; if (q >= 0 && q < n) { a += C[q]; c++; } } sm[i] = a / c; }
    let sign = 0, peak = 0;
    for (let i = 1; i < n - 1; i++) {
      const v = sm[i] * W;
      if (Math.abs(v) > Math.abs(peak) && Math.sign(v) === sign) peak = v;
      const sg = Math.abs(v) < 0.02 ? sign : Math.sign(v);
      if (sg !== sign) {
        if (sign !== 0 && Math.abs(peak) > 0.08) xs.push(r.x[i]);
        sign = sg; peak = v;
      }
    }
    if (xs.length < 3) return null;
    // 拐點的 x 由小到大排序後，相鄰差的中位數 × 2
    xs.sort((a, b) => a - b);
    const d = [];
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > W) d.push(xs[i] - xs[i - 1]);
    if (d.length < 2) return null;
    d.sort((a, b) => a - b);
    return 2 * d[Math.floor(d.length / 2)];
  }

  // 最靠近 (px, py) 的節點與距離
  function nearest(r, px, py) {
    let k = -1, dk = Infinity;
    for (let i = 0; i < r.x.length; i++) { const d = Math.hypot(r.x[i] - px, r.y[i] - py); if (d < dk) { dk = d; k = i; } }
    return { i: k, d: dk };
  }

  // 第 i 個節點的橫剖面：從左岸到右岸（面向下游），回傳水深陣列與凹岸在哪一邊
  function crossSection(r, i, m) {
    const mm = m || migration(r), p = params(r), C = mm.C[i] || 0, N = 41, h = [];
    for (let q = 0; q < N; q++) {
      const nR = (q / (N - 1) - 0.5) * p.W;          // 往右岸為正
      // 向左彎（C > 0）凹岸在右邊：右邊較深
      h.push(Math.max(0, p.D * (1 + A_BED * C * nR)));
    }
    const c = C * p.W;
    return { h, D: p.D, W: p.W, c, outer: c > 0 ? 'right' : c < 0 ? 'left' : null, R1: mm.R1[i], R0: mm.R0[i], hMax: Math.max.apply(null, h), hMin: Math.min.apply(null, h) };
  }

  // 剖面的摘要（頁面讀數與任務共用）：無因次曲率 c、遷移速率、凹岸與凸岸水深、是否露出沙洲、是否為整條河遷移最快的地方
  function sectionInfo(r, i, m) {
    if (i < 1 || i >= r.x.length - 1) return null;
    const mm = m || migration(r);
    let mx = 0; for (let q = 0; q < mm.R1.length; q++) mx = Math.max(mx, Math.abs(mm.R1[q]));
    const cs = crossSection(r, i, mm), hl = cs.h[0], hr = cs.h[cs.h.length - 1], outerRight = cs.c >= 0;
    return {
      c: cs.c, R1: mm.R1[i], R1max: mx, hOut: outerRight ? hr : hl, hIn: outerRight ? hl : hr,
      bar: cs.hMin <= 0, top: mx > 0.05 && Math.abs(mm.R1[i]) >= 0.97 * mx
    };
  }

  // 任務快照（頁面與證明腳本共用）
  function snapshot(r, extra) {
    const e = extra || {};
    const live = r.oxbows.filter(o => r.t - o.t0 < FILL_YR).length;
    return Object.assign({
      t: r.t, W: r.W, k: r.k, seed: r.seed, sin: sinuosity(r), L: length(r), lambda: wavelength(r),
      cuts: r.cuts, artCuts: r.artCuts, oxbows: r.oxbows.length, lakes: live,
      oldest: r.oxbows.length ? r.t - Math.min.apply(null, r.oxbows.map(o => o.t0)) : 0,
      lastCut: r.lastCut ? Object.assign({}, r.lastCut) : null,
      lastArt: r.lastArt ? Object.assign({}, r.lastArt) : null,
      maxSin: r.maxSin, minGap: isFinite(r.minGap) ? r.minGap : null, minGap3: isFinite(r.minGap3) ? r.minGap3 : null, minGap4: isFinite(r.minGap4) ? r.minGap4 : null,
      sinceNat: r.t - (r.lastNat != null ? r.lastNat : 0),
      straightAt: r.straightAt
    }, e);
  }

  return {
    OMEGA, GAMMA, CF, WD, A_BED, CUT, END_W, NOISE, VALLEY_L, VALLEY_H, HIST_DT, HIST_MAX, OX_MAX, FILL_YR, DT_MAX,
    rng, create, params, curvature, migration, resample, findCut, doCut, step, advance, artificialCut,
    length, sinuosity, wavelength, nearest, crossSection, sectionInfo, snapshot
  };
});
