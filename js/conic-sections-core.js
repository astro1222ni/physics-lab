/*
 * conic-sections-core.js — 圓錐曲線的數學核心（與畫面無關，可單獨測試）
 *
 * 雙圓錐：頂點 V 在原點，軸沿 z 軸，半頂角 α（母線與軸的夾角，0° < α < 90°）：x² + y² = z² tan²α。
 * 切平面：與 xz 平面垂直（所以「過軸的側視剖面」就是 xz 平面），與軸的夾角 β（0°–90°），
 *   頂點到切平面的距離 d ≥ 0。單位法向量 m = (−cos β, 0, sin β)，平面為 m·X = d。
 *   平面上的座標：原點取「頂點在平面上的垂足」F0 = d·m，s 軸沿 u = (sin β, 0, cos β)（在 xz 平面內、沿著切口往上），
 *   t 軸沿 w = (0, 1, 0)。點 X = F0 + s·u + t·w。
 * 代入錐面方程式得到切口：A s² − 2 d sinβ cosβ s + d²(cos²α + cos²β − 1) + cos²α t² = 0，A = cos²α − cos²β。
 *   A > 0（β > α）：橢圓（β = 90° 時是圓）；A = 0（β = α）：拋物線；A < 0（β < α）：雙曲線。
 *   d = 0（平面通過頂點）時退化：β > α 只剩頂點一點、β = α 是一條直線（平面貼著一條母線）、β < α 是兩條相交直線。
 * 離心率 e = cos β ／ cos α。
 * 標準式座標（x′, y′）：x′ 沿 s 軸（主軸），y′ = t；原點在中心（橢圓、圓、雙曲線）或頂點（拋物線），退化時在頂點 V。
 *   橢圓：x′²/a² + y′²/b² = 1，a = d sinα cosα／A，b = d sinα／√A，c² = a² − b²。
 *   雙曲線：x′²/a² − y′²/b² = 1，a = d sinα cosα／|A|，b = d sinα／√|A|，c² = a² + b²，漸近線 y′ = ±(b/a) x′。
 *   拋物線：y′² = 4p x′，p = (d tan α)／2，正焦弦長 4p。
 * 丹德林球（Dandelin spheres）：球心在軸上 (0, 0, z_c)、與錐面相切（半徑 |z_c| sin α）、又與切平面相切，
 *   z_c = d／(sin β + sin α)（靠頂點的小球）與 z_c = d／(sin β − sin α)（橢圓在同一個錐、雙曲線在另一個錐、拋物線時不存在）。
 *   球與切平面的切點就是焦點；球與錐面相切的圓所在的水平面與切平面的交線就是準線。
 * 所有長度沒有單位（「單位長」），角度的輸入與輸出用度。
 */
