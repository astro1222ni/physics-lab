/*
 * energy-coaster-core.js — 「雲霄飛車與力學能守恆」物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：長度 m、時間 s、速率 m/s、g m/s²。
 * 核心只算「每公斤」的量：比能量 J/kg、正向力 N/kg；乘上質量 m 才是 J、N（質量不影響運動）。
 * 位能零點 y_ref 也不進入運動方程式：U = m g (y − y_ref) 由畫面計算（只差一個常數）。
 *
 * 軌道（track）：
 *   控制點 pts = [[x, y], …]，x 嚴格遞增。軌道是由控制點決定的均勻三次 B 樣條 y = f(x)：
 *   曲線從第一個控制點出發、在最後一個控制點結束，中間的控制點把曲線「拉」過去（曲線不一定通過它們）。
 *   f、f′、f″ 處處連續 → 切線方向與曲率 κ 都連續（C² 曲線），而且不會超出控制點的範圍。
 *   含圓形迴圈時（loop = { at: i, R }）：第 i 個控制點是迴圈底部，樣條在這裡分成左右兩段，
 *   底部前後兩個控制點與底部同高 → 兩段都以水平切線、曲率 0 接到迴圈底部，
 *   中間插入一個半徑 R 的完整圓（逆時針：底部 → 右側 → 頂點 → 左側 → 底部）。
 *   迴圈與樣條相接處切線連續，但曲率由 0 跳到 1/R（教科書的圓形迴圈；真實雲霄飛車用回旋曲線過渡）。
 *
 * 參數 u：沿軌道的參數。樣條段 u 與 x 同步增加（du = dx），圓形段 u 就是弧長（du = R dφ）。
 *   兩者在相接處（水平切線）的 ds/du 都等於 1，所以 u 的變化率連續。
 *   ds/du = J：樣條段 J = √(1 + f′²)，圓形段 J = 1。
 *
 * 運動方程式（小車視為質點，在軌道上）：
 *   t̂ = 切線單位向量（u 增加的方向），n̂ = t̂ 逆時針轉 90°（小車所在的一側：一般在軌道上方、迴圈內側）
 *   κ = dθ/ds（帶正負號：凹向上（谷）> 0、凸（山頂）< 0、迴圈 = +1/R）
 *   正向力（每公斤）  N/m = κ v² + g cos θ      （cos θ = t̂ₓ）
 *   切線方向          dv/dt = −g sin θ − μ |N|/m · sgn(v)     （sin θ = t̂ᵧ = dy/ds）
 *   位置              du/dt = v / J
 *   摩擦生熱（每公斤）dq/dt = μ |N|/m · |v|
 *   → ½v² + g y + q 嚴格守恆（μ = 0 時 ½v² + g y 守恆）。
 *   數值積分：四階 Runge–Kutta（RK4），固定步長 0.5 ms；離軌、到達軌道末端、速度變號（有摩擦）等事件
 *   用二分法把步長切到事件發生的瞬間（誤差 < 1e-12 s）。沒有任何「把能量硬拉回去」的修正。
 *
 * 兩種車：
 *   'rail'（軌道車）：輪子扣住軌道，N < 0 時軌道往內拉住車子（摩擦用 |N|）。
 *   'free'（自由小車）：只靠軌道的正向推力，N 降到 0 以下就離開軌道，變成拋體。
 *   兩種車到達軌道末端都會沿切線飛出（拋體）。
 * 拋體：x = x₀ + vₓτ、y = y₀ + vᵧτ − ½gτ²（解析解）。
 *   落回軌道（從小車那一側）：法線方向的速度完全損失（完全非彈性），保留切線速度，損失的動能記為撞擊生熱 qi。
 *   打到地面（y = 0）：動能全部變成撞擊生熱，小車停住。打到軌道背面視為撞毀（停住）。
 * 靜摩擦係數取與動摩擦係數 μ 相同：速度降到 0 時，若 |tan θ| ≤ μ 就停住。
 */
