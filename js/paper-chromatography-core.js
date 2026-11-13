/*
 * paper-chromatography-core.js — 「紙色層分析」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 濾紙 9 cm × 15 cm 垂直吊在展開槽裡，下緣碰到槽底、浸在展開液中（液面高 zL）。用鉛筆在 z0 畫起始線，三道（A、B、C）各點一個樣品。
 * 座標：z 由濾紙下緣往上量（cm）；h = z − zL 是「液面以上」的高度；d = z − z0 是「離起始線」的距離（量 Rf 用的距離）。
 *
 * 1. 溶劑前緣（毛細作用，Lucas–Washburn）：沒有蒸發時 s² = D·t，D = γ·(r cosθ)/(2η)；
 *    r cosθ 取 0.30 μm（示意值：使 20 °C 的水約 15 分鐘爬 10 cm，與實際濾紙同一量級）。
 *    展開槽沒蓋時紙面會蒸發：d(s²)/dt = D − 2ε·s²（ε ∝ 蒸氣壓，示意），前緣趨近 s∞ = √(D/2ε) 就停住。
 *    每一小步用精確解 u ← u∞ + (u − u∞)e^(−2εΔt)（u = s²），ε = 0 時 u ← u + DΔt。
 * 2. 斑點移動（分配層析）：成分在固定相（紙纖維上的水）與移動相之間分配，k = K·Vs/Vm，Rf = 1/(1 + k)。
 *    斑點的速度 = Rf × 該高度的溶劑流速；溶劑流速 v(h) = D/(2s) − ε·h（蒸發讓越高的地方流量越小）。
 *    沒有蒸發時 Δh = Rf·Δs，所以 d = Rf × 前緣離起始線的距離，正是 Rf 的定義；
 *    有蒸發時前緣停住了、斑點還在慢慢往上走，量到的 Rf 會偏大。
 * 3. 水—乙醇混合展開液：ln k = (1 − φ)·ln k(水) + φ·ln k(乙醇)（線性溶劑強度近似，φ 是乙醇體積分率）。
 *    混合液的黏度、表面張力照 20 °C 的質量百分率表內插（CRC 手冊與 Vázquez 等 1995 的數據取近似值）。
 * 4. 斑點變寬：σ² = σ0² + H·d + 2·Dm·t濕（H = 0.005 cm 是板高，Dm 是染料在紙上的擴散係數，示意值）；
 *    橫向 σx² = σ0² + 0.3·H·d + 2·Dm·t濕。解析度 Rs = |d1 − d2| / (2(σ1 + σ2))（= 2Δd ÷ 兩個斑點寬度和，寬度 = 4σ）。
 * 5. 濃度（光學密度）：每個成分是二維高斯分布，OD = A/(2π σx σz)·exp(…)；起始線泡在液面下時，樣品以 τ = 20 s 溶進展開液。
 * Rf 數值是示意值：排列順序照常見的課堂結果（葉綠素萃取液在石油醚＋丙酮中由上到下是胡蘿蔔素、葉黃素、葉綠素 a、葉綠素 b），
 * 實際的 Rf 會隨濾紙、溫度、展開槽是否飽和而改變。
 */
