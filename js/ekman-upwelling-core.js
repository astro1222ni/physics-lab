/* ekman-upwelling-core.js — 「洋流與氣候：艾克曼輸送、湧升流與聖嬰」的物理核心（與畫面無關，UMD）
 *
 * 一、艾克曼螺旋（Ekman 1905）：均勻渦黏滯係數 Av、無限深海、穩定狀態。
 *     d = √(2Av/|f|)，艾克曼深度 D_E = πd；表面流速 V0 = τ/(ρ√(Av|f|))，偏離風向 45°（北半球偏右、南半球偏左）；
 *     深度 z（< 0）的流速 V0·e^{z/d}，再多轉 |z|/d 弧度；整層的淨輸送 M = τ/(ρ|f|)，和風向垂直。
 * 二、沿岸湧升（Gill 1982 §10.8 的線性兩層模式）：離岸的艾克曼輸送 M⊥ 由岸邊的湧升補充，
 *     溫躍層上升 η(x, t) = (M⊥ t / R) e^{−x/R}，R = √(g′H1)/|f| 是羅士比變形半徑；岸邊的湧升速度 w = M⊥/R。
 *     各深度的海水整體被抬高 η：位置 (x, z) 的水原本在 z − η，所以溫度、營養鹽 = 原本剖面在 z − η 的值。
 * 三、赤道太平洋（約化重力模式的穩定平衡，Gill 1982 §11；Philander 1990）：
 *     信風應力被溫躍層傾斜造成的壓力梯度平衡，g′H dh/dx = −τx/ρ，東西兩端深度差 Δh = τL/(ρg′H)；
 *     海面的高低差 Δη = (g′/g)Δh（溫躍層深的地方海面高）。東太平洋的海面溫度用示意的關係：
 *     湧升把溫躍層附近的冷水帶上來，溫躍層越淺越冷 —— SST_E = Tw − (Tw − Tc)·e^{−h_E/hs}。
 * 風應力：τ = ρ_air C_D U²，C_D 依 Large & Pond（1981）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EkmanCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OMEGA = 7.2921e-5;      // 地球自轉角速度 rad/s
  const RHO_W = 1025, RHO_A = 1.22, G = 9.81;
  const R = Math.PI / 180;

  function coriolis(lat) { return 2 * OMEGA * Math.sin(lat * R); }
  /** 海面 10 m 風速 U（m/s）的拖曳係數（Large & Pond 1981；4 m/s 以下沿用 1.2×10⁻³） */
  function dragCoeff(U) {
    U = Math.abs(U);
    return U <= 11 ? 1.2e-3 : (0.49 + 0.065 * Math.min(U, 25)) * 1e-3;
  }
  function windStress(U) { return RHO_A * dragCoeff(U) * U * Math.abs(U); }   // 帶正負號
  function wrap360(a) { a %= 360; return a < 0 ? a + 360 : a; }
  /** 方位角（由北順時針）→ 東、北分量 */
  function unit(az) { return [Math.sin(az * R), Math.cos(az * R)]; }
  /** 兩個方位的夾角，順時針為正，−180 到 180 */
  function turn(a, b) { let d = wrap360(b - a); if (d > 180) d -= 360; return d; }

  // ======================================================================
  // 一、艾克曼螺旋
  // ======================================================================
  /**
   * o = { lat（度，|lat| ≥ 1）, U（風速 m/s）, windFrom（風從哪個方位吹來，度）, Av（m²/s） }
   */
  function ekman(o) {
    const f = coriolis(o.lat), af = Math.abs(f), s = f >= 0 ? 1 : -1;
    const tau = windStress(o.U);
    const d = Math.sqrt(2 * o.Av / af), DE = Math.PI * d;
    const V0 = tau / (RHO_W * Math.sqrt(o.Av * af));
    const M = tau / (RHO_W * af);
    const windTo = wrap360(o.windFrom + 180);
    return {
      f: f, s: s, tau: tau, Cd: dragCoeff(o.U), d: d, DE: DE, V0: V0, M: M, windTo: windTo,
      surfAz: wrap360(windTo + 45 * s),      // 表面流：北半球偏右 45°
      transAz: wrap360(windTo + 90 * s),     // 淨輸送：北半球偏右 90°
      ratio: o.U > 0 ? V0 / o.U : 0          // 表面流速 ÷ 風速
    };
  }
  /** 深度 z（m，向下為負）的流速：{ speed, az（方位）, e, n（東、北分量） } */
  function ekmanAt(E, z) {
    const speed = E.V0 * Math.exp(z / E.d);
    const az = wrap360(E.windTo + E.s * (45 - z / E.d / R));
    const u = unit(az);
    return { speed: speed, az: az, e: speed * u[0], n: speed * u[1] };
  }
  /** 數值積分整層的輸送（測試用） */
  function ekmanTransport(E, zmax, n) {
    zmax = zmax || 12 * E.d; n = n || 20000;
    let e = 0, nn = 0;
    const h = zmax / n;
    for (let i = 0; i <= n; i++) {
      const w = i === 0 || i === n ? 0.5 : 1, v = ekmanAt(E, -i * h);
      e += w * v.e * h; nn += w * v.n * h;
    }
    return { e: e, n: nn, M: Math.hypot(e, nn), az: wrap360(Math.atan2(e, nn) / R) };
  }

  // ======================================================================
  // 二、沿岸湧升
  // ======================================================================
  const GP_COAST = 0.02;        // 沿岸上下層的約化重力 g′ = gΔρ/ρ（Δρ ≈ 2 kg/m³）
  // 典型的海洋上層剖面（示意值）：表層混合層溫度 Ts，以下指數降到 Td；營養鹽（硝酸鹽）在混合層幾乎是 0
  const T_S = 20, T_D = 8, H_T = 60;          // °C、°C、m
  const N_D = 25, H_N = 60;                   // μmol/L、m
  function tempAt(z, H1) { return z >= -H1 ? T_S : T_D + (T_S - T_D) * Math.exp((z + H1) / H_T); }
  function nitrateAt(z, H1) { return z >= -H1 ? 0 : N_D * (1 - Math.exp((z + H1) / H_N)); }
  /**
   * o = { lat, U, windFrom, coast（'W'：海在西邊、陸地在東，例如加州、秘魯；'E'：海在東邊）, H1（表層暖水厚度 m）, days }
   */
  function coastal(o) {
    const E = ekman({ lat: o.lat, U: o.U, windFrom: o.windFrom, Av: 0.02 });
    const offAz = o.coast === 'W' ? 270 : 90;              // 離岸方向
    const Moff = E.M * Math.cos((E.transAz - offAz) * R);  // 離岸的輸送 m²/s（每公尺海岸 m³/s）
    const c = Math.sqrt(GP_COAST * o.H1), Rd = c / Math.abs(E.f);
    const t = o.days * 86400;
    const w = Moff / Rd;                                   // 岸邊的湧升速度 m/s
    const eta0 = Moff * t / Rd;                            // 岸邊溫躍層上升的高度 m（負＝下沉）
    const out = eta0 >= o.H1;                              // 冷水在岸邊露出海面
    const front = out ? Rd * Math.log(eta0 / o.H1) : 0;    // 冷水露頭到離岸多遠
    const tOut = Moff > 0 ? o.H1 * Rd / Moff / 86400 : Infinity;   // 幾天後冷水露頭
    const C = {
      E: E, offAz: offAz, Moff: Moff, along: E.M * Math.sin((E.transAz - offAz) * R),
      bakun: Moff * 100,                                   // 湧升指數：每 100 m 海岸 m³/s
      Rd: Rd, c: c, w: w, wDay: w * 86400, eta0: eta0, out: out, front: front, tOut: tOut,
      H1: o.H1, days: o.days
    };
    C.sst0 = sstAt(C, 0);
    C.no3 = nitrateAt(Math.min(0, -etaAt(C, 0)), o.H1);
    return C;
  }
  function etaAt(C, x) { return C.eta0 * Math.exp(-x / C.Rd); }
  /** 抬升後 (x, z) 的溫度：原本在 z − η 的水 */
  function tempXZ(C, x, z) { return tempAt(z - etaAt(C, x), C.H1); }
  function nitrateXZ(C, x, z) { return nitrateAt(z - etaAt(C, x), C.H1); }
  function sstAt(C, x) { return tempXZ(C, x, 0); }

  // ======================================================================
  // 三、赤道太平洋
  // ======================================================================
  const L_PAC = 1.5e7;          // 赤道太平洋寬約 15000 km（120°E–80°W）
  const H_EQ = 120, GP_EQ = 0.04; // 平均溫躍層深度 m、約化重力 m/s²
  const TW = 29.5, TC = 20, HS = 40; // 暖池溫度、溫躍層的溫度（赤道上習慣用 20 °C 等溫線的深度當溫躍層深度）、深度尺度（示意）
  const U_NORMAL = 6;            // 平常的赤道信風約 6 m/s
  const TAU_NORMAL = windStress(U_NORMAL);
  /**
   * o = { p（信風應力是平常的幾倍；1 = 平常、0 = 無風、負 = 西風） }
   * 應力和風速平方成正比，所以等效風速 = 6 m/s × √|p|。
   */
  function equator(o) {
    const p = o.p, tau = p * TAU_NORMAL;                // 正＝往西吹
    const dh = tau * L_PAC / (RHO_W * GP_EQ * H_EQ);   // 西邊比東邊深多少
    const hERaw = H_EQ - dh / 2;
    const hW = Math.max(0, H_EQ + dh / 2), hE = Math.max(0, hERaw);
    const deta = GP_EQ / G * dh;                       // 西邊海面比東邊高多少（m）
    return { p: p, U: (p < 0 ? -1 : 1) * U_NORMAL * Math.sqrt(Math.abs(p)), tau: tau, dh: dh, hW: hW, hE: hE, hERaw: hERaw,
      outcrop: hERaw <= 0 || H_EQ + dh / 2 <= 0, deta: deta, sstE: sstFromH(hE), sstW: sstFromH(hW), slope: -dh / L_PAC };
  }
  function sstFromH(h) { return TW - (TW - TC) * Math.exp(-Math.max(0, h) / HS); }
  /** 東經 120° 到西經 80° 之間，位置 x（0 = 西端、1 = 東端）的溫躍層深度 */
  function thermoAt(Q, x) { return Math.max(0, H_EQ + Q.dh * (0.5 - x)); }
  const NORMAL = (function () {   // 平常的信風當作比較的基準
    const dh = TAU_NORMAL * L_PAC / (RHO_W * GP_EQ * H_EQ);
    return { U: U_NORMAL, tau: TAU_NORMAL, hE: H_EQ - dh / 2, hW: H_EQ + dh / 2, sstE: sstFromH(H_EQ - dh / 2) };
  })();
  /** 狀態：東太平洋海溫比平常高 0.5 °C 以上＝類似聖嬰；低 0.5 °C 以上＝類似反聖嬰 */
  function ensoState(Q) {
    const a = Q.sstE - NORMAL.sstE;
    return { anom: a, state: a >= 0.5 ? 'nino' : a <= -0.5 ? 'nina' : 'neutral' };
  }

  return {
    OMEGA: OMEGA, RHO_W: RHO_W, RHO_A: RHO_A, G: G,
    GP_COAST: GP_COAST, T_S: T_S, T_D: T_D, H_T: H_T, N_D: N_D, H_N: H_N,
    L_PAC: L_PAC, H_EQ: H_EQ, U_NORMAL: U_NORMAL, TAU_NORMAL: TAU_NORMAL, GP_EQ: GP_EQ, TW: TW, TC: TC, HS: HS,
    coriolis: coriolis, dragCoeff: dragCoeff, windStress: windStress, wrap360: wrap360, unit: unit, turn: turn,
    ekman: ekman, ekmanAt: ekmanAt, ekmanTransport: ekmanTransport,
    tempAt: tempAt, nitrateAt: nitrateAt, coastal: coastal, etaAt: etaAt, tempXZ: tempXZ, nitrateXZ: nitrateXZ, sstAt: sstAt,
    equator: equator, thermoAt: thermoAt, sstFromH: sstFromH, ensoState: ensoState, NORMAL: NORMAL
  };
});
