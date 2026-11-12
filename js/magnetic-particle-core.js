/*
 * magnetic-particle-core.js — 帶電粒子在均勻磁場（與電場）中運動的物理核心
 * （與畫面無關，可單獨測試）
 *
 * 一律使用 SI 單位，三維向量：
 *   位置 x, y, z ......... m（y 軸向上為正，z 軸射出紙面）
 *   速度 vx, vy, vz ...... m/s
 *   時間 t ............... s
 *   電荷 q ............... C
 *   質量 m ............... kg
 *   磁場 Bz .............. T（磁場沿 z 軸；正值＝射出紙面，負值＝射入紙面）
 *   電場 Ex, Ey, Ez ...... V/m（Ez 可省略；模擬畫面只用紙面內的 Ex、Ey）
 *
 * 場的設定 f = { Bz, Ex, Ey, Ez, region }：
 *   region 為 null 時整個空間都有場；
 *   region = { xMin } 時只有 x ≥ xMin 的區域有場（電場與磁場同一區域）。
 *
 * 粒子 p = { x, y, z, vx, vy, vz, q, m, t, turn, tField }：
 *   z、vz 可省略（視為 0）；z = vz = 0 時就是原本的平面運動。
 *   t ....... 已經過的時間（s）
 *   turn .... 垂直於 B 的速度分量（投影到 xy 平面）累計轉過的角度（rad，逆時針為正）
 *   tField .. 在場區內經過的時間（s）
 *
 * 速度與磁場的夾角 θ（pitch angle）：v⊥ = v sinθ、v∥ = v cosθ，
 * 軌跡是半徑 r = mv⊥/(|q|B)、螺距 p = v∥·T 的螺旋線（θ = 90° 時為圓）。
 */
