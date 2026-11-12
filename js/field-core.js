/*
 * field-core.js — 靜電場物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定：
 *   位置 x, y ........ cm（y 軸向上為正）
 *   電荷 q ........... nC
 *   電場 E ........... N/C
 *   電位 V ........... V
 *   試探電荷質量 m ..... g
 *   試探電荷速度 v ..... m/s
 */
(function (root) {
  'use strict';

  const K = 8.9875517862e9; // 庫侖常數 N·m²/C²
  const NC = 1e-9;          // nC → C
  const CM = 1e-2;          // cm → m

  /** 只保留電量不為零的電荷 */
  function active(charges) {
    return charges.filter(function (c) { return c.q !== 0; });
  }

  /** 疊加原理：E(r) = Σ k q_i (r − r_i) / |r − r_i|³ */
  function fieldAt(charges, x, y) {
    let ex = 0, ey = 0;
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      if (c.q === 0) continue;
      const dx = (x - c.x) * CM, dy = (y - c.y) * CM;
      const r2 = dx * dx + dy * dy;
      if (r2 === 0) return { ex: NaN, ey: NaN };
      const f = K * c.q * NC / (r2 * Math.sqrt(r2));
      ex += f * dx;
      ey += f * dy;
    }
    return { ex: ex, ey: ey };
  }

  /** V(r) = Σ k q_i / |r − r_i|（以無窮遠處為零電位） */
  function potentialAt(charges, x, y) {
    let v = 0;
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      if (c.q === 0) continue;
      const r = Math.hypot(x - c.x, y - c.y) * CM;
      if (r === 0) return c.q > 0 ? Infinity : -Infinity;
      v += K * c.q * NC / r;
    }
    return v;
  }

  /**
   * 以 RK4 沿電場方向（dir = +1）或反方向（dir = −1）描一條電力線。
   * 步長以弧長計（cm），所以電場強弱不影響取樣密度。
   */
  function traceFieldLine(charges, x0, y0, dir, opts) {
    opts = opts || {};
    const h = opts.step || 0.04;
    const maxSteps = opts.maxSteps || 3000;
    const stopR = opts.stopRadius || 0.15;
    const b = opts.bounds;
    const src = active(charges);
    const pts = [[x0, y0]];
    let x = x0, y = y0, end = 'maxSteps';

    function unit(px, py) {
      const e = fieldAt(src, px, py);
      const m = Math.hypot(e.ex, e.ey);
      if (!(m > 0) || !isFinite(m)) return null;
      return [dir * e.ex / m, dir * e.ey / m];
    }

    for (let s = 0; s < maxSteps; s++) {
      const k1 = unit(x, y); if (!k1) { end = 'null'; break; }
      const k2 = unit(x + h / 2 * k1[0], y + h / 2 * k1[1]); if (!k2) { end = 'null'; break; }
      const k3 = unit(x + h / 2 * k2[0], y + h / 2 * k2[1]); if (!k3) { end = 'null'; break; }
      const k4 = unit(x + h * k3[0], y + h * k3[1]); if (!k4) { end = 'null'; break; }
      x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      pts.push([x, y]);
      if (b && (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1)) { end = 'out'; break; }
      if (s > 2) {
        let hit = -1;
        for (let i = 0; i < src.length; i++) {
          if (Math.hypot(x - src[i].x, y - src[i].y) < stopR) { hit = i; break; }
        }
        if (hit >= 0) {
          pts.push([src[hit].x, src[hit].y]);
          end = { charge: charges.indexOf(src[hit]) };
          break;
        }
      }
    }
    return { points: pts, dir: dir, end: end };
  }

  /**
   * 產生整張電力線圖。線數與電量成正比（高斯定律：通量 ∝ q）。
   * 從總電量絕對值較大的那一種符號的電荷出發，
   * 這樣終止於另一種電荷的線數也自動符合比例。
   */
  function fieldLines(charges, opts) {
    opts = opts || {};
    const perNC = opts.linesPerNC || 4;
    const r0 = opts.startRadius || 0.25;
    const src = active(charges);
    let pos = 0, neg = 0;
    src.forEach(function (c) { if (c.q > 0) pos += c.q; else neg -= c.q; });
    const startSign = pos >= neg ? 1 : -1;
    const lines = [];
    src.forEach(function (c) {
      if (Math.sign(c.q) !== startSign) return;
      const n = Math.max(4, Math.round(perNC * Math.abs(c.q)));
      const offset = Math.PI / n; // 避免剛好沿兩電荷連線出發
      for (let k = 0; k < n; k++) {
        const a = offset + 2 * Math.PI * k / n;
        lines.push(traceFieldLine(src, c.x + r0 * Math.cos(a), c.y + r0 * Math.sin(a), startSign, opts));
      }
    });
    return lines;
  }

  /**
   * Marching squares：在格點數值 grid（(nx+1)×(ny+1)，列優先，j 為列）上找出 value = level 的等值線段。
   * 回傳線段 [[x1, y1, x2, y2], ...]，座標為世界座標（cm）。
   */
  function contourSegments(grid, nx, ny, x0, y0, dx, dy, level) {
    const segs = [];
    const W = nx + 1;
    function lerp(a, b, va, vb) { return a + (b - a) * (level - va) / (vb - va); }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = grid[j * W + i], v1 = grid[j * W + i + 1];
        const v2 = grid[(j + 1) * W + i + 1], v3 = grid[(j + 1) * W + i];
        let idx = 0;
        if (v0 > level) idx |= 1;
        if (v1 > level) idx |= 2;
        if (v2 > level) idx |= 4;
        if (v3 > level) idx |= 8;
        if (idx === 0 || idx === 15) continue;
        const xa = x0 + i * dx, xb = xa + dx, ya = y0 + j * dy, yb = ya + dy;
        // 四條邊上的交點：下(0-1) 右(1-2) 上(3-2) 左(0-3)
        const B = function () { return [lerp(xa, xb, v0, v1), ya]; };
        const R = function () { return [xb, lerp(ya, yb, v1, v2)]; };
        const T = function () { return [lerp(xa, xb, v3, v2), yb]; };
        const L = function () { return [xa, lerp(ya, yb, v0, v3)]; };
        const add = function (p, q) { segs.push([p[0], p[1], q[0], q[1]]); };
        const center = (v0 + v1 + v2 + v3) / 4;
        switch (idx) {
          case 1: case 14: add(L(), B()); break;
          case 2: case 13: add(B(), R()); break;
          case 3: case 12: add(L(), R()); break;
          case 4: case 11: add(R(), T()); break;
          case 6: case 9: add(B(), T()); break;
          case 7: case 8: add(L(), T()); break;
          case 5: // 鞍點，用中心值消除歧義
            if (center > level) { add(L(), T()); add(B(), R()); } else { add(L(), B()); add(R(), T()); }
            break;
          case 10:
            if (center > level) { add(L(), B()); add(R(), T()); } else { add(L(), T()); add(B(), R()); }
            break;
        }
      }
    }
    return segs;
  }

  /** 試探電荷所受加速度 a = qE / m（m/s²） */
  function accel(charges, p, x, y) {
    const e = fieldAt(charges, x, y);
    const qm = p.q * NC / (p.m * 1e-3);
    return [qm * e.ex, qm * e.ey];
  }

  /**
   * 以「自適應步長 velocity-Verlet」推進試探電荷 T 秒。
   * 每一小步的位移限制在 maxStepCm 以內，靠近電荷時自動縮小步長，
   * 讓總力學能（K + qV）保持守恆。
   * 回傳 null（仍在運動）或停止原因 { reason: 'hit', charge } / { reason: 'out' }。
   */
  function advance(charges, p, T, opts) {
    opts = opts || {};
    const ds = (opts.maxStepCm || 0.01) * CM;
    const maxN = opts.maxSubsteps || 60000;
    const stopR = opts.stopRadius || 0.25;
    const b = opts.bounds;
    const src = active(charges);
    let t = 0, n = 0;
    let a = accel(src, p, p.x, p.y);
    while (t < T && n < maxN) {
      const v = Math.hypot(p.vx, p.vy), am = Math.hypot(a[0], a[1]);
      let dt = T - t;
      if (v > 0) dt = Math.min(dt, ds / v);
      if (am > 0) dt = Math.min(dt, Math.sqrt(2 * ds / am));
      p.x += (p.vx * dt + 0.5 * a[0] * dt * dt) / CM;
      p.y += (p.vy * dt + 0.5 * a[1] * dt * dt) / CM;
      const a2 = accel(src, p, p.x, p.y);
      p.vx += 0.5 * (a[0] + a2[0]) * dt;
      p.vy += 0.5 * (a[1] + a2[1]) * dt;
      a = a2;
      t += dt;
      n++;
      for (let i = 0; i < src.length; i++) {
        if (Math.hypot(p.x - src[i].x, p.y - src[i].y) < stopR) {
          return { reason: 'hit', charge: charges.indexOf(src[i]), t: t };
        }
      }
      if (b && (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1)) return { reason: 'out', t: t };
    }
    return null;
  }

  /** 試探電荷的能量（焦耳）：動能、電位能、總和 */
  function energy(charges, p) {
    const K_ = 0.5 * (p.m * 1e-3) * (p.vx * p.vx + p.vy * p.vy);
    const U = p.q * NC * potentialAt(charges, p.x, p.y);
    return { K: K_, U: U, total: K_ + U };
  }

  /**
   * 某一點的完整量測：合電場（分量、大小、方向角）、各電荷單獨產生的電場大小總和 Esum，
   * 電位 V 與各電荷電位絕對值總和 Vsum（用來判斷「幾乎抵消」的相對大小）。
   * 方向角 dir 以 +x 軸逆時針量起，範圍 [0, 360)；E = 0 時為 NaN。
   */
  function probeInfo(charges, x, y) {
    const e = fieldAt(charges, x, y);
    let esum = 0, vsum = 0;
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      if (c.q === 0) continue;
      const ei = fieldAt([c], x, y);
      esum += Math.hypot(ei.ex, ei.ey);
      vsum += Math.abs(potentialAt([c], x, y));
    }
    const m = Math.hypot(e.ex, e.ey);
    let dir = NaN;
    if (m > 0 && isFinite(m)) {
      dir = Math.atan2(e.ey, e.ex) * 180 / Math.PI;
      if (dir < 0) dir += 360;
      if (dir >= 360) dir -= 360;
    }
    return { ex: e.ex, ey: e.ey, E: m, Esum: esum, dir: dir, V: potentialAt(charges, x, y), Vsum: vsum };
  }

  const api = {
    K: K, NC: NC, CM: CM,
    probeInfo: probeInfo,
    fieldAt: fieldAt,
    potentialAt: potentialAt,
    traceFieldLine: traceFieldLine,
    fieldLines: fieldLines,
    contourSegments: contourSegments,
    advance: advance,
    energy: energy
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FieldCore = api;
})(this);
