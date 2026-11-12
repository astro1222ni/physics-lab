/*
 * ac-generator-core.js — 「交流發電機與變壓器」物理核心（與畫面無關，可單獨以 Node 測試）
 *
 * 單位一律 SI：長度 m、磁場 T、磁通量 Wb、電壓 V、電流 A、電阻 Ω、功率 W、力矩 N·m、時間 s。
 * 交流的電壓、電流讀數一律是「有效值」（rms），另外標明的才是峰值。
 *
 * A. 發電機 gen(p)
 *   N 匝矩形線圈（沿轉軸的長邊 L、寬 w，面積 A = Lw）在均勻磁場 B 中以 ω = 2πf 等速轉動。
 *   θ = 線圈面積向量與 B 的夾角（θ = ωt + θ0）。每一匝的磁通量 Φ = BA cos θ。
 *   電動勢 ε = −N dΦ/dt = NBAω sin θ，峰值 ε_max = NBAω，有效值 ε_max/√2。
 *   另一個觀點：兩條長邊以 v = ωw/2 運動，速度與 B 的夾角使每邊產生 BLv sin θ，
 *   每匝兩邊串聯：ε = 2NBLv sin θ（與上式相同，測試驗證）。
 *   外接負載 R（可開路，R = ∞）與線圈電阻 r；忽略線圈自感，所以 i = ε/(R + r) 與 ε 同相。
 *   換向器（直流發電機）：線圈內的電流仍是交流，但每半圈把接到外電路的兩端對調，外電路得到 |ε|、|i|。
 *   冷次定律：電流 i 在磁場中受力，對轉軸的力矩 τ = N i A B sin θ（方向永遠阻礙轉動）；
 *   維持等速轉動要由外界提供同樣大小的力矩，機械功率 τω = i²(R + r) 每一瞬間都等於電功率。
 *
 * B. 變壓器 xf(p)
 *   理想變壓器（無漏磁、無鐵損與銅損、鐵心導磁率視為無限大、不飽和）：V2/V1 = N2/N1、I1V1 = I2V2，
 *   從一次側看的等效電阻 R' = (N1/N2)² R_L。電源可選：固定交流電源、接發電機（含線圈電阻 r，用電路解）。
 *   鐵心磁通量 Φ_core(t) = (1/N1)∫v1 dt，峰值 √2 V1 /(N1 ω)；除以鐵心截面積得到磁通密度，用來提醒「快要飽和」。
 *   直流電源 dcStep(p)：理想模型在直流下沒有意義（磁通量會無限增加），所以另外給示意的一次線圈電阻
 *   R1 = ρ_N N1 與磁化電感 Lm = Λ N1²（Λ = μ0 μr A_core / l_core）。開關接通後
 *     磁化電流 i_m = (V/R1)(1 − e^(−t/τ))，τ = Lm (R1 + R')/(R1 R')，一次側線圈兩端 v_p = V R'/(R1 + R') e^(−t/τ)，
 *     二次側 v2 = (N2/N1) v_p → 0：鐵心的磁通量不再改變，就沒有感應電動勢。
 *   開關切斷後一次側開路，磁化電流只能經由二次側的負載放掉：v_p = −i_m0 R' e^(−t/τ_off)，τ_off = Lm / R'。
 *
 * C. 遠距輸電 grid(p)
 *   發電機（有效值 Vg）→ 升壓 1 : k1 → 輸電線（來回總電阻 R_line）→ 降壓 k2 : 1 → 用戶負載 R_u。
 *   用戶負載以「在額定電壓 V_rated 時的功率 P_rated」描述：R_u = V_rated² / P_rated（純電阻）。
 *   全部是理想變壓器，把 R_u 反射到輸電線上：R_u' = k2² R_u，整條線是一個串聯電路：
 *     I_line = k1 Vg / (R_line + k2² R_u)，線損 I_line² R_line，用戶電壓 V_u = I_line k2 R_u，效率 = R_u' / (R_line + R_u')。
 */
