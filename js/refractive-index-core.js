/*
 * refractive-index-core.js — 「折射率的測定（插針法）」的物理核心（與畫面無關，可單獨測試）
 *
 * 單位與座標：
 *   長度一律為 cm；紙面座標 x 向右、y 向上（數學座標）。
 *   畫在紙上的直線 L 是 y = 0、法線 N 是 x = 0，O 點是原點。
 *   透明塊的「局部座標」：
 *     長方形：上表面（貼著 L）y = 0、下表面 y = −t、左右兩端 x = ±w/2。
 *     半圓形：平面 y = 0（−R ≤ x ≤ R）、圓弧 x² + y² = R²（y ≤ 0），圓心在 O。
 *   透明塊可以繞 O 旋轉 rot（弧度，逆時針為正）：模擬「透明塊沒有對準 L」的系統誤差。
 *   角度：函式參數與回傳值是弧度；量測讀數（readAngle）是度。
 *
 * 光線追跡：每一個界面都用向量形式的司乃耳定律（n1 sinθ1 = n2 sinθ2）；
 *   光由光密射向光疏且入射角大於臨界角時全反射。穿透率用非偏振光的菲涅耳公式（T = 1 − R）。
 * 插針法的「像」：眼睛看到的針，是從針出發、經透明塊折射後恰好進入眼睛的那一條光線，
 *   看到的方向就是這條光線進入眼睛時的反方向。用「打靶法」（改變出發角度、二分法求根）找出這條光線。
 */
