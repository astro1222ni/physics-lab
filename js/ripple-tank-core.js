/*
 * ripple-tank-core.js — 「水波槽實驗」的物理核心（與畫面無關，可在 Node 單獨測試）
 *
 * 單位與座標：
 *   長度 m、時間 s、頻率 Hz；水面高度 u 以 mm 儲存（數值約 0.1，float32 也很精確）。
 *   水槽內部（可以裝水的區域）為 0 ≤ x ≤ W、0 ≤ y ≤ H，x 向右、y 向上（俯視）。
 *
 * 1. 水波的色散關係（重力＋表面張力，有限水深）：
 *      ω² = (g k + σ k³ / ρ) · tanh(k h)
 *    頻率 f 由起波器決定，在不同水深處都相同；由上式解出波數 k，得到
 *      波長 λ = 2π / k、波速（相速度）v = ω / k = f λ。
 *    水愈淺 tanh(kh) 愈小 → k 愈大 → 波長愈短、波速愈慢（淺水極限 v → √(g h)）。
 *
 * 2. 水面的波動方程式（線性、深度可變）：
 *      ∂²u/∂t² + σ_d ∂u/∂t = ∇·( c² ∇u )
 *    c(x, y) 取該處水深在起波器頻率下的相速度，所以每一處的波長都等於色散關係的波長；
 *    波從深水進入淺水時頻率不變、波速改變，折射（司乃耳定律）、反射、繞射、干涉都由方程式自然產生。
 *    數值方法：方格有限差分（5 點拉普拉斯）＋蛙跳法（leapfrog）。
 *      - 方格間距 dx 取最短波長的 1/12（自動調整，格子數有上限，平板電腦也跑得動）。
 *      - 時間步長 dt = T/N（N 為整數），閃頻儀取樣時相位完全一致。
 *      - 數值色散補償：c_數值 = (dx/dt)·sin(ω dt/2) / sin(k dx/2)，使方格上沿座標軸傳播的波長
 *        精確等於色散關係的波長（斜向傳播的誤差約 0.3%）。
 *      - 障礙物（高出水面的壓克力塊、長條、圓弧）：固體格子；與水交界的面通量為 0
 *        → 牆面法向斜率為 0，波完全反射。槽壁也是如此。
 *      - 海綿（消波）：槽壁內側 3 cm 的吸收層，阻尼由 0 平滑增加。
 *      - 阻尼 σ_d：水的黏滯 4νk² 加上槽底邊界層 2k√(νω/2)/sinh(2kh)（振幅衰減率的 2 倍）。
 *      - 起波器：直線起波器是一整排格子、圓形起波器是半徑 4 mm 的圓盤，強制上下振動
 *        u = A sin(ωt)（開始的 1.5 個週期振幅平滑增加）。
 *
 * 3. 投影（強光源在上方，水波槽下方的白紙）：
 *    水面像許多小透鏡：波峰向上凸，是會聚透鏡 → 白紙上的亮紋；波谷像發散透鏡 → 暗紋。
 *    光線通過斜率 ∇u 的水面後偏折 (1 − 1/n)∇u，走到下方距離 d 的白紙上，橫向位移 κ∇u，κ = d(1 − 1/n)。
 *    能量守恆（面積比）得到亮度 I = 1 / (1 + κ ∇²u)；|κ∇²u| 接近 1 時是焦散線（很亮的細線）。
 *    點光源（燈在水面上方 L 處）時，紙上的影像是水面放大 M = (L + d) / L 倍的相似形：
 *    長度都放大 M 倍、角度不變。紙上相鄰亮紋的間距 = M λ。
 */