(function (root) {
  'use strict';

  const E_CHARGE = 1.602176634e-19; // 基本電荷 C
  const AMU = 1.66053906892e-27;    // 原子質量單位 kg

  /** 粒子所在位置是否有場 */
  function inField(f, x) {
    return !f.region || x >= f.region.xMin;
  }

  /** 位置 x 處的場；場區外為零 */
  function fieldsAt(f, x) {
    if (!inField(f, x)) return { Bz: 0, Ex: 0, Ey: 0, Ez: 0 };
    return { Bz: f.Bz || 0, Ex: f.Ex || 0, Ey: f.Ey || 0, Ez: f.Ez || 0 };
  }

  /**
   * 速度與磁場夾角 θ（度）的分量：v⊥ = v sinθ、v∥ = v cosθ。
   * θ = 90° 時 v∥ 精確為 0，θ = 0°、180° 時 v⊥ 精確為 0（避免 cos 90° ≈ 6e-17 之類的誤差）。
   */
  function pitchComponents(v, thetaDeg) {
    const d = ((thetaDeg % 360) + 360) % 360;
    if (d === 90) return { perp: v, par: 0 };
    if (d === 270) return { perp: -v, par: 0 };
    if (d === 0) return { perp: 0, par: v };
    if (d === 180) return { perp: 0, par: -v };
    const th = thetaDeg * Math.PI / 180;
    return { perp: v * Math.sin(th), par: v * Math.cos(th) };
  }

  /**
   * 螺旋運動的特徵量（純磁場）：速率 v、夾角 θ（度）
   *   v⊥ = v sinθ、v∥ = v cosθ、r = mv⊥/(|q|B)、T = 2πm/(|q|B)、螺距 p = v∥·T（帶正負號，沿 +z 為正）
   * q = 0 或 B = 0 時 r、T、p 為 Infinity（p 在 v∥ = 0 時為 0）。
   */
  function helix(m, q, v, B, thetaDeg) {
    const c = pitchComponents(v, thetaDeg);
    const T = period(m, q, B);
    return {
      vPerp: c.perp, vPar: c.par,
      r: radius(m, q, c.perp, B),
      T: T,
      pitch: c.par === 0 ? 0 : isFinite(T) ? c.par * T : (c.par > 0 ? Infinity : -Infinity)
    };
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

  /** E×B 漂移速度 v_d = E×B / B²（與 q、m 無關，沒有 z 分量）；B = 0 時為 null */
  function drift(f) {
    const B = f.Bz || 0;
    if (B === 0) return null;
    // (Ex, Ey, Ez) × (0, 0, Bz) = (Ey·Bz, −Ex·Bz, 0)
    return { vx: (f.Ey || 0) / B, vy: -(f.Ex || 0) / B, vz: 0 };
  }

  /**
   * 粒子在目前位置所受的力（N）：
   *   電力 qE ............ { ex, ey, ez }
   *   磁力 q v×B .......... { bx, by, bz }，(vx, vy, vz)×(0, 0, Bz) = (vy·Bz, −vx·Bz, 0)
   * 磁力與 B 垂直，大小 |q|v⊥B（v∥ 不受磁力）。
   */
  function forces(p, f) {
    const F = fieldsAt(f, p.x);
    return {
      ex: p.q * F.Ex, ey: p.q * F.Ey, ez: p.q * F.Ez,
      bx: p.q * p.vy * F.Bz, by: -p.q * p.vx * F.Bz, bz: 0
    };
  }

  /**
   * 迴旋運動的圓心（螺旋線的軸；有電場時為導引中心，以漂移速度移動）與半徑。
   * 在漂移座標中垂直於 B 的速度 u = v⊥ − v_d 做等速圓周運動，
   * 圓心 = r + (m / (qB)) (u_y, −u_x)；z 取粒子目前的 z（軸線沿 z 方向）。
   * 粒子不在場區、q = 0 或 B = 0 時回傳 null。
   */
  function center(p, f) {
    const F = fieldsAt(f, p.x);
    if (F.Bz === 0 || p.q === 0) return null;
    const d = drift(F);
    const ux = p.vx - d.vx, uy = p.vy - d.vy;
    const k = p.m / (p.q * F.Bz);
    return { x: p.x + k * uy, y: p.y - k * ux, z: p.z || 0, r: Math.abs(k) * Math.hypot(ux, uy) };
  }

  /** 動能 K = ½mv²（J） */
  function kinetic(p) {
    const vz = p.vz || 0;
    return 0.5 * p.m * (p.vx * p.vx + p.vy * p.vy + vz * vz);
  }

  /** 速率 |v| */
  function speed(p) {
    const vz = p.vz || 0;
    return Math.sqrt(p.vx * p.vx + p.vy * p.vy + vz * vz);
  }

  /**
   * 一步 Boris 推進（「漂移－推動－漂移」對稱形式，位置與速度同步）：
   *   1. 以舊速度前進半步：x_½ = x + v·dt/2
   *   2. 在 x_½ 取場，速度更新：半個電場推動 → 繞 B 旋轉 → 半個電場推動
   *   3. 以新速度再前進半步
   * 純磁場時第 2 步是純旋轉，速率「精確」不變（與步長無關）；
   * 而且各步的位置投影到 xy 平面恰好落在半徑 mv⊥/(|q|B) 的圓上。
   * B 沿 z 軸，所以旋轉只改變 (vx, vy)，vz 只受 Ez 影響（純磁場時 v∥ 精確不變）。
   * 回傳新狀態（不修改 p）。
   */
  function borisStep(p, f, dt) {
    const z0 = p.z || 0, vz0 = p.vz || 0;
    const xh = p.x + 0.5 * dt * p.vx, yh = p.y + 0.5 * dt * p.vy, zh = z0 + 0.5 * dt * vz0;
    const F = fieldsAt(f, xh);
    const h = p.q * dt / (2 * p.m);
    // 半個電場推動
    const vmx = p.vx + h * F.Ex, vmy = p.vy + h * F.Ey, vmz = vz0 + h * F.Ez;
    // 繞 z 軸旋轉：t = (q dt / 2m) B，s = 2t / (1 + t²)
    const t = h * F.Bz, s = 2 * t / (1 + t * t);
    const px = vmx + vmy * t, py = vmy - vmx * t;     // v' = v- + v- × t
    const qx = vmx + py * s, qy = vmy - px * s;       // v+ = v- + v' × s（z 分量不變）
    // 另半個電場推動
    const vx = qx + h * F.Ex, vy = qy + h * F.Ey, vz = vmz + h * F.Ez;
    return {
      x: xh + 0.5 * dt * vx, y: yh + 0.5 * dt * vy, z: zh + 0.5 * dt * vz,
      vx: vx, vy: vy, vz: vz,
      inside: F.Bz !== 0 || F.Ex !== 0 || F.Ey !== 0 || F.Ez !== 0
    };
  }

  /**
   * 以自適應步長的 Boris 法推進粒子 T 秒（直接修改 p）。
   * 每一小步同時滿足：
   *   位移 ≤ maxStep（m）、速度轉角 |q|B·dt/m ≤ maxAngle（rad）、
   *   電場造成的位移 ½(qE/m)dt² ≤ maxStep。
   * 有場區邊界時，跨越邊界的那一步以二分法縮短，讓粒子幾乎剛好停在邊界上，
   * 進出場區的位置與方向才準確。
   * opts.trail（陣列）會每隔 trailSpacing（m，三維距離）記錄一個 [x, y, z]。
   * opts.bounds = { x0, x1, y0, y1, z0?, z1? }（z0、z1 可省略＝z 方向不限）。
   * 回傳 null（仍在運動）或 { reason: 'out', axis: 'xy' | 'z', t } 表示離開 bounds。
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
    if (p.z === undefined) p.z = 0;
    if (p.vz === undefined) p.vz = 0;
    let lastX = NaN, lastY = NaN, lastZ = NaN;
    if (trail) {
      if (trail.length) {
        const L = trail[trail.length - 1];
        lastX = L[0]; lastY = L[1]; lastZ = L[2] || 0;
      } else { trail.push([p.x, p.y, p.z]); lastX = p.x; lastY = p.y; lastZ = p.z; }
    }
    const zb = b && b.z0 !== undefined && b.z1 !== undefined;
    let t = 0, n = 0;
    while (t < T && n < maxN) {
      const F = fieldsAt(f, p.x);
      const v = speed(p);
      const w = Math.abs(p.q * F.Bz) / p.m;
      const a = Math.abs(p.q) * Math.sqrt(F.Ex * F.Ex + F.Ey * F.Ey + F.Ez * F.Ez) / p.m;
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
      // 垂直於 B 的速度分量轉過的角度（逆時針為正）
      p.turn += Math.atan2(p.vx * s.vy - p.vy * s.vx, p.vx * s.vx + p.vy * s.vy);
      if (s.inside) p.tField += dt;
      p.x = s.x; p.y = s.y; p.z = s.z; p.vx = s.vx; p.vy = s.vy; p.vz = s.vz;
      t += dt;
      p.t += dt;
      n++;
      if (trail) {
        const dx = p.x - lastX, dy = p.y - lastY, dz = p.z - lastZ;
        if (dx * dx + dy * dy + dz * dz >= spacing * spacing) {
          trail.push([p.x, p.y, p.z]);
          lastX = p.x; lastY = p.y; lastZ = p.z;
        }
      }
      const outXY = b && (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1);
      const outZ = zb && (p.z < b.z0 || p.z > b.z1);
      if (outXY || outZ) {
        if (trail) trail.push([p.x, p.y, p.z]);
        return { reason: 'out', axis: outXY ? 'xy' : 'z', t: t };
      }
    }
    if (trail && (p.x !== lastX || p.y !== lastY || p.z !== lastZ)) trail.push([p.x, p.y, p.z]);
    return null;
  }

  const api = {
    E_CHARGE: E_CHARGE,
    AMU: AMU,
    inField: inField,
    fieldsAt: fieldsAt,
    radius: radius,
    period: period,
    pitchComponents: pitchComponents,
    helix: helix,
    drift: drift,
    forces: forces,
    center: center,
    kinetic: kinetic,
    speed: speed,
    borisStep: borisStep,
    advance: advance
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MagneticParticleCore = api;
})(this);
