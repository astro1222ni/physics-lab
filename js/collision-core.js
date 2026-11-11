/*
 * collision-core.js — 一維碰撞物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：
 *   質量 m ........... kg
 *   速度 v ........... m/s（向右為正）
 *   位置 x ........... m（車子中心的位置）
 *   動量 p ........... kg·m/s
 *   動能 K ........... J
 *
 * 約定車 1 在左、車 2 在右；只有在 v1 > v2（兩車互相接近）時才會碰撞。
 * 碰撞視為瞬間完成：碰撞前後各自做等速度運動，所以任何時刻的狀態都有解析解。
 *
 * 彈簧緩衝（可選）：車 1 前端（右側）裝一條理想彈簧（質量不計、遵守虎克定律），
 * 彈力常數 k（N/m）、自然長度 L0（m）。彈簧尖端碰到車 2 時開始接觸。
 * 接觸期間兩車的相對運動是簡諧運動：
 *   μ x'' = −k x，ω = √(k/μ)，壓縮量 x(τ) = (u/ω) sin(ωτ)，u = v1 − v2 > 0，τ = t − t_c
 * 質心照樣等速度前進；接觸時間 Δt = π/ω，放開後的速度等於 e = 1 的彈性碰撞結果。
 * 所以任何時刻（接觸前、中、後）的狀態仍然都有解析解。
 */
