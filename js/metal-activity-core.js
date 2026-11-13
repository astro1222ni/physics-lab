/*
 * metal-activity-core.js — 「金屬活性序」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 一支試管：10.0 mL 液體（純水、稀鹽酸或金屬硝酸鹽溶液）＋一片金屬（金屬片 2.0 mmol；鉀、鈉、鈣是 1.0 mmol 的小塊）。
 * 單位：物質的量 mmol、體積 mL、濃度 mol/L（= mmol/mL）、質量 mg、時間 s、電位 V。
 *
 * 熱力學（25 °C 的標準還原電位，見 METALS）：
 *   置換反應  (1/m) M + (1/n) N^n+ → (1/m) M^m+ + (1/n) N      每轉移 1 個電子
 *   與酸反應  (1/m) M + H+ → (1/m) M^m+ + (1/2) H2(g，1 bar)
 *   平衡時 (1/m)·log[M^m+] − (1/n)·log[N^n+] = ΔE° / (RT ln10 / F)，ΔE° = E°(氧化劑) − E°(金屬)；
 *   用二分法解出平衡時轉移的電子數 eEq（不分「會不會反應」兩種情形，錫與鉛這種電位很接近的組合會停在半路）。
 *   平衡常數照配平的方程式寫：log10 K = ne·ΔE° / 0.05916，ne = m、n 的最小公倍數。
 * 與水反應（鉀、鈉、鈣；鎂與熱水）：熱力學上完全反應，eEq = m·n0；生成的 OH- 先中和 H+、再沉澱溶液中的金屬離子，
 *   剩下的決定 pH（Mg(OH)2、Ca(OH)2 由溶度積決定飽和）。
 *
 * 動力學（教學示意，不是文獻值；最後到達的位置由上面的熱力學決定）：
 *   e(t) = eEq·(1 − exp(−Λ(t)))，Λ = ∫λ dt；λ = k(金屬, 反應類型)·exp(−Ea/R·(1/T − 1/298.15))（酸再乘 c/1 M）。
 *   鋁有緻密的氧化鋁保護膜：沒有 Cl- 時 λ 乘 0.0002；有 Cl-（鹽酸、或加了食鹽）時保護膜要一段「誘導期」才破，
 *   λ(t) = λ∞·(1 − exp(−t/τ))。鋅、鐵與冷水、鋁與水的反應因表面氫氧化物或氧化物的保護而忽略。
 * 觀察：每支試管觀察到反應完成 99%（e ≥ 0.99 eEq）或滿 20 分鐘就記錄；轉移的電子 ≥ 0.02 mmol 算「有反應」。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MetalCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const F = 96485.33212, R = 8.314462618, T0 = 298.15;
  const KN = R * T0 * Math.LN10 / F;          // 0.05916 V
  const VM = R * T0 / 101325 * 1000;          // 25 °C、1 atm 的莫耳體積：24.465 mL/mmol
  const V = 10.0;                             // 液體體積 mL
  const N_STRIP = 2.0, N_LUMP = 1.0;          // 金屬的量 mmol
  const T_OBS = 1200;                         // 最長觀察 20 分鐘
  const REACT_E = 0.02;                       // 有反應的門檻：轉移電子 mmol
  const CL_SALT = 0.20;                       // 「一小撮食鹽」的 Cl-（mmol，約 12 mg NaCl）
  const KW = 1.0e-14;

  // 標準還原電位 E°（V，25 °C）：CRC Handbook of Chemistry and Physics「Electrochemical Series」（Vanýsek），
  // 與 OpenStax《Chemistry 2e》附錄 L 一致（銅用 0.337 V，和本站「化學電池與電解」相同）。M：IUPAC 標準原子量（g/mol）。
  // 動力學常數 kd（置換）、ka（1 M 鹽酸）、kw（水）單位 s-¹，25 °C；都是教學示意值。
  const METALS = {
    K: { z: 1, E: -2.931, M: 39.0983, alk: true, kw: 2.0, Ew: 30 },
    Ca: { z: 2, E: -2.868, M: 40.078, alk: true, kw: 0.10, Ew: 30 },
    Na: { z: 1, E: -2.71, M: 22.98977, alk: true, kw: 0.60, Ew: 30 },
    Mg: { z: 2, E: -2.372, M: 24.305, kd: 0.020, ka: 0.050, kw: 2.0e-6, Ew: 75 },
    Al: { z: 3, E: -1.662, M: 26.98154, kd: 0.012, ka: 0.030, oxide: true },
    Zn: { z: 2, E: -0.7618, M: 65.38, kd: 0.010, ka: 0.006 },
    Fe: { z: 2, E: -0.447, M: 55.845, kd: 0.006, ka: 0.0025 },
    Sn: { z: 2, E: -0.1375, M: 118.71, kd: 0.004, ka: 0.0004 },
    Pb: { z: 2, E: -0.1262, M: 207.2, kd: 0.004, ka: 1.5e-5 },
    Cu: { z: 2, E: 0.337, M: 63.546, kd: 0.008, ka: 0.004 },
    Ag: { z: 1, E: 0.7996, M: 107.8682, kd: 0.006, ka: 0.004 },
    // 未知金屬（E° 由 newUnknown 決定；原子量是虛構的）
    X: { z: 2, E: null, M: 59.0, kd: 0.008, ka: 0.004, unk: true },
    Y: { z: 2, E: null, M: 112.0, kd: 0.008, ka: 0.004, unk: true },
    Z: { z: 2, E: null, M: 88.0, kd: 0.008, ka: 0.004, unk: true }
  };
  const KNOWN = ['K', 'Ca', 'Na', 'Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag'];
  const UNK = ['X', 'Y', 'Z'];
  // 可以放進試管的液體：純水、稀鹽酸、金屬離子（硝酸鹽溶液）
  const ION_LIQ = ['Mg', 'Al', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Ag'];
  const EA_DISP = 35, EA_ACID = 50;           // kJ/mol（示意）
  const AL_PASS = 0.0002, AL_TAU_DISP = 90, AL_TAU_ACID = 150;
  // 溶度積（25 °C，CRC Handbook「Solubility Product Constants」）
  const KSP = { MgOH2: 5.61e-12, CaOH2: 5.02e-6, AgCl: 1.77e-10, PbCl2: 1.70e-5 };
  // 未知金屬可能的 E°（彼此至少差 0.25 V，與已知金屬至少差 0.15 V）
  const UNK_POOL = [-1.20, -0.95, -0.60, -0.30, 0.15, 0.55];
  // 電位太接近、課本與實驗都可能排出不同順序的兩對：鈉和鈣（E° 鈣較負，但鈉和水反應得比鈣劇烈）、錫和鉛（K ≈ 2.4）
  const TOL = [['Na', 'Ca'], ['Sn', 'Pb']];

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function lcm(a, b) { return a * b / gcd(a, b); }
  function arr(Ea, Tk) { return Math.exp(-Ea * 1000 / R * (1 / Tk - 1 / T0)); }
  function E0(sym, env) {
    if (sym === 'H') return 0;
    const m = METALS[sym];
    if (!m) return NaN;
    if (m.unk) return env && env.unk && env.unk[sym] != null ? env.unk[sym] : NaN;
    return m.E;
  }
  function tolerant(a, b) { return TOL.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); }); }
  /** 未知金屬的一組 E°（rand：0–1 的亂數函式） */
  function newUnknown(rand) {
    rand = rand || Math.random;
    const pool = UNK_POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    return { X: pool[0], Y: pool[1], Z: pool[2] };
  }
  function liqKind(liq) { return liq === 'H2O' ? 'water' : liq === 'HCl' ? 'acid' : 'ion'; }
  function typeOf(metal, liq) {
    const m = METALS[metal];
    const k = liqKind(liq);
    if (m.alk) return 'water';
    if (k === 'water') return metal === 'Mg' ? 'water' : 'none';
    if (k === 'acid') return 'acid';
    return liq === metal ? 'none' : 'disp';
  }
  /** 一般的 MX_k 溶度積：起始 a（mol/L）金屬離子與 b（mol/L）陰離子，沉澱 s（mol/L）使 (a−s)(b−k s)^k = Ksp */
  function pptSolve(a, b, k, ksp) {
    if (a <= 0 || b <= 0 || a * Math.pow(b, k) <= ksp) return 0;
    let lo = 0, hi = Math.min(a, b / k);
    for (let i = 0; i < 200; i++) {
      const s = (lo + hi) / 2;
      if ((a - s) * Math.pow(b - k * s, k) > ksp) lo = s; else hi = s;
    }
    return (lo + hi) / 2;
  }

  /**
   * 建立一支試管：o = { metal, liquid（'H2O'／'HCl'／金屬符號）, c（mol/L）, T（°C）, salt（加一小撮食鹽）}；env = { unk }
   * 傳回不會再改變的參數（之後用 extent／at 算任一時刻的狀態）。
   */
  function createTube(o, env) {
    const metal = o.metal, liq = o.liquid, kind = liqKind(liq);
    const mm = METALS[metal];
    const Tk = (o.T == null ? 25 : o.T) + 273.15;
    const c = kind === 'water' ? 0 : Math.max(0, o.c);
    const salt = !!o.salt;
    const n0 = mm.alk ? N_LUMP : N_STRIP;
    const type = typeOf(metal, liq);
    const tb = { metal: metal, liquid: liq, kind: kind, c: c, T: Tk - 273.15, Tk: Tk, salt: salt, n0: n0, V: V, type: type,
      m: mm.z, n: 0, A0: kind === 'ion' ? c * V : kind === 'acid' ? c * V : 0, A: 0, ppt0: [], hasCl: kind === 'acid' || salt,
      dE: null, logK: null, ne: null, eMax: 0, eEq: 0, lam: 0, tau: 0, unk: !!mm.unk || (kind === 'ion' && !!METALS[liq].unk) };
    // 起始溶液裡的沉澱（食鹽的 Cl- 與 Ag+、Pb²+）
    tb.A = tb.A0;
    if (kind === 'ion' && salt && (liq === 'Ag' || liq === 'Pb')) {
      const a = c, b = CL_SALT / V;
      const s = liq === 'Ag' ? pptSolve(a, b, 1, KSP.AgCl) : pptSolve(a, b, 2, KSP.PbCl2);
      if (s > 0) { tb.ppt0.push({ kind: liq === 'Ag' ? 'AgCl' : 'PbCl2', mmol: s * V }); tb.A = Math.max(0, (a - s) * V); }
    }
    if (type === 'disp' || type === 'acid') {
      const n = type === 'acid' ? 1 : METALS[liq].z;
      const Eox = type === 'acid' ? 0 : E0(liq, env);
      tb.n = n;
      tb.dE = Eox - E0(metal, env);
      tb.ne = type === 'acid' ? lcm(mm.z, 2) : lcm(mm.z, n);
      tb.logK = tb.ne * tb.dE / KN;
      tb.eMax = Math.min(n * tb.A, mm.z * n0);
      tb.eEq = eqExtent(tb);
      const k = type === 'acid' ? mm.ka * (c / 1) : mm.kd;
      tb.lam = k * arr(type === 'acid' ? EA_ACID : EA_DISP, Tk);
      if (mm.oxide) {
        if (tb.hasCl) tb.tau = (type === 'acid' ? AL_TAU_ACID : AL_TAU_DISP) / arr(type === 'acid' ? EA_ACID : EA_DISP, Tk);
        else tb.lam *= AL_PASS;
      }
    } else if (type === 'water') {
      tb.ne = mm.z;
      tb.dE = null;
      tb.eMax = mm.z * n0;
      tb.eEq = tb.eMax;
      tb.lam = mm.kw * arr(mm.Ew, Tk);
    }
    if (!(tb.eEq > 0)) tb.eEq = 0;
    tb.tRec = recordTime(tb);
    return tb;
  }
  /** 平衡時轉移的電子（mmol）：f(e) = (1/m)log([M]) − (1/n)log([Ox]) − ΔE°/KN 隨 e 單調增加 */
  function eqExtent(tb) {
    const m = tb.m, n = tb.n, A = tb.A, eMax = tb.eMax, g = tb.dE / KN;
    if (!(eMax > 0) || !isFinite(g)) return 0;
    const f = function (e) {
      const ox = A - e / n;
      return Math.log10(e / m / V) / m - (ox > 0 ? Math.log10(ox / V) / n : -Infinity) - g;
    };
    // 金屬先用完（氧化劑有剩）：看 eMax 時是否還沒到平衡
    if (eMax < n * A * (1 - 1e-12)) { if (f(eMax) <= 0) return eMax; }
    else if (f(eMax * (1 - 1e-12)) <= 0) return eMax;
    let lo = 0, hi = eMax;
    for (let i = 0; i < 400; i++) {
      const mid = (lo + hi) / 2;
      if (mid === lo || mid === hi) break;
      if (f(mid) < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  /** Λ(t) = ∫0^t λ dt */
  function Lam(tb, t) {
    if (t <= 0 || !(tb.lam > 0)) return 0;
    if (tb.tau > 0) return tb.lam * (t - tb.tau * (1 - Math.exp(-t / tb.tau)));
    return tb.lam * t;
  }
  function extent(tb, t) { return tb.eEq * (1 - Math.exp(-Lam(tb, t))); }
  /** 反應速率 de/dt（mmol 電子／s） */
  function rate(tb, t) {
    if (!(tb.lam > 0) || tb.eEq <= 0) return 0;
    const l = tb.tau > 0 ? tb.lam * (1 - Math.exp(-Math.max(0, t) / tb.tau)) : tb.lam;
    return tb.eEq * l * Math.exp(-Lam(tb, t));
  }
  /** 觀察結束的時間：完成 99% 或滿 20 分鐘 */
  function recordTime(tb) {
    if (tb.eEq < REACT_E || !(tb.lam > 0)) return T_OBS;
    const target = Math.log(100);
    if (Lam(tb, T_OBS) < target) return T_OBS;
    if (!(tb.tau > 0)) return target / tb.lam;
    let lo = 0, hi = T_OBS;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (Lam(tb, mid) < target) lo = mid; else hi = mid; }
    return hi;
  }

  /** 任一時刻的狀態 */
  function at(tb, t) {
    const e = Math.min(tb.eEq, Math.max(0, extent(tb, t)));
    const mm = METALS[tb.metal];
    const s = { t: t, e: e, nDiss: 0, metalLeft: tb.n0, metalFrac: 1, ions: {}, ox: null, oxFrac: null, dep: 0, depSym: null, depMg: 0,
      dm: 0, h2: 0, pH: null, OH: 0, ppt: tb.ppt0.map(function (p) { return { kind: p.kind, mmol: p.mmol }; }), rate: rate(tb, t) };
    const nDiss = e / mm.z;
    s.nDiss = nDiss;
    s.metalLeft = Math.max(0, tb.n0 - nDiss);
    s.metalFrac = s.metalLeft / tb.n0;
    if (tb.kind === 'ion') s.ions[tb.liquid] = tb.A / V;
    if (tb.type === 'disp') {
      const used = e / tb.n;
      s.ions[tb.liquid] = Math.max(0, tb.A - used) / V;
      s.ions[tb.metal] = nDiss / V;
      s.dep = used; s.depSym = tb.liquid; s.depMg = used * METALS[tb.liquid].M;
      s.dm = s.depMg - nDiss * mm.M;
    } else if (tb.type === 'acid') {
      s.h2 = e / 2 * VM;
      s.ions[tb.metal] = nDiss / V;
      const H = Math.max(tb.A - e, 0) / V;
      s.ions.H = H;
      s.pH = -Math.log10(Math.max(H, 1e-7));
      s.dm = -nDiss * mm.M;
    } else if (tb.type === 'water') {
      s.h2 = e / 2 * VM;
      s.dm = -nDiss * mm.M;
      let oh = e;                                         // mmol OH-
      if (tb.kind === 'acid') { const used = Math.min(oh, tb.A); oh -= used; s.ions.H = (tb.A - used) / V; }
      if (tb.kind === 'ion') {
        const N = tb.liquid, zN = METALS[N].z, have = tb.A;
        const p = Math.min(have, oh / zN);
        oh -= p * zN;
        s.ions[N] = (have - p) / V;
        if (p > 0) s.ppt.push({ kind: N === 'Ag' ? 'Ag2O' : N + 'OH' + zN, mmol: N === 'Ag' ? p / 2 : p });
      }
      // 自己的氫氧化物（Mg(OH)2、Ca(OH)2）由溶度積決定飽和；K、Na 的氫氧化物全溶
      let Mion = nDiss;
      if (tb.metal === 'Mg' || tb.metal === 'Ca') {
        const ksp = tb.metal === 'Mg' ? KSP.MgOH2 : KSP.CaOH2;
        const sp = pptSolve(Mion / V, oh / V, 2, ksp) * V;
        if (sp > 0) { s.ppt.push({ kind: tb.metal + 'OH2', mmol: sp }); Mion -= sp; oh -= 2 * sp; }
      }
      s.ions[tb.metal] = Mion / V;
      s.OH = oh;
      if (tb.kind === 'acid' && s.ions.H > 1e-7) s.pH = -Math.log10(s.ions.H);
      else if (oh / V > 1e-7) s.pH = 14 + Math.log10(oh / V);
      else if (tb.kind === 'water' || tb.kind === 'acid') s.pH = 7;
    } else if (tb.kind === 'water') s.pH = 7;
    if (tb.kind === 'ion' || tb.kind === 'acid') {
      const oxNow = tb.kind === 'acid' ? (s.ions.H != null ? s.ions.H * V : tb.A) : s.ions[tb.liquid] * V;
      s.ox = oxNow;
      s.oxFrac = tb.A0 > 0 ? oxNow / tb.A0 : null;
    }
    return s;
  }
  /** 觀察紀錄（在 tRec 時刻） */
  function observe(tb) {
    const s = at(tb, tb.tRec);
    const reacted = s.e >= REACT_E;
    const r0 = tb.type === 'water' || tb.type === 'acid' ? rate(tb, tb.tau > 0 ? tb.tau * 3 : 0) / 2 * VM * 60 : 0; // 最大產氣速率 mL/min
    const ppt = {};
    s.ppt.forEach(function (p) { ppt[p.kind] = (ppt[p.kind] || 0) + p.mmol; });
    const ions = {};
    Object.keys(s.ions).forEach(function (k) { if (k !== 'H') ions[k] = s.ions[k]; });
    return {
      metal: tb.metal, liquid: tb.liquid, kind: tb.kind, type: tb.type, c: tb.c, T: tb.T, salt: tb.salt, hasCl: tb.hasCl, unk: tb.unk,
      t: tb.tRec, reacted: reacted, e: s.e, eEq: tb.eEq, atEq: tb.eEq > 0 ? Math.abs(tb.eEq - s.e) <= 0.02 * tb.eEq : true,
      n0: tb.n0, metalFrac: s.metalFrac, oxFrac: s.oxFrac, dep: s.dep, depSym: s.depSym, depMg: s.depMg, dm: s.dm, h2: s.h2,
      r0: r0, pH: s.pH, ppt: ppt, ions: ions, dE: tb.dE, logK: tb.logK,
      disp: tb.kind === 'ion' && tb.type === 'disp' ? (reacted ? 'yes' : 'no') : null,
      acid: tb.kind === 'acid' ? (reacted ? 'yes' : 'no') : null,
      water: tb.kind === 'water' ? (reacted ? 'yes' : 'no') : null
    };
  }

  // ======================= 由實驗結果推理活性序 =======================
  /** 紀錄 → 證據清單 { a（較活潑）, b, kind, ids } */
  function evidence(recs) {
    const out = [], seen = {};
    const add = function (a, b, kind, ids) {
      if (a === b) return;
      const key = a + '>' + b + ':' + kind;
      if (seen[key]) { seen[key].ids = seen[key].ids.concat(ids.filter(function (i) { return seen[key].ids.indexOf(i) < 0; })); return; }
      seen[key] = { a: a, b: b, kind: kind, ids: ids.slice() };
      out.push(seen[key]);
    };
    recs.forEach(function (r) {
      if (r.disp === 'yes') add(r.metal, r.liquid, 'disp', [r.id]);
      else if (r.disp === 'no') add(r.liquid, r.metal, 'dispNo', [r.id]);
    });
    ['acid', 'water'].forEach(function (k) {
      const yes = recs.filter(function (r) { return r[k] === 'yes'; }), no = recs.filter(function (r) { return r[k] === 'no'; });
      yes.forEach(function (y) { no.forEach(function (n) { add(y.metal, n.metal, k, [y.id, n.id]); }); });
    });
    // 兩種金屬都和冷水反應：同溫（相差 ≤ 5 °C）產生氫氣的速率差 2 倍以上
    const ww = recs.filter(function (r) { return r.water === 'yes' && r.r0 > 0; });
    for (let i = 0; i < ww.length; i++) for (let j = 0; j < ww.length; j++) {
      const p = ww[i], q = ww[j];
      if (p.metal !== q.metal && Math.abs(p.T - q.T) <= 5 && p.r0 >= 2 * q.r0) add(p.metal, q.metal, 'vigor', [p.id, q.id]);
    }
    return out;
  }
  /** 排序（由最活潑到最不活潑）是否正確、相鄰兩個是否都有實驗證據、與哪些證據矛盾 */
  function judge(order, recs, env) {
    const ev = evidence(recs);
    let ok = order.length >= 2;
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      const a = order[i], b = order[j];
      if (!(E0(a, env) < E0(b, env)) && !tolerant(a, b)) ok = false;
    }
    const pairs = [];
    for (let i = 0; i + 1 < order.length; i++) {
      const a = order[i], b = order[i + 1], tol = tolerant(a, b);
      const list = ev.filter(function (e) { return (e.a === a && e.b === b) || (tol && e.a === b && e.b === a); });
      pairs.push({ a: a, b: b, tol: tol, ev: list });
    }
    const conflicts = ev.filter(function (e) {
      const ia = order.indexOf(e.a), ib = order.indexOf(e.b);
      return ia >= 0 && ib >= 0 && ib < ia && !tolerant(e.a, e.b);
    });
    return { ok: ok, supported: pairs.length > 0 && pairs.every(function (p) { return p.ev.length > 0; }), pairs: pairs, conflicts: conflicts, n: order.length };
  }

  return {
    F: F, R: R, KN: KN, VM: VM, V: V, N_STRIP: N_STRIP, N_LUMP: N_LUMP, T_OBS: T_OBS, REACT_E: REACT_E, CL_SALT: CL_SALT, KSP: KSP,
    METALS: METALS, KNOWN: KNOWN, UNK: UNK, ION_LIQ: ION_LIQ, UNK_POOL: UNK_POOL, TOL: TOL, AL_PASS: AL_PASS,
    E0: E0, tolerant: tolerant, newUnknown: newUnknown, liqKind: liqKind, typeOf: typeOf, arr: arr, lcm: lcm, pptSolve: pptSolve,
    createTube: createTube, eqExtent: eqExtent, extent: extent, rate: rate, recordTime: recordTime, at: at, observe: observe,
    evidence: evidence, judge: judge
  };
});
