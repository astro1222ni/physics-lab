/*
 * iodine-clock-core.js — 「碘鐘反應與速率定律」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 慢反應（要量速率的反應）：S₂O₈²⁻ + 2I⁻ → 2SO₄²⁻ + I₂，速率定律 r = k[S₂O₈²⁻][I⁻]（兩者都是一級；I⁻ 的係數是 2，級數卻是 1）
 * 時鐘（快反應）：I₂ + 2S₂O₃²⁻ → 2I⁻ + S₄O₆²⁻（瞬間完成）。
 *   只要還有硫代硫酸根，生成的 I₂ 立刻被還原回 I⁻：[I⁻] 保持定值、溶液無色；
 *   硫代硫酸根用完的那一刻起 I₂ 開始累積，遇澱粉立刻變成深藍色（I₃⁻–澱粉錯合物）。
 *   用完時，過硫酸根正好消耗了 Δ = [S₂O₃²⁻]₀ / 2，所以「初速率」≈ Δ / t（t 為變藍時間）。
 *
 * 時鐘階段（[I⁻] = 定值 B）的解析解：dA/dt = −k Aᵐ Bⁿ（A 為氧化劑，m = 0、1、2）
 *   m = 0：A = A₀ − k′t；m = 1：A = A₀ e^(−k′t)；m = 2：1/A = 1/A₀ + k′t（k′ = k Bⁿ）
 * 時鐘停止後：A、[I⁻]、[I₂] 一起變化，用 RK4 數值積分（步長自動調整）。
 * 「看得到藍色」：[I₂] 達到 C_VIS = 1.0 × 10⁻⁶ M 的時刻（澱粉檢驗碘的靈敏度，示意值），變藍時間 tVis 因此比 t* 晚一點點。
 *
 * 速率常數：k(25 °C，離子強度 0.22 M) = 8.0 × 10⁻³ M⁻¹ s⁻¹、Ea = 50 kJ/mol（代表值，見頁面〈模擬方法〉）。
 * 離子強度（鹽效應）：同為負電的兩個離子反應，離子強度越大越快（布忍斯特－畢倫，延伸的德拜－休克耳式）：
 *   log₁₀ k = log₁₀ k₀ + 2A z₁z₂ √μ / (1 + √μ)，A = 0.509、z₁z₂ = (−2)(−1) = +2。
 *   「保持離子強度」（用 KCl／K₂SO₄ 補足液）時 μ 固定 0.22 M；只用純水補足時 μ = [I⁻] + 3[S₂O₈²⁻] + 3[S₂O₃²⁻]（各鹽完全解離）。
 * 未知氧化劑 X（虛構的中性分子，沒有鹽效應）：r = k[X]ᵐ[I⁻]ⁿ，m、n ∈ {0, 1, 2}（不同時為 0），k 與 Ea 隨機。
 *
 * 單位：濃度 M（mol/L）、時間 s、溫度 °C（計算時換成 K）、體積 mL。
 */
