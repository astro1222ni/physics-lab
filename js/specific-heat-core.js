/*
 * specific-heat-core.js — 比熱與熱平衡物理核心（與畫面無關，可單獨測試）
 *
 * 單位約定（SI，溫度用 °C）：
 *   質量 m ............ kg
 *   比熱 c ............ J/(kg·K)
 *   熱容量 C = mc ..... J/K
 *   潛熱 L ............ J/kg（熔化熱 L_f、汽化熱 L_v）
 *   熱量、焓 H、Q ..... J
 *   功率 P ............ W
 *   熱導 k ............ W/K（熱流 P = k ΔT，牛頓冷卻定律）
 *   時間 t ............ s
 *
 * 核心觀念：每個物體用「焓 H」記錄所含的熱能（以 0 °C 的最低相為參考 H = 0）。
 * 溫度是 H 的分段線性函數：
 *   一般升溫段（顯熱）：dH = C dT，C = m c（＋量熱器的熱容量 Cx）
 *   相變段（潛熱）：溫度固定，H 增加 m L，相的比例 x 由 0 變到 1
 * 因此：
 *   - 混合（熱平衡）：總焓守恆 ΣH 不變，找出使所有物體同溫的 T_f（可能停在 0 °C 或 100 °C 的相變平台）。
 *     沒有相變時就是 T_f = Σ m c T / Σ m c，也就是 Σ m c (T_f − T_i) = 0。
 *   - 接觸傳熱（動畫）：兩物體間熱流 P = k (T_A − T_B)。在每一段內溫度是 H 的線性函數，
 *     溫差呈指數衰減，可以「分段解析」精確求解；A 失去的熱量正好等於 B 得到的熱量（能量精確守恆），
 *     而且最後必定到達上面的解析平衡態。
 *   - 加熱器：dH/dt = P − k_e (T − T_env)（k_e = 0 表示完全絕熱），同樣分段解析求解。
 *
 * 材料資料（約 25 °C、1 大氣壓）主要取自 CRC Handbook of Chemistry and Physics；
 * 冰取 −10 °C 至 0 °C 的近似值，水蒸氣取 100 °C 附近的定壓比熱（教科書常用值）。
 */