(function (root) {
  'use strict';

  const G_PRESETS = { earth: 9.8, moon: 1.62, jupiter: 23.1 }; // 地球、月球、木星（NASA Fact Sheets；木星為赤道 1 bar 氣壓高度）
  const WORLD = { W: 32, H: 16 };     // 場景範圍：x 0–32 m、y 0–16 m（地面 y = 0）
  const H_STEP = 5e-4;                // 軌道上的積分步長（s）
  const H_AIR = 2e-3;                 // 拋體的碰撞偵測步長（位置用解析解）
  const MIN_GAP = 1.2;                // 相鄰控制點最小水平間隔（m）
  const TAU = Math.PI * 2;

  // 預設軌道（x 0–32 m、y 0–16 m）。start：預設起點的 x；target：跳台的落點標靶 x
  const PRESETS = {
    valley: { pts: [[2, 12.5], [8, 1], [16, 1], [24, 1], [30, 12.5]], loop: null, start: 2.6 },
    twin: { pts: [[1.5, 15], [5, 0.6], [9, 0.6], [13, 15.2], [17, 0.6], [21, 0.6], [25, 11], [30.5, 6]], loop: null, start: 1.5 },
    loop: { pts: [[1.5, 15], [5, 3], [9.5, 1], [14.5, 1], [19.5, 1], [23, 6.5], [27, 6.5], [31.5, 6.5]], loop: { at: 3, R: 3.2 }, start: 1.5 },
    jump: { pts: [[1.5, 14.5], [5, 8.5], [8.5, 5], [11.5, 5], [14.5, 5]], loop: null, start: 1.5, target: 26 }
  };

  // ---------------- 三次 B 樣條 y = f(x) ----------------
  /**
   * 均勻三次 B 樣條（控制點 P₀…Pₙ₋₁，x 嚴格遞增）。兩端各加一個鏡射的虛擬點 2P₀ − P₁、2Pₙ₋₁ − Pₙ₋₂，
   * 曲線因此從 P₀ 出發、在 Pₙ₋₁ 結束，端點切線指向相鄰控制點、端點曲率為 0。
   * 曲線整段 C²（位置、切線、曲率都連續），落在控制點的凸包內（不會像內插樣條那樣多出凸起），
   * 4 個連續控制點同高時那一段完全水平（可做平台）。中間的控制點「拉」曲線，但曲線不一定通過它們。
   * 每一段 p(τ) = [(1−τ)³Q₀ + (3τ³−6τ²+4)Q₁ + (−3τ³+3τ²+3τ+1)Q₂ + τ³Q₃]/6，τ ∈ [0, 1]。
   * 控制點的 x 遞增 → x(τ) 嚴格遞增，曲線是函數 y = f(x)；f(x) 由牛頓法反解 τ(x) 後計算。
   */
  function spline(xs, ys) {
    const n = xs.length;
    if (n < 2) throw new Error('spline needs ≥ 2 points');
    const QX = [2 * xs[0] - xs[1]].concat(xs, [2 * xs[n - 1] - xs[n - 2]]);
    const QY = [2 * ys[0] - ys[1]].concat(ys, [2 * ys[n - 1] - ys[n - 2]]);
    const segs = [];
    for (let i = 0; i < n - 1; i++) {
      const c = function (Q) {
        const q0 = Q[i], q1 = Q[i + 1], q2 = Q[i + 2], q3 = Q[i + 3];
        return [(q0 + 4 * q1 + q2) / 6, (-3 * q0 + 3 * q2) / 6, (3 * q0 - 6 * q1 + 3 * q2) / 6, (-q0 + 3 * q1 - 3 * q2 + q3) / 6];
      };
      const cx = c(QX), cy = c(QY);
      segs.push({ cx: cx, cy: cy, xa: cx[0], xb: cx[0] + cx[1] + cx[2] + cx[3] });
    }
    segs[0].xa = xs[0]; segs[n - 2].xb = xs[n - 1]; // 端點精確落在 P₀、Pₙ₋₁
    function seg(x) {
      let lo = 0, hi = n - 2;
      if (x <= segs[0].xb) return 0;
      if (x >= segs[n - 2].xa) return n - 2;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (segs[mid].xa <= x) lo = mid; else hi = mid; }
      return lo;
    }
    const poly = function (c, t) { return ((c[3] * t + c[2]) * t + c[1]) * t + c[0]; };
    const d1 = function (c, t) { return (3 * c[3] * t + 2 * c[2]) * t + c[1]; };
    const d2 = function (c, t) { return 6 * c[3] * t + 2 * c[2]; };
    /** 由 x 反解 τ（牛頓法，x′(τ) > 0；不收斂時改用二分法） */
    function tauOf(s, x) {
      const c = s.cx;
      // 範圍外（RK4 中間步稍微超出端點）時沿用端點那一段的多項式外插
      const T0 = -0.25, T1 = 1.25;
      let t = (x - s.xa) / (s.xb - s.xa);
      if (!(t > T0)) t = T0; else if (t > T1) t = T1;
      for (let it = 0; it < 20; it++) {
        const dt = (poly(c, t) - x) / d1(c, t);
        t -= dt;
        if (t < T0) t = T0; else if (t > T1) t = T1;
        if (Math.abs(dt) < 1e-15) break;
      }
      if (Math.abs(poly(c, t) - x) > 1e-11 * Math.max(1, Math.abs(x))) {
        let lo = T0, hi = T1;
        for (let it = 0; it < 80; it++) { const m = (lo + hi) / 2; if (poly(c, m) < x) lo = m; else hi = m; }
        t = (lo + hi) / 2;
      }
      return t;
    }
    /** 傳回 [f, f′, f″]（對 x 的導數） */
    function ev(x) {
      const s = segs[seg(x)], t = tauOf(s, x);
      const X1 = d1(s.cx, t), X2 = d2(s.cx, t), Y1 = d1(s.cy, t), Y2 = d2(s.cy, t);
      return [poly(s.cy, t), Y1 / X1, (Y2 * X1 - Y1 * X2) / (X1 * X1 * X1)];
    }
    return { xs: xs.slice(), ys: ys.slice(), segs: segs, ev: ev, x0: xs[0], x1: xs[n - 1] };
  }

  // ---------------- 軌道 ----------------
  /** 整理軌道定義；有迴圈時，迴圈底部前後兩個控制點與底部同高（軌道水平接上迴圈） */
  function cleanDef(def) {
    const out = {
      pts: def.pts.map(function (p) { return [+p[0], +p[1]]; }),
      loop: def.loop ? { at: def.loop.at | 0, R: +def.loop.R } : null
    };
    if (out.loop) {
      const a = out.loop.at;
      if (a >= 1 && a <= out.pts.length - 2) { out.pts[a - 1][1] = out.pts[a][1]; out.pts[a + 1][1] = out.pts[a][1]; }
    }
    return out;
  }

  /** 由控制點建立軌道。傳回的物件不會改變（改控制點就重新建立）。 */
  function buildTrack(defIn) {
    const def = cleanDef(defIn);
    const pts = def.pts, n = pts.length;
    const xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    const pieces = [];
    let loop = null;
    if (!def.loop) {
      const sp = spline(xs, ys);
      pieces.push({ type: 'spline', sp: sp, xa: xs[0], xb: xs[n - 1], u0: 0, u1: xs[n - 1] - xs[0] });
    } else {
      const a = def.loop.at, R = def.loop.R;
      if (a < 1 || a > n - 2) throw new Error('loop anchor must be an interior point');
      const spL = spline(xs.slice(0, a + 1), ys.slice(0, a + 1));
      const spR = spline(xs.slice(a), ys.slice(a));
      const u1 = xs[a] - xs[0];
      pieces.push({ type: 'spline', sp: spL, xa: xs[0], xb: xs[a], u0: 0, u1: u1 });
      const c = { type: 'circle', cx: xs[a], cy: ys[a] + R, R: R, u0: u1, u1: u1 + TAU * R };
      pieces.push(c);
      pieces.push({ type: 'spline', sp: spR, xa: xs[a], xb: xs[n - 1], u0: c.u1, u1: c.u1 + xs[n - 1] - xs[a] });
      loop = { at: a, R: R, cx: c.cx, cy: c.cy, xa: xs[a], ya: ys[a], u0: c.u0, uTop: c.u0 + Math.PI * R, u1: c.u1 };
    }
    const U = pieces[pieces.length - 1].u1;
    pieces.forEach(function (p, i) { p.index = i; });

    function pieceAt(u) {
      for (let i = 0; i < pieces.length - 1; i++) if (u < pieces[i].u1) return pieces[i];
      return pieces[pieces.length - 1];
    }
    /** 前進方向 dir 時 u 所在的段（剛好在接點上時：往前用後一段、往後用前一段） */
    function pieceFor(u, dir) {
      const p = pieceAt(u);
      if (dir < 0 && u === p.u0 && p.index > 0) return pieces[p.index - 1];
      return p;
    }
    /**
     * u 處的幾何量：位置、切線 t̂、法線 n̂（t̂ 逆時針轉 90°）、曲率 κ、J = ds/du。
     * 指定 forced（某一段）時，一律用那一段的公式（可稍微超出該段，供 RK4 的中間步使用）。
     */
    function geom(u, forced) {
      let p = forced;
      if (!p) { if (u < 0) u = 0; else if (u > U) u = U; p = pieceAt(u); }
      if (p.type === 'circle') {
        const ph = (u - p.u0) / p.R, s = Math.sin(ph), co = Math.cos(ph);
        return { x: p.cx + p.R * s, y: p.cy - p.R * co, tx: co, ty: s, nx: -s, ny: co, k: 1 / p.R, J: 1, piece: p, phi: ph };
      }
      const x = p.xa + (u - p.u0), e = p.sp.ev(x), J = Math.sqrt(1 + e[1] * e[1]);
      return { x: x, y: e[0], tx: 1 / J, ty: e[1] / J, nx: -e[1] / J, ny: 1 / J, k: e[2] / (J * J * J), J: J, piece: p, slope: e[1] };
    }
    /** 樣條部分的高度 F(x)（迴圈以外；x 在範圍外傳回 NaN） */
    function heightAt(x) {
      if (x < xs[0] - 1e-12 || x > xs[n - 1] + 1e-12) return NaN;
      if (!loop) return pieces[0].sp.ev(x)[0];
      return (x <= loop.xa ? pieces[0] : pieces[2]).sp.ev(x)[0];
    }
    function slopeAt(x) {
      if (!loop) return pieces[0].sp.ev(x)[1];
      return (x <= loop.xa ? pieces[0] : pieces[2]).sp.ev(x)[1];
    }
    /** 樣條部分水平位置 x 對應的 u（迴圈以外的點，x 會限制在軌道範圍內） */
    function uOfX(x) {
      x = Math.max(xs[0], Math.min(xs[n - 1], x));
      if (!loop || x <= loop.xa) return x - xs[0];
      return pieces[2].u0 + (x - loop.xa);
    }
    // 弧長：每段用 10 點高斯－勒讓德積分（樣條段再細分）
    const GLX = [-0.9739065285171717, -0.8650633666889845, -0.6794095682990244, -0.4333953941292472, -0.1488743389816312,
      0.1488743389816312, 0.4333953941292472, 0.6794095682990244, 0.8650633666889845, 0.9739065285171717];
    const GLW = [0.0666713443086881, 0.1494513491505806, 0.2190863625159820, 0.2692667193099963, 0.2955242247147529,
      0.2955242247147529, 0.2692667193099963, 0.2190863625159820, 0.1494513491505806, 0.0666713443086881];
    function splineLen(sp, x0, x1) {
      if (x1 <= x0) return 0;
      const m = Math.max(1, Math.ceil((x1 - x0) / 0.5));
      const h = (x1 - x0) / m;
      let s = 0;
      for (let j = 0; j < m; j++) {
        const a = x0 + j * h, mid = a + h / 2;
        for (let k = 0; k < 10; k++) { const d1 = sp.ev(mid + GLX[k] * h / 2)[1]; s += GLW[k] * h / 2 * Math.sqrt(1 + d1 * d1); }
      }
      return s;
    }
    const sStart = [];
    let acc = 0;
    pieces.forEach(function (p) {
      sStart.push(acc);
      p.len = p.type === 'circle' ? TAU * p.R : splineLen(p.sp, p.xa, p.xb);
      acc += p.len;
    });
    const length = acc;
    /** 從軌道起點量起的弧長 s(u) */
    function arcLength(u) {
      if (u <= 0) return 0;
      if (u >= U) return length;
      for (let i = 0; i < pieces.length; i++) {
        const p = pieces[i];
        if (u < p.u1 || i === pieces.length - 1) {
          return sStart[i] + (p.type === 'circle' ? u - p.u0 : splineLen(p.sp, p.xa, p.xa + (u - p.u0)));
        }
      }
      return length;
    }
    /** 取樣（畫圖與碰撞參考）：每 ds 約 step m 一點；傳回 [{u, x, y}] */
    function sample(step) {
      step = step || 0.05;
      const out = [];
      pieces.forEach(function (p, i) {
        const len = p.u1 - p.u0;
        const m = Math.max(2, Math.ceil((p.type === 'circle' ? len : p.len) / step));
        for (let j = (i === 0 ? 0 : 1); j <= m; j++) {
          const u = p.u0 + len * j / m, gq = geom(u);
          out.push({ u: u, x: gq.x, y: gq.y });
        }
      });
      return out;
    }
    // 最低點（全軌道）：細取樣後用黃金分割法精修
    let uLow = 0, yLow = Infinity;
    pieces.forEach(function (p) {
      if (p.type === 'circle') { if (p.cy - p.R < yLow - 1e-12) { yLow = p.cy - p.R; uLow = p.u0; } return; }
      const m = Math.max(4, Math.ceil((p.xb - p.xa) / 0.02));
      for (let j = 0; j <= m; j++) {
        const x = p.xa + (p.xb - p.xa) * j / m, y = p.sp.ev(x)[0];
        if (y < yLow - 1e-12) { yLow = y; uLow = p.u0 + (x - p.xa); }
      }
    });
    (function refine() {
      const p = pieceAt(uLow);
      if (p.type !== 'spline') return;
      let a = Math.max(p.u0, uLow - 0.03), b = Math.min(p.u1, uLow + 0.03);
      const gr = (Math.sqrt(5) - 1) / 2;
      let c1 = b - gr * (b - a), c2 = a + gr * (b - a);
      let f1 = geom(c1).y, f2 = geom(c2).y;
      for (let it = 0; it < 80; it++) {
        if (f1 < f2) { b = c2; c2 = c1; f2 = f1; c1 = b - gr * (b - a); f1 = geom(c1).y; }
        else { a = c1; c1 = c2; f1 = f2; c2 = a + gr * (b - a); f2 = geom(c2).y; }
      }
      const um = (a + b) / 2, ym = geom(um).y;
      if (ym <= yLow) { uLow = um; yLow = ym; }
    })();
    // 最低點若是迴圈底部，從迴圈出來時（u = loop.u1）也算經過最低點
    const lowMarks = [uLow];
    if (loop && Math.abs(yLow - loop.ya) < 1e-9) {
      lowMarks.length = 0; lowMarks.push(loop.u0, loop.u1); uLow = loop.u0;
    }
    let yMax = -Infinity;
    sample(0.05).forEach(function (q) { if (q.y > yMax) yMax = q.y; });

    return {
      def: def, pts: pts, xs: xs, ys: ys, pieces: pieces, loop: loop, U: U, length: length,
      xMin: xs[0], xMax: xs[n - 1], uLow: uLow, yLow: yLow, lowMarks: lowMarks, yMax: yMax,
      geom: geom, pieceFor: pieceFor, heightAt: heightAt, slopeAt: slopeAt, uOfX: uOfX, arcLength: arcLength, sample: sample
    };
  }

  /**
   * 檢查軌道是否合理：控制點間距、軌道不碰地面也不超出場景、迴圈不被樣條穿過。
   * 傳回 { ok, reason }（reason：'gap' | 'ground' | 'sky' | 'loop' | 'loopTop'）
   */
  function validate(defIn) {
    const def = cleanDef(defIn);
    const pts = def.pts;
    for (let i = 1; i < pts.length; i++) if (pts[i][0] - pts[i - 1][0] < MIN_GAP - 1e-9) return { ok: false, reason: 'gap' };
    for (let i = 0; i < pts.length; i++) {
      if (pts[i][0] < 0.5 - 1e-9 || pts[i][0] > WORLD.W - 0.5 + 1e-9) return { ok: false, reason: 'gap' };
    }
    const tr = buildTrack(def);
    const S = tr.sample(0.04);
    for (let i = 0; i < S.length; i++) {
      if (S[i].y < 0.15) return { ok: false, reason: 'ground' };
      if (S[i].y > WORLD.H - 0.2) return { ok: false, reason: 'sky' };
    }
    if (tr.loop) {
      const L = tr.loop;
      if (L.ya + 2 * L.R > WORLD.H - 0.3) return { ok: false, reason: 'loopTop' };
      if (L.xa - L.R < 0.3 || L.xa + L.R > WORLD.W - 0.3) return { ok: false, reason: 'loop' };
      // 樣條上的點不可進入迴圈內部（底部相切處允許極小的數值誤差）
      for (let i = 0; i < S.length; i++) {
        const q = S[i];
        if (q.u > L.u0 - 1e-9 && q.u < L.u1 + 1e-9) continue;
        const d = Math.hypot(q.x - L.cx, q.y - L.cy);
        if (d < L.R - 1e-4) return { ok: false, reason: 'loop' };
      }
    }
    return { ok: true, reason: '' };
  }

  // ---------------- 運動 ----------------
  /** 每公斤的正向力 N/m = κv² + g cos θ */
  function normalPerKg(G, v, g) { return G.k * v * v + g * G.tx; }

  /**
   * 運動方程式的右邊。ctx = { piece, sgn }：這一步固定在同一段軌道、摩擦力方向固定為 −sgn
   * （速度在步中變號時，由事件處理把步長切在 v = 0 的瞬間，所以步內的方程式是平滑的）。
   * 傳回 [du/dt, dv/dt, dq/dt, d(路程)/dt]。
   */
  function deriv(tr, P, ctx, u, v) {
    const G = tr.geom(u, ctx.piece);
    const N = G.k * v * v + P.g * G.tx;
    const f = P.mu * Math.abs(N);
    return [v / G.J, -P.g * G.ty - f * ctx.sgn, f * v * ctx.sgn, v * ctx.sgn];
  }
  /** 一步 RK4（狀態 u、v、摩擦生熱 q、走過的路程 p） */
  function rk4(tr, P, ctx, s0, h) {
    const u = s0.u, v = s0.v;
    const k1 = deriv(tr, P, ctx, u, v);
    const k2 = deriv(tr, P, ctx, u + h / 2 * k1[0], v + h / 2 * k1[1]);
    const k3 = deriv(tr, P, ctx, u + h / 2 * k2[0], v + h / 2 * k2[1]);
    const k4 = deriv(tr, P, ctx, u + h * k3[0], v + h * k3[1]);
    return {
      u: u + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      v: v + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      q: s0.q + h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
      p: s0.p + h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])
    };
  }
  /** 二分法：f(0) 與 f(h) 異號時，找出 f 變號的時刻（傳回已變號那一側的 τ） */
  function bisect(f, h, f0) {
    let lo = 0, hi = h;
    const s0 = f0 === undefined ? Math.sign(f(0)) : Math.sign(f0);
    for (let i = 0; i < 64 && hi - lo > 1e-13; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if (Math.sign(fm) === s0 && fm !== 0) lo = mid; else hi = mid;
    }
    return hi;
  }

  /**
   * 建立一次模擬。P = { g, mu, mode: 'rail' | 'free', x0, v0 }（x0：起點水平位置；或直接給 u0）
   * 狀態 phase：'track'（在軌道上）、'air'（拋體）、'stopped'（因摩擦停住）、'landed'（落地）、'crashed'、'out'（飛出場景）
   */
  function createSim(tr, P) {
    const u = P.u0 != null ? Math.max(0, Math.min(tr.U, P.u0)) : tr.uOfX(P.x0 == null ? tr.xMin : P.x0);
    const v = +P.v0 || 0;
    const G = tr.geom(u);
    const sim = {
      phase: 'track', t: 0, u: u, v: v, q: 0, qi: 0,
      dir: v > 0 ? 1 : v < 0 ? -1 : (G.ty > 0 ? -1 : G.ty < 0 ? 1 : 0),
      air: null, loopIn: false, ntop: NaN, nMinLoop: Infinity, path: 0, flights: 0,
      start: { u: u, x: G.x, y: G.y, v: v }
    };
    sim.e0 = 0.5 * v * v + P.g * G.y;
    // 一開始就靜止在摩擦力撐得住的斜坡上：直接停住
    if (v === 0 && P.mu > 0 && Math.abs(G.ty) <= P.mu * Math.abs(G.tx) + 1e-15) sim.phase = 'stopped';
    return sim;
  }

  /** 目前位置與速度（拋體時用解析解） */
  function kinematics(tr, P, sim) {
    if (sim.phase === 'air' || ((sim.phase === 'landed' || sim.phase === 'crashed' || sim.phase === 'out') && sim.air)) {
      const a = sim.air, tau = a.tau;
      const vy = a.vy - P.g * tau;
      const moving = sim.phase === 'air';
      return {
        x: a.x0 + a.vx * tau, y: Math.max(sim.phase === 'landed' ? 0 : -Infinity, a.y0 + a.vy * tau - 0.5 * P.g * tau * tau),
        vx: moving ? a.vx : 0, vy: moving ? vy : 0, speed: moving ? Math.hypot(a.vx, vy) : 0,
        onTrack: false, N: 0, tx: a.vx / (Math.hypot(a.vx, vy) || 1), ty: vy / (Math.hypot(a.vx, vy) || 1)
      };
    }
    const G = tr.geom(sim.u), v = sim.phase === 'track' ? sim.v : 0;
    return {
      x: G.x, y: G.y, vx: v * G.tx, vy: v * G.ty, speed: Math.abs(v), onTrack: true,
      N: normalPerKg(G, v, P.g), tx: G.tx, ty: G.ty, nx: G.nx, ny: G.ny, k: G.k, G: G
    };
  }

  /** 每公斤的能量（位能零點在 y = 0）：k 動能、u 位能、q 摩擦生熱、qi 撞擊生熱、e 總和 */
  function specificEnergy(tr, P, sim) {
    const K = kinematics(tr, P, sim);
    const k = 0.5 * K.speed * K.speed, u = P.g * K.y;
    return { k: k, u: u, q: sim.q, qi: sim.qi, e: k + u + sim.q + sim.qi, y: K.y };
  }

  /** 換算成焦耳：質量 m（kg）、位能零點 yref（m） */
  function energies(tr, P, sim, m, yref) {
    const s = specificEnergy(tr, P, sim);
    const K = m * s.k, U = m * P.g * (s.y - (yref || 0)), Qf = m * s.q, Qi = m * s.qi;
    return { K: K, U: U, Qf: Qf, Qi: Qi, Q: Qf + Qi, E: K + U + Qf + Qi, Emech: K + U };
  }

  function loopInfo(tr, G) {
    if (!tr.loop || !G || G.piece.type !== 'circle') return { inLoop: false };
    return { inLoop: true, phi: G.phi, yRel: G.y - tr.loop.ya };
  }

  /** 軌道上前進一步（最多 h）；傳回實際前進的時間。事件放進 evs。 */
  function trackStep(tr, P, sim, h, evs) {
    const s0 = { u: sim.u, v: sim.v, q: sim.q, p: sim.path };
    const sgn = s0.v > 0 ? 1 : s0.v < 0 ? -1 : sim.dir;
    const piece = tr.pieceFor(s0.u, sgn || 1);
    const ctx = { piece: piece, sgn: sgn || 0 };
    const G0 = tr.geom(s0.u, piece);
    // 自由小車：一開始正向力就是負的 → 立刻離軌
    if (P.mode === 'free' && normalPerKg(G0, s0.v, P.g) < 0) {
      launch(tr, P, sim, G0, s0.v, false, evs);
      return 0;
    }
    // 靜止在完全水平處、沒有任何力讓它動：停住
    if (!sgn) {
      sim.phase = 'stopped'; sim.v = 0;
      evs.push(Object.assign({ type: 'stop', t: sim.t, u: sim.u, x: G0.x, y: G0.y, slope: G0.ty / G0.tx, path: sim.path }, loopInfo(tr, G0)));
      return 0;
    }
    const s1 = rk4(tr, P, ctx, s0, h);
    let tEv = Infinity, kind = null, bound = 0;
    // 1. 到達這一段的端點（軌道末端或迴圈的接點）
    if (s1.u < piece.u0 || s1.u > piece.u1) {
      const b = s1.u < piece.u0 ? piece.u0 : piece.u1;
      const tau = bisect(function (t) { return rk4(tr, P, ctx, s0, t).u - b; }, h, s0.u - b);
      if (tau < tEv) { tEv = tau; bound = b; kind = (b === 0 || b === tr.U) ? 'end' : 'junction'; }
    }
    // 2. 自由小車：正向力變成負的
    if (P.mode === 'free') {
      const fN = function (t) { const s = rk4(tr, P, ctx, s0, t); return normalPerKg(tr.geom(s.u, piece), s.v, P.g); };
      if (fN(h) < 0) {
        const tau = bisect(fN, h, normalPerKg(G0, s0.v, P.g) || 1);
        if (tau < tEv) { tEv = tau; kind = 'detach'; }
      }
    }
    // 3. 速度變號（折返；有摩擦時可能停住）
    if (s1.v * sgn <= 0) {
      const tau = bisect(function (t) { return rk4(tr, P, ctx, s0, t).v * sgn; }, h, 1);
      if (tau < tEv) { tEv = tau; kind = 'vzero'; }
    }
    const tStep = kind ? tEv : h;
    const se = kind ? rk4(tr, P, ctx, s0, tEv) : s1;
    if (kind === 'end' || kind === 'junction') se.u = bound;
    if (kind === 'vzero') se.v = 0;
    passes(tr, P, sim, ctx, s0, se, tStep, evs);
    sim.u = se.u; sim.v = se.v; sim.q = se.q; sim.path = se.p; sim.t += tStep;
    if (sim.v !== 0) sim.dir = sim.v > 0 ? 1 : -1;
    // 迴圈中正向力的最小值（每公斤）
    if (tr.loop && sim.loopIn) {
      const N = normalPerKg(tr.geom(sim.u, piece), sim.v, P.g);
      if (N < sim.nMinLoop) sim.nMinLoop = N;
    }
    if (!kind || kind === 'junction') return tStep;
    const G = tr.geom(sim.u, piece);
    if (kind === 'end' || kind === 'detach') {
      launch(tr, P, sim, G, sim.v, kind === 'end', evs);
    } else { // vzero
      const stick = Math.abs(G.ty) <= P.mu * Math.abs(G.tx) + 1e-15;
      if (P.mode === 'free' && normalPerKg(G, 0, P.g) < 0) launch(tr, P, sim, G, 0, false, evs);
      else if (stick) {
        sim.phase = 'stopped';
        sim.loopIn = false;
        evs.push(Object.assign({ type: 'stop', t: sim.t, u: sim.u, x: G.x, y: G.y, slope: G.ty / G.tx, path: sim.path }, loopInfo(tr, G)));
      } else {
        sim.dir = G.ty > 0 ? -1 : 1; // 從靜止開始往下坡方向滑
        evs.push(Object.assign({ type: 'turn', t: sim.t, u: sim.u, x: G.x, y: G.y }, loopInfo(tr, G)));
      }
    }
    return tStep;
  }

  /** 檢查這一步是否經過最低點、迴圈入口、頂點、出口（用二分法找出經過的瞬間來回報） */
  function passes(tr, P, sim, ctx, s0, s1, h, evs) {
    const at = function (mark) {
      const tau = bisect(function (t) { return rk4(tr, P, ctx, s0, t).u - mark; }, h, s0.u - mark);
      const s = rk4(tr, P, ctx, s0, tau);
      return { tau: tau, s: s, G: tr.geom(mark, ctx.piece) };
    };
    const crossed = function (mark) { return (s0.u - mark) * (s1.u - mark) < 0 || (s1.u === mark && s0.u !== mark); };
    const list = [];
    tr.lowMarks.forEach(function (m) { if (crossed(m)) list.push(['bottom', m]); });
    if (tr.loop) {
      const L = tr.loop;
      if (crossed(L.u0)) list.push(['loop0', L.u0]);
      if (crossed(L.uTop)) list.push(['top', L.uTop]);
      if (crossed(L.u1)) list.push(['loop1', L.u1]);
    }
    if (!list.length) return;
    const fwd = s1.u > s0.u;
    list.sort(function (a, b) { return fwd ? a[1] - b[1] : b[1] - a[1]; });
    list.forEach(function (it) {
      const r = at(it[1]);
      const v = r.s.v, t = sim.t + r.tau;
      if (it[0] === 'bottom') {
        evs.push({ type: 'bottom', t: t, u: it[1], x: r.G.x, y: r.G.y, v: Math.abs(v), q: r.s.q });
      } else if (it[0] === 'loop0') {
        // 由迴圈入口（底部）往前進入；倒退經過則離開迴圈
        if (fwd) {
          sim.loopIn = true; sim.ntop = NaN;
          sim.nMinLoop = normalPerKg(tr.geom(it[1], tr.pieces[1]), v, P.g); // 剛進入圓形段（曲率 1/R）
          evs.push({ type: 'loopIn', t: t, v: Math.abs(v) });
        } else sim.loopIn = false;
      } else if (it[0] === 'top') {
        if (fwd && sim.loopIn) {
          const N = normalPerKg(r.G, v, P.g);
          sim.ntop = N;
          evs.push({ type: 'loopTop', t: t, v: Math.abs(v), N: N, nmg: N / P.g, q: r.s.q });
        }
      } else if (it[0] === 'loop1') {
        if (fwd && sim.loopIn) {
          sim.loopIn = false;
          evs.push({ type: 'loopDone', t: t, v: Math.abs(v), ntop: sim.ntop, ntopMg: sim.ntop / P.g, nMinMg: Math.min(sim.nMinLoop, sim.ntop) / P.g, q: r.s.q });
        } else sim.loopIn = false;
      }
    });
  }

  /** 離開軌道（末端或正向力 < 0）：變成拋體 */
  function launch(tr, P, sim, G, v, fromEnd, evs) {
    sim.phase = 'air';
    sim.loopIn = false;
    sim.flights++;
    sim.air = { x0: G.x, y0: G.y, vx: v * G.tx, vy: v * G.ty, tau: 0, fromEnd: fromEnd, u: sim.u, t0: sim.t, yTop: G.y };
    evs.push(Object.assign({ type: fromEnd ? 'leave' : 'detach', t: sim.t, u: sim.u, x: G.x, y: G.y, v: Math.abs(v), vx: v * G.tx, vy: v * G.ty },
      loopInfo(tr, G)));
  }

  /** 拋體：前進一小步，檢查落地、撞回軌道、飛出場景 */
  function airStep(tr, P, sim, h, evs) {
    const a = sim.air, g = P.g;
    const pos = function (tau) { return [a.x0 + a.vx * tau, a.y0 + a.vy * tau - 0.5 * g * tau * tau]; };
    // 與樣條部分的垂直距離（正 = 在軌道上方）；不在範圍內為 NaN
    const dS = function (tau) { const p = pos(tau), F = tr.heightAt(p[0]); return isNaN(F) ? NaN : p[1] - F; };
    // 與圓形迴圈的距離（正 = 在圈內）
    const dC = tr.loop ? function (tau) { const p = pos(tau); return tr.loop.R - Math.hypot(p[0] - tr.loop.cx, p[1] - tr.loop.cy); } : null;
    const ta = a.tau, tb = ta + h;
    let tHit = Infinity, kind = null;
    // 地面 y = 0
    const yb = pos(tb)[1];
    if (yb <= 0) {
      const A = -0.5 * g, B = a.vy, C = a.y0;
      const disc = B * B - 4 * A * C;
      const tg = (-B - Math.sqrt(Math.max(0, disc))) / (2 * A);
      const tt = Math.max(ta, Math.min(tb, tg));
      if (tt < tHit) { tHit = tt; kind = 'ground'; }
    }
    const EPS = 1e-9;
    const refine = function (f, lo, hi) {
      const flo = f(lo);
      for (let i = 0; i < 80 && hi - lo > 1e-14; i++) {
        const mid = (lo + hi) / 2, fm = f(mid);
        if (Math.sign(fm) === Math.sign(flo) && fm !== 0) lo = mid; else hi = mid;
      }
      return hi;
    };
    // 樣條
    const sa = dS(ta), sb = dS(tb);
    if (!isNaN(sa) && !isNaN(sb)) {
      // 剛離開軌道時兩者重合（dS ≈ 0，正負號只是捨入誤差）：找「低於軌道 1.5 nm」的瞬間，避免在出發點立刻判定落回
      if (sa >= -EPS && sb < -2 * EPS) { const tt = refine(function (t) { return dS(t) + 1.5 * EPS; }, ta, tb); if (tt < tHit) { tHit = tt; kind = 'track'; } }
      else if (sa < -1e-6 && sb > 1e-6) { const tt = refine(dS, ta, tb); if (tt < tHit) { tHit = tt; kind = 'crash'; } }
    }
    // 迴圈
    if (dC) {
      const ca = dC(ta), cb = dC(tb);
      if (ca >= -EPS && cb < -2 * EPS) { const tt = refine(function (t) { return dC(t) + 1.5 * EPS; }, ta, tb); if (tt < tHit) { tHit = tt; kind = 'loop'; } }
      else if (ca < -1e-6 && cb > 1e-6) { const tt = refine(dC, ta, tb); if (tt < tHit) { tHit = tt; kind = 'crash'; } }
    }
    const step = Math.min(tHit, tb) - ta;
    a.tau = Math.min(tHit, tb);
    sim.t += step;
    const p = pos(a.tau), vx = a.vx, vy = a.vy - g * a.tau;
    if (p[1] > a.yTop) a.yTop = p[1];
    // 頂點（vy 由正變負）
    if (a.vy - g * ta > 0 && vy <= 0) a.yTop = Math.max(a.yTop, a.y0 + a.vy * a.vy / (2 * g));
    sim.path += Math.hypot(p[0] - pos(ta)[0], p[1] - pos(ta)[1]);
    if (!kind) {
      if (p[0] < -0.5 || p[0] > WORLD.W + 0.5) {
        sim.phase = 'out';
        evs.push({ type: 'out', t: sim.t, x: p[0], y: p[1], v: Math.hypot(vx, vy), flight: a.tau, fromEnd: a.fromEnd, yTop: a.yTop });
      }
      return step;
    }
    const speed = Math.hypot(vx, vy);
    if (kind === 'ground') {
      a.tau = tHit;
      sim.qi += 0.5 * speed * speed; // 動能全部變成撞擊時的熱與聲音
      sim.phase = 'landed';
      evs.push({ type: 'land', t: sim.t, x: p[0], y: 0, v: speed, vx: vx, vy: vy, flight: a.tau, fromEnd: a.fromEnd, yTop: a.yTop });
      return step;
    }
    if (kind === 'crash') {
      sim.qi += 0.5 * speed * speed;
      sim.phase = 'crashed';
      evs.push({ type: 'crash', t: sim.t, x: p[0], y: p[1], v: speed, flight: a.tau });
      return step;
    }
    // 落回軌道：找出對應的 u，保留切線速度，法線速度損失（完全非彈性）
    let u;
    if (kind === 'loop') {
      const L = tr.loop;
      let ph = Math.atan2(p[0] - L.cx, -(p[1] - L.cy));
      if (ph < 0) ph += TAU;
      u = L.u0 + L.R * ph;
    } else u = tr.uOfX(p[0]);
    const G = tr.geom(u);
    const vt = vx * G.tx + vy * G.ty, vn = vx * G.nx + vy * G.ny;
    sim.qi += 0.5 * vn * vn;
    sim.phase = 'track';
    sim.u = u; sim.v = vt;
    sim.dir = vt > 0 ? 1 : vt < 0 ? -1 : (G.ty > 0 ? -1 : 1);
    const flight = a.tau;
    evs.push(Object.assign({ type: 'attach', t: sim.t, u: u, x: G.x, y: G.y, vn: Math.abs(vn), vt: vt, v: speed, flight: flight, yTop: a.yTop }, loopInfo(tr, G)));
    // 落回迴圈內側的底部附近：重新設定迴圈狀態（不算完整繞一圈）
    sim.loopIn = false;
    return step;
  }

  /** 讓模擬前進 dt 秒；傳回這段時間發生的事件 */
  function advance(tr, P, sim, dt) {
    const evs = [];
    let rem = dt, guard = 0, idle = 0;
    while (rem > 1e-12 && guard++ < 200000) {
      let st;
      if (sim.phase === 'track') st = trackStep(tr, P, sim, Math.min(H_STEP, rem), evs);
      else if (sim.phase === 'air') st = airStep(tr, P, sim, Math.min(H_AIR, rem), evs);
      else break;
      rem -= st;
      if (st > 1e-13) idle = 0; else if (++idle > 50) break; // 安全保護：連續很多步時間都沒前進（不應發生）
    }
    return evs;
  }

  /** 一直跑到結束（停住、落地、飛出）或到 tMax；傳回所有事件（測試與任務證明用） */
  function run(tr, P, tMax, sim) {
    sim = sim || createSim(tr, P);
    const evs = [];
    while (tMax - sim.t > 1e-9 && (sim.phase === 'track' || sim.phase === 'air')) {
      const t0 = sim.t;
      const e = advance(tr, P, sim, Math.min(0.05, tMax - sim.t));
      for (let i = 0; i < e.length; i++) evs.push(e[i]);
      if (sim.t === t0 && (sim.phase === 'track' || sim.phase === 'air')) break; // 安全保護：時間沒有前進就停（不應發生）
    }
    return { sim: sim, events: evs };
  }

  // ---------------- 解析結果（說明與測試用） ----------------
  /** 由靜止從高度差 h 滑下（無摩擦）的速率 √(v₀² + 2gh) */
  function speedFromDrop(g, h, v0) { return Math.sqrt((v0 || 0) * (v0 || 0) + 2 * g * h); }
  /** 自由小車通過圓形迴圈頂點所需的最小釋放高度（相對迴圈底部，無摩擦）：2.5R */
  function loopCriticalHeight(R) { return 2.5 * R; }
  /** 自由小車由高度 h（相對迴圈底部，R < h < 2.5R）出發，在迴圈中離軌的高度（相對底部）：(R + 2h)/3 */
  function loopDetachHeight(R, h) { return (R + 2 * h) / 3; }

  const api = {
    G_PRESETS: G_PRESETS, WORLD: WORLD, PRESETS: PRESETS, H_STEP: H_STEP, MIN_GAP: MIN_GAP,
    spline: spline, buildTrack: buildTrack, validate: validate,
    createSim: createSim, advance: advance, run: run, kinematics: kinematics,
    specificEnergy: specificEnergy, energies: energies, normalPerKg: normalPerKg,
    speedFromDrop: speedFromDrop, loopCriticalHeight: loopCriticalHeight, loopDetachHeight: loopDetachHeight
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoasterCore = api;
})(typeof window !== 'undefined' ? window : this);
