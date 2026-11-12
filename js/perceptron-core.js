/* perceptron-core.js — 「感知器：一條線分兩類」的計算核心（與畫面分離，Node 單元測試：tests/perceptron-core.test.js）
 *
 * 感知器（Rosenblatt 1958）：輸入 x = (x1, x2)，加權和 z = w1·x1 + w2·x2 + b，輸出 ŷ = +1（z > 0）或 −1（z < 0）。
 * 學習規則（一次看一個點）：若 y·z ≤ 0（分錯，或剛好落在線上），則
 *     w ← w + η·y·x，  b ← b + η·y；  分對時不變。
 * 這和常見的寫法 w ← w + η(t − ŷ)x（標籤 t ∈ {0, 1}、ŷ = 1 若 z > 0 否則 0）是同一條規則：分錯時 t − ŷ = ±1，正好就是 y。
 * 一整輪（每個點都看過一次）都沒有分錯，就是「收斂」。
 *
 * 增廣向量：把偏差當成第三個權重，x̃ = (x1, x2, 1)、w̃ = (w1, w2, b)，z = w̃·x̃。不用偏差時 x̃ = (x1, x2, 0)、b 固定 0。
 * Novikoff（1962）收斂定理：若所有 ‖x̃‖ ≤ R，而且有單位向量 u 使每個點 y·(u·x̃) ≥ γ > 0，
 * 則從 w̃ = 0 出發，不論順序與學習率，更新次數 k ≤ (R/γ)²。這裡的 γ 取最大可能值：
 *     γ* = 原點到 {y·x̃} 的凸包的距離（> 0 ⇔ 線性可分；用凸包最近點求，見 maxMargin）。
 *
 * 精確計算：座標吸附在 0.05 的格點上，內部用整數 g = 20·x（增廣向量 (gx, gy, 20)）。
 * 權重寫成 w̃ = w̃0 + (η/20)·S，S 是整數累加器（每次更新加上 y·(gx, gy, 20)）。
 * 零初始時 z 的正負只看整數 S·(gx, gy, 20)，所以「剛好在線上」「b 剛好是 0」「權重回到同一個值」都能精確判斷，不受浮點誤差影響。
 */
