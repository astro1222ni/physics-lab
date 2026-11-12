/*
 * current-magnetic-field-core.js — 「電流的磁效應：直導線、線圈與螺線管的磁場」物理核心
 * （與畫面無關，可單獨以 Node 測試）
 *
 * 單位一律 SI：長度 m、電流 A、磁場 T、角度 rad（標明 deg 的除外）。
 *
 * 一、厄斯特實驗與正切法（羅盤水平放置，磁針只能繞鉛直軸轉）
 *   座標：x 向東、y 向「磁北」、z 鉛直向上；磁針的轉軸在原點。
 *   導線水平、方位角 α（由磁北往東量）：方向 u = (sin α, cos α, 0)；水平垂直方向 v = (cos α, −sin α, 0)。
 *   導線在磁針上方（zw = +h）或下方（zw = −h），並可沿 v 方向側移：磁針在導線正下方（或正上方）往 v 偏 d 的地方。
 *   無限長直導線（畢歐–沙伐定律積分）：B = μ0 I /(2π ρ²) · (u × ρ⃗)，ρ⃗ 為導線到磁針的垂直向量。
 *   電流 s = +1 沿 u（α = 0 時向北）。算出來 B 的水平分量 = −(μ0 I s zw /(2π ρ²)) v，鉛直分量 = −(μ0 I s d /(2π ρ²)) ẑ。
 *   磁針只感受水平分量：B⃗h = B⃗地（沿 +y，大小 BH）＋導線磁場的水平分量；平衡方向 φeq = atan2(Bx, By)（由北往東量）。
 *   磁針的轉動（每單位轉動慣量）：φ'' = (m/J)(Bx cos φ − By sin φ) − (c/J) φ' − 支點摩擦。
 *   數值積分：四階 Runge–Kutta，固定小步長（≤ 1/600 s）；無阻尼時能量 ½φ'² − (m/J)(Bx sin φ + By cos φ) 守恆（測試量漂移）。
 *   導線南北向（α = 0）、磁針在正下方（d = 0）時：tan θ = B導線 / BH（正切法）。
 *
 * 二、三種電流形狀在一個平面上的磁場
 *   長直導線：平面垂直於導線，導線在原點，s = +1 時電流射出紙面；B = μ0 I /(2π r)，方向逆時針。
 *   圓線圈（N 匝、半徑 R、中心在原點）與螺線管（總匝數 N、長 L、半徑 R、中心在原點）：
 *     平面通過軸線；平面座標 x = 沿軸（z），y = 帶正負號的徑向距離 ρ。s = +1 時軸上 B 沿 +x。
 *   圓線圈：單匝圓電流的精確磁場（完全橢圓積分 K、E，以算術幾何平均計算）× N。
 *   螺線管：把繞線看成面電流（每單位長度 n I，n = N/L），用 Derby & Olbert（Am. J. Phys. 78, 229, 2010）的
 *     閉合解：廣義完全橢圓積分 C(kc, p, c, s)（Bulirsch 演算法）。測試中與「許多圓線圈相加」的數值積分比對。
 *   磁力線：在平面上沿磁場方向（單位向量）用 RK4 積分；軸對稱磁場的磁力線恰為 ψ = ρA_φ 的等值線（測試 ψ 守恆）。
 *   起點（2D 剖面）：在中央平面（x = 0）上，相鄰兩條線之間的 ∫|Bx| dy 相等，所以中央平面上的疏密正比於 B。
 *   起點（3D）：在中央平面的圓盤上，每條線圍住的通量相等（向日葵排列），所以立體的疏密正比於 B。
 *   長直導線：同心圓半徑成等比（相鄰兩圓間 ∫B dr 相等），疏密正比於 1/r。
 */
