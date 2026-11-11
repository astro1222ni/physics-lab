/*
 * equipotential-core.js — 「等位線與電場」課本實驗的物理核心（與畫面無關，可在 Node 單獨測試）
 *
 * 實驗：直流電源接在均勻導電紙（碳質導電紙）上的兩個電極之間，紙上有穩定電流（不是真空中的靜電場）。
 * 紙很薄、導電度 σ 均勻時，穩定電流滿足 ∇·J = 0、J = σE = −σ∇V，所以紙上的電位滿足拉普拉斯方程式
 *     ∇·(σ∇V) = 0      （σ 均勻時就是 ∇^2 V = 0）
 * 邊界條件：
 *   電極（金屬，電阻可忽略）上電位固定（Dirichlet）：正極 V = V0、負極 V = 0；
 *   紙的四邊不導電，電流不會流出去：∂V/∂n = 0（Neumann）。
 *
 * 數值方法：
 *   在間距 h 的方格點上用有限體積（五點）離散；邊上的點只有半個（角落四分之一個）控制體積，
 *   所以四邊自動滿足「沒有電流流出」。圓形電極的邊界不在格點上：與 Gibou 等人（2002）
 *   的對稱做法相同，用「格點到圓周的實際距離 θh」修正那一段的電導（二階精度）。
 *   用共軛梯度法求解，以多重網格的 V 循環（紅黑 Gauss–Seidel 平滑，粗網格間距 2h、4h、… 以同樣方法重新離散）
 *   當前置條件（MGCG），一組設定只要幾十毫秒。
 *   同一組設定只解一次，頁面會把結果快取起來。
 *
 * 單位：位置 cm（原點在紙的左下角，x 向右、y 向上）、電位 V、電場 V/cm、電流 A。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EquipotentialCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SHEET_W = 30;        // 導電紙寬（cm）
  const SHEET_H = 20;        // 導電紙高（cm）
  const BAR_W = 0.5;         // 長條電極的寬度（cm）
  const R_SHEET = 5000;      // 導電紙的面電阻（Ω/□），一般碳質導電紙約數 kΩ/□
  const GALV_R = 50000;      // 檢流計迴路的總電阻（內電阻＋探針接觸電阻，Ω）
  const GALV_FS = 50e-6;     // 檢流計滿刻度 ±50 μA
  const DMM_STEP = 0.01;     // 三用電表直流電壓檔的解析度（V）

  // ---------------------------------------------------------------------
  // 亂數（可重現）
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
  function gauss(r) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ---------------------------------------------------------------------
  // 電極配置
  // ---------------------------------------------------------------------
  /**
   * cfg：{ type: 'circles' | 'bars' | 'barCircle', d, a, L, V0, W?, H?, sigma?: { seed, amp } }
   *   circles   ：兩個半徑 a 的圓形電極，圓心相距 d（左正右負）
   *   bars      ：兩條平行長條電極（寬 0.5 cm、長 L），內緣相距 d（左正右負）；L = 紙高時從紙的上緣接到下緣
   *   barCircle ：左邊長條（正極、長 L），右邊圓形（負極、半徑 a），長條內緣到圓心相距 d
   */
  function electrodes(cfg) {
    const W = cfg.W || SHEET_W, H = cfg.H || SHEET_H;
    const xc = W / 2, yc = H / 2, V0 = cfg.V0;
    const L = Math.min(cfg.L == null ? H : cfg.L, H);
    const bar = function (xInner, side, V, sign) {
      // side = −1：長條在內緣的左邊；+1：在右邊
      const x0 = side < 0 ? xInner - BAR_W : xInner, x1 = side < 0 ? xInner : xInner + BAR_W;
      return { kind: 'rect', x0: x0, x1: x1, y0: yc - L / 2, y1: yc + L / 2, V: V, sign: sign };
    };
    const circ = function (x, V, sign) { return { kind: 'circle', x: x, y: yc, r: cfg.a, V: V, sign: sign }; };
    if (cfg.type === 'bars') return [bar(xc - cfg.d / 2, -1, V0, 1), bar(xc + cfg.d / 2, 1, 0, -1)];
    if (cfg.type === 'barCircle') return [bar(xc - cfg.d / 2, -1, V0, 1), circ(xc + cfg.d / 2, 0, -1)];
    return [circ(xc - cfg.d / 2, V0, 1), circ(xc + cfg.d / 2, 0, -1)];
  }

  const EPS = 1e-9;
  function inside(e, x, y) {
    if (e.kind === 'circle') { const dx = x - e.x, dy = y - e.y; return dx * dx + dy * dy <= e.r * e.r + EPS; }
    return x >= e.x0 - EPS && x <= e.x1 + EPS && y >= e.y0 - EPS && y <= e.y1 + EPS;
  }
  /** (x, y) 所在的電極（沒有則 −1） */
  function electrodeAt(els, x, y) {
    for (let i = 0; i < els.length; i++) if (inside(els[i], x, y)) return i;
    return -1;
  }
  /** 點到電極表面的距離（在電極內為 0） */
  function distToElectrode(e, x, y) {
    if (e.kind === 'circle') return Math.max(0, Math.hypot(x - e.x, y - e.y) - e.r);
    const dx = Math.max(e.x0 - x, 0, x - e.x1), dy = Math.max(e.y0 - y, 0, y - e.y1);
    return Math.hypot(dx, dy);
  }
  /** 由電極外的 P 往電極內的 Q 走，碰到電極邊界的比例 t（0–1] */
  function crossFraction(e, px, py, qx, qy) {
    if (e.kind === 'circle') {
      const dx = qx - px, dy = qy - py, fx = px - e.x, fy = py - e.y;
      const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - e.r * e.r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return 1;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      return Math.min(1, Math.max(t, 1e-3));
    }
    let t = 1;
    if (qx > px && px < e.x0) t = (e.x0 - px) / (qx - px);
    else if (qx < px && px > e.x1) t = (px - e.x1) / (px - qx);
    else if (qy > py && py < e.y0) t = (e.y0 - py) / (qy - py);
    else if (qy < py && py > e.y1) t = (py - e.y1) / (py - qy);
    return Math.min(1, Math.max(t, 1e-3));
  }

  // ---------------------------------------------------------------------
  // 導電紙的導電度（理想：均勻；含誤差：平滑的隨機起伏 ±amp）
  // ---------------------------------------------------------------------
  function sigmaField(cfg) {
    const s = cfg.sigma;
    if (!s || !(s.amp > 0)) return null;
    const r = rng(s.seed || 1);
    const W = cfg.W || SHEET_W, H = cfg.H || SHEET_H;
    const modes = [];
    let norm = 0;
    for (let m = 0; m < 7; m++) {
      const lam = 6 + 16 * r();                 // 波長 6–22 cm
      const ang = 2 * Math.PI * r();
      const k = 2 * Math.PI / lam;
      const c = 0.4 + r();
      modes.push({ kx: k * Math.cos(ang), ky: k * Math.sin(ang), ph: 2 * Math.PI * r(), c: c });
      norm += c;
    }
    const amp = s.amp / (0.55 * norm);         // 大部分地方在 ±amp 以內
    return function (x, y) {
      let g = 0;
      for (let i = 0; i < modes.length; i++) { const m = modes[i]; g += m.c * Math.cos(m.kx * (x - W / 2) + m.ky * (y - H / 2) + m.ph); }
      return Math.max(0.5, 1 + amp * g);
    };
  }

  // ---------------------------------------------------------------------
  // 建立離散方程式
  // ---------------------------------------------------------------------
  function build(cfg, h) {
    const W = cfg.W || SHEET_W, H = cfg.H || SHEET_H;
    const nx = Math.round(W / h) + 1, ny = Math.round(H / h) + 1, N = nx * ny;
    const els = electrodes(cfg);
    const sig = sigmaField(cfg);
    const fixed = new Int8Array(N).fill(-1);
    const V = new Float64Array(N);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i, e = electrodeAt(els, i * h, j * h);
        if (e >= 0) { fixed[k] = e; V[k] = els[e].V; }
      }
    }
    // 粗網格上，小電極可能一個格點都沒包到（方程式會變成沒有固定電位、無解）：
    // 這時把離電極中心最近的格點當成電極。只影響多重網格的粗網格，最細的網格永遠照實際形狀。
    els.forEach(function (e, n) {
      for (let k = 0; k < N; k++) if (fixed[k] === n) return;
      const cx = e.kind === 'circle' ? e.x : (e.x0 + e.x1) / 2, cy = e.kind === 'circle' ? e.y : (e.y0 + e.y1) / 2;
      const i = Math.min(nx - 1, Math.max(0, Math.round(cx / h))), j = Math.min(ny - 1, Math.max(0, Math.round(cy / h)));
      const k = j * nx + i;
      if (fixed[k] < 0) { fixed[k] = n; V[k] = e.V; }
    });
    let nFree = 0;
    for (let k = 0; k < N; k++) if (fixed[k] < 0) nFree++;
    // 每個自由點：4 個鄰點的編號與電導、右邊的常數項、對角線
    const idx = new Int32Array(nFree * 4), cof = new Float64Array(nFree * 4);
    const rhs = new Float64Array(nFree), diag = new Float64Array(nFree), node = new Int32Array(nFree);
    const red = [], black = [];
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let f = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (fixed[k] >= 0) continue;
        const x = i * h, y = j * h;
        let dsum = 0, b = 0;
        for (let q = 0; q < 4; q++) {
          const di = DIRS[q][0], dj = DIRS[q][1];
          const ii = i + di, jj = j + dj;
          idx[f * 4 + q] = k; cof[f * 4 + q] = 0;
          if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) continue; // 紙邊：不導電，沒有電流流出
          // 控制體積的面長：沿紙邊的那一半
          const w = di !== 0 ? (j === 0 || j === ny - 1 ? 0.5 : 1) : (i === 0 || i === nx - 1 ? 0.5 : 1);
          const kk = jj * nx + ii;
          if (fixed[kk] < 0) {
            const sm = sig ? sig(x + di * h / 2, y + dj * h / 2) : 1;
            idx[f * 4 + q] = kk; cof[f * 4 + q] = w * sm;
            dsum += w * sm;
          } else {
            const e = els[fixed[kk]];
            const t = crossFraction(e, x, y, ii * h, jj * h);
            const sm = sig ? sig(x + di * h * t / 2, y + dj * h * t / 2) : 1;
            const g = w * sm / t;
            dsum += g; b += g * e.V;
          }
        }
        node[f] = k; diag[f] = dsum; rhs[f] = b;
        ((i + j) % 2 === 0 ? red : black).push(f);
        f++;
      }
    }
    return { cfg: cfg, W: W, H: H, h: h, nx: nx, ny: ny, els: els, sig: sig, fixed: fixed, V: V,
      nFree: nFree, idx: idx, cof: cof, rhs: rhs, diag: diag, node: node,
      red: Int32Array.from(red), black: Int32Array.from(black) };
  }

  // ---------------------------------------------------------------------
  // 多重網格（V 循環）：細網格上的高頻誤差用紅黑 Gauss–Seidel 幾次就消掉，
  // 低頻誤差搬到粗網格（間距 2h、4h、…，同樣的離散方法重新建立）處理。
  // 有限體積的方程式是對稱的，限制算子取內插算子的轉置（控制體積內加總）。
  // ---------------------------------------------------------------------
  function gsSweep(sys, u, b, list) {
    const idx = sys.idx, cof = sys.cof, diag = sys.diag, node = sys.node;
    for (let n = 0; n < list.length; n++) {
      const f = list[n], q = f * 4;
      u[node[f]] = (b[f] + cof[q] * u[idx[q]] + cof[q + 1] * u[idx[q + 1]] + cof[q + 2] * u[idx[q + 2]] + cof[q + 3] * u[idx[q + 3]]) / diag[f];
    }
  }
  /** 殘差（寫在格點陣列 r 上，電極內為 0）；傳回 max |r / diag|（約等於再迭代一次的改變量） */
  function residual(sys, u, b, r) {
    const idx = sys.idx, cof = sys.cof, diag = sys.diag, node = sys.node;
    let mx = 0;
    for (let f = 0; f < sys.nFree; f++) {
      const q = f * 4, k = node[f];
      const v = b[f] + cof[q] * u[idx[q]] + cof[q + 1] * u[idx[q + 1]] + cof[q + 2] * u[idx[q + 2]] + cof[q + 3] * u[idx[q + 3]] - diag[f] * u[k];
      r[k] = v;
      const a = Math.abs(v / diag[f]);
      if (a > mx) mx = a;
    }
    return mx;
  }
  /** 細網格殘差 → 粗網格右邊項（控制體積內加總：權重 1、1/2、1/4） */
  function restrictTo(fine, r, coarse, bc) {
    const fnx = fine.nx, fny = fine.ny, W1 = [0.5, 1, 0.5];
    for (let f = 0; f < coarse.nFree; f++) {
      const k = coarse.node[f], I = k % coarse.nx, J = (k - I) / coarse.nx;
      let s = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const j = 2 * J + dj;
        if (j < 0 || j >= fny) continue;
        for (let di = -1; di <= 1; di++) {
          const i = 2 * I + di;
          if (i < 0 || i >= fnx) continue;
          s += W1[di + 1] * W1[dj + 1] * r[j * fnx + i];
        }
      }
      bc[f] = s;
    }
  }
  /** 粗網格的修正量雙線性內插後加到細網格（電極內不動） */
  function prolongAdd(coarse, e, fine, u) {
    const cn = coarse.nx;
    for (let f = 0; f < fine.nFree; f++) {
      const k = fine.node[f], i = k % fine.nx, j = (k - i) / fine.nx;
      const I = i >> 1, J = j >> 1, oi = i & 1, oj = j & 1;
      const c = J * cn + I;
      let v;
      if (!oi && !oj) v = e[c];
      else if (oi && !oj) v = 0.5 * (e[c] + e[c + 1]);
      else if (!oi && oj) v = 0.5 * (e[c] + e[c + cn]);
      else v = 0.25 * (e[c] + e[c + 1] + e[c + cn] + e[c + cn + 1]);
      u[k] += v;
    }
  }
  function vcycle(levels, l, u, b) {
    const sys = levels[l];
    if (l === levels.length - 1) {
      for (let s = 0; s < 60; s++) { gsSweep(sys, u, b, sys.red); gsSweep(sys, u, b, sys.black); gsSweep(sys, u, b, sys.black); gsSweep(sys, u, b, sys.red); }
      return;
    }
    for (let s = 0; s < 2; s++) { gsSweep(sys, u, b, sys.red); gsSweep(sys, u, b, sys.black); }
    const r = sys.work || (sys.work = new Float64Array(sys.nx * sys.ny));
    residual(sys, u, b, r);
    const c = levels[l + 1];
    const bc = c.bwork || (c.bwork = new Float64Array(c.nFree));
    const ec = c.ework || (c.ework = new Float64Array(c.nx * c.ny));
    ec.fill(0);
    restrictTo(sys, r, c, bc);
    vcycle(levels, l + 1, ec, bc);
    prolongAdd(c, ec, sys, u);
    for (let s = 0; s < 2; s++) { gsSweep(sys, u, b, sys.black); gsSweep(sys, u, b, sys.red); }
  }

  /** 各格點的電場 E = −∇V（V/cm）；電極內為 0；圓形電極旁用不等間距的三點公式 */
  function gradients(sys) {
    const nx = sys.nx, ny = sys.ny, h = sys.h, V = sys.V, fixed = sys.fixed, els = sys.els;
    const Ex = new Float64Array(nx * ny), Ey = new Float64Array(nx * ny);
    function side(i, j, di, dj) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) return null;
      const kk = jj * nx + ii;
      if (fixed[kk] < 0) return [V[kk], h];
      const e = els[fixed[kk]];
      return [e.V, h * crossFraction(e, i * h, j * h, ii * h, jj * h)];
    }
    function deriv(vp, L, R) {
      if (!L && !R) return 0;
      if (!L || !R) return 0; // 紙邊：法向導數為 0
      const h1 = L[1], h2 = R[1];
      return (-h2 * h2 * L[0] + (h2 * h2 - h1 * h1) * vp + h1 * h1 * R[0]) / (h1 * h2 * (h1 + h2));
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (fixed[k] >= 0) continue;
        Ex[k] = -deriv(V[k], side(i, j, -1, 0), side(i, j, 1, 0));
        Ey[k] = -deriv(V[k], side(i, j, 0, -1), side(i, j, 0, 1));
      }
    }
    return { Ex: Ex, Ey: Ey };
  }

  /**
   * 共軛梯度法，以一次 V 循環當前置條件（多重網格前置條件共軛梯度，MGCG）。
   * 有限體積的矩陣對稱正定、V 循環的前後平滑對稱，所以收斂穩定；粗網格只是近似也不影響正確性。
   */
  function pcg(levels, u, tol, maxIt) {
    const sys = levels[0], F = sys.nFree, N = sys.nx * sys.ny;
    const idx = sys.idx, cof = sys.cof, diag = sys.diag, node = sys.node, b = sys.rhs;
    const r = new Float64Array(F), Ap = new Float64Array(F), z = new Float64Array(N), p = new Float64Array(N);
    function maxRes() { let m = 0; for (let f = 0; f < F; f++) { const a = Math.abs(r[f] / diag[f]); if (a > m) m = a; } return m; }
    for (let f = 0; f < F; f++) {
      const q = f * 4;
      r[f] = b[f] + cof[q] * u[idx[q]] + cof[q + 1] * u[idx[q + 1]] + cof[q + 2] * u[idx[q + 2]] + cof[q + 3] * u[idx[q + 3]] - diag[f] * u[node[f]];
    }
    let res = maxRes(), it = 0;
    if (res < tol) return { it: 0, res: res };
    z.fill(0); vcycle(levels, 0, z, r);
    let rz = 0;
    for (let f = 0; f < F; f++) rz += r[f] * z[node[f]];
    p.set(z);
    for (it = 1; it <= maxIt; it++) {
      let pAp = 0;
      for (let f = 0; f < F; f++) {
        const q = f * 4, k = node[f];
        const v = diag[f] * p[k] - cof[q] * p[idx[q]] - cof[q + 1] * p[idx[q + 1]] - cof[q + 2] * p[idx[q + 2]] - cof[q + 3] * p[idx[q + 3]];
        Ap[f] = v; pAp += p[k] * v;
      }
      if (!(pAp > 0)) break;
      const alpha = rz / pAp;
      for (let f = 0; f < F; f++) { const k = node[f]; u[k] += alpha * p[k]; r[f] -= alpha * Ap[f]; }
      res = maxRes();
      if (res < tol) break;
      z.fill(0); vcycle(levels, 0, z, r);
      let rz2 = 0;
      for (let f = 0; f < F; f++) rz2 += r[f] * z[node[f]];
      const beta = rz2 / rz;
      rz = rz2;
      for (let f = 0; f < F; f++) { const k = node[f]; p[k] = z[k] + beta * p[k]; }
    }
    return { it: it, res: res };
  }

  /**
   * 解導電紙上的電位。opts.h：最細網格間距（預設 0.125 cm）；opts.tol：收斂標準（相對於 V0）。
   * 傳回 sol：{ W, H, h, nx, ny, V, Ex, Ey, fixed, els, cfg, sig, cycles, res, ms }
   */
  function solve(cfg, opts) {
    opts = opts || {};
    const h = opts.h || 0.125;
    const t0 = Date.now();
    const W = cfg.W || SHEET_W, H = cfg.H || SHEET_H;
    const levels = [];
    for (let hl = h; levels.length < 8; hl *= 2) {
      if (Math.abs(W / hl - Math.round(W / hl)) > 1e-9 || Math.abs(H / hl - Math.round(H / hl)) > 1e-9) break;
      if (Math.round(W / hl) < 4 || Math.round(H / hl) < 4) break;
      levels.push(build(cfg, hl));
    }
    const sys = levels[0];
    const u = sys.V;
    for (let f = 0; f < sys.nFree; f++) u[sys.node[f]] = cfg.V0 / 2;
    const tol = (opts.tol || 1e-9) * Math.max(Math.abs(cfg.V0), 1e-9);
    const out = pcg(levels, u, tol, opts.maxIt || 200);
    const res = out.res, cycles = out.it;
    const g = gradients(sys);
    return { W: sys.W, H: sys.H, h: sys.h, nx: sys.nx, ny: sys.ny, V: sys.V, Ex: g.Ex, Ey: g.Ey, fixed: sys.fixed,
      els: sys.els, cfg: cfg, sig: sys.sig, cycles: cycles, res: res, ms: Date.now() - t0 };
  }

  // ---------------------------------------------------------------------
  // 在任意點取值
  // ---------------------------------------------------------------------
  function clampXY(sol, x, y) {
    return [Math.min(Math.max(x, 0), sol.W), Math.min(Math.max(y, 0), sol.H)];
  }
  /** 電位（V）：雙線性內插；在電極上就是電極的電位 */
  function potentialAt(sol, x, y) {
    const c = clampXY(sol, x, y); x = c[0]; y = c[1];
    const e = electrodeAt(sol.els, x, y);
    if (e >= 0) return sol.els[e].V;
    const h = sol.h, nx = sol.nx;
    const i = Math.min(Math.floor(x / h), nx - 2), j = Math.min(Math.floor(y / h), sol.ny - 2);
    const u = x / h - i, v = y / h - j, k = j * nx + i, V = sol.V;
    return (1 - u) * (1 - v) * V[k] + u * (1 - v) * V[k + 1] + (1 - u) * v * V[k + nx] + u * v * V[k + nx + 1];
  }
  /** 電場 E = −∇V（V/cm）：各格點的梯度做雙線性內插（只用電極外的格點） */
  function fieldAt(sol, x, y) {
    const c = clampXY(sol, x, y); x = c[0]; y = c[1];
    if (electrodeAt(sol.els, x, y) >= 0) return { ex: 0, ey: 0, E: 0 };
    const h = sol.h, nx = sol.nx;
    const i = Math.min(Math.floor(x / h), nx - 2), j = Math.min(Math.floor(y / h), sol.ny - 2);
    const u = x / h - i, v = y / h - j, k = j * nx + i;
    const ks = [k, k + 1, k + nx, k + nx + 1], ws = [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
    let ex = 0, ey = 0, wsum = 0;
    for (let q = 0; q < 4; q++) {
      if (sol.fixed[ks[q]] >= 0) continue;
      ex += ws[q] * sol.Ex[ks[q]]; ey += ws[q] * sol.Ey[ks[q]]; wsum += ws[q];
    }
    if (wsum > 0) { ex /= wsum; ey /= wsum; }
    return { ex: ex, ey: ey, E: Math.hypot(ex, ey) };
  }
  /** 導電度（相對值，均勻時為 1） */
  function sigmaAt(sol, x, y) { return sol.sig ? sol.sig(x, y) : 1; }

  /**
   * 通過中線（x ≈ W/2）的總電流（A）：Σ σ (V_i − V_{i+1})／R_s，邊上的列只算半格。
   * 有限體積的離散方程式保證：兩電極之間每一條直線上算出的電流都相同（電流守恆）。
   */
  function currentAcross(sol, iCol) {
    const nx = sol.nx, ny = sol.ny, h = sol.h, V = sol.V;
    const i = iCol == null ? Math.floor((nx - 1) / 2) : iCol;
    let F = 0;
    for (let j = 0; j < ny; j++) {
      const w = (j === 0 || j === ny - 1) ? 0.5 : 1;
      const sm = sol.sig ? sol.sig((i + 0.5) * h, j * h) : 1;
      F += w * sm * (V[j * nx + i] - V[j * nx + i + 1]);
    }
    return F / R_SHEET;
  }

  // ---------------------------------------------------------------------
  // 等位線（marching squares，接成折線）
  // ---------------------------------------------------------------------
  function contour(sol, level) {
    const nx = sol.nx, ny = sol.ny, h = sol.h, V = sol.V;
    // 每個交點在某一條格線邊上：水平邊 id = 2k，垂直邊 id = 2k + 1（k 為邊的起點）
    const pts = new Map();
    const segs = [];
    function cross(k0, k1, horiz) {
      const id = 2 * k0 + (horiz ? 0 : 1);
      if (!pts.has(id)) {
        const a = V[k0], b = V[k1], t = (level - a) / (b - a);
        const i = k0 % nx, j = (k0 - i) / nx;
        pts.set(id, horiz ? [(i + t) * h, j * h] : [i * h, (j + t) * h]);
      }
      return id;
    }
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const k = j * nx + i;
        const v0 = V[k], v1 = V[k + 1], v2 = V[k + nx + 1], v3 = V[k + nx];
        let c = 0;
        if (v0 > level) c |= 1;
        if (v1 > level) c |= 2;
        if (v2 > level) c |= 4;
        if (v3 > level) c |= 8;
        if (c === 0 || c === 15) continue;
        const B = function () { return cross(k, k + 1, true); };
        const R = function () { return cross(k + 1, k + nx + 1, false); };
        const T = function () { return cross(k + nx, k + nx + 1, true); };
        const L = function () { return cross(k, k + nx, false); };
        const add = function (p, q) { segs.push([p, q]); };
        switch (c) {
          case 1: case 14: add(L(), B()); break;
          case 2: case 13: add(B(), R()); break;
          case 3: case 12: add(L(), R()); break;
          case 4: case 11: add(R(), T()); break;
          case 6: case 9: add(B(), T()); break;
          case 7: case 8: add(L(), T()); break;
          case 5: case 10: {
            const mid = (v0 + v1 + v2 + v3) / 4 > level;
            if ((c === 5) === mid) { add(L(), T()); add(B(), R()); } else { add(L(), B()); add(R(), T()); }
            break;
          }
        }
      }
    }
    // 依端點把線段接成折線
    const adj = new Map();
    segs.forEach(function (s, n) {
      [s[0], s[1]].forEach(function (p) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push(n); });
    });
    const used = new Uint8Array(segs.length);
    const lines = [];
    function walk(start, seg) {
      const out = [start];
      let cur = start, s = seg;
      while (s >= 0 && !used[s]) {
        used[s] = 1;
        const nxt = segs[s][0] === cur ? segs[s][1] : segs[s][0];
        out.push(nxt);
        cur = nxt;
        const a = adj.get(cur);
        s = -1;
        for (let q = 0; q < a.length; q++) if (!used[a[q]]) { s = a[q]; break; }
      }
      return out;
    }
    // 先從只有一條線段的端點（開放曲線）開始，再處理封閉曲線
    adj.forEach(function (list, p) {
      if (list.length === 1 && !used[list[0]]) {
        const ids = walk(p, list[0]);
        lines.push({ pts: ids.map(function (q) { return pts.get(q); }), closed: false });
      }
    });
    for (let n = 0; n < segs.length; n++) {
      if (used[n]) continue;
      const ids = walk(segs[n][0], n);
      lines.push({ pts: ids.map(function (q) { return pts.get(q); }), closed: ids[0] === ids[ids.length - 1] });
    }
    return lines;
  }

  // ---------------------------------------------------------------------
  // 電流線（＝電力線，J = σE 與 E 同方向）：從正極出發，起點依電流通量平均分配
  // ---------------------------------------------------------------------
  function outline(e, n) {
    const pts = [];
    if (e.kind === 'circle') {
      for (let q = 0; q < n; q++) {
        const a = 2 * Math.PI * (q + 0.5) / n;
        pts.push({ x: e.x + e.r * Math.cos(a), y: e.y + e.r * Math.sin(a), nx: Math.cos(a), ny: Math.sin(a) });
      }
      return pts;
    }
    const w = e.x1 - e.x0, hh = e.y1 - e.y0, per = 2 * (w + hh);
    for (let q = 0; q < n; q++) {
      let s = per * (q + 0.5) / n;
      if (s < w) { pts.push({ x: e.x0 + s, y: e.y0, nx: 0, ny: -1 }); continue; }
      s -= w;
      if (s < hh) { pts.push({ x: e.x1, y: e.y0 + s, nx: 1, ny: 0 }); continue; }
      s -= hh;
      if (s < w) { pts.push({ x: e.x1 - s, y: e.y1, nx: 0, ny: 1 }); continue; }
      s -= w;
      pts.push({ x: e.x0, y: e.y1 - s, nx: -1, ny: 0 });
    }
    return pts;
  }

  /** 沿電場方向描一條線（RK4，步長以弧長計）。傳回 { pts, end: 'electrode' | 'stall' | 'max' } */
  function traceLine(sol, x0, y0, opts) {
    opts = opts || {};
    const ds = opts.step || 0.08, maxN = opts.maxSteps || 1500;
    const pts = [[x0, y0]];
    let x = x0, y = y0, end = 'max';
    const start = electrodeAt(sol.els, x0, y0);
    function dir(px, py) {
      const f = fieldAt(sol, px, py);
      if (!(f.E > 1e-9)) return null;
      return [f.ex / f.E, f.ey / f.E];
    }
    /** 這一步會走進另一個電極：沿 k1 二分法找到電極表面，線停在表面上 */
    function landing(k1) {
      const tx = x + ds * k1[0], ty = y + ds * k1[1];
      const e = electrodeAt(sol.els, tx, ty);
      if (e < 0 || e === start) return false;
      let lo = 0, hi = ds;
      for (let q = 0; q < 30; q++) { const m = (lo + hi) / 2; if (electrodeAt(sol.els, x + m * k1[0], y + m * k1[1]) === e) hi = m; else lo = m; }
      pts.push([x + hi * k1[0], y + hi * k1[1]]);
      return true;
    }
    for (let s = 0; s < maxN; s++) {
      const k1 = dir(x, y); if (!k1) { end = 'stall'; break; }
      if (landing(k1)) { end = 'electrode'; break; }
      const k2 = dir(x + ds / 2 * k1[0], y + ds / 2 * k1[1]) || k1;
      const k3 = dir(x + ds / 2 * k2[0], y + ds / 2 * k2[1]) || k2;
      const k4 = dir(x + ds * k3[0], y + ds * k3[1]) || k3;
      x += ds / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += ds / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      const c = clampXY(sol, x, y); x = c[0]; y = c[1];
      pts.push([x, y]);
      const e = electrodeAt(sol.els, x, y);
      if (e >= 0 && e !== start) { end = 'electrode'; break; }
    }
    return { pts: pts, end: end };
  }

  /** 從正極描 n 條電流線；起點使相鄰兩線之間的電流相等（線的疏密代表電流密度） */
  function streamlines(sol, n) {
    n = n || 14;
    const e = sol.els.find(function (q) { return q.sign > 0; });
    if (!e || !(sol.cfg.V0 > 0)) return [];
    const M = 720, off = sol.h * 1.5;
    const ol = outline(e, M);
    const flux = new Float64Array(M);
    let tot = 0;
    for (let q = 0; q < M; q++) {
      const p = ol[q];
      const px = p.x + p.nx * off, py = p.y + p.ny * off;
      if (px < 0 || px > sol.W || py < 0 || py > sol.H) { flux[q] = 0; continue; }
      const f = fieldAt(sol, px, py);
      const jn = Math.max(0, (f.ex * p.nx + f.ey * p.ny) * sigmaAt(sol, px, py));
      flux[q] = jn; tot += jn;
    }
    if (!(tot > 0)) return [];
    const lines = [];
    let acc = 0, q = 0;
    for (let m = 0; m < n; m++) {
      const target = tot * (m + 0.5) / n;
      while (q < M - 1 && acc + flux[q] < target) { acc += flux[q]; q++; }
      const p = ol[q];
      const sx = p.x + p.nx * off, sy = p.y + p.ny * off;
      const tr = traceLine(sol, sx, sy);
      tr.pts.unshift([p.x, p.y]);
      lines.push(tr);
    }
    return lines;
  }

  // ---------------------------------------------------------------------
  // 解析解（測試用）
  // ---------------------------------------------------------------------
  /**
   * 無限大導電紙上兩個半徑 a、圓心相距 d 的圓形電極（左 V0、右 0），圓心在 (xc ∓ d/2, yc)：
   * 等效於兩條相距 2c 的線電荷，c = √((d/2)^2 − a^2)（阿波羅尼斯圓），V = V0/2 + A ln(r_- / r_+)。
   */
  function twoCircleInfinite(d, a, V0, xc, yc) {
    const s = d / 2, c = Math.sqrt(s * s - a * a);
    // 左圓（正極）上離原點最近的點 (xc − s + a)
    const px = -s + a;
    const K = Math.abs(px - c) / Math.abs(px + c); // r_- / r_+
    const A = (V0 / 2) / Math.log(K);
    return {
      c: c,
      V: function (x, y) {
        const X = x - xc, Y = y - yc;
        const rp = Math.hypot(X + c, Y), rm = Math.hypot(X - c, Y);
        return V0 / 2 + A * Math.log(rm / rp);
      },
      // 兩電極間的電阻（無限大紙）：R = (R_s/π) arccosh(d/2a)
      R: function (Rs) { return (Rs / Math.PI) * Math.acosh(d / (2 * a)); }
    };
  }

  // ---------------------------------------------------------------------
  // 電表
  // ---------------------------------------------------------------------
  /** 三用電表讀數（V，取到 0.01 V）。noise：{ offset, jitter } 會加在真值上 */
  function dmmReading(dV, noise) {
    const v = dV + (noise ? (noise.offset || 0) + (noise.jitter || 0) : 0);
    const r = Math.round(v / DMM_STEP) * DMM_STEP;
    return Math.abs(r) < DMM_STEP / 2 ? 0 : +r.toFixed(2);
  }
  /** 檢流計電流（A）：I = ΔV / R（零位法：讀數為零時兩探針等電位、也不取用電流） */
  function galvCurrent(dV, noise) {
    return dV / GALV_R + (noise ? (noise.jitterI || 0) : 0);
  }

  // ---------------------------------------------------------------------
  // 數據分析：記錄點分組、排序成曲線、平滑、最近點、射線交點、由等位線畫電力線、估算電場
  // ---------------------------------------------------------------------
  /**
   * 記錄點分組：同一個固定探針位置、讀數相近（±tol V）的點屬於同一條等位線。
   * recs：[{ x, y, n1x, n1y, reading（以伏特表示的探針電位差）, V1（固定探針的電位）}]
   * 傳回 [{ id, V（這條線的電位）, idx: [記錄編號] }]
   */
  function groupRecords(recs, tol) {
    tol = tol == null ? 0.06 : tol;
    const groups = [];
    recs.forEach(function (r, n) {
      const Vabs = r.V1 + r.reading;
      let g = null;
      for (let q = 0; q < groups.length; q++) {
        const G = groups[q];
        if (Math.abs(G.n1x - r.n1x) < 0.051 && Math.abs(G.n1y - r.n1y) < 0.051 && Math.abs(G.Vsum / G.idx.length - Vabs) <= tol) { g = G; break; }
      }
      if (!g) { g = { id: groups.length, n1x: r.n1x, n1y: r.n1y, Vsum: 0, idx: [] }; groups.push(g); }
      g.idx.push(n); g.Vsum += Vabs;
    });
    groups.forEach(function (g) { g.V = g.Vsum / g.idx.length; });
    return groups;
  }

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function pathLength(p) { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i - 1], p[i]); return s; }

  /** 把散點排成一條最短的曲線（最近鄰＋2-opt）；兩端很近時視為封閉曲線 */
  function orderPoints(points) {
    const n = points.length;
    if (n <= 2) return { pts: points.slice(), closed: false };
    // 從「離其他點最遠」的端點開始
    let start = 0, best = -1;
    const cx = points.reduce(function (s, p) { return s + p[0]; }, 0) / n, cy = points.reduce(function (s, p) { return s + p[1]; }, 0) / n;
    points.forEach(function (p, i) { const d = Math.hypot(p[0] - cx, p[1] - cy); if (d > best) { best = d; start = i; } });
    const used = new Uint8Array(n), order = [start];
    used[start] = 1;
    for (let k = 1; k < n; k++) {
      const last = points[order[order.length - 1]];
      let bi = -1, bd = Infinity;
      for (let i = 0; i < n; i++) if (!used[i]) { const d = dist(last, points[i]); if (d < bd) { bd = d; bi = i; } }
      used[bi] = 1; order.push(bi);
    }
    // 2-opt（開放路徑）
    let improved = true, guard = 0;
    while (improved && guard++ < 50) {
      improved = false;
      for (let i = 0; i < n - 2; i++) {
        for (let j = i + 2; j < n; j++) {
          const a = points[order[i]], b = points[order[i + 1]], c = points[order[j]], d = j + 1 < n ? points[order[j + 1]] : null;
          const before = dist(a, b) + (d ? dist(c, d) : 0);
          const after = dist(a, c) + (d ? dist(b, d) : 0);
          if (after < before - 1e-9) {
            const seg = order.slice(i + 1, j + 1).reverse();
            for (let q = 0; q < seg.length; q++) order[i + 1 + q] = seg[q];
            improved = true;
          }
        }
      }
      // 端點也可以整段反轉接到另一端（讓起點不必是最遠點）
      for (let j = 1; j < n - 1; j++) {
        const a = points[order[0]], b = points[order[j]], c = points[order[j + 1]];
        if (dist(a, c) < dist(b, c) - 1e-9) {
          const seg = order.slice(0, j + 1).reverse();
          for (let q = 0; q < seg.length; q++) order[q] = seg[q];
          improved = true;
        }
      }
    }
    const pts = order.map(function (i) { return points[i]; });
    const steps = [];
    for (let i = 1; i < n; i++) steps.push(dist(pts[i - 1], pts[i]));
    steps.sort(function (a, b) { return a - b; });
    const med = steps[Math.floor(steps.length / 2)];
    const closed = n >= 5 && dist(pts[0], pts[n - 1]) <= 1.6 * med;
    return { pts: pts, closed: closed };
  }

  /** 向心 Catmull–Rom 平滑曲線（不會打結、不會衝過頭）；每段取 seg 個點 */
  function smoothPath(pts, closed, seg) {
    seg = seg || 10;
    const n = pts.length;
    if (n < 3) return pts.slice();
    const P = function (i) {
      if (closed) return pts[(i % n + n) % n];
      if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
      if (i >= n) return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
      return pts[i];
    };
    const out = [];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      const t0 = 0;
      const t1 = t0 + Math.pow(Math.max(dist(p0, p1), 1e-6), 0.5);
      const t2 = t1 + Math.pow(Math.max(dist(p1, p2), 1e-6), 0.5);
      const t3 = t2 + Math.pow(Math.max(dist(p2, p3), 1e-6), 0.5);
      for (let s = 0; s < seg; s++) {
        const t = t1 + (t2 - t1) * s / seg;
        const L = function (a, b, ta, tb) { const u = (t - ta) / (tb - ta); return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; };
        const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
        const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
        out.push(L(B1, B2, t1, t2));
      }
    }
    out.push(closed ? pts[0] : pts[n - 1]);
    return out;
  }

  /** 折線上離 p 最近的點：{ x, y, d, tx, ty（切線單位向量）} */
  function nearestOnPath(path, p) {
    let best = null;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      if (L2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      const x = a[0] + t * dx, y = a[1] + t * dy, d = Math.hypot(p[0] - x, p[1] - y);
      if (!best || d < best.d) { const L = Math.sqrt(L2); best = { x: x, y: y, d: d, tx: dx / L, ty: dy / L, seg: i, t: t }; }
    }
    return best;
  }

  /**
   * 學生的作法：由量到的等位線畫電力線（電力線處處與等位線垂直）。
   * measured：量到的等位線 [{ V, path }]；opts：{ els, V0, W, H, nSeeds = 9, h = 0.25 }。
   * 只用量到的資料：電極（V0 與 0）與各條量測線上的點當作已知電位，其他地方用「最平滑」的內插
   * （在粗網格上解拉普拉斯方程式，紙邊不導電），量測線就是這個內插電位的等高線，
   * 沿它的下坡方向畫線，自然與每一條量測線垂直。起點放在電位最接近中間的那條量測線上，
   * 依「通量相等」分配（電場強的地方線比較密），往兩邊一直畫到電極。
   * 傳回 [[ [x, y], … ], …]（每條線由正極往負極）。
   */
  function sketchFieldLines(measured, opts) {
    const o = opts || {};
    const els = o.els, V0 = o.V0, W = o.W || SHEET_W, H = o.H || SHEET_H;
    const nSeeds = o.nSeeds || 9, h = o.h || 0.25;
    const curves = (measured || []).filter(function (c) { return c.path && c.path.length >= 2; });
    if (!curves.length || !els || !(V0 > 0)) return [];
    const nx = Math.round(W / h) + 1, ny = Math.round(H / h) + 1, N = nx * ny;
    const V = new Float64Array(N), fix = new Uint8Array(N);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = i * h, y = j * h;
      V[k] = V0 / 2;
      for (let q = 0; q < els.length; q++) if (inside(els[q], x, y)) { fix[k] = 1; V[k] = els[q].sign > 0 ? V0 : 0; break; }
    }
    // 電極太小、沒有包到格點時，把最近的格點當成電極
    els.forEach(function (e) {
      const c = e.kind === 'circle' ? [e.x, e.y] : [(e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2];
      const i = Math.min(nx - 1, Math.max(0, Math.round(c[0] / h))), j = Math.min(ny - 1, Math.max(0, Math.round(c[1] / h)));
      fix[j * nx + i] = 1; V[j * nx + i] = e.sign > 0 ? V0 : 0;
    });
    // 量測線：沿線每 h/2 取一點，最近的格點固定為該線的電位（不覆蓋電極）
    const own = new Uint8Array(N), ownV = new Float64Array(N), ownD = new Float64Array(N), ownX = new Float64Array(N), ownY = new Float64Array(N);
    curves.forEach(function (c) {
      for (let s = 1; s < c.path.length; s++) {
        const a = c.path[s - 1], b = c.path[s], L = dist(a, b), n = Math.max(1, Math.ceil(L / (h / 4)));
        for (let q = 0; q <= n; q++) {
          const x = a[0] + (b[0] - a[0]) * q / n, y = a[1] + (b[1] - a[1]) * q / n;
          const i = Math.round(x / h), j = Math.round(y / h);
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          const k = j * nx + i, d = Math.hypot(x - i * h, y - j * h);
          if (fix[k] && !own[k]) continue;
          if (own[k] && d >= ownD[k]) continue;
          fix[k] = 1; own[k] = 1; V[k] = ownV[k] = c.V; ownD[k] = d; ownX[k] = x; ownY[k] = y;
        }
      }
    });
    // SOR（紙邊：鏡像格點，相當於法向導數為零）
    function sor(maxIt) {
      const w = 1.9;
      for (let it = 0; it < maxIt; it++) {
        let dmax = 0;
        for (let j = 0; j < ny; j++) {
          const jm = j > 0 ? j - 1 : 1, jp = j < ny - 1 ? j + 1 : ny - 2;
          for (let i = 0; i < nx; i++) {
            const k = j * nx + i;
            if (fix[k]) continue;
            const im = i > 0 ? i - 1 : 1, ip = i < nx - 1 ? i + 1 : nx - 2;
            const d = w * (0.25 * (V[j * nx + im] + V[j * nx + ip] + V[jm * nx + i] + V[jp * nx + i]) - V[k]);
            V[k] += d;
            if (Math.abs(d) > dmax) dmax = Math.abs(d);
          }
        }
        if (dmax < 1e-6 * V0) break;
      }
    }
    sor(3000);
    // 量測點不一定剛好在格點上：用目前的梯度把格點的電位修正成「線上那一點的電位＋坡度×偏移」，再解一次
    for (let pass = 0; pass < 2; pass++) {
      const corr = [];
      for (let k = 0; k < N; k++) {
        if (!own[k]) continue;
        const i = k % nx, j = (k - i) / nx, g = grad(i * h, j * h);
        corr.push([k, ownV[k] + g[0] * (i * h - ownX[k]) + g[1] * (j * h - ownY[k])]);
      }
      corr.forEach(function (c) { V[c[0]] = c[1]; });
      sor(1500);
    }
    function grad(x, y) {
      // 格點上的中央差分，再雙線性內插
      const fx = Math.min(nx - 1.000001, Math.max(0, x / h)), fy = Math.min(ny - 1.000001, Math.max(0, y / h));
      const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
      let gx = 0, gy = 0;
      [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]].forEach(function (c) {
        const ii = i + c[0], jj = j + c[1];
        const im = Math.max(0, ii - 1), ip = Math.min(nx - 1, ii + 1), jm = Math.max(0, jj - 1), jp = Math.min(ny - 1, jj + 1);
        gx += c[2] * (V[jj * nx + ip] - V[jj * nx + im]) / ((ip - im) * h);
        gy += c[2] * (V[jp * nx + ii] - V[jm * nx + ii]) / ((jp - jm) * h);
      });
      return [gx, gy];
    }
    function inEl(x, y) { for (let q = 0; q < els.length; q++) if (inside(els[q], x, y)) return true; return false; }
    /** 沿 sgn·∇V（sgn = −1 下坡、+1 上坡）走到電極、紙外或停滯 */
    function trace(p, sgn) {
      const pts = [p];
      let x = p[0], y = p[1];
      const ds = 0.08;
      for (let n = 0; n < 1200; n++) {
        const g1 = grad(x, y), m1 = Math.hypot(g1[0], g1[1]);
        if (m1 < 1e-9 * V0) break;
        const xm = x + 0.5 * ds * sgn * g1[0] / m1, ym = y + 0.5 * ds * sgn * g1[1] / m1;
        const g2 = grad(xm, ym), m2 = Math.hypot(g2[0], g2[1]);
        if (m2 < 1e-9 * V0) break;
        x += ds * sgn * g2[0] / m2; y += ds * sgn * g2[1] / m2;
        if (x < 0 || y < 0 || x > W || y > H) break;
        pts.push([x, y]);
        if (inEl(x, y)) break;
      }
      return pts;
    }
    // 起點：電位最接近中間的量測線，依 ∫|∇V| ds 等分（通量相等）
    let base = curves[0];
    curves.forEach(function (c) { if (Math.abs(c.V - V0 / 2) < Math.abs(base.V - V0 / 2)) base = c; });
    const P = base.path, cum = [0];
    for (let s = 1; s < P.length; s++) {
      const mx = (P[s][0] + P[s - 1][0]) / 2, my = (P[s][1] + P[s - 1][1]) / 2, g = grad(mx, my);
      cum.push(cum[s - 1] + Math.hypot(g[0], g[1]) * dist(P[s - 1], P[s]));
    }
    const total = cum[cum.length - 1];
    if (!(total > 0)) return [];
    const lines = [];
    for (let m = 0; m < nSeeds; m++) {
      const target = total * (m + 0.5) / nSeeds;
      let s = 1;
      while (s < P.length - 1 && cum[s] < target) s++;
      const t = cum[s] > cum[s - 1] ? (target - cum[s - 1]) / (cum[s] - cum[s - 1]) : 0;
      const p = [P[s - 1][0] + t * (P[s][0] - P[s - 1][0]), P[s - 1][1] + t * (P[s][1] - P[s - 1][1])];
      const up = trace(p, 1), down = trace(p, -1);
      const line = up.slice().reverse().concat(down.slice(1));
      if (line.length > 2) lines.push(line);
    }
    return lines;
  }

  /**
   * 由兩條相鄰的等位線估算電場：P 附近，A 線（電位 VA）上離 P 最近的點 a、B 線上離 P 最近的點 b，
   * E ≈ |VA − VB| / |ab|。傳回 { a, b, dd, dV, E }（E 單位 V/cm）
   */
  function estimateField(pathA, VA, pathB, VB, p) {
    const a = nearestOnPath(pathA, p), b = nearestOnPath(pathB, p);
    if (!a || !b) return null;
    const dd = Math.hypot(a.x - b.x, a.y - b.y);
    if (!(dd > 1e-6)) return null;
    const dV = Math.abs(VA - VB);
    return { a: [a.x, a.y], b: [b.x, b.y], dd: dd, dV: dV, E: dV / dd };
  }

  return {
    SHEET_W: SHEET_W, SHEET_H: SHEET_H, BAR_W: BAR_W, R_SHEET: R_SHEET, GALV_R: GALV_R, GALV_FS: GALV_FS, DMM_STEP: DMM_STEP,
    rng: rng, gauss: gauss,
    electrodes: electrodes, inside: inside, electrodeAt: electrodeAt, distToElectrode: distToElectrode, outline: outline,
    sigmaField: sigmaField, build: build, solve: solve,
    potentialAt: potentialAt, fieldAt: fieldAt, sigmaAt: sigmaAt, currentAcross: currentAcross,
    contour: contour, traceLine: traceLine, streamlines: streamlines,
    twoCircleInfinite: twoCircleInfinite,
    dmmReading: dmmReading, galvCurrent: galvCurrent,
    groupRecords: groupRecords, orderPoints: orderPoints, smoothPath: smoothPath, pathLength: pathLength,
    nearestOnPath: nearestOnPath, sketchFieldLines: sketchFieldLines, estimateField: estimateField
  };
});
