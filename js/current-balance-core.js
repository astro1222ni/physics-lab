/*
 * current-balance-core.js — 「電流天平」物理核心（與畫面無關，可單獨以 Node 測試）
 *
 * 實驗（選修物理Ⅳ 電流的磁效應，實驗：電流天平）：
 *   長方形絕緣板上鋪一圈 ㄈ字形銅條，板子架在支點 K、K′ 上成為等臂天平；ㄈ字形的前端 bc 段（長 L，垂直於軸）
 *   伸進空心螺線管裡。螺線管通電流 I2 產生沿軸的磁場 B，ㄈ字形電路通電流 I1，bc 段受磁力 F = I1·L·B（鉛直方向）。
 *   另一端掛一小段漆包線（質量 m），調整電流讓天平恢復水平：m g d2 = I1 L B d1，等臂（d1 = d2）時 m g = I1 L B。
 *
 * 座標（SI，m）：z 沿螺線管軸，指向支點那一端（管口 z = 0，繞線由 z = −len 到 0）；y 鉛直向上；
 *   x 水平、垂直於軸，指向「離開觀察者」的方向（x、y、z 為右手系）。天平支點軸沿 x，在 z = zP、y = 0。
 * 符號：
 *   s2 = +1 時螺線管內 B 沿 +z；s1 = +1 時 bc 段的電流沿 +x。兩者都 +1（或都 −1）時 bc 受力向下（bc 端下沉、外端上翹）。
 *   力矩以「讓外端（掛重物端）下沉」為正。天平傾角 θ 也以外端下沉為正。
 *
 * 物理：
 *   1. 理想（課本的長螺線管近似）：管內 B = μ0 n I2 均勻且沿軸；兩支側臂與 B 平行，不受力；
 *      支點的兩根銅柱（電流進出處）在轉軸上，受力不產生力矩。磁力矩 = I1 L B d1。
 *   2. 真實螺線管：把繞線看成半徑 a、長 len 的面電流（每單位長度 n I2），以畢歐—沙伐的圓線圈公式
 *      （完全橢圓積分）沿軸用 Gauss–Legendre 積分求任一點的 Bz、Bρ。
 *      bc 段：F = I1 ∫ Bz dx（在螺線管中央，比 μ0 n I2 略小）。
 *      側臂：管口附近磁力線向外散開（Bρ ≠ 0）。兩支側臂電流相反、所在處 Bρ 的方向也相反，
 *      所以兩者受力同向，而且與 bc 的受力相反，力臂較短（集中在管口）。
 *      磁力矩 = I1 [ d1 ∫ Bz(x, zBC) dx − 2 ∫ Bρ(L/2, z)(zP − z) dz ]。
 *   3. 天平的轉動：J θ'' = τ − κ sin θ − c θ' − （支點摩擦），κ 由重心在支點下方產生（恢復力矩），
 *      兩端有擋塊（|θ| ≤ θmax）。「含誤差」時支點有庫侖摩擦（靜止時 |τ − κ sinθ| ≤ τf 就不會動）。
 *   4. 電表：讀數 = 真值 × (1 + 校正誤差)，四捨五入到最後一位。
 */