(function (root) {
  'use strict';

  // ---------------- 常數 ----------------
  const MU0 = 1.25663706127e-6;   // 真空磁導率 N/A²（CODATA 2022 建議值；不再剛好是 4π × 10^-7）
  const MU0_U = 0.00000000020e-6; // 標準不確定度
  const K2 = MU0 / (2 * Math.PI); // μ0/2π

  /**
   * 台灣幾個地點的地磁（NOAA NCEI／英國地質調查所 World Magnetic Model WMM2025，2026 年 11 月＝2026.87、海平面）。
   * H 水平分量、Z 鉛直分量（向下為正）、D 磁偏角（東為正）、I 磁傾角，單位 T 與 deg。
   * 由 WMM2025 係數檔（WMM.COF）以球諧函數展開計算；同一程式與官方測試值相差 < 0.001 nT。
   */
  const EARTH = [
    { id: 'taipei', zh: '臺北', en: 'Taipei', lat: 25.03, lon: 121.57, H: 36.18e-6, Z: 27.95e-6, D: -5.07, I: 37.68 },
    { id: 'taichung', zh: '臺中', en: 'Taichung', lat: 24.15, lon: 120.67, H: 36.60e-6, Z: 26.91e-6, D: -4.74, I: 36.32 },
    { id: 'yuanlin', zh: '彰化員林', en: 'Yuanlin, Changhua', lat: 23.96, lon: 120.57, H: 36.68e-6, Z: 26.66e-6, D: -4.69, I: 36.01 },
    { id: 'kaohsiung', zh: '高雄', en: 'Kaohsiung', lat: 22.63, lon: 120.30, H: 37.20e-6, Z: 24.79e-6, D: -4.35, I: 33.68 },
    { id: 'hualien', zh: '花蓮', en: 'Hualien', lat: 23.99, lon: 121.60, H: 36.59e-6, Z: 26.46e-6, D: -4.83, I: 35.87 }
  ];
  function earth(id) { for (let i = 0; i < EARTH.length; i++) if (EARTH[i].id === id) return EARTH[i]; return EARTH[0]; }

  // ---------------- 磁針（羅盤） ----------------
  // 在臺北的地磁水平分量下：小角度擺動週期 1.6 s、阻尼比 0.12；含誤差時支點摩擦的「卡住範圍」±0.15°。
  const NEEDLE = { Bref: 36.18e-6, T0: 1.6, zeta: 0.12, deadDeg: 0.15 };
  NEEDLE.w0 = 2 * Math.PI / NEEDLE.T0;
  NEEDLE.mJ = NEEDLE.w0 * NEEDLE.w0 / NEEDLE.Bref;             // m/J（1/(T·s²)）
  NEEDLE.cJ = 2 * NEEDLE.zeta * NEEDLE.w0;                      // c/J（1/s）
  NEEDLE.fJ = NEEDLE.mJ * NEEDLE.Bref * Math.sin(NEEDLE.deadDeg * Math.PI / 180); // 摩擦力矩 / J（rad/s²）

  const DEG = Math.PI / 180;
  function wrapDeg(a) { a = ((a + 180) % 360 + 360) % 360 - 180; return a === -180 ? 180 : a; }
  function wrapRad(a) { return wrapDeg(a / DEG) * DEG; }

  /** 無限長直導線在距離 r 處的磁場大小 */
  function wireB(I, r) { return K2 * I / r; }

  /**
   * 厄斯特實驗的磁場（磁針所在處）。o = { I, s(±1), alpha (deg), above (bool), h (m), d (m), BH (T), earth (bool) }
   * 傳回導線磁場（三分量）、合成水平磁場、平衡方向 thetaEq（deg，由北往東為正，−180～180）。
   */
  function oerstedField(o) {
    const a = (o.alpha || 0) * DEG;
    const vx = Math.cos(a), vy = -Math.sin(a);
    const zw = o.above ? o.h : -o.h, d = o.d || 0;
    const rho2 = o.h * o.h + d * d;
    const k = o.I > 0 ? K2 * o.I * (o.s < 0 ? -1 : 1) / rho2 : 0;
    const BIx = -k * zw * vx, BIy = -k * zw * vy, BIz = -k * d;
    const BE = o.earth === false ? 0 : o.BH;
    const Bx = BIx, By = BE + BIy;
    const Bh = Math.hypot(Bx, By);
    return {
      BIx: BIx, BIy: BIy, BIz: BIz, BI: Math.abs(k) * Math.sqrt(rho2), BIh: Math.hypot(BIx, BIy),
      BE: BE, Bx: Bx, By: By, Bh: Bh, dist: Math.sqrt(rho2),
      thetaEq: Bh > 0 ? Math.atan2(Bx, By) / DEG : 0
    };
  }

  /** 磁針的角加速度（φ 由北往東量，rad） */
  function needleAcc(phi, om, Bx, By, damp) {
    return NEEDLE.mJ * (Bx * Math.cos(phi) - By * Math.sin(phi)) - (damp === false ? 0 : NEEDLE.cJ * om);
  }
  /** 每單位轉動慣量的能量（無阻尼時守恆） */
  function needleEnergy(st, Bx, By) {
    return 0.5 * st.om * st.om - NEEDLE.mJ * (Bx * Math.sin(st.phi) + By * Math.cos(st.phi));
  }
  /** 卡住範圍（支點摩擦，deg）：磁場越強越小 */
  function deadBand(Bh) {
    if (!(Bh > 0)) return 180;
    return Math.asin(Math.min(1, NEEDLE.fJ / (NEEDLE.mJ * Bh))) / DEG;
  }
  /** 小角度擺動週期（s） */
  function needlePeriod(Bh) { return Bh > 0 ? 2 * Math.PI / Math.sqrt(NEEDLE.mJ * Bh) : Infinity; }

  /**
   * 磁針前進 dt 秒：st = { phi, om, stuck }；opts = { friction, damp }。
   * RK4（固定子步長 ≤ 1/600 s）；含摩擦時用庫侖摩擦：靜止且磁力矩 ≤ 摩擦力矩就卡住不動。
   */
  function stepNeedle(st, Bx, By, dt, opts) {
    opts = opts || {};
    const damp = opts.damp !== false, fr = !!opts.friction;
    const n = Math.max(1, Math.ceil(dt / (1 / 600)));
    const h = dt / n;
    let phi = st.phi, om = st.om, stuck = !!st.stuck;
    for (let i = 0; i < n; i++) {
      if (fr) {
        const tq = NEEDLE.mJ * (Bx * Math.cos(phi) - By * Math.sin(phi));
        if (stuck || Math.abs(om) < 1e-4) {
          if (Math.abs(tq) <= NEEDLE.fJ) { om = 0; stuck = true; continue; }
          stuck = false;
        }
      }
      const f = function (p, w) {
        let acc = needleAcc(p, w, Bx, By, damp);
        if (fr) acc -= NEEDLE.fJ * (w > 0 ? 1 : w < 0 ? -1 : Math.sign(acc));
        return acc;
      };
      const k1p = om, k1w = f(phi, om);
      const k2p = om + 0.5 * h * k1w, k2w = f(phi + 0.5 * h * k1p, om + 0.5 * h * k1w);
      const k3p = om + 0.5 * h * k2w, k3w = f(phi + 0.5 * h * k2p, om + 0.5 * h * k2w);
      const k4p = om + h * k3w, k4w = f(phi + h * k3p, om + h * k3w);
      const nphi = phi + h / 6 * (k1p + 2 * k2p + 2 * k3p + k4p);
      let nom = om + h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
      if (fr && om !== 0 && nom * om < 0) nom = 0; // 摩擦讓它在這一步停下
      phi = nphi; om = nom;
    }
    st.phi = wrapRad(phi); st.om = om; st.stuck = stuck;
    return st;
  }

  // ---------------- 圓線圈 ----------------
  /** 第一類與第二類完全橢圓積分 K(m)、E(m)，m = k²（算術幾何平均） */
  function ellipKE(m) {
    let a = 1, b = Math.sqrt(Math.max(0, 1 - m)), c = Math.sqrt(Math.max(0, m)), sum = 0.5 * c * c, p2 = 1;
    for (let i = 0; i < 40 && Math.abs(c) > 1e-17; i++) {
      const an = (a + b) / 2, bn = Math.sqrt(a * b);
      c = (a - b) / 2; a = an; b = bn; p2 *= 2; sum += p2 * 0.5 * c * c;
    }
    const K = Math.PI / (2 * a);
    return { K: K, E: K * (1 - sum) };
  }
  /** 單匝圓電流（半徑 R、電流 I，在 z = 0 平面）在 (ρ, z) 的磁場；ρ 可為負（平面下半部），Br 為沿平面 +y 的分量 */
  function loopField(R, I, rho, z) {
    const r = Math.abs(rho);
    if (r < 1e-9 * R) return { Br: 0, Bz: MU0 * I * R * R / (2 * Math.pow(R * R + z * z, 1.5)) };
    const s2 = R * R + r * r + z * z;
    const a2 = s2 - 2 * R * r, b2 = s2 + 2 * R * r, b = Math.sqrt(b2);
    if (a2 <= 0) return { Br: NaN, Bz: NaN };
    const ke = ellipKE(1 - a2 / b2), C = MU0 * I / Math.PI;
    const Br = C * z / (2 * a2 * b * r) * (s2 * ke.E - a2 * ke.K);
    const Bz = C / (2 * a2 * b) * ((R * R - r * r - z * z) * ke.E + a2 * ke.K);
    return { Br: rho < 0 ? -Br : Br, Bz: Bz };
  }
  /** 圓電流的磁通函數 ψ = ρ A_φ（磁力線是 ψ 的等值線；通過半徑 ρ 圓面的通量 = 2πψ） */
  function loopPsi(R, I, rho, z) {
    const r = Math.abs(rho);
    if (r < 1e-12) return 0;
    const m = 4 * R * r / ((R + r) * (R + r) + z * z), k = Math.sqrt(m), ke = ellipKE(m);
    return r * MU0 * I / (Math.PI * k) * Math.sqrt(R / r) * ((1 - m / 2) * ke.K - ke.E);
  }
  function coilField(N, R, I, rho, z) { const f = loopField(R, I, rho, z); return { Br: N * f.Br, Bz: N * f.Bz }; }
  function coilAxis(N, R, I, z) { return MU0 * N * I * R * R / (2 * Math.pow(R * R + z * z, 1.5)); }
  function coilCenter(N, R, I) { return MU0 * N * I / (2 * R); }

  // ---------------- 螺線管（面電流） ----------------
  /** Bulirsch 的廣義完全橢圓積分 C(kc, p, c, s) = ∫0^{π/2} (c cos²φ + s sin²φ) / ((cos²φ + p sin²φ) √(cos²φ + kc² sin²φ)) dφ */
  function cel(kc, p, c, s) {
    if (kc === 0) return NaN;
    const tol = 1e-13;
    let k = Math.abs(kc), pp = p, cc = c, ss = s, em = 1, f, g, q, kk;
    if (p > 0) { pp = Math.sqrt(p); ss = s / pp; }
    else { f = kc * kc; q = 1 - f; g = 1 - pp; f = f - pp; q = q * (ss - c * pp); pp = Math.sqrt(f / g); cc = (c - ss) / g; ss = -q / (g * g * pp) + cc * pp; }
    f = cc; cc = cc + ss / pp; g = k / pp; ss = 2 * (ss + f * g); pp = g + pp; g = em; em = k + em; kk = k;
    for (let it = 0; it < 60 && Math.abs(g - k) > g * tol; it++) {
      k = 2 * Math.sqrt(kk); kk = k * em; f = cc; cc = cc + ss / pp; g = kk / pp; ss = 2 * (ss + f * g); pp = g + pp; g = em; em = k + em;
    }
    return (Math.PI / 2) * (ss + cc * em) / (em * (em + pp));
  }
  /** 有限長螺線管（每單位長度 n 匝、長 L、半徑 R、電流 I、中心在原點、軸沿 z）在 (ρ, z) 的磁場 */
  function solenoidField(n, L, R, I, rho, z) {
    const r = Math.abs(rho), b = L / 2, B0 = MU0 * n * I / Math.PI;
    const zp = z + b, zm = z - b;
    const dp = Math.sqrt(zp * zp + (r + R) * (r + R)), dm = Math.sqrt(zm * zm + (r + R) * (r + R));
    const kp = Math.sqrt(zp * zp + (R - r) * (R - r)) / dp, km = Math.sqrt(zm * zm + (R - r) * (R - r)) / dm;
    if (kp === 0 || km === 0) return { Br: NaN, Bz: NaN };
    const g = (R - r) / (R + r);
    const Br = B0 * (R / dp * cel(kp, 1, 1, -1) - R / dm * cel(km, 1, 1, -1));
    const Bz = B0 * R / (R + r) * (zp / dp * cel(kp, g * g, 1, g) - zm / dm * cel(km, g * g, 1, g));
    return { Br: rho < 0 ? -Br : Br, Bz: Bz };
  }
  /** 軸上：B = ½ μ0 n I (cos α1 − cos α2) */
  function solenoidAxis(n, L, R, I, z) {
    const b = L / 2;
    return 0.5 * MU0 * n * I * ((z + b) / Math.hypot(z + b, R) - (z - b) / Math.hypot(z - b, R));
  }
  function solenoidIdeal(n, I) { return MU0 * n * I; }

  // ---------------- 平面上的磁場（模擬畫面用） ----------------
  /**
   * P = { shape: 'wire'|'coil'|'solenoid', I, s, N, R, L }（m、A）；(x, y) 為平面座標（m）。
   * 傳回 { bx, by }（T）。
   */
  function planeField(P, x, y) {
    const I = P.I * (P.s < 0 ? -1 : 1);
    if (P.shape === 'wire') {
      const r2 = x * x + y * y;
      if (r2 === 0) return { bx: NaN, by: NaN };
      const k = K2 * I / r2;
      return { bx: -k * y, by: k * x };
    }
    if (P.shape === 'coil') { const f = coilField(P.N, P.R, I, y, x); return { bx: f.Bz, by: f.Br }; }
    const f = solenoidField(P.N / P.L, P.L, P.R, I, y, x);
    return { bx: f.Bz, by: f.Br };
  }
  /** 課本公式（探測點的比較值）；沒有適用公式時為 null */
  function formulaAt(P, x, y) {
    const I = Math.abs(P.I);
    if (P.shape === 'wire') return { kind: 'wire', B: wireB(I, Math.hypot(x, y)) };
    if (P.shape === 'coil') return Math.abs(y) <= 5e-4 ? { kind: 'coilAxis', B: coilAxis(P.N, P.R, I, x) } : null;
    return { kind: 'ideal', B: solenoidIdeal(P.N / P.L, I), axis: Math.abs(y) <= 5e-4 ? solenoidAxis(P.N / P.L, P.L, P.R, I, x) : null };
  }
  /** 導線所在處（磁場發散）：[[x, y, r], …]，r 為該處的「導線半徑」 */
  function conductors(P, wireR) {
    wireR = wireR || 0.002;
    if (P.shape === 'wire') return [[0, 0, wireR]];
    if (P.shape === 'coil') return [[0, P.R, wireR], [0, -P.R, wireR]];
    return []; // 螺線管是面電流：在繞線上不發散，但追線時要避開
  }

  /**
   * 沿磁力線追蹤（RK4，對單位方向積分，弧長步長 ds）。
   * opt = { ds, maxLen, box: [x0, y0, x1, y1], avoid: (x, y) → 到奇異處的距離（< 0 表示進入）, dir: ±1 }
   * 傳回 { pts: [[x, y], …], closed }
   */
  function traceLine(field, x0, y0, opt) {
    const ds0 = opt.ds, box = opt.box, dir = opt.dir || 1, maxLen = opt.maxLen || 10;
    const pts = [[x0, y0]];
    let x = x0, y = y0, len = 0, closed = false;
    const unit = function (px, py) {
      const b = field(px, py), m = Math.hypot(b.bx, b.by);
      if (!(m > 0) || !isFinite(m)) return null;
      return [dir * b.bx / m, dir * b.by / m];
    };
    for (let i = 0; i < 20000 && len < maxLen; i++) {
      let ds = ds0;
      if (opt.avoid) {
        const dd = opt.avoid(x, y);
        if (dd < 0) break;
        ds = Math.max(ds0 * 0.08, Math.min(ds0, 0.35 * dd));
      }
      const k1 = unit(x, y); if (!k1) break;
      const k2 = unit(x + 0.5 * ds * k1[0], y + 0.5 * ds * k1[1]); if (!k2) break;
      const k3 = unit(x + 0.5 * ds * k2[0], y + 0.5 * ds * k2[1]); if (!k3) break;
      const k4 = unit(x + ds * k3[0], y + ds * k3[1]); if (!k4) break;
      x += ds / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += ds / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      len += ds;
      pts.push([x, y]);
      if (box && (x < box[0] || y < box[1] || x > box[2] || y > box[3])) break;
      if (len > 6 * ds0 && Math.hypot(x - x0, y - y0) < 0.75 * ds) { pts.push([x0, y0]); closed = true; break; }
    }
    return { pts: pts, closed: closed, len: len };
  }

  /** 長直導線：同心圓半徑（等比；相鄰兩圓之間 ∫B dr = perLine），只取 [rMin, rMax] 之內 */
  function wireRadii(I, perLine, rMin, rMax) {
    if (!(I > 0)) return [];
    const step = perLine / (K2 * I); // ln(r_{k+1}/r_k)
    const out = [];
    const k0 = Math.ceil(Math.log(rMin / 0.01) / step), k1 = Math.floor(Math.log(rMax / 0.01) / step);
    for (let k = k0; k <= k1 && out.length < 80; k++) out.push(0.01 * Math.exp(k * step));
    return out;
  }

  /**
   * 剖面（2D）磁力線的起點：中央平面 x = 0 上，0 < |y| < yMax，相鄰兩點之間 ∫|Bx| dy = perLine。
   * 傳回 y 值（正負對稱）。
   */
  function midplaneSeeds2D(P, perLine, yMax, maxN) {
    const M = 600, ys = [], cum = [0];
    let prev = Math.abs(planeField(P, 0, 1e-7 * yMax).bx);
    for (let i = 1; i <= M; i++) {
      const y = yMax * i / M, b = Math.abs(planeField(P, 0, y).bx);
      cum.push(cum[i - 1] + 0.5 * (prev + b) * yMax / M);
      prev = b;
    }
    const total = cum[M];
    if (!(total > 0) || !(perLine > 0)) return [];
    let n = Math.floor(total / perLine + 0.5);
    if (maxN) n = Math.min(n, maxN);
    for (let k = 0; k < n; k++) {
      const target = (k + 0.5) / n * total;
      let i = 1; while (i < M && cum[i] < target) i++;
      const y = yMax * ((i - 1) + (target - cum[i - 1]) / Math.max(1e-300, cum[i] - cum[i - 1])) / M;
      ys.push(y, -y);
    }
    return ys;
  }

  /**
   * 立體磁力線的起點：中央平面 ρ < rhoMax 的圓盤上，每條線圍住的通量相等（向日葵排列）。
   * 傳回 [{ rho, phi }]（每條線帶的通量 = 總通量 / n）。
   */
  function diskSeeds3D(P, perLine, rhoMax, maxN) {
    const M = 600, cum = [0];
    let prev = 0;
    for (let i = 1; i <= M; i++) {
      const r = rhoMax * i / M, f = Math.abs(planeField(P, 0, r).bx) * 2 * Math.PI * r;
      cum.push(cum[i - 1] + 0.5 * (prev + f) * rhoMax / M);
      prev = f;
    }
    const total = cum[M];
    if (!(total > 0) || !(perLine > 0)) return { seeds: [], flux: total };
    let n = Math.floor(total / perLine + 0.5);
    if (maxN) n = Math.min(n, maxN);
    const out = [], GA = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < n; k++) {
      const target = (k + 0.5) / n * total;
      let i = 1; while (i < M && cum[i] < target) i++;
      const rho = rhoMax * ((i - 1) + (target - cum[i - 1]) / Math.max(1e-300, cum[i] - cum[i - 1])) / M;
      out.push({ rho: rho, phi: k * GA });
    }
    return { seeds: out, flux: total, perLine: n ? total / n : 0 };
  }

  // ---------------- 數據分析 ----------------
  /** 通過原點的最小平方直線 y = kx */
  function fitOrigin(xs, ys) {
    let sxy = 0, sxx = 0;
    for (let i = 0; i < xs.length; i++) { sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; }
    return sxx > 0 ? sxy / sxx : NaN;
  }
  /** 一般最小平方直線 y = a + bx */
  function fitLine(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    const den = n * sxx - sx * sx;
    if (!(Math.abs(den) > 0)) return null;
    const slope = (n * sxy - sx * sy) / den;
    return { slope: slope, intercept: (sy - slope * sx) / n };
  }
  /**
   * 正切法：rows = [{ I (A，電流表讀數), r (cm), theta (deg，讀數；東為正), s (±1), above }]，BHtrue (T)。
   * 每列 B導線 = μ0 I/(2π r)；以 B導線 對 tan|θ| 作圖，通過原點的斜率 = BH。
   * 正反向平均：同樣 I、r、上下位置但電流方向相反的兩列，θ = |θ1 − θ2|/2（消去刻度盤零點的偏差）。
   */
  function tangentAnalysis(rows, BHtrue) {
    const BI = [], tn = [];
    const Is = {}, Rs = {};
    let rMin = Infinity, rMax = 0;
    rows.forEach(function (r) {
      const t = Math.tan(Math.abs(r.theta) * DEG);
      if (!(t > 0) || !isFinite(t)) return;
      BI.push(wireB(r.I, r.r / 100)); tn.push(t);
      Is[r.I.toFixed(3)] = 1; Rs[r.r.toFixed(2)] = 1;
      rMin = Math.min(rMin, r.r); rMax = Math.max(rMax, r.r);
    });
    const out = { n: BI.length, nI: Object.keys(Is).length, nR: Object.keys(Rs).length, rRatio: BI.length ? rMax / rMin : 0 };
    out.BH = BI.length ? fitOrigin(tn, BI) : NaN;
    out.err = BHtrue ? out.BH / BHtrue - 1 : NaN;
    // 正反向配對
    const used = {}, pairs = [];
    for (let i = 0; i < rows.length; i++) {
      if (used[i]) continue;
      for (let j = i + 1; j < rows.length; j++) {
        if (used[j]) continue;
        const a = rows[i], b = rows[j];
        if (a.s === b.s || !!a.above !== !!b.above || Math.abs(a.I - b.I) > 5e-4 || Math.abs(a.r - b.r) > 5e-3) continue;
        const th = Math.abs(a.theta - b.theta) / 2;
        if (!(th > 0) || th >= 90) continue;
        used[i] = used[j] = true;
        pairs.push({ I: a.I, r: a.r, theta: th, BI: wireB(a.I, a.r / 100), tan: Math.tan(th * DEG) });
        break;
      }
    }
    out.pairs = pairs;
    out.nPair = pairs.length;
    out.BHpair = pairs.length ? fitOrigin(pairs.map(function (p) { return p.tan; }), pairs.map(function (p) { return p.BI; })) : NaN;
    out.errPair = BHtrue ? out.BHpair / BHtrue - 1 : NaN;
    return out;
  }

  const api = {
    MU0: MU0, MU0_U: MU0_U, K2: K2, EARTH: EARTH, earth: earth, NEEDLE: NEEDLE, DEG: DEG, wrapDeg: wrapDeg,
    wireB: wireB, oerstedField: oerstedField, needleAcc: needleAcc, needleEnergy: needleEnergy, deadBand: deadBand,
    needlePeriod: needlePeriod, stepNeedle: stepNeedle,
    ellipKE: ellipKE, loopField: loopField, loopPsi: loopPsi, coilField: coilField, coilAxis: coilAxis, coilCenter: coilCenter,
    cel: cel, solenoidField: solenoidField, solenoidAxis: solenoidAxis, solenoidIdeal: solenoidIdeal,
    planeField: planeField, formulaAt: formulaAt, conductors: conductors, traceLine: traceLine,
    wireRadii: wireRadii, midplaneSeeds2D: midplaneSeeds2D, diskSeeds3D: diskSeeds3D,
    fitOrigin: fitOrigin, fitLine: fitLine, tangentAnalysis: tangentAnalysis
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CurrentMagneticFieldCore = api;
})(typeof window !== 'undefined' ? window : this);
