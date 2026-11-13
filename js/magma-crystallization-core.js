/*
 * 岩漿冷卻：晶體大小與鮑文反應序列（magma-crystallization）物理核心：不碰 DOM，Node 與瀏覽器共用。
 *
 * 一、冷卻（熱傳導）
 *   岩體是厚 2a 的板狀體（岩脈、岩床、熔岩流），一開始整塊是液相線溫度 T0，圍岩溫度 Tr = Ts + g·z
 *   （地表 Ts = 15 °C、地溫梯度 g = 25 °C/km）。岩體與圍岩的熱擴散率都是 κ = 1×10⁻⁶ m²/s，
 *   離中心 x 處的溫度是 Jaeger 的解析解（不計潛熱）：
 *     T(x, t) = Tr + (T0 − Tr)/2 · [ erf((a − x)/(2√(κt))) + erf((a + x)/(2√(κt))) ]
 *   特徵冷卻時間 τ = a²/κ：岩體厚 10 倍，冷卻時間長 100 倍。
 *
 * 二、結晶（成核與成長，JMAK 模型）
 *   過冷度 ΔT = TL − T。成核速率 I（每立方公尺每秒新長出幾顆晶核）與成長速率 G（晶體半徑每秒長多少）
 *   都隨過冷度變大、也都被熔體的黏度拖慢（原子要移動才能排進晶格）：
 *     G = G0 · μ(T) · (ΔT / 100 K)          I = I0 · μ(T) · (ΔT / 100 K)ⁿ
 *     μ(T) = (100 Pa·s / η(T))^ξ           （相對於 100 Pa·s 的「原子移動能力」）
 *   n = 4 > 1：成核比成長更依賴過冷度 → 冷得快、過冷度大 → 晶核多、每顆小。
 *   黏度用 VFT 式 log₁₀η = A + B/(T − C)（A = −4.55，Giordano et al. 2008 的通用值），
 *   B、C 由「液相線溫度的黏度」與「玻璃轉移溫度 Tg（η = 10¹² Pa·s）」兩點決定。溫度降到 Tg 以下，
 *   原子動不了，還沒結晶的熔體就凍成玻璃。
 *   結晶量用 Johnson–Mehl–Avrami–Kolmogorov：擴展體積 Xe = Σ I·dτ · (4π/3)·R(τ, t)³，
 *   實際結晶比例 X = 1 − e^(−Xe)；真正長出來的晶體數 N = ∫ I·(1 − X) dt；晶體大小 L = (X / N)^(1/3)。
 *   參數 G0、I0、n、ξ 是示意值，校準到教科書的典型晶體大小（花崗岩、輝長岩數毫米到一兩公分，
 *   熔岩流十分之一毫米左右，枕狀熔岩的外殼與黑曜岩是玻璃）。趨勢可靠，單一數字只是數量級。
 *
 * 三、兩階段冷卻（斑狀組織）
 *   岩漿先在深處的岩漿庫以很慢的速率 q1 冷卻，長出比例 φ1 的大晶體（斑晶），然後噴出或侵入淺處，
 *   在新的岩體裡照第一節的冷卻繼續結晶：斑晶繼續長，剩下的熔體快速長出細小的石基（或凍成玻璃）。
 *
 * 四、斜長石的結晶（鮑文反應序列的連續系列）
 *   鈣長石 An（CaAl₂Si₂O₈，1553 °C）與鈉長石 Ab（NaAlSi₃O₈，1118 °C）在固態與液態都完全互溶。
 *   理想溶液：每個成分在固相與液相的莫耳分率滿足 ln(x_s / x_l) = (ΔH/R)(1/T − 1/Tm)，
 *   ΔH_An = 121 kJ/mol（Bowen 1913 由實驗相圖推得）、ΔH_Ab = 54 kJ/mol（擬合 Bowen 1913 的相圖）。
 *   這是一大氣壓、無水的實驗；天然岩漿含水，整個環會往下移數百度，形狀差不多（Yoder et al. 1957）。
 *   平衡結晶：晶體與熔體一直反應，用槓桿定則算比例；分離結晶：長出的晶體不再和熔體反應（被包起來或沉到底），
 *   熔體成分沿液相線一直變得更富鈉 → 晶體由內而外鈣多鈉少，形成環帶。
 *   質量守恆：d(F·x_l) = x_s dF → dF/F = dx_l / (x_s − x_l)，F 是剩下的熔體比例。
 */