(function (root) {
  'use strict';

  const DEG = Math.PI / 180;
  const EPS_DEG = 1e-7;   // 角度相等的容許值（度）：滑桿與打字輸入的值都是精確的十進位數
  const EPS_D = 1e-9;     // d = 0 的容許值

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function norm(a) { return Math.sqrt(dot(a, a)); }
  function dist3(a, b) { return norm(sub(a, b)); }

  /** 依兩個角度判斷「平面不過頂點時」是哪一種曲線 */
  function familyOf(alphaDeg, betaDeg) {
    if (betaDeg >= 90 - EPS_DEG) return 'circle';
    if (Math.abs(betaDeg - alphaDeg) <= EPS_DEG) return 'parabola';
    return betaDeg > alphaDeg ? 'ellipse' : 'hyperbola';
  }

  /**
   * 切口的完整描述。alphaDeg：半頂角（度）；betaDeg：切平面與軸的夾角（度，0–90）；d：頂點到切平面的距離（≥ 0）。
   */
  function section(alphaDeg, betaDeg, d) {
    alphaDeg = +alphaDeg; betaDeg = Math.max(0, Math.min(90, +betaDeg)); d = Math.max(0, +d);
    const al = alphaDeg * DEG, be = betaDeg * DEG;
    const sa = Math.sin(al), ca = Math.cos(al);
    const family = familyOf(alphaDeg, betaDeg);
    // β = 90° 時 cos β 取精確的 0（避免 6e-17 讓圓的焦點、中心出現極小的偏差）
    const sb = family === 'circle' ? 1 : Math.sin(be), cb = family === 'circle' ? 0 : Math.cos(be);
    const m = [-cb, 0, sb], u = [sb, 0, cb], w = [0, 1, 0];
    const foot = [d * m[0], 0, d * m[2]];
    const A = family === 'parabola' ? 0 : ca * ca - cb * cb;
    const e = cb / ca;
    const degenerate = d <= EPS_D;
    let type = family;
    if (degenerate) type = family === 'parabola' ? 'line' : (family === 'hyperbola' ? 'lines' : 'point');

    const sec = {
      alphaDeg: alphaDeg, betaDeg: betaDeg, d: d, alpha: al, beta: be,
      family: family, type: type, degenerate: degenerate,
      e: e, A: A, m: m, u: u, w: w, foot: foot,
      axisHit: sb > 1e-12 ? d / sb : (d <= EPS_D ? 0 : null), // 平面與軸的交點到頂點的距離（平面平行於軸時為 null）
      sC: 0, a: NaN, b: NaN, c: NaN, p: NaN, latus: NaN, slope: NaN, phi: NaN,
      foci: [], directrices: [], vertices: [], spheres: []
    };

    // ---- 丹德林球（平面不過頂點時）----
    if (!degenerate) {
      const zs = [d / (sb + sa)];
      if (family !== 'parabola') zs.push(d / (sb - sa));
      zs.forEach(function (zc) {
        const r = Math.abs(zc) * sa;
        // 切點（焦點）：球心沿法向量走到平面上
        const off = zc * sb - d; // m·C − d（球心到平面的有號距離）
        const F = [-off * m[0], 0, zc - off * m[2]];
        const ringZ = zc * ca * ca, ringR = Math.abs(zc) * sa * ca;
        // 焦點與準線在平面座標（沿 u）的位置
        const sF = dot(sub(F, foot), u);
        const sD = cb > 1e-12 ? (ringZ - d * sb) / cb : null; // 準線：水平面 z = ringZ 與切平面的交線
        sec.spheres.push({ zc: zc, r: r, focus3: F, ringZ: ringZ, ringR: ringR, sF: sF, sD: sD });
      });
    }

    // ---- 標準式 ----
    if (degenerate) {
      sec.sC = 0;
      if (type === 'lines') {
        sec.slope = Math.sqrt(Math.max(0, cb * cb - ca * ca)) / ca;
        sec.phi = Math.atan(sec.slope) / DEG;
      } else if (type === 'line') {
        sec.slope = 0; sec.phi = 0;
      }
      sec.a = 0; sec.b = 0; sec.c = 0;
      sec.vertices = [{ x: 0, y: 0 }];
    } else if (family === 'parabola') {
      sec.p = d * Math.tan(al) / 2;
      sec.latus = 4 * sec.p;
      sec.sC = d * Math.cos(2 * al) / Math.sin(2 * al); // 頂點在平面座標的位置
      sec.vertices = [{ x: 0, y: 0 }];
    } else {
      const Aa = Math.abs(A);
      sec.a = d * sa * ca / Aa;
      sec.b = family === 'circle' ? sec.a : d * sa / Math.sqrt(Aa); // 圓：b = a（= d tan α）精確相等
      sec.c = family === 'hyperbola' ? Math.sqrt(sec.a * sec.a + sec.b * sec.b) : Math.sqrt(Math.max(0, sec.a * sec.a - sec.b * sec.b));
      sec.sC = d * sb * cb / A;
      sec.latus = 2 * sec.b * sec.b / sec.a;
      sec.vertices = [{ x: -sec.a, y: 0 }, { x: sec.a, y: 0 }];
      if (family === 'hyperbola') {
        sec.slope = sec.b / sec.a;
        sec.phi = Math.atan(sec.slope) / DEG; // 漸近線與主軸的夾角（cos φ = 1/e）
      }
    }
    sec.spheres.forEach(function (S) {
      S.fx = S.sF - sec.sC;
      S.dx = S.sD == null ? null : S.sD - sec.sC;
      sec.foci.push({ x: S.fx, y: 0 });
      sec.directrices.push(S.dx);
    });
    return sec;
  }

  // ---------- 座標轉換 ----------
  /** 標準式座標 (x′, y′) → 空間座標 [x, y, z] */
  function toSpace(sec, x, y) {
    const s = x + sec.sC;
    return [sec.foot[0] + s * sec.u[0], y, sec.foot[2] + s * sec.u[2]];
  }
  /** 空間中平面上的點 → 標準式座標 */
  function fromSpace(sec, X) {
    const r = sub(X, sec.foot);
    return { x: dot(r, sec.u) - sec.sC, y: r[1] };
  }
  /** 錐面方程式的殘差：(x² + y²) cos²α − z² sin²α（點在錐面上時為 0） */
  function coneResidual(sec, X) {
    const ca = Math.cos(sec.alpha), sa = Math.sin(sec.alpha);
    return (X[0] * X[0] + X[1] * X[1]) * ca * ca - X[2] * X[2] * sa * sa;
  }
  /** 平面方程式的殘差：m·X − d */
  function planeResidual(sec, X) { return dot(sec.m, X) - sec.d; }

  // ---------- 曲線上的點（參數式）----------
  /**
   * par = { br, t }：
   *   圓、橢圓：(a cos t, b sin t)；雙曲線：(br·a cosh t, b sinh t)，br = ±1 是哪一支；拋物線：(t²/(4p), t)；
   *   兩相交直線：t·(cos φ, br·sin φ)；一條直線：(t, 0)；一點：(0, 0)。
   */
  function pointAt(sec, par) {
    const t = par.t, br = par.br < 0 ? -1 : 1;
    switch (sec.type) {
      case 'circle': case 'ellipse': return { x: sec.a * Math.cos(t), y: sec.b * Math.sin(t) };
      case 'hyperbola': return { x: br * sec.a * Math.cosh(t), y: sec.b * Math.sinh(t) };
      case 'parabola': return { x: t * t / (4 * sec.p), y: t };
      case 'lines': { const ph = sec.phi * DEG; return { x: t * Math.cos(ph), y: br * t * Math.sin(ph) }; }
      case 'line': return { x: t, y: 0 };
      default: return { x: 0, y: 0 };
    }
  }
  /** 曲線上 par 處的切線方向（單位向量） */
  function tangentAt(sec, par) {
    const t = par.t, br = par.br < 0 ? -1 : 1;
    let dx = 1, dy = 0;
    switch (sec.type) {
      case 'circle': case 'ellipse': dx = -sec.a * Math.sin(t); dy = sec.b * Math.cos(t); break;
      case 'hyperbola': dx = br * sec.a * Math.sinh(t); dy = sec.b * Math.cosh(t); break;
      case 'parabola': dx = t / (2 * sec.p); dy = 1; break;
      case 'lines': { const ph = sec.phi * DEG; dx = Math.cos(ph); dy = br * Math.sin(ph); break; }
      default: break;
    }
    const L = Math.hypot(dx, dy) || 1;
    return { x: dx / L, y: dy / L };
  }

  /**
   * 曲線上離 (x, y) 最近的點（拖曳 P 用）：先等距取樣找最近的段，再用黃金分割細化。
   * 傳回 { par, x, y, dist }。退化成一點時永遠是頂點。
   */
  function nearest(sec, x, y) {
    if (sec.type === 'point') return { par: { br: 1, t: 0 }, x: 0, y: 0, dist: Math.hypot(x, y) };
    const cands = [];
    const d2 = function (par) { const q = pointAt(sec, par); return (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y); };
    function scan(br, t0, t1, n) {
      let best = null;
      for (let i = 0; i <= n; i++) {
        const t = t0 + (t1 - t0) * i / n, v = d2({ br: br, t: t });
        if (!best || v < best.v) best = { v: v, i: i };
      }
      const h = (t1 - t0) / n;
      let lo = t0 + h * Math.max(0, best.i - 1), hi = t0 + h * Math.min(n, best.i + 1);
      const g = (Math.sqrt(5) - 1) / 2;
      let c = hi - g * (hi - lo), dd = lo + g * (hi - lo);
      let fc = d2({ br: br, t: c }), fd = d2({ br: br, t: dd });
      for (let k = 0; k < 60; k++) {
        if (fc < fd) { hi = dd; dd = c; fd = fc; c = hi - g * (hi - lo); fc = d2({ br: br, t: c }); }
        else { lo = c; c = dd; fc = fd; dd = lo + g * (hi - lo); fd = d2({ br: br, t: dd }); }
      }
      const t = (lo + hi) / 2;
      cands.push({ par: { br: br, t: t }, v: d2({ br: br, t: t }) });
    }
    const R = Math.hypot(x, y) + 1;
    switch (sec.type) {
      case 'circle': case 'ellipse': scan(1, -Math.PI, Math.PI, 360); break;
      case 'hyperbola': {
        const tm = Math.asinh((Math.abs(y) + R + sec.a) / sec.b) + 0.5;
        scan(1, -tm, tm, 400); scan(-1, -tm, tm, 400); break;
      }
      case 'parabola': { const tm = R + Math.abs(y) + 4 * sec.p + 1; scan(1, -tm, tm, 600); break; }
      case 'lines': scan(1, -R - 1, R + 1, 200); scan(-1, -R - 1, R + 1, 200); break;
      case 'line': scan(1, -R - 1, R + 1, 200); break;
      default: break;
    }
    cands.sort(function (p, q) { return p.v - q.v; });
    const b = cands[0], q = pointAt(sec, b.par);
    if (sec.type === 'circle' || sec.type === 'ellipse') b.par.t = Math.atan2(Math.sin(b.par.t), Math.cos(b.par.t));
    return { par: b.par, x: q.x, y: q.y, dist: Math.sqrt(b.v) };
  }

  /**
   * 量測：曲線上一點 P（標準式座標）到焦點、準線的距離，以及丹德林證明用的點。
   * 傳回 { P3, PF[], PD[], ratio[]（PF/PD）, sum, diff, K[]（過 P 的母線與相切圓的交點）, PK[] }。
   */
  function measure(sec, x, y) {
    const P3 = toSpace(sec, x, y);
    const out = { x: x, y: y, P3: P3, PF: [], PD: [], ratio: [], K: [], PK: [], sum: NaN, diff: NaN };
    sec.spheres.forEach(function (S) {
      const pf = Math.hypot(x - S.fx, y);
      const pd = S.dx == null ? NaN : Math.abs(x - S.dx);
      out.PF.push(pf);
      out.PD.push(pd);
      out.ratio.push(pd > 0 ? pf / pd : (pf === 0 ? NaN : Infinity));
      // 過 P 的母線（過頂點的直線）與相切圓所在水平面的交點 K：P 沿著母線縮放到 z = ringZ
      if (Math.abs(P3[2]) > 1e-12) {
        const k = S.ringZ / P3[2];
        const K = [P3[0] * k, P3[1] * k, S.ringZ];
        out.K.push(K);
        out.PK.push(dist3(P3, K));
      } else { out.K.push(null); out.PK.push(NaN); }
    });
    if (out.PF.length === 2) { out.sum = out.PF[0] + out.PF[1]; out.diff = Math.abs(out.PF[0] - out.PF[1]); }
    return out;
  }

  /**
   * 取樣曲線（畫圖用）：傳回多段折線（每段是標準式座標的點陣列）。
   * R：取樣範圍（|x′|、|y′| 大約不超過 R）；keep(x, y)：可選的保留條件（例如只留在畫出的錐面範圍內）。
   */
  function polylines(sec, R, keep, n) {
    n = n || 360;
    const out = [];
    let cur = null;
    function push(q) {
      const ok = !keep || keep(q.x, q.y);
      if (ok) { if (!cur) { cur = []; out.push(cur); } cur.push([q.x, q.y]); }
      else cur = null;
    }
    function run(br, t0, t1, N) {
      cur = null;
      for (let i = 0; i <= N; i++) push(pointAt(sec, { br: br, t: t0 + (t1 - t0) * i / N }));
      cur = null;
    }
    switch (sec.type) {
      case 'circle': case 'ellipse': run(1, -Math.PI, Math.PI, n); break;
      case 'hyperbola': { const tm = Math.asinh(R / sec.b); run(1, -tm, tm, n); run(-1, -tm, tm, n); break; }
      case 'parabola': run(1, -R, R, n); break;
      case 'lines': run(1, -R * 1.5, R * 1.5, 2); run(-1, -R * 1.5, R * 1.5, 2); break;
      case 'line': run(1, -R * 1.5, R * 1.5, 2); break;
      default: push({ x: 0, y: 0 }); break;
    }
    return out.filter(function (l) { return l.length > 0; });
  }

  /** 中文／英文的類型名稱 */
  const NAMES = {
    circle: ['圓', 'circle'], ellipse: ['橢圓', 'ellipse'], parabola: ['拋物線', 'parabola'], hyperbola: ['雙曲線', 'hyperbola'],
    point: ['一點（退化）', 'a single point (degenerate)'], line: ['一條直線（退化）', 'a single line (degenerate)'],
    lines: ['兩條相交直線（退化）', 'two crossing lines (degenerate)']
  };

  const api = {
    DEG: DEG, EPS_DEG: EPS_DEG, NAMES: NAMES,
    familyOf: familyOf, section: section,
    toSpace: toSpace, fromSpace: fromSpace, coneResidual: coneResidual, planeResidual: planeResidual,
    pointAt: pointAt, tangentAt: tangentAt, nearest: nearest, measure: measure, polylines: polylines,
    dot: dot, sub: sub, norm: norm, dist3: dist3
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ConicCore = api;
})(typeof window !== 'undefined' ? window : this);
