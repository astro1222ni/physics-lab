/*
 * heat-engine-core.js — 「熱機循環與熱力學第一定律」物理核心（與畫面無關，可單獨以 Node 測試）
 *
 * 單位一律 SI：壓力 Pa、體積 m³、溫度 K、能量 J、熵 J/K。畫面再換成 kPa、L。
 *
 * 模型：n mol 理想氣體，所有過程都是準靜態、可逆的。PV = nRT，R = N_A k（SI 定義值，精確）。
 *   單原子（He、Ar）：C_V = 3R/2，γ = 5/3；雙原子（N2、空氣）：C_V = 5R/2，γ = 7/5（常溫附近振動未激發）。
 *   內能 U = n C_V T（只和溫度有關）。
 *
 * 符號約定（與 ideal-gas 頁相同）：
 *   Q：氣體「吸收」的熱（吸熱為正）；W：「外界對氣體」作的功（壓縮為正）；ΔU = Q + W。
 *   引擎對外輸出的淨功 W_out = −ΣW = ΣQ（循環的 ΔU = 0），也等於 P–V 圖上循環路徑圍成的有號面積 ∮P dV
 *   （V 向右、P 向上，順時針為正）。
 *
 * 五種過程（端點給定，回傳 Q、W、ΔU、ΔS，以及沿途的狀態 at(u)、吸熱率 dQdu(u)，u = 0 → 1）：
 *   等溫 isoT：W = −nRT ln(V2/V1)，ΔU = 0，Q = −W，ΔS = nR ln(V2/V1)
 *   等容 isoV：W = 0，Q = ΔU = nC_V ΔT
 *   等壓 isoP：W = −PΔV，Q = nC_P ΔT
 *   絕熱 adiabat：Q = 0，PV^γ 為常數，W = ΔU = nC_V ΔT，ΔS = 0
 *   直線 line（自訂循環）：P = a + bV。沿線 nC_V dT = (C_V/R) d(PV)，所以
 *     dQ = [(C_V/R + 1)a + (2C_V/R + 1)bV] dV，在 V* = −(C_V/R + 1)a / [(2C_V/R + 1)b] 變號；
 *     用這個解析式把一段直線拆成吸熱與放熱兩部分，Q_in 才正確（不能只看整段 Q 的正負）。
 *   任何過程的 ΔS = nC_V ln(T2/T1) + nR ln(V2/V1)（狀態函數）。
 *
 * 循環：卡諾、奧圖、狄塞爾、史特林（可開回熱器）、布雷頓、自訂多邊形；都可以逆向運轉（冰箱／熱泵）。
 *   Q_in：從外界吸收的熱（各段吸熱部分相加）；Q_out：排給外界的熱（各段放熱部分的大小相加）。
 *   史特林開回熱器時，兩段等容的熱在引擎內部交換（存進回熱器再取回），不算外界的 Q_in、Q_out。
 *   熱機（W_out > 0）：η = W_out / Q_in ≤ η_C = 1 − T_min/T_max（第二定律，T_max、T_min 為循環的最高、最低溫）。
 *   冰箱／熱泵（W_out < 0，外界輸入功 W_in = −W_out）：K_R = Q_in/W_in（從冷處吸走的熱），K_HP = Q_out/W_in。
 *     卡諾上限用「能夠搭配的冷、熱庫」：T_c' = 氣體吸熱時的最高溫（冷庫至少要這麼熱，熱才流得進氣體），
 *     T_h' = 氣體放熱時的最低溫；T_c' < T_h' 時 K_R ≤ T_c'/(T_h' − T_c')、K_HP ≤ T_h'/(T_h' − T_c')（克勞修斯不等式）。
 *     逆向卡諾、開回熱器的逆向史特林剛好等於上限。
 */