(function (root) {
  'use strict';

  const DEG = Math.PI / 180;

  /** 材料與公認折射率（鈉黃光 589 nm、室溫） */
  const MATERIALS = [
    { id: 'water', n: 1.333, zh: '水', en: 'Water' },
    { id: 'acrylic', n: 1.49, zh: '壓克力', en: 'Acrylic' },
    { id: 'crown', n: 1.52, zh: '冕牌玻璃', en: 'Crown glass' },
    { id: 'unknown', n: NaN, zh: '未知樣品', en: 'Unknown sample' }
  ];
  /** 未知樣品的折射率範圍（每次隨機） */
  const UNKNOWN_RANGE = [1.42, 1.68];

  /** 器材尺寸（cm） */
  const GEOM = {
    rectW: 12,        // 長方形透明塊沿 L 的長度
    semiR: 6,         // 半圓形透明盒（或半圓柱）的半徑
    pinShaft: 0.06,   // 大頭針針身直徑
    pinHead: 0.32,    // 針頭直徑
    pinHeight: 3.4,   // 針露出紙面的高度
    blockHeight: 1.8, // 透明塊的高度（俯視看不到，眼睛看的視野中用到）
    waterDepth: 1.5,  // 半圓盒中水的深度（半滿）
    eyeHeight: 1.0    // 眼睛貼近紙面、從側面看：眼睛高度
  };

  // ---------------- 向量 ----------------
  const v = function (x, y) { return { x: x, y: y }; };
  const add = function (a, b) { return v(a.x + b.x, a.y + b.y); };
  const sub = function (a, b) { return v(a.x - b.x, a.y - b.y); };
  const mul = function (a, k) { return v(a.x * k, a.y * k); };
  const dot = function (a, b) { return a.x * b.x + a.y * b.y; };
  const cross = function (a, b) { return a.x * b.y - a.y * b.x; };
  const len = function (a) { return Math.hypot(a.x, a.y); };
  const unit = function (a) { const L = Math.hypot(a.x, a.y) || 1; return v(a.x / L, a.y / L); };
  const rotate = function (a, ang) { const c = Math.cos(ang), s = Math.sin(ang); return v(c * a.x - s * a.y, s * a.x + c * a.y); };
  /** 兩向量的夾角（0 ～ π） */
  const angleBetween = function (a, b) { return Math.atan2(Math.abs(cross(a, b)), dot(a, b)); };
  /** 兩直線（不分方向）的夾角（0 ～ π/2） */
  const lineAngle = function (a, b) { return Math.atan2(Math.abs(cross(a, b)), Math.abs(dot(a, b))); };
  /** 由 a 轉到 b 的有號角（逆時針為正，−π ～ π） */
  const signedAngle = function (a, b) { return Math.atan2(cross(a, b), dot(a, b)); };

  // ---------------- 透明塊 ----------------
  /**
   * 建立透明塊。p = { shape: 'rect' | 'semi', t（長方形厚度）, w（長方形長度）, R（半圓半徑）, rot（旋轉，rad） }
   */
  function makeBlock(p) {
    const b = {
      shape: p.shape === 'semi' ? 'semi' : 'rect',
      t: p.t != null ? p.t : 6,
      w: p.w != null ? p.w : GEOM.rectW,
      R: p.R != null ? p.R : GEOM.semiR,
      rot: p.rot || 0
    };
    b.c = Math.cos(b.rot); b.s = Math.sin(b.rot);
    return b;
  }
  function toLocal(b, p) { return v(b.c * p.x + b.s * p.y, -b.s * p.x + b.c * p.y); }
  function toWorld(b, p) { return v(b.c * p.x - b.s * p.y, b.s * p.x + b.c * p.y); }

  /** 點是否在透明塊內（含邊界外 pad cm 的範圍） */
  function inside(b, p, pad) {
    pad = pad || 0;
    const q = toLocal(b, p);
    if (b.shape === 'rect') return q.x >= -b.w / 2 - pad && q.x <= b.w / 2 + pad && q.y <= pad && q.y >= -b.t - pad;
    return q.y <= pad && Math.hypot(q.x, q.y) <= b.R + pad;
  }

  /** 透明塊的輪廓（世界座標的多邊形，畫圖與求視角範圍用） */
  function outline(b, nArc) {
    const pts = [];
    if (b.shape === 'rect') {
      [[-b.w / 2, 0], [b.w / 2, 0], [b.w / 2, -b.t], [-b.w / 2, -b.t]].forEach(function (q) { pts.push(toWorld(b, v(q[0], q[1]))); });
    } else {
      const N = nArc || 64;
      for (let i = 0; i <= N; i++) { const a = Math.PI + Math.PI * i / N; pts.push(toWorld(b, v(b.R * Math.cos(a), b.R * Math.sin(a)))); }
    }
    return pts;
  }

  /** 某一個面的取樣點（世界座標），用來決定從針出發、打到這個面的角度範圍 */
  function faceSamples(b, face, N) {
    N = N || 48;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      let q;
      if (face === 'top') q = v(-b.w / 2 + b.w * u, 0);
      else if (face === 'bottom') q = v(-b.w / 2 + b.w * u, -b.t);
      else if (face === 'flat') q = v(-b.R + 2 * b.R * u, 0);
      else if (face === 'arc') { const a = Math.PI + Math.PI * u; q = v(b.R * Math.cos(a), b.R * Math.sin(a)); }
      else continue;
      pts.push(toWorld(b, q));
    }
    return pts;
  }

  const T_EPS = 1e-7;
  /** 局部座標中，射線 p + s·u（s > 0）第一個碰到的面：{ s, p, face, nrm（向外的法向量） } */
  function hitLocal(b, p, u) {
    let best = null;
    const take = function (s, face, q, nrm) { if (s > T_EPS && (!best || s < best.s)) best = { s: s, p: q, face: face, nrm: nrm }; };
    const E = 1e-10;
    if (b.shape === 'rect') {
      const hw = b.w / 2;
      if (Math.abs(u.y) > 1e-15) {
        let s = -p.y / u.y, x = p.x + s * u.x;
        if (x >= -hw - E && x <= hw + E) take(s, 'top', v(x, 0), v(0, 1));
        s = (-b.t - p.y) / u.y; x = p.x + s * u.x;
        if (x >= -hw - E && x <= hw + E) take(s, 'bottom', v(x, -b.t), v(0, -1));
      }
      if (Math.abs(u.x) > 1e-15) {
        let s = (-hw - p.x) / u.x, y = p.y + s * u.y;
        if (y <= E && y >= -b.t - E) take(s, 'left', v(-hw, y), v(-1, 0));
        s = (hw - p.x) / u.x; y = p.y + s * u.y;
        if (y <= E && y >= -b.t - E) take(s, 'right', v(hw, y), v(1, 0));
      }
    } else {
      const R = b.R;
      if (Math.abs(u.y) > 1e-15) {
        const s = -p.y / u.y, x = p.x + s * u.x;
        if (x >= -R - E && x <= R + E) take(s, 'flat', v(x, 0), v(0, 1));
      }
      const B = dot(p, u), Cq = dot(p, p) - R * R, disc = B * B - Cq;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        [-B - sq, -B + sq].forEach(function (s) {
          const q = v(p.x + s * u.x, p.y + s * u.y);
          if (q.y <= E) take(s, 'arc', q, v(q.x / R, q.y / R));
        });
      }
    }
    return best;
  }

  /** 非偏振光的菲涅耳穿透率（cosI、cosT 為入射角與折射角的餘弦） */
  function fresnelT(n1, n2, cosI, cosT) {
    const rs = (n1 * cosI - n2 * cosT) / (n1 * cosI + n2 * cosT);
    const rp = (n2 * cosI - n1 * cosT) / (n2 * cosI + n1 * cosT);
    return 1 - (rs * rs + rp * rp) / 2;
  }

  /**
   * 向量形式的折射：u 為入射方向（單位向量），nrm 為界面的法向量（哪一側都可以），由 n1 進入 n2。
   * 回傳 { tir, u（折射或全反射後的方向）, T（穿透率）, cosI, cosT }
   */
  function refract(u, nrm, n1, n2) {
    let N = nrm, cosI = -dot(u, N);
    if (cosI < 0) { N = mul(N, -1); cosI = -cosI; }
    const eta = n1 / n2, k = 1 - eta * eta * (1 - cosI * cosI);
    if (k < 0) return { tir: true, u: unit(add(u, mul(N, 2 * cosI))), T: 0, cosI: cosI, cosT: NaN };
    const cosT = Math.sqrt(k);
    const out = unit(add(mul(u, eta), mul(N, eta * cosI - cosT)));
    return { tir: false, u: out, T: fresnelT(n1, n2, cosI, cosT), cosI: cosI, cosT: cosT };
  }

  /** 司乃耳定律：入射角 th1（rad）由 n1 進入 n2 的折射角；全反射時 NaN */
  function snell(n1, n2, th1) {
    const s = n1 * Math.sin(th1) / n2;
    return Math.abs(s) > 1 ? NaN : Math.asin(s);
  }
  /** 由折射率 n 的介質射向空氣的臨界角 */
  function criticalAngle(n) { return n > 1 ? Math.asin(1 / n) : NaN; }
  /** 長方形透明塊造成的側向位移 d = t sin(θ1 − θ2) / cos θ2 */
  function lateralShift(t, th1, th2) { return t * Math.sin(th1 - th2) / Math.cos(th2); }

  /**
   * 光線追跡（世界座標）：由塊外的 p0 沿 u0 出發。
   * 回傳 { pts（轉折點，含起點）, faces（依序碰到的面）, exited, missed, trapped, tir, T, pOut, uOut, refl }
   *   refl：在入射面反射的部分光（只記第一個界面）{ p, u, R }。
   */
  function trace(b, n, p0, u0, maxIn) {
    maxIn = maxIn || 6;
    let p = toLocal(b, p0), u = toLocal(b, unit(u0));
    const pts = [v(p0.x, p0.y)], faces = [];
    let h = hitLocal(b, p, u);
    if (!h || dot(h.nrm, u) >= 0) return { pts: pts, faces: faces, exited: false, missed: true, trapped: false, tir: false, T: 1, pOut: v(p0.x, p0.y), uOut: unit(u0) };
    let r = refract(u, h.nrm, 1, n);
    const reflDir = unit(sub(u, mul(h.nrm, 2 * dot(u, h.nrm))));
    const refl = { p: toWorld(b, h.p), u: toWorld(b, reflDir), R: 1 - r.T };
    let T = r.T, tir = false;
    p = h.p; u = r.u; faces.push(h.face); pts.push(toWorld(b, p));
    for (let i = 0; i < maxIn; i++) {
      h = hitLocal(b, p, u);
      if (!h) break;
      p = h.p; faces.push(h.face); pts.push(toWorld(b, p));
      r = refract(u, h.nrm, n, 1);
      if (r.tir) { tir = true; u = r.u; continue; }
      T *= r.T;
      return { pts: pts, faces: faces, exited: true, missed: false, trapped: false, tir: tir, T: T, pOut: toWorld(b, p), uOut: toWorld(b, r.u), refl: refl };
    }
    return { pts: pts, faces: faces, exited: false, missed: false, trapped: true, tir: tir, T: 0, pOut: toWorld(b, p), uOut: toWorld(b, u), refl: refl };
  }

  /** 射線 p + s·u 與透明塊的第一個交點距離（沒有交點時 Infinity） */
  function firstHit(b, p, u) {
    const h = hitLocal(b, toLocal(b, p), toLocal(b, unit(u)));
    return h ? h.s : Infinity;
  }
  /** 線段 a→c 是否穿過透明塊 */
  function segmentHits(b, a, c) { return firstHit(b, a, sub(c, a)) < len(sub(c, a)); }

  /**
   * 透過透明塊看針的「像」：找出從針 pin 出發、由 entry 面進入、由 exit 面射出、恰好進入眼睛 eye 的光線。
   * 回傳 { ok, dir（由眼睛指向所見的像，單位向量）, T（穿透率）, pts（光路，含眼睛）, roots（解的個數） }
   */
  function imageOf(b, n, pin, eye, entry, exit, N) {
    N = N || 120;
    const center = toWorld(b, b.shape === 'rect' ? v(0, -b.t / 2) : v(0, -b.R / 2));
    const ref = unit(sub(center, pin));
    let a0 = Infinity, a1 = -Infinity;
    faceSamples(b, entry, 48).forEach(function (q) {
      const a = signedAngle(ref, sub(q, pin));
      if (a < a0) a0 = a;
      if (a > a1) a1 = a;
    });
    if (!(a1 > a0)) return { ok: false };
    const evalAt = function (a) {
      const u = rotate(ref, a);
      const tr = trace(b, n, pin, u, 2);
      if (!tr.exited || tr.faces.length !== 2 || tr.faces[0] !== entry || tr.faces[1] !== exit) return null;
      const w = sub(eye, tr.pOut);
      if (dot(tr.uOut, w) <= 0) return null;
      return { g: cross(tr.uOut, w), tr: tr };
    };
    const samples = [];
    for (let k = 0; k < N; k++) {
      const a = a0 + (a1 - a0) * (k + 0.5) / N;
      samples.push({ a: a, r: evalAt(a) });
    }
    const roots = [];
    for (let k = 0; k + 1 < samples.length; k++) {
      const s0 = samples[k], s1 = samples[k + 1];
      if (!s0.r || !s1.r) continue;
      if (s0.r.g === 0) { roots.push(s0.r.tr); continue; }
      if (s0.r.g * s1.r.g > 0) continue;
      let lo = s0.a, hi = s1.a, glo = s0.r.g, best = null;
      for (let it = 0; it < 60; it++) {
        const mid = (lo + hi) / 2, m = evalAt(mid);
        if (!m) { best = null; break; }
        best = m;
        if (m.g === 0) break;
        if ((m.g > 0) === (glo > 0)) { lo = mid; glo = m.g; } else hi = mid;
      }
      if (best) roots.push(best.tr);
    }
    if (!roots.length) return { ok: false, roots: 0 };
    roots.sort(function (x, y) { return y.T - x.T; });
    const tr = roots[0];
    return { ok: true, dir: mul(unit(tr.uOut), -1), T: tr.T, pts: tr.pts.concat([v(eye.x, eye.y)]), roots: roots.length };
  }

  /**
   * 眼睛看一根針：上段（高過透明塊的部分）直接看到；下段若視線穿過透明塊，看到的是折射後的像。
   * 回傳 { upper（方向）, lower: { ok, dir, T, direct }, dist（針到眼睛的距離） }
   * direct：true 表示下段也是直接看到（視線沒有穿過透明塊）。
   */
  function viewPin(b, n, pin, eye, entry, exit) {
    const d = sub(pin, eye), dist = len(d), dir = unit(d);
    let lower;
    if (!b || !segmentHits(b, eye, pin)) lower = { ok: true, dir: dir, T: 1, direct: true };
    else {
      const im = imageOf(b, n, pin, eye, entry, exit);
      lower = im.ok ? { ok: true, dir: im.dir, T: im.T, direct: false, pts: im.pts } : { ok: false, direct: false };
    }
    return { upper: dir, lower: lower, dist: dist };
  }

  // ---------------- 幾何量測 ----------------
  /** 兩直線（點 p 方向 u、點 q 方向w）的交點；平行時 null */
  function intersect(p, u, q, w) {
    const den = cross(u, w);
    if (Math.abs(den) < 1e-12) return null;
    const s = cross(sub(q, p), w) / den;
    return add(p, mul(u, s));
  }
  /** 點到直線（過 a、方向 u）的距離 */
  function distToLine(p, a, u) { return Math.abs(cross(unit(u), sub(p, a))); }

  /**
   * 長方形透明塊：拿走透明塊後，由四根針畫出的線量測（真實幾何值，未加讀數誤差）。
   *   L：紙上畫的 y = 0；L′：沿透明塊下表面描出的線（透明塊若有旋轉，L′ 也跟著轉）。
   *   O = 直線 AB 與 L 的交點；O′ = 直線 CD 與 L′ 的交點；法線 N 過 O 且垂直 L。
   * 回傳 { ok, O, O2, th1, th2, th3, th4（rad）, side（入射針在法線左側 −1、右側 +1）,
   *        parallel（AB 與 CD 的夾角）, shift（O′ 到直線 AB 的距離）, why（不能量測的原因） }
   */
  function measureRect(b, A, B, Cp, Dp) {
    if (!A || !B || !Cp || !Dp) return { ok: false, why: 'pins' };
    if (len(sub(A, B)) < 0.8 || len(sub(Cp, Dp)) < 0.8) return { ok: false, why: 'close' };
    const uAB = unit(sub(B, A)), uCD = unit(sub(Dp, Cp));
    const O = intersect(A, uAB, v(0, 0), v(1, 0));
    const L2a = toWorld(b, v(-b.w / 2, -b.t)), L2d = toWorld(b, v(1, 0));
    const O2 = intersect(Cp, uCD, L2a, L2d);
    if (!O || !O2) return { ok: false, why: 'parallel' };
    const nUp = v(0, 1), nIn2 = toWorld(b, v(0, 1)), nOut2 = mul(nIn2, -1);
    const far = len(sub(Dp, O2)) > len(sub(Cp, O2)) ? Dp : Cp;
    const th1 = angleBetween(sub(A, O), nUp);
    const th2 = angleBetween(sub(O2, O), v(0, -1));
    const th3 = angleBetween(sub(O, O2), nIn2);
    const th4 = angleBetween(sub(far, O2), nOut2);
    const side = A.x < O.x ? -1 : 1;
    // O 要落在上表面、O′ 要落在下表面上（光從側面射出時，CD 與 L′ 的交點沒有意義）
    const onTop = Math.abs(toLocal(b, O).x) <= b.w / 2 + 1e-9, onBottom = Math.abs(toLocal(b, O2).x) <= b.w / 2 + 1e-9;
    const ok = th1 < Math.PI / 2 && th2 < Math.PI / 2 && th4 < Math.PI / 2 && onTop && onBottom && O2.y < 0;
    return {
      ok: ok, why: ok ? '' : 'geom', O: O, O2: O2, th1: th1, th2: th2, th3: th3, th4: th4, side: side,
      parallel: lineAngle(uAB, uCD), shift: distToLine(O2, A, uAB),
      // 出射線與入射線的方向是否「同向偏移」（O′ 在法線的另一側才合理）
      crossed: (O2.x - O.x) * (A.x - O.x) < 0
    };
  }

  /**
   * 半圓形：直線 PO（入射側）與 OP′（觀察側）的量測。dir = 'fwd'（平面側入射）或 'rev'（弧面側入射）。
   *   θ1 一律是空氣側的角、θ2 一律是透明塊內的角；x1、x2 是兩直線與圓（半徑 R）的交點到法線 N 的距離。
   */
  function measureSemi(b, P, P2, dir) {
    if (!P || !P2) return { ok: false, why: 'pins' };
    const O = v(0, 0);
    if (len(P) < 0.5 || len(P2) < 0.5) return { ok: false, why: 'close' };
    const air = dir === 'rev' ? P2 : P, med = dir === 'rev' ? P : P2;
    const th1 = angleBetween(sub(air, O), v(0, 1));
    const th2 = angleBetween(sub(med, O), v(0, -1));
    const ok = air.y > 0 && med.y < 0 && th1 < Math.PI / 2 && th2 < Math.PI / 2;
    return { ok: ok, why: ok ? '' : 'geom', O: O, th1: th1, th2: th2, x1: b.R * Math.sin(th1), x2: b.R * Math.sin(th2), side: P.x < 0 ? -1 : 1, crossed: (air.x) * (med.x) < 0 };
  }

  /**
   * 對準誤差（任務與診斷用）：學生插的觀察側針，與「真正的光路」差多少。
   *   長方形：由直線 AB 追跡出真正的出射光，和直線 CD 比較 → { ang（夾角 rad）, off（C、D 到真正出射光的最大距離 cm） }
   *   半圓形：由直線 PO 在 O 的折射求出真正的光線方向，和直線 OP′ 比較。
   */
  function alignError(b, n, shape, pins, dir) {
    if (shape === 'rect') {
      const A = pins.A, B = pins.B, Cp = pins.C, Dp = pins.D;
      if (!A || !B || !Cp || !Dp) return null;
      const tr = trace(b, n, A, sub(B, A));
      if (!tr.exited || tr.faces[0] !== 'top' || tr.faces[tr.faces.length - 1] !== 'bottom') return null;
      return {
        ang: lineAngle(tr.uOut, sub(Dp, Cp)),
        off: Math.max(distToLine(Cp, tr.pOut, tr.uOut), distToLine(Dp, tr.pOut, tr.uOut)),
        uOut: tr.uOut, pOut: tr.pOut, tir: tr.tir
      };
    }
    const P = pins.P, P2 = pins.P2;
    if (!P || !P2) return null;
    const O = v(0, 0);
    const nrm = toWorld(b, v(0, 1));
    const u = unit(sub(O, P));
    const r = dir === 'rev' ? refract(u, nrm, n, 1) : refract(u, nrm, 1, n);
    if (r.tir) return { ang: NaN, off: NaN, tir: true };
    const w = unit(sub(P2, O));
    return { ang: angleBetween(r.u, w), off: distToLine(P2, O, r.u), uOut: r.u, pOut: O, tir: false };
  }

  /** 半圓形弧面側入射：直線 PO 在平面上（透明塊內）的入射角（相對於真正的平面法線）與是否全反射 */
  function reverseInfo(b, n, P) {
    const nrm = toWorld(b, v(0, 1));
    const u = unit(sub(v(0, 0), P));
    const thMed = angleBetween(mul(u, -1), mul(nrm, -1));
    const r = refract(u, nrm, n, 1);
    return { thMed: thMed, crit: criticalAngle(n), tir: r.tir, T: r.tir ? 0 : r.T, thAir: r.tir ? NaN : angleBetween(r.u, nrm) };
  }

  // ---------------- 讀數與誤差 ----------------
  /** 可重現的亂數產生器（mulberry32），回傳 0 ≤ x < 1 */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 標準常態分布亂數（Box–Muller） */
  function gauss(r) {
    let u = 0, w = 0;
    while (u <= 1e-12) u = r();
    w = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w);
  }
  function roundTo(x, res) { return +(Math.round(x / res) * res).toFixed(6); }
  /** 量角器讀數（度）：真實角度加上隨機誤差 sigma（度），再取到解析度 res（0.5° 或 1°） */
  function readAngle(trueDeg, res, sigma, r) {
    const x = trueDeg + (sigma > 0 && r ? sigma * gauss(r) : 0);
    return Math.max(0, roundTo(x, res));
  }
  /** 直尺讀數（cm）：最小刻度 1 mm，估計到 0.1 mm（res = 0.01 cm） */
  function readLength(trueCm, res, sigma, r) {
    const x = trueCm + (sigma > 0 && r ? sigma * gauss(r) : 0);
    return Math.max(0, roundTo(x, res));
  }
  /** 隨機的未知樣品折射率（取到 0.001） */
  function unknownN(r) { return +(UNKNOWN_RANGE[0] + (UNKNOWN_RANGE[1] - UNKNOWN_RANGE[0]) * r()).toFixed(3); }
  /** 「透明塊沒有對準 L」的系統誤差：0.6° ～ 1.4°、正負隨機（rad） */
  function systematicRot(r) { return (r() < 0.5 ? -1 : 1) * (0.6 + 0.8 * r()) * DEG; }

  // ---------------- 數據分析 ----------------
  /** 過原點的最佳直線 y = m x：m = Σxy / Σx²；se 為斜率的標準誤差 */
  function fitOrigin(xs, ys) {
    const N = xs.length;
    if (!N) return { n: 0, m: NaN, se: NaN };
    let sxx = 0, sxy = 0;
    for (let i = 0; i < N; i++) { sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
    if (sxx <= 0) return { n: N, m: NaN, se: NaN };
    const m = sxy / sxx;
    let rss = 0;
    for (let i = 0; i < N; i++) { const e = ys[i] - m * xs[i]; rss += e * e; }
    return { n: N, m: m, se: N > 1 ? Math.sqrt(rss / ((N - 1) * sxx)) : NaN };
  }
  /** 一般最佳直線 y = m x + c（最小平方法） */
  function fitLine(xs, ys) {
    const N = xs.length;
    if (N < 2) return { n: N, m: NaN, c: NaN };
    let sx = 0, sy = 0;
    for (let i = 0; i < N; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / N, my = sy / N;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < N; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (sxx <= 0) return { n: N, m: NaN, c: NaN };
    const m = sxy / sxx, c = my - m * mx;
    return { n: N, m: m, c: c, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1 };
  }
  /** 百分誤差 (測量值 − 公認值) / 公認值 × 100 */
  function pctError(meas, acc) { return (meas - acc) / acc * 100; }

  // ---------------- 理想插針（測試、任務證明用） ----------------
  /** 長方形：A、B 決定入射線，沿真正的出射光放 C、D（距出射點 d1、d2 cm）與眼睛（距 de cm） */
  function idealRect(b, n, A, B, d1, d2, de) {
    const tr = trace(b, n, A, sub(B, A));
    if (!tr.exited) return null;
    const u = unit(tr.uOut);
    return { C: add(tr.pOut, mul(u, d1)), D: add(tr.pOut, mul(u, d2)), eye: add(tr.pOut, mul(u, de || d2 + 4)), pOut: tr.pOut, uOut: u };
  }
  /** 半圓形：P 決定入射線 PO，沿真正的折射光放 P′（距 O 為 d cm）與眼睛（距 de cm） */
  function idealSemi(b, n, P, dir, d, de) {
    const nrm = toWorld(b, v(0, 1));
    const u = unit(sub(v(0, 0), P));
    const r = dir === 'rev' ? refract(u, nrm, n, 1) : refract(u, nrm, 1, n);
    if (r.tir) return null;
    return { P2: mul(r.u, d), eye: mul(r.u, de || d + 4), u: r.u };
  }

  const api = {
    DEG: DEG, MATERIALS: MATERIALS, UNKNOWN_RANGE: UNKNOWN_RANGE, GEOM: GEOM,
    v: v, add: add, sub: sub, mul: mul, dot: dot, cross: cross, len: len, unit: unit, rotate: rotate,
    angleBetween: angleBetween, lineAngle: lineAngle, signedAngle: signedAngle,
    makeBlock: makeBlock, toLocal: toLocal, toWorld: toWorld, inside: inside, outline: outline,
    refract: refract, fresnelT: fresnelT, snell: snell, criticalAngle: criticalAngle, lateralShift: lateralShift,
    trace: trace, firstHit: firstHit, segmentHits: segmentHits, imageOf: imageOf, viewPin: viewPin,
    intersect: intersect, distToLine: distToLine, measureRect: measureRect, measureSemi: measureSemi,
    alignError: alignError, reverseInfo: reverseInfo,
    rng: rng, gauss: gauss, readAngle: readAngle, readLength: readLength, unknownN: unknownN, systematicRot: systematicRot,
    fitOrigin: fitOrigin, fitLine: fitLine, pctError: pctError,
    idealRect: idealRect, idealSemi: idealSemi
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RefractiveIndexCore = api;
})(this);
