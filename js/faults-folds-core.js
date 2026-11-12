/* faults-folds-core.js — 「地質構造：斷層、褶皺與應力」的物理核心（與畫面無關，UMD：瀏覽器 window.FaultsCore、Node require）
 *
 * 座標：x 向東、y 向北、z 向上（m），地表原本在 z = 0。應力以「壓為正」（地質慣例），單位 MPa。
 * - 垂直應力 Sv = ρ g z（上覆岩層的重量）；兩個水平主應力 SH ≥ Sh 用「和 Sv 的比值」輸入，SH 的方位角 az（由北順時針）。
 * - 安德森（Anderson 1905/1951）斷層理論：地表附近一個主應力必為垂直。
 *   Sv 最大 → 正斷層；Sv 居中 → 平移斷層；Sv 最小 → 逆斷層。
 * - 庫倫破裂（無內聚力的摩擦滑動，Byerlee 定律的形式）：τ = μ (σn − Pp)。
 *   最容易滑動的面包含 σ2，和 σ1 夾 β = 45° − φ/2，φ = arctan μ；臨界條件 (σ1 − Pp)/(σ3 − Pp) = (√(1+μ²) + μ)²（Jaeger、Cook 與 Zimmerman 2007）。
 * - 滑動方向：華勒斯－博特假設（Wallace 1951、Bott 1959），斷層面上的剪應力方向；rake 用 Aki 與 Richards 的定義
 *   （由走向量起，−90° 正斷層、+90° 逆斷層、0° 左移、180° 右移）。
 * - 褶皺：正弦形 w = A cos(2πx′/λ) − y′ tan(傾沒角)，層長守恆，縮短率 = 1 − λ / 弧長；翼部最大傾角 arctan(2πA/λ)；
 *   翼間角分類照 Fleuty（1964）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FaultsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RHO = 2700, G = 9.81;          // 地殼平均密度 kg/m³、重力加速度
  const H = 250, NL = 14;              // 每一層厚 250 m，共 14 層（0 = 最上面、最年輕），再往下是基盤
  const BASE = NL, DIKE = NL + 1, AIR = -1;
  const L = 1500, DEPTH = 2000;        // 方塊半寬 1.5 km、深 2 km
  const DIKE_W = 80;                    // 東西向岩脈的寬度（y = ±40 m）
  const HYDRO = 1000 / RHO;             // 靜水壓的孔隙壓力比 Pp / Sv ≈ 0.37
  const R = Math.PI / 180;

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function scale(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function mulM(M, v) { return [dot(M[0], v), dot(M[1], v), dot(M[2], v)]; }
  function wrap360(a) { a %= 360; return a < 0 ? a + 360 : a; }

  /** 臨界應力比 q(μ) = (√(1+μ²) + μ)² */
  function qCrit(mu) { const s = Math.sqrt(1 + mu * mu) + mu; return s * s; }

  /**
   * 應力狀態。o = { z（km）, kH = SH/Sv, kh = Sh/Sv, az（SH 方位角，度）, lam = Pp/Sv, mu }
   */
  function stress(o) {
    const z = o.z * 1000, Sv = RHO * G * z / 1e6;
    let kH = o.kH, kh = o.kh;
    if (kh > kH) { const t = kH; kH = kh; kh = t; }
    const SH = kH * Sv, Sh = kh * Sv, Pp = o.lam * Sv, mu = o.mu;
    const az = o.az * R;
    const eH = [Math.sin(az), Math.cos(az), 0], eh = [Math.cos(az), -Math.sin(az), 0], ev = [0, 0, 1];
    let regime, s1, s2, s3, e1, e2, e3;
    if (Sv >= SH) { regime = 'normal'; s1 = Sv; e1 = ev; s2 = SH; e2 = eH; s3 = Sh; e3 = eh; }
    else if (Sv >= Sh) { regime = 'strike'; s1 = SH; e1 = eH; s2 = Sv; e2 = ev; s3 = Sh; e3 = eh; }
    else { regime = 'reverse'; s1 = SH; e1 = eH; s2 = Sh; e2 = eh; s3 = Sv; e3 = ev; }
    const q = qCrit(mu), d3 = s3 - Pp, tensile = d3 <= 0;
    const ratio = tensile ? Infinity : (s1 - Pp) / d3;
    // 靜水壓下是否臨界（「只要把孔隙壓力升高就會滑動」的比較）
    const d3h = s3 - HYDRO * Sv, ratioH = d3h <= 0 ? Infinity : (s1 - HYDRO * Sv) / d3h;
    return {
      Sv: Sv, SH: SH, Sh: Sh, Pp: Pp, mu: mu, regime: regime,
      s1: s1, s2: s2, s3: s3, e1: e1, e2: e2, e3: e3, eH: eH, eh: eh,
      q: q, ratio: ratio, crit: ratio >= q, tensile: tensile, critHydro: ratioH >= q,
      R: s1 > s3 ? (s2 - s3) / (s1 - s3) : 0,
      M: tensorOf(SH, Sh, Sv, eH, eh)
    };
  }
  function tensorOf(SH, Sh, Sv, eH, eh) {
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    [[SH, eH], [Sh, eh], [Sv, [0, 0, 1]]].forEach(function (q) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += q[0] * q[1][i] * q[1][j];
    });
    return M;
  }

  /** 由走向（度）與傾角（度）建立斷層面；傾向 = 走向 + 90（右手定則） */
  function plane(strike, dip) {
    const s = strike * R, d = dip * R, dd = s + Math.PI / 2;
    return {
      strike: wrap360(strike), dip: dip, dd: wrap360(strike + 90),
      n: [Math.sin(d) * Math.sin(dd), Math.sin(d) * Math.cos(dd), Math.cos(d)],   // 指向上盤
      sv: [Math.sin(s), Math.cos(s), 0],                                            // 走向方向
      dv: [Math.cos(d) * Math.sin(dd), Math.cos(d) * Math.cos(dd), -Math.sin(d)],  // 沿傾斜向下
      hd: [Math.sin(dd), Math.cos(dd), 0]                                           // 水平的傾向方向
    };
  }
  /** 由法向量建立斷層面（法向量朝上；垂直面時 z 分量為 0） */
  function planeFromNormal(n) {
    n = norm(n);
    if (n[2] < -1e-12) n = scale(n, -1);
    const dip = Math.acos(Math.min(1, Math.max(-1, n[2]))) / R;
    const dd = Math.atan2(n[0], n[1]) / R;
    return plane(wrap360(dd - 90), dip);
  }

  /** 兩個共軛的最佳破裂面（包含 σ2、和 σ1 夾 45° − φ/2） */
  function optimalPlanes(st) {
    const phi = Math.atan(st.mu), beta = Math.PI / 4 - phi / 2;
    return [1, -1].map(function (sg) {
      const n = add(scale(st.e1, Math.sin(beta)), scale(st.e3, sg * Math.cos(beta)));
      return planeFromNormal(n);
    });
  }

  /** 斷層面上的正應力、剪應力，以及上盤的滑動方向與 rake（度） */
  function resolve(st, pl) {
    const t = mulM(st.M, pl.n), sn = dot(pl.n, t);
    const tv = add(t, scale(pl.n, -sn)), tau = Math.hypot(tv[0], tv[1], tv[2]);
    const slip = tau > 1e-12 ? scale(tv, -1 / tau) : scale(pl.dv, 1);
    let rake = Math.atan2(-dot(slip, pl.dv), dot(slip, pl.sv)) / R;
    if (rake <= -180) rake += 360;
    return { sn: sn, tau: tau, snEff: sn - st.Pp, slip: slip, rake: rake };
  }

  /**
   * 整個斷層狀態。o 除了 stress 的參數，再加 plane（0／1：共軛的哪一個面）、slip（累積滑移量 m）、erode（是否侵蝕成平地）。
   * 應力沒有達到臨界時不會滑動（滑移量 0）。
   */
  function fault(o) {
    const st = stress(o), planes = optimalPlanes(st), pl = planes[o.plane ? 1 : 0], rs = resolve(st, pl);
    const d = st.crit ? Math.max(0, o.slip) : 0, u = scale(rs.slip, d);
    const along = dot(u, pl.sv), heave = dot(u, pl.hd);
    const lateral = Math.abs(along) < 1e-6 ? '' : along < 0 ? 'right' : 'left';
    const kind = st.regime === 'strike' ? (lateral === 'right' || (!lateral && Math.cos(rs.rake * R) < 0) ? 'dextral' : 'sinistral') : st.regime;
    const F = {
      st: st, planes: planes, pl: pl, rs: rs, d: d, u: u,
      throw: u[2], along: along, heave: heave, lateral: lateral, kind: kind,
      erode: !!o.erode, e: o.erode ? Math.min(0, u[2]) : null
    };
    F.expo = exposure(F);
    return F;
  }

  /** 一點屬於上盤還是下盤 */
  function hangingSide(F, p) { return dot(F.pl.n, p) > 0; }
  /**
   * 斷層模式的地層查詢：傳回 AIR、0..NL−1（地層，0 最年輕）、BASE（基盤）或 DIKE（岩脈）。
   * 上盤的點先減掉位移，回到原來的位置再查。
   */
  function faultLayerAt(F, x, y, z) {
    const hw = hangingSide(F, [x, y, z]);
    const top = F.erode ? F.e : (hw ? F.u[2] : 0);
    if (z > top + 1e-9) return AIR;
    let px = x, py = y, pz = z;
    if (hw) { px -= F.u[0]; py -= F.u[1]; pz -= F.u[2]; }
    if (Math.abs(py) <= DIKE_W / 2) return DIKE;
    if (pz > 0) return 0;
    const i = Math.floor(-pz / H);
    return i >= NL ? BASE : i;
  }
  /** 地表（或侵蝕面）上斷層兩側露出的地層：沿傾向離斷層線 300 m 各取一點，避開岩脈 */
  function exposure(F) {
    const pl = F.pl, hd = pl.hd[0] || pl.hd[1] ? pl.hd : [pl.n[0], pl.n[1], 0];
    const h = norm([hd[0], hd[1], 0]);
    function at(side, off) {
      const sgn = side === 'hw' ? 1 : -1;
      const zt = F.erode ? F.e : (side === 'hw' ? F.u[2] : 0);
      // 這個高度上斷層線的位置：n·p = 0
      const nh = pl.n[0] * h[0] + pl.n[1] * h[1];
      const s0 = Math.abs(nh) > 1e-9 ? -pl.n[2] * zt / nh : 0;
      const p = add(scale(pl.sv, off), scale(h, s0 + sgn * 300));
      return faultLayerAt(F, p[0], p[1], zt - 1);
    }
    for (const off of [600, -600, 1000, -1000, 0]) {
      const a = at('fw', off), b = at('hw', off);
      if (a !== DIKE && b !== DIKE) return { fw: a, hw: b };
    }
    return { fw: at('fw', 600), hw: at('hw', 600) };
  }

  // ---------- 褶皺 ----------
  /** o = { lam（波長 m）, A（振幅 m）, plunge（度）, az（σ1 的方位角，度；褶皺軸和它垂直）, e（侵蝕面高度 m；≥ 振幅＋傾沒時等於沒侵蝕） } */
  function fold(o) {
    const k = 2 * Math.PI * o.A / o.lam;
    const limbDip = Math.atan(k) / R, interlimb = 180 - 2 * limbDip;
    // 一個波長的弧長（辛普森法，400 段）
    const n = 400; let s = 0;
    for (let i = 0; i <= n; i++) {
      const x = i / n * 2 * Math.PI, f = Math.sqrt(1 + k * k * Math.sin(x) * Math.sin(x));
      s += f * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
    }
    const arc = s / (3 * n) * 2 * Math.PI / (2 * Math.PI) * o.lam;
    const az = o.az * R;
    return {
      lam: o.lam, A: o.A, plunge: o.plunge, az: o.az, e: o.e,
      eH: [Math.sin(az), Math.cos(az), 0], eAx: [Math.cos(az), -Math.sin(az), 0],
      axisTrend: wrap360(o.az + 90),
      limbDip: limbDip, interlimb: interlimb, cls: foldClass(interlimb),
      arc: arc, shortening: 1 - o.lam / arc, tanP: Math.tan(o.plunge * R)
    };
  }
  /** 翼間角分類（Fleuty 1964）：平緩 > 120°、開闊 70–120°、緊閉 30–70°、緊密 0–30° */
  function foldClass(a) { return a > 120 ? 'gentle' : a > 70 ? 'open' : a > 30 ? 'close' : 'tight'; }
  /** 褶皺後的位移 w(x, y)：褶皺軸方向（y′）往 +y′ 傾沒 */
  function foldW(Fo, x, y) {
    const xp = x * Fo.eH[0] + y * Fo.eH[1], yp = x * Fo.eAx[0] + y * Fo.eAx[1];
    return Fo.A * Math.cos(2 * Math.PI * xp / Fo.lam) - yp * Fo.tanP;
  }
  function foldTop(Fo, x, y) { return Math.min(Fo.e, foldW(Fo, x, y)); }
  function foldLayerAt(Fo, x, y, z) {
    const w = foldW(Fo, x, y);
    if (z > Math.min(Fo.e, w) + 1e-9) return AIR;
    const z0 = z - w;
    if (z0 > 0) return 0;
    const i = Math.floor(-z0 / H);
    return i >= NL ? BASE : i;
  }
  /** 地表（侵蝕面）上露出的地層：背斜軸（x′ = 0）與向斜軸（x′ = ±λ/2）上、y′ = 0 */
  function foldExposure(Fo) {
    const at = function (xp) { const x = xp * Fo.eH[0], y = xp * Fo.eH[1]; return foldLayerAt(Fo, x, y, foldTop(Fo, x, y) - 0.5); };
    // 地圖上露出的地層種類（方塊範圍內 61×61 取樣）
    const seen = {};
    for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) {
      const x = -L + 2 * L * i / 60, y = -L + 2 * L * j / 60;
      seen[foldLayerAt(Fo, x, y, foldTop(Fo, x, y) - 0.5)] = true;
    }
    return { crest: at(0), trough: at(Fo.lam / 2), kinds: Object.keys(seen).map(Number).sort(function (a, b) { return a - b; }) };
  }
  /** 斷層模式的地圖上露出的地層種類 */
  function faultKinds(F) {
    const seen = {};
    for (let i = 0; i <= 60; i++) for (let j = 0; j <= 60; j++) {
      const x = -L + 2 * L * i / 60, y = -L + 2 * L * j / 60;
      const hw = hangingSide(F, [x, y, F.erode ? F.e : 0]);
      const zt = F.erode ? F.e : (hw ? F.u[2] : 0);
      seen[faultLayerAt(F, x, y, zt - 0.5)] = true;
    }
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  return {
    RHO: RHO, G: G, H: H, NL: NL, BASE: BASE, DIKE: DIKE, AIR: AIR, L: L, DEPTH: DEPTH, DIKE_W: DIKE_W, HYDRO: HYDRO,
    qCrit: qCrit, stress: stress, plane: plane, planeFromNormal: planeFromNormal, optimalPlanes: optimalPlanes, resolve: resolve,
    fault: fault, faultLayerAt: faultLayerAt, hangingSide: hangingSide, exposure: exposure, faultKinds: faultKinds,
    fold: fold, foldClass: foldClass, foldW: foldW, foldTop: foldTop, foldLayerAt: foldLayerAt, foldExposure: foldExposure,
    dot: dot, norm: norm
  };
});