(function (root) {
  'use strict';

  function check(m1, m2, e) {
    if (!(m1 > 0) || !(m2 > 0)) throw new RangeError('質量必須為正');
    if (!(e >= 0 && e <= 1)) throw new RangeError('恢復係數 e 必須介於 0 與 1 之間');
  }

  function momentum(m, v) { return m * v; }
  function kinetic(m, v) { return 0.5 * m * v * v; }
  /** 約化質量 μ = m1 m2 / (m1 + m2) */
  function reducedMass(m1, m2) { return m1 * m2 / (m1 + m2); }
  /** 質心速度 v_cm = (m1 v1 + m2 v2) / (m1 + m2) */
  function vcm(m1, m2, v1, v2) { return (m1 * v1 + m2 * v2) / (m1 + m2); }
  /** 車 1 在左、車 2 在右時，兩車是否互相接近 */
  function approaching(v1, v2) { return v1 - v2 > 0; }

  /**
   * 碰撞後的速度。由
   *   動量守恆   m1 v1 + m2 v2 = m1 v1' + m2 v2'
   *   恢復係數   v2' − v1' = e (v1 − v2)
   * 聯立解得
   *   v1' = v_cm − e m2 (v1 − v2) / (m1 + m2)
   *   v2' = v_cm + e m1 (v1 − v2) / (m1 + m2)
   * 不檢查兩車是否接近；要判斷會不會碰撞請用 collide()。
   */
  function finalVelocities(m1, m2, v1, v2, e) {
    check(m1, m2, e);
    const M = m1 + m2, u = v1 - v2, c = vcm(m1, m2, v1, v2);
    return { v1: c - e * m2 * u / M, v2: c + e * m1 * u / M };
  }

  /** 若兩車互相接近，回傳碰撞後速度；否則回傳 null（不會碰撞） */
  function collide(m1, m2, v1, v2, e) {
    check(m1, m2, e);
    if (!approaching(v1, v2)) return null;
    return finalVelocities(m1, m2, v1, v2, e);
  }

  /** 動能損失 ΔK = (1/2) μ (1 − e^2)(v1 − v2)^2 */
  function keLoss(m1, m2, v1, v2, e) {
    check(m1, m2, e);
    const u = v1 - v2;
    return 0.5 * reducedMass(m1, m2) * (1 - e * e) * u * u;
  }

  /**
   * 間距 gap（車 1 右緣到車 2 左緣，m）縮為零所需時間。
   * 兩車不接近或已重疊（gap < 0）時回傳 Infinity。
   */
  function timeToContact(gap, v1, v2) {
    if (!approaching(v1, v2) || gap < 0) return Infinity;
    return gap / (v1 - v2);
  }

  /** 一組速度對應的動量與動能 */
  function quantities(m1, m2, v1, v2) {
    const p1 = momentum(m1, v1), p2 = momentum(m2, v2);
    const K1 = kinetic(m1, v1), K2 = kinetic(m2, v2);
    return { v1: v1, v2: v2, p1: p1, p2: p2, p: p1 + p2, K1: K1, K2: K2, K: K1 + K2 };
  }

  /** 碰撞前後比較表所需的全部數值 */
  function summary(m1, m2, v1, v2, e) {
    const after = collide(m1, m2, v1, v2, e);
    const b = quantities(m1, m2, v1, v2);
    const a = after ? quantities(m1, m2, after.v1, after.v2) : quantities(m1, m2, v1, v2);
    return {
      collides: !!after,
      before: b,
      after: a,
      vcm: vcm(m1, m2, v1, v2),
      mu: reducedMass(m1, m2),
      lost: b.K - a.K,
      lostFormula: after ? keLoss(m1, m2, v1, v2, e) : 0,
      // 由碰撞前後速度反算恢復係數，應等於設定的 e
      eMeasured: after ? -(a.v1 - a.v2) / (v1 - v2) : NaN
    };
  }

  /**
   * 理想彈簧緩衝的接觸參數（兩車必須互相接近，u = v1 − v2 > 0）。
   *   ω = √(k/μ)、接觸時間 Δt = π/ω = π√(μ/k)
   *   最大壓縮量 x_max = u/ω = u√(μ/k)、最大彈力 F_max = k x_max = u√(kμ)
   *   彈簧給車 2 的衝量 J = ∫F dt = 2μu = Δp2 = −Δp1
   *   最大位能 U_max = ½ k x_max² = ½ μ u²（等於完全非彈性碰撞損失的動能）
   */
  function springContact(m1, m2, v1, v2, k) {
    check(m1, m2, 1);
    if (!(k > 0)) throw new RangeError('彈力常數 k 必須為正');
    const mu = reducedMass(m1, m2), u = v1 - v2, omega = Math.sqrt(k / mu);
    const xmax = u / omega;
    return {
      mu: mu, u: u, omega: omega,
      dt: Math.PI / omega,
      xmax: xmax,
      Fmax: k * xmax,
      J: 2 * mu * u,
      Umax: 0.5 * k * xmax * xmax
    };
  }

  /**
   * 建立一次模擬。
   * p: { m1, m2, v1, v2, e, w1, w2, x1, x2 } — w 為車長、x 為車中心位置（m）。
   * 加彈簧時再給 k（N/m）與 L0（m，自然長度）；此時 e 不使用（理想彈簧為彈性碰撞，e = 1）。
   * 回傳的物件可交給 stateAt(sim, t) 求任何時刻的狀態（解析解，沒有累積誤差）。
   */
  function createSim(p) {
    const spring = p.k > 0;
    const e = spring ? 1 : p.e;
    check(p.m1, p.m2, e);
    const L0 = spring ? p.L0 : 0;
    if (spring && !(L0 > 0)) throw new RangeError('彈簧自然長度 L0 必須為正');
    // 有彈簧時，彈簧尖端（車 1 右緣再往右 L0）碰到車 2 左緣就開始接觸
    const gap = (p.x2 - p.w2 / 2) - (p.x1 + p.w1 / 2) - L0;
    const tc = timeToContact(gap, p.v1, p.v2);
    const after = isFinite(tc) ? finalVelocities(p.m1, p.m2, p.v1, p.v2, e) : null;
    const sim = {
      m1: p.m1, m2: p.m2, v1: p.v1, v2: p.v2, e: e,
      w1: p.w1, w2: p.w2, x1: p.x1, x2: p.x2,
      spring: spring, k: spring ? p.k : 0, L0: L0,
      tc: tc,                 // 碰撞（開始接觸）時刻（s），不會碰撞時為 Infinity
      tr: tc,                 // 分開時刻（s）；沒有彈簧時與 tc 相同
      contact: null,          // 彈簧接觸參數（springContact）
      after: after,           // 碰撞後速度，不會碰撞時為 null
      xc1: isFinite(tc) ? p.x1 + p.v1 * tc : NaN, // 碰撞（開始接觸）瞬間兩車中心位置
      xc2: isFinite(tc) ? p.x2 + p.v2 * tc : NaN
    };
    sim.xr1 = sim.xc1; sim.xr2 = sim.xc2;           // 分開瞬間兩車中心位置
    if (spring && isFinite(tc)) {
      const c = springContact(p.m1, p.m2, p.v1, p.v2, p.k);
      sim.contact = c;
      sim.tr = tc + c.dt;
      // 接觸期間質心等速度前進；放開時壓縮量回到 0，兩車中心距離與接觸開始時相同
      const vc = vcm(p.m1, p.m2, p.v1, p.v2);
      sim.xr1 = sim.xc1 + vc * c.dt;
      sim.xr2 = sim.xc2 + vc * c.dt;
    }
    return sim;
  }

  /**
   * 時刻 t（s）的位置、速度、動量、動能、質心；
   * 另有彈簧壓縮量 x（m）、彈力大小 F（N）、彈性位能 U（J）、總能量 E = K + U（沒有彈簧時 x = F = U = 0）。
   */
  function stateAt(sim, t) {
    let x1, x2, v1, v2, cx = 0;
    const hit = t >= sim.tc;
    const M = sim.m1 + sim.m2;
    if (!hit) {
      v1 = sim.v1; v2 = sim.v2;
      x1 = sim.x1 + v1 * t; x2 = sim.x2 + v2 * t;
    } else if (sim.spring && t < sim.tr) {
      // 接觸中：質心等速度 + 相對運動為簡諧運動
      const c = sim.contact, tau = t - sim.tc;
      const vc = (sim.m1 * sim.v1 + sim.m2 * sim.v2) / M;
      const s = Math.sin(c.omega * tau), co = Math.cos(c.omega * tau);
      cx = c.u / c.omega * s;
      const xcm0 = (sim.m1 * sim.xc1 + sim.m2 * sim.xc2) / M + vc * tau;
      const r = (sim.xc2 - sim.xc1) - cx;     // 兩車中心距離
      x1 = xcm0 - sim.m2 / M * r;
      x2 = xcm0 + sim.m1 / M * r;
      v1 = vc + sim.m2 / M * c.u * co;
      v2 = vc - sim.m1 / M * c.u * co;
    } else {
      v1 = sim.after.v1; v2 = sim.after.v2;
      x1 = sim.xr1 + v1 * (t - sim.tr); x2 = sim.xr2 + v2 * (t - sim.tr);
    }
    const q = quantities(sim.m1, sim.m2, v1, v2);
    q.t = t;
    q.x1 = x1; q.x2 = x2;
    q.collided = hit;
    q.contact = sim.spring && hit && t < sim.tr;
    q.released = hit && t >= sim.tr;
    q.x = cx;
    q.F = sim.k * cx;
    q.U = 0.5 * sim.k * cx * cx;
    q.E = q.K + q.U;
    q.xcm = (sim.m1 * x1 + sim.m2 * x2) / M;
    q.vcm = q.p / M;
    return q;
  }

  const api = {
    momentum: momentum,
    kinetic: kinetic,
    reducedMass: reducedMass,
    vcm: vcm,
    approaching: approaching,
    finalVelocities: finalVelocities,
    collide: collide,
    keLoss: keLoss,
    springContact: springContact,
    timeToContact: timeToContact,
    quantities: quantities,
    summary: summary,
    createSim: createSim,
    stateAt: stateAt
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CollisionCore = api;
})(this);