(function (root) {
  'use strict';
  const R = 8.314462618;            // J/(mol·K)，CODATA
  const T25 = 298.15;
  const K25 = 8.0e-3;               // M⁻¹ s⁻¹（25 °C、μ = 0.22 M）
  const EA = 50;                    // kJ/mol
  const MU_REF = 0.22;              // M
  const DH_A = 0.509;               // 德拜－休克耳常數（25 °C 水溶液）
  const ZZ = 2;                     // z(S₂O₈²⁻) × z(I⁻)
  const C_VIS = 1.0e-6;             // M，看得到藍色的 [I₂]
  const EPS = 2.5e4;                // L/(mol·cm)，澱粉－碘錯合物的莫耳吸收係數（示意值）
  const PATH = 4;                   // cm，燒杯的光程
  // 儲備溶液與總體積
  const STOCK = { KI: 0.200, P: 0.100, S: 0.0200 };
  const V_TOTAL = 50.0, V_STARCH = 1.0;
  const RANGE = { KI: [0.5, 20], P: [0.5, 20], S: [0, 9], T: [5, 45] };

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /** 配方（mL）→ 混合後的初濃度（M）與補足液體積 */
  function mix(v) {
    const VKI = +v.VKI || 0, VP = +v.VP || 0, VS = +v.VS || 0;
    const fill = V_TOTAL - V_STARCH - VKI - VP - VS;
    return {
      I0: STOCK.KI * VKI / V_TOTAL, P0: STOCK.P * VP / V_TOTAL, S0: STOCK.S * VS / V_TOTAL,
      fill: fill, ok: fill >= -1e-9
    };
  }
  /** 離子強度（M）：salt = true 時用鹽溶液補足、固定 MU_REF */
  function ionicStrength(c, salt) {
    if (salt) return MU_REF;
    return c.I0 + 3 * c.P0 + 3 * c.S0;
  }
  function dhf(mu) { const s = Math.sqrt(Math.max(0, mu)); return s / (1 + s); }
  /** 阿瑞尼斯因子 k(T)/k(25 °C) */
  function arrhenius(Tc, Ea) { return Math.exp(-(Ea * 1000) / R * (1 / (Tc + 273.15) - 1 / T25)); }
  /** 過硫酸根反應的速率常數（M⁻¹ s⁻¹） */
  function kPS(Tc, mu) {
    return K25 * arrhenius(Tc, EA) * Math.pow(10, 2 * DH_A * ZZ * (dhf(mu) - dhf(MU_REF)));
  }
  /** 25 °C、μ = 0 的 k₀（給說明用） */
  function k0PS() { return K25 * Math.pow(10, -2 * DH_A * ZZ * dhf(MU_REF)); }
  /** 未知反應在溫度 Tc 的 k */
  function kX(u, Tc) { return u.k25 * arrhenius(Tc, u.Ea); }

  /** 一次實驗的參數：{ m, n, k, A0（氧化劑）, B0（I⁻）, S0 } */
  function params(o) {
    const c = mix(o);
    let m = 1, n = 1, k, mu = ionicStrength(c, o.salt !== false);
    if (o.unk) { m = o.unk.m; n = o.unk.n; k = kX(o.unk, o.T); mu = null; }
    else k = kPS(o.T, mu);
    return { m: m, n: n, k: k, A0: c.P0, B0: c.I0, S0: c.S0, mu: mu, T: o.T, fill: c.fill };
  }

  // ---------- 時鐘階段（解析） ----------
  /** 時鐘階段 t 時的氧化劑濃度 */
  function phase1A(p, t) {
    const kp = p.k * Math.pow(p.B0, p.n);
    if (p.m === 0) return Math.max(0, p.A0 - kp * t);
    if (p.m === 1) return p.A0 * Math.exp(-kp * t);
    return 1 / (1 / p.A0 + kp * t);
  }
  /** 時鐘階段消耗掉 d 的氧化劑所需的時間 */
  function timeToConsume(p, d) {
    const kp = p.k * Math.pow(p.B0, p.n);
    if (d <= 0) return 0;
    if (d >= p.A0) return p.m === 0 ? p.A0 / kp : Infinity;
    if (p.m === 0) return d / kp;
    if (p.m === 1) return -Math.log(1 - d / p.A0) / kp;
    return (1 / (p.A0 - d) - 1 / p.A0) / kp;
  }

  // ---------- 時鐘停止後（數值） ----------
  function rateOf(p, A, B) {
    if (A <= 0) return 0;
    if (p.n > 0 && B <= 0) return 0;
    return p.k * (p.m === 0 ? 1 : Math.pow(A, p.m)) * (p.n === 0 ? 1 : Math.pow(B, p.n));
  }
  function rk4(p, s, h) {
    const f = function (A, B) { return rateOf(p, Math.max(0, A), Math.max(0, B)); };
    const r1 = f(s.A, s.B);
    const r2 = f(s.A - r1 * h / 2, s.B - r1 * h);
    const r3 = f(s.A - r2 * h / 2, s.B - r2 * h);
    const r4 = f(s.A - r3 * h, s.B - 2 * r3 * h);
    const d = h * (r1 + 2 * r2 + 2 * r3 + r4) / 6;
    const dd = Math.min(d, s.A, s.B / 2);
    s.A = Math.max(0, s.A - dd); s.B = Math.max(0, s.B - 2 * dd); s.C += dd; s.t += h;
  }
  /** 從狀態 s 積分到 tEnd；stopC 不為 null 時，[I₂] 一達到 stopC 就停下（傳回內插的時刻） */
  function integrate(p, s, tEnd, stopC) {
    let guard = 0;
    while (s.t < tEnd - 1e-12 && guard++ < 200000) {
      const r = rateOf(p, s.A, s.B);
      if (r <= 0) { s.t = tEnd; break; }
      let h = tEnd - s.t;
      if (p.m > 0) h = Math.min(h, 0.02 * s.A / r);
      else h = Math.min(h, Math.max(1.02 * s.A / r, 1e-9));
      if (p.n > 0) h = Math.min(h, 0.02 * s.B / (2 * r));
      if (stopC != null && s.C < stopC) h = Math.min(h, (stopC - s.C) / r + 1e-3 * stopC / r);
      h = Math.max(h, 1e-9);
      const t0 = s.t, c0 = s.C;
      rk4(p, s, h);
      if (stopC != null && s.C >= stopC) {
        const tc = s.C > c0 ? t0 + h * (stopC - c0) / (s.C - c0) : s.t;
        return tc;
      }
    }
    return null;
  }

  /**
   * 規劃一次實驗：tStar（硫代硫酸根用完）、tVis（看得到藍色）、never（永遠不會變藍）、tDone（never 時，氧化劑用掉 99% 的時刻）、
   * rate（Δ / tVis，學生量到的「初速率」）、r0（真正的初速率 k A₀ᵐ B₀ⁿ）。
   */
  function plan(p) {
    const half = p.S0 / 2;
    const out = { tStar: 0, tVis: Infinity, never: false, tDone: null, r0: rateOf(p, p.A0, p.B0), rate: null };
    if (half >= p.A0 - C_VIS) {
      out.never = true; out.tStar = Infinity;
      out.tDone = timeToConsume(p, 0.99 * p.A0);
      return out;
    }
    out.tStar = timeToConsume(p, half);
    const s = { t: out.tStar, A: p.A0 - half, B: p.B0, C: 0 };
    const tc = integrate(p, s, out.tStar + 1e9, C_VIS);
    if (tc == null) { out.never = true; out.tDone = out.tStar; return out; }
    out.tVis = tc;
    out.rate = p.S0 > 0 ? half / tc : null;
    return out;
  }

  /** 一次實驗的時間序列：at(t) 傳回 { A, B, S（硫代硫酸根）, C（I₂） }；t 遞增時沿用上一次的積分結果 */
  function createRun(p) {
    const pl = plan(p);
    let s2 = null;
    function at(t) {
      t = Math.max(0, t);
      if (pl.never || t <= pl.tStar) {
        const A = phase1A(p, t);
        return { A: A, B: p.B0, S: Math.max(0, p.S0 - 2 * (p.A0 - A)), C: 0 };
      }
      if (!s2 || s2.t > t) s2 = { t: pl.tStar, A: p.A0 - p.S0 / 2, B: p.B0, C: 0 };
      integrate(p, s2, t, null);
      return { A: s2.A, B: s2.B, S: 0, C: s2.C };
    }
    return { p: p, plan: pl, at: at };
  }

  /** 吸光度與藍色程度（0–1） */
  function absorbance(C) { return EPS * Math.max(0, C) * PATH; }
  function blueness(C) { return 1 - Math.pow(10, -absorbance(C)); }

  // ---------- 數據分析 ----------
  function linFit(xs, ys) {
    const n = xs.length;
    if (n < 2) return null;
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
    const mx = sx / n, my = sy / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    if (sxx <= 0) return null;
    const slope = sxy / sxx;
    return { slope: slope, intercept: my - slope * mx, r2: syy > 0 ? sxy * sxy / (sxx * syy) : 1, n: n };
  }
  function same(a, b, rel) { return Math.abs(a - b) <= (rel || 0.005) * Math.max(Math.abs(a), Math.abs(b), 1e-12); }
  function distinct(vals, rel) {
    const out = [];
    vals.forEach(function (v) { if (!out.some(function (u) { return same(u, v, rel); })) out.push(v); });
    return out;
  }
  /**
   * 級數的對數圖：runs 中與 ref 「其他條件都相同」（溫度、離子強度設定、硫代硫酸根、另一個反應物）的實驗，
   * 用 ln(速率) 對 ln(x) 擬合。axis = 'I'（[I⁻]₀）或 'P'（[S₂O₈²⁻]₀ 或 [X]₀）。
   * 傳回 { slope, n（點數）, nx（不同的 x 個數）, span（最大 x ÷ 最小 x）, pts, fit } 或 null。
   */
  function orderGroup(runs, ref, axis) {
    const other = axis === 'I' ? 'P0' : 'I0', key = axis === 'I' ? 'I0' : 'P0';
    const g = runs.filter(function (r) {
      return r.rate > 0 && Math.abs(r.T - ref.T) < 0.05 && !!r.salt === !!ref.salt && same(r.S0, ref.S0) && same(r[other], ref[other]);
    });
    const xs = distinct(g.map(function (r) { return r[key]; }));
    if (xs.length < 2) return null;
    const fit = linFit(g.map(function (r) { return Math.log(r[key]); }), g.map(function (r) { return Math.log(r.rate); }));
    if (!fit) return null;
    return { slope: fit.slope, n: g.length, nx: xs.length, span: Math.max.apply(null, xs) / Math.min.apply(null, xs), pts: g, fit: fit };
  }
  /** 溫度：同一個配方在不同溫度，ln(1/t) 對 1/T 的斜率 = −Ea/R。傳回 { Ea（kJ/mol）, nT, span（°C）, pts, fit } 或 null */
  function arrGroup(runs, ref) {
    const g = runs.filter(function (r) {
      return r.t > 0 && !!r.salt === !!ref.salt && same(r.S0, ref.S0) && same(r.I0, ref.I0) && same(r.P0, ref.P0);
    });
    const Ts = distinct(g.map(function (r) { return r.T; }), 1e-4);
    if (Ts.length < 2) return null;
    const fit = linFit(g.map(function (r) { return 1 / (r.T + 273.15); }), g.map(function (r) { return Math.log(1 / r.t); }));
    if (!fit) return null;
    return { Ea: -fit.slope * R / 1000, nT: Ts.length, span: Math.max.apply(null, Ts) - Math.min.apply(null, Ts), pts: g, fit: fit };
  }
  /** 從 ln k 對 1/T 的直線（至少兩個溫度）推算 25 °C 的 k；pts = [{ T, k }] */
  function kAt25(pts) {
    const fit = linFit(pts.map(function (q) { return 1 / (q.T + 273.15); }), pts.map(function (q) { return Math.log(q.k); }));
    return fit ? Math.exp(fit.intercept + fit.slope / T25) : null;
  }

  /**
   * 頁面與任務證明共用：一次實驗（rec，已記錄的列）送出 'run' 事件時附帶的摘要。
   * runs 是數據表的全部紀錄（含 rec）；只看同一個反應（rx、unk 相同）、有變藍的紀錄。
   */
  function runSummary(runs, rec) {
    const sameRx = runs.filter(function (r) { return r.rx === rec.rx && r.unk === rec.unk && !r.never; });
    const prev = sameRx.filter(function (r) { return r !== rec && r.id < rec.id; });
    const brief = function (g) { return g ? { slope: g.slope, n: g.n, nx: g.nx, span: g.span } : null; };
    const a = arrGroup(sameRx, rec);
    return {
      prev: prev.map(function (r) { return { rx: r.rx, T: r.T, salt: r.salt, I0: r.I0, P0: r.P0, S0: r.S0, t: r.t, rate: r.rate }; }),
      fitI: brief(orderGroup(sameRx, rec, 'I')), fitP: brief(orderGroup(sameRx, rec, 'P')),
      arr: a ? { Ea: a.Ea, nT: a.nT, span: a.span } : null
    };
  }
  /** 按「核對」時的統計：這個反應做了幾次、用過幾種濃度、25 °C 做過幾次、用過幾個溫度（保持離子強度、有變藍的） */
  function answerStats(runs, rx, unk) {
    const list = runs.filter(function (r) { return r.rx === rx && r.unk === unk; });
    const ok = list.filter(function (r) { return !r.never && r.t > 0; });
    return {
      runs: list.length,
      nI: distinct(list.map(function (r) { return r.I0; })).length,
      nP: distinct(list.map(function (r) { return r.P0; })).length,
      at25: list.filter(function (r) { return Math.abs(r.T - 25) < 0.5; }).length,
      temps: distinct(ok.filter(function (r) { return r.salt; }).map(function (r) { return r.T; }), 1e-4).length
    };
  }
  /** 一次實驗的紀錄（數據表的一列）；碼錶讀到 0.01 s */
  function record(id, o, p, pl, unkId) {
    const t = pl.never ? null : Math.round(pl.tVis * 100) / 100;
    return {
      id: id, rx: o.unk ? 'x' : 'ps', unk: o.unk ? unkId : 0, T: o.T, salt: o.unk ? true : o.salt !== false,
      VKI: o.VKI, VP: o.VP, VS: o.VS, I0: p.B0, P0: p.A0, S0: p.S0,
      t: t, rate: t && p.S0 > 0 ? p.S0 / 2 / t : null, never: pl.never
    };
  }

  // ---------- 未知反應 ----------
  /** rng() 傳回 0–1；k25 使「參考配方」（[I⁻] 0.040、[X] 0.020、[S₂O₃²⁻] 0.0010 M、25 °C）的變藍時間在 40–150 s */
  function newUnknown(rng) {
    rng = rng || Math.random;
    let m, n;
    do { m = Math.floor(rng() * 3); n = Math.floor(rng() * 3); } while (m === 0 && n === 0);
    const Ea = Math.round(35 + 30 * rng());
    const tRef = 40 + 110 * rng();
    const p1 = { m: m, n: n, k: 1, A0: 0.020, B0: 0.040, S0: 0.0010 };
    const k25 = timeToConsume(p1, 0.0005) / tRef;
    return { m: m, n: n, Ea: Ea, k25: k25 };
  }
  /** k 的單位指數：M^(1−m−n) s⁻¹ */
  function kUnitPow(m, n) { return 1 - m - n; }

  /** 解析學生打的數字：接受 0.008、8e-3、8.0×10^-3、8.0x10-3、8,0 */
  function parseNum(s) {
    if (s == null) return NaN;
    let t = String(s).trim().replace(/，/g, ',').replace(/\s+/g, '').replace(/−/g, '-').replace(/[×xX＊*]/g, 'x').replace(/,/g, '.');
    t = t.replace(/^\+/, '');
    let m = /^(-?\d*\.?\d+)x10\^?\(?(-?\d+)\)?$/.exec(t);
    if (m) return +m[1] * Math.pow(10, +m[2]);
    m = /^(-?\d*\.?\d+)(?:e(-?\d+))?$/i.exec(t);
    if (m) return +t;
    m = /^10\^?\(?(-?\d+)\)?$/.exec(t);
    if (m) return Math.pow(10, +m[1]);
    return NaN;
  }

  const api = {
    R: R, K25: K25, EA: EA, MU_REF: MU_REF, DH_A: DH_A, ZZ: ZZ, C_VIS: C_VIS, EPS: EPS, PATH: PATH,
    STOCK: STOCK, V_TOTAL: V_TOTAL, V_STARCH: V_STARCH, RANGE: RANGE,
    clamp: clamp, mix: mix, ionicStrength: ionicStrength, dhf: dhf, arrhenius: arrhenius, kPS: kPS, k0PS: k0PS, kX: kX,
    params: params, phase1A: phase1A, timeToConsume: timeToConsume, rateOf: rateOf, plan: plan, createRun: createRun,
    absorbance: absorbance, blueness: blueness, linFit: linFit, same: same, distinct: distinct,
    orderGroup: orderGroup, arrGroup: arrGroup, kAt25: kAt25, runSummary: runSummary, answerStats: answerStats, record: record, newUnknown: newUnknown, kUnitPow: kUnitPow, parseNum: parseNum
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IodineCore = api;
})(typeof window !== 'undefined' ? window : this);