(function (root) {
  'use strict';

  const G = 9.8;          // m/s²
  const SIGMA = 0.0728;   // N/m，水的表面張力（20 °C）
  const RHO = 998;        // kg/m³
  const NU = 1.0e-6;      // m²/s，水的運動黏滯係數
  const N_WATER = 1.333;  // 水的折射率
  const DEG = Math.PI / 180;

  /** 水波槽的固定尺寸（m） */
  const TANK = {
    W: 0.36, H: 0.27,     // 內部可以裝水的範圍（4 : 3）
    sponge: 0.03,         // 海綿（吸收層）寬度
    paper: 0.25,          // 水面到下方白紙的距離
    wall: 0.045,          // 槽壁高度
    bar: 0.042,           // 直線起波器的位置（x）
    dipR: 0.004           // 圓形起波器（小球）的半徑
  };

  // ======================================================================
  // 1. 色散關係
  // ======================================================================
  function opt(o, key, def) { return o && o[key] != null ? o[key] : def; }
  /** 角頻率 ω(k, h)（rad/s）。o.sigma = 0 可關掉表面張力、o.g 可改重力（測試用）。 */
  function omegaOf(k, h, o) {
    const g = opt(o, 'g', G), s = opt(o, 'sigma', SIGMA);
    return Math.sqrt((g * k + s * k * k * k / RHO) * Math.tanh(k * h));
  }
  /** 頻率 f、水深 h 時的波數 k（rad/m）：ω(k) 對 k 單調遞增，用二分法解 */
  function waveNumber(f, h, o) {
    const w = 2 * Math.PI * f;
    if (!(w > 0) || !(h > 0)) return NaN;
    let lo = 0, hi = 1;
    while (omegaOf(hi, h, o) < w) { lo = hi; hi *= 2; if (hi > 1e9) return NaN; }
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      if (omegaOf(mid, h, o) < w) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }
  function wavelength(f, h, o) { return 2 * Math.PI / waveNumber(f, h, o); }
  function phaseSpeed(f, h, o) { return f * wavelength(f, h, o); }
  /** 群速度 dω/dk（數值微分；能量傳播的速度） */
  function groupSpeed(f, h, o) {
    const k = waveNumber(f, h, o), dk = k * 1e-5;
    return (omegaOf(k + dk, h, o) - omegaOf(k - dk, h, o)) / (2 * dk);
  }
  /** 淺水長波的波速 √(g h) */
  function shallowSpeed(h) { return Math.sqrt(G * h); }

  // ======================================================================
  // 2. 幾何光學式的關係（給讀數、分析與任務用）
  // ======================================================================
  /** 司乃耳定律 sinθ1 / v1 = sinθ2 / v2；全反射時傳回 NaN（θ 為弧度，由法線量起） */
  function snell(theta1, v1, v2) {
    const s = Math.sin(theta1) * v2 / v1;
    return Math.abs(s) > 1 ? NaN : Math.asin(s);
  }
  function criticalAngle(v1, v2) { return v2 > v1 ? Math.asin(v1 / v2) : NaN; }
  /** 點光源在水面上方 L、白紙在水面下方 d：紙上影像的放大率；L = Infinity 為平行光 */
  function magnification(L, d) { return isFinite(L) ? (L + d) / L : 1; }
  /** 兩同相點波源相距 d、波長 λ：節線（|Δ| = (n − ½)λ < d）與腹線（|Δ| = nλ ≤ d，含中垂線）的條數 */
  function nodalLineCount(d, lam) { return 2 * Math.floor(d / lam + 0.5); }
  function antinodalLineCount(d, lam) { return 2 * Math.floor(d / lam) + 1; }
  /** 凹面圓弧反射鏡（半徑 R）的焦距：近軸近似 R/2 */
  function focalLength(R) { return R / 2; }

  /** 過原點的最佳直線 y = m x（最小平方法）；r2 為決定係數 */
  function fitThroughOrigin(xs, ys) {
    let sxy = 0, sxx = 0;
    for (let i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
    if (!(sxx > 0)) return null;
    const m = sxy / sxx;
    return { m: m, b: 0, r2: rSquared(xs, ys, m, 0) };
  }
  /** 最佳直線 y = m x + b */
  function fitLine(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const den = n * sxx - sx * sx;
    if (!(Math.abs(den) > 1e-15)) return null;
    const m = (n * sxy - sx * sy) / den, b = (sy - m * sx) / n;
    return { m: m, b: b, r2: rSquared(xs, ys, m, b) };
  }
  function rSquared(xs, ys, m, b) {
    const n = xs.length;
    let my = 0;
    for (let i = 0; i < n; i++) my += ys[i];
    my /= n;
    let ss = 0, sr = 0;
    for (let i = 0; i < n; i++) { ss += (ys[i] - my) * (ys[i] - my); sr += (ys[i] - m * xs[i] - b) * (ys[i] - m * xs[i] - b); }
    return ss > 0 ? 1 - sr / ss : 1;
  }

  // ======================================================================
  // 3. 場景（水深、障礙物、起波器）
  // ======================================================================
  /*
   * scene = {
   *   W, H,                     水槽內部尺寸（m）
   *   f,                        起波器的真實頻率（Hz）
   *   h,                        水槽中央的水深（m）
   *   tiltX, tiltY,             槽底傾斜（rad）：水深 = h + (x − W/2) tan(tiltX) + (y − H/2) tan(tiltY)
   *   sponge,                   是否放海綿（吸收層）
   *   amp,                      起波器振幅（mm）
   *   source: { type: 'bar' | 'point' | 'pair' | 'none', x, y, d }
   *                             bar：x 處的一整排；point：(x, y)；pair：(x, y ± d/2)
   *   solids: [ { kind: 'rect', cx, cy, len, thick, ang } | { kind: 'arc', cx, cy, R, half, thick, ang } ]
   *                             rect：長邊方向與 +x 軸夾 ang；arc：圓心 (cx, cy)、半徑 R、對稱軸方向 ang、張角 ±half
   *   plate: { cx, cy, w, len, ang, h2 } | null
   *                             薄壓克力板（淺水區）：寬 w（沿 ang 方向）、長 len；板上方水深 h2（在水槽中央的值）
   * }
   */
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function inRect(o, x, y) {
    const c = Math.cos(o.ang), s = Math.sin(o.ang), dx = x - o.cx, dy = y - o.cy;
    return Math.abs(dx * c + dy * s) <= o.len / 2 && Math.abs(-dx * s + dy * c) <= o.thick / 2;
  }
  function inArc(o, x, y) {
    const dx = x - o.cx, dy = y - o.cy, r = Math.hypot(dx, dy);
    if (Math.abs(r - o.R) > o.thick / 2) return false;
    return Math.abs(wrapPi(Math.atan2(dy, dx) - o.ang)) <= o.half;
  }
  function inSolid(scene, x, y) {
    const list = scene.solids || [];
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.kind === 'rect' ? inRect(o, x, y) : inArc(o, x, y)) return true;
    }
    return false;
  }
  function inPlate(p, x, y) {
    if (!p) return false;
    const c = Math.cos(p.ang), s = Math.sin(p.ang), dx = x - p.cx, dy = y - p.cy;
    return Math.abs(dx * c + dy * s) <= p.w / 2 && Math.abs(-dx * s + dy * c) <= p.len / 2;
  }
  const H_MIN = 0.0003; // m：水深下限（板子露出水面時仍保留極薄的水層）
  function baseDepth(scene, x, y) {
    return scene.h + (x - scene.W / 2) * Math.tan(scene.tiltX || 0) + (y - scene.H / 2) * Math.tan(scene.tiltY || 0);
  }
  /** (x, y) 處的水深（m） */
  function depthAt(scene, x, y) {
    let h = baseDepth(scene, x, y);
    if (scene.plate && inPlate(scene.plate, x, y)) h -= scene.h - scene.plate.h2;
    return Math.max(H_MIN, h);
  }
  /** 場景中可能出現的最淺與最深水深 */
  function depthRange(scene) {
    let lo = Infinity, hi = -Infinity;
    [[0, 0], [scene.W, 0], [0, scene.H], [scene.W, scene.H]].forEach(function (p) {
      const h = baseDepth(scene, p[0], p[1]);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    });
    if (scene.plate) lo -= scene.h - scene.plate.h2;
    return { min: Math.max(H_MIN, lo), max: Math.max(H_MIN, hi) };
  }

  // ======================================================================
  // 4. 波動方程式的數值解
  // ======================================================================
  /**
   * 建立模擬。o = { ppw（每個最短波長的格數，預設 12）, maxCells（格子數上限，預設 90000）,
   *                 courant（預設 0.6）, pmlK（海綿吸收層的強度，預設 9）,
   *                 filter（格子尺度雜訊的濾波強度，預設 0.2；0 = 關閉）}
   * 頻率、水深、傾斜改變時要重新建立；只移動障礙物或壓克力板時用 sim.setGeometry(scene) 即可（波不會中斷）。
   */
  function createSim(scene, o) {
    o = o || {};
    const ppw = opt(o, 'ppw', 12), maxCells = opt(o, 'maxCells', 90000), courant = opt(o, 'courant', 0.6);
    const pmlK = opt(o, 'pmlK', 9);
    const filt = opt(o, 'filter', 0.2);
    const W = scene.W, H = scene.H;
    const f = scene.f, w = 2 * Math.PI * f, T = 1 / f;
    const dr = depthRange(scene);
    const lamMin = wavelength(f, dr.min);
    let dx = Math.max(lamMin / ppw, Math.sqrt(W * H / maxCells));
    // 方格：nx 為 4 的倍數、ny = nx·H/W（W : H = 4 : 3 時剛好是正方形格子）
    const nx = Math.max(8, 4 * Math.ceil(W / dx / 4));
    dx = W / nx;
    const ny = Math.max(6, Math.round(H / dx));
    const NX = nx + 2, NY = ny + 2, N = NX * NY;

    // 水深 → 波數的查表（水深在 [min, max] 之間線性內插）
    const TB = 160;
    const tabK = new Float64Array(TB);
    const hLo = dr.min, hHi = Math.max(dr.max, dr.min * 1.0001);
    for (let i = 0; i < TB; i++) tabK[i] = waveNumber(f, hLo + (hHi - hLo) * i / (TB - 1));
    function kAt(h) {
      const s = Math.max(0, Math.min(TB - 1, (h - hLo) / (hHi - hLo) * (TB - 1)));
      const i = Math.min(TB - 2, Math.floor(s)), u = s - i;
      return tabK[i] * (1 - u) + tabK[i + 1] * u;
    }
    const cMax = w / waveNumber(f, hHi);
    // 時間步長：一個週期剛好 nT 步（閃頻儀取樣時相位一致）
    const dtMax = courant * dx / (cMax * Math.SQRT2);
    const nT = Math.max(8, Math.ceil(T / dtMax));
    const dt = T / nT;
    const r2 = (dt / dx) * (dt / dx);
    // 海綿：完美匹配層（PML，二階波動方程式的 Grote–Sim 形式）。ζ 由牆邊的 ζmax 以平方遞減到 0；
    // 一趟來回的振幅衰減約 exp(−2ζmax·L / 3c) = e^(−2·pmlK/3)
    const sigPML = pmlK * cMax / TANK.sponge;

    const sim = {
      scene: scene, W: W, H: H, f: f, omega: w, T: T,
      nx: nx, ny: ny, NX: NX, NY: NY, dx: dx, dt: dt, stepsPerPeriod: nT,
      lamMin: lamMin, ppw: lamMin / dx,
      u: new Float32Array(N), up: new Float32Array(N), un: new Float32Array(N),
      fx: new Float32Array(N), fy: new Float32Array(N),
      A: new Float32Array(N), B: new Float32Array(N), Dc: new Float32Array(N),
      solid: new Uint8Array(N), plateMask: new Uint8Array(N),
      depth: new Float32Array(N), c2: new Float32Array(N), sigma: new Float32Array(N),
      src: new Int32Array(0),
      // 吸收層的輔助通量（在格子的 +x、+y 邊上；全格大小，移動障礙物時保留）
      px: new Float32Array(N), py: new Float32Array(N), pxa: new Float32Array(N), pya: new Float32Array(N), stripK: new Int32Array(0), stripC: new Float32Array(0),
      n: 0, t: 0,
      // 每個週期在固定的 4 個相位濾掉格子尺度的雜訊（閃頻取樣仍然每週期相同）
      filterEvery: Math.max(4, Math.round(nT / 4)), filterEps: filt,
      kAt: kAt
    };
    /** 格子中心的座標（m） */
    sim.xOf = function (i) { return (i - 0.5) * dx; };   // i = 1 … nx（含外框的索引）
    sim.yOf = function (j) { return (j - 0.5) * dx; };
    sim.index = function (x, y) {
      const i = Math.floor(x / dx) + 1, j = Math.floor(y / dx) + 1;
      if (i < 1 || i > nx || j < 1 || j > ny) return -1;
      return j * NX + i;
    };
    /** 以雙線性內插取 (x, y) 處的值（field 預設為目前的水面高度，mm） */
    sim.sample = function (x, y, field) {
      const F = field || sim.u;
      let gx = x / dx + 0.5, gy = y / dx + 0.5;
      gx = Math.max(1, Math.min(nx, gx)); gy = Math.max(1, Math.min(ny, gy));
      const i = Math.min(nx - 1, Math.floor(gx)), j = Math.min(ny - 1, Math.floor(gy));
      const a = gx - i, b = gy - j, k = j * NX + i;
      return (F[k] * (1 - a) + F[k + 1] * a) * (1 - b) + (F[k + NX] * (1 - a) + F[k + NX + 1] * a) * b;
    };

    /** 重新計算障礙物、壓克力板、海綿、起波器（不改變方格與時間步長，波面保留） */
    sim.setGeometry = function (sc) {
      sim.scene = sc;
      const solid = sim.solid, depth = sim.depth, c2 = sim.c2, sig = sim.sigma, pm = sim.plateMask;
      const spW = TANK.sponge;
      const sqVisc = Math.sqrt(NU * w / 2);
      solid.fill(1);
      for (let j = 1; j <= ny; j++) {
        const y = (j - 0.5) * dx;
        for (let i = 1; i <= nx; i++) {
          const x = (i - 0.5) * dx, k = j * NX + i;
          if (inSolid(sc, x, y)) { solid[k] = 1; depth[k] = 0; c2[k] = 0; sig[k] = 0; pm[k] = 0; continue; }
          solid[k] = 0;
          const inP = sc.plate && inPlate(sc.plate, x, y);
          pm[k] = inP ? 1 : 0;
          const h = depthAt(sc, x, y);
          depth[k] = h;
          const kk = kAt(h);
          // 數值色散補償後的波速
          const cn = (dx / dt) * Math.sin(w * dt / 2) / Math.sin(kk * dx / 2);
          c2[k] = cn * cn;
          // 黏滯＋槽底邊界層的阻尼（σ = 2 × 振幅衰減率）
          sig[k] = 2 * (2 * NU * kk * kk + kk * sqVisc / Math.sinh(Math.min(40, 2 * kk * h)));
        }
      }
      const fx = sim.fx, fy = sim.fy, A = sim.A, B = sim.B, Dc = sim.Dc;
      fx.fill(0); fy.fill(0); A.fill(0); B.fill(0); Dc.fill(0);
      for (let j = 1; j <= ny; j++) {
        for (let i = 1; i <= nx; i++) {
          const k = j * NX + i;
          if (solid[k]) { sim.u[k] = 0; sim.up[k] = 0; continue; }
          if (!solid[k + 1]) fx[k] = r2 * 2 * c2[k] * c2[k + 1] / (c2[k] + c2[k + 1]);
          if (!solid[k + NX]) fy[k] = r2 * 2 * c2[k] * c2[k + NX] / (c2[k] + c2[k + NX]);
          const s = sig[k] * dt / 2;
          A[k] = 2 / (1 + s); B[k] = (1 - s) / (1 + s); Dc[k] = 1 / (1 + s);
        }
      }
      // 海綿（吸收層，PML）：ζ1(x) 只吸收朝左右槽壁的運動、ζ2(y) 只吸收朝上下槽壁的運動，
      // 所以沿著槽壁前進的平面波不受影響（不會像窄縫一樣在邊緣繞射），朝槽壁前進的波被吸收。
      //   u_tt + (ζ1 + ζ2 + σ) u_t + ζ1 ζ2 u = ∇·(c²∇u) + ∇·ψ
      //   ψx_t = −ζ1 ψx + (ζ2 − ζ1) c² ∂u/∂x，ψy_t = −ζ2 ψy + (ζ1 − ζ2) c² ∂u/∂y
      // （頻域中等於把座標複數伸縮 x → x(1 + iζ1/ω)，對任何入射角、頻率在連續極限都不反射）
      const Hn = ny * dx, spM = spW + dx;
      const zeta = function (d) { return d < spW ? sigPML * ((spW - d) / spW) * ((spW - d) / spW) : 0; };
      const sk = [], cf = [];
      const px = sim.px, py = sim.py;
      if (!sc.sponge) { px.fill(0); py.fill(0); sim.pxa.fill(0); sim.pya.fill(0); }
      for (let j = 1; j <= ny; j++) {
        const y = (j - 0.5) * dx;
        for (let i = 1; i <= nx; i++) {
          const k = j * NX + i, x = (i - 0.5) * dx;
          if (!sc.sponge || solid[k]) continue;
          const dX = Math.min(x, W - x), dY = Math.min(y, Hn - y);
          if (dX >= spM && dY >= spM) continue;
          const z1 = zeta(dX), z2 = zeta(dY);
          // 格子中心：阻尼 (ζ1 + ζ2 + σ) 與 ζ1ζ2 u 項併入 A、B、Dc
          const a = (z1 + z2 + sig[k]) * dt / 2, b = z1 * z2 * dt * dt;
          A[k] = (2 - b) / (1 + a); B[k] = (1 - a) / (1 + a); Dc[k] = 1 / (1 + a);
          // +x 邊（x + dx/2）與 +y 邊（y + dx/2）上的通量 ψ 的係數
          const z1f = zeta(Math.min(x + dx / 2, W - x - dx / 2)), z2f = zeta(Math.min(y + dx / 2, Hn - y - dx / 2));
          sk.push(k);
          cf.push((1 - z1f * dt / 2) / (1 + z1f * dt / 2), dt * (z2 - z1f) / (1 + z1f * dt / 2),
            (1 - z2f * dt / 2) / (1 + z2f * dt / 2), dt * (z1 - z2f) / (1 + z2f * dt / 2));
        }
      }
      sim.stripK = Int32Array.from(sk); sim.stripC = Float32Array.from(cf);
      // 起波器的格子
      const list = [];
      const s0 = sc.source || { type: 'none' };
      if (s0.type === 'bar') {
        const i = Math.max(1, Math.min(nx, Math.floor(s0.x / dx) + 1));
        const y0 = s0.y0 != null ? s0.y0 : 0, y1 = s0.y1 != null ? s0.y1 : H;
        for (let j = 1; j <= ny; j++) {
          const y = (j - 0.5) * dx;
          if (y >= y0 && y <= y1 && !solid[j * NX + i]) list.push(j * NX + i);
        }
      } else if (s0.type === 'point' || s0.type === 'pair') {
        const pts = s0.type === 'point' ? [[s0.x, s0.y]] : [[s0.x, s0.y - s0.d / 2], [s0.x, s0.y + s0.d / 2]];
        const r = Math.max(TANK.dipR, 0.75 * dx);
        pts.forEach(function (p) {
          const i0 = Math.floor((p[0] - r) / dx), i1 = Math.ceil((p[0] + r) / dx) + 1;
          const j0 = Math.floor((p[1] - r) / dx), j1 = Math.ceil((p[1] + r) / dx) + 1;
          for (let j = Math.max(1, j0); j <= Math.min(ny, j1); j++) {
            for (let i = Math.max(1, i0); i <= Math.min(nx, i1); i++) {
              const k = j * NX + i;
              if (solid[k]) continue;
              if (Math.hypot((i - 0.5) * dx - p[0], (j - 0.5) * dx - p[1]) <= r && list.indexOf(k) < 0) list.push(k);
            }
          }
        });
      }
      sim.src = Int32Array.from(list);
    };

    /** 起波器的振幅（開始的 1.5 個週期平滑增加） */
    function drive(t) {
      const sc = sim.scene;
      if (!sc.source || sc.source.type === 'none' || sim.off) return null;
      const t0 = sim.tOn || 0, ramp = 1.5 * T, tt = t - t0;
      if (tt <= 0) return 0;
      const a = (sc.amp || 0.08) * (tt < ramp ? 0.5 - 0.5 * Math.cos(Math.PI * tt / ramp) : 1);
      return a * Math.sin(w * tt);
    }
    sim.drive = drive;
    /** 起波器開關（關掉後格子不再強制振動，水面自由傳播） */
    sim.setDriving = function (on) {
      if (on && sim.off !== false) { sim.off = false; sim.tOn = sim.t; }
      else if (!on) sim.off = true;
    };
    sim.off = false;
    sim.tOn = 0;

    /**
     * 格子尺度的濾波（超黏滯）：u ← u − ε/64 · Δ²u（Δ 為五點拉普拉斯，固體與槽壁的面不通過）。
     * 棋盤狀（相鄰格子正負交替）的雜訊每次少 ε；每波長 12 格的真實波每次只少約 ε/900。
     * 起波器突然改變、障礙物突然出現時產生的格子尺度雜訊幾乎不會傳播，不濾掉會一直留在畫面上。
     */
    function hyper(F) {
      const L = sim.un, fx = sim.fx, fy = sim.fy, solid = sim.solid;
      for (let j = 1; j <= ny; j++) {
        let k = j * NX + 1;
        const end = k + nx;
        for (; k < end; k++) {
          if (solid[k]) { L[k] = 0; continue; }
          const uk = F[k];
          let l = 0;
          if (fx[k] > 0) l += F[k + 1] - uk;
          if (fx[k - 1] > 0) l += F[k - 1] - uk;
          if (fy[k] > 0) l += F[k + NX] - uk;
          if (fy[k - NX] > 0) l += F[k - NX] - uk;
          L[k] = l;
        }
      }
      const e = sim.filterEps / 64;
      for (let j = 1; j <= ny; j++) {
        let k = j * NX + 1;
        const end = k + nx;
        for (; k < end; k++) {
          if (solid[k]) continue;
          const lk = L[k];
          let l = 0;
          if (fx[k] > 0) l += L[k + 1] - lk;
          if (fx[k - 1] > 0) l += L[k - 1] - lk;
          if (fy[k] > 0) l += L[k + NX] - lk;
          if (fy[k - NX] > 0) l += L[k - NX] - lk;
          F[k] -= e * l;
        }
      }
    }

    /** 前進 steps 步 */
    sim.step = function (steps) {
      const fx = sim.fx, fy = sim.fy, A = sim.A, B = sim.B, Dc = sim.Dc;
      for (let s = 0; s < steps; s++) {
        const u = sim.u, up = sim.up, un = sim.un;
        if (sim.scene.sponge) {
          // 吸收層的通量 ψ（以 dt²/dx 為單位存放，在半步 n ± ½）：ψ ← ψ·e + (ζ' − ζ) dt · c² ∂u；
          // 波動方程式用兩個半步的平均（時間上置中，二階準確）
          const sk = sim.stripK, C = sim.stripC, px = sim.px, py = sim.py, pxa = sim.pxa, pya = sim.pya;
          for (let q = 0, c = 0; q < sk.length; q++, c += 4) {
            const k = sk[q], uk = u[k];
            const nx1 = C[c] * px[k] + C[c + 1] * fx[k] * (u[k + 1] - uk);
            const ny1 = C[c + 2] * py[k] + C[c + 3] * fy[k] * (u[k + NX] - uk);
            pxa[k] = 0.5 * (px[k] + nx1); pya[k] = 0.5 * (py[k] + ny1);
            px[k] = nx1; py[k] = ny1;
          }
        }
        for (let j = 1; j <= ny; j++) {
          let k = j * NX + 1;
          const end = k + nx;
          for (; k < end; k++) {
            const uk = u[k];
            const fl = fx[k] * (u[k + 1] - uk) - fx[k - 1] * (uk - u[k - 1]) + fy[k] * (u[k + NX] - uk) - fy[k - NX] * (uk - u[k - NX]);
            un[k] = A[k] * uk - B[k] * up[k] + Dc[k] * fl;
          }
        }
        if (sim.scene.sponge) {
          // 海綿（PML）：加上輔助通量的散度
          const sk = sim.stripK, px = sim.pxa, py = sim.pya;
          for (let q = 0; q < sk.length; q++) {
            const k = sk[q];
            un[k] += Dc[k] * (px[k] - px[k - 1] + py[k] - py[k - NX]);
          }
        }
        sim.up = u; sim.u = un; sim.un = up;
        sim.n++;
        sim.t = sim.n * dt;
        const d = drive(sim.t);
        if (d !== null) {
          const src = sim.src, cur = sim.u;
          for (let i = 0; i < src.length; i++) cur[src[i]] = d;
        }
        if (sim.filterEps > 0 && sim.n % sim.filterEvery === 0) { hyper(sim.u); hyper(sim.up); }
      }
    };
    /** 把時刻 t（介於 t − dt 與 t 之間）的水面內插到 out（閃頻儀取樣） */
    sim.snapshot = function (out, tAt) {
      const a = Math.max(0, Math.min(1, (tAt - (sim.t - dt)) / dt));
      const u = sim.u, up = sim.up;
      for (let k = 0; k < N; k++) out[k] = up[k] + (u[k] - up[k]) * a;
      return out;
    };
    /** 清除水面（波重新開始） */
    sim.clear = function () {
      [sim.u, sim.up, sim.un, sim.px, sim.py, sim.pxa, sim.pya].forEach(function (a) { a.fill(0); });
      sim.tOn = sim.t;
    };

    sim.setGeometry(scene);
    return sim;
  }

  /**
   * 投影到白紙上的亮度 I = 1 / (1 + κ ∇²u)（u 為 mm，∇² 以 1/m² 計；κ = d (1 − 1/n)，單位 m）。
   * 牆邊的拉普拉斯用鏡像（法向斜率為 0）。out 為 Float32Array(N)；固體格子的亮度設為 0（影子）。
   */
  function intensity(sim, field, kappa, out) {
    const nx = sim.nx, ny = sim.ny, NX = sim.NX, F = field || sim.u, solid = sim.solid;
    const fx = sim.fx, fy = sim.fy;
    const kk = kappa * 1e-3 / (sim.dx * sim.dx);
    for (let j = 1; j <= ny; j++) {
      let k = j * NX + 1;
      const end = k + nx;
      for (; k < end; k++) {
        if (solid[k]) { out[k] = 0; continue; }
        const uk = F[k];
        let lap = 0;
        // 有水的鄰格才計入（fx、fy > 0 代表兩邊都是水）
        if (fx[k] > 0) lap += F[k + 1] - uk;
        if (fx[k - 1] > 0) lap += F[k - 1] - uk;
        if (fy[k] > 0) lap += F[k + NX] - uk;
        if (fy[k - NX] > 0) lap += F[k - NX] - uk;
        const q = 1 + kk * lap;
        out[k] = 1 / (q > 0.12 ? q : 0.12);
      }
    }
    return out;
  }
  function kappaOf(d) { return d * (1 - 1 / N_WATER); }

  // ======================================================================
  // 5. 鎖相量測（測試與任務證明用）：穩定後累積 u·e^{iωt}，求每一格的複數振幅
  // ======================================================================
  function createLockIn(sim) {
    const N = sim.NX * sim.NY;
    const L = { re: new Float64Array(N), im: new Float64Array(N), count: 0 };
    L.add = function () {
      const tt = sim.t - (sim.tOn || 0);
      const c = Math.cos(sim.omega * tt), s = Math.sin(sim.omega * tt), u = sim.u;
      for (let k = 0; k < N; k++) { const v = u[k]; if (v !== 0) { L.re[k] += v * c; L.im[k] += v * s; } }
      L.count++;
    };
    /** 跑 periods 個週期並累積 */
    L.run = function (periods) {
      const n = Math.round(periods * sim.stepsPerPeriod);
      for (let i = 0; i < n; i++) { sim.step(1); L.add(); }
    };
    /** 第 k 格的複數振幅 a·e^{iφ}（u ≈ a cos(ωt − φ)，mm） */
    L.at = function (k) { const g = 2 / Math.max(1, L.count); return [L.re[k] * g, L.im[k] * g]; };
    return L;
  }
  /**
   * 區域 {x0, x1, y0, y1} 內的平均波向量：相鄰格子的相位差 kx = arg Σ conj(U_i) U_{i+1} / dx（ky 同理），
   * 對平面波是精確的（不受差分近似影響），並自動以振幅平方加權。
   * sub：另一次鎖相量測（相同方格），先相減（例如扣掉入射波，只留反射波）。
   * 傳回 { kx, ky, k（rad/m）, lambda, dir（波前進方向與 +x 軸的夾角，rad）, amp（均方根振幅，mm）}
   */
  function waveVector(sim, L, region, sub) {
    const NX = sim.NX, dx = sim.dx;
    const g = 2 / Math.max(1, L.count), gs = sub ? 2 / Math.max(1, sub.count) : 0;
    function U(k) {
      let r = L.re[k] * g, i = L.im[k] * g;
      if (sub) { r -= sub.re[k] * gs; i -= sub.im[k] * gs; }
      return [r, i];
    }
    let xr = 0, xi = 0, yr = 0, yi = 0, den = 0, cnt = 0;
    const i0 = Math.max(1, Math.floor(region.x0 / dx) + 1), i1 = Math.min(sim.nx - 1, Math.floor(region.x1 / dx) + 1);
    const j0 = Math.max(1, Math.floor(region.y0 / dx) + 1), j1 = Math.min(sim.ny - 1, Math.floor(region.y1 / dx) + 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * NX + i;
        if (sim.solid[k] || sim.solid[k + 1] || sim.solid[k + NX]) continue;
        const c = U(k), xp = U(k + 1), yp = U(k + NX);
        // conj(c)·xp
        xr += c[0] * xp[0] + c[1] * xp[1]; xi += c[0] * xp[1] - c[1] * xp[0];
        yr += c[0] * yp[0] + c[1] * yp[1]; yi += c[0] * yp[1] - c[1] * yp[0];
        den += c[0] * c[0] + c[1] * c[1];
        cnt++;
      }
    }
    const kx = Math.atan2(xi, xr) / dx, ky = Math.atan2(yi, yr) / dx, k = Math.hypot(kx, ky);
    return { kx: kx, ky: ky, k: k, lambda: 2 * Math.PI / k, dir: Math.atan2(ky, kx), amp: Math.sqrt(den / Math.max(1, cnt)) };
  }
  /** 區域內的均方根振幅（mm） */
  function rmsAmplitude(sim, L, region) {
    const NX = sim.NX, dx = sim.dx, g = 2 / Math.max(1, L.count);
    let s = 0, n = 0;
    const i0 = Math.max(1, Math.floor(region.x0 / dx) + 1), i1 = Math.min(sim.nx, Math.floor(region.x1 / dx) + 1);
    const j0 = Math.max(1, Math.floor(region.y0 / dx) + 1), j1 = Math.min(sim.ny, Math.floor(region.y1 / dx) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * NX + i;
      if (sim.solid[k]) continue;
      const r = L.re[k] * g, im = L.im[k] * g;
      s += r * r + im * im; n++;
    }
    return Math.sqrt(s / Math.max(1, n));
  }

  /** 離散能量（無阻尼、無起波器時守恆，測試數值方法用）：動能＋位能（相鄰兩個時間層的乘積） */
  function discreteEnergy(sim) {
    const NX = sim.NX, nx = sim.nx, ny = sim.ny, u = sim.u, up = sim.up, fx = sim.fx, fy = sim.fy;
    let ek = 0, ep = 0;
    for (let j = 1; j <= ny; j++) for (let i = 1; i <= nx; i++) {
      const k = j * NX + i;
      if (sim.solid[k]) continue;
      const v = u[k] - up[k];
      ek += v * v;
      ep += fx[k] * (u[k + 1] - u[k]) * (up[k + 1] - up[k]) + fy[k] * (u[k + NX] - u[k]) * (up[k + NX] - up[k]);
    }
    return 0.5 * (ek + ep);
  }

  const api = {
    G: G, SIGMA: SIGMA, RHO: RHO, NU: NU, N_WATER: N_WATER, DEG: DEG, TANK: TANK,
    omegaOf: omegaOf, waveNumber: waveNumber, wavelength: wavelength, phaseSpeed: phaseSpeed,
    groupSpeed: groupSpeed, shallowSpeed: shallowSpeed,
    snell: snell, criticalAngle: criticalAngle, magnification: magnification,
    nodalLineCount: nodalLineCount, antinodalLineCount: antinodalLineCount, focalLength: focalLength,
    fitThroughOrigin: fitThroughOrigin, fitLine: fitLine,
    inRect: inRect, inArc: inArc, inPlate: inPlate, inSolid: inSolid, depthAt: depthAt, depthRange: depthRange, wrapPi: wrapPi,
    createSim: createSim, intensity: intensity, kappaOf: kappaOf,
    createLockIn: createLockIn, waveVector: waveVector, rmsAmplitude: rmsAmplitude, discreteEnergy: discreteEnergy
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RippleCore = api;
})(this);