(function (root) {
  'use strict';

  const L_FUSION = 3.34e5;   // J/kg 冰的熔化熱（0 °C）
  const L_VAPOR = 2.26e6;    // J/kg 水的汽化熱（100 °C）
  const C_WATER = 4186;      // J/(kg·K)
  const C_ICE = 2100;
  const C_STEAM = 2010;
  const T_ENV = 25;          // °C 室溫（散熱選項的環境溫度）
  const H_STILL = 250;       // W/(m²·K) 樣品與靜止水之間的對流熱傳係數
  const H_STIR = 1000;       // W/(m²·K) 攪拌時
  const KE_CUP = 1.5;        // W/K 「保溫不良」的量熱杯與環境之間的熱導
  const KE_BEAKER = 3;       // W/K 加熱實驗的容器與環境之間的熱導

  function solid(id, c, rho, src) {
    return { id: id, phases: [{ key: 'solid', c: c, rho: rho }], trans: [], src: src };
  }

  /** 物質資料：phases 依溫度由低到高，trans[i] 是 phases[i] → phases[i+1] 的相變（溫度 T、潛熱 L） */
  const SUBSTANCES = {
    h2o: {
      id: 'h2o',
      phases: [
        { key: 'solid', c: C_ICE, rho: 917 },
        { key: 'liquid', c: C_WATER, rho: 1000 },
        { key: 'gas', c: C_STEAM, rho: 0.598 }
      ],
      trans: [{ T: 0, L: L_FUSION }, { T: 100, L: L_VAPOR }],
      src: 'CRC'
    },
    al: solid('al', 900, 2700, 'CRC 0.897 J/(g·K)'),
    fe: solid('fe', 450, 7870, 'CRC 0.449 J/(g·K)'),
    cu: solid('cu', 385, 8960, 'CRC 0.385 J/(g·K)'),
    pb: solid('pb', 128, 11340, 'CRC 0.129 J/(g·K)'),
    glass: solid('glass', 840, 2500, 'soda-lime glass ≈ 0.84 J/(g·K)'),
    // 神秘金屬的候選（真實資料）
    ti: solid('ti', 523, 4510, 'CRC 0.523 J/(g·K)'),
    ag: solid('ag', 235, 10490, 'CRC 0.235 J/(g·K)'),
    mg: solid('mg', 1020, 1740, 'CRC 1.023 J/(g·K)'),
    zn: solid('zn', 388, 7140, 'CRC 0.388 J/(g·K)'),
    ni: solid('ni', 444, 8910, 'CRC 0.444 J/(g·K)'),
    w: solid('w', 132, 19300, 'CRC 0.132 J/(g·K)')
  };
  const MYSTERY_IDS = ['ti', 'ag', 'mg', 'zn', 'ni', 'w'];

  function sub(s) { return typeof s === 'string' ? SUBSTANCES[s] : s; }

  // ======================= 物體與焓 =======================
  /**
   * 建立物體：物質 s、質量 m、額外的固定熱容量 Cx（例如量熱杯，與物體保持同溫）。
   * segs 依焓由小到大排列：[顯熱0, 潛熱0, 顯熱1, 潛熱1, 顯熱2 …]；
   * 顯熱段 T = Ta + (H − Ha)/C；潛熱段溫度固定為 T，x = (H − Hlo)/W。
   */
  function makeBody(s, m, Cx) {
    const S = sub(s);
    const b = { sub: S, m: Math.max(0, m), Cx: Math.max(0, Cx || 0), segs: [] };
    const ph = S.phases, tr = S.trans;
    let Ha = 0, Ta = 0, Tlo = -Infinity, Hlo = -Infinity;
    for (let p = 0; p < ph.length; p++) {
      const C = b.m * ph[p].c + b.Cx;
      const Thi = p < tr.length ? tr[p].T : Infinity;
      const Hhi = Thi === Infinity ? Infinity : Ha + C * (Thi - Ta);
      b.segs.push({ kind: 'sens', p: p, C: C, Ta: Ta, Ha: Ha, Tlo: Tlo, Thi: Thi, Hlo: Hlo, Hhi: Hhi });
      if (p < tr.length) {
        const W = b.m * tr[p].L;
        b.segs.push({ kind: 'lat', i: p, T: Thi, W: W, Hlo: Hhi, Hhi: Hhi + W, L: tr[p].L });
        Ha = Hhi + W; Ta = Thi; Tlo = Thi; Hlo = Ha;
      }
    }
    b.empty = b.segs.some(function (g) { return g.kind === 'sens' && !(g.C > 0); });
    return b;
  }

  /** H 所在的段：dir < 0 表示 H 正在減少（邊界上取下面那一段），dir ≥ 0 取上面那一段 */
  function segIndex(b, H, dir) {
    const S = b.segs;
    for (let i = 0; i < S.length; i++) {
      const g = S[i];
      if (dir < 0 ? (H > g.Hlo && H <= g.Hhi) : (H >= g.Hlo && H < g.Hhi)) return i;
    }
    return dir < 0 ? 0 : S.length - 1;
  }

  function tempInSeg(g, H) { return g.kind === 'lat' ? g.T : g.Ta + (H - g.Ha) / g.C; }

  /** 由焓求溫度（與方向無關，T(H) 連續） */
  function temperature(b, H) { return tempInSeg(b.segs[segIndex(b, H, 1)], H); }

  /**
   * 由焓求完整狀態：溫度 T、所在段、各相的質量比例 frac、連續的相位指標 phase
   * （顯熱段 = 相的編號；潛熱段 = i + x，例如 0.3 表示 30% 的冰已經融化）。
   */
  function stateOf(b, H, dir) {
    const idx = segIndex(b, H, dir == null ? 1 : dir), g = b.segs[idx];
    const n = b.sub.phases.length, frac = new Array(n).fill(0);
    let x = 0, phase;
    if (g.kind === 'lat') {
      x = g.W > 0 ? Math.min(1, Math.max(0, (H - g.Hlo) / g.W)) : 0;
      frac[g.i] = 1 - x; frac[g.i + 1] = x;
      phase = g.i + x;
    } else {
      frac[g.p] = 1;
      phase = g.p;
    }
    return { T: tempInSeg(g, H), seg: g, idx: idx, x: x, phase: phase, frac: frac, H: H };
  }

  /** 各相的質量（kg） */
  function phaseMasses(b, H) {
    return stateOf(b, H).frac.map(function (f) { return f * b.m; });
  }

  /**
   * 溫度 T 時的焓。T 正好在相變溫度時，用 phase 決定比例：
   * phase ≤ i 全為低溫相，phase ≥ i + 1 全為高溫相，中間為部分轉變。
   */
  function enthalpyAt(b, T, phase) {
    const S = b.segs;
    for (let j = 0; j < S.length; j++) {
      const g = S[j];
      if (g.kind === 'lat' && T === g.T) {
        const x = phase == null ? 0 : Math.min(1, Math.max(0, phase - g.i));
        return g.Hlo + x * g.W;
      }
    }
    for (let j = 0; j < S.length; j++) {
      const g = S[j];
      if (g.kind === 'sens' && T >= g.Tlo && T <= g.Thi) return g.Ha + g.C * (T - g.Ta);
    }
    return NaN;
  }

  /** 物體在溫度 T 的「下緣」(side < 0) 或「上緣」(side > 0) 焓 */
  function enthalpySide(b, T, side) {
    const S = b.segs;
    for (let j = 0; j < S.length; j++) {
      const g = S[j];
      if (g.kind === 'lat' && T === g.T) return side < 0 ? g.Hlo : g.Hhi;
    }
    return enthalpyAt(b, T);
  }

  // ======================= 熱平衡（解析） =======================
  /**
   * 熱平衡：items = [{ b: 物體, H: 焓 }]（無熱容量的物體自動略過）。
   * 總焓守恆，傳回 { T, H: [各物體的平衡焓], x: 平台上的相變比例（若在平台）, plateau }。
   */
  function equilibrium(items) {
    const list = items.map(function (it, k) { return { b: it.b, H: it.H, k: k }; })
      .filter(function (it) { return it.b && !it.b.empty; });
    const Htot = list.reduce(function (s, it) { return s + it.H; }, 0);
    const out = { T: NaN, H: items.map(function (it) { return it.H; }), x: null, plateau: false, Htot: Htot };
    if (!list.length) return out;
    const Ts = [];
    list.forEach(function (it) { it.b.sub.trans.forEach(function (t) { if (Ts.indexOf(t.T) < 0) Ts.push(t.T); }); });
    Ts.sort(function (a, b) { return a - b; });

    function setSens(T) {
      out.T = T;
      list.forEach(function (it) { out.H[it.k] = enthalpyAt(it.b, T); });
      return out;
    }
    // 區間 (lo, hi) 內所有物體都在顯熱段：總焓 = A + B·T（線性）
    function solveInterval(lo, hi) {
      const Tr = lo === -Infinity ? (hi === Infinity ? 0 : hi - 1) : (hi === Infinity ? lo + 1 : (lo + hi) / 2);
      let A = 0, B = 0;
      list.forEach(function (it) {
        const g = it.b.segs.find(function (s) { return s.kind === 'sens' && Tr > s.Tlo && Tr < s.Thi; });
        A += g.Ha - g.C * g.Ta; B += g.C;
      });
      const T = (Htot - A) / B;
      return T;
    }
    const tol = 1e-9 * Math.max(1, Math.abs(Htot));
    for (let j = 0; j <= Ts.length; j++) {
      const lo = j === 0 ? -Infinity : Ts[j - 1], hi = j === Ts.length ? Infinity : Ts[j];
      // 先檢查左端的相變平台
      if (j > 0) {
        const Hlo = list.reduce(function (s, it) { return s + enthalpySide(it.b, lo, -1); }, 0);
        const Hhi = list.reduce(function (s, it) { return s + enthalpySide(it.b, lo, 1); }, 0);
        if (Htot >= Hlo - tol && Htot <= Hhi + tol) {
          const W = Hhi - Hlo;
          const x = W > 0 ? Math.min(1, Math.max(0, (Htot - Hlo) / W)) : 0;
          out.T = lo; out.x = x; out.plateau = W > 0 && x > 0 && x < 1;
          list.forEach(function (it) {
            const a = enthalpySide(it.b, lo, -1), c = enthalpySide(it.b, lo, 1);
            out.H[it.k] = a + x * (c - a);
          });
          return out;
        }
      }
      const T = solveInterval(lo, hi);
      if (T <= hi || hi === Infinity) {
        if (T >= lo || lo === -Infinity) return setSens(T);
      }
    }
    return out;
  }

  /** 沒有相變時的混合公式 T_f = Σ m c T / Σ m c（list: [{m, c, T}]） */
  function mixFormula(list) {
    let num = 0, den = 0;
    list.forEach(function (o) { num += o.m * o.c * o.T; den += o.m * o.c; });
    return num / den;
  }

  // ======================= 接觸傳熱（牛頓冷卻定律，分段解析） =======================
  /**
   * 兩物體接觸 dt 秒：熱流 P = k (T_A − T_B)。在每一段內溫差呈指數衰減
   *   Q(t) = (ΔT/β)(1 − e^{−kβt})，β = 1/C_A + 1/C_B（平台上的物體 1/C = 0）。
   * 碰到相變的開始或結束時，換到下一段繼續算。A 失去的熱量 = B 得到的熱量。
   * 傳回 { HA, HB, Q（A → B 的熱量）, pts: [段落邊界的 {dt, HA, HB}] }。
   */
  function pairStep(A, B, HA, HB, k, dt) {
    let t = 0, Q = 0, guard = 0;
    const pts = [];
    if (!(k > 0) || !(dt > 0)) return { HA: HA, HB: HB, Q: 0, pts: pts };
    while (t < dt && guard++ < 64) {
      const TA = temperature(A, HA), TB = temperature(B, HB);
      const d = TA - TB;
      if (Math.abs(d) < 1e-13) break;
      const sgn = d > 0 ? 1 : -1;
      const ga = A.segs[segIndex(A, HA, -sgn)], gb = B.segs[segIndex(B, HB, sgn)];
      const beta = (ga.kind === 'sens' ? 1 / ga.C : 0) + (gb.kind === 'sens' ? 1 / gb.C : 0);
      const limA = sgn > 0 ? HA - ga.Hlo : ga.Hhi - HA;
      const limB = sgn > 0 ? gb.Hhi - HB : HB - gb.Hlo;
      const lim = Math.min(limA, limB);
      const D = Math.abs(d), r = dt - t;
      let tb = Infinity;
      if (beta > 0) {
        const Qinf = D / beta;
        if (lim < Qinf) tb = -Math.log(1 - lim / Qinf) / (k * beta);
      } else tb = lim / (k * D);
      if (!(tb < r)) {
        const q = beta > 0 ? (D / beta) * -Math.expm1(-k * beta * r) : k * D * r;
        HA -= sgn * q; HB += sgn * q; Q += sgn * q;
        t = dt;
        break;
      }
      // 到達段落邊界：把到邊界的那一個物體精確放在邊界上
      if (limA <= limB) {
        const nA = sgn > 0 ? ga.Hlo : ga.Hhi, q = Math.abs(HA - nA);
        HA = nA; HB += sgn * q; Q += sgn * q;
      } else {
        const nB = sgn > 0 ? gb.Hhi : gb.Hlo, q = Math.abs(nB - HB);
        HB = nB; HA -= sgn * q; Q += sgn * q;
      }
      t += tb;
      pts.push({ dt: t, HA: HA, HB: HB });
    }
    return { HA: HA, HB: HB, Q: Q, pts: pts };
  }

  /**
   * 單一物體：加熱功率 P，並以熱導 ke 與溫度 Tenv 的環境交換熱量（ke = 0 為絕熱）。
   *   dH/dt = P − ke (T − Tenv)
   * 顯熱段：T 以指數趨近穩定溫度 T_ss = Tenv + P/ke（ke = 0 時為直線，斜率 P/C）；
   * 潛熱段：溫度固定，H 以固定速率改變。
   * 傳回 { H, Qin = P·dt, Qloss（散失到環境的熱量）, pts, steady（是否已停在穩定狀態） }。
   */
  function heatStep(b, H, P, ke, Tenv, dt) {
    const H0 = H, pts = [];
    let t = 0, guard = 0, steady = false;
    ke = ke || 0; Tenv = Tenv == null ? T_ENV : Tenv;
    while (t < dt && guard++ < 64) {
      const T = temperature(b, H);
      const F = P - ke * (T - Tenv);
      if (Math.abs(F) < 1e-12) { steady = true; break; }
      const dir = F > 0 ? 1 : -1;
      const g = b.segs[segIndex(b, H, dir)];
      const r = dt - t;
      let tb = Infinity;
      if (g.kind === 'lat') {
        const lim = dir > 0 ? g.Hhi - H : H - g.Hlo;
        tb = lim / Math.abs(F);
        if (!(tb < r)) { H += F * r; t = dt; break; }
        H = dir > 0 ? g.Hhi : g.Hlo;
      } else {
        const Tb = dir > 0 ? g.Thi : g.Tlo;
        if (ke > 0) {
          const Tss = Tenv + P / ke, tau = g.C / ke;
          if (isFinite(Tb) && (Tb - T) * (Tss - Tb) > 0) tb = tau * Math.log((T - Tss) / (Tb - Tss));
          if (!(tb < r)) { const Tn = Tss + (T - Tss) * Math.exp(-r / tau); H += g.C * (Tn - T); t = dt; break; }
        } else {
          if (isFinite(Tb)) tb = (Tb - T) * g.C / P;
          if (!(tb < r)) { H += P * r; t = dt; break; }
        }
        H = dir > 0 ? g.Hhi : g.Hlo;
      }
      t += tb;
      pts.push({ dt: t, H: H });
    }
    const Qin = P * dt;
    return { H: H, Qin: Qin, Qloss: Qin - (H - H0), pts: pts, steady: steady };
  }

  /** 樣品與水之間的熱導 k = hA（樣品視為正立方體，A = 6 (m/ρ)^(2/3)） */
  function contactK(s, m, stir) {
    const rho = sub(s).phases[0].rho;
    const A = 6 * Math.pow(Math.max(m, 0) / rho, 2 / 3);
    return (stir ? H_STIR : H_STILL) * A;
  }

  /** 顯熱段中最小的熱容量（估計時間常數用） */
  function minC(b) {
    let c = Infinity;
    b.segs.forEach(function (g) { if (g.kind === 'sens' && g.C < c) c = g.C; });
    return c;
  }

  // ======================= 量熱器（兩物體＋可選的散熱） =======================
  /**
   * 建立混合實驗：A = 樣品，B = 杯中的水（＋量熱杯熱容量 Ccup）。
   * opts = { A: {s, m, T, phase}, B: {m, T, phase, Ccup}, k, ke, Tenv }
   */
  function createMix(opts) {
    const A = makeBody(opts.A.s, opts.A.m, 0);
    const B = makeBody(opts.B.s || 'h2o', opts.B.m, opts.B.Ccup || 0);
    const HA = enthalpyAt(A, opts.A.T, opts.A.phase);
    const HB = enthalpyAt(B, opts.B.T, opts.B.phase == null ? 1 : opts.B.phase);
    const sim = {
      A: A, B: B, HA: HA, HB: HB, HA0: HA, HB0: HB,
      k: opts.k, ke: opts.ke || 0, Tenv: opts.Tenv == null ? T_ENV : opts.Tenv,
      t: 0, Qab: 0, Qloss: 0
    };
    const tauSmall = Math.min(minC(A), minC(B)) / (sim.k + sim.ke);
    sim.hmax = tauSmall / 12;
    sim.eq = equilibrium([{ b: A, H: HA }, { b: B, H: HB }]);
    return sim;
  }

  /**
   * 混合實驗前進 dt 秒。無散熱時直接用分段解析解；有散熱時用 Strang 分裂
   * （半步散熱 → 一步接觸傳熱 → 半步散熱），每個子步驟都精確守恆能量：
   *   H_A + H_B + Q_loss 永遠等於初始值。
   */
  function mixStep(sim, dt) {
    const pts = [];
    if (!(dt > 0)) return pts;
    if (!(sim.ke > 0)) {
      const r = pairStep(sim.A, sim.B, sim.HA, sim.HB, sim.k, dt);
      r.pts.forEach(function (p) { pts.push({ t: sim.t + p.dt, HA: p.HA, HB: p.HB }); });
      sim.HA = r.HA; sim.HB = r.HB; sim.Qab += r.Q; sim.t += dt;
      return pts;
    }
    const n = Math.max(1, Math.ceil(dt / sim.hmax)), h = dt / n;
    for (let i = 0; i < n; i++) {
      let l = heatStep(sim.B, sim.HB, 0, sim.ke, sim.Tenv, h / 2);
      sim.HB = l.H; sim.Qloss += l.Qloss;
      const r = pairStep(sim.A, sim.B, sim.HA, sim.HB, sim.k, h);
      const t0 = sim.t + i * h;
      r.pts.forEach(function (p) { pts.push({ t: t0 + p.dt, HA: p.HA, HB: p.HB }); });
      sim.HA = r.HA; sim.HB = r.HB; sim.Qab += r.Q;
      l = heatStep(sim.B, sim.HB, 0, sim.ke, sim.Tenv, h / 2);
      sim.HB = l.H; sim.Qloss += l.Qloss;
    }
    sim.t += dt;
    return pts;
  }

  function mixState(sim) {
    const a = stateOf(sim.A, sim.HA), b = stateOf(sim.B, sim.HB);
    return { TA: a.T, TB: b.T, A: a, B: b, dT: a.T - b.T, P: sim.k * (a.T - b.T) };
  }

  /**
   * 無散熱時，兩物體溫差降到 tol 以下所需的時間（溫差單調遞減，可用二分法精確求出）。
   */
  function timeToEquilibrium(A, B, HA, HB, k, tol) {
    const dT = function (a, b) { return Math.abs(temperature(A, a) - temperature(B, b)); };
    if (dT(HA, HB) <= tol) return 0;
    let t = 0, step = Math.max(1e-3, Math.min(minC(A), minC(B)) / k / 4);
    for (let n = 0; n < 4000; n++) {
      const r = pairStep(A, B, HA, HB, k, step);
      if (dT(r.HA, r.HB) <= tol) {
        let lo = 0, hi = step;
        for (let j = 0; j < 60; j++) {
          const mid = (lo + hi) / 2, q = pairStep(A, B, HA, HB, k, mid);
          if (dT(q.HA, q.HB) <= tol) hi = mid; else lo = mid;
        }
        return t + hi;
      }
      HA = r.HA; HB = r.HB; t += step;
      step *= 1.15;
    }
    return Infinity;
  }

  // ======================= 加熱曲線 =======================
  /**
   * 絕熱、固定功率 P 的加熱：從焓 H0 加熱到 Hstop，傳回每一段的時間（Δt = ΔQ / P）。
   * segs: [{ kind:'sens'|'lat', p | i, t0, t1, H0, H1, T0, T1 }]
   */
  function heatingSchedule(b, H0, P, Hstop) {
    const out = [];
    let H = H0, t = 0, guard = 0;
    while (H < Hstop && guard++ < 16) {
      const g = b.segs[segIndex(b, H, 1)];
      const H1 = Math.min(g.Hhi, Hstop);
      const dt = (H1 - H) / P;
      out.push({ kind: g.kind, p: g.p, i: g.i, t0: t, t1: t + dt, H0: H, H1: H1, T0: tempInSeg(g, H), T1: tempInSeg(g, H1) });
      t += dt; H = H1;
    }
    return { segs: out, total: t };
  }

  /**
   * 一般情況（可有散熱）的加熱：模擬到焓達到 Hstop，或溫度停在穩定狀態（|T − T_ss| < tol），
   * 或時間達到 tMax。傳回 { t, reason: 'stop'|'steady'|'tmax', H }。
   */
  function heaterEnd(b, H0, P, ke, Tenv, Hstop, tol, tMax) {
    Tenv = Tenv == null ? T_ENV : Tenv; tol = tol || 0.05; tMax = tMax || 1e6;
    const done = function (H) {
      if (H >= Hstop - 1e-9) return 'stop';
      if (ke > 0) {
        const T = temperature(b, H), Tss = Tenv + P / ke;
        const g = b.segs[segIndex(b, H, 1)];
        if (g.kind === 'sens' && Math.abs(T - Tss) <= tol && Tss > g.Tlo && Tss < g.Thi) return 'steady';
        if (g.kind === 'lat' && Math.abs(P - ke * (g.T - Tenv)) < 1e-9) return 'steady';
      }
      return null;
    };
    let H = H0, t = 0;
    const r0 = done(H);
    if (r0) return { t: 0, reason: r0, H: H };
    let step = Math.max(0.01, minC(b) / Math.max(ke, P / 50, 1e-6) / 20);
    while (t < tMax) {
      const s = heatStep(b, H, P, ke, Tenv, step).H;
      if (done(s)) {
        let lo = 0, hi = step;
        for (let j = 0; j < 60; j++) {
          const mid = (lo + hi) / 2;
          if (done(heatStep(b, H, P, ke, Tenv, mid).H)) hi = mid; else lo = mid;
        }
        const Hf = heatStep(b, H, P, ke, Tenv, hi).H;
        return { t: t + hi, reason: done(Hf) || 'stop', H: Hf };
      }
      H = s; t += step;
      step *= 1.05;
    }
    return { t: tMax, reason: 'tmax', H: H };
  }

  /**
   * 熱量分段：焓從 H0 變到 H1 時，每一段（顯熱或潛熱）各吸收（或放出）多少熱量。
   * 傳回 [{ kind, p | i, Q }]，Q 的正負與 H1 − H0 相同，總和 = H1 − H0。
   */
  function decompose(b, H0, H1) {
    const out = [];
    const lo = Math.min(H0, H1), hi = Math.max(H0, H1), sg = H1 >= H0 ? 1 : -1;
    b.segs.forEach(function (g) {
      const a = Math.max(lo, g.Hlo), c = Math.min(hi, g.Hhi);
      if (c > a) out.push({ kind: g.kind, p: g.p, i: g.i, Q: sg * (c - a) });
    });
    if (sg < 0) out.reverse();
    return out;
  }

  const api = {
    L_FUSION: L_FUSION, L_VAPOR: L_VAPOR, C_WATER: C_WATER, C_ICE: C_ICE, C_STEAM: C_STEAM,
    T_ENV: T_ENV, H_STILL: H_STILL, H_STIR: H_STIR, KE_CUP: KE_CUP, KE_BEAKER: KE_BEAKER,
    SUBSTANCES: SUBSTANCES, MYSTERY_IDS: MYSTERY_IDS,
    makeBody: makeBody, segIndex: segIndex, temperature: temperature, stateOf: stateOf, phaseMasses: phaseMasses,
    enthalpyAt: enthalpyAt, equilibrium: equilibrium, mixFormula: mixFormula,
    pairStep: pairStep, heatStep: heatStep, contactK: contactK,
    createMix: createMix, mixStep: mixStep, mixState: mixState, timeToEquilibrium: timeToEquilibrium,
    heatingSchedule: heatingSchedule, heaterEnd: heaterEnd, decompose: decompose
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeatCore = api;
})(typeof window !== 'undefined' ? window : this);
