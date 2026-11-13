/*
 * colligative-properties-core.js — 「沸點上升與凝固點下降」的化學核心（CollCore，不碰 DOM，瀏覽器與 Node 共用）
 *
 * 模型（都寫在頁面〈模擬方法〉）：
 *  - 稀薄溶液定律：ΔTf = i·Kf·m、ΔTb = i·Kb·m，m 是「還是液體的溶劑」裡的重量莫耳濃度。
 *    凝固時析出的是純溶劑，沸騰（沒有回流）時跑掉的也是純溶劑，所以剩下的溶液越來越濃，凝固點一路下降、沸點一路上升。
 *  - 凝固點模式：試管套在空氣套管裡、放進冷浴，牛頓冷卻 C·dT/dt = −h(T − T浴) + Lf·r；r 是溶劑結冰的速率（g/s）。
 *    沒有晶核之前液體可以過冷；過冷到一定深度（或加晶種）才開始結晶，r = G·(Tf(ws) − T)，G 很大，所以溫度很快回升、貼著凝固點走。
 *  - 沸點模式：加熱板功率 P，C·dT/dt = P − hL(T − T室) − Lv·r；有沸石時 T 超過沸點就沸騰，r = G·(T − Tb(ws))；
 *    沒有沸石會過熱，到過熱深度才突沸。裝回流冷凝管時蒸氣冷凝流回，溶劑量不變。
 *  - 溫度計：時間常數 2 s，讀數取到 0.01 °C。
 *  - 硬方程式（G 很大）用半隱式積分，每一小步 0.01 s。
 * 數據：Kb、Kf、正常沸點與凝固點取自 OpenStax《Chemistry 2e》表 11.2（環己烷取 CRC 手冊的 Kf = 20.2、凝固點 6.4 °C）；
 *       實測凡特荷夫因子取自 OpenStax 表 11.3（0.050 m 水溶液）；熔化熱、汽化熱、比熱取自 NIST 化學網路書與 CRC 手冊。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CollCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 溶劑 ----------
  // Tf、Tb：°C；Kf、Kb：K·kg/mol；M：g/mol；Lf、Lv：J/g；cp：J/(g·K)；rho：g/mL；dHvap：kJ/mol（3D 蒸氣壓示意用）
  const SOLVENTS = {
    water: { key: 'water', zh: '水', en: 'water', f: 'H2O', Tf: 0.0, Kf: 1.86, Tb: 100.0, Kb: 0.512, M: 18.015, Lf: 333.6, Lv: 2257, cp: 4.18, rho: 1.00, dHvap: 40.65 },
    benzene: { key: 'benzene', zh: '苯', en: 'benzene', f: 'C6H6', Tf: 5.5, Kf: 5.12, Tb: 80.1, Kb: 2.53, M: 78.11, Lf: 126.4, Lv: 393.3, cp: 1.74, rho: 0.877, dHvap: 30.72 },
    cyclohexane: { key: 'cyclohexane', zh: '環己烷', en: 'cyclohexane', f: 'C6H12', Tf: 6.4, Kf: 20.2, Tb: 80.7, Kb: null, M: 84.16, Lf: 31.8, Lv: 357, cp: 1.85, rho: 0.779, dHvap: 30.0 },
    acetic: { key: 'acetic', zh: '冰醋酸', en: 'glacial acetic acid', f: 'CH3COOH', Tf: 16.6, Kf: 3.9, Tb: 118.1, Kb: 3.07, M: 60.05, Lf: 195.3, Lv: 394.7, cp: 2.05, rho: 1.049, dHvap: 23.70 }
  };
  const SOLVENT_KEYS = ['water', 'benzene', 'cyclohexane', 'acetic'];

  // ---------- 溶質 ----------
  // ideal：完全解離（或不締合）的粒子數；real：實測 i（OpenStax 表 11.3，0.050 m）；ions：解離後的粒子（3D 與微觀示意用）
  const SOLUTES = {
    glucose: { key: 'glucose', zh: '葡萄糖', en: 'glucose', f: 'C6H12O6', M: 180.16, ideal: 1, real: 1.0, ions: null },
    sucrose: { key: 'sucrose', zh: '蔗糖', en: 'sucrose', f: 'C12H22O11', M: 342.30, ideal: 1, real: 1.0, ions: null },
    urea: { key: 'urea', zh: '尿素', en: 'urea', f: 'CO(NH2)2', M: 60.06, ideal: 1, real: 1.0, ions: null },
    NaCl: { key: 'NaCl', zh: '氯化鈉', en: 'sodium chloride', f: 'NaCl', M: 58.44, ideal: 2, real: 1.9, ions: ['Na', 'Cl'] },
    MgCl2: { key: 'MgCl2', zh: '氯化鎂', en: 'magnesium chloride', f: 'MgCl2', M: 95.21, ideal: 3, real: 2.7, ions: ['Mg', 'Cl', 'Cl'] },
    MgSO4: { key: 'MgSO4', zh: '硫酸鎂', en: 'magnesium sulfate', f: 'MgSO4', M: 120.37, ideal: 2, real: 1.3, ions: ['Mg', 'SO4'] },
    naph: { key: 'naph', zh: '萘', en: 'naphthalene', f: 'C10H8', M: 128.17, ideal: 1, real: 1.0, ions: null },
    benzoic: { key: 'benzoic', zh: '苯甲酸', en: 'benzoic acid', f: 'C6H5COOH', M: 122.12, ideal: 1, real: 0.5, ions: null, dimer: true },
    X: { key: 'X', zh: '未知物 X', en: 'unknown X', f: 'X', M: 150, ideal: 1, real: 1.0, ions: null }
  };
  const SOLUTES_FOR = {
    water: ['glucose', 'sucrose', 'urea', 'NaCl', 'MgCl2', 'MgSO4'],
    benzene: ['naph', 'benzoic'],
    cyclohexane: ['naph', 'benzoic'],
    acetic: ['naph']
  };
  const M_MAX = 2.0;           // 已知溶質的重量莫耳濃度上限（mol/kg）
  const X_MASS_FRAC = 0.15;    // 未知物最多加溶劑質量的 15%（不用 M 算上限，以免洩漏答案）
  const C_TUBE = 15;           // 試管、溫度計、攪拌棒的熱容量 J/K
  const C_FLASK = 40;          // 燒瓶的熱容量 J/K
  const H_LOSS = 0.35;         // 燒瓶散熱係數 W/K
  const H_TUBE = 0.5;          // 試管（含空氣套管）對冷浴的傳熱係數 W/K（50 g 溶劑時）
  const TAU_TH = 2;            // 溫度計時間常數 s
  const DT = 0.01;             // 積分小步 s
  const T_MAX = 2400;          // 一次實驗最長 s
  const FROZEN_MAX = 0.6;      // 結冰到 60% 就結束（再多就遠離稀薄溶液）
  const FIT_FRAC = 0.08;       // 外插的直線段最多涵蓋再結冰（蒸發）8%
  const BOIL_MIN = 0.5;        // 沒有回流時溶劑剩一半就停止加熱

  function iOf(soKey, ideal) { const s = SOLUTES[soKey]; return ideal ? s.ideal : s.real; }
  function isElectrolyte(soKey) { return !!SOLUTES[soKey].ions; }
  function canBoil(svKey) { return SOLVENTS[svKey].Kb != null; }
  /** 溶質質量滑桿的上限（g） */
  function maxSoluteMass(svKey, soKey, w1, M) {
    if (soKey === 'X') return Math.floor(X_MASS_FRAC * w1 * 100) / 100;
    return Math.floor(M_MAX * (M || SOLUTES[soKey].M) * w1 / 1000 * 100) / 100;
  }
  /** 浴溫滑桿範圍 */
  // 冷浴的範圍：凝固點常數很大的溶劑（環己烷 Kf 20.2）溶液的凝固點降得多，冷浴要能更冷
  function bathRange(svKey) {
    const sv = SOLVENTS[svKey], t = sv.Tf, big = sv.Kf > 10;
    return { min: Math.round(t - (big ? 35 : 25)), max: Math.round(t - 2), def: Math.round(t - (big ? 20 : 10)) };
  }
  /** 過冷深度（K）：攪拌越少、冷浴越冷，越深 */
  function supercoolDepth(stir, Tf0, Tbath) { return (stir ? 0.8 : 2.4) + 0.05 * Math.max(0, Tf0 - Tbath); }
  /** 過熱深度（K），沒有沸石時 */
  function superheatDepth(P) { return 2.5 + P / 80; }

  /**
   * 建立一次實驗。o：{ mode: 'f'｜'b', solvent, solute, w1（g）, w2（g）, ideal, stir, chips, reflux, Tbath, P（W）, Troom, M（未知物的莫耳質量） }
   */
  function createRun(o) {
    const sv = SOLVENTS[o.solvent], so = SOLUTES[o.solute];
    const M = o.solute === 'X' ? o.M : so.M;
    const i = o.solute === 'X' ? 1 : iOf(o.solute, !!o.ideal);
    const Troom = o.Troom == null ? 25 : o.Troom;
    const w1 = o.w1, w2 = Math.max(0, o.w2 || 0);
    const r = {
      mode: o.mode, sv: sv, so: so, solvent: o.solvent, solute: o.solute, M: M, i: i, ideal: !!o.ideal,
      w1: w1, w2: w2, n2: w2 / M, ws: w1, stir: !!o.stir, chips: o.chips !== false, reflux: !!o.reflux,
      Tbath: o.Tbath, P: o.P || 100, Troom: Troom,
      T: Troom, Tth: Troom, t: 0, rate: 0,
      nucleated: false, tNuc: null, superDepth: 0,    // 凝固：是否已結晶、何時、過冷多深（真實溫度低於當時凝固點多少）
      boiling: false, tBoil: null, bumped: false, superMax: 0, // 沸騰：是否已沸騰、何時、是否突沸、最大過熱
      ended: false, endReason: '', seeded: false
    };
    r.C = w1 * sv.cp + (o.mode === 'f' ? C_TUBE : C_FLASK);
    r.h = o.mode === 'f' ? H_TUBE * Math.pow(w1 / 50, 2 / 3) : H_LOSS;   // 試管外有空氣套管，冷得慢而均勻
    r.depth = o.mode === 'f' ? supercoolDepth(r.stir, sv.Tf, o.Tbath) : (r.chips ? 0 : superheatDepth(r.P));
    r.G = o.mode === 'f' ? 20000 / sv.Lf : 20000 / sv.Lv;  // 相變速率係數 g/(s·K)
    return r;
  }
  function molalityOf(run, ws) { return run.n2 * 1000 / (ws == null ? run.ws : ws); }
  /** 這一刻液體部分的凝固點（°C） */
  function Tf(run, ws) { return run.sv.Tf - run.i * run.sv.Kf * molalityOf(run, ws); }
  /** 這一刻液體部分的沸點（°C） */
  function Tb(run, ws) { return run.sv.Tb + run.i * run.sv.Kb * molalityOf(run, ws); }
  function frozenFrac(run) { return run.mode === 'f' ? 1 - run.ws / run.w1 : 0; }
  function lostFrac(run) { return run.mode === 'b' ? 1 - run.ws / run.w1 : 0; }
  /** 理論值（以開始時的溶液計算） */
  function theory(run) {
    const m = molalityOf(run, run.w1);
    const K = run.mode === 'f' ? run.sv.Kf : run.sv.Kb;
    const dT = run.i * K * m;
    return { m: m, K: K, dT: dT, T0: run.mode === 'f' ? run.sv.Tf : run.sv.Tb, Tsol: run.mode === 'f' ? run.sv.Tf - dT : run.sv.Tb + dT };
  }

  function stepSmall(run, h) {
    const C = run.C;
    if (run.mode === 'f') {
      const tf = Tf(run);
      if (!run.nucleated && run.T <= tf - run.depth + 1e-12) nucleate(run);
      let r = 0;
      if (run.nucleated) {
        // 半隱式：T' = (T + h/C·(−hc(T − Tb) + Lf·G·Tf)) / (1 + h·Lf·G/C)
        const a = run.sv.Lf * run.G / C;
        let Tn = (run.T + h / C * (-run.h * (run.T - run.Tbath)) + h * a * tf) / (1 + h * a);
        r = run.G * (tf - Tn);
        if (r < 0 && run.ws >= run.w1 - 1e-9) { r = 0; Tn = run.T + h / C * (-run.h * (run.T - run.Tbath)); }
        if (r < 0) r = Math.max(r, -(run.w1 - run.ws) / h);
        run.T = Tn;
        run.ws -= r * h;
      } else {
        run.T += h / C * (-run.h * (run.T - run.Tbath));
        run.superDepth = Math.max(run.superDepth, tf - run.T);
      }
      run.rate = r;
      if (1 - run.ws / run.w1 >= FROZEN_MAX) { run.ended = true; run.endReason = 'frozen'; }
    } else {
      const tb = Tb(run);
      const heat = run.P - H_LOSS * (run.T - run.Troom);
      if (!run.boiling && run.T >= tb + run.depth - 1e-12 && run.T >= tb) startBoil(run, tb);
      let r = 0;
      if (run.boiling && run.T >= tb - 0.5) {
        const a = run.sv.Lv * run.G / C;
        let Tn = (run.T + h / C * heat + h * a * tb) / (1 + h * a);
        r = run.G * (Tn - tb);
        if (r < 0) { r = 0; Tn = run.T + h / C * heat; }
        run.T = Tn;
        if (!run.reflux) run.ws -= r * h;
      } else {
        run.T += h / C * heat;
        if (!run.boiling) run.superMax = Math.max(run.superMax, run.T - tb);
      }
      run.rate = r;
      if (!run.reflux && run.ws <= BOIL_MIN * run.w1) { run.ended = true; run.endReason = 'dry'; }
    }
    run.Tth += (run.T - run.Tth) * (1 - Math.exp(-h / TAU_TH));
    run.t += h;
    if (run.t >= T_MAX - 1e-9) { run.ended = true; run.endReason = run.endReason || 'time'; }
  }
  function nucleate(run) {
    if (run.nucleated) return;
    run.nucleated = true; run.tNuc = run.t;
    run.superDepth = Math.max(run.superDepth, Tf(run) - run.T);
  }
  function startBoil(run, tb) {
    run.boiling = true; run.tBoil = run.t;
    run.superMax = Math.max(run.superMax, run.T - tb);
    if (!run.chips) run.bumped = true;
  }
  /** 加晶種：液體已經低於凝固點時立刻開始結晶；傳回是否有效 */
  function seed(run) {
    if (run.mode !== 'f' || run.nucleated || run.ended) return false;
    if (run.T >= Tf(run)) return false;
    run.seeded = true;
    nucleate(run);
    return true;
  }
  /** 前進 dt 秒（內部用 0.01 s 小步） */
  function step(run, dt) {
    let left = dt;
    while (left > 1e-12 && !run.ended) {
      const h = Math.min(DT, left);
      stepSmall(run, h);
      left -= h;
    }
  }
  function reading(run) { return Math.round(run.Tth * 100) / 100; }
  /** 記錄一筆：[t, 讀數, 結冰或蒸發的比例] */
  function sample(run) { return [Math.round(run.t * 1000) / 1000, reading(run), run.mode === 'f' ? 1 - run.ws / run.w1 : 1 - run.ws / run.w1]; }

  // ---------- 分析 ----------
  function linfit(pts) {
    const n = pts.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; syy += p[1] * p[1]; });
    const d = n * sxx - sx * sx;
    if (Math.abs(d) < 1e-12) return null;
    const b = (n * sxy - sx * sy) / d, a = (sy - b * sx) / n;
    return { a: a, b: b, n: n };
  }
  /**
   * 由記錄的讀數 rows（[t, 讀數]，每 1 s 一筆）求凝固點或沸點。
   * 直接讀：凝固＝結晶後 60 s 內的最高讀數；沸騰＝開始沸騰 10–60 s 內的最低讀數（溫度計跟上之後）。
   * 外插法：取相變段的一段直線（凝固：最高點後 5 s 起；沸騰：沸騰後 15 s 起；長 60 s，但溶劑再結冰或蒸發 8% 就截止，
   *   以免濃度變太多、線彎掉），往回延伸到與液體的冷卻（加熱）曲線相交。rows 的第 3 欄是結冰（或蒸發）的比例。
   * 傳回 { ok, need（還要記錄幾秒）, tOnset, tTurn, Tturn, line{a,b,t0,t1}, tCross, Text, Tmeas（依 method） }
   */
  function analyze(rows, run, method) {
    const f = run.mode === 'f';
    const tOn = f ? run.tNuc : run.tBoil;
    if (tOn == null) return { ok: false, need: null };
    const after = rows.filter(function (r) { return r[0] >= tOn; });
    const lastT = rows.length ? rows[rows.length - 1][0] : 0;
    // 轉折點
    let tTurn = null, Tturn = null;
    after.forEach(function (r) {
      if (f) { if (r[0] <= tOn + 60 && (Tturn == null || r[1] > Tturn)) { Tturn = r[1]; tTurn = r[0]; } }
      else if (r[0] >= tOn + 10 && r[0] <= tOn + 60 && (Tturn == null || r[1] < Tturn)) { Tturn = r[1]; tTurn = r[0]; }
    });
    const res = { ok: false, tOnset: tOn, tTurn: tTurn, Tturn: Tturn, line: null, tCross: null, Text: null, Tmeas: null, need: null };
    const turnReady = f ? (lastT >= tOn + 15) : (lastT >= tOn + 25);
    // 直線段
    const t0 = f ? (tTurn == null ? tOn + 5 : tTurn + 5) : tOn + 15;
    let seg = rows.filter(function (r) { return r[0] >= t0 && r[0] <= t0 + 60; });
    if (seg.length && seg[0][2] != null) { const f0 = seg[0][2]; seg = seg.filter(function (r) { return r[2] <= f0 + FIT_FRAC; }); }
    const full = seg.length && (seg[seg.length - 1][0] >= t0 + 60 - 1e-9 || (seg[0][2] != null && rows[rows.length - 1][2] > seg[0][2] + FIT_FRAC) || run.ended);
    const L = seg.length >= 8 && full ? linfit(seg.map(function (r) { return [r[0], r[1]]; })) : null;
    if (L) {
      res.line = { a: L.a, b: L.b, t0: t0, t1: seg[seg.length - 1][0] };
      // 往回找與液體曲線的交點
      const pre = rows.filter(function (r) { return r[0] < tOn; });
      const side = function (r) { const d = r[1] - (L.a + L.b * r[0]); return f ? d : -d; };   // > 0：在液體那一側
      let tc = null;
      for (let k = pre.length - 1; k >= 0; k--) {
        if (side(pre[k]) > 0) {
          if (k === pre.length - 1) { tc = tOn; break; }
          const s0 = side(pre[k]), s1 = side(pre[k + 1]);
          tc = pre[k][0] + (pre[k + 1][0] - pre[k][0]) * s0 / (s0 - s1);
          break;
        }
      }
      if (tc == null) tc = tOn;
      res.tCross = tc;
      res.Text = L.a + L.b * tc;
    }
    if (method === 'ext') {
      res.ok = res.Text != null;
      res.Tmeas = res.Text;
      if (!res.ok) res.need = Math.max(1, Math.ceil(t0 + 60 - lastT));
    } else {
      res.ok = turnReady && Tturn != null;
      res.Tmeas = res.ok ? Tturn : null;
      if (!res.ok) res.need = Math.max(1, Math.ceil((f ? tOn + 15 : tOn + 25) - lastT));
    }
    return res;
  }
  /**
   * 「記錄結果」的內容（頁面與任務證明共用）。
   * 傳回 { mode, solvent, solute, method, ideal, electrolyte, stir, chips, reflux, w1, w2, wt（重量百分率）, m, i, K, T0, Tmeas, dT（量到的 ΔT，> 0 表示降低或升高）,
   *        dTth, err（相對誤差；純溶劑為 null）, absErr（K）, iExp, superDepth, superMax, seeded }
   */
  function measure(run, rows, method) {
    const A = analyze(rows, run, method);
    if (!A.ok) return null;
    const th = theory(run);
    const f = run.mode === 'f';
    const dT = f ? th.T0 - A.Tmeas : A.Tmeas - th.T0;
    const m = th.m;
    return {
      mode: run.mode, solvent: run.solvent, solute: run.w2 > 0 ? run.solute : 'none', method: method, ideal: run.ideal,
      electrolyte: run.w2 > 0 && isElectrolyte(run.solute), stir: run.stir, chips: run.chips, reflux: run.reflux,
      w1: run.w1, w2: run.w2, wt: run.w2 / (run.w1 + run.w2) * 100, m: m, i: run.i, K: th.K, T0: th.T0,
      Tmeas: A.Tmeas, dT: dT, dTth: th.dT, err: th.dT > 1e-9 ? dT / th.dT - 1 : null, absErr: dT - th.dT,
      iExp: m > 1e-9 && run.solute !== 'X' ? dT / (th.K * m) : null,
      superDepth: run.superDepth, superMax: run.superMax, seeded: run.seeded, M: run.M
    };
  }
  /** 由量到的 ΔT 反求莫耳質量：M = K·w2·1000 / (ΔT·w1)（非電解質，i = 1） */
  function molarMassFrom(K, w2, w1, dT) { return K * w2 * 1000 / (dT * w1); }
  /** 過原點直線 ΔT = k·m 的斜率與決定係數 */
  function fitOrigin(pts) {
    if (pts.length < 2) return null;
    let sxx = 0, sxy = 0, my = 0;
    pts.forEach(function (p) { sxx += p[0] * p[0]; sxy += p[0] * p[1]; my += p[1]; });
    my /= pts.length;
    const k = sxy / sxx;
    let ssr = 0, sst = 0;
    pts.forEach(function (p) { ssr += Math.pow(p[1] - k * p[0], 2); sst += Math.pow(p[1] - my, 2); });
    return { k: k, r2: sst > 0 ? 1 - ssr / sst : 0 };
  }
  /** 純溶劑的飽和蒸氣壓（kPa），克勞修斯—克拉佩龍式，以正常沸點為基準（3D 示意用） */
  function vaporP(svKey, T) {
    const s = SOLVENTS[svKey];
    return 101.325 * Math.exp(-s.dHvap * 1000 / 8.314 * (1 / (T + 273.15) - 1 / (s.Tb + 273.15)));
  }
  /** 溶劑的莫耳分率（以粒子數算） */
  function solventMoleFrac(run) {
    const n1 = run.ws / run.sv.M, np = run.i * run.n2;
    return n1 / (n1 + np);
  }
  /** 未知物：莫耳質量 80–360 g/mol（非電解質、不締合，可溶於四種溶劑；虛構） */
  function newUnknown(rng) { return { M: Math.round((80 + 280 * rng()) * 10) / 10 }; }

  return {
    SOLVENTS: SOLVENTS, SOLVENT_KEYS: SOLVENT_KEYS, SOLUTES: SOLUTES, SOLUTES_FOR: SOLUTES_FOR,
    M_MAX: M_MAX, X_MASS_FRAC: X_MASS_FRAC, T_MAX: T_MAX, FROZEN_MAX: FROZEN_MAX, BOIL_MIN: BOIL_MIN, TAU_TH: TAU_TH, C_TUBE: C_TUBE, C_FLASK: C_FLASK, H_LOSS: H_LOSS,
    iOf: iOf, isElectrolyte: isElectrolyte, canBoil: canBoil, maxSoluteMass: maxSoluteMass, bathRange: bathRange,
    supercoolDepth: supercoolDepth, superheatDepth: superheatDepth,
    createRun: createRun, step: step, seed: seed, reading: reading, sample: sample, molalityOf: molalityOf, Tf: Tf, Tb: Tb,
    frozenFrac: frozenFrac, lostFrac: lostFrac, theory: theory, analyze: analyze, measure: measure, linfit: linfit,
    molarMassFrom: molarMassFrom, fitOrigin: fitOrigin, vaporP: vaporP, solventMoleFrac: solventMoleFrac, newUnknown: newUnknown
  };
});
