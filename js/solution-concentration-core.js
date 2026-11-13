/*
 * solution-concentration-core.js — 「濃度與溶液配製」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 三件事：
 *   1. 濃度換算：重量百分率 w、體積莫耳濃度 C（mol/L）、重量莫耳濃度 m（mol/kg）、莫耳分率、ppm 的互換，
 *      用 20 °C 的溶液密度表（CRC Handbook of Chemistry and Physics，「水溶液的濃度性質」表，表中點之間線性內插）。
 *   2. 量瓶的幾何：瓶身是下方截平的球、上接圓柱形瓶頸；刻度線以下的容積剛好等於標示體積（20 °C）。
 *      由液體體積求液面高度、相對刻度線的位置，以及從斜上方（俯視）或斜下方（仰視）看時「看起來」的位置（視差）。
 *   3. 配製流程：秤量 → 燒杯溶解（溶解熱讓溫度改變）→（冷卻）→ 移入量瓶 → 洗燒杯 → 加水定容 → 蓋塞搖勻；
 *      或用吸量管吸取原液稀釋。每一步都追蹤「量瓶裡溶質的莫耳數 n」與「水的質量 mw」，
 *      溶液體積一律由「總質量 ÷ 密度（查表）」算出——溶液的體積不是溶質與水的體積相加。
 *
 * 溫度：量瓶與密度表都以 20 °C 為準。溶解熱使燒杯溫度改變；沒冷卻就定容時，液體的體積照純水的熱膨脹放大
 *（V(T) = V(20 °C) × ρ水(20 °C) / ρ水(T)），冷卻後體積縮小、濃度偏高。玻璃的熱膨脹（約 1×10^-5 /K）忽略。
 */