(function (root) {
  'use strict';

  const NA = 6.02214076e23;      // 亞佛加厥常數（SI 定義值）
  const KB = 1.380649e-23;       // 波茲曼常數（SI 定義值）
  const R = NA * KB;             // 8.314 462 618 153 24 J/(mol·K)，精確

  const GASES = {
    mono: { id: 'mono', cv: 1.5 },  // 單原子
    di: { id: 'di', cv: 2.5 }       // 雙原子（常溫）
  };
  /** 氣體性質：cv = C_V/R，cp = C_P/R，γ，以及每莫耳的 C_V、C_P（J/(mol·K)） */
  function gasOf(g) {
    const b = typeof g === 'string' ? (GASES[g] || GASES.di) : (g && g.cv ? g : GASES.di);
    const cv = b.cv, cp = cv + 1;
    return { id: b.id || 'custom', cv: cv, cp: cp, gamma: cp / cv, Cv: cv * R, Cp: cp * R };
  }

  // ---------------- 狀態 ----------------
  function fromPV(n, P, V) { return { P: P, V: V, T: P * V / (n * R) }; }
  function fromVT(n, V, T) { return { P: n * R * T / V, V: V, T: T }; }
  function fromPT(n, P, T) { return { P: P, V: n * R * T / P, T: T }; }

  // ---------------- 單一過程 ----------------
  const KINDS = ['isoT', 'isoV', 'isoP', 'adiabat', 'line'];
  /** T 在直線段 P = a + bV 的 [V0, V1] 上的最小、最大值（T = V(a + bV)/(nR)，開口向下或向上的拋物線） */
  function lineTRange(n, a, b, V0, V1, A) {
    // 有端點 A 時用 P = A.P + b(V − A.V)（數值穩定），否則用 a + bV
    const Pf = A ? function (V) { return A.P + b * (V - A.V); } : function (V) { return a + b * V; };
    const Tf = function (V) { return V * Pf(V) / (n * R); };
    let lo = Math.min(Tf(V0), Tf(V1)), hi = Math.max(Tf(V0), Tf(V1));
    if (b !== 0) {
      const Vm = A ? (A.V - A.P / b) / 2 : -a / (2 * b);
      if (Vm > Math.min(V0, V1) && Vm < Math.max(V0, V1)) { const t = Tf(Vm); lo = Math.min(lo, t); hi = Math.max(hi, t); }
    }
    return [lo, hi];
  }
  /**
   * 建立一段過程。kind：isoT／isoV／isoP／adiabat／line；A、B：端點狀態 {P, V, T}；
   * opt：{ role（畫面用：hot、cold、insul、burn、exhaust、regen、line…）, internal（回熱器內部交換，不算外界的吸放熱） }
   */
  function segment(kind, n, gas, A, B, opt) {
    const G = gasOf(gas);
    opt = opt || {};
    const dU = n * G.Cv * (B.T - A.T);
    const dS = n * G.Cv * Math.log(B.T / A.T) + n * R * Math.log(B.V / A.V);
    const dV = B.V - A.V;
    let Q, W, parts, at, dQdu, Pof = null;
    if (kind === 'isoT') {
      const T = A.T;
      W = -n * R * T * Math.log(B.V / A.V);
      Q = -W;
      parts = [{ Q: Q, Tlo: T, Thi: T }];
      at = function (u) { const V = A.V + u * dV; return { P: n * R * T / V, V: V, T: T }; };
      dQdu = function (u) { return n * R * T * dV / (A.V + u * dV); };
    } else if (kind === 'adiabat') {
      Q = 0; W = dU;
      parts = [];
      const g = G.gamma;
      at = function (u) { const V = A.V + u * dV; const P = A.P * Math.pow(A.V / V, g); return { P: P, V: V, T: P * V / (n * R) }; };
      dQdu = function () { return 0; };
    } else if (kind === 'isoV') {
      W = 0; Q = dU;
      parts = [{ Q: Q, Tlo: Math.min(A.T, B.T), Thi: Math.max(A.T, B.T) }];
      at = function (u) { const T = A.T + u * (B.T - A.T); return { P: n * R * T / A.V, V: A.V, T: T }; };
      dQdu = function () { return n * G.Cv * (B.T - A.T); };
    } else if (kind === 'isoP') {
      W = -A.P * dV;
      Q = n * G.Cp * (B.T - A.T);
      parts = [{ Q: Q, Tlo: Math.min(A.T, B.T), Thi: Math.max(A.T, B.T) }];
      at = function (u) { const V = A.V + u * dV; return { P: A.P, V: V, T: A.P * V / (n * R) }; };
      dQdu = function () { return n * G.Cp * (B.T - A.T); };
    } else if (kind === 'line') {
      if (dV === 0) throw new Error('直線段的兩端體積相同，應該用等容過程');
      const b = (B.P - A.P) / dV, a = A.P - b * A.V;
      Pof = { a: a, b: b };
      // 數值穩定的寫法（近乎鉛直的直線 a 會非常大，a + bV 相消）：以端點 A 為基準，P(V) = A.P + b(V − A.V)
      const Pat = function (V) { return A.P + b * (V - A.V); };
      // 一小段 [V0, V1] 的吸熱：∫dQ = (C_V/R + 1)·P̄·ΔV + (C_V/R)·ΔP·V̄（P̄、V̄ 為中點），與 ΔU − W 恆等
      const Qof = function (V0, V1) { const P0 = Pat(V0), P1 = Pat(V1); return (G.cv + 1) * (P0 + P1) / 2 * (V1 - V0) + G.cv * (P1 - P0) * (V0 + V1) / 2; };
      W = -(A.P + B.P) / 2 * dV;
      Q = Qof(A.V, B.V);
      const cuts = [A.V];
      if (b !== 0) {
        // dQ/dV = (C_V/R + 1)P + (C_V/R)bV = 0 → V* = (C_V/R + 1)(V_A − P_A/b) / (2C_V/R + 1)，即 −(C_V/R + 1)a / [(2C_V/R + 1)b]
        const Vs = (G.cv + 1) * (A.V - A.P / b) / (2 * G.cv + 1);
        const lo = Math.min(A.V, B.V), hi = Math.max(A.V, B.V), eps = 1e-12 * (hi - lo);
        if (Vs > lo + eps && Vs < hi - eps) cuts.push(Vs);
      }
      cuts.push(B.V);
      parts = [];
      for (let i = 0; i + 1 < cuts.length; i++) {
        const tr = lineTRange(n, a, b, cuts[i], cuts[i + 1], A);
        parts.push({ Q: Qof(cuts[i], cuts[i + 1]), Tlo: tr[0], Thi: tr[1], V0: cuts[i], V1: cuts[i + 1] });
      }
      at = function (u) { const V = A.V + u * dV; const P = Pat(V); return { P: P, V: V, T: P * V / (n * R) }; };
      dQdu = function (u) { const V = A.V + u * dV; return ((G.cv + 1) * Pat(V) + G.cv * b * V) * dV; };
    } else throw new Error('未知的過程：' + kind);
    // 分段吸放熱（回熱器內部交換的不算外界）
    let Qin = 0, Qout = 0, absorbTmax = -Infinity, rejectTmin = Infinity;
    parts.forEach(function (p) {
      if (p.Q > 0) { Qin += p.Q; absorbTmax = Math.max(absorbTmax, p.Thi); }
      else if (p.Q < 0) { Qout -= p.Q; rejectTmin = Math.min(rejectTmin, p.Tlo); }
    });
    // 溫度範圍
    let Tmin = Math.min(A.T, B.T), Tmax = Math.max(A.T, B.T);
    if (kind === 'line') { const tr = lineTRange(n, Pof.a, Pof.b, A.V, B.V, A); Tmin = tr[0]; Tmax = tr[1]; }
    return {
      kind: kind, role: opt.role || kind, internal: !!opt.internal, n: n, gas: G.id,
      A: A, B: B, Q: Q, W: W, dU: dU, dS: dS, Qin: Qin, Qout: Qout, parts: parts,
      absorbTmax: absorbTmax, rejectTmin: rejectTmin, Tmin: Tmin, Tmax: Tmax, line: Pof,
      at: at, dQdu: dQdu,
      dWdu: function (u) { return kind === 'isoV' ? 0 : -at(u).P * dV; }  // 外界對氣體作功的速率（每單位 u）
    };
  }
  /** 同一段過程反方向走（端點對調，用同樣的公式重算） */
  function reverseSegment(s) {
    return segment(s.kind, s.n, s.gas, s.B, s.A, { role: s.role, internal: s.internal });
  }

  // ---------------- 循環總結 ----------------
  function summarize(c) {
    let Q = 0, W = 0, dU = 0, dS = 0, Qin = 0, Qout = 0, Qint = 0, Tmax = -Infinity, Tmin = Infinity, TcEff = -Infinity, ThEff = Infinity;
    c.segs.forEach(function (s) {
      Q += s.Q; W += s.W; dU += s.dU; dS += s.dS;
      Tmax = Math.max(Tmax, s.Tmax); Tmin = Math.min(Tmin, s.Tmin);
      if (s.internal) { Qint += s.Qin; return; }
      Qin += s.Qin; Qout += s.Qout;
      if (s.Qin > 0) TcEff = Math.max(TcEff, s.absorbTmax);
      if (s.Qout > 0) ThEff = Math.min(ThEff, s.rejectTmin);
    });
    const Wout = -W;
    const sc = Math.max(Qin, Qout, Math.abs(Wout), 1e-300);
    const zero = Math.abs(Wout) <= 1e-12 * sc;
    c.Q = Q; c.W = W; c.dU = dU; c.dS = dS;
    c.Wout = Wout; c.Qin = Qin; c.Qout = Qout; c.Qinternal = Qint;
    c.Tmax = Tmax; c.Tmin = Tmin;
    c.etaC = Tmax > 0 ? 1 - Tmin / Tmax : 0;
    c.engine = Wout > 0 && !zero;
    c.fridge = Wout < 0 && !zero;
    c.eta = Qin > 0 ? Wout / Qin : 0;
    c.ratio = c.etaC > 0 ? c.eta / c.etaC : NaN;
    if (c.fridge) {
      const Win = -Wout;
      c.Win = Win;
      c.KR = Qin / Win;
      c.KHP = Qout / Win;
      c.TcEff = TcEff; c.ThEff = ThEff;
      const ok = TcEff > 0 && isFinite(ThEff) && TcEff < ThEff;
      c.KRC = ok ? TcEff / (ThEff - TcEff) : NaN;
      c.KHPC = ok ? ThEff / (ThEff - TcEff) : NaN;
    } else {
      c.Win = 0; c.KR = NaN; c.KHP = NaN; c.TcEff = NaN; c.ThEff = NaN; c.KRC = NaN; c.KHPC = NaN;
    }
    return c;
  }

  // ---------------- 各種循環 ----------------
  function finish(c, p) {
    c.n = p.n; c.gas = gasOf(p.gas).id; c.reverse = !!p.reverse;
    if (p.reverse) {
      c.segs = c.segs.slice().reverse().map(reverseSegment);
      c.verts = c.segs.map(function (s) { return s.A; });
    } else c.verts = c.segs.map(function (s) { return s.A; });
    return summarize(c);
  }
  /** 卡諾：T_h、T_c、起點體積 V_A、等溫膨脹比 rB = V_B/V_A。等溫膨脹 → 絕熱膨脹 → 等溫壓縮 → 絕熱壓縮。 */
  function carnot(p) {
    const n = p.n, G = gasOf(p.gas);
    if (!(p.Tc > 0 && p.Th > p.Tc)) throw new Error('卡諾循環需要 T_h > T_c > 0');
    const k = Math.pow(p.Th / p.Tc, 1 / (G.gamma - 1));       // 絕熱過程的體積比 V_C/V_B = V_D/V_A
    const A = fromVT(n, p.VA, p.Th), B = fromVT(n, p.VA * p.rB, p.Th);
    const Cc = fromVT(n, p.VA * p.rB * k, p.Tc), D = fromVT(n, p.VA * k, p.Tc);
    return finish({ type: 'carnot', params: p, segs: [
      segment('isoT', n, G, A, B, { role: 'hot' }),
      segment('adiabat', n, G, B, Cc, { role: 'insul' }),
      segment('isoT', n, G, Cc, D, { role: 'cold' }),
      segment('adiabat', n, G, D, A, { role: 'insul' })
    ] }, p);
  }
  /** 奧圖（汽油引擎）：壓縮比 r、進氣 (V1, T1)、燃燒後最高溫 T3。絕熱壓縮 → 等容加熱 → 絕熱膨脹 → 等容放熱。 */
  function otto(p) {
    const n = p.n, G = gasOf(p.gas), g1 = G.gamma - 1;
    const s1 = fromVT(n, p.V1, p.T1), s2 = fromVT(n, p.V1 / p.r, p.T1 * Math.pow(p.r, g1));
    const s3 = fromVT(n, p.V1 / p.r, p.T3), s4 = fromVT(n, p.V1, p.T3 * Math.pow(p.r, -g1));
    return finish({ type: 'otto', params: p, segs: [
      segment('adiabat', n, G, s1, s2, { role: 'insul' }),
      segment('isoV', n, G, s2, s3, { role: 'burn' }),
      segment('adiabat', n, G, s3, s4, { role: 'insul' }),
      segment('isoV', n, G, s4, s1, { role: 'exhaust' })
    ] }, p);
  }
  /** 狄塞爾（柴油引擎）：壓縮比 r、截止比 rc = V3/V2、進氣 (V1, T1)。絕熱壓縮 → 等壓加熱 → 絕熱膨脹 → 等容放熱。 */
  function diesel(p) {
    const n = p.n, G = gasOf(p.gas), g1 = G.gamma - 1;
    const s1 = fromVT(n, p.V1, p.T1);
    const V2 = p.V1 / p.r, T2 = p.T1 * Math.pow(p.r, g1);
    const s2 = fromVT(n, V2, T2), s3 = fromVT(n, V2 * p.rc, T2 * p.rc);
    const s4 = fromVT(n, p.V1, s3.T * Math.pow(s3.V / p.V1, g1));
    return finish({ type: 'diesel', params: p, segs: [
      segment('adiabat', n, G, s1, s2, { role: 'insul' }),
      segment('isoP', n, G, s2, s3, { role: 'burn' }),
      segment('adiabat', n, G, s3, s4, { role: 'insul' }),
      segment('isoV', n, G, s4, s1, { role: 'exhaust' })
    ] }, p);
  }
  /** 史特林：T_h、T_c、V_min、體積比 r = V_max/V_min、回熱器 regen。等溫膨脹 → 等容放熱 → 等溫壓縮 → 等容吸熱。 */
  function stirling(p) {
    const n = p.n, G = gasOf(p.gas);
    if (!(p.Tc > 0 && p.Th > p.Tc)) throw new Error('史特林循環需要 T_h > T_c > 0');
    const Vmax = p.Vmin * p.r;
    const A = fromVT(n, p.Vmin, p.Th), B = fromVT(n, Vmax, p.Th), Cc = fromVT(n, Vmax, p.Tc), D = fromVT(n, p.Vmin, p.Tc);
    const rg = !!p.regen;
    return finish({ type: 'stirling', regen: rg, params: p, segs: [
      segment('isoT', n, G, A, B, { role: 'hot' }),
      segment('isoV', n, G, B, Cc, { role: rg ? 'regen' : 'exhaust', internal: rg }),
      segment('isoT', n, G, Cc, D, { role: 'cold' }),
      segment('isoV', n, G, D, A, { role: rg ? 'regen' : 'heat', internal: rg })
    ] }, p);
  }
  /** 布雷頓（燃氣渦輪、噴射引擎）：壓力比 rp、進氣 (P1, T1)、最高溫 T3。絕熱壓縮 → 等壓加熱 → 絕熱膨脹 → 等壓放熱。 */
  function brayton(p) {
    const n = p.n, G = gasOf(p.gas), e = (G.gamma - 1) / G.gamma;
    const P2 = p.P1 * p.rp;
    const s1 = fromPT(n, p.P1, p.T1), s2 = fromPT(n, P2, p.T1 * Math.pow(p.rp, e));
    const s3 = fromPT(n, P2, p.T3), s4 = fromPT(n, p.P1, p.T3 * Math.pow(p.rp, -e));
    return finish({ type: 'brayton', params: p, segs: [
      segment('adiabat', n, G, s1, s2, { role: 'insul' }),
      segment('isoP', n, G, s2, s3, { role: 'burn' }),
      segment('adiabat', n, G, s3, s4, { role: 'insul' }),
      segment('isoP', n, G, s4, s1, { role: 'exhaust' })
    ] }, p);
  }
  /** 一段直線的種類：兩端同體積 → 等容；同壓力 → 等壓；其他 → 直線 */
  function edgeKind(a, b) {
    if (a.V === b.V) return 'isoV';
    if (a.P === b.P) return 'isoP';
    return 'line';
  }
  /** 自訂：P–V 圖上 3–6 個頂點 pts = [{V, P}]（SI）依序連成的多邊形（可以自己交叉）。 */
  function custom(p) {
    const n = p.n, G = gasOf(p.gas), pts = p.pts;
    if (!pts || pts.length < 3) throw new Error('自訂循環至少要 3 個頂點');
    const st = pts.map(function (q) { return fromPV(n, q.P, q.V); });
    const segs = [];
    for (let i = 0; i < st.length; i++) {
      const a = st[i], b = st[(i + 1) % st.length];
      if (a.V === b.V && a.P === b.P) continue; // 重合的頂點：沒有過程
      const k = edgeKind(a, b);
      segs.push(segment(k, n, G, a, b, { role: 'line' }));
    }
    if (segs.length < 2) throw new Error('自訂循環的頂點幾乎都重合');
    const c = finish({ type: 'custom', params: p, segs: segs }, p);
    c.crossings = crossings(pts);
    return c;
  }
  const BUILD = { carnot: carnot, otto: otto, diesel: diesel, stirling: stirling, brayton: brayton, custom: custom };
  /** 依 p.type 建立循環 */
  function cycle(p) {
    const f = BUILD[p.type];
    if (!f) throw new Error('未知的循環：' + p.type);
    return f(p);
  }

  // ---------------- 理論效率（教科書公式，用來對照） ----------------
  function etaCarnot(Th, Tc) { return 1 - Tc / Th; }
  function etaOtto(r, gamma) { return 1 - Math.pow(r, 1 - gamma); }
  function etaDiesel(r, rc, gamma) { return 1 - Math.pow(r, 1 - gamma) * (Math.pow(rc, gamma) - 1) / (gamma * (rc - 1)); }
  function etaBrayton(rp, gamma) { return 1 - Math.pow(rp, (1 - gamma) / gamma); }

  // ---------------- 多邊形工具（自訂循環） ----------------
  /** 鞋帶公式：∮P dV（V 向右、P 向上，順時針為正）＝引擎輸出的淨功 */
  function shoelace(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += (a.P + b.P) / 2 * (b.V - a.V);
    }
    return s;
  }
  /** 兩線段 p1p2 與 p3p4 是否真正相交（不含端點接觸），相交時回傳交點參數 */
  function segX(p1, p2, p3, p4) {
    const d1V = p2.V - p1.V, d1P = p2.P - p1.P, d2V = p4.V - p3.V, d2P = p4.P - p3.P;
    const den = d1V * d2P - d1P * d2V;
    if (den === 0) return null;
    const t = ((p3.V - p1.V) * d2P - (p3.P - p1.P) * d2V) / den;
    const s = ((p3.V - p1.V) * d1P - (p3.P - p1.P) * d1V) / den;
    const e = 1e-12;
    if (t <= e || t >= 1 - e || s <= e || s >= 1 - e) return null;
    return { t: t, s: s, V: p1.V + t * d1V, P: p1.P + t * d1P };
  }
  /** 多邊形自己交叉的次數（不相鄰的邊真正相交） */
  function crossings(pts) {
    const m = pts.length;
    let k = 0;
    for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) {
      if (i === 0 && j === m - 1) continue;
      if (segX(pts[i], pts[(i + 1) % m], pts[j], pts[(j + 1) % m])) k++;
    }
    return k;
  }
  /**
   * 把自己交叉的多邊形在交點拆成幾個不自交的小迴圈（各自的面積有正負，總和＝原多邊形的有號面積）。
   * 回傳 [{ pts, area }]（area = ∮P dV）。畫面用它把順時針與逆時針的部分塗成不同顏色。
   */
  function loops(pts, depth) {
    depth = depth || 0;
    const m = pts.length;
    if (m >= 3 && depth < 12) {
      for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        const x = segX(pts[i], pts[(i + 1) % m], pts[j], pts[(j + 1) % m]);
        if (!x) continue;
        const X = { V: x.V, P: x.P };
        const l1 = [X].concat(pts.slice(i + 1, j + 1));
        const l2 = pts.slice(0, i + 1).concat([X], pts.slice(j + 1));
        return loops(l1, depth + 1).concat(loops(l2, depth + 1));
      }
    }
    return m >= 3 ? [{ pts: pts, area: shoelace(pts) }] : [];
  }

  // ---------------- 由畫面單位建立循環（頁面與任務證明共用） ----------------
  /**
   * ui：{ type, gas, n, reverse, regen, carnot: {Th, Tc, VA(L), rB}, otto: {r, T1, T3, V1(L)}, diesel: {r, rc, T1, V1(L)},
   *       stirling: {Th, Tc, Vmin(L), r}, brayton: {rp, T1, T3, P1(kPa)}, custom: {pts: [[V(L), P(kPa)], …]} }
   */
  function fromDisplay(ui) {
    const t = ui.type, q = ui[t] || {}, base = { type: t, gas: ui.gas, n: ui.n, reverse: !!ui.reverse };
    if (t === 'carnot') return carnot(Object.assign(base, { Th: q.Th, Tc: q.Tc, VA: q.VA * 1e-3, rB: q.rB }));
    if (t === 'otto') return otto(Object.assign(base, { r: q.r, T1: q.T1, T3: q.T3, V1: q.V1 * 1e-3 }));
    if (t === 'diesel') return diesel(Object.assign(base, { r: q.r, rc: q.rc, T1: q.T1, V1: q.V1 * 1e-3 }));
    if (t === 'stirling') return stirling(Object.assign(base, { Th: q.Th, Tc: q.Tc, Vmin: q.Vmin * 1e-3, r: q.r, regen: !!ui.regen }));
    if (t === 'brayton') return brayton(Object.assign(base, { rp: q.rp, T1: q.T1, T3: q.T3, P1: q.P1 * 1e3 }));
    if (t === 'custom') return custom(Object.assign(base, { pts: q.pts.map(function (a) { return { V: a[0] * 1e-3, P: a[1] * 1e3 }; }) }));
    throw new Error('未知的循環：' + t);
  }

  // ---------------- 任務事件的資料（頁面與任務證明共用同一份格式；體積 L、壓力 kPa） ----------------
  /** 把循環整理成任務事件用的純數字物件 */
  function report(c) {
    const p = c.params || {}, o = {
      type: c.type, gas: c.gas, n: c.n, reverse: !!c.reverse, regen: !!c.regen, engine: !!c.engine, fridge: !!c.fridge,
      Wout: c.Wout, Qin: c.Qin, Qout: c.Qout, eta: c.eta, etaC: c.etaC, ratio: c.ratio,
      KR: c.KR, KHP: c.KHP, KRC: c.KRC, KHPC: c.KHPC, Tmax: c.Tmax, Tmin: c.Tmin,
      verts: c.verts.length, crossings: c.crossings || 0
    };
    ['Th', 'Tc', 'rB', 'r', 'rc', 'rp', 'T1', 'T3'].forEach(function (k) { if (p[k] != null) o[k] = p[k]; });
    ['VA', 'V1', 'Vmin'].forEach(function (k) { if (p[k] != null) o[k] = p[k] * 1e3; });
    if (p.P1 != null) o.P1 = p.P1 / 1e3;
    return o;
  }

  // ---------------- 數值工具（測試與畫面共用） ----------------
  /** 沿一段過程取樣 k + 1 點 */
  function sample(seg, k) {
    const out = [];
    for (let i = 0; i <= k; i++) out.push(seg.at(i / k));
    return out;
  }

  const api = {
    R: R, NA: NA, KB: KB, GASES: GASES, KINDS: KINDS, gasOf: gasOf,
    fromPV: fromPV, fromVT: fromVT, fromPT: fromPT,
    segment: segment, reverseSegment: reverseSegment, summarize: summarize, lineTRange: lineTRange,
    carnot: carnot, otto: otto, diesel: diesel, stirling: stirling, brayton: brayton, custom: custom, cycle: cycle, edgeKind: edgeKind,
    etaCarnot: etaCarnot, etaOtto: etaOtto, etaDiesel: etaDiesel, etaBrayton: etaBrayton,
    shoelace: shoelace, crossings: crossings, loops: loops, segX: segX, sample: sample, report: report, fromDisplay: fromDisplay
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HeatEngineCore = api;
})(typeof window !== 'undefined' ? window : this);