(function (root) {
  'use strict';

  const K0 = 273.15;
  const KAPPA = 1e-6;              // 熱擴散率（m²/s）
  const TS = 15, GEO = 25;         // 地表溫度（°C）、地溫梯度（°C/km）
  const YEAR = 3.15576e7;          // 一年（s）
  const ETA_A = -4.55;             // VFT 的 A（Giordano et al. 2008）
  const KIN = { G0: 1.6e-8, I0: 4e9, n: 4, xi: 0.65 };  // 動力學參數（示意值）
  const Q1 = 3e-10;                // 岩漿庫的冷卻速率（°C/s，約每千年 10 °C）

  /** 三種岩漿（液相線溫度、液相線的黏度、玻璃轉移溫度都是約略值） */
  const MAGMAS = {
    basalt:   { zh: '玄武岩質', en: 'Basaltic', SiO2: 50, TL: 1200, logEtaL: 2.0, Tg: 650,
      rock: { coarse: ['輝長岩', 'gabbro'], fine: ['玄武岩', 'basalt'], glass: ['玄武岩質玻璃', 'basaltic glass'], peg: ['偉晶輝長岩', 'gabbro pegmatite'] } },
    andesite: { zh: '安山岩質', en: 'Andesitic', SiO2: 60, TL: 1100, logEtaL: 3.5, Tg: 680,
      rock: { coarse: ['閃長岩', 'diorite'], fine: ['安山岩', 'andesite'], glass: ['安山岩質玻璃', 'andesitic glass'], peg: ['偉晶閃長岩', 'diorite pegmatite'] } },
    rhyolite: { zh: '流紋岩質', en: 'Rhyolitic', SiO2: 72, TL: 900, logEtaL: 7.0, Tg: 700,
      rock: { coarse: ['花崗岩', 'granite'], fine: ['流紋岩', 'rhyolite'], glass: ['黑曜岩', 'obsidian'], peg: ['偉晶花崗岩', 'granite pegmatite'] } }
  };
  (function () {
    for (const k in MAGMAS) {
      const m = MAGMAS[k];
      const u = m.logEtaL - ETA_A, v = 12 - ETA_A, TL = m.TL + K0, Tg = m.Tg + K0;
      m.C = (u * TL - v * Tg) / (u - v);
      m.B = u * (TL - m.C);
      m.key = k;
    }
  })();

  /** 實際的岩石（岩體半厚 a、深度 z、取樣位置 x/a、斑晶比例 phen） */
  const PRESETS = [
    { id: 'penghu', zh: '澎湖玄武岩熔岩流', en: 'Penghu basalt flow', type: 'basalt', a: 4, z: 0, xr: 0, phen: 0 },
    { id: 'pillow', zh: '枕狀熔岩的外殼', en: 'Pillow lava rim', type: 'basalt', a: 0.4, z: 0, xr: 0.95, phen: 0 },
    { id: 'dike', zh: '輝綠岩岩脈', en: 'Dolerite dike', type: 'basalt', a: 15, z: 2, xr: 0, phen: 0 },
    { id: 'gabbro', zh: '輝長岩體', en: 'Gabbro pluton', type: 'basalt', a: 1000, z: 10, xr: 0, phen: 0 },
    { id: 'tatun', zh: '大屯火山的安山岩', en: 'Tatun andesite', type: 'andesite', a: 5, z: 0, xr: 0, phen: 0.25 },
    { id: 'diorite', zh: '閃長岩體', en: 'Diorite pluton', type: 'andesite', a: 800, z: 8, xr: 0, phen: 0 },
    { id: 'granite', zh: '花崗岩體', en: 'Granite pluton', type: 'rhyolite', a: 2000, z: 8, xr: 0, phen: 0 },
    { id: 'obsidian', zh: '黑曜岩', en: 'Obsidian', type: 'rhyolite', a: 10, z: 0, xr: 0, phen: 0 }
  ];

  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }

  function magma(type) { return MAGMAS[type] || MAGMAS.basalt; }
  /** 黏度的 log₁₀（Pa·s） */
  function logEta(type, Tc) { const m = magma(type), T = Tc + K0; return T <= m.C + 1 ? 99 : ETA_A + m.B / (T - m.C); }
  function hostT(z) { return TS + GEO * z; }
  /** 板狀體裡離中心 x（m）處、時間 t（s）的溫度 */
  function slabT(T0, Tr, a, x, t) {
    if (t <= 0) return Math.abs(x) < a ? T0 : (Math.abs(x) === a ? (T0 + Tr) / 2 : Tr);
    const s = 2 * Math.sqrt(KAPPA * t);
    return Tr + (T0 - Tr) / 2 * (erf((a - x) / s) + erf((a + x) / s));
  }
  function mobility(type, Tc) { return Math.pow(10, (2 - logEta(type, Tc)) * KIN.xi); }
  /** 成長速率 G（m/s）與成核速率 I（m⁻³ s⁻¹） */
  function rates(type, Tc) {
    const m = magma(type), dT = m.TL - Tc;
    if (dT <= 0) return { G: 0, I: 0, dT: dT };
    const mu = mobility(type, Tc), u = dT / 100;
    return { G: KIN.G0 * mu * u, I: KIN.I0 * mu * Math.pow(u, KIN.n), dT: dT };
  }

  /** 冷卻與結晶。opt：{ type, a（m）, z（km）, xr（0 中心 – 1 接觸面）, phen（0–0.4） } */
  function cool(opt) {
    const type = opt.type || 'basalt', m = magma(type);
    const a = Math.max(0.005, +opt.a || 1), z = Math.max(0, +opt.z || 0);
    const xr = Math.min(1, Math.max(0, +opt.xr || 0)), phen = Math.min(0.4, Math.max(0, +opt.phen || 0));
    const Tr = hostT(z), x = xr * a;
    // JMAK 的狀態：兩群晶體（斑晶 p、之後的 g）各自的擴展體積矩
    const S = { p: [0, 0, 0, 0], g: [0, 0, 0, 0] };   // [S0, S1, S2, Xe]
    let N = 0, X = 0, Np = 0, Xp = 0;
    function step(Tc, dt, grp) {
      const r = rates(type, Tc);
      const s = S[grp];
      s[0] += r.I * dt;
      N += r.I * (1 - X) * dt;
      if (grp === 'p') Np += r.I * (1 - X) * dt;
      const dR = r.G * dt;
      for (const k of ['p', 'g']) {
        const q = S[k];
        if (!q[0]) continue;
        const dXe = 4 * Math.PI * (q[2] * dR + q[1] * dR * dR + q[0] * dR * dR * dR / 3);
        q[3] += dXe;
        if (k === 'p') Xp += (1 - X) * dXe;
        q[2] += 2 * q[1] * dR + q[0] * dR * dR;
        q[1] += q[0] * dR;
      }
      X = 1 - Math.exp(-(S.p[3] + S.g[3]));
      return r;
    }
    const hist = [];       // 第二階段（在岩體裡）的歷程
    let t1 = 0, T1 = m.TL; // 第一階段花的時間、結束時的溫度
    if (phen > 0) {
      let T = m.TL, t = 0, dTs = 0.05;
      const save = () => JSON.stringify([S, N, X, Np, Xp]);
      const load = j => { const v = JSON.parse(j); S.p = v[0].p; S.g = v[0].g; N = v[1]; X = v[2]; Np = v[3]; Xp = v[4]; };
      while (X < phen - 0.002 && T > m.Tg + 1) {
        const snap = save();
        step(T - dTs / 2, dTs / Q1, 'p');
        if (X > phen + 0.002 && dTs > 1e-7) { load(snap); dTs /= 2; continue; }
        T -= dTs; t += dTs / Q1;
      }
      t1 = t; T1 = T;
    }
    const Xp1 = X;
    const tau = a * a / KAPPA;
    const steps = 5000, t0 = 1e-7 * tau, f = Math.pow(1e11, 1 / steps);
    let t = t0, end = 'time', tEnd = null, tHalf = null, THalf = null;
    const X0 = X;
    hist.push({ t: 0, T: slabT(T1, Tr, a, x, 0), X: X, N: N });
    let lastLog = -99;
    for (let i = 0; i < steps; i++) {
      const tn = t * f, dt = tn - (i === 0 ? 0 : t);
      const T = slabT(T1, Tr, a, x, i === 0 ? tn / 2 : Math.sqrt(t * tn));
      if (T < m.Tg) { end = 'glass'; tEnd = t; break; }
      step(T, dt, phen > 0 ? 'g' : 'p');
      t = tn;
      if (tHalf === null && X >= X0 + (1 - X0) * 0.5) { tHalf = t; THalf = T; }
      const lg = Math.log10(t);
      if (lg - lastLog > 0.04) { hist.push({ t: t, T: T, X: X, N: N }); lastLog = lg; }
      if (X > 0.999) { end = 'solid'; tEnd = t; break; }
    }
    if (tEnd === null) tEnd = t;
    hist.push({ t: tEnd, T: slabT(T1, Tr, a, x, tEnd), X: X, N: N });
    // 晶體大小
    let Lp = 0, Lg = 0, Ng = N - Np, Xg = X;
    if (phen > 0) { Xp = Math.min(Xp, X); Xg = X - Xp; Lp = Np > 0 ? Math.cbrt(Xp / Np) : 0; } else Xp = 0;
    Lg = Ng > 0 && Xg > 0 ? Math.cbrt(Xg / Ng) : 0;
    const L = N > 0 && X > 0 ? Math.cbrt(X / N) : 0;
    const glass = 1 - X;
    const dT50 = THalf === null ? null : m.TL - THalf;
    const q = tHalf === null ? null : (T1 - THalf) / tHalf;   // 從開始到結晶一半的平均冷卻速率（°C/s）
    // 組織
    const Lgm = (phen > 0 ? Lg : L) * 1000;
    let tex;
    if (phen > 0 && Xp >= 0.02 && Lp * 1000 >= 5 * Math.max(Lgm, 1e-4)) tex = glass >= 0.5 ? 'porphyry-glass' : 'porphyritic';
    else if (glass >= 0.5) tex = 'glassy';
    else if (L * 1000 >= 30) tex = 'pegmatitic';
    else if (L * 1000 >= 1) tex = 'phaneritic';
    else tex = 'aphanitic';
    const rk = m.rock;
    const rock = tex === 'glassy' ? rk.glass : tex === 'pegmatitic' ? rk.peg : tex === 'phaneritic' ? rk.coarse : rk.fine;
    return {
      type: type, a: a, z: z, xr: xr, phen: phen, Tr: Tr, T0: T1, TL: m.TL, Tg: m.Tg, tau: tau,
      t1: t1, Xp1: Xp1, X: X, glass: glass, N: N, Np: Np, Ng: Ng,
      L: L * 1000, Lp: Lp * 1000, Lg: Lgm, Xp: Xp,
      end: end, tEnd: tEnd, tHalf: tHalf, dT50: dT50, q: q,
      tex: tex, rock: rock, hist: hist
    };
  }

  /** 歷程內插：時間 t 時的 T、X、N（第二階段） */
  function at(res, t) {
    const h = res.hist;
    if (t <= h[0].t) return h[0];
    for (let i = 1; i < h.length; i++) {
      if (h[i].t >= t) {
        const A = h[i - 1], B = h[i];
        const w = A.t > 0 ? Math.log(t / A.t) / Math.log(B.t / A.t) : (t / B.t);
        const k = Math.min(1, Math.max(0, w));
        return { t: t, T: A.T + (B.T - A.T) * k, X: A.X + (B.X - A.X) * k, N: A.N + (B.N - A.N) * k };
      }
    }
    return h[h.length - 1];
  }

  /* ───────── 斜長石 ───────── */
  const R = 8.314;
  const PLAG = { TAn: 1553, TAb: 1118, HAn: 121000, HAb: 54000 };
  /** 溫度 T（°C）時的液相與固相成分（An 莫耳分率），T 不在兩者之間時傳回 null */
  function loop(Tc) {
    if (Tc >= PLAG.TAn) return { xl: 1, xs: 1 };
    if (Tc <= PLAG.TAb) return { xl: 0, xs: 0 };
    const T = Tc + K0;
    const kA = Math.exp(PLAG.HAn / R * (1 / T - 1 / (PLAG.TAn + K0)));
    const kB = Math.exp(PLAG.HAb / R * (1 / T - 1 / (PLAG.TAb + K0)));
    const xl = (1 - kB) / (kA - kB);
    return { xl: xl, xs: kA * xl };
  }
  function bisect(f, lo, hi) {
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  /** 成分 x（An 分率）的液相線溫度（開始結晶）與固相線溫度（完全凝固） */
  function liquidus(x) { if (x >= 1) return PLAG.TAn; if (x <= 0) return PLAG.TAb; return bisect(T => x - loop(T).xl, PLAG.TAb, PLAG.TAn); }
  function solidus(x) { if (x >= 1) return PLAG.TAn; if (x <= 0) return PLAG.TAb; return bisect(T => x - loop(T).xs, PLAG.TAb, PLAG.TAn); }
  /** 平衡結晶：成分 x0 在溫度 T */
  function equilibrium(x0, Tc) {
    const TLq = liquidus(x0), TSo = solidus(x0);
    if (Tc >= TLq) return { state: 'liquid', xl: x0, xs: null, fs: 0, TL: TLq, TS: TSo };
    if (Tc <= TSo) return { state: 'solid', xl: null, xs: x0, fs: 1, TL: TLq, TS: TSo };
    const c = loop(Tc);
    return { state: 'two', xl: c.xl, xs: c.xs, fs: (x0 - c.xl) / (c.xs - c.xl), TL: TLq, TS: TSo };
  }
  /**
   * 分離結晶：從液相線一路降到 T。傳回剩下的熔體比例 F、熔體成分、最外層（剛長出的）晶體成分、
   * 晶體平均成分，以及環帶 zones = [{ f: 到這一層為止的晶體比例, x: 這一層的成分 }]。
   */
  function fractional(x0, Tc) {
    const TLq = liquidus(x0);
    if (Tc >= TLq) return { F: 1, xl: x0, xs: null, mean: null, zones: [], TL: TLq };
    const lo = Math.max(Tc, PLAG.TAb + 1e-6);
    const n = 600;
    let F = 1, xl = x0, lnF = 0;
    const zones = [];
    let Tp = TLq, xs = loop(TLq).xs;
    zones.push({ f: 0, x: xs });
    for (let i = 1; i <= n; i++) {
      const T = TLq - (TLq - lo) * i / n;
      const c = loop(T);
      const xsm = (xs + c.xs) / 2, xlm = (xl + c.xl) / 2;
      if (xsm - xlm > 1e-12) lnF += (c.xl - xl) / (xsm - xlm);
      xl = c.xl; xs = c.xs; Tp = T;
      F = Math.exp(lnF);
      zones.push({ f: 1 - F, x: xs });
    }
    if (Tc <= PLAG.TAb) { F = 0; zones.push({ f: 1, x: 0 }); }
    const fs = 1 - F;
    const mean = fs > 0 ? (x0 - F * xl) / fs : null;
    return { F: F, xl: xl, xs: xs, mean: mean, zones: zones, TL: TLq, T: Tp };
  }

  /** 鮑文反應序列（溫度是天然含水岩漿的大約範圍，隨成分、壓力、含水量而變） */
  const BOWEN = {
    disc: [
      { id: 'ol', zh: '橄欖石', en: 'Olivine', T: [1200, 1050] },
      { id: 'px', zh: '輝石', en: 'Pyroxene', T: [1100, 900] },
      { id: 'amp', zh: '角閃石', en: 'Amphibole', T: [950, 750] },
      { id: 'bt', zh: '黑雲母', en: 'Biotite', T: [850, 650] }
    ],
    late: [
      { id: 'kfs', zh: '鉀長石', en: 'K-feldspar' },
      { id: 'ms', zh: '白雲母', en: 'Muscovite' },
      { id: 'qz', zh: '石英', en: 'Quartz' }
    ],
    Ttop: 1200, Tbot: 600
  };

  const api = {
    K0, KAPPA, TS, GEO, YEAR, KIN, Q1, MAGMAS, PRESETS, PLAG, BOWEN,
    erf, magma, logEta, hostT, slabT, mobility, rates, cool, at,
    loop, liquidus, solidus, equilibrium, fractional
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MagmaCore = api;
})(typeof window !== 'undefined' ? window : this);