(function (root) {
  'use strict';
  const TAU = 2 * Math.PI;
  const SQRT2 = Math.SQRT2;
  const MU0 = 1.25663706127e-6;           // 真空磁導率 μ0（CODATA 2022：1.256 637 061 27(20) × 10^-6 N/A²）

  // 示意用的鐵心與線圈（理想變壓器以外的量：飽和提醒與直流暫態）
  const CORE = {
    A: 25e-4,          // 鐵心截面積 25 cm²（5 cm × 5 cm）
    l: 0.40,           // 平均磁路長度 40 cm
    mur: 2000,         // 矽鋼片的相對導磁率（示意值，未飽和時約數千）
    Bwarn: 1.7,        // 磁通密度峰值超過 1.7 T 時提醒接近飽和（矽鋼片飽和約 1.8–2.0 T）
    rhoN: 0.01         // 一次線圈每一匝的電阻 0.01 Ω（直流暫態用）
  };
  CORE.perm = MU0 * CORE.mur * CORE.A / CORE.l;   // 磁導 Λ（H/匝²），Lm = Λ N1²

  const isOpen = function (R) { return !(R < Infinity); };

  // ======================= A. 發電機 =======================
  /**
   * p = { N, B, L, w, f, R（Ω；Infinity 表示開路）, r, commutator（true＝換向器）}
   * 傳回常數量與 at(θ) 瞬時值。
   */
  function gen(p) {
    const N = +p.N, B = +p.B, L = +p.L, w = +p.w, f = +p.f, r = Math.max(0, +p.r || 0);
    const R = isOpen(p.R) ? Infinity : Math.max(0, +p.R);
    const open = !isFinite(R);
    const A = L * w, omega = TAU * f;
    const epsMax = N * B * A * omega;
    const Rt = open ? Infinity : R + r;               // 迴路總電阻
    const iMax = open ? 0 : epsMax / Rt;
    const v = omega * w / 2;                          // 長邊的速率
    const commutator = !!p.commutator;
    const g = {
      N: N, B: B, L: L, w: w, f: f, R: R, r: r, open: open, commutator: commutator,
      A: A, omega: omega, period: f > 0 ? 1 / f : Infinity, v: v,
      phiMax: B * A,                                  // 每一匝的磁通量峰值（Wb）
      linkMax: N * B * A,                             // 磁通鏈 NΦ 的峰值（Wb）
      epsMax: epsMax, epsRms: epsMax / SQRT2,
      epsAvgDC: 2 * epsMax / Math.PI,                 // 換向器輸出的平均值（直流成分）
      Rt: Rt, iMax: iMax, iRms: iMax / SQRT2,
      VRmax: open ? epsMax : iMax * R,                // 負載兩端電壓峰值（開路時就是 ε）
      VRrms: (open ? epsMax : iMax * R) / SQRT2,
      Pavg: open ? 0 : epsMax * epsMax / (2 * Rt),    // 平均總電功率 = 平均機械功率
      PR: open ? 0 : iMax * iMax * R / 2,             // 負載得到的平均功率
      Pr: open ? 0 : iMax * iMax * r / 2,             // 線圈電阻的平均發熱
      tauMax: open || omega === 0 ? 0 : N * iMax * A * B,   // 外力矩峰值（θ = 90° 時）
      at: function (theta) { return genAt(g, theta); }
    };
    g.tauAvg = g.tauMax / 2;
    g.IoutAvg = commutator ? 2 * iMax / Math.PI : 0;
    return g;
  }
  /** 線圈轉到 θ（rad）時的瞬時值 */
  function genAt(g, theta) {
    const s = Math.sin(theta), c = Math.cos(theta);
    const eps = g.epsMax * s;
    const i = g.open ? 0 : eps / g.Rt;                // 線圈內的電流（交流）
    const sign = g.commutator ? (s < 0 ? -1 : 1) : 1; // 換向器：每半圈對調外電路的接頭
    const tau = g.N * i * g.A * g.B * s;              // 阻礙轉動的力矩大小（≥ 0），外力要提供同樣大小
    return {
      theta: theta, phi: g.B * g.A * c, link: g.N * g.B * g.A * c, eps: eps,
      epsSides: 2 * g.N * g.B * g.L * g.v * s,       // 兩條長邊切割磁力線的觀點
      out: sign * eps,                                // 接到外電路的電動勢（換向器時 = |ε|）
      i: i, iOut: sign * i,
      vR: g.open ? sign * eps : sign * i * g.R,       // 負載兩端電壓
      p: g.open ? 0 : eps * i,                        // 瞬時總電功率 i²(R + r)
      pR: g.open ? 0 : i * i * g.R,
      tau: tau, pMech: tau * g.omega,                 // 外力矩、外力的機械功率
      sideForce: g.N * i * g.L * g.B                  // 每條長邊受的磁力大小（N 匝合計，垂直於 B）
    };
  }
  /** 開始時刻 θ0 起經過時間 t 的角度 */
  function thetaAt(g, t, theta0) { return (theta0 || 0) + g.omega * t; }
  /** 角度化成 0–360° */
  function degNorm(theta) { let d = theta * 180 / Math.PI % 360; if (d < 0) d += 360; return d; }

  // ======================= B. 變壓器 =======================
  /**
   * p = { N1, N2, RL, source: 'ac'|'gen'|'dc', V1（ac 時的有效值）, f（ac 時）, gen（source = 'gen' 時的 gen() 結果，使用滑環）}
   * 交流穩態（理想變壓器）。source = 'dc' 時穩態只剩一次側電阻：V2 = 0、I1 = V/R1（另見 dcStep）。
   */
  function xf(p) {
    const N1 = +p.N1, N2 = +p.N2, RL = Math.max(1e-9, +p.RL);
    const a = N1 / N2, ratio = N2 / N1;
    const Req = a * a * RL;                          // 從一次側看的等效電阻
    const src = p.source || 'ac';
    const o = { N1: N1, N2: N2, RL: RL, a: a, ratio: ratio, Req: Req, source: src };
    o.R1 = CORE.rhoN * N1;
    o.Lm = CORE.perm * N1 * N1;
    if (src === 'dc') {
      const V = +p.V1;
      o.f = 0; o.omega = 0; o.V1 = V;
      o.V2 = 0; o.I2 = 0; o.P2 = 0;
      o.I1 = V / o.R1; o.P1 = V * o.I1;              // 穩態：一次側只剩線圈電阻，全部變成熱
      o.phiCore = o.Lm * o.I1 / N1;                  // 穩態鐵心磁通量（未考慮飽和）
      o.Bcore = o.phiCore / CORE.A;
      o.sat = o.Bcore > CORE.Bwarn;
      o.at = function () { return { v1: V, v2: 0, i1: o.I1, i2: 0, phi: o.phiCore }; };
      return o;
    }
    let V1, f, Vemf = null, rs = 0;
    if (src === 'gen') {
      const g = p.gen;
      f = g.f; rs = g.r; Vemf = g.epsRms;
      V1 = Vemf * Req / (Req + rs);                 // 發電機線圈電阻 r 與 R' 分壓
    } else { V1 = +p.V1; f = +p.f; }
    const omega = TAU * f;
    o.f = f; o.omega = omega; o.V1 = V1; o.Vemf = Vemf; o.rs = rs;
    o.V2 = V1 * ratio;
    o.I2 = o.V2 / RL;
    o.I1 = o.I2 * ratio;                              // = V1 / R'
    o.P1 = V1 * o.I1; o.P2 = o.V2 * o.I2;
    o.phiCore = omega > 0 ? SQRT2 * V1 / (N1 * omega) : Infinity;   // 鐵心磁通量峰值（Wb）
    o.Bcore = o.phiCore / CORE.A;
    o.sat = !(o.Bcore <= CORE.Bwarn);
    o.Pgen = Vemf != null ? Vemf * Vemf / (Req + rs) : o.P1;        // 發電機產生的總功率（含線圈發熱）
    o.at = function (t) {
      const s = Math.sin(omega * t), c = Math.cos(omega * t);
      const v1 = SQRT2 * V1 * s;
      return { v1: v1, v2: v1 * ratio, i1: SQRT2 * o.I1 * s, i2: SQRT2 * o.I2 * s, phi: -o.phiCore * c };
    };
    return o;
  }

  /**
   * 直流電源的開關暫態。p = { N1, N2, RL, V }。
   * on(t)：接通後 t 秒；off(t, im0)：從磁化電流 im0 切斷後 t 秒。
   */
  function dcStep(p) {
    const N1 = +p.N1, N2 = +p.N2, RL = Math.max(1e-9, +p.RL), V = +p.V;
    const a = N1 / N2, Rp = a * a * RL;
    const R1 = CORE.rhoN * N1, Lm = CORE.perm * N1 * N1;
    const Rth = R1 * Rp / (R1 + Rp);
    const tau = Lm / Rth, tauOff = Lm / Rp;
    const imF = V / R1;
    const d = {
      N1: N1, N2: N2, RL: RL, V: V, R1: R1, Lm: Lm, Rp: Rp, tau: tau, tauOff: tauOff, imFinal: imF,
      vpPeak: V * Rp / (R1 + Rp), v2Peak: V * Rp / (R1 + Rp) / a,
      on: function (t, im0) {
        // 一般化：接通時磁化電流已有 im0（例如切斷後很快又接通）
        im0 = im0 || 0;
        const e = Math.exp(-Math.max(0, t) / tau);
        const im = imF + (im0 - imF) * e;
        // v_p = Lm di_m/dt = Lm (imF − im0)/τ · e
        const vp = Lm * (imF - im0) / tau * e;
        const i1 = (V - vp) / R1;
        return { im: im, vp: vp, v1: V, v2: vp / a, i1: i1, i2: vp / a / RL, phi: Lm * im / N1 };
      },
      off: function (t, im0) {
        const e = Math.exp(-Math.max(0, t) / tauOff);
        const im = im0 * e;
        const vp = -im0 * Rp * e;
        return { im: im, vp: vp, v1: vp, v2: vp / a, i1: 0, i2: vp / a / RL, phi: Lm * im / N1 };
      }
    };
    return d;
  }

  // ======================= C. 遠距輸電 =======================
  /** p = { Vg（V 有效值）, k1（升壓比 1 : k1）, Rline（Ω，來回總電阻）, k2（降壓比 k2 : 1）, Prated（W）, Vrated（V）} */
  function grid(p) {
    const Vg = +p.Vg, k1 = +p.k1, k2 = +p.k2, Rline = Math.max(0, +p.Rline);
    const Prated = +p.Prated, Vrated = +p.Vrated;
    const Ru = Vrated * Vrated / Prated;
    const Rref = k2 * k2 * Ru;                       // 用戶負載反射到輸電線上的電阻
    const VL = k1 * Vg;                              // 送電端的線電壓
    const IL = VL / (Rline + Rref);
    const drop = IL * Rline;                         // 線上的電壓降
    const Vrecv = IL * Rref;                         // 受電端（降壓變壓器一次側）的電壓
    const Vu = Vrecv / k2, Iu = IL * k2;
    const Pu = Vu * Iu, Ploss = IL * IL * Rline, Pg = VL * IL;
    return {
      Vg: Vg, k1: k1, k2: k2, Rline: Rline, Prated: Prated, Vrated: Vrated, Ru: Ru, Rref: Rref,
      VL: VL, IL: IL, Ig: IL * k1, drop: drop, Vrecv: Vrecv, Vu: Vu, Iu: Iu,
      Pu: Pu, Ploss: Ploss, Pg: Pg, eff: Pg > 0 ? Pu / Pg : 0, lossFrac: Pg > 0 ? Ploss / Pg : 0
    };
  }
  /** 給定其他設定，求讓用戶電壓剛好等於 Vtarget 的 k2（V_u(k2) 先升後降，取效率較高的那一個根；無解傳回 null） */
  function k2For(p, Vtarget) {
    // V_u = k1 Vg k2 Ru / (Rline + k2² Ru)：在 k2* = √(Rline/Ru) 有最大值
    const Ru = p.Vrated * p.Vrated / p.Prated, VL = p.k1 * p.Vg;
    // Vtarget (Rline + k2² Ru) = VL k2 Ru → Vtarget Ru k2² − VL Ru k2 + Vtarget Rline = 0
    const A2 = Vtarget * Ru, B2 = -VL * Ru, C2 = Vtarget * p.Rline;
    const disc = B2 * B2 - 4 * A2 * C2;
    if (disc < 0) return null;
    return (-B2 + Math.sqrt(disc)) / (2 * A2);
  }

  /** 任務事件與比較表用的摘要 */
  function genReport(g) {
    return {
      N: g.N, B: g.B, L: g.L, w: g.w, A: g.A, f: g.f, omega: g.omega, R: g.R, r: g.r, open: g.open, commutator: g.commutator,
      epsMax: g.epsMax, epsRms: g.epsRms, epsAvgDC: g.epsAvgDC, VRrms: g.VRrms, iRms: g.iRms, Pavg: g.Pavg, PR: g.PR, tauMax: g.tauMax
    };
  }
  function xfReport(o) {
    return {
      N1: o.N1, N2: o.N2, ratio: o.ratio, RL: o.RL, source: o.source, dc: o.source === 'dc', f: o.f,
      V1: o.V1, V2: o.V2, I1: o.I1, I2: o.I2, P1: o.P1, P2: o.P2, Req: o.Req, Bcore: o.Bcore, sat: o.sat
    };
  }
  function gridReport(q) {
    return {
      Vg: q.Vg, k1: q.k1, k2: q.k2, Rline: q.Rline, Prated: q.Prated, Vrated: q.Vrated, Ru: q.Ru, VL: q.VL, IL: q.IL,
      drop: q.drop, Vu: q.Vu, Pu: q.Pu, Ploss: q.Ploss, Pg: q.Pg, eff: q.eff
    };
  }

  const api = {
    TAU: TAU, MU0: MU0, CORE: CORE,
    gen: gen, genAt: genAt, thetaAt: thetaAt, degNorm: degNorm,
    xf: xf, dcStep: dcStep, grid: grid, k2For: k2For,
    genReport: genReport, xfReport: xfReport, gridReport: gridReport
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ACGeneratorCore = api;
})(typeof window !== 'undefined' ? window : this);