(function (root) {
  'use strict';
  const T_REF = 20;              // °C
  const RHO_W = 0.99821;         // 水 20 °C 的密度 g/mL
  const CP = 4.18;               // 溶液比熱 J/(g·K)（簡化：一律用水的值）
  const M_H2O = 18.015;
  const M_CU = 63.546;
  const DROP = 0.05;             // 滴管一滴 mL
  const SQUIRT = 1.0;            // 洗瓶擠一下 mL
  const NECK_GAP = 15;           // 「加水到瓶頸」停在刻度線下方 15 mm

  // 純水密度 g/mL（CRC Handbook「Properties of Water in the Range 0–100 °C」）
  const WATER_T = [[0, 0.99984], [5, 0.99996], [10, 0.99970], [15, 0.99910], [20, 0.99821], [25, 0.99705], [30, 0.99565],
    [35, 0.99403], [40, 0.99222], [45, 0.99022], [50, 0.98804], [60, 0.98320], [70, 0.97777], [80, 0.97179], [90, 0.96531], [100, 0.95835]];

  // 20 °C 水溶液密度 g/mL：[重量百分率 %, 密度]（CRC Handbook「Concentrative Properties of Aqueous Solutions」）
  const SPECIES = {
    NaCl: {
      M: 58.44, sat: 26.4, dH: 3.88,
      rho: [[0, RHO_W], [0.5, 1.0018], [1, 1.0053], [2, 1.0125], [3, 1.0196], [4, 1.0268], [5, 1.0340], [6, 1.0413], [7, 1.0486], [8, 1.0559],
        [9, 1.0633], [10, 1.0707], [12, 1.0857], [14, 1.1008], [16, 1.1162], [18, 1.1319], [20, 1.1478], [22, 1.1640], [24, 1.1804], [26, 1.1972]]
    },
    NaOH: {
      M: 40.00, sat: 52.2, dH: -44.51,
      rho: [[0, RHO_W], [0.5, 1.0039], [1, 1.0095], [2, 1.0207], [3, 1.0318], [4, 1.0428], [5, 1.0538], [6, 1.0648], [7, 1.0758], [8, 1.0869],
        [9, 1.0979], [10, 1.1089], [12, 1.1309], [14, 1.1530], [16, 1.1751], [18, 1.1972], [20, 1.2191], [24, 1.2629], [30, 1.3277], [40, 1.4299], [50, 1.5253]]
    },
    CuSO4: {
      M: 159.60, sat: 16.7, dH: -73.25,
      rho: [[0, RHO_W], [0.5, 1.0033], [1, 1.0085], [2, 1.0190], [3, 1.0296], [4, 1.0403], [5, 1.0511], [6, 1.0620], [7, 1.0730], [8, 1.0842],
        [9, 1.0955], [10, 1.1070], [12, 1.1304], [14, 1.1545], [16, 1.1796], [18, 1.2059]]
    }
  };
  // 秤量用的固體：sp 是溶進水裡的溶質；hyd 是結晶水數；dH 是 25 °C 無限稀釋的莫耳溶解熱 kJ/mol（CRC）
  const SOLIDS = {
    'CuSO4-5H2O': { sp: 'CuSO4', M: 249.68, hyd: 5, dH: 11.5 },
    'CuSO4': { sp: 'CuSO4', M: 159.60, hyd: 0, dH: -73.25 },
    'NaCl': { sp: 'NaCl', M: 58.44, hyd: 0, dH: 3.88 },
    'NaOH': { sp: 'NaOH', M: 40.00, hyd: 0, dH: -44.51 }
  };
  // 稀釋用的原液（20 °C）
  const STOCKS = {
    Cu1: { sp: 'CuSO4', c: 1.000 },
    Na2: { sp: 'NaCl', c: 2.000 },
    OH1: { sp: 'NaOH', c: 1.000 }
  };
  // 量瓶：rn 瓶頸內半徑 mm、neck 瓶頸長 mm（刻度線在瓶頸 45% 高處）（接近 A 級量瓶的尺寸，取整）
  const FLASKS = { 50: { rn: 5.0, neck: 70 }, 100: { rn: 6.0, neck: 85 }, 250: { rn: 7.5, neck: 105 }, 500: { rn: 9.0, neck: 125 } };
  const MARK_AT = 0.45;
  // 硫酸銅（Cu2+ 水合離子）在紅、綠、藍三個色頻的莫耳吸收係數（M^-1 cm^-1）：示意值（最大吸收約在 800 nm 的紅光區）
  const EPS_CU = [1.6, 0.30, 0.04];

  // ---------------- 內插 ----------------
  function interp(tab, x) {
    const n = tab.length;
    if (x <= tab[0][0]) { const a = tab[0], b = tab[1]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    for (let i = 1; i < n; i++) {
      if (x <= tab[i][0]) { const a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    }
    const a = tab[n - 2], b = tab[n - 1];
    return b[1] + (b[1] - a[1]) * (x - b[0]) / (b[0] - a[0]);
  }
  /** 純水在 T °C 的密度 */
  function rhoWater(T) { return interp(WATER_T, T); }
  /** 液體由 20 °C 加熱到 T 時體積變成幾倍（照純水） */
  function volFactor(T) { return RHO_W / rhoWater(T); }
  /** 溶液密度 g/mL；w 是質量分率（0–1） */
  function rho(sp, w) { return interp(SPECIES[sp].rho, w * 100); }
  /** 由組成（溶質 n mol、水 mw g）求溶液：總質量、質量分率、密度、20 °C 的體積 mL */
  function mixture(sp, n, mw) {
    const ms = n * SPECIES[sp].M, mass = ms + mw;
    if (mass <= 0) return { mass: 0, ms: 0, mw: 0, w: 0, rho: RHO_W, V: 0 };
    const w = ms / mass, r = rho(sp, w);
    return { mass: mass, ms: ms, mw: mw, w: w, rho: r, V: mass / r };
  }
  /** 由質量分率求各種濃度 */
  function props(sp, w) {
    const S = SPECIES[sp], r = rho(sp, w);
    const C = 1000 * r * w / S.M;
    const m = w < 1 ? 1000 * w / ((1 - w) * S.M) : Infinity;
    const ns = w / S.M, nw = (1 - w) / M_H2O;
    return {
      w: w, rho: r, C: C, m: m, x: ns / (ns + nw), ppm: w * 1e6, gL: 1000 * r * w,
      ppmCu: sp === 'CuSO4' ? w * 1e6 * M_CU / S.M : null
    };
  }
  /** 由體積莫耳濃度求質量分率（二分法；C 隨 w 單調增加） */
  function wFromC(sp, C) {
    if (C <= 0) return 0;
    let lo = 0, hi = 0.6;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (props(sp, mid).C < C) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  /** 由重量莫耳濃度求質量分率（解析） */
  function wFromMolal(sp, m) { const ms = m * SPECIES[sp].M; return ms / (1000 + ms); }

  // ---------------- 量瓶幾何（mm、mm³） ----------------
  // 瓶身：半徑 R 的球，球心在 zc = 0.8R（底部截平），在 r = rn 處接上瓶頸
  const geomCache = {};
  function bulbVol(R, rn, zc, z) {   // 由瓶底（z = 0）到高度 z 的球段體積（z 不超過接頸處）
    const a = -zc, b = z - zc;
    return Math.PI * (R * R * (b - a) - (b * b * b - a * a * a) / 3);
  }
  function geom(Vf) {
    if (geomCache[Vf]) return geomCache[Vf];
    const F = FLASKS[Vf], rn = F.rn, lMark = MARK_AT * F.neck;
    const target = Vf * 1000;
    let lo = rn * 1.2, hi = 200;
    const vm = function (R) { const zc = 0.8 * R, zt = zc + Math.sqrt(R * R - rn * rn); return bulbVol(R, rn, zc, zt) + Math.PI * rn * rn * lMark; };
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (vm(mid) < target) lo = mid; else hi = mid; }
    const R = (lo + hi) / 2, zc = 0.8 * R, zt = zc + Math.sqrt(R * R - rn * rn);
    const Vt = bulbVol(R, rn, zc, zt);
    const g = {
      Vf: Vf, rn: rn, R: R, zc: zc, zt: zt, zMark: zt + lMark, zTop: zt + F.neck, Vt: Vt,
      rBottom: Math.sqrt(R * R - zc * zc), lMark: lMark
    };
    g.Vtop = Vt + Math.PI * rn * rn * F.neck;
    /** 高度 z 處的內半徑 */
    g.r = function (z) { return z >= zt ? rn : z <= 0 ? g.rBottom : Math.sqrt(Math.max(0, R * R - (z - zc) * (z - zc))); };
    /** 高度 z 以下的容積 mm³ */
    g.volAt = function (z) { return z <= 0 ? 0 : z <= zt ? bulbVol(R, rn, zc, z) : Vt + Math.PI * rn * rn * (z - zt); };
    /** 容積 v mm³ 的液面高度 */
    g.zAt = function (v) {
      if (v <= 0) return 0;
      if (v >= Vt) return zt + (v - Vt) / (Math.PI * rn * rn);
      let a = 0, b = zt;
      for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (bulbVol(R, rn, zc, m) < v) a = m; else b = m; }
      return (a + b) / 2;
    };
    geomCache[Vf] = g;
    return g;
  }
  /** 燒杯（容量和量瓶相同、高 = 1.4 × 直徑）：內半徑 mm */
  function beakerR(Vf) { return Math.cbrt(Vf * 1000 / (2.8 * Math.PI)); }
  /** 燒杯倒完後殘留在杯壁與玻棒上的溶液 mL */
  function residue(Vf) { return 0.6 + 0.004 * Vf; }
  /** 搖勻後沾在瓶塞、瓶頸內壁上的液膜 mL */
  function film(Vf) { return 0.05 + 0.001 * Vf; }
  /** 溶解用的水 mL、洗燒杯每次用的水 mL */
  function dissolveWater(Vf) { return 0.4 * Vf; }
  function rinseWater(Vf) { return 0.1 * Vf; }
  /** 沒用原液潤洗的吸量管裡，原本殘留的蒸餾水 mL */
  function pipetteWater(V1) { return 0.02 + 0.005 * V1; }

  // ---------------- 顏色（比爾定律，三個色頻） ----------------
  /** 硫酸銅濃度 C（M）、光程 l（cm）的穿透率 [R, G, B]（0–1） */
  function transmit(C, l) { return EPS_CU.map(function (e) { return Math.pow(10, -e * C * l); }); }

  // ---------------- 配製流程 ----------------
  /**
   * o: { mode: 'weigh'|'dilute', Vf: 50|100|250|500, target（mol/L）, flaskWet,
   *      weigh: solid（SOLIDS 的鍵）, mass（g）；dilute: stock { sp, c, key, chain } }
   */
  function newPrep(o) {
    const Vf = o.Vf || 100;
    const P = {
      mode: o.mode || 'weigh', Vf: Vf, g: geom(Vf), target: o.target || 0.1, flaskWet: !!o.flaskWet,
      solid: o.solid || 'CuSO4-5H2O', mass: o.mass || 0, stock: o.stock || null,
      beaker: null, flask: { n: 0, mw: o.flaskWet ? 0.01 * Vf * RHO_W : 0, T: T_REF },
      nIn: 0, nDrawn: 0, dissolved: false, transferred: false, rinses: 0, cooled: false, pip: 0, pipLoss: 0,
      everShaken: false, shaken: false, afterWater: 0, Tfill: T_REF, eyeFill: 0, appFill: null, drawnOut: false,
      done: false
    };
    P.sp = P.mode === 'weigh' ? SOLIDS[P.solid].sp : P.stock.sp;
    return P;
  }
  function mixT(m1, T1, m2, T2) { return m1 + m2 > 0 ? (m1 * T1 + m2 * T2) / (m1 + m2) : T2; }
  /** 量瓶裡溶液 20 °C 的體積 mL */
  function V20(P) { return mixture(P.sp, P.flask.n, P.flask.mw).V; }
  /** 量瓶裡液體現在（目前溫度）的總體積 mL */
  function Vnow(P) { return V20(P) * volFactor(P.flask.T); }
  /** 看得到的液面（搖勻後扣掉沾在瓶塞上的液膜）：高度 mm、相對刻度線 mm（正 = 在上方） */
  function level(P) {
    const v = Vnow(P) - (P.everShaken ? film(P.Vf) : 0);
    const z = P.g.zAt(Math.max(0, v) * 1000);
    return { z: z, h: z - P.g.zMark, V: v };
  }
  /** 眼睛從水平往下 eye 度（負值 = 往上看）時，液面看起來在刻度線上方幾 mm */
  function apparent(P, eye) { return level(P).h + P.g.rn * Math.tan((eye || 0) * Math.PI / 180); }
  function overflow(P, addV) { return (Vnow(P) + addV) * 1000 > P.g.Vtop - 1; }
  function fail(why, extra) { return Object.assign({ ok: false, why: why }, extra || {}); }

  /** 把固體倒進燒杯的水裡溶解 */
  function dissolve(P) {
    if (P.mode !== 'weigh' || P.done) return fail('mode');
    if (P.dissolved) return fail('again');
    if (!(P.mass > 0)) return fail('nomass');
    const S = SOLIDS[P.solid], sp = SPECIES[S.sp];
    const n = P.mass / S.M, W = dissolveWater(P.Vf);
    const mw = W * RHO_W + n * S.hyd * M_H2O, ms = n * sp.M;
    const w = ms / (mw + ms);
    if (w * 100 > sp.sat) {
      // 燒杯的水能溶解的最多固體（20 °C）：n·M_sp = s·(W·ρ + n·hyd·18.015)，s = sat/(100 − sat)
      const s = sp.sat / (100 - sp.sat), nMax = s * W * RHO_W / (sp.M - s * S.hyd * M_H2O);
      return fail('sat', { maxMass: nMax * S.M });
    }
    const T = T_REF - S.dH * 1000 * n / ((mw + ms) * CP);
    P.beaker = { n: n, mw: mw, T: T };
    P.nIn = n; P.dissolved = true;
    return { ok: true, T: T, dT: T - T_REF };
  }
  /** 等溶液回到 20 °C（燒杯與量瓶） */
  function cool(P) {
    if (P.done) return fail('done');
    let any = false;
    if (P.beaker && P.beaker.mw > 0 && Math.abs(P.beaker.T - T_REF) > 1e-9) { P.beaker.T = T_REF; any = true; }
    if (P.flask.mw > 0 && Math.abs(P.flask.T - T_REF) > 1e-9) { P.flask.T = T_REF; any = true; }
    if (!any) return fail('cold');
    if (!P.transferred) P.cooled = true;
    return { ok: true };
  }
  /** 燒杯 → 量瓶（沿玻棒倒入），杯壁與玻棒留下 residue(Vf) mL */
  function pourBeaker(P) {
    const B = P.beaker, mx = mixture(P.sp, B.n, B.mw), vb = mx.V * volFactor(B.T);
    const keep = Math.min(1, residue(P.Vf) / vb);
    const mv = mx.mass * (1 - keep);
    if (overflow(P, vb * (1 - keep))) return fail('overflow');
    P.flask.T = mixT(mixture(P.sp, P.flask.n, P.flask.mw).mass, P.flask.T, mv, B.T);
    P.flask.n += B.n * (1 - keep); P.flask.mw += B.mw * (1 - keep);
    B.n *= keep; B.mw *= keep;
    return { ok: true };
  }
  function transfer(P) {
    if (P.mode !== 'weigh' || P.done) return fail('mode');
    if (!P.dissolved) return fail('notyet');
    if (P.transferred) return fail('again');
    if (P.everShaken) return fail('shaken');
    const r = pourBeaker(P);
    if (r.ok) P.transferred = true;
    return r;
  }
  /** 用少量蒸餾水洗燒杯和玻棒，洗液也倒進量瓶 */
  function rinse(P) {
    if (P.mode !== 'weigh' || P.done) return fail('mode');
    if (!P.transferred) return fail('notyet');
    if (P.everShaken) return fail('shaken');
    const B = P.beaker, add = rinseWater(P.Vf) * RHO_W;
    if (overflow(P, rinseWater(P.Vf))) return fail('overflow');
    B.T = mixT(mixture(P.sp, B.n, B.mw).mass, B.T, add, T_REF);
    B.mw += add;
    const r = pourBeaker(P);
    if (r.ok) P.rinses++;
    return r;
  }
  /** 吸量管吸取 V1 mL 原液放進量瓶；rinsed = 吸量管先用原液潤洗過 */
  function pipette(P, V1, rinsed) {
    if (P.mode !== 'dilute' || P.done) return fail('mode');
    if (P.everShaken) return fail('shaken');
    if (!(V1 > 0)) return fail('novol');
    if (overflow(P, V1)) return fail('overflow');
    const st = P.stock, w1 = wFromC(st.sp, st.c), r1 = rho(st.sp, w1);
    const vw = (!rinsed && P.pip === 0) ? pipetteWater(V1) : 0;
    const Vs = V1 - vw, n = st.c * Vs / 1000;
    P.flask.n += n;
    P.flask.mw += r1 * Vs - n * SPECIES[st.sp].M + vw * RHO_W;
    P.nIn += st.c * V1 / 1000;
    P.pip++; P.pipLoss += vw;
    return { ok: true, n: n, vw: vw };
  }
  /** 加水 mL（20 °C）；eye 是加水當時眼睛的角度 */
  function addWater(P, mL, eye) {
    if (P.done) return fail('done');
    if (!(mL > 0)) return fail('novol');
    if (overflow(P, mL)) return fail('overflow');
    const m = mL * RHO_W;
    P.flask.T = mixT(mixture(P.sp, P.flask.n, P.flask.mw).mass, P.flask.T, m, T_REF);
    P.flask.mw += m;
    if (P.everShaken) { P.afterWater += mL; P.shaken = false; }
    else { P.Tfill = P.flask.T; P.eyeFill = eye || 0; P.appFill = apparent(P, eye); }
    return { ok: true, mL: mL };
  }
  /** 很快地加水，直到液面在刻度線下方 NECK_GAP mm */
  function pourToNeck(P, eye) {
    if (P.done) return fail('done');
    const zT = P.g.zMark - NECK_GAP;
    if (level(P).z >= zT - 0.05) return fail('high');
    // 加水後的溫度也會變，用二分法找加多少
    let lo = 0, hi = P.Vf * 1.2;
    const S = JSON.stringify(P.flask);
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2, f = JSON.parse(S);
      const m = mid * RHO_W, tot = mixture(P.sp, f.n, f.mw).mass;
      const T = mixT(tot, f.T, m, T_REF), v = mixture(P.sp, f.n, f.mw + m).V * volFactor(T) - (P.everShaken ? film(P.Vf) : 0);
      if (P.g.zAt(v * 1000) < zT) lo = mid; else hi = mid;
    }
    return addWater(P, (lo + hi) / 2, eye);
  }
  /** 加過頭：用滴管把多的吸出來，吸到「看起來」對齊刻度線（溶質也一起被吸走） */
  function drawOut(P, eye) {
    if (P.done) return fail('done');
    const app = apparent(P, eye);
    if (app <= 0) return fail('low');
    const v = Vnow(P), dv = Math.min(v, app * Math.PI * P.g.rn * P.g.rn / 1000);
    const f = dv / v;
    P.nDrawn += P.flask.n * f;
    P.flask.n *= 1 - f; P.flask.mw *= 1 - f;
    P.drawnOut = true;
    if (P.everShaken) P.shaken = false;
    return { ok: true, mL: dv };
  }
  /** 蓋上瓶塞、倒轉搖勻 */
  function shake(P) {
    if (P.done) return fail('done');
    if (!(P.flask.n > 0)) return fail('empty');
    if (P.shaken) return fail('again');
    P.everShaken = true; P.shaken = true;
    return { ok: true };
  }
  /** 完成時的分析（必須搖勻過） */
  function result(P) {
    if (!P.everShaken || !P.shaken || !(P.flask.n > 0)) return null;
    const sp = P.sp, mx = mixture(sp, P.flask.n, P.flask.mw), V = mx.V;
    const C = P.flask.n / V * 1000, Cideal = P.nIn / P.Vf * 1000;
    const eLoss = (P.flask.n + P.nDrawn) / P.nIn - 1;
    const eTemp = volFactor(P.Tfill) - 1;
    const Vno = mixture(sp, P.flask.n, P.flask.mw - P.afterWater * RHO_W).V;
    const eAfter = Vno / V - 1;
    const eProc = C / Cideal - 1;
    const eLevel = (1 + eProc) / ((1 + eLoss) * (1 + eTemp) * (1 + eAfter)) - 1;
    const pr = props(sp, mx.w);
    return {
      C: C, Cideal: Cideal, target: P.target, V: V, n: P.flask.n, Tfill: P.Tfill,
      eTotal: C / P.target - 1, eAmount: Cideal / P.target - 1, eProc: eProc,
      eLoss: eLoss, eTemp: eTemp, eAfter: eAfter, eLevel: eLevel,
      w: mx.w, rho: mx.rho, molal: P.flask.n / (P.flask.mw / 1000), x: pr.x, ppm: pr.ppm, ppmCu: pr.ppmCu, gL: C * SPECIES[sp].M,
      massNeeded: P.mode === 'weigh' ? P.target * P.Vf / 1000 * SOLIDS[P.solid].M : null,
      V1Needed: P.mode === 'dilute' ? P.target * P.Vf / P.stock.c : null
    };
  }

  /** 任務事件 'made' 的內容（頁面與任務證明共用）；info: { stock（原液代號或 'last'）, chain（稀釋了幾次）, seq } */
  function madeEvent(P, info) {
    const r = result(P);
    if (!r) return null;
    info = info || {};
    return {
      mode: P.mode, solid: P.mode === 'weigh' ? P.solid : null, stock: P.mode === 'dilute' ? (info.stock || null) : null,
      sp: P.sp, Vf: P.Vf, C: r.C, Cideal: r.Cideal, target: r.target,
      eTotal: r.eTotal, eAmount: r.eAmount, eProc: r.eProc, eLoss: r.eLoss, eTemp: r.eTemp, eAfter: r.eAfter, eLevel: r.eLevel,
      w: r.w, molal: r.molal, ppmCu: r.ppmCu, gL: r.gL, rinses: P.rinses, flaskWet: P.flaskWet, drawnOut: P.drawnOut,
      eyeFill: P.eyeFill, appFill: P.appFill, Tfill: P.Tfill, chain: info.chain || 0, seq: info.seq || 0
    };
  }

  const api = {
    T_REF: T_REF, RHO_W: RHO_W, CP: CP, M_H2O: M_H2O, M_CU: M_CU, DROP: DROP, SQUIRT: SQUIRT, NECK_GAP: NECK_GAP,
    SPECIES: SPECIES, SOLIDS: SOLIDS, STOCKS: STOCKS, FLASKS: FLASKS, EPS_CU: EPS_CU, WATER_T: WATER_T,
    interp: interp, rhoWater: rhoWater, volFactor: volFactor, rho: rho, mixture: mixture, props: props, wFromC: wFromC, wFromMolal: wFromMolal,
    geom: geom, beakerR: beakerR, residue: residue, film: film, dissolveWater: dissolveWater, rinseWater: rinseWater, pipetteWater: pipetteWater,
    transmit: transmit,
    newPrep: newPrep, V20: V20, Vnow: Vnow, level: level, apparent: apparent,
    dissolve: dissolve, cool: cool, transfer: transfer, rinse: rinse, pipette: pipette, addWater: addWater, pourToNeck: pourToNeck,
    drawOut: drawOut, shake: shake, result: result, madeEvent: madeEvent
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SolCore = api;
})(typeof window !== 'undefined' ? window : this);
