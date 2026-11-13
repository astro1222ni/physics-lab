/* map-projection-core.js — 「地圖投影與變形」的數學核心（與畫面無關，Node 可直接 require）
 *
 * 地球當成半徑 R 的球（R = 6371.007 km，等面積球半徑；地圖用 R = 1 的單位球計算）。
 * 每個投影都有正算 forward(λ, φ) → [x, y] 與反算 inverse(x, y) → [λ, φ]，角度用弧度。
 *   圓柱：等距圓柱（經緯直線）、麥卡托（等角）、等積圓柱（標準緯線 φs：0° 蘭伯特、30° 貝爾曼、45° 高爾－彼得斯）
 *   偽圓柱：正弦（等積）、莫爾維特（等積）、羅賓森（折衷，Robinson 1974 的表）、等地球（等積，Šavrič 等 2018）
 *   圓錐：蘭伯特等角圓錐、亞伯斯等積圓錐（兩條標準緯線 φ1、φ2）
 *   方位（可放在任何中心 φ0、λ0）：正射（從無限遠看）、平射（光源在對蹠點，等角）、心射（光源在球心，大圓是直線）、
 *        等距方位（到中心的距離與方位都正確）、蘭伯特等積方位
 * 變形（底索指標，Tissot's indicatrix）：用正算的偏微分算出
 *   h（沿經線的比例）、k（沿緯線的比例）、面積比例 s = |det|、最大與最小比例 a ≥ b、最大角度變形 ω = 2 asin((a − b)/(a + b))。
 * 另外：球面多邊形面積（大圓邊，精確）、把陸塊搬到別的位置（保持「北方朝上」的旋轉）、大圓航線與等角航線（恆向線）。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MapProjectionCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PI = Math.PI, HALF = PI / 2, DEG = PI / 180, EPS = 1e-12;
  const R_EARTH = 6371.007;            // km，等面積球半徑（IUGG 平均半徑 R2）
  const MERC_MAX = 85.05112878 * DEG;  // 麥卡托只畫到這個緯度（地圖剛好是正方形）
  const GNOM_MAX = 70 * DEG;           // 心射投影只畫到離中心 70°（再遠就趨近無限大）

  function wrapPi(a) { a = (a + PI) % (2 * PI); if (a < 0) a += 2 * PI; return a - PI; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function asinc(v) { return Math.asin(clamp(v, -1, 1)); }

  // ---------- 羅賓森投影的表（Robinson 1974；Snyder 1990 公布的計算法） ----------
  const ROB_X = [1.0000, 0.9986, 0.9954, 0.9900, 0.9822, 0.9730, 0.9600, 0.9427, 0.9216, 0.8962, 0.8679, 0.8350, 0.7986, 0.7597, 0.7186, 0.6732, 0.6213, 0.5722, 0.5322];
  const ROB_Y = [0.0000, 0.0620, 0.1240, 0.1860, 0.2480, 0.3100, 0.3720, 0.4340, 0.4958, 0.5571, 0.6176, 0.6769, 0.7346, 0.7903, 0.8435, 0.8936, 0.9394, 0.9761, 1.0000];
  /** 自然三次樣條（在 0°, 5°, …, 90° 的節點上通過表值） */
  function spline(ys) {
    const n = ys.length, h = 5, a = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n), m = new Float64Array(n);
    const al = new Float64Array(n);
    for (let i = 1; i < n - 1; i++) al[i] = 3 / h * (ys[i + 1] - ys[i]) - 3 / h * (ys[i] - ys[i - 1]);
    const l = new Float64Array(n), mu = new Float64Array(n), z = new Float64Array(n);
    l[0] = 1;
    for (let i = 1; i < n - 1; i++) { l[i] = 4 * h - h * mu[i - 1]; mu[i] = h / l[i]; z[i] = (al[i] - h * z[i - 1]) / l[i]; }
    l[n - 1] = 1;
    for (let j = n - 2; j >= 0; j--) { c[j] = z[j] - mu[j] * c[j + 1]; m[j] = (ys[j + 1] - ys[j]) / h - h * (c[j + 1] + 2 * c[j]) / 3; d[j] = (c[j + 1] - c[j]) / (3 * h); a[j] = ys[j]; }
    return function (deg) {
      const t = clamp(deg, 0, 90), i = Math.min(n - 2, Math.floor(t / h)), u = t - i * h;
      return a[i] + m[i] * u + c[i] * u * u + d[i] * u * u * u;
    };
  }
  const robX = spline(ROB_X), robY = spline(ROB_Y);
  const ROB_FX = 0.8487, ROB_FY = 1.3523;
  let robTab = null;
  function robInvTable() {
    if (!robTab) { robTab = new Float64Array(1801); for (let i = 0; i <= 1800; i++) robTab[i] = robY(i * 0.05); }
    return robTab;
  }

  // ---------- 等地球投影（Equal Earth）的係數 ----------
  const EE = [1.340264, -0.081106, 0.000893, 0.003796], EE_M = Math.sqrt(3) / 2;
  function eeY(t) { const t2 = t * t, t6 = t2 * t2 * t2; return t * (EE[0] + EE[1] * t2 + t6 * (EE[2] + EE[3] * t2)); }
  function eeDY(t) { const t2 = t * t, t6 = t2 * t2 * t2; return EE[0] + 3 * EE[1] * t2 + t6 * (7 * EE[2] + 9 * EE[3] * t2); }

  /** 投影清單：id、家族、性質（conformal 等角、equalArea 等積、equidistant 等距、compromise 折衷）、要用的參數 */
  const LIST = [
    { id: 'equirect', family: 'cyl', prop: 'equidistant', params: [] },
    { id: 'mercator', family: 'cyl', prop: 'conformal', params: [] },
    { id: 'cea', family: 'cyl', prop: 'equalArea', params: ['phiS'] },
    { id: 'sinusoidal', family: 'pseudo', prop: 'equalArea', params: [] },
    { id: 'mollweide', family: 'pseudo', prop: 'equalArea', params: [] },
    { id: 'robinson', family: 'pseudo', prop: 'compromise', params: [] },
    { id: 'equalearth', family: 'pseudo', prop: 'equalArea', params: [] },
    { id: 'lcc', family: 'conic', prop: 'conformal', params: ['phi1', 'phi2'] },
    { id: 'albers', family: 'conic', prop: 'equalArea', params: ['phi1', 'phi2'] },
    { id: 'ortho', family: 'azi', prop: 'perspective', params: ['phi0'] },
    { id: 'stereo', family: 'azi', prop: 'conformal', params: ['phi0'] },
    { id: 'gnomonic', family: 'azi', prop: 'greatCircle', params: ['phi0'] },
    { id: 'aeqd', family: 'azi', prop: 'equidistant', params: ['phi0'] },
    { id: 'laea', family: 'azi', prop: 'equalArea', params: ['phi0'] }
  ];
  const BY_ID = {};
  LIST.forEach(function (p) { BY_ID[p.id] = p; });

  /**
   * 建立一個投影。opt：{ id, lam0（中央經線，度）, phiS（等積圓柱的標準緯線）, phi1, phi2（圓錐的標準緯線）, phi0（方位投影的中心緯度） }
   * 傳回 { id, family, prop, forward(λ,φ), inverse(x,y), rel(λ)（相對中央經線的經度）, raw(λrel, φ)（不回繞的正算，用於微分與跨換日線的多邊形）,
   *        valid(λ,φ)（這一點畫不畫得出來）, latRange [φmin, φmax], cmax（方位投影最遠畫到離中心幾弧度）, n（圓錐常數）}
   */
  function make(opt) {
    opt = opt || {};
    const id = BY_ID[opt.id] ? opt.id : 'equirect';
    const info = BY_ID[id];
    const lam0 = (opt.lam0 || 0) * DEG;
    const P = { id: id, family: info.family, prop: info.prop, lam0: lam0, latRange: [-HALF, HALF], cmax: PI };
    P.rel = function (lam) { return wrapPi(lam - lam0); };
    let raw, inv;

    if (id === 'equirect') {
      raw = function (l, f) { return [l, f]; };
      inv = function (x, y) { return [x, y]; };
    } else if (id === 'mercator') {
      P.latRange = [-MERC_MAX, MERC_MAX];
      raw = function (l, f) { return [l, Math.log(Math.tan(PI / 4 + clamp(f, -MERC_MAX * 1.02, MERC_MAX * 1.02) / 2))]; };
      inv = function (x, y) { return [x, 2 * Math.atan(Math.exp(y)) - HALF]; };
    } else if (id === 'cea') {
      const cs = Math.cos(clamp(opt.phiS || 0, -85, 85) * DEG);
      P.phiS = clamp(opt.phiS || 0, -85, 85);
      raw = function (l, f) { return [l * cs, Math.sin(f) / cs]; };
      inv = function (x, y) { const s = y * cs; return Math.abs(s) > 1 + 1e-9 ? null : [x / cs, asinc(s)]; };
    } else if (id === 'sinusoidal') {
      raw = function (l, f) { return [l * Math.cos(f), f]; };
      inv = function (x, y) { if (Math.abs(y) > HALF + 1e-9) return null; const c = Math.cos(y); return [Math.abs(c) < EPS ? 0 : x / c, clamp(y, -HALF, HALF)]; };
    } else if (id === 'mollweide') {
      const theta = function (f) {
        if (Math.abs(Math.abs(f) - HALF) < 1e-10) return Math.sign(f) * HALF;
        let t = f, k = PI * Math.sin(f);
        for (let i = 0; i < 60; i++) { const d = (2 * t + Math.sin(2 * t) - k) / (2 + 2 * Math.cos(2 * t)); t -= d; if (Math.abs(d) < 1e-13) break; }
        return t;
      };
      raw = function (l, f) { const t = theta(f); return [2 * Math.SQRT2 / PI * l * Math.cos(t), Math.SQRT2 * Math.sin(t)]; };
      inv = function (x, y) {
        const s = y / Math.SQRT2; if (Math.abs(s) > 1 + 1e-9) return null;
        const t = asinc(s), c = Math.cos(t);
        const l = Math.abs(c) < EPS ? 0 : PI * x / (2 * Math.SQRT2 * c);
        return [l, asinc((2 * t + Math.sin(2 * t)) / PI)];
      };
    } else if (id === 'robinson') {
      raw = function (l, f) { const d = Math.abs(f) / DEG; return [ROB_FX * robX(d) * l, ROB_FY * robY(d) * Math.sign(f)]; };
      inv = function (x, y) {
        const ty = Math.abs(y) / ROB_FY; if (ty > 1 + 1e-9) return null;
        // 先查表（每 0.05° 一格）找到所在的格子，再用牛頓法收斂（逐像素畫圖時夠快）
        const tab = robInvTable();
        let lo = 0, hi = tab.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tab[mid] < ty) lo = mid; else hi = mid; }
        let d = lo * 0.05 + 0.05 * (ty - tab[lo]) / ((tab[hi] - tab[lo]) || 1);
        for (let i = 0; i < 4; i++) {
          const g = robY(d) - ty, dg = (robY(Math.min(90, d + 1e-4)) - robY(Math.max(0, d - 1e-4))) / ((Math.min(90, d + 1e-4) - Math.max(0, d - 1e-4)) || 1);
          if (!(dg > 0)) break;
          const nd = clamp(d - g / dg, 0, 90);
          if (Math.abs(nd - d) < 1e-12) { d = nd; break; }
          d = nd;
        }
        return [x / (ROB_FX * robX(d)), Math.sign(y) * d * DEG];
      };
    } else if (id === 'equalearth') {
      raw = function (l, f) { const t = Math.asin(EE_M * Math.sin(f)); return [2 * Math.sqrt(3) * l * Math.cos(t) / (3 * eeDY(t)), eeY(t)]; };
      inv = function (x, y) {
        const ymax = eeY(Math.asin(EE_M)); if (Math.abs(y) > ymax + 1e-9) return null;
        let t = y / EE[0];
        for (let i = 0; i < 40; i++) { const d = (eeY(t) - y) / eeDY(t); t -= d; if (Math.abs(d) < 1e-13) break; }
        const l = 3 * x * eeDY(t) / (2 * Math.sqrt(3) * Math.cos(t));
        return [l, asinc(Math.sin(t) / EE_M)];
      };
    } else if (id === 'lcc' || id === 'albers') {
      const f1 = clamp(opt.phi1 == null ? 20 : opt.phi1, -89, 89) * DEG, f2 = clamp(opt.phi2 == null ? 50 : opt.phi2, -89, 89) * DEG;
      P.phi1 = f1 / DEG; P.phi2 = f2 / DEG;
      if (id === 'lcc') {
        const t = function (f) { return Math.tan(PI / 4 + f / 2); };
        let n = Math.abs(f1 - f2) < 1e-10 ? Math.sin(f1) : Math.log(Math.cos(f1) / Math.cos(f2)) / Math.log(t(f2) / t(f1));
        P.n = n;
        if (Math.abs(n) < 1e-6) {             // 兩條標準緯線對稱於赤道：圓錐變成圓柱（麥卡托，標準緯線上比例 1）
          const c1 = Math.cos(f1);
          P.latRange = [-MERC_MAX, MERC_MAX];
          raw = function (l, f) { return [l * c1, c1 * Math.log(t(clamp(f, -MERC_MAX * 1.02, MERC_MAX * 1.02)))]; };
          inv = function (x, y) { return [x / c1, 2 * Math.atan(Math.exp(y / c1)) - HALF]; };
        } else {
          const F = Math.cos(f1) * Math.pow(t(f1), n) / n;
          const lim = 60 * DEG;                // 圓錐尖端的對面（遠極）趨近無限遠，只畫到 60°
          P.latRange = n > 0 ? [-lim, HALF] : [-HALF, lim];
          const rho = function (f) { return F / Math.pow(t(clamp(f, -HALF + 1e-9, HALF - 1e-9)), n); };
          raw = function (l, f) { const r = rho(f), th = n * l; return [r * Math.sin(th), -r * Math.cos(th)]; };
          inv = function (x, y) {
            let r = Math.sign(n) * Math.hypot(x, y);
            const th = Math.atan2(Math.sign(n) * x, -Math.sign(n) * y);
            if (Math.abs(r) < EPS) return [0, Math.sign(n) * HALF];
            return [th / n, 2 * Math.atan(Math.pow(F / r, 1 / n)) - HALF];
          };
        }
      } else {
        const n = (Math.sin(f1) + Math.sin(f2)) / 2;
        P.n = n;
        if (Math.abs(n) < 1e-6) {             // 對稱於赤道：變成等積圓柱
          const c1 = Math.cos(f1);
          raw = function (l, f) { return [l * c1, Math.sin(f) / c1]; };
          inv = function (x, y) { const s = y * c1; return Math.abs(s) > 1 + 1e-9 ? null : [x / c1, asinc(s)]; };
        } else {
          const Cc = Math.cos(f1) * Math.cos(f1) + 2 * n * Math.sin(f1);
          const rho = function (f) { return Math.sqrt(Math.max(0, Cc - 2 * n * Math.sin(f))) / n; };
          raw = function (l, f) { const r = rho(f), th = n * l; return [r * Math.sin(th), -r * Math.cos(th)]; };
          inv = function (x, y) {
            const r = Math.sign(n) * Math.hypot(x, y);
            const th = Math.atan2(Math.sign(n) * x, -Math.sign(n) * y);
            const s = (Cc - r * r * n * n) / (2 * n);
            if (Math.abs(s) > 1 + 1e-9) return null;
            return [th / n, asinc(s)];
          };
        }
      }
    } else {
      // ---------- 方位投影（中心 φ0、λ0） ----------
      const f0 = clamp(opt.phi0 == null ? 90 : opt.phi0, -90, 90) * DEG, sf0 = Math.sin(f0), cf0 = Math.cos(f0);
      P.phi0 = f0 / DEG;
      // ρ(c) 與反函數 c(ρ)
      const rhoOf = { ortho: function (c) { return Math.sin(c); }, stereo: function (c) { return 2 * Math.tan(c / 2); },
        gnomonic: function (c) { return Math.tan(c); }, aeqd: function (c) { return c; }, laea: function (c) { return 2 * Math.sin(c / 2); } }[id];
      const cOf = { ortho: function (r) { return r > 1 + 1e-9 ? null : asinc(r); }, stereo: function (r) { return 2 * Math.atan(r / 2); },
        gnomonic: function (r) { return Math.atan(r); }, aeqd: function (r) { return r > PI + 1e-9 ? null : r; }, laea: function (r) { return r > 2 + 1e-9 ? null : 2 * asinc(r / 2); } }[id];
      P.cmax = id === 'ortho' ? HALF : id === 'gnomonic' ? GNOM_MAX : id === 'stereo' ? 120 * DEG : PI;
      P.rhoOf = rhoOf;
      P.dist = function (lam, phi) {
        const dl = lam - lam0;
        return Math.acos(clamp(sf0 * Math.sin(phi) + cf0 * Math.cos(phi) * Math.cos(dl), -1, 1));
      };
      raw = function (dl, f) {
        const cc = clamp(sf0 * Math.sin(f) + cf0 * Math.cos(f) * Math.cos(dl), -1, 1), c = Math.acos(cc);
        const ex = Math.cos(f) * Math.sin(dl), ey = cf0 * Math.sin(f) - sf0 * Math.cos(f) * Math.cos(dl);
        const sc = Math.sin(c);
        if (sc < 1e-12) {
          if (c < 1) return [0, 0];
          return [rhoOf(c) * 0, -rhoOf(c)];   // 對蹠點：等距、等積方位投影是外圈的一個圓，這裡只回傳圓上的一點
        }
        const k = rhoOf(c) / sc;
        return [k * ex, k * ey];
      };
      inv = function (x, y) {
        const r = Math.hypot(x, y);
        if (r < EPS) return [0, f0];
        const c = cOf(r);
        if (c == null || c > P.cmax + 1e-9) return null;
        const sc = Math.sin(c), cc = Math.cos(c);
        const f = asinc(cc * sf0 + y * sc * cf0 / r);
        const l = Math.atan2(x * sc, r * cf0 * cc - y * sf0 * sc);
        return [l, f];
      };
    }
    P.raw = raw;
    P.forward = function (lam, phi) { return raw(P.rel(lam), phi); };
    P.inverse = function (x, y) {
      const q = inv(x, y);
      if (!q || !isFinite(q[0]) || !isFinite(q[1])) return null;
      if (Math.abs(q[0]) > PI + 1e-9) return null;           // 超出地圖的左右邊界
      if (q[1] < P.latRange[0] - 1e-9 || q[1] > P.latRange[1] + 1e-9) return null;
      return [wrapPi(q[0] + lam0), q[1]];
    };
    P.valid = function (lam, phi) {
      if (phi < P.latRange[0] - 1e-12 || phi > P.latRange[1] + 1e-12) return false;
      if (P.family === 'azi') return P.dist(lam, phi) <= P.cmax + 1e-12;
      return true;
    };
    return P;
  }

  /**
   * 底索指標：在 (λ, φ) 的變形。傳回 { h, k, s, a, b, omega（弧度）, theta（經線與緯線在地圖上的夾角） }。
   * 用中央差分（步長 1e-6 弧度），λ 用相對中央經線、不回繞的值，跨換日線也正確。
   */
  function tissot(P, lam, phi) {
    const d = 1e-6;
    const f = clamp(phi, -HALF + 2e-6, HALF - 2e-6);
    let l = P.family === 'azi' ? lam - P.lam0 : P.rel(lam);
    if (P.family !== 'azi' && Math.abs(l) > PI - 2e-6) l = Math.sign(l) * (PI - 2e-6);
    const a1 = P.raw(l, f + d), a0 = P.raw(l, f - d), b1 = P.raw(l + d, f), b0 = P.raw(l - d, f);
    const xf = (a1[0] - a0[0]) / (2 * d), yf = (a1[1] - a0[1]) / (2 * d);
    const cf = Math.cos(f);
    const xl = (b1[0] - b0[0]) / (2 * d) / cf, yl = (b1[1] - b0[1]) / (2 * d) / cf;
    const h = Math.hypot(xf, yf), k = Math.hypot(xl, yl);
    const s = Math.abs(xf * yl - yf * xl);
    const sum = h * h + k * k;
    const ap = Math.sqrt(Math.max(0, sum + 2 * s)), am = Math.sqrt(Math.max(0, sum - 2 * s));
    const a = (ap + am) / 2, b = (ap - am) / 2;
    const omega = 2 * asinc((a - b) / (a + b));
    const theta = Math.acos(clamp((xf * xl + yf * yl) / (h * k || 1), -1, 1));
    return { h: h, k: k, s: s, a: a, b: b, omega: omega, theta: theta };
  }

  // ---------- 球面幾何 ----------
  function toVec(lam, phi) { const c = Math.cos(phi); return [c * Math.cos(lam), c * Math.sin(lam), Math.sin(phi)]; }
  function toLL(v) { const r = Math.hypot(v[0], v[1], v[2]); return [Math.atan2(v[1], v[0]), asinc(v[2] / r)]; }
  function centralAngle(l1, f1, l2, f2) {
    const s = Math.sin((f2 - f1) / 2), t = Math.sin((l2 - l1) / 2);
    return 2 * asinc(Math.sqrt(s * s + Math.cos(f1) * Math.cos(f2) * t * t));
  }
  /**
   * 球面多邊形面積（單位球的球面角盈；乘 R² 就是面積）。邊是大圓弧，環不必閉合。
   * 每條邊和北極組成的三角形，角盈 tan(E/2) = tan(a/2)tan(b/2)sinC / (1 + tan(a/2)tan(b/2)cosC)，a、b 是餘緯度、C 是經度差；加總取絕對值。
   * 適用於不包含極點的多邊形（可拖曳比較的陸塊都是）。
   */
  function sphericalArea(ring) {
    let sum = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      const ta = Math.tan((HALF - p[1]) / 2), tb = Math.tan((HALF - q[1]) / 2);
      const C = wrapPi(q[0] - p[0]);
      sum += 2 * Math.atan2(ta * tb * Math.sin(C), 1 + ta * tb * Math.cos(C));
    }
    return Math.abs(sum);
  }
  /** 球面多邊形的中心（頂點單位向量依邊長加權平均後正規化）；傳回 [λ, φ] */
  function centroid(ring) {
    let x = 0, y = 0, z = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const p = ring[i], q = ring[(i + 1) % n];
      const w = centralAngle(p[0], p[1], q[0], q[1]);
      const v = toVec((p[0] + p[0] + wrapPi(q[0] - p[0])) / 2 + 0, (p[1] + q[1]) / 2);
      x += v[0] * w; y += v[1] * w; z += v[2] * w;
    }
    return toLL([x, y, z]);
  }
  function rotZ(v, a) { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]]; }
  /** 繞「東方」軸旋轉：把經度 lam 上的點沿經線往北移 d 弧度 */
  function rotMeridian(v, lam, d) {
    const e = [-Math.sin(lam), Math.cos(lam), 0];          // 東方向（旋轉軸）
    const c = Math.cos(d), s = Math.sin(d);
    const dot = e[0] * v[0] + e[1] * v[1] + e[2] * v[2];
    const cr = [e[1] * v[2] - e[2] * v[1], e[2] * v[0] - e[0] * v[2], e[0] * v[1] - e[1] * v[0]];
    // 羅德里格公式；繞 e 轉 −d 才是往北（右手定則）
    return [v[0] * c - cr[0] * s + e[0] * dot * (1 - c), v[1] * c - cr[1] * s + e[1] * dot * (1 - c), v[2] * c - cr[2] * s + e[2] * dot * (1 - c)];
  }
  /**
   * 把陸塊從原來的中心 (λc, φc) 搬到 (λt, φt)：先繞地軸轉 Δλ，再沿新的經線轉 Δφ，
   * 所以搬過去以後中心處的「北方」仍然朝北（和 The True Size 等教學網站相同的搬法），形狀與真實面積都不變。
   */
  function moveRing(ring, from, to) {
    const dl = to[0] - from[0], df = to[1] - from[1];
    return ring.map(function (p) {
      let v = rotZ(toVec(p[0], p[1]), dl);
      v = rotMeridian(v, to[0], df);
      return toLL(v);
    });
  }
  /** 大圓航線：從 A 到 B 的 n + 1 個點（球面線性內插） */
  function geodesic(A, B, n) {
    const a = toVec(A[0], A[1]), b = toVec(B[0], B[1]);
    const w = centralAngle(A[0], A[1], B[0], B[1]);
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (w < 1e-12) { out.push([A[0], A[1]]); continue; }
      const sa = Math.sin((1 - t) * w) / Math.sin(w), sb = Math.sin(t * w) / Math.sin(w);
      out.push(toLL([a[0] * sa + b[0] * sb, a[1] * sa + b[1] * sb, a[2] * sa + b[2] * sb]));
    }
    return out;
  }
  /** 大圓的出發方位角（從北方順時針，弧度 0–2π） */
  function bearing(A, B) {
    const dl = B[0] - A[0];
    const y = Math.sin(dl) * Math.cos(B[1]);
    const x = Math.cos(A[1]) * Math.sin(B[1]) - Math.sin(A[1]) * Math.cos(B[1]) * Math.cos(dl);
    let b = Math.atan2(y, x); if (b < 0) b += 2 * PI; return b;
  }
  function psi(f) { return Math.log(Math.tan(PI / 4 + clamp(f, -HALF + 1e-9, HALF - 1e-9) / 2)); }
  /** 等角航線（恆向線）：固定方位角；傳回 { points, bearing, dist（單位球的長度）} ，經度差取較短的一邊 */
  function rhumb(A, B, n) {
    const dl = wrapPi(B[0] - A[0]), df = B[1] - A[1], dpsi = psi(B[1]) - psi(A[1]);
    const q = Math.abs(dpsi) > 1e-12 ? df / dpsi : Math.cos(A[1]);
    const dist = Math.sqrt(df * df + q * q * dl * dl);
    let brg = Math.atan2(dl, dpsi); if (brg < 0) brg += 2 * PI;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, pf = psi(A[1]) + t * dpsi;
      pts.push([wrapPi(A[0] + t * dl), 2 * Math.atan(Math.exp(pf)) - HALF]);
    }
    if (Math.abs(dpsi) < 1e-12) for (let i = 0; i <= n; i++) pts[i][1] = A[1];
    return { points: pts, bearing: brg, dist: dist };
  }

  // ---------- 投影後的幾何 ----------
  /** 把一個環投影成平面多邊形（經度依中央經線攤開成連續值，不在換日線斷開）；有點畫不出來時傳回 null */
  function projectRing(P, ring) {
    const out = [];
    let prev = null;
    for (let i = 0; i < ring.length; i++) {
      let l = P.family === 'azi' ? ring[i][0] - P.lam0 : P.rel(ring[i][0]);
      if (prev != null && P.family !== 'azi') { while (l - prev > PI) l -= 2 * PI; while (prev - l > PI) l += 2 * PI; }
      prev = l;
      const f = ring[i][1];
      if (f < P.latRange[0] - 1e-9 || f > P.latRange[1] + 1e-9) return null;
      if (P.family === 'azi' && P.dist(ring[i][0], f) > P.cmax + 1e-9) return null;
      out.push(P.raw(l, f));
    }
    return out;
  }
  function planarArea(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; }
    return Math.abs(s) / 2;
  }
  /** 一條線（點的序列）在地圖上偏離「兩端點連線」的最大距離，除以兩端點距離（0 = 筆直） */
  function straightness(pts) {
    if (!pts || pts.length < 3) return 0;
    const a = pts[0], b = pts[pts.length - 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-12) return Infinity;
    let m = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const d = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L;
      if (d > m) m = d;
    }
    return m / L;
  }
  /** 一串經緯度點投影成平面點；中間有畫不出來的點或跨過地圖邊界時，在那裡斷開成好幾段 */
  function projectLine(P, pts) {
    const segs = [];
    let cur = [], prevL = null;
    for (let i = 0; i < pts.length; i++) {
      const lam = pts[i][0], phi = pts[i][1];
      if (!P.valid(lam, phi)) { if (cur.length > 1) segs.push(cur); cur = []; prevL = null; continue; }
      const l = P.family === 'azi' ? lam - P.lam0 : P.rel(lam);
      if (prevL != null && P.family !== 'azi' && Math.abs(l - prevL) > PI) { if (cur.length > 1) segs.push(cur); cur = []; }
      prevL = l;
      cur.push(P.raw(l, phi));
    }
    if (cur.length > 1) segs.push(cur);
    return segs;
  }
  /** 地圖外框（平面座標的多邊形）：圓柱、偽圓柱、圓錐是 λ = ±180° 與緯度上下限圍成的區域，方位投影是 c = cmax 的圓 */
  function outline(P, n) {
    n = n || 180;
    const pts = [];
    if (P.family === 'azi') {
      const r = P.rhoOf(P.cmax);
      for (let i = 0; i <= n; i++) { const a = 2 * PI * i / n; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
      return pts;
    }
    const f0 = P.latRange[0], f1 = P.latRange[1];
    for (let i = 0; i <= n; i++) pts.push(P.raw(-PI, f0 + (f1 - f0) * i / n));
    for (let i = 0; i <= n; i++) pts.push(P.raw(-PI + 2 * PI * i / n, f1));
    for (let i = 0; i <= n; i++) pts.push(P.raw(PI, f1 - (f1 - f0) * i / n));
    for (let i = 0; i <= n; i++) pts.push(P.raw(PI - 2 * PI * i / n, f0));
    return pts;
  }
  function bounds(pts) {
    let a = [Infinity, Infinity, -Infinity, -Infinity];
    pts.forEach(function (p) { if (p[0] < a[0]) a[0] = p[0]; if (p[1] < a[1]) a[1] = p[1]; if (p[0] > a[2]) a[2] = p[0]; if (p[1] > a[3]) a[3] = p[1]; });
    return a;
  }
  /** 一塊陸地在地圖上「看起來」的面積（km²）：投影後的平面面積 × R²（地圖以 R = 1 的地球比例尺計算） */
  function mapArea(P, ring) {
    const q = projectRing(P, ring);
    return q ? planarArea(q) * R_EARTH * R_EARTH : null;
  }
  function trueArea(ring) { return sphericalArea(ring) * R_EARTH * R_EARTH; }

  // ---------- 頁面與任務共用的量測 ----------
  const TAIWAN = { lat0: 21.9, lat1: 25.3, lon0: 120.0, lon1: 122.0 };
  /** 臺灣本島範圍（北緯 21.9°–25.3°、東經 120°–122°，每 0.2° × 0.5° 一點）內最大的比例誤差 max(|a−1|, |1−b|) 與面積誤差 max |s−1|；有一部分畫不出來時傳回 null */
  function taiwanError(P) {
    let sc = 0, ar = 0;
    for (let i = 0; i <= 17; i++) for (let j = 0; j <= 4; j++) {
      const lam = (TAIWAN.lon0 + 0.5 * j) * DEG, phi = (TAIWAN.lat0 + (TAIWAN.lat1 - TAIWAN.lat0) * i / 17) * DEG;
      if (!P.valid(lam, phi)) return null;
      const t = tissot(P, lam, phi);
      sc = Math.max(sc, Math.abs(t.a - 1), Math.abs(1 - t.b));
      ar = Math.max(ar, Math.abs(t.s - 1));
    }
    return { scale: sc, area: ar };
  }
  /** 量測點的變形；方位投影另外有離中心的距離（km）與從中心看的方位角（度）。畫不出來時 visible = false */
  function probeStats(P, lam, phi) {
    if (!P.valid(lam, phi)) return { lam: lam, phi: phi, visible: false };
    const t = tissot(P, lam, phi);
    const o = { lam: lam, phi: phi, visible: true, h: t.h, k: t.k, s: t.s, a: t.a, b: t.b, omega: t.omega / DEG };
    if (P.family === 'azi') {
      const c = [P.lam0, P.phi0 * DEG];
      o.dist = P.dist(lam, phi) * R_EARTH;
      o.az = bearing(c, [lam, phi]) / DEG;
    }
    return o;
  }
  /** 大圓 A → B 經過的最高緯度（弧度，取絕對值）：大圓最靠近極點的「頂點」若落在 A、B 之間就是頂點的緯度，否則是兩端點較高的那個 */
  function gcMaxLat(A, B, pts) {
    const a = toVec(A[0], A[1]), b = toVec(B[0], B[1]);
    let best = Math.max(Math.abs(A[1]), Math.abs(B[1]));
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const nl = Math.hypot(n[0], n[1], n[2]);
    if (nl < 1e-12) { (pts || []).forEach(function (p) { if (Math.abs(p[1]) > best) best = Math.abs(p[1]); }); return best; }
    const nz = n[2] / nl;
    const v = [-nz * n[0] / nl, -nz * n[1] / nl, 1 - nz * nz], vl = Math.hypot(v[0], v[1], v[2]);
    if (vl < 1e-12) return best;                       // 大圓就是赤道
    const ang = function (p, q) { return Math.acos(clamp(p[0] * q[0] + p[1] * q[1] + p[2] * q[2], -1, 1)); };
    const ab = ang(a, b), vLat = Math.asin(clamp(Math.sqrt(1 - nz * nz), -1, 1));
    [1, -1].forEach(function (sg) {
      const w = [sg * v[0] / vl, sg * v[1] / vl, sg * v[2] / vl];
      if (Math.abs(ang(a, w) + ang(w, b) - ab) < 1e-9 && vLat > best) best = vLat;
    });
    return best;
  }
  /** 航線 A → B（弧度）：大圓與等角航線的長度（km）、出發方位（度）、在這張地圖上偏離直線的程度（畫不完整時 null）、大圓經過的最高緯度（度） */
  function routeStats(P, A, B, n) {
    n = n || 128;
    const gcPts = geodesic(A, B, n), rh = rhumb(A, B, n);
    const segG = projectLine(P, gcPts), segR = projectLine(P, rh.points);
    const whole = function (seg, pts) { return seg.length === 1 && seg[0].length === pts.length ? straightness(seg[0]) : null; };
    const maxLat = gcMaxLat(A, B, gcPts);
    return { A: A, B: B, gc: centralAngle(A[0], A[1], B[0], B[1]) * R_EARTH, rh: rh.dist * R_EARTH,
      gcB: bearing(A, B) / DEG, rhB: rh.bearing / DEG, segG: segG, segR: segR,
      strG: whole(segG, gcPts), strR: whole(segR, rh.points), gcMaxLat: maxLat / DEG };
  }

  /**
   * 任務事件 'map' 的內容（頁面與 tools/mission-proofs/map-projection.js 共用同一份計算）。
   * st：{ proj, lam0, phiS, phi1, phi2, phi0（度）, img, grid, tissot, heat, unroll, view, shape, shapeAt（[λ, φ] 弧度或 null）,
   *       probes [{ lam, phi }], route, A, B（[λ, φ] 弧度）, cityA, cityB }
   * SH：陸塊表 { id: { ring, home, area（km²） } }，必須有 africa。
   */
  function snapshot(P, st, SH) {
    const r6 = function (v) { return v == null || !isFinite(v) ? null : Math.round(v * 1e6) / 1e6; };
    let shape = null;
    if (st.shape && SH[st.shape]) {
      const S = SH[st.shape], ring = st.shapeAt ? moveRing(S.ring, S.home, st.shapeAt) : S.ring, c = st.shapeAt || S.home;
      const ma = mapArea(P, ring), af = mapArea(P, SH.africa.ring);
      shape = { id: st.shape, moved: !!st.shapeAt, lat: c[1] / DEG, lon: wrapPi(c[0]) / DEG, trueArea: S.area, mapArea: ma,
        ratio: ma != null ? r6(ma / S.area) : null, vsAfrica: ma != null && af != null ? r6(ma / af) : null, trueVsAfrica: S.area / SH.africa.area };
    }
    const last = st.probes && st.probes.length ? st.probes[st.probes.length - 1] : null;
    let probe = null;
    if (last) {
      const pr = probeStats(P, last.lam, last.phi);
      probe = { lat: pr.phi / DEG, lon: wrapPi(pr.lam) / DEG, visible: pr.visible, h: r6(pr.h), k: r6(pr.k), s: r6(pr.s), omega: r6(pr.omega),
        dist: pr.dist != null ? pr.dist : null, az: pr.az != null ? pr.az : null };
    }
    let route = null;
    if (st.route) {
      const R = routeStats(P, st.A, st.B, 128);
      route = { aLat: st.A[1] / DEG, aLon: wrapPi(st.A[0]) / DEG, bLat: st.B[1] / DEG, bLon: wrapPi(st.B[0]) / DEG, cityA: st.cityA, cityB: st.cityB,
        gc: R.gc, rh: R.rh, gcB: R.gcB, rhB: R.rhB, strG: R.strG, strR: R.strR, gcMaxLat: R.gcMaxLat };
    }
    const tw = taiwanError(P);
    return {
      proj: P.id, family: P.family, prop: P.prop,
      lam0: st.lam0, phiS: st.phiS, phi1: st.phi1, phi2: st.phi2, phi0: st.phi0, n: P.n != null ? P.n : null,
      img: !!st.img, grid: !!st.grid, tissot: !!st.tissot, heat: st.heat, view: st.view || '2d', unroll: st.unroll || 0,
      shape: shape, probe: probe, probes: st.probes ? st.probes.length : 0, route: route,
      tw: tw ? { scale: tw.scale, area: tw.area } : null
    };
  }

  return {
    TAIWAN: TAIWAN, taiwanError: taiwanError, probeStats: probeStats, routeStats: routeStats, snapshot: snapshot,
    DEG: DEG, R_EARTH: R_EARTH, MERC_MAX: MERC_MAX, GNOM_MAX: GNOM_MAX, LIST: LIST, BY_ID: BY_ID,
    wrapPi: wrapPi, make: make, tissot: tissot,
    toVec: toVec, toLL: toLL, centralAngle: centralAngle, sphericalArea: sphericalArea, centroid: centroid, moveRing: moveRing,
    geodesic: geodesic, bearing: bearing, rhumb: rhumb, psi: psi,
    projectRing: projectRing, projectLine: projectLine, planarArea: planarArea, straightness: straightness,
    outline: outline, bounds: bounds, mapArea: mapArea, trueArea: trueArea,
    robX: robX, robY: robY
  };
});
