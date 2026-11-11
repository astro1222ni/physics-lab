/*
 * magnetic-particle-core.js — 帶電粒子在均勻磁場（與電場）中運動的物理核心
 * （與畫面無關，可單獨測試）
 *
 * 一律使用 SI 單位：
 *   位置 x, y ........ m（y 軸向上為正，z 軸射出紙面）
 *   速度 vx, vy ...... m/s
 *   時間 t ........... s
 *   電荷 q ........... C
 *   質量 m ........... kg
 *   磁場 Bz .......... T（正值＝射出紙面，負值＝射入紙面）
 *   電場 Ex, Ey ...... V/m（在紙面內）
 *
 * 場的設定 f = { Bz, Ex, Ey, region }：
 *   region 為 null 時整個平面都有場；
 *   region = { xMin } 時只有 x ≥ xMin 的區域有場（電場與磁場同一區域）。
 *
 * 粒子 p = { x, y, vx, vy, q, m, t, turn, tField }：
 *   t ....... 已經過的時間（s）
 *   turn .... 速度方向累計轉過的角度（rad，逆時針為正）
 *   tField .. 在場區內經過的時間（s）
 */
(function (root) {
  'use strict';

  const E_CHARGE = 1.602176634e-19; // 基本電荷 C
  const AMU = 1.66053906660e-27;    // 原子質量單位 kg

  /** 粒子所在位置是否有場 */
  function inField(f, x) {
    return !f.region || x >= f.region.xMin;
  }

  /** (x, y) 處的場；場區外為零 */
  function fieldsAt(f, x) {
    if (!inField(f, x)) return { Bz: 0, Ex: 0, Ey: 0 };
    return { Bz: f.Bz || 0, Ex: f.Ex || 0, Ey: f.Ey || 0 };
  }

  /** 圓周運動半徑 r = mv / (|q|B)；不偏轉時為 Infinity */
  function radius(m, q, v, B) {
    const d = Math.abs(q * B);
    return d > 0 ? m * Math.abs(v) / d : Infinity;
  }

  /** 週期 T = 2πm / (|q|B)，與速率無關 */
  function period(m, q, B) {
    const d = Math.abs(q * B);
    return d > 0 ? 2 * Math.PI * m / d : Infinity;
  }

  /** E×B 漂移速度 v_d = E×B / B²（與 q、m 無關）；B = 0 時為 null */
  function drift(f) {
    const B = f.Bz || 0;
    if (B === 0) return null;
    // (Ex, Ey, 0) × (0, 0, Bz) = (Ey·Bz, −Ex·Bz, 0)
    return { vx: (f.Ey || 0) / B, vy: -(f.Ex || 0) / B };
  }

  /**
   * 粒子在目前位置所受的力（N）：
   *   電力 qE ............ { ex, ey }
   *   磁力 q v×B .......... { bx, by }，(vx, vy, 0)×(0, 0, Bz) = (vy·Bz, −vx·Bz, 0)
   */
  function forces(p, f) {
    const F = fieldsAt(f, p.x);
    return {
      ex: p.q * F.Ex, ey: p.q * F.Ey,
      bx: p.q * p.vy * F.Bz, by: -p.q * p.vx * F.Bz
    };
  }

  /**
   * 迴旋運動的圓心（有電場時為導引中心，以漂移速度移動）與半徑。
   * 在漂移座標中速度 u = v − v_d 做等速圓周運動，
   * 圓心 = r + (m / (qB)) (u_y, −u_x)。
   * 粒子不在場區、q = 0 或 B = 0 時回傳 null。
   */
  function center(p, f) {
    const F = fieldsAt(f, p.x);
    if (F.Bz === 0 || p.q === 0) return null;
    const d = drift(F);
    const ux = p.vx - d.vx, uy = p.vy - d.vy;
    const k = p.m / (p.q * F.Bz);
    return { x: p.x + k * uy, y: p.y - k * ux, r: Math.abs(k) * Math.hypot(ux, uy) };
  }

  /** 動能 K = ½mv²（J） */
  function kinetic(p) {
    return 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy);
  }

  /**
   * 一步 Boris 推進（「漂移－推動－漂移」對稱形式，位置與速度同步）：
   *   1. 以舊速度前進半步：x_½ = x + v·dt/2
   *   2. 在 x_½ 取場，速度更新：半個電場推動 → 繞 B 旋轉 → 半個電場推動
   *   3. 以新速度再前進半步
   * 純磁場時第 2 步是純旋轉，速率「精確」不變（與步長無關）；
   * 而且各步的位置恰好落在半徑 mv/(|q|B) 的圓上。
   * 回傳新狀態（不修改 p）。
   */
  function borisStep(p, f, dt) {
    const xh = p.x + 0.5 * dt * p.vx, yh = p.y + 0.5 * dt * p.vy;
    const F = fieldsAt(f, xh);
    const h = p.q * dt / (2 * p.m);
    // 半個電場推動
    const vmx = p.vx + h * F.Ex, vmy = p.vy + h * F.Ey;
    // 繞 z 軸旋轉：t = (q dt / 2m) B，s = 2t / (1 + t²)
    const t = h * F.Bz, s = 2 * t / (1 + t * t);
    const px = vmx + vmy * t, py = vmy - vmx * t;     // v' = v- + v- × t
    const qx = vmx + py * s, qy = vmy - px * s;       // v+ = v- + v' × s
    // 另半個電場推動
    const vx = qx + h * F.Ex, vy = qy + h * F.Ey;
    return {
      x: xh + 0.5 * dt * vx, y: yh + 0.5 * dt * vy, vx: vx, vy: vy,
      inside: F.Bz !== 0 || F.Ex !== 0 || F.Ey !== 0
    };
  }

  /**
   * 以自適應步長的 Boris 法推進粒子 T 秒（直接修改 p）。
   * 每一小步同時滿足：
   *   位移 ≤ maxStep（m）、速度轉角 |q|B·dt/m ≤ maxAngle（rad）、
   *   電場造成的位移 ½(qE/m)dt² ≤ maxStep。
   * 有場區邊界時，跨越邊界的那一步以二分法縮短，讓粒子幾乎剛好停在邊界上，
   * 進出場區的位置與方向才準確。
   * opts.trail（陣列）會每隔 trailSpacing（m）記錄一個 [x, y]。
   * 回傳 null（仍在運動）或 { reason: 'out', t } 表示離開 bounds。
   */
  function advance(p, f, T, opts) {
    opts = opts || {};
    const ds = opts.maxStep || 1e-4;
    const maxAngle = opts.maxAngle || 0.01;
    const maxN = opts.maxSubsteps || 400000;
    const b = opts.bounds;
    const trail = opts.trail;
    const spacing = opts.trailSpacing || 5e-4;
    if (p.t === undefined) p.t = 0;
    if (p.turn === undefined) p.turn = 0;
    if (p.tField === undefined) p.tField = 0;
    let lastX = NaN, lastY = NaN;
    if (trail) {
      if (trail.length) { lastX = trail[trail.length - 1][0]; lastY = trail[trail.length - 1][1]; }
      else { trail.push([p.x, p.y]); lastX = p.x; lastY = p.y; }
    }
    let t = 0, n = 0;
    while (t < T && n < maxN) {
      const F = fieldsAt(f, p.x);
      const v = Math.hypot(p.vx, p.vy);
      const w = Math.abs(p.q * F.Bz) / p.m;
      const a = Math.abs(p.q) * Math.hypot(F.Ex, F.Ey) / p.m;
      let dt = T - t;
      if (v > 0) dt = Math.min(dt, ds / v);
      if (w > 0) dt = Math.min(dt, maxAngle / w);
      if (a > 0) dt = Math.min(dt, Math.sqrt(2 * ds / a));
      let s = borisStep(p, f, dt);
      if (f.region && inField(f, s.x) !== inField(f, p.x)) {
        // 跨越場區邊界：二分搜尋「剛好越過邊界」的步長
        const was = inField(f, p.x);
        let lo = 0, hi = dt;
        for (let k = 0; k < 30; k++) {
          const mid = 0.5 * (lo + hi);
          if (inField(f, borisStep(p, f, mid).x) === was) lo = mid; else hi = mid;
        }
        dt = hi;
        s = borisStep(p, f, dt);
      }
      // 速度方向轉過的角度（逆時針為正）
      p.turn += Math.atan2(p.vx * s.vy - p.vy * s.vx, p.vx * s.vx + p.vy * s.vy);
      if (s.inside) p.tField += dt;
      p.x = s.x; p.y = s.y; p.vx = s.vx; p.vy = s.vy;
      t += dt;
      p.t += dt;
      n++;
      if (trail && Math.hypot(p.x - lastX, p.y - lastY) >= spacing) {
        trail.push([p.x, p.y]);
        lastX = p.x; lastY = p.y;
      }
      if (b && (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1)) {
        if (trail) trail.push([p.x, p.y]);
        return { reason: 'out', t: t };
      }
    }
    if (trail && (p.x !== lastX || p.y !== lastY)) trail.push([p.x, p.y]);
    return null;
  }

  const api = {
    E_CHARGE: E_CHARGE,
    AMU: AMU,
    inField: inField,
    fieldsAt: fieldsAt,
    radius: radius,
    period: period,
    drift: drift,
    forces: forces,
    center: center,
    kinetic: kinetic,
    borisStep: borisStep,
    advance: advance
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MagneticParticleCore = api;
})(this);
