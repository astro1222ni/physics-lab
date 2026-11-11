/*
 * refraction-core.js — 折射與全反射的物理核心（與畫面無關，可單獨測試）
 *
 * 單位與約定：
 *   角度 ............. 弧度（rad），由介面的法線量起，0 ≤ θ ≤ π/2
 *   折射率 n .......... 無單位（真空 = 1）
 *   光速 c ............ m/s；介質中的光速 v = c/n
 *   波長 ............. m；介質中的波長 λ = λ0/n（頻率不變）
 *
 * 光從折射率 n1 的介質射向 n2 的介質，入射角 θ1：
 *   司乃耳定律 n1 sinθ1 = n2 sinθ2；n1 sinθ1 ≥ n2 時沒有折射光（全反射）。
 *   菲涅耳方程式（非磁性介質，振幅反射係數）：
 *     r_s = (n1 cosθ1 − n2 cosθ2) / (n1 cosθ1 + n2 cosθ2)
 *     r_p = (n2 cosθ1 − n1 cosθ2) / (n2 cosθ1 + n1 cosθ2)
 *     t_s = 2 n1 cosθ1 / (n1 cosθ1 + n2 cosθ2)
 *     t_p = 2 n1 cosθ1 / (n2 cosθ1 + n1 cosθ2)
 *   反射率 R = r²，穿透率 T = (n2 cosθ2 / n1 cosθ1) t²（能量通量的比例），
 *   非偏振光取 s、p 兩個偏振的平均：R = (Rs + Rp)/2，T = (Ts + Tp)/2。
 *   r_p 的正負號採「布魯斯特角時 r_p = 0、垂直入射時 r_p = r_s」的慣例；R 與正負號無關。
 */
