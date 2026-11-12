/*
 * moon-phases-core.js — 「月相與日月食」的物理核心（不碰 DOM，Node 與瀏覽器共用）
 *
 * 座標：以地球中心為原點的黃道座標（x 指向春分點、z 指向黃道北極），長度 km、時間「日」、角度弧度。
 * 時間 t：模型年的 1 月 1 日 00:00（台灣時間 UTC+8）起算的日數。模型不標年份：
 *   太陽以恆星年 365.256 363 日等速繞行（圓軌道、1 AU），春分（黃經 0°）在 3 月 20 日 18:00；
 *   日曆的「日期」由太陽位置決定（每年自動補上約 1/4 日，等於閏年的作用）。
 * 月球：克卜勒橢圓（半長軸 384 400 km、離心率 0.0549），平均黃經以恆星月 27.321 661 日等速增加，
 *   軌道面對黃道傾斜 5.145°；升交點每 18.6 年退行一圈、近地點每 8.85 年前進一圈（都可關掉）。
 *   位置由克卜勒方程式 M = E − e sin E 解出（牛頓法到機器精度），不做逐步積分，所以沒有能量漂移。
 * 影子：太陽、地球、月球都是球；本影是同時外切太陽與遮擋天體的圓錐，半影是內切的圓錐（精確幾何）。
 *   沒有計入地球大氣使地影變大約 2% 的效應。
 * 台灣：北緯 23.5°、東經 121°，地球視為半徑 6371 km 的球；恆星時由「平太陽」定義（日中天約在 12:00）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MoonCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DEG = Math.PI / 180;
  const TAU = Math.PI * 2;

  // ---------- 真實數值（來源見頁面「模擬方法」） ----------
  const EPS = 23.44 * DEG;          // 地球自轉軸傾角（黃赤交角）
  const INC = 5.145 * DEG;          // 月球軌道對黃道的傾角
  const P_SID = 27.321661;          // 恆星月（日）
  const Y_SID = 365.256363;         // 恆星年（日）
  const P_SYN_REF = 29.530589;      // 朔望月（日，觀測平均值）
  const P_DRA_REF = 27.21222;       // 交點月（日）
  const P_ANO_REF = 27.55455;       // 近點月（日）
  const P_NODE = 6793.52;           // 升交點退行一圈（日）＝ 18.6 年
  const P_APS = 3232.58;            // 近地點前進一圈（日）＝ 8.85 年
  const A_MOON = 384400;            // 月球軌道半長軸（平均距離，km）
  const E_MOON = 0.0549;            // 月球軌道離心率
  const R_EARTH = 6371;             // 地球平均半徑（km）
  const R_MOON = 1737.4;            // 月球平均半徑（km）
  const R_SUN = 696000;             // 太陽半徑（km）
  const AU = 149597870.7;           // 天文單位（km，IAU 2012 定義值）
  const LAT_TW = 23.5 * DEG;        // 台灣（約北回歸線）
  const LON_TW = 121 * DEG;
  const ZONE = 120 * DEG;           // UTC+8 的標準經線
  const T_EQ = 78.75;               // 春分：模型年 3 月 20 日 18:00
  const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const P_SYN = 1 / (1 / P_SID - 1 / Y_SID); // 由恆星月與恆星年推得的朔望月

  // ---------- 小工具 ----------
  function norm(a) { a %= TAU; return a < 0 ? a + TAU : a; }
  function wrapPi(a) { return norm(a + Math.PI) - Math.PI; }
  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function sub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function add(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
  function mul(a, k) { return v3(a.x * k, a.y * k, a.z * k); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) { return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { const L = len(a) || 1; return mul(a, 1 / L); }
  /** 兩向量夾角（用 atan2，接近 0 或 π 時也精確） */
  function angle(a, b) { return Math.atan2(len(cross(a, b)), dot(a, b)); }

  // ---------- 克卜勒方程式 ----------
  function keplerE(M, e) {
    M = wrapPi(M);
    let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
    for (let k = 0; k < 50; k++) {
      const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-15) break;
    }
    return E;
  }
  function trueFromMean(M, e) {
    const E = keplerE(M, e);
    return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  }
  function meanFromTrue(nu, e) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    return E - e * Math.sin(E);
  }

  // ---------- 太陽（地心看：圓軌道、等速） ----------
  function sunLon(t) { return norm(TAU * (t - T_EQ) / Y_SID); }
  function sunAt(t, dist) {
    const l = sunLon(t), D = dist || AU;
    return { x: D * Math.cos(l), y: D * Math.sin(l), z: 0, r: D, lon: l };
  }

  // ---------- 月球軌道根數 ----------
  /**
   * el：{ L0（t = 0 時的平均黃經）, N0（t = 0 時的升交點黃經）, W0（t = 0 時的近地點黃經）,
   *       regress（交點退行，預設 true）, precess（近地點進動，預設 true）, e, inc, a（可省略，用真實值）}
   */
  function makeElements(o) {
    o = o || {};
    return {
      L0: o.L0 || 0, N0: o.N0 || 0, W0: o.W0 || 0,
      regress: o.regress !== false, precess: o.precess !== false,
      e: o.e == null ? E_MOON : o.e, inc: o.inc == null ? INC : o.inc, a: o.a || A_MOON
    };
  }
  function nodeLon(el, t) { return norm(el.N0 - (el.regress ? TAU * t / P_NODE : 0)); }
  function periLon(el, t) { return norm(el.W0 + (el.precess ? TAU * t / P_APS : 0)); }
  function meanLon(el, t) { return el.L0 + TAU * t / P_SID; }

  /** 月球在時刻 t 的位置（km）與軌道量 */
  function moonAt(el, t) {
    const e = el.e, inc = el.inc, a = el.a;
    const Om = nodeLon(el, t), vp = periLon(el, t), L = meanLon(el, t);
    const M = norm(L - vp);
    const nu = trueFromMean(M, e);
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
    const u = vp - Om + nu; // 緯度引數（由升交點沿軌道量起）
    const cu = Math.cos(u), su = Math.sin(u), cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(inc), si = Math.sin(inc);
    const x = r * (cO * cu - sO * su * ci), y = r * (sO * cu + cO * su * ci), z = r * su * si;
    return { x: x, y: y, z: z, r: r, lon: norm(Math.atan2(y, x)), lat: Math.asin(z / r), u: norm(u), M: M, nu: nu, node: Om, peri: vp };
  }
  /** 月球軌道上「緯度引數 u」處的點（畫軌道用；同一時刻的軌道形狀） */
  function orbitPoint(el, t, u) {
    const e = el.e, inc = el.inc, a = el.a;
    const Om = nodeLon(el, t), vp = periLon(el, t);
    const nu = u - (vp - Om);
    const r = a * (1 - e * e) / (1 + e * Math.cos(nu));
    const cu = Math.cos(u), su = Math.sin(u), cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(inc), si = Math.sin(inc);
    return { x: r * (cO * cu - sO * su * ci), y: r * (sO * cu + cO * su * ci), z: r * su * si, r: r };
  }
  /** 由黃經 lon 反求緯度引數 u（軌道面上的點投影到黃道後黃經為 lon） */
  function uFromLon(el, t, lon) {
    const Om = nodeLon(el, t);
    const d = wrapPi(lon - Om);
    return norm(Math.atan2(Math.sin(d), Math.cos(d) * Math.cos(el.inc)));
  }
  /**
   * 讓月球在時刻 t 位於黃經 lon：只改 L0（軌道形狀、交點、近地點都不變）。傳回新的根數物件。
   */
  function placeMoonLon(el, t, lon) {
    const u = uFromLon(el, t, lon);
    const Om = nodeLon(el, t), vp = periLon(el, t);
    const nu = u - (vp - Om);
    const M = meanFromTrue(wrapPi(nu), el.e);
    const L = vp + M;
    const out = Object.assign({}, el);
    out.L0 = norm(L - TAU * t / P_SID);
    return out;
  }
  /** 讓月球與太陽的黃經差（距角）在時刻 t 等於 dLam */
  function placeElongation(el, t, dLam) { return placeMoonLon(el, t, norm(sunLon(t) + dLam)); }
  /** 改交點或近地點方向時，保持月球目前的黃經不變 */
  function withNode(el, t, nodeNow) {
    const lon = moonAt(el, t).lon;
    const out = Object.assign({}, el);
    out.N0 = norm(nodeNow + (el.regress ? TAU * t / P_NODE : 0));
    return placeMoonLon(out, t, lon);
  }
  function withPerigee(el, t, periNow) {
    const lon = moonAt(el, t).lon;
    const out = Object.assign({}, el);
    out.W0 = norm(periNow - (el.precess ? TAU * t / P_APS : 0));
    return placeMoonLon(out, t, lon);
  }
  /** 開關交點退行／近地點進動時，保持 t 時刻的交點、近地點與月球位置都不變 */
  function withFlags(el, t, regress, precess) {
    const Om = nodeLon(el, t), vp = periLon(el, t), lon = moonAt(el, t).lon;
    const out = Object.assign({}, el, { regress: !!regress, precess: !!precess });
    out.N0 = norm(Om + (out.regress ? TAU * t / P_NODE : 0));
    out.W0 = norm(vp - (out.precess ? TAU * t / P_APS : 0));
    return placeMoonLon(out, t, lon);
  }

  // ---------- 月相 ----------
  /** 月相：dLam = 月球與太陽的黃經差（距角，0 新月、90° 上弦、180° 滿月、270° 下弦） */
  function phaseAt(el, t) {
    const m = moonAt(el, t), s = sunAt(t);
    const dLam = norm(m.lon - s.lon);
    const psi = angle(m, s);                         // 地心看日月夾角（距角）
    const ph = angle(sub(s, m), mul(m, -1));         // 相角：在月球上看太陽與地球的夾角
    return {
      moon: m, sun: s, dLam: dLam, psi: psi, phaseAngle: ph,
      illum: (1 + Math.cos(ph)) / 2,                 // 被照亮的比例（精確）
      illumApprox: (1 - Math.cos(psi)) / 2,          // 太陽在無窮遠的近似
      waxing: dLam < Math.PI
    };
  }
  /** 月相名稱的代號：new, waxC, fq, waxG, full, wanG, lq, wanC（主要月相 ±7°） */
  const PHASE_KEYS = ['new', 'waxC', 'fq', 'waxG', 'full', 'wanG', 'lq', 'wanC'];
  function phaseKey(dLam) {
    const d = norm(dLam) / DEG, w = 7;
    if (d < w || d >= 360 - w) return 'new';
    if (d < 90 - w) return 'waxC';
    if (d < 90 + w) return 'fq';
    if (d < 180 - w) return 'waxG';
    if (d < 180 + w) return 'full';
    if (d < 270 - w) return 'wanG';
    if (d < 270 + w) return 'lq';
    return 'wanC';
  }
  /** 距角變化率（弧度／日，數值微分） */
  function dLamRate(el, t) {
    const h = 1e-4;
    return wrapPi(norm(moonAt(el, t + h).lon - sunLon(t + h)) - norm(moonAt(el, t - h).lon - sunLon(t - h))) / (2 * h);
  }
  /**
   * 下一次（dir = +1）或上一次（dir = −1）距角等於 target 的時刻（例如 0 = 朔、π = 望）。
   * 距角隨時間單調增加，先以 0.25 日的步長找到跨越，再二分法到 1e-9 日。
   */
  function findPhase(el, t, target, dir) {
    dir = dir || 1;
    const f = function (tt) { return wrapPi(norm(moonAt(el, tt).lon - sunLon(tt)) - target); };
    const h = 0.25 * dir;
    let a = t, fa = f(a);
    for (let k = 0; k < 160; k++) {
      const b = a + h, fb = f(b);
      // 往未來：f 由負變正；往過去：由正變負（避開 ±π 的跳躍）
      if (Math.abs(fb - fa) < Math.PI && ((dir > 0 && fa < 0 && fb >= 0) || (dir < 0 && fa > 0 && fb <= 0))) {
        let lo = Math.min(a, b), hi = Math.max(a, b);
        for (let i = 0; i < 60; i++) {
          const mid = (lo + hi) / 2;
          if (f(mid) < 0) lo = mid; else hi = mid;
          if (hi - lo < 1e-10) break;
        }
        const r = (lo + hi) / 2;
        if ((dir > 0 && r > t + 1e-9) || (dir < 0 && r < t - 1e-9)) return r;
      }
      a = b; fa = fb;
    }
    return NaN;
  }
  /** 下一次月球黃經等於 lon 的時刻（回到同一顆恆星的方向）；至少在 minGap 日之後 */
  function findMoonLon(el, t, lon, minGap) {
    const f = function (tt) { return wrapPi(moonAt(el, tt).lon - lon); };
    let a = t + (minGap || 1e-6), fa = f(a);
    for (let k = 0; k < 160; k++) {
      const b = a + 0.25, fb = f(b);
      if (fa < 0 && fb >= 0 && fb - fa < Math.PI) {
        let lo = a, hi = b;
        for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; if (hi - lo < 1e-10) break; }
        return (lo + hi) / 2;
      }
      a = b; fa = fb;
    }
    return NaN;
  }
  /** 月齡：距離上一次朔的日數 */
  function moonAge(el, t) {
    const f = wrapPi(norm(moonAt(el, t).lon - sunLon(t)));
    if (Math.abs(f) < 1e-12) return 0;
    const tn = findPhase(el, t + 1e-6, 0, -1);
    return t - tn;
  }

  // ---------- 影子（本影、半影圓錐） ----------
  /**
   * 半徑 Rs 的光源在距離 D 處，半徑 Rb 的遮擋天體；x 為遮擋天體後方沿軸的距離。
   * 傳回本影半徑 ru（負值表示已過本影錐尖，是「偽本影」的半徑）與半影半徑 rp，以及本影長度 Lu。
   */
  function cone(Rs, Rb, D, x) {
    let Lu, ru;
    if (Rs > Rb) {
      Lu = D * Rb / (Rs - Rb);
      ru = (Lu - x) * Math.tan(Math.asin((Rs - Rb) / D));
    } else if (Rs === Rb) {
      Lu = Infinity; ru = Rb;
    } else {
      Lu = -D * Rb / (Rb - Rs); // 光源比遮擋天體小：本影錐向後張開
      ru = (x - Lu) * Math.tan(Math.asin((Rb - Rs) / D));
    }
    const Lp = D * Rb / (Rs + Rb);
    const rp = (Lp + x) * Math.tan(Math.asin((Rs + Rb) / D));
    return { ru: ru, rp: rp, Lu: Lu, Lp: Lp };
  }
  /** 月食（地球的影子落在月球上）。m、s：月球與太陽的地心位置 */
  function lunarEclipse(m, s, opt) {
    opt = opt || {};
    const RS = opt.RS || R_SUN, RE = opt.RE || R_EARTH, RM = opt.RM || R_MOON;
    const D = len(s), a = mul(s, -1 / D);            // 影子的軸：由地心指向背向太陽
    const x = dot(m, a);
    const off = sub(m, mul(a, x)), d = len(off);
    const c = cone(RS, RE, D, Math.max(x, 0));
    const res = { type: 'none', x: x, d: d, ru: c.ru, rp: c.rp, Lu: c.Lu, magU: (c.ru - d + RM) / (2 * RM), magP: (c.rp - d + RM) / (2 * RM), axis: a, off: off };
    if (x <= 0) { res.magU = res.magP = -Infinity; return res; }
    if (d + RM <= c.ru) res.type = 'total';
    else if (d - RM < c.ru) res.type = 'partial';
    else if (d - RM < c.rp) res.type = 'penumbral';
    return res;
  }
  /**
   * 日食（月球的影子落在地球上），以整個地球判斷（某處看得到即算）。
   * central：影子的軸穿過地球；type：total（本影碰到地表）、annular（只有偽本影）、partial、none。
   */
  function solarEclipse(m, s, opt) {
    opt = opt || {};
    const RS = opt.RS || R_SUN, RE = opt.RE || R_EARTH, RM = opt.RM || R_MOON;
    const sm = sub(m, s), Dms = len(sm), a = mul(sm, 1 / Dms); // 軸：太陽 → 月球 → 再往後
    const e = mul(m, -1);                                     // 地心相對於月球
    const x = dot(e, a);
    const off = sub(e, mul(a, x)), d = len(off);
    const c = cone(RS, RM, Dms, Math.max(x, 0));
    const res = { type: 'none', central: false, x: x, d: d, gamma: d / RE, ru: c.ru, rp: c.rp, Lu: c.Lu, axis: a, off: off, ruSurface: NaN, hit: null };
    if (x <= 0) return res;
    if (d < RE) {
      const xs = x - Math.sqrt(RE * RE - d * d);              // 軸與地表的交點（朝月球那一側）
      const cs = cone(RS, RM, Dms, xs);
      res.central = true;
      res.ruSurface = cs.ru;
      res.hit = add(m, mul(a, xs));
      res.type = cs.ru > 0 ? 'total' : 'annular';
    } else if (d < RE + Math.abs(c.ru)) {
      res.type = c.ru > 0 ? 'total' : 'annular';
      res.ruSurface = c.ru;
    } else if (d < RE + c.rp) {
      res.type = 'partial';
    }
    return res;
  }
  /** 地表上最接近月影軸的點（日食最大的地方） */
  function greatestPoint(m, s) {
    const se = solarEclipse(m, s);
    if (se.hit) return se.hit;
    const foot = add(m, mul(se.axis, se.x)); // 軸上最接近地心的點
    return mul(unit(foot), R_EARTH);
  }
  /** 兩圓（半徑 r1、r2，圓心距 d）重疊的面積 */
  function overlapArea(r1, r2, d) {
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) { const r = Math.min(r1, r2); return Math.PI * r * r; }
    const a1 = r1 * r1, a2 = r2 * r2;
    const c1 = Math.max(-1, Math.min(1, (d * d + a1 - a2) / (2 * d * r1)));
    const c2 = Math.max(-1, Math.min(1, (d * d + a2 - a1) / (2 * d * r2)));
    const k = Math.max(0, (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
    return a1 * Math.acos(c1) + a2 * Math.acos(c2) - 0.5 * Math.sqrt(k);
  }
  /** 從點 q 看到的太陽圓面比例（被地球擋住以外的部分）：1 = 全亮、0 = 在本影中 */
  function sunVisibleFrom(q, s, occ, Rocc) {
    const vs = sub(s, q), vo = sub(occ, q);
    const ds = len(vs), dd = len(vo);
    const rs = Math.asin(Math.min(1, R_SUN / ds)), ro = Math.asin(Math.min(1, (Rocc || R_EARTH) / dd));
    const sep = angle(vs, vo);
    return 1 - overlapArea(rs, ro, sep) / (Math.PI * rs * rs);
  }
  /** 從觀測者 P 看到的日食（地點限定）：none / partial / total / annular，與食分 mag、遮蔽面積比 obsc */
  function localSolar(m, s, P) {
    const vm = sub(m, P), vs = sub(s, P);
    const rm = Math.asin(R_MOON / len(vm)), rs = Math.asin(R_SUN / len(vs));
    const sep = angle(vm, vs);
    let type = 'none';
    if (sep < rm + rs) type = sep <= rm - rs ? 'total' : sep <= rs - rm ? 'annular' : 'partial';
    return { type: type, sep: sep, rm: rm, rs: rs, mag: (rs + rm - sep) / (2 * rs), obsc: overlapArea(rs, rm, sep) / (Math.PI * rs * rs) };
  }

  /** 時刻 t 的日月食狀態（月食以地心判斷；日食以全地球判斷） */
  function eclipsesAt(el, t) {
    const m = moonAt(el, t), s = sunAt(t);
    return { lunar: lunarEclipse(m, s), solar: solarEclipse(m, s), moon: m, sun: s };
  }
  /**
   * 朔或望附近（ts ± 0.5 日）月球最接近影子軸的時刻（食甚），以黃金分割搜尋；傳回該時刻的分類。
   * kind：'lunar' | 'solar'
   */
  function greatestEclipse(el, ts, kind) {
    const f = function (t) {
      const m = moonAt(el, t), s = sunAt(t);
      return (kind === 'lunar' ? lunarEclipse(m, s) : solarEclipse(m, s)).d;
    };
    let a = ts - 0.5, b = ts + 0.5;
    const g = (Math.sqrt(5) - 1) / 2;
    let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
    for (let i = 0; i < 80 && b - a > 1e-7; i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
    }
    const tm = (a + b) / 2;
    const m = moonAt(el, tm), s = sunAt(tm);
    return { t: tm, res: kind === 'lunar' ? lunarEclipse(m, s) : solarEclipse(m, s) };
  }

  // ---------- 台灣的天空 ----------
  const cE = Math.cos(EPS), sE = Math.sin(EPS);
  function eclToEq(v) { return v3(v.x, v.y * cE - v.z * sE, v.y * sE + v.z * cE); }
  function eqToEcl(v) { return v3(v.x, v.y * cE + v.z * sE, -v.y * sE + v.z * cE); }
  /** 地方恆星時（弧度）：平太陽的赤經 ＝ 太陽的平黃經，地方平時 12:00 時平太陽上中天 */
  function lst(t, lon) {
    const lmt = t + ((lon == null ? LON_TW : lon) - ZONE) / TAU;
    return norm(sunLon(t) + TAU * (lmt - 0.5));
  }
  /** 觀測者的地心位置（黃道座標，km） */
  function observer(t, lat, lon) {
    lat = lat == null ? LAT_TW : lat;
    const th = lst(t, lon);
    const q = v3(Math.cos(lat) * Math.cos(th), Math.cos(lat) * Math.sin(th), Math.sin(lat));
    const p = mul(eqToEcl(q), R_EARTH);
    p.th = th; p.lat = lat;
    return p;
  }
  function horizonBasis(th, lat) {
    return {
      up: v3(Math.cos(lat) * Math.cos(th), Math.cos(lat) * Math.sin(th), Math.sin(lat)),
      east: v3(-Math.sin(th), Math.cos(th), 0),
      north: v3(-Math.sin(lat) * Math.cos(th), -Math.sin(lat) * Math.sin(th), Math.cos(lat))
    };
  }
  /** 地心位置 X（km）在 t 時從台灣（或 lat/lon）看的高度角、方位角（由北向東）與距離 */
  function horizontal(X, t, lat, lon) {
    const P = observer(t, lat, lon);
    const dv = sub(X, P), dist = len(dv);
    const q = eclToEq(mul(dv, 1 / dist));
    const B = horizonBasis(P.th, P.lat);
    return { alt: Math.asin(Math.max(-1, Math.min(1, dot(q, B.up)))), az: norm(Math.atan2(dot(q, B.east), dot(q, B.north))), dist: dist };
  }
  /** 赤緯（地心） */
  function declination(X) { return Math.asin(eclToEq(unit(X)).z); }
  function moonAlt(el, t, lat, lon) { return horizontal(moonAt(el, t), t, lat, lon); }
  function sunAlt(t, lat, lon) { return horizontal(sunAt(t), t, lat, lon); }
  const REFR = 34 / 60 * DEG; // 地平線附近的大氣折射
  /**
   * 一天（t0 起 24 小時）內的升起與落下時刻（日），找不到為 null。
   * 太陽：上緣碰到地平線（中心高度 −0.833°）；月球：上緣碰到地平線（中心高度 −(34′ + 視半徑)）。
   */
  function riseSet(el, t0, body, lat, lon) {
    const f = function (t) {
      if (body === 'sun') return sunAlt(t, lat, lon).alt + (REFR + 16 / 60 * DEG);
      const h = moonAlt(el, t, lat, lon);
      return h.alt + REFR + Math.asin(R_MOON / h.dist);
    };
    const step = 1 / 144;
    let rise = null, set = null, ta = t0, fa = f(ta);
    for (let k = 1; k <= 144; k++) {
      const tb = t0 + k * step, fb = f(tb);
      if ((fa < 0) !== (fb < 0)) {
        let lo = ta, hi = tb, flo = fa;
        for (let i = 0; i < 40; i++) {
          const mid = (lo + hi) / 2, fm = f(mid);
          if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
        }
        const tc = (lo + hi) / 2;
        if (fa < 0 && rise == null) rise = tc;
        if (fa >= 0 && set == null) set = tc;
      }
      ta = tb; fa = fb;
    }
    return { rise: rise, set: set, upAll: rise == null && set == null && f(t0) >= 0 };
  }
  /** 上中天（時角 0）的時刻：一天內最高的時刻 */
  function transit(el, t0, body, lat, lon) {
    const ha = function (t) {
      const X = body === 'sun' ? sunAt(t) : moonAt(el, t);
      const P = observer(t, lat, lon);
      const q = eclToEq(unit(sub(X, P)));
      return wrapPi(P.th - Math.atan2(q.y, q.x));
    };
    const step = 1 / 144;
    let ta = t0, fa = ha(ta);
    for (let k = 1; k <= 160; k++) {
      const tb = t0 + k * step, fb = ha(tb);
      if (fa < 0 && fb >= 0 && fb - fa < 1) {
        let lo = ta, hi = tb;
        for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ha(mid) < 0) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
      }
      ta = tb; fa = fb;
    }
    return null;
  }
  /**
   * 從台灣看月球時的方向：螢幕座標（x 向右、y 向上＝天頂方向）中，
   * limb：月面亮邊的方向（指向太陽），north：月球北極（黃道北極方向）的方向。皆為 atan2(y, x) 的角度。
   */
  function skyOrientation(el, t, lat, lon) {
    const m = moonAt(el, t), s = sunAt(t), P = observer(t, lat, lon);
    const B = horizonBasis(P.th, P.lat);
    const toH = function (vEcl) { const q = eclToEq(vEcl); return v3(dot(q, B.east), dot(q, B.north), dot(q, B.up)); };
    const f = unit(toH(sub(m, P)));
    const Z = v3(0, 0, 1);
    let up = sub(Z, mul(f, f.z));
    if (len(up) < 1e-6) up = sub(v3(0, 1, 0), mul(f, f.y)); // 月亮在天頂：以北方為上
    up = unit(up);
    const right = cross(f, up);
    const proj = function (w) { const p = sub(w, mul(f, dot(w, f))); return Math.atan2(dot(p, up), dot(p, right)); };
    const sd = unit(toH(sub(s, m)));
    const np = toH(v3(0, 0, 1)); // 黃道北極（月球自轉軸只偏 1.5°）
    return { limb: proj(sd), north: proj(np) };
  }

  // ---------- 日曆 ----------
  function calendar(t) {
    const day = Math.floor(t);
    const hour = (t - day) * 24;
    const year = Math.floor((day + 0.5) / Y_SID);
    let doy = Math.floor(day + 0.5 - year * Y_SID);
    if (doy > 364) doy = 364;
    let m = 0, d = doy;
    while (m < 11 && d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; }
    return { year: year, doy: doy, month: m + 1, day: d + 1, hour: hour, dayIndex: day };
  }
  /** 模型年 year 的第 doy 天（0 = 1 月 1 日）hour 時的 t */
  function timeOf(year, doy, hour) { return Math.ceil(year * Y_SID + doy - 0.5) + hour / 24; }
  function doyOf(month, day) { let n = 0; for (let i = 0; i < month - 1; i++) n += MONTH_DAYS[i]; return n + day - 1; }

  return {
    DEG: DEG, TAU: TAU, EPS: EPS, INC: INC, P_SID: P_SID, Y_SID: Y_SID, P_SYN: P_SYN, P_SYN_REF: P_SYN_REF,
    P_DRA_REF: P_DRA_REF, P_ANO_REF: P_ANO_REF, P_NODE: P_NODE, P_APS: P_APS, A_MOON: A_MOON, E_MOON: E_MOON,
    R_EARTH: R_EARTH, R_MOON: R_MOON, R_SUN: R_SUN, AU: AU, LAT_TW: LAT_TW, LON_TW: LON_TW, T_EQ: T_EQ, MONTH_DAYS: MONTH_DAYS,
    norm: norm, wrapPi: wrapPi, v3: v3, sub: sub, add: add, mul: mul, dot: dot, cross: cross, len: len, unit: unit, angle: angle,
    keplerE: keplerE, trueFromMean: trueFromMean, meanFromTrue: meanFromTrue,
    sunLon: sunLon, sunAt: sunAt, makeElements: makeElements, nodeLon: nodeLon, periLon: periLon, meanLon: meanLon,
    moonAt: moonAt, orbitPoint: orbitPoint, uFromLon: uFromLon, placeMoonLon: placeMoonLon, placeElongation: placeElongation,
    withNode: withNode, withPerigee: withPerigee, withFlags: withFlags,
    phaseAt: phaseAt, PHASE_KEYS: PHASE_KEYS, phaseKey: phaseKey, dLamRate: dLamRate, findPhase: findPhase, findMoonLon: findMoonLon, moonAge: moonAge,
    cone: cone, lunarEclipse: lunarEclipse, solarEclipse: solarEclipse, greatestPoint: greatestPoint, overlapArea: overlapArea,
    sunVisibleFrom: sunVisibleFrom, localSolar: localSolar, eclipsesAt: eclipsesAt, greatestEclipse: greatestEclipse,
    eclToEq: eclToEq, eqToEcl: eqToEcl, lst: lst, observer: observer, horizonBasis: horizonBasis, horizontal: horizontal,
    declination: declination, moonAlt: moonAlt, sunAlt: sunAlt, riseSet: riseSet, transit: transit, skyOrientation: skyOrientation,
    calendar: calendar, timeOf: timeOf, doyOf: doyOf
  };
});