(function (root) {
  'use strict';
  const PAPER = { H: 15, W: 9, lanes: [1.75, 4.5, 7.25] };
  const RCOS = 0.30e-6;      // 有效孔徑 × cosθ（m），示意值
  const H_PLATE = 0.005;     // 板高 cm
  const DM = 3e-6;           // 染料在濕濾紙上的擴散係數 cm²/s（示意）
  const EVAP = 1e-4;         // 蒸發係數 ε = EVAP × 蒸氣壓（kPa），1/s（示意）
  const TAU_DIS = 20;        // 起始線泡在液面下時，樣品溶進展開液的時間常數 s
  const VIS = 0.04;          // 看得見的光學密度
  const AMT0 = 0.06;         // 每單位成分的量（OD·cm²）：點樣的總量固定，點得越大越淡

  // ---------- 水—乙醇混合液（20 °C，乙醇質量百分率 0, 10, …, 100） ----------
  const WE_ETA = [1.002, 1.538, 2.183, 2.71, 2.91, 2.87, 2.67, 2.37, 2.01, 1.61, 1.20];   // mPa·s（CRC 手冊）
  const WE_GAM = [72.8, 48.0, 38.6, 33.2, 30.2, 28.3, 27.0, 25.9, 24.6, 23.4, 22.4];      // mN/m（近似值）
  const RHO_W = 0.998, RHO_E = 0.789, M_W = 18.015, M_E = 46.07;
  const PV_W = 2.34, PV_E = 5.95;      // 20 °C 蒸氣壓 kPa
  const ETN_W = 1.000, ETN_E = 0.654;  // Reichardt 標準化極性 E_T^N

  /** 展開液（固定成分的三種） */
  const SOLV = {
    salt: { zh: '食鹽水（2% NaCl）', en: 'salt water (2% NaCl)', eta: 1.04, gamma: 73.1, pvap: 2.30, ETN: 1.0 },
    ace: { zh: '丙酮', en: 'acetone', eta: 0.32, gamma: 23.7, pvap: 24.6, ETN: 0.355 },
    pe: { zh: '石油醚＋丙酮（9 : 1）', en: 'petroleum ether + acetone (9 : 1)', eta: 0.32, gamma: 18.8, pvap: 30, ETN: 0.044 }
  };

  /**
   * 成分：Rf 在 w（水）、e（乙醇）、s（食鹽水）、a（丙酮）、p（石油醚＋丙酮）中的值（示意），顏色是濾紙上看到的顏色。
   * 食用色素是水溶性的磺酸鹽，在丙酮、石油醚裡幾乎不溶；葉綠素萃取液的色素不溶於水；原子筆油墨是油溶性染料。
   */
  const COMP = {
    B1: { zh: '亮藍 FCF', en: 'Brilliant Blue FCF', col: '#1f6fd1', rf: { w: 0.90, e: 0.55, s: 0.80, a: 0.06, p: 0.003 } },
    Y5: { zh: '檸檬黃', en: 'tartrazine', col: '#f0cf1c', rf: { w: 0.87, e: 0.35, s: 0.55, a: 0.03, p: 0.003 } },
    Y6: { zh: '日落黃', en: 'sunset yellow', col: '#f0861c', rf: { w: 0.84, e: 0.42, s: 0.45, a: 0.04, p: 0.003 } },
    R40: { zh: '誘惑紅', en: 'Allura red', col: '#d42538', rf: { w: 0.80, e: 0.48, s: 0.33, a: 0.05, p: 0.003 } },
    inkY: { zh: '黃色染料', en: 'yellow dye', col: '#e8c11a', rf: { w: 0.93, e: 0.78, s: 0.85, a: 0.20, p: 0.004 } },
    inkM: { zh: '洋紅色染料', en: 'magenta dye', col: '#c2187a', rf: { w: 0.88, e: 0.14, s: 0.80, a: 0.05, p: 0.004 } },
    inkC: { zh: '青色染料', en: 'cyan dye', col: '#1a8fc9', rf: { w: 0.40, e: 0.57, s: 0.30, a: 0.25, p: 0.004 } },
    inkV: { zh: '紫色染料', en: 'violet dye', col: '#5b2a9e', rf: { w: 0.08, e: 0.75, s: 0.05, a: 0.60, p: 0.02 } },
    car: { zh: 'β-胡蘿蔔素', en: 'β-carotene', col: '#f08a1a', rf: { w: 0.003, e: 0.95, s: 0.003, a: 0.98, p: 0.96 } },
    xan: { zh: '葉黃素', en: 'xanthophyll', col: '#e3cf2a', rf: { w: 0.003, e: 0.93, s: 0.003, a: 0.94, p: 0.70 } },
    chla: { zh: '葉綠素 a', en: 'chlorophyll a', col: '#2e8b6a', rf: { w: 0.003, e: 0.90, s: 0.003, a: 0.91, p: 0.45 } },
    chlb: { zh: '葉綠素 b', en: 'chlorophyll b', col: '#8aab3a', rf: { w: 0.003, e: 0.88, s: 0.003, a: 0.88, p: 0.30 } },
    pen: { zh: '原子筆油墨', en: 'ballpoint ink', col: '#2a3fb0', rf: { w: 0.003, e: 0.80, s: 0.003, a: 0.88, p: 0.04 } }
  };
  const DYES = ['B1', 'Y5', 'Y6', 'R40'];

  /** 樣品：[成分, 相對量] */
  const SAMPLES = {
    none: { zh: '不點樣', en: 'no sample', c: [] },
    ink: { zh: '黑色水性筆', en: 'black water-based marker', c: [['inkY', 0.9], ['inkM', 0.8], ['inkC', 0.9], ['inkV', 0.8]] },
    green: { zh: '綠色食用色素', en: 'green food colouring', c: [['Y5', 1], ['B1', 0.8]] },
    brown: { zh: '咖啡色食用色素', en: 'brown food colouring', c: [['R40', 0.9], ['Y6', 0.9], ['B1', 0.6]] },
    candy: { zh: '彩色糖衣（四種色素）', en: 'candy coating (four dyes)', c: [['R40', 0.8], ['Y6', 0.8], ['Y5', 0.9], ['B1', 0.7]] },
    leaf: { zh: '菠菜葉萃取液', en: 'spinach leaf extract', c: [['car', 0.5], ['xan', 0.6], ['chla', 1.0], ['chlb', 0.6]] },
    B1: { zh: '標準品：亮藍 FCF', en: 'standard: Brilliant Blue FCF', c: [['B1', 1]] },
    Y5: { zh: '標準品：檸檬黃', en: 'standard: tartrazine', c: [['Y5', 1]] },
    Y6: { zh: '標準品：日落黃', en: 'standard: sunset yellow', c: [['Y6', 1]] },
    R40: { zh: '標準品：誘惑紅', en: 'standard: Allura red', c: [['R40', 1]] },
    X: { zh: '未知樣品 X', en: 'unknown sample X', c: [] }
  };

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function interp(tab, w) {   // w：質量百分率 0–100
    const x = clamp(w, 0, 100) / 10, i = Math.min(9, Math.floor(x)), f = x - i;
    return tab[i] + (tab[i + 1] - tab[i]) * f;
  }
  /** 乙醇體積分率 → 質量百分率（不計混合時的體積收縮） */
  function massPct(phi) {
    const me = phi * RHO_E, mw = (1 - phi) * RHO_W;
    return me + mw > 0 ? 100 * me / (me + mw) : 0;
  }
  /** 展開液性質：key = 'mix'（水—乙醇，phi = 乙醇體積分率 0–1）、'salt'、'ace'、'pe' */
  function solvent(key, phi) {
    let o;
    if (key === 'mix') {
      const p = clamp(phi || 0, 0, 1), w = massPct(p);
      const ne = (w / 100) / M_E, nw = (1 - w / 100) / M_W, xe = ne / (ne + nw);
      o = { key: key, phi: p, w: w, eta: interp(WE_ETA, w), gamma: interp(WE_GAM, w), pvap: (1 - xe) * PV_W + xe * PV_E, ETN: (1 - p) * ETN_W + p * ETN_E };
    } else {
      const s = SOLV[key];
      o = { key: key, phi: 0, w: 0, eta: s.eta, gamma: s.gamma, pvap: s.pvap, ETN: s.ETN };
    }
    // D = γ·(r cosθ)/(2η)：γ（mN/m）、η（mPa·s）→ m²/s → cm²/s
    o.D = (o.gamma * 1e-3) * RCOS / (2 * o.eta * 1e-3) * 1e4;
    o.eps = EVAP * o.pvap;
    return o;
  }
  /** 沒蓋時前緣最後停住的高度（液面以上，cm） */
  function sInf(sv) { return Math.sqrt(sv.D / (2 * sv.eps)); }
  /** 前緣高度 s(t)（液面以上），lid = true 沒有蒸發 */
  function frontAt(sv, t, lid) {
    if (lid) return Math.sqrt(sv.D * t);
    return Math.sqrt(sv.D / (2 * sv.eps) * (1 - Math.exp(-2 * sv.eps * t)));
  }
  /** 有蓋時前緣爬到 s 需要的時間 */
  function timeTo(sv, s) { return s * s / sv.D; }
  /** 水—乙醇混合液中前緣最慢（D 最小）的乙醇體積分率 */
  function phiSlowest() {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 10000; i++) { const p = i / 10000, d = solvent('mix', p).D; if (d < bd) { bd = d; best = p; } }
    return best;
  }

  /** 某成分在某展開液中的 Rf */
  function rf(id, key, phi) {
    const r = COMP[id].rf;
    if (key === 'mix') {
      const k = function (x) { const v = clamp(x, 0.003, 0.995); return (1 - v) / v; };
      const p = clamp(phi || 0, 0, 1);
      const lk = (1 - p) * Math.log(k(r.w)) + p * Math.log(k(r.e));
      return 1 / (1 + Math.exp(lk));
    }
    return r[{ salt: 's', ace: 'a', pe: 'p' }[key]];
  }
  /** Rf → 分配比 k = (1 − Rf)/Rf */
  function kOf(R) { return (1 - R) / R; }

  /** 由種子產生未知樣品 X（四種食用色素中選 2 或 3 種） */
  function makeUnknown(seed) {
    let s = (seed >>> 0) || 1;
    const rnd = function () { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return ((s >>> 8) & 0xffff) / 65536; };
    const n = rnd() < 0.5 ? 2 : 3, pool = DYES.slice(), out = [];
    while (out.length < n) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return DYES.filter(function (d) { return out.indexOf(d) >= 0; });
  }
  function sampleComps(key, X) {
    if (key === 'X') return (X || []).map(function (id) { return [id, 0.9]; });
    return SAMPLES[key] ? SAMPLES[key].c : [];
  }

  /**
   * 建立一次展開：o = { lanes: [樣品×3], spot（點樣直徑 mm）, z0（起始線 cm）, zL（液面 cm）, pen（起始線用原子筆）,
   *                     solvent: 'mix'|'salt'|'ace'|'pe', phi（乙醇體積分率）, lid, X（未知樣品的成分） }
   */
  function createRun(o) {
    const sv = solvent(o.solvent, o.phi);
    const z0 = o.z0, zL = o.zL, h0 = z0 - zL;
    const sig0 = (o.spot / 10) / 4;              // 直徑 = 4σ（mm → cm）
    const amt = AMT0;                            // 樣品總量固定：點得越大，斑點越淡、越寬
    const run = {
      o: Object.assign({}, o), sv: sv, t: 0, u: 0, sig0: sig0,
      submerged: h0 <= 0, frac: 1, ranOff: false, tRanOff: null,
      lidOpenAll: !o.lid, lidClosedAll: !!o.lid, tCross: h0 <= 0 ? 0 : null,
      lanes: [], pen: null
    };
    (o.lanes || []).forEach(function (key, i) {
      run.lanes.push({ key: key, x: PAPER.lanes[i], comps: sampleComps(key, o.X).map(function (c) {
        return { id: c[0], amt: c[1] * amt, rf: rf(c[0], o.solvent, o.phi), h: h0, h0: h0 };
      }) });
    });
    if (o.pen) run.pen = { id: 'pen', amt: 0.6 * AMT0 / 0.3, rf: rf('pen', o.solvent, o.phi), h: h0, h0: h0, sig0: 0.025 };   // 原子筆線寬約 1 mm
    return run;
  }
  function topS(run) { return PAPER.H - run.o.zL; }
  function frontS(run) { return Math.sqrt(run.u); }
  /** 前進 dt 秒（模擬時間）；lid 可在展開中途改變 */
  function step(run, dt, lid) {
    if (lid != null && !!lid !== !!run.o.lid) {
      run.o.lid = !!lid;
      if (lid) run.lidOpenAll = false; else run.lidClosedAll = false;
    }
    const sv = run.sv, eps = run.o.lid ? 0 : sv.eps;
    const n = Math.max(1, Math.ceil(dt / 0.5)), h = dt / n;
    const all = [];
    run.lanes.forEach(function (L) { L.comps.forEach(function (c) { all.push(c); }); });
    if (run.pen) all.push(run.pen);
    for (let k = 0; k < n; k++) {
      const s0 = Math.sqrt(run.u);
      if (eps > 0) { const ui = sv.D / (2 * eps); run.u = ui + (run.u - ui) * Math.exp(-2 * eps * h); }
      else run.u += sv.D * h;
      const s1 = Math.sqrt(run.u), ds = s1 - s0, sm = 0.5 * (s0 + s1);
      for (let j = 0; j < all.length; j++) {
        const c = all[j];
        if (sm <= c.h) continue;                       // 溶劑還沒到
        let dh = c.rf * (ds + eps * (sm - c.h) * h);   // v(h) = ds/dt + ε(s − h)
        if (c.h + dh > s1) dh = Math.max(0, s1 - c.h);  // 不會跑到前緣前面
        c.h += dh;
      }
      run.t += h;
      if (run.tCross == null && s1 >= run.o.z0 - run.o.zL) run.tCross = run.t;
      if (!run.ranOff && s1 >= topS(run)) { run.ranOff = true; run.tRanOff = run.t; }
    }
    if (run.submerged) run.frac *= Math.exp(-dt / TAU_DIS);
    return run;
  }
  /** 斑點的寬度（d：移動距離，tw：濕了多久） */
  function sigmas(sig0, d, tw) {
    const dif = 2 * DM * Math.max(0, tw);
    return { sz: Math.sqrt(sig0 * sig0 + H_PLATE * Math.max(0, d) + dif), sx: Math.sqrt(sig0 * sig0 + 0.3 * H_PLATE * Math.max(0, d) + dif) };
  }
  /** 目前的樣子：前緣、每個斑點的位置（z 由紙下緣量）、寬度、峰值光學密度 */
  function snapshot(run, sig0Override) {
    const o = run.o, top = PAPER.H, sv = Math.sqrt(run.u);
    const zF = Math.min(top, o.zL + sv);
    const tw = run.tCross == null ? 0 : run.t - run.tCross;
    const sig0 = sig0Override != null ? sig0Override : run.sig0;
    const spot = function (c, x) {
      const z = Math.min(top - 0.08, o.zL + c.h), d = c.h - c.h0;
      const g = sigmas(c.sig0 || sig0, d, tw);
      const amt = c.amt * run.frac;
      return { id: c.id, x: x, z: z, d: z - o.z0, rf: c.rf, sz: g.sz, sx: g.sx, amt: amt, od: amt / (2 * Math.PI * g.sx * g.sz) };
    };
    const lanes = run.lanes.map(function (L) { return { key: L.key, x: L.x, spots: L.comps.map(function (c) { return spot(c, L.x); }) }; });
    let pen = null;
    if (run.pen) { pen = spot(run.pen, null); pen.od = pen.amt / (Math.sqrt(2 * Math.PI) * pen.sz); }
    return { t: run.t, s: Math.min(sv, top - o.zL), sVirt: sv, zF: zF, dF: zF - o.z0, dFv: o.zL + sv - o.z0, ranOff: run.ranOff,
      submerged: run.submerged, frac: run.frac, z0: o.z0, zL: o.zL, lanes: lanes, pen: pen };
  }
  /** 某道中央、高度 z 的光學密度（各成分加總）與各成分的分量 */
  function odAt(snap, lane, z) {
    const L = snap.lanes[lane];
    let tot = 0;
    const parts = [];
    const add = function (sp, v) { tot += v; parts.push([sp.id, v]); };
    if (L) L.spots.forEach(function (sp) { const q = (z - sp.z) / sp.sz; if (q * q < 60) add(sp, sp.od * Math.exp(-0.5 * q * q)); });
    if (snap.pen) { const q = (z - snap.pen.z) / snap.pen.sz; if (q * q < 60) add(snap.pen, snap.pen.od * Math.exp(-0.5 * q * q)); }
    return { od: tot, parts: parts };
  }
  /** 沿某道的濃度分布（z 由 0 到紙頂，間隔 dz） */
  function profile(snap, lane, dz) {
    const step = dz || 0.01, out = [];
    for (let z = 0; z <= PAPER.H + 1e-9; z += step) out.push([z, odAt(snap, lane, z).od]);
    return out;
  }
  /** 看得出來的斑點（濃度分布的極大值，突出量 ≥ 10%、OD ≥ VIS） */
  function peaks(snap, lane) {
    const p = profile(snap, lane, 0.01), out = [];
    for (let i = 1; i < p.length - 1; i++) {
      if (p[i][1] < VIS || !(p[i][1] >= p[i - 1][1] && p[i][1] > p[i + 1][1])) continue;
      // 往兩邊找比它高的點之前的最低值
      let lo1 = p[i][1], lo2 = p[i][1], j;
      for (j = i - 1; j >= 0 && p[j][1] <= p[i][1]; j--) lo1 = Math.min(lo1, p[j][1]);
      if (j < 0) lo1 = Math.min(lo1, 0);
      for (j = i + 1; j < p.length && p[j][1] <= p[i][1]; j++) lo2 = Math.min(lo2, p[j][1]);
      if (j >= p.length) lo2 = Math.min(lo2, 0);
      if (Math.max(lo1, lo2) <= 0.9 * p[i][1]) out.push({ z: p[i][0], od: p[i][1] });
    }
    return out;
  }
  /** 從 z 往上或往下爬到最近的濃度極大值（量斑點中心）；看不見回傳 null */
  function measureAt(snap, lane, z) {
    const dz = 0.005;
    let zz = clamp(z, 0, PAPER.H), v = odAt(snap, lane, zz).od;
    for (let k = 0; k < 4000; k++) {
      const up = odAt(snap, lane, zz + dz).od, dn = odAt(snap, lane, zz - dz).od;
      if (up > v && up >= dn) { zz += dz; v = up; } else if (dn > v) { zz -= dz; v = dn; } else break;
    }
    if (v < VIS) return null;
    const a = odAt(snap, lane, zz);
    let dom = null, dv = -1;
    a.parts.forEach(function (q) { if (q[1] > dv) { dv = q[1]; dom = q[0]; } });
    return { z: zz, od: v, dom: dom, purity: dv / v, parts: a.parts };
  }
  /** 某道相鄰成分的解析度（只算看得見的成分，依位置排序） */
  function pairs(snap, lane) {
    const s = snap.lanes[lane].spots.filter(function (q) { return q.od >= VIS; }).slice().sort(function (a, b) { return a.z - b.z; });
    const out = [];
    for (let i = 1; i < s.length; i++) out.push({ a: s[i - 1].id, b: s[i].id, Rs: Math.abs(s[i].z - s[i - 1].z) / (2 * (s[i].sz + s[i - 1].sz)) });
    return { n: s.length, nAll: snap.lanes[lane].spots.length, pairs: out, minRs: out.length ? Math.min.apply(null, out.map(function (q) { return q.Rs; })) : null };
  }
  /** Rf 量測（d 與 dF 量到 0.05 cm） */
  function roundRuler(x) { return Math.round(x * 20) / 20; }

  const API = {
    PAPER: PAPER, RCOS: RCOS, H_PLATE: H_PLATE, DM: DM, EVAP: EVAP, TAU_DIS: TAU_DIS, VIS: VIS, AMT0: AMT0,
    WE_ETA: WE_ETA, WE_GAM: WE_GAM, SOLV: SOLV, COMP: COMP, DYES: DYES, SAMPLES: SAMPLES,
    massPct: massPct, solvent: solvent, sInf: sInf, frontAt: frontAt, timeTo: timeTo, phiSlowest: phiSlowest,
    rf: rf, kOf: kOf, makeUnknown: makeUnknown, sampleComps: sampleComps,
    createRun: createRun, step: step, topS: topS, frontS: frontS, sigmas: sigmas, snapshot: snapshot,
    odAt: odAt, profile: profile, peaks: peaks, measureAt: measureAt, pairs: pairs, roundRuler: roundRuler
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.PaperChromCore = API;
})(typeof window !== 'undefined' ? window : this);