(function (root) {
  'use strict';

  const C = 299792458; // 真空中的光速（m/s，定義值）
  const DEG = Math.PI / 180;

  /** 預設介質（折射率取常用的教科書數值） */
  const MEDIA = [
    { id: 'air', n: 1.00, zh: '空氣', en: 'Air' },
    { id: 'water', n: 1.33, zh: '水', en: 'Water' },
    { id: 'glass', n: 1.50, zh: '玻璃', en: 'Glass' },
    { id: 'diamond', n: 2.42, zh: '鑽石', en: 'Diamond' }
  ];

  const EPS = 1e-12;

  /** 折射角 θ2（rad）；全反射（含恰好在臨界角）時回傳 NaN */
  function refractionAngle(n1, n2, th1) {
    const s = n1 * Math.sin(th1) / n2;
    if (s >= 1 - EPS && n1 > n2) return NaN;
    return Math.asin(Math.min(1, s));
  }

  /** 臨界角 θc = arcsin(n2/n1)；n1 ≤ n2 時不會發生全反射，回傳 NaN */
  function criticalAngle(n1, n2) {
    return n1 > n2 ? Math.asin(n2 / n1) : NaN;
  }

  /** 是否全反射：只有由光密射向光疏（n1 > n2）且 θ1 ≥ θc 時發生 */
  function isTIR(n1, n2, th1) {
    return n1 > n2 && n1 * Math.sin(th1) >= n2 * (1 - EPS);
  }

  /** 布魯斯特角 tanθB = n2/n1：此時 p 偏振光完全不反射 */
  function brewsterAngle(n1, n2) {
    return Math.atan(n2 / n1);
  }

  /** 垂直入射的反射率 R = ((n1 − n2)/(n1 + n2))² */
  function normalReflectance(n1, n2) {
    const r = (n1 - n2) / (n1 + n2);
    return r * r;
  }

  /**
   * 菲涅耳方程式。回傳
   *   { theta2, tir, rs, rp, ts, tp, Rs, Rp, Ts, Tp, R, T }
   * 全反射時 theta2 = NaN、Rs = Rp = 1、Ts = Tp = 0（反射係數為複數、大小為 1，
   * 這裡只回傳強度；rs、rp 設為 NaN）。
   * T 由穿透係數 t 直接計算（不是用 1 − R 得到），所以 R + T = 1 是能量守恆的檢驗。
   */
  function fresnel(n1, n2, th1) {
    const cosI = Math.cos(th1);
    if (isTIR(n1, n2, th1)) {
      return { theta2: NaN, tir: true, rs: NaN, rp: NaN, ts: 0, tp: 0, Rs: 1, Rp: 1, Ts: 0, Tp: 0, R: 1, T: 0 };
    }
    if (n1 === n2) { // 同一種介質：沒有界面，光直線前進
      return { theta2: th1, tir: false, rs: 0, rp: 0, ts: 1, tp: 1, Rs: 0, Rp: 0, Ts: 1, Tp: 1, R: 0, T: 1 };
    }
    const th2 = refractionAngle(n1, n2, th1);
    const cosT = Math.cos(th2);
    const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
    const rp = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
    const ts = 2 * n1 * cosI / (n1 * cosI + n2 * cosT);
    const tp = 2 * n1 * cosI / (n2 * cosI + n1 * cosT);
    const Rs = rs * rs, Rp = rp * rp;
    // 掠射（θ1 = 90°）時 cosθ1 = 0：t = 0，穿透的能量通量為 0
    const k = cosI > 1e-15 ? (n2 * cosT) / (n1 * cosI) : 0;
    const Ts = k * ts * ts, Tp = k * tp * tp;
    return {
      theta2: th2, tir: false,
      rs: rs, rp: rp, ts: ts, tp: tp,
      Rs: Rs, Rp: Rp, Ts: Ts, Tp: Tp,
      R: (Rs + Rp) / 2, T: (Ts + Tp) / 2
    };
  }

  /** 介質中的光速 v = c/n（m/s） */
  function speed(n) { return C / n; }

  /** 介質中的波長 λ = λ0/n */
  function wavelengthIn(lambda0, n) { return lambda0 / n; }

  /**
   * 全反射時漸逝波強度的穿透深度（強度降為 1/e 的距離）
   *   δ = λ0 / (4π √(n1² sin²θ1 − n2²))
   * 不是全反射時回傳 NaN；恰好在臨界角時為 Infinity。
   */
  function penetrationDepth(n1, n2, th1, lambda0) {
    if (!isTIR(n1, n2, th1)) return NaN;
    const q = n1 * n1 * Math.sin(th1) * Math.sin(th1) - n2 * n2;
    return q <= 0 ? Infinity : lambda0 / (4 * Math.PI * Math.sqrt(q));
  }

  /** 光纖的數值孔徑 NA = √(n_core² − n_clad²)（n_core ≤ n_clad 時為 0） */
  function numericalAperture(nCore, nClad) {
    return nCore > nClad ? Math.sqrt(nCore * nCore - nClad * nClad) : 0;
  }

  /**
   * 光纖端面的最大入射角（接收角）θa：n0 sinθa = NA。
   * NA ≥ n0 時任何角度射入都會全反射，回傳 π/2；n_core ≤ n_clad 時回傳 NaN（不能導光）。
   */
  function acceptanceAngle(nCore, nClad, n0) {
    n0 = n0 || 1;
    if (nCore <= nClad) return NaN;
    const s = numericalAperture(nCore, nClad) / n0;
    return s >= 1 ? Math.PI / 2 : Math.asin(s);
  }

  /**
   * 平板光波導（2D 光纖）的光路：光從折射率 n0 的介質，以入射角 thetaIn（相對於光纖軸）
   * 射入端面中央，在纖芯（nCore）與包層（nClad）的界面來回反射。
   *   p = { n0, nCore, nClad, thetaIn, length, thickness, maxBounces }
   *   length、thickness 為任意長度單位（畫面用像素即可），纖芯中心在 y = 0、上下界面在 y = ±thickness/2。
   * s、p 偏振分開追蹤（2D 平板中入射面固定，s、p 不會互相混合），每次碰到界面乘上 Rs、Rp。
   * 回傳：
   *   thetaR  端面的折射角（相對於軸）
   *   phi     光在側面的入射角（相對於側面的法線）= 90° − thetaR
   *   thetaC  纖芯→包層的臨界角（NaN 表示不會全反射）
   *   tir     側面是否全反射
   *   entry   端面的菲涅耳結果（進入纖芯的比例為 entry.T）
   *   wall    側面的菲涅耳結果
   *   points  光路頂點 [{ x, y, P }]，P = 該段光線的功率（入射 = 1）
   *   leaks   每次反射漏出的光 [{ x, y, side, P }]（side = +1 上界面、−1 下界面）
   *   bounces 反射次數；out = 抵達末端的功率比例
   */
  function fibreTrace(p) {
    const n0 = p.n0 || 1;
    const half = p.thickness / 2;
    const entry = fresnel(n0, p.nCore, Math.abs(p.thetaIn));
    const thR = refractionAngle(n0, p.nCore, Math.abs(p.thetaIn));
    const phi = Math.PI / 2 - thR;
    const wall = fresnel(p.nCore, p.nClad, phi);
    let Is = entry.Ts, Ip = entry.Tp;      // 兩個偏振各佔入射功率的一半，這裡記錄各自的穿透比例
    let x = 0, y = 0, dir = p.thetaIn >= 0 ? 1 : -1; // dir = +1 往上界面（y 增加）
    const points = [{ x: 0, y: 0, P: (Is + Ip) / 2 }];
    const leaks = [];
    const maxB = p.maxBounces || 400;
    const tanR = Math.tan(thR);
    let bounces = 0;
    if (tanR < 1e-9) {
      points.push({ x: p.length, y: 0, P: (Is + Ip) / 2 });
    } else {
      while (bounces < maxB) {
        const yTarget = dir * half;
        const dx = Math.abs(yTarget - y) / tanR;
        if (x + dx >= p.length) {
          const xe = p.length;
          points.push({ x: xe, y: y + dir * (xe - x) * tanR, P: (Is + Ip) / 2 });
          break;
        }
        x += dx; y = yTarget;
        const before = (Is + Ip) / 2;
        Is *= wall.Rs; Ip *= wall.Rp;
        const after = (Is + Ip) / 2;
        bounces++;
        points.push({ x: x, y: y, P: after });
        if (before - after > 0) leaks.push({ x: x, y: y, side: dir, P: before - after });
        dir = -dir;
        if (bounces === maxB) points.push({ x: x, y: y, P: after });
      }
    }
    return {
      thetaR: thR, phi: phi, thetaC: criticalAngle(p.nCore, p.nClad), tir: wall.tir,
      entry: entry, wall: wall, points: points, leaks: leaks, bounces: bounces,
      out: (Is + Ip) / 2
    };
  }

  /** 雷射波長（nm）→ 顯示用 RGB（與 slit-interference-core 相同的近似） */
  function wavelengthToRGB(nm) {
    let r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm >= 440 && nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm >= 490 && nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm >= 510 && nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm >= 580 && nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else if (nm >= 645 && nm <= 780) { r = 1; }
    let f = 0;
    if (nm >= 380 && nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
    else if (nm >= 420 && nm <= 700) f = 1;
    else if (nm > 700 && nm <= 780) f = 0.3 + 0.7 * (780 - nm) / 80;
    const ch = function (c) { return c > 0 ? Math.round(255 * Math.pow(c * f, 0.8)) : 0; };
    return [ch(r), ch(g), ch(b)];
  }

  const api = {
    C: C,
    DEG: DEG,
    MEDIA: MEDIA,
    refractionAngle: refractionAngle,
    criticalAngle: criticalAngle,
    isTIR: isTIR,
    brewsterAngle: brewsterAngle,
    normalReflectance: normalReflectance,
    fresnel: fresnel,
    speed: speed,
    wavelengthIn: wavelengthIn,
    penetrationDepth: penetrationDepth,
    numericalAperture: numericalAperture,
    acceptanceAngle: acceptanceAngle,
    fibreTrace: fibreTrace,
    wavelengthToRGB: wavelengthToRGB
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RefractionCore = api;
})(this);