(function (root) {
  'use strict';

  const MU0 = 4 * Math.PI * 1e-7;          // 課本用的 μ0（T·m/A）
  const MU0_CODATA = 1.25663706127e-6;     // CODATA 2022 建議值（2019 年 SI 改制後 μ0 是量出來的）
  const G = 9.8;                           // 重力加速度（m/s^2），與全站其他實驗一致

  /** 儀器尺寸與參數（SI） */
  const APP = {
    len: 0.250,        // 螺線管長度
    N: 1000,           // 匝數
    n: 4000,           // 每公尺匝數 = N / len
    a: 0.028,          // 繞線的平均半徑（面電流的半徑）
    bore: 0.025,       // 管子內半徑（天平前端在這個空間裡上下）
    rOut: 0.031,       // 繞線外半徑
    L: 0.030,          // bc 段長度（ㄈ字形電路的寬度）
    zBC: -0.125,       // bc 段的位置（螺線管正中央）
    zP: 0.015,         // 支點軸的位置（管口外 1.5 cm）
    d1: 0.140,         // 支點到 bc 段的距離
    d2: 0.140,         // 支點到重物放置處（掛勾）的距離：等臂
    rTip: 0.170,       // 支點到外端指針尖的距離
    rodR: 0.145,       // 支點到歸零螺桿起點的距離
    boardW: 0.036,     // 絕緣板寬度
    lambda: 0.0040,    // 漆包線線密度（kg/m）＝ 40 mg/cm（直徑約 0.75 mm 的銅線）
    kappa: 4.0e-4,     // 恢復力矩係數 κ（N·m/rad）：天平重心在支點下方
    J: 6.4e-5,         // 天平對支點的轉動慣量（kg·m^2）
    c: 1.92e-4,        // 阻尼係數（N·m·s/rad）：ζ ≈ 0.6
    thetaMax: 0.105,   // 擋塊：最大傾角（rad，約 6°）
    nutM: 0.0005,      // 歸零螺母質量（kg）
    nutOK: 8.40,       // 螺母在螺桿上的這個位置（mm）時，天平剛好水平
    nutX0: 10.00,      // 開始時螺母的位置（mm）：天平沒有歸零
    tauF: 0.6e-6 * G * 0.140, // 「含誤差」時支點的最大靜摩擦力矩（相當於掛勾處 0.6 mg）
    levelTip: 0.0005,  // 指針尖離水平刻線 0.5 mm 以內算「水平」
    I1Max: 4.0, I2Max: 5.0
  };

  // ---------------- 理想（長螺線管近似） ----------------
  function Bideal(I2, n) { return MU0 * (n == null ? APP.n : n) * I2; }
  /** 理想情況的力矩係數：|磁力矩| = G·I1·I2（N·m/A^2） */
  function idealFactor(app) { app = app || APP; return MU0 * app.n * app.L * app.d1; }

  // ---------------- 真實螺線管的磁場 ----------------
  /** 第一類與第二類完全橢圓積分 K(m)、E(m)（m = k^2），算術—幾何平均法 */
  function ellipKE(m) {
    if (m < 0) m = 0;
    if (m >= 1) m = 1 - 1e-16;
    let a = 1, b = Math.sqrt(1 - m), c;
    let sum = 0.5 * m, pw = 0.5;
    for (let i = 0; i < 40; i++) {
      const an = 0.5 * (a + b), bn = Math.sqrt(a * b);
      c = 0.5 * (a - b);
      pw *= 2;
      sum += pw * c * c;
      a = an; b = bn;
      if (Math.abs(c) < 1e-17) break;
    }
    const K = Math.PI / (2 * a);
    return { K: K, E: K * (1 - sum) };
  }
  /** 單一圓線圈（半徑 a、電流 I，圓心在原點、軸為 z）在 (ρ, z) 的磁場 { Brho, Bz }（封閉解） */
  function loopField(a, I, rho, z) {
    const s = a * a + rho * rho + z * z;
    const al2 = s - 2 * a * rho, be2 = s + 2 * a * rho;
    if (al2 <= 1e-18) return { Brho: 0, Bz: 0 };
    const be = Math.sqrt(be2);
    const ke = ellipKE(1 - al2 / be2);
    const C = MU0 * I / Math.PI;
    const Bz = C / (2 * al2 * be) * ((a * a - rho * rho - z * z) * ke.E + al2 * ke.K);
    const Brho = rho > 1e-12 ? C * z / (2 * al2 * be * rho) * (s * ke.E - al2 * ke.K) : 0;
    return { Brho: Brho, Bz: Bz };
  }
  // Gauss–Legendre 4 點
  const GL_X = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526];
  const GL_W = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
  /**
   * 有限長螺線管（面電流：半徑 a，由 z = −len 到 0，每單位長度 n·I2）在 (ρ, z) 的磁場 { Brho, Bz }。
   * panels：沿軸切成幾段做 4 點 Gauss–Legendre 積分（離繞線愈近需要愈多）。
   */
  function sheetField(rho, z, I2, opt) {
    opt = opt || {};
    const a = opt.a || APP.a, len = opt.len || APP.len, n = opt.n || APP.n, P = opt.panels || 100;
    const h = len / P;
    let Br = 0, Bz = 0;
    for (let p = 0; p < P; p++) {
      const zc = -len + (p + 0.5) * h;
      for (let k = 0; k < 4; k++) {
        const zp = zc + 0.5 * h * GL_X[k];
        const f = loopField(a, 1, rho, z - zp);
        const w = 0.5 * h * GL_W[k];
        Br += w * f.Brho; Bz += w * f.Bz;
      }
    }
    return { Brho: Br * n * I2, Bz: Bz * n * I2 };
  }
  /** 軸上的磁場（封閉公式）：B = (μ0 n I/2)[cos θ1 − cos θ2] */
  function axialField(z, I2, opt) {
    opt = opt || {};
    const a = opt.a || APP.a, len = opt.len || APP.len, n = opt.n || APP.n;
    const u1 = z + len, u2 = z;
    return MU0 * n * I2 / 2 * (u1 / Math.sqrt(u1 * u1 + a * a) - u2 / Math.sqrt(u2 * u2 + a * a));
  }

  /**
   * 真實螺線管的力矩係數（每 1 A × 1 A），分成 bc 段與兩支側臂兩部分。
   * 回傳 { G, bc, side, Bbc（bc 段上 Bz 的平均，每安培）, ratio = G / 理想值, sideForce（側臂合力，每安培^2，與 bc 力相反為負） }
   */
  let realCache = null;
  function realFactor(app) {
    app = app || APP;
    if (realCache && realCache.app === app) return realCache.v;
    const L = app.L, opt = { a: app.a, len: app.len, n: app.n, panels: 120 };
    // bc 段：∫ Bz(|x|, zBC) dx，x 由 −L/2 到 L/2（對稱，只算一半）
    let Fbc = 0;
    const nb = 6;
    for (let p = 0; p < nb; p++) {
      for (let k = 0; k < 4; k++) {
        const x = (p + 0.5 + 0.5 * GL_X[k]) * (L / 2) / nb;
        Fbc += 2 * (0.5 * (L / 2) / nb) * GL_W[k] * sheetField(x, app.zBC, 1, opt).Bz;
      }
    }
    // 側臂：−2 ∫ Bρ(L/2, z)(zP − z) dz，z 由 zBC 到 zP（管口附近切細一點）
    const clip = function (z) { return Math.min(Math.max(app.zBC, z), app.zP); };
    const b1 = clip(-0.06), b2 = clip(-0.015);
    const segs = [[app.zBC, b1, 6], [b1, b2, 8], [b2, app.zP, 10]];
    let tSide = 0, fSide = 0;
    segs.forEach(function (sg) {
      const z0 = sg[0], z1 = sg[1], m = sg[2], h = (z1 - z0) / m;
      for (let p = 0; p < m; p++) {
        for (let k = 0; k < 4; k++) {
          const z = z0 + (p + 0.5 + 0.5 * GL_X[k]) * h;
          const br = sheetField(L / 2, z, 1, opt).Brho;
          const w = 0.5 * h * GL_W[k];
          tSide += -2 * br * (app.zP - z) * w;
          fSide += -2 * br * w;
        }
      }
    });
    const bc = app.d1 * Fbc;
    const v = { G: bc + tSide, bc: bc, side: tSide, Bbc: Fbc / L, ratio: (bc + tSide) / idealFactor(app), sideForce: fSide, bcForce: Fbc };
    realCache = { app: app, v: v };
    return v;
  }
  /** 力矩係數 G（N·m/A^2）：real = true 用真實螺線管，否則用課本的理想模型 */
  function factor(real, app) { return real ? realFactor(app).G : idealFactor(app); }

  // ---------------- 天平的力矩與平衡 ----------------
  /**
   * 淨力矩（外端下沉為正）。p：{ m（掛勾上漆包線的真實質量 kg）, I1, I2（真實電流 A，≥ 0）, s1, s2（±1）, nut（螺母位置 mm）, real }
   */
  function netTorque(p, app) {
    app = app || APP;
    const mag = (p.s1 || 1) * (p.s2 || 1) * (p.I1 || 0) * (p.I2 || 0) * factor(!!p.real, app);
    const nut = app.nutM * G * ((p.nut == null ? app.nutOK : p.nut) - app.nutOK) * 1e-3;
    return (p.m || 0) * G * app.d2 + nut - mag;
  }
  /** 沒有摩擦時的平衡傾角（外端下沉為正），超出擋塊就停在擋塊 */
  function eqAngle(tau, app) {
    app = app || APP;
    const u = tau / app.kappa;
    if (u >= Math.sin(app.thetaMax)) return app.thetaMax;
    if (u <= -Math.sin(app.thetaMax)) return -app.thetaMax;
    return Math.asin(u);
  }
  /** 有支點摩擦時，由角度 θ 慢慢放開後停下的角度（準靜態）：只要 |τ − κ sinθ| ≤ τf 就不動，否則停在死區的邊緣 */
  function restAngle(theta, tau, tauF, app) {
    app = app || APP;
    const net = tau - app.kappa * Math.sin(theta);
    if (Math.abs(net) <= tauF) return theta;
    return eqAngle(net > 0 ? tau - tauF : tau + tauF, app);
  }
  /** 外端指針尖的位移（m，向下為正） */
  function tipOf(theta, app) { return (app || APP).rTip * Math.sin(theta); }
  /** 掛勾處相當於多少質量的力矩（kg） */
  function torqueToMass(tau, app) { return tau / (G * (app || APP).d2); }

  /**
   * 天平轉動一步（半隱式歐拉，內部再切小步）。s：{ th, om }；tau：外加淨力矩；tauF：支點最大靜摩擦力矩（0 = 理想）。
   * 回傳 { hit（撞到擋塊時的角速度，否則 0） }
   */
  function stepBeam(s, tau, dt, tauF, app) {
    app = app || APP;
    tauF = tauF || 0;
    let hit = 0;
    const nsub = Math.max(1, Math.ceil(dt / 0.002));
    const h = dt / nsub;
    for (let i = 0; i < nsub; i++) {
      const drive = tau - app.kappa * Math.sin(s.th) - app.c * s.om;
      if (s.om === 0 && Math.abs(tau - app.kappa * Math.sin(s.th)) <= tauF) continue; // 靜摩擦：不動
      let fr = 0;
      if (tauF > 0) fr = s.om !== 0 ? -tauF * Math.sign(s.om) : -tauF * Math.sign(drive);
      const om1 = s.om + h * (drive + fr) / app.J;
      // 動摩擦讓角速度改變正負號 → 停下來（下一步再判斷靜摩擦）
      if (tauF > 0 && s.om !== 0 && Math.sign(om1) !== Math.sign(s.om)) s.om = 0;
      else s.om = om1;
      s.th += h * s.om;
      if (s.th > app.thetaMax) { if (s.om > 0) hit = Math.max(hit, s.om); s.th = app.thetaMax; s.om = 0; }
      else if (s.th < -app.thetaMax) { if (s.om < 0) hit = Math.max(hit, -s.om); s.th = -app.thetaMax; s.om = 0; }
    }
    return { hit: hit };
  }

  /** 理想天平水平時需要的螺線管電流 I2（給定 m、I1） */
  function balanceI2(m, I1, real, app) { app = app || APP; return m * G * app.d2 / (factor(real, app) * I1); }
  /** 天平水平時需要的 ㄈ字形電路電流 I1（給定 m、I2） */
  function balanceI1(m, I2, real, app) { app = app || APP; return m * G * app.d2 / (factor(real, app) * I2); }
  /** 給定兩個電流，天平水平時掛勾上的質量（kg） */
  function balanceMass(I1, I2, real, app) { app = app || APP; return factor(real, app) * I1 * I2 / (G * app.d2); }

  // ---------------- 量測 ----------------
  /** 電表：真值乘以 (1 + 校正誤差)，四捨五入到解析度 res */
  function meter(value, eps, res) {
    const v = value * (1 + (eps || 0));
    return Math.round(v / res + 1e-9) * res;
  }
  /** 一段漆包線的真實質量（kg）：長度 len（m），dev 為這段線的相對偏差（線徑不均） */
  function wireMass(len, dev, app) { return (app || APP).lambda * len * (1 + (dev || 0)); }

  // ---------------- 數據分析 ----------------
  function fitOrigin(xs, ys) {
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]; }
    if (!(sxx > 0)) return null;
    const k = sxy / sxx;
    let ssr = 0;
    for (let i = 0; i < xs.length; i++) { const e = ys[i] - k * xs[i]; ssr += e * e; }
    return { slope: k, n: xs.length, r2: syy > 0 ? 1 - ssr / syy : 1 };
  }
  function fitLine(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (!(sxx > 0)) return null;
    const b = sxy / sxx;
    return { slope: b, intercept: my - b * mx, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1 };
  }
  /**
   * 數據表分析。rows：[{ part（1 或 2）, m（秤的讀數 kg）, I1, I2（電表讀數 A）}]
   * 每一列：F = mg、B = F/(I1 L)、μ0 = F/(I1 I2 L n)。
   * 實驗一（part 1）：B 對 I2，通過原點的最佳直線斜率 = μ0 n → μ0。
   * 實驗二（part 2）：F 對 I1，通過原點的最佳直線斜率 = L B → B，與 μ0 n Ī2 比較。
   */
  function analyze(rows, app) {
    app = app || APP;
    const list = rows.map(function (r) {
      const F = r.m * G;
      const ok = r.I1 > 0 && r.I2 > 0 && r.m > 0;
      return { part: r.part, F: F, B: ok ? F / (r.I1 * app.L) : NaN, mu0: ok ? F / (r.I1 * r.I2 * app.L * app.n) : NaN, ok: ok };
    });
    const out = { rows: list, n: list.filter(function (w) { return w.ok; }).length };
    // 實驗一
    const p1 = rows.map(function (r, i) { return { r: r, w: list[i] }; }).filter(function (q) { return q.r.part === 1 && q.w.ok; });
    out.p1 = { n: p1.length };
    if (p1.length) {
      const xs = p1.map(function (q) { return q.r.I2; }), ys = p1.map(function (q) { return q.w.B; });
      const f = fitOrigin(xs, ys);
      out.p1.fit = f;
      out.p1.line = fitLine(xs, ys);
      if (f) { out.p1.mu0 = f.slope / app.n; out.p1.err = out.p1.mu0 / MU0 - 1; }
      const i1 = p1.map(function (q) { return q.r.I1; });
      out.p1.I1spread = Math.max.apply(null, i1) - Math.min.apply(null, i1);
      out.p1.I1 = i1.reduce(function (s, v) { return s + v; }, 0) / i1.length;
      const ms = {};
      p1.forEach(function (q) { ms[Math.round(q.r.m * 1e7)] = true; });
      out.p1.distinctM = Object.keys(ms).length;
    }
    // 實驗二
    const p2 = rows.map(function (r, i) { return { r: r, w: list[i] }; }).filter(function (q) { return q.r.part === 2 && q.w.ok; });
    out.p2 = { n: p2.length };
    if (p2.length) {
      const xs = p2.map(function (q) { return q.r.I1; }), ys = p2.map(function (q) { return q.w.F; });
      const f = fitOrigin(xs, ys);
      out.p2.fit = f;
      out.p2.line = fitLine(xs, ys);
      const i2 = p2.map(function (q) { return q.r.I2; });
      out.p2.I2 = i2.reduce(function (s, v) { return s + v; }, 0) / i2.length;
      out.p2.I2spread = Math.max.apply(null, i2) - Math.min.apply(null, i2);
      if (f) {
        out.p2.B = f.slope / app.L;
        out.p2.Bth = MU0 * app.n * out.p2.I2;
        out.p2.err = out.p2.B / out.p2.Bth - 1;
        out.p2.mu0 = out.p2.B / (app.n * out.p2.I2);
      }
      const ms = {};
      p2.forEach(function (q) { ms[Math.round(q.r.m * 1e7)] = true; });
      out.p2.distinctM = Object.keys(ms).length;
    }
    // 每一列 μ0 的平均
    const mus = list.filter(function (w) { return w.ok; }).map(function (w) { return w.mu0; });
    if (mus.length) { out.mu0Mean = mus.reduce(function (s, v) { return s + v; }, 0) / mus.length; out.meanErr = out.mu0Mean / MU0 - 1; }
    return out;
  }

  // ---------------- 磁力線（畫圖用） ----------------
  /**
   * 在 (ρ, z) 平面上沿磁場方向描一條磁力線（RK4），回傳 [[ρ, z], …]。
   * 起點 (rho0, z0)；opts：{ ds, maxLen, box: { r, z0, z1 }, panels, dir（±1）}
   * 碰到繞線附近（距離 < 2 mm）或出界就停。
   */
  function fieldLine(rho0, z0, opts) {
    opts = opts || {};
    const ds = opts.ds || 0.003, maxLen = opts.maxLen || 1.2, dir = opts.dir || 1;
    const box = opts.box || { r: 0.12, z0: -0.40, z1: 0.16 };
    const fo = { panels: opts.panels || 40 };
    const a = APP.a, len = APP.len;
    const f = function (r, z) {
      const b = sheetField(Math.abs(r), z, 1, fo);
      const br = r < 0 ? -b.Brho : b.Brho;
      const m = Math.hypot(br, b.Bz) || 1;
      return [dir * br / m, dir * b.Bz / m];
    };
    const pts = [[rho0, z0]];
    let r = rho0, z = z0, s = 0;
    while (s < maxLen) {
      const k1 = f(r, z);
      const k2 = f(r + 0.5 * ds * k1[0], z + 0.5 * ds * k1[1]);
      const k3 = f(r + 0.5 * ds * k2[0], z + 0.5 * ds * k2[1]);
      const k4 = f(r + ds * k3[0], z + ds * k3[1]);
      r += ds / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      z += ds / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      s += ds;
      pts.push([r, z]);
      if (Math.abs(r) > box.r || z < box.z0 || z > box.z1) break;
      // 離繞線太近（面電流上磁場不連續）
      if (Math.abs(Math.abs(r) - a) < 0.0015 && z > -len - 0.001 && z < 0.001) break;
      if (s > 0.05 && Math.hypot(r - rho0, z - z0) < ds * 0.8) { pts.push([rho0, z0]); break; }
    }
    return pts;
  }

  const api = {
    MU0: MU0, MU0_CODATA: MU0_CODATA, G: G, APP: APP,
    Bideal: Bideal, idealFactor: idealFactor, realFactor: realFactor, factor: factor,
    ellipKE: ellipKE, loopField: loopField, sheetField: sheetField, axialField: axialField,
    netTorque: netTorque, eqAngle: eqAngle, restAngle: restAngle, tipOf: tipOf, torqueToMass: torqueToMass,
    stepBeam: stepBeam, balanceI1: balanceI1, balanceI2: balanceI2, balanceMass: balanceMass,
    meter: meter, wireMass: wireMass, fitOrigin: fitOrigin, fitLine: fitLine, analyze: analyze, fieldLine: fieldLine
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CurrentBalanceCore = api;
})(typeof window !== 'undefined' ? window : this);
