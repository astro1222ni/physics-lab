/*
 * circular-motion-core.js — 等速圓周運動物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI）：
 *   半徑 r ............ m
 *   週期 T ............ s（轉一圈所需時間）
 *   質量 m ............ kg
 *   時間 t ............ s
 *   角度 theta ........ rad，由 +x 軸逆時針量起
 *
 * 參數物件 p = { r, T, m, theta0 }：theta0 是 t = 0 時的角位置（省略為 0）。
 * 物體以逆時針方向做等速圓周運動，圓心在原點。全部使用解析解：
 *   θ(t) = θ0 + ωt
 *   x = r cos θ,  y = r sin θ
 *   vx = −rω sin θ,  vy = rω cos θ        （切線方向，|v| = rω）
 *   ax = −ω² x,  ay = −ω² y               （指向圓心，|a| = ω² r = v²/r）
 * 在 t = tCut 剪斷繩子後合力為零，物體以剪斷瞬間的速度做等速直線運動。
 */
(function (root) {
  'use strict';

  const TWO_PI = 2 * Math.PI;

  /** 角速度 ω = 2π/T */
  function omegaOf(p) { return TWO_PI / p.T; }

  /** 由半徑與週期求速率 v = 2πr/T */
  function speedFromPeriod(r, T) { return TWO_PI * r / T; }

  /** 由半徑與速率求週期 T = 2πr/v */
  function periodFromSpeed(r, v) { return TWO_PI * r / v; }

  /** 由 r、T、m 算出所有導出量 */
  function derived(p) {
    const w = omegaOf(p);
    const v = w * p.r;
    const a = v * v / p.r;           // = ω² r
    const m = p.m == null ? 1 : p.m;
    return {
      r: p.r, T: p.T, m: m,
      f: 1 / p.T,                    // 頻率（Hz）
      omega: w,                      // 角速度（rad/s）
      v: v,                          // 速率（m/s）
      a: a,                          // 向心加速度大小（m/s²）
      F: m * a                       // 向心力（合力）大小（N）
    };
  }

  /** t 時刻的角位置（未取餘數，會一直增加） */
  function angleAt(p, t) { return (p.theta0 || 0) + omegaOf(p) * t; }

  /** 把角度化成 [0, 2π) */
  function wrapAngle(th) {
    const x = th % TWO_PI;
    return x < 0 ? x + TWO_PI : x;
  }

  /** 繩子沒有剪斷時，t 時刻的完整狀態（解析解） */
  function stateAt(p, t) {
    const w = omegaOf(p), th = angleAt(p, t);
    const c = Math.cos(th), s = Math.sin(th);
    const x = p.r * c, y = p.r * s;
    return {
      t: t, theta: th, attached: true,
      x: x, y: y,
      vx: -p.r * w * s, vy: p.r * w * c,
      ax: -w * w * x, ay: -w * w * y
    };
  }

  /**
   * 在 tCut 剪斷繩子後，t 時刻的狀態：合力為零，等速直線運動（牛頓第一定律）。
   * t ≤ tCut 時與 stateAt 相同。
   */
  function releasedStateAt(p, tCut, t) {
    if (t <= tCut) return stateAt(p, t);
    const c = stateAt(p, tCut), tau = t - tCut;
    return {
      t: t, theta: c.theta, attached: false,
      x: c.x + c.vx * tau, y: c.y + c.vy * tau,
      vx: c.vx, vy: c.vy,
      ax: 0, ay: 0
    };
  }

  /** 統一入口：tCut 為 null／undefined 代表繩子沒有剪斷 */
  function motionAt(p, t, tCut) {
    return tCut == null ? stateAt(p, t) : releasedStateAt(p, tCut, t);
  }

  /**
   * 剪斷後經過 tau 秒，物體與圓心的距離：剪斷瞬間位置向量與速度垂直，
   * 所以 d = √(r² + v²τ²)。
   */
  function releaseDistance(p, tau) {
    const v = derived(p).v;
    return Math.sqrt(p.r * p.r + v * v * tau * tau);
  }

  /** 剪斷後要經過多久，物體離圓心的距離才達到 R（R ≥ r） */
  function exitTime(p, R) {
    if (R <= p.r) return 0;
    return Math.sqrt(R * R - p.r * p.r) / derived(p).v;
  }

  /** 已轉的圈數 t/T（小數） */
  function turns(p, t) { return t / p.T; }

  /**
   * (t0, t1] 之間物體通過基準線 θ = 0（+x 軸，θ = 2πk）的次數，用來每轉一圈發一次聲音。
   * 只在繩子沒有剪斷時有意義。
   */
  function turnsBetween(p, t0, t1) {
    if (!(t1 > t0)) return 0;
    const k0 = Math.floor(angleAt(p, t0) / TWO_PI + 1e-12);
    const k1 = Math.floor(angleAt(p, t1) / TWO_PI + 1e-12);
    return Math.max(0, k1 - k0);
  }

  /**
   * 剪斷繩子後的直線路徑與定點 P = (px, py) 的關係（任務模式用）：
   * 沿剪斷後的射線（只往前，τ ≥ 0）找最接近 P 的時刻 tau 與當時的距離 miss（m）。
   * P 在剪斷點後方時 tau = 0、miss = 剪斷點到 P 的距離。
   */
  function passPoint(p, tCut, px, py) {
    const c = stateAt(p, tCut);
    const v2 = c.vx * c.vx + c.vy * c.vy;
    const tau = Math.max(0, ((px - c.x) * c.vx + (py - c.y) * c.vy) / v2);
    return { tau: tau, miss: Math.hypot(c.x + c.vx * tau - px, c.y + c.vy * tau - py) };
  }

  /**
   * 逆時針轉動時，要在哪個角位置（rad，[0, 2π)）剪斷繩子，小球才會沿切線通過圓外一點 P。
   * 從 P 到圓有兩條切線；逆時針運動時，只有切點在 P 方向「順時針側」的那一條是朝 P 前進：
   *   θ = φ − arccos(r/|P|)，φ 為 P 的方向角。P 不在圓外（|P| ≤ r）時傳回 NaN。
   * 從切點到 P 的距離為 √(|P|² − r²)。
   */
  function aimAngle(r, px, py) {
    const D = Math.hypot(px, py);
    if (!(D > r)) return NaN;
    const th = wrapAngle(Math.atan2(py, px) - Math.acos(r / D));
    return th >= TWO_PI ? 0 : th; // −1e-17 這種捨入誤差會被 wrapAngle 變成 2π
  }

  const api = {
    TWO_PI: TWO_PI,
    passPoint: passPoint,
    aimAngle: aimAngle,
    omegaOf: omegaOf,
    speedFromPeriod: speedFromPeriod,
    periodFromSpeed: periodFromSpeed,
    derived: derived,
    angleAt: angleAt,
    wrapAngle: wrapAngle,
    stateAt: stateAt,
    releasedStateAt: releasedStateAt,
    motionAt: motionAt,
    releaseDistance: releaseDistance,
    exitTime: exitTime,
    turns: turns,
    turnsBetween: turnsBetween
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CircularCore = api;
})(typeof window !== 'undefined' ? window : this);