(function (root) {
  'use strict';
  const GRID = 20;              // 1 個座標單位 = 20 格（每格 0.05）
  const MAX_POINTS = 60;
  const MAX_EPOCHS = 1000;
  const GATE = 12;              // 邏輯閘資料：輸入 0 放在 −0.6、輸入 1 放在 +0.6（= ±12 格）

  // ---------------------------------------------------------------- 亂數
  /** 有種子的亂數產生器（mulberry32），回傳 [0, 1) */
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
  function shuffled(n, rand) {
    const a = [];
    for (let i = 0; i < n; i++) a.push(i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // ---------------------------------------------------------------- 座標
  function toGrid(x) { return Math.max(-GRID, Math.min(GRID, Math.round(x * GRID))); }
  function pt(gx, gy, c, extra) { const p = { gx: gx, gy: gy, x: gx / GRID, y: gy / GRID, c: c > 0 ? 1 : -1 }; return extra ? Object.assign(p, extra) : p; }
  /** 整數增廣向量（= 20 × 實際的 (x1, x2, 1)） */
  function augInt(p, bias) { return [p.gx, p.gy, bias ? GRID : 0]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }

  // ---------------------------------------------------------------- 預設資料
  const GATES = {
    and: [0, 0, 0, 1], or: [0, 1, 1, 1], nand: [1, 1, 1, 0], xor: [0, 1, 1, 0]
  };
  /** 邏輯閘的四個點，固定順序是 (0,0)、(0,1)、(1,0)、(1,1) */
  function gate(name) {
    const out = GATES[name];
    const ins = [[0, 0], [0, 1], [1, 0], [1, 1]];
    return ins.map(function (a, k) {
      return pt(a[0] ? GATE : -GATE, a[1] ? GATE : -GATE, out[k] ? 1 : -1, { label: '(' + a[0] + ',' + a[1] + ')' });
    });
  }
  /** 隨機的線性可分資料：一條隨機的線，兩側各取點，離線太近（< margin）的不要 */
  function genSeparable(seed, opt) {
    opt = opt || {};
    const N = opt.n || 24, margin = opt.margin == null ? 0.12 : opt.margin;
    const r = rng((seed >>> 0) * 7919 + 13);
    for (let tries = 0; tries < 80; tries++) {
      const th = r() * 2 * Math.PI, nx = Math.cos(th), ny = Math.sin(th), c0 = (r() * 2 - 1) * 0.3;
      const pts = [], used = {};
      for (let guard = 0; pts.length < N && guard < 4000; guard++) {
        const gx = Math.round((r() * 2 - 1) * 18), gy = Math.round((r() * 2 - 1) * 18);
        const key = gx + ',' + gy;
        if (used[key]) continue;
        const d = nx * gx / GRID + ny * gy / GRID - c0;
        if (Math.abs(d) < margin) continue;
        used[key] = 1;
        pts.push(pt(gx, gy, d > 0 ? 1 : -1));
      }
      const np = pts.filter(function (p) { return p.c > 0; }).length;
      if (pts.length === N && np >= 6 && N - np >= 6) return pts;
    }
    return gate('and');
  }
  /** 有雜訊的資料：先做可分的資料，再把幾個點的類別翻過來（標記 noise），保證翻過以後不可分 */
  function genNoisy(seed, opt) {
    opt = opt || {};
    const flips = opt.flips || 3;
    for (let k = 0; k < 40; k++) {
      const pts = genSeparable((seed >>> 0) * 31 + 7 + k * 1009, { n: opt.n || 24, margin: 0.06 });
      const r = rng((seed >>> 0) * 131 + k + 5);
      const idx = shuffled(pts.length, r).slice(0, flips);
      idx.forEach(function (i) { pts[i].c = -pts[i].c; pts[i].noise = true; });
      if (!maxMargin(pts, true).separable) return pts;
    }
    return gate('xor');
  }

  // ---------------------------------------------------------------- 最大間隔（Novikoff 定理的 γ）
  /**
   * 原點到 conv{ y·x̃ } 的最近點：枚舉 1、2、3 個頂點的單純形，把原點投影到它的仿射包上；
   * 投影落在單純形內（重心座標都 ≥ 0）而且滿足最佳條件 p·z ≥ ‖p‖²（對所有點）的就是答案。
   * 找不到 → 原點在凸包內或邊界上 → 不能用一條直線嚴格分開（不可分）。
   * 回傳實際單位的 γ、R、上界 (R/γ)²，以及最佳方向 u（增廣空間的單位向量）。
   */
  function maxMargin(points, bias) {
    bias = bias !== false;
    const n = points.length;
    const Z = points.map(function (p) { const a = augInt(p, bias); return [p.c * a[0], p.c * a[1], p.c * a[2]]; });
    let R2 = 0;
    points.forEach(function (p) { R2 = Math.max(R2, dot(augInt(p, bias), augInt(p, bias))); });
    const R = Math.sqrt(R2) / GRID;
    if (!n) return { separable: false, gamma: 0, R: R, bound: Infinity, u: null };
    let best = null;
    const tol = 1e-9;
    function consider(p, idx, lam) {
      const pp = dot(p, p);
      if (pp < 1e-18) return;
      if (best && pp >= best.pp - 1e-12) return;
      for (let m = 0; m < n; m++) if (dot(p, Z[m]) < pp * (1 - tol) - 1e-12) return;
      best = { p: p, pp: pp, idx: idx, lam: lam };
    }
    // 頂點
    for (let i = 0; i < n; i++) consider(Z[i], [i], [1]);
    // 邊
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = Z[i], b = Z[j], d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const dd = dot(d, d);
      if (dd === 0) continue;
      const t = -dot(a, d) / dd;
      if (t <= 0 || t >= 1) continue;
      consider([a[0] + t * d[0], a[1] + t * d[1], a[2] + t * d[2]], [i, j], [1 - t, t]);
    }
    // 三角形
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const a = Z[i], e1 = [Z[j][0] - a[0], Z[j][1] - a[1], Z[j][2] - a[2]], e2 = [Z[k][0] - a[0], Z[k][1] - a[1], Z[k][2] - a[2]];
      const g11 = dot(e1, e1), g12 = dot(e1, e2), g22 = dot(e2, e2);
      const det = g11 * g22 - g12 * g12;
      if (det <= 1e-9 * g11 * g22) continue;
      const r1 = -dot(a, e1), r2 = -dot(a, e2);
      const s = (r1 * g22 - r2 * g12) / det, t = (r2 * g11 - r1 * g12) / det;
      if (s <= 0 || t <= 0 || s + t >= 1) continue;
      consider([a[0] + s * e1[0] + t * e2[0], a[1] + s * e1[1] + t * e2[1], a[2] + s * e1[2] + t * e2[2]], [i, j, k], [1 - s - t, s, t]);
    }
    if (!best) return { separable: false, gamma: 0, R: R, bound: Infinity, u: null };
    const g = Math.sqrt(best.pp);
    const gamma = g / GRID;
    // support／weights：最近點 = Σ weights·(y·x̃)（凸組合），是「γ 不可能更大」的證據
    return { separable: true, gamma: gamma, R: R, bound: (R / gamma) * (R / gamma), u: [best.p[0] / g, best.p[1] / g, best.p[2] / g], support: best.idx, weights: best.lam };
  }

  /** 一組實際權重 w̃ = (w1, w2, b) 在增廣空間的間隔：min y·(w̃·x̃)/‖w̃‖（負數表示有點分錯） */
  function marginOf(w, points, bias) {
    bias = bias !== false;
    const ww = bias ? norm(w) : Math.hypot(w[0], w[1]);
    if (!(ww > 0) || !points.length) return -Infinity;
    let m = Infinity;
    points.forEach(function (p) { m = Math.min(m, p.c * (w[0] * p.x + w[1] * p.y + (bias ? w[2] : 0)) / ww); });
    return m;
  }
  /** 分錯（含剛好在線上）的點數 */
  function mistakes(w, points, bias) {
    bias = bias !== false;
    let k = 0;
    points.forEach(function (p) { if (p.c * (w[0] * p.x + w[1] * p.y + (bias ? w[2] : 0)) <= 0) k++; });
    return k;
  }
  /** 決策線 w1·x1 + w2·x2 + b = 0 和方框 [−h, h]² 的交點（兩個端點），沒有線時回傳 null */
  function clipLine(w, h) {
    h = h || 1;
    const a = w[0], b = w[1], c = w[2];
    if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return null;
    const pts = [];
    const add = function (x, y) {
      if (x < -h - 1e-9 || x > h + 1e-9 || y < -h - 1e-9 || y > h + 1e-9) return;
      for (let i = 0; i < pts.length; i++) if (Math.abs(pts[i][0] - x) < 1e-9 && Math.abs(pts[i][1] - y) < 1e-9) return;
      pts.push([x, y]);
    };
    if (Math.abs(b) > 1e-12) { add(-h, (-c + a * h) / b); add(h, (-c - a * h) / b); }
    if (Math.abs(a) > 1e-12) { add((-c + b * h) / a, -h); add((-c - b * h) / a, h); }
    if (pts.length < 2) return null;
    let best = [pts[0], pts[1]], bd = -1;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d > bd) { bd = d; best = [pts[i], pts[j]]; }
    }
    return bd > 1e-9 ? best : null;
  }
  function dataKey(points, bias) {
    return points.map(function (p) { return p.gx + ',' + p.gy + ',' + p.c; }).sort().join(';') + (bias === false ? '|nb' : '|b');
  }

  // ---------------------------------------------------------------- 感知器的學習
  /**
   * cfg：{ eta, init（'zero'／'random'）, order（'fixed'／'shuffle'）, seed, bias, maxEpochs }
   * 固定順序 = 資料點的順序（放點的先後）；每輪打亂 = 每一輪用種子重新洗牌。
   */
  function Trainer(points, cfg) {
    cfg = cfg || {};
    this.pts = points.slice();
    this.n = this.pts.length;
    this.bias = cfg.bias !== false;
    this.eta = cfg.eta > 0 ? cfg.eta : 1;
    this.orderMode = cfg.order === 'shuffle' ? 'shuffle' : 'fixed';
    this.maxEpochs = cfg.maxEpochs || MAX_EPOCHS;
    const seed = Math.max(1, Math.round(cfg.seed || 1));
    this.seed = seed;
    const rw = rng(seed * 2 + 2);
    this.w0 = cfg.init === 'random' ? [rw() * 2 - 1, rw() * 2 - 1, this.bias ? rw() * 2 - 1 : 0] : [0, 0, 0];
    this.zeroInit = this.w0[0] === 0 && this.w0[1] === 0 && this.w0[2] === 0;
    this.rOrder = rng(seed * 2 + 1);
    this.S = [0, 0, 0];
    this.epoch = 1; this.pos = 0; this.errThis = 0;
    this.errs = []; this.updates = 0; this.checks = 0;
    this.posUpd = 0; this.negUpd = 0;
    this.converged = false; this.limit = false;
    this.cycle = null; this.allWrong = false; this.maxErr = 0;
    this.seen = {};
    this.seen[this.S.join(',')] = 0;
    this.order = this.makeOrder();
  }
  Trainer.prototype.makeOrder = function () {
    if (this.orderMode === 'shuffle') return shuffled(this.n, this.rOrder);
    const a = [];
    for (let i = 0; i < this.n; i++) a.push(i);
    return a;
  };
  /** 目前的實際權重 [w1, w2, b] */
  Trainer.prototype.weights = function () {
    const k = this.eta / GRID;
    return [this.w0[0] + k * this.S[0], this.w0[1] + k * this.S[1], this.bias ? this.w0[2] + k * this.S[2] : 0];
  };
  /** 點 p 的加權和 z（實際單位）與整數部分 s = S·(gx, gy, 20) */
  Trainer.prototype.zOf = function (p) {
    const a = augInt(p, this.bias);
    const s = dot(this.S, a);
    const z0 = (this.w0[0] * a[0] + this.w0[1] * a[1] + this.w0[2] * a[2]) / GRID;
    return { z: z0 + this.eta * s / (GRID * GRID), s: s };
  };
  Trainer.prototype.isWrong = function (p) {
    const q = this.zOf(p);
    return this.zeroInit ? p.c * q.s <= 0 : p.c * q.z <= 0;
  };
  Trainer.prototype.done = function () { return this.converged || this.limit || this.n === 0; };
  /** 看下一個點；回傳這一步的紀錄，已經結束時回傳 null */
  Trainer.prototype.step = function () {
    if (this.done()) return null;
    const i = this.order[this.pos], p = this.pts[i];
    const q = this.zOf(p);
    const wrong = this.zeroInit ? p.c * q.s <= 0 : p.c * q.z <= 0;
    const before = this.weights();
    const epoch = this.epoch;
    if (wrong) {
      const a = augInt(p, this.bias);
      this.S[0] += p.c * a[0]; this.S[1] += p.c * a[1]; this.S[2] += p.c * a[2];
      this.updates++; this.errThis++;
      if (p.c > 0) this.posUpd++; else this.negUpd++;
    }
    this.checks++;
    this.pos++;
    const res = { i: i, p: p, z: q.z, s: q.s, wrong: wrong, before: before, after: this.weights(), epoch: epoch, posInEpoch: this.pos, epochEnd: false, converged: false, limit: false };
    if (this.pos >= this.n) {
      res.epochEnd = true;
      res.errors = this.errThis;
      this.errs.push(this.errThis);
      this.maxErr = Math.max(this.maxErr, this.errThis);
      if (this.errThis === this.n) { this.allWrong = true; res.allWrong = true; }
      if (this.errThis === 0) this.converged = true;
      else {
        if (this.orderMode === 'fixed' && !this.cycle) {
          const key = this.S.join(',');
          if (this.seen[key] != null) this.cycle = { from: this.seen[key], to: epoch, period: epoch - this.seen[key] };
          else this.seen[key] = epoch;
        }
        if (epoch >= this.maxEpochs) this.limit = true;
      }
      res.converged = this.converged;
      res.limit = this.limit;
      if (!this.converged && !this.limit) { this.epoch++; this.pos = 0; this.errThis = 0; this.order = this.makeOrder(); }
    }
    return res;
  };
  /** 跑到這一輪結束（或已經停止） */
  Trainer.prototype.runEpoch = function () {
    let r = null, last = null;
    while ((r = this.step())) { last = r; if (r.epochEnd) break; }
    return last;
  };
  /** 跑到收斂或達到輪數上限 */
  Trainer.prototype.run = function () {
    let guard = 0;
    while (!this.done() && guard++ < this.maxEpochs * Math.max(1, this.n) + 10) this.step();
    return this.summary();
  };
  Trainer.prototype.summary = function () {
    return {
      converged: this.converged, limit: this.limit, epochs: this.errs.length, updates: this.updates, checks: this.checks,
      w: this.weights(), S: this.S.slice(), zeroInit: this.zeroInit, posUpd: this.posUpd, negUpd: this.negUpd,
      errs: this.errs.slice(), allWrong: this.allWrong, maxErr: this.maxErr, cycle: this.cycle
    };
  };
  /** 方便測試：一次學完 */
  function train(points, cfg) { return new Trainer(points, cfg).run(); }

  // ---------------------------------------------------------------- 頁面與任務證明共用的工作階段
  const PRESETS = ['and', 'or', 'nand', 'xor', 'sep', 'noisy'];
  function zeroEdits() { return { added: 0, removed: 0, moved: 0, removedNoise: 0, removedClean: 0 }; }
  /**
   * 一個學習工作階段：資料點、設定、目前的感知器，以及送給任務的事件。
   * opt.emit(type, data)：事件（'data' 資料改變、'step' 按「單步」、'epoch' 每一輪結束、'train' 收斂或達到輪數上限）。
   * 頁面與 tools/mission-proofs/perceptron.js 都用這個類別，所以兩邊的事件資料完全相同。
   */
  function Session(opt) {
    opt = opt || {};
    this.emit = opt.emit || function () {};
    this.cfg = { eta: 1, init: 'zero', order: 'fixed', seed: 1, bias: true, maxEpochs: MAX_EPOCHS };
    this.points = [];
    this.nextId = 1;
    this.set = 'empty'; this.base = 'empty';
    this.edits = zeroEdits(); this.noiseTotal = 0;
    this.serial = { sep: 0, noisy: 0 };
    this.trainer = null; this.mm = null;
    this.history = [];
    this.resetTraining();
  }
  Session.prototype._mark = function (pts, user) {
    const self = this;
    return pts.map(function (p) { return Object.assign({}, p, { id: self.nextId++, user: !!user, moved: false, noise: !!p.noise }); });
  };
  Session.prototype.loadPreset = function (name, silent) {
    let pts;
    if (GATES[name]) pts = gate(name);
    else if (name === 'sep') pts = genSeparable(++this.serial.sep);
    else if (name === 'noisy') pts = genNoisy(++this.serial.noisy);
    else return false;
    this.points = this._mark(pts, false);
    this.set = name; this.base = name;
    this.edits = zeroEdits();
    this.noiseTotal = this.points.filter(function (p) { return p.noise; }).length;
    this._changed('preset', silent);
    return true;
  };
  Session.prototype.indexAt = function (gx, gy) {
    for (let i = 0; i < this.points.length; i++) if (this.points[i].gx === gx && this.points[i].gy === gy) return i;
    return -1;
  };
  Session.prototype.addPoint = function (gx, gy, c) {
    gx = Math.max(-GRID, Math.min(GRID, Math.round(gx))); gy = Math.max(-GRID, Math.min(GRID, Math.round(gy)));
    if (this.points.length >= MAX_POINTS || this.indexAt(gx, gy) >= 0) return false;
    this.points.push(this._mark([pt(gx, gy, c)], true)[0]);
    this.edits.added++;
    this.set = 'custom';
    this._changed('add');
    return true;
  };
  Session.prototype.removeAt = function (i) {
    if (i < 0 || i >= this.points.length) return false;
    const p = this.points.splice(i, 1)[0];
    this.edits.removed++;
    if (p.noise) this.edits.removedNoise++; else this.edits.removedClean++;
    this.set = 'custom';
    this._changed('remove');
    return true;
  };
  Session.prototype.movePoint = function (i, gx, gy) {
    gx = Math.max(-GRID, Math.min(GRID, Math.round(gx))); gy = Math.max(-GRID, Math.min(GRID, Math.round(gy)));
    const p = this.points[i];
    if (!p || (p.gx === gx && p.gy === gy)) return false;
    const j = this.indexAt(gx, gy);
    if (j >= 0 && j !== i) return false;
    p.gx = gx; p.gy = gy; p.x = gx / GRID; p.y = gy / GRID;
    if (!p.moved) { p.moved = true; this.edits.moved++; }
    this.set = 'custom';
    this._changed('move');
    return true;
  };
  Session.prototype.clear = function () {
    this.points = [];
    this.set = 'custom'; this.base = 'empty';
    this.edits = zeroEdits(); this.noiseTotal = 0;
    this._changed('clear');
  };
  Session.prototype.setCfg = function (k, v) {
    if (this.cfg[k] === v) return false;
    this.cfg[k] = v;
    if (k === 'bias') this.mm = maxMargin(this.points, this.cfg.bias);
    this.resetTraining();
    return true;
  };
  Session.prototype._changed = function (src, silent) {
    this.mm = maxMargin(this.points, this.cfg.bias);
    this.resetTraining();
    if (!silent) {
      const c = this.counts();
      this.emit('data', { src: src, set: this.set, base: this.base, n: this.points.length, nPos: c.pos, nNeg: c.neg, separable: this.mm.separable, gamma: this.mm.gamma, bound: this.mm.bound });
    }
  };
  Session.prototype.resetTraining = function () {
    if (!this.mm) this.mm = maxMargin(this.points, this.cfg.bias);
    this.trainer = new Trainer(this.points, this.cfg);
  };
  Session.prototype.counts = function () {
    let pos = 0;
    this.points.forEach(function (p) { if (p.c > 0) pos++; });
    return { pos: pos, neg: this.points.length - pos };
  };
  Session.prototype.common = function () {
    const c = this.counts(), cfg = this.cfg;
    return {
      set: this.set, base: this.base, edited: this.set === 'custom', n: this.points.length, nPos: c.pos, nNeg: c.neg,
      eta: cfg.eta, init: cfg.init, order: cfg.order, seed: cfg.seed, bias: cfg.bias
    };
  };
  /** 看下一個點。user：使用者按了「單步」（只有這時候送 'step' 事件） */
  Session.prototype.step = function (user) {
    const r = this.trainer.step();
    if (!r) return null;
    if (user) this.emit('step', Object.assign(this.common(), { wrong: r.wrong, c: r.p.c, epoch: r.epoch, updates: this.trainer.updates }));
    if (r.epochEnd) this._epochEnd(r);
    return r;
  };
  Session.prototype._epochEnd = function (r) {
    const t = this.trainer;
    this.emit('epoch', Object.assign(this.common(), {
      epoch: r.epoch, errors: r.errors, converged: r.converged, limit: r.limit, updates: t.updates,
      cycle: t.cycle ? { from: t.cycle.from, to: t.cycle.to, period: t.cycle.period } : null
    }));
    if (r.converged || r.limit) this._finish();
  };
  Session.prototype._finish = function () {
    const t = this.trainer, mm = this.mm, w = t.weights();
    const margin = t.converged ? marginOf(w, this.points, this.cfg.bias) : null;
    const userAll = this.points.length > 0 && this.points.every(function (p) { return p.user; });
    const data = Object.assign(this.common(), {
      converged: t.converged, limit: t.limit, epochs: t.errs.length, updates: t.updates,
      w1: w[0], w2: w[1], b: w[2], S: t.S.slice(), zeroInit: t.zeroInit,
      separable: mm.separable, gamma: mm.gamma, R: mm.R, bound: mm.bound,
      margin: margin, ratio: margin != null && mm.separable ? margin / mm.gamma : null,
      allWrong: t.allWrong, maxErr: t.maxErr, cycle: t.cycle ? { from: t.cycle.from, to: t.cycle.to, period: t.cycle.period } : null,
      userAll: userAll, added: this.edits.added, removed: this.edits.removed, moved: this.edits.moved,
      removedNoise: this.edits.removedNoise, removedClean: this.edits.removedClean,
      noiseTotal: this.noiseTotal, noiseLeft: this.points.filter(function (p) { return p.noise; }).length,
      key: dataKey(this.points, this.cfg.bias),
      pts: this.points.map(function (p) { return [p.gx, p.gy, p.c]; })
    });
    this.history.push({
      set: this.set, base: this.base, n: data.n, eta: data.eta, init: data.init, order: data.order, seed: data.seed, bias: data.bias,
      converged: data.converged, epochs: data.epochs, updates: data.updates, bound: mm.bound, separable: mm.separable
    });
    if (this.history.length > 40) this.history.shift();
    this.emit('train', data);
  };
  /** 跑完這一輪 */
  Session.prototype.runEpoch = function () {
    let r = null, last = null;
    while ((r = this.step(false))) { last = r; if (r.epochEnd) break; }
    return last;
  };
  /** 一直學到收斂或達到輪數上限 */
  Session.prototype.learn = function () {
    let last = null, r = null, guard = 0;
    const lim = this.cfg.maxEpochs * Math.max(1, this.points.length) + 10;
    while ((r = this.step(false)) && guard++ < lim) last = r;
    return last;
  };

  const api = {
    GRID: GRID, MAX_POINTS: MAX_POINTS, MAX_EPOCHS: MAX_EPOCHS, GATE: GATE, PRESETS: PRESETS, GATES: GATES,
    rng: rng, shuffled: shuffled, toGrid: toGrid, pt: pt, augInt: augInt,
    gate: gate, genSeparable: genSeparable, genNoisy: genNoisy,
    maxMargin: maxMargin, marginOf: marginOf, mistakes: mistakes, clipLine: clipLine, dataKey: dataKey,
    Trainer: Trainer, train: train, Session: Session
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PerceptronCore = api;
})(typeof window !== 'undefined' ? window : this);
