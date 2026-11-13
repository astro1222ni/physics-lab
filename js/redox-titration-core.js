/*
 * redox-titration-core.js — 「氧化還原滴定（過錳酸鉀）」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 單位：濃度 M（mol/L）、體積 mL、莫耳數 mmol（M × mL = mmol）、時間 s、電位 V（相對於標準氫電極）。
 *
 * 反應（酸性溶液，過錳酸根還原成 Mn2+）：
 *   MnO4- + 5Fe2+ + 8H+ → Mn2+ + 5Fe3+ + 4H2O               （莫耳數比 MnO4- : Fe2+ = 1 : 5）
 *   2MnO4- + 5H2C2O4 + 6H+ → 2Mn2+ + 10CO2 + 8H2O            （莫耳數比 MnO4- : H2C2O4 = 2 : 5）
 * 酸不夠時改走生成 MnO2（棕色沉澱）的路徑，每個 MnO4- 只得 3 個電子：
 *   MnO4- + 3Fe2+ + 4H+ → MnO2 + 3Fe3+ + 2H2O
 *   2MnO4- + 3H2C2O4 + 2H+ → 2MnO2 + 6CO2 + 4H2O
 *   生成 MnO2 的比例 φ = (1 − [H+]/0.1 M)^2，[H+] ≥ 0.1 M 時 φ = 0（教學用的近似：0.05 M 時 25%、0.02 M 時 64%、中性時 100%）。
 *
 * 標準還原電位（25 °C，OpenStax Chemistry 2e 附錄 L）：Fe3+/Fe2+ 0.771 V、MnO4-/Mn2+ 1.507 V。
 * 電位：鉑電極的電位由電子平衡解出——Fe 失去的電子 = Mn 得到的電子：
 *   n_Fe·x_Fe3(E) = 5·(n_MnO4 + n_Mn2)·x_Mn2(E) + 3·n_MnO2
 *   x_Fe3 = 1/(1 + 10^((E°Fe − E)/s))、x_Mn2 = 1/(1 + 10^(5(E − E°'Mn)/s))、E°'Mn = E°Mn + (8s/5)·log[H+]、s = 0.05916 V
 *   左減右隨 E 單調遞增，二分法求根；當量點附近也不用近似式。
 *   起點（還沒加 KMnO4）的電位假設溶液中有 0.1% 的 Fe2+ 已被空氣氧化成 Fe3+。
 * 草酸與 CO2 不是可逆電對，鉑電極的電位不穩定：當量點前不給電位，過了當量點才由 MnO4-/Mn2+ 決定。
 *
 * [H+]：3 M 硫酸（第二步 HSO4- Ka = 1.2e-2）與草酸（Ka1 = 6.0e-2、Ka2 = 6.1e-5，OpenStax 附錄 H）的質子平衡，
 *   反應消耗的 H+ 從硫酸提供的質子裡扣掉；Fe3+ 的水解不考慮。
 *
 * 草酸的反應速率（教學用的示意值，不是文獻值）：MnO4- 對時間一階、Mn2+ 自催化：
 *   k = k0(T)·(1 + [Mn2+]/1.0e-4 M)，k0(65 °C) = 1/20 s^-1，活化能 60 kJ/mol（25 °C 時約慢 18 倍）。
 *   草酸超過 85 °C 會分解（每升高 5 °C 速率加倍，85 °C 時 1.0e-4 s^-1）。Fe2+ 的反應視為瞬間完成。
 * 顏色：各成分在紅、綠、藍光的吸光度相加（比爾定律，光程 4 cm，教學用近似值），換成穿透率。
 */
(function (root) {
  'use strict';

  // ======================= 常數 =======================
  const E_FE = 0.771;        // Fe3+ + e- → Fe2+（V）
  const E_MN = 1.507;        // MnO4- + 8H+ + 5e- → Mn2+ + 4H2O（V）
  const S = 0.05916;         // RT·ln10/F（25 °C，V）
  const KA_HSO4 = 1.2e-2;
  const KA1_OX = 6.0e-2, KA2_OX = 6.1e-5;
  const C_H2SO4 = 3;         // 加入的硫酸濃度（M）
  const M_OXD = 126.07;      // 草酸晶體 H2C2O4·2H2O 的莫耳質量（g/mol）
  const UNIT_ML = 0.025, UNITS_PER_ML = 40, DROP_ML = 0.05;
  const BURETTE_ML = 50, BURETTE_UNITS = BURETTE_ML * UNITS_PER_ML;
  const FE3_START = 0.001;   // 起點的 Fe3+ 比例（只影響起點附近的電位）
  const PINK_M = 4e-6;       // 肉眼看得出淡粉紅色的 [MnO4-]（M）
  const H_FULL = 0.1;        // [H+] 至少這麼多（M），MnO4- 才完全還原成 Mn2+
  const TAU_REF = 20, T_REF = 65, EA = 60000, M0 = 1.0e-4, R = 8.314;
  const T_DEC = 85, KD_REF = 1.0e-4;
  const PATH_CM = 4;

  const SYSTEMS = {
    fe: { red: 'Fe2+', e: 1, fast: true },      // 已知濃度的 Fe2+（莫耳鹽）
    ox: { red: 'H2C2O4', e: 2, fast: false },   // 已知濃度的草酸溶液
    std: { red: 'H2C2O4', e: 2, fast: false },  // 標定：精稱草酸晶體，KMnO4 濃度未知
    mx: { red: 'Fe2+', e: 1, fast: true }       // 未知 Fe2+，KMnO4 用同一瓶（濃度要先標定）
  };
  function isFe(sys) { return SYSTEMS[sys].e === 1; }

  /** 參數：{ sys, Ca（還原劑濃度 M）, Va（待測液或溶解用水 mL）, Vacid（3 M 硫酸 mL）, Cb（KMnO4 M）, T（°C）, mass（std：草酸晶體 g） } */
  function setup(o) {
    const s = SYSTEMS[o.sys];
    if (!s) throw new Error('未知的滴定組合：' + o.sys);
    const p = { sys: o.sys, Va: +o.Va, Vacid: +(o.Vacid || 0), Cb: +o.Cb, T: o.T == null ? 25 : +o.T };
    if (o.sys === 'std') { p.mass = +o.mass; p.nA = p.mass / M_OXD * 1000; p.Ca = p.nA / p.Va; }
    else { p.Ca = +o.Ca; p.nA = p.Ca * p.Va; }
    return p;
  }
  /** 當量點體積：Fe2+ 莫耳數 /5、草酸莫耳數 ×2/5，除以 KMnO4 濃度 */
  function Veq(p) { return p.nA * SYSTEMS[p.sys].e / 5 / p.Cb; }
  function moleRatio(sys) { return isFe(sys) ? [1, 5] : [2, 5]; }

  // ======================= 錐形瓶的狀態 =======================
  function createFlask(p) {
    return {
      p: p, V: 0, t: 0,
      nA: p.nA,             // 還沒反應的還原劑（Fe2+ 或草酸）
      nP: 0,                // 生成物（Fe3+；草酸時是 CO2）
      nMnO4: 0, nMn2: 0, nMnO2: 0,
      Hb: 2 * C_H2SO4 * p.Vacid,  // 硫酸提供、還沒被反應用掉的質子（mmol）
      Sul: C_H2SO4 * p.Vacid,     // 硫酸根總量（mmol）
      dec: 0,               // 分解掉的草酸
      rate: 0,              // 最近的反應速率（mmol MnO4-/s，畫氣泡用）
      ep: null, fades: [], nFades: 0
    };
  }
  function vTot(f) { return f.p.Va + f.p.Vacid + f.V; }

  /** 溶液的 [H+]（M）：硫酸＋草酸的質子平衡 */
  function hFree(f) {
    const V = vTot(f), nOx = isFe(f.p.sys) ? 0 : f.nA;
    const TH = (f.Hb + 2 * nOx) / V, Sc = f.Sul / V, Oc = nOx / V;
    if (!(TH > 1e-9)) return 1e-7;
    const g = function (h) {
      const d = h * h + h * KA1_OX + KA1_OX * KA2_OX;
      return h + Sc * h / (h + KA_HSO4) + Oc * (2 * h * h + h * KA1_OX) / d - TH;
    };
    let lo = -9, hi = Math.log10(TH) + 0.1;
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (g(Math.pow(10, m)) < 0) lo = m; else hi = m; }
    return Math.max(1e-7, Math.pow(10, (lo + hi) / 2));
  }
  /** 生成 MnO2 的比例 */
  function phiMnO2(h) { return h >= H_FULL ? 0 : Math.pow(1 - h / H_FULL, 2); }

  /** 反應 r mmol 的 MnO4-（φ 為走 MnO2 路徑的比例） */
  function react(f, r, phi) {
    if (!(r > 0)) return;
    const e = 5 - 2 * phi, fe = isFe(f.p.sys);
    f.nMnO4 -= r;
    f.nMn2 += r * (1 - phi); f.nMnO2 += r * phi;
    if (fe) { f.nA -= r * e; f.nP += r * e; f.Hb -= r * (8 * (1 - phi) + 4 * phi); }
    else { f.nA -= r * e / 2; f.nP += r * e; f.Hb -= r * (3 * (1 - phi) + phi); }
    if (f.nA < 1e-15) f.nA = 0;
    if (f.nMnO4 < 1e-18) f.nMnO4 = 0;
  }
  /** Fe2+ 的反應瞬間完成（分小步，[H+] 隨反應改變） */
  function reactFast(f) {
    let guard = 0;
    while (f.nMnO4 > 0 && f.nA > 0 && guard++ < 200) {
      const phi = phiMnO2(hFree(f)), e = 5 - 2 * phi;
      const cap = Math.max(f.nA / e, 0);
      // 每一小步最多反應 2% 的硫酸質子，[H+] 才跟得上
      const lim = Math.max(1e-6, 0.02 * Math.max(f.Hb, 0) / 8 + 1e-4);
      const r = Math.min(f.nMnO4, cap, lim);
      react(f, r, phi);
      if (r === cap) { f.nA = 0; break; }
    }
  }
  /** 加入 mL 的 KMnO4 溶液（已落進瓶中、攪勻） */
  function addTitrant(f, mL) {
    if (!(mL > 0)) return [];
    f.V += mL;
    f.nMnO4 += f.p.Cb * mL;
    if (SYSTEMS[f.p.sys].fast) reactFast(f);
    return track(f);
  }

  // ======================= 反應速率（草酸） =======================
  function k0(T) { return 1 / TAU_REF * Math.exp(-EA / R * (1 / (T + 273.15) - 1 / (T_REF + 273.15))); }
  function kRate(f) { return k0(f.p.T) * (1 + f.nMn2 / vTot(f) / M0); }
  function kDec(T) { return T <= T_DEC ? 0 : KD_REF * Math.pow(2, (T - T_DEC) / 5); }
  /** 時間前進 dt 秒；傳回這段時間內「粉紅色消失」的事件 */
  function advance(f, dt) {
    const out = [];
    if (!(dt > 0)) return out;
    const fast = SYSTEMS[f.p.sys].fast;
    let left = dt, reacted = 0;
    while (left > 1e-12) {
      let h = Math.min(left, 0.05);
      if (!fast && f.nMnO4 > 0 && f.nA > 0) {
        const k = kRate(f);
        h = Math.min(h, Math.max(0.002, 0.15 / k));
        const phi = phiMnO2(hFree(f)), e = 5 - 2 * phi;
        const r = Math.min(f.nMnO4 * (1 - Math.exp(-k * h)), f.nA / (e / 2));
        react(f, r, phi);
        reacted += r;
      }
      const kd = fast ? 0 : kDec(f.p.T);
      if (kd > 0 && f.nA > 0) { const d = f.nA * (1 - Math.exp(-kd * h)); f.nA -= d; f.dec += d; f.Hb += 0; }
      f.t += h; left -= h;
      Array.prototype.push.apply(out, track(f));
    }
    f.rate = reacted / dt;
    return out;
  }
  /** 粉紅色的段落：出現時開始計時、消失時記一筆 */
  function track(f) {
    const c = f.nMnO4 / vTot(f), out = [];
    if (c >= PINK_M) {
      if (!f.ep) f.ep = { t0: f.t, Vstart: f.V, peak: c };
      else if (c > f.ep.peak) f.ep.peak = c;
    } else if (f.ep) {
      const ev = { dur: f.t - f.ep.t0, peak: f.ep.peak, Vstart: f.ep.Vstart, V: f.V, first: f.nFades === 0 };
      f.nFades++;
      f.fades.push(ev);
      f.ep = null;
      out.push(ev);
    }
    return out;
  }
  function pink(f) { return f.nMnO4 / vTot(f) >= PINK_M; }
  function held(f) { return f.ep ? f.t - f.ep.t0 : 0; }

  // ======================= 電位 =======================
  function E2prime(h) { return E_MN + 8 * S / 5 * Math.log10(h); }
  /** 鉑電極的電位（V）；草酸還有剩時傳回 null（不可逆電對，讀數不穩定） */
  function potential(f) {
    const h = hFree(f), E2 = E2prime(h);
    if (!isFe(f.p.sys)) {
      if (f.nA > 1e-9 * f.p.nA || !(f.nMnO4 > 0) || !(f.nMn2 > 0)) return null;
      return E2 + S / 5 * Math.log10(f.nMnO4 / f.nMn2);
    }
    const F = f.p.nA, Mt = f.nMnO4 + f.nMn2, x2 = f.nMnO2;
    const G = function (E) {
      const xFe = 1 / (1 + Math.pow(10, (E_FE - E) / S));
      const xMn2 = 1 / (1 + Math.pow(10, 5 * (E - E2) / S));
      return F * xFe - 5 * Mt * xMn2 - 3 * x2;
    };
    let lo = -0.5, hi = 2.5;
    for (let i = 0; i < 90; i++) { const m = (lo + hi) / 2; if (G(m) < 0) lo = m; else hi = m; }
    const E = (lo + hi) / 2;
    const floor = E_FE + S * Math.log10(FE3_START / (1 - FE3_START));
    return Math.max(E, floor);
  }
  /** 加入 V mL 的 KMnO4 之後的狀態（全部反應完；草酸的反應也當作已完成） */
  function stateAt(p, V) {
    const f = createFlask(p);
    if (V > 0) {
      const steps = Math.max(1, Math.ceil(V / 0.5));
      for (let i = 0; i < steps; i++) {
        f.V += V / steps; f.nMnO4 += p.Cb * V / steps;
        if (isFe(p.sys)) reactFast(f);
        else {
          let g = 0;
          while (f.nMnO4 > 0 && f.nA > 0 && g++ < 200) {
            const phi = phiMnO2(hFree(f)), e = 5 - 2 * phi;
            react(f, Math.min(f.nMnO4, f.nA / (e / 2), 1e-4 + 0.02 * Math.max(f.Hb, 0) / 3), phi);
          }
        }
      }
    }
    return f;
  }
  function E_at(p, V) { return potential(stateAt(p, V)); }
  /** 當量點的電位：加權平均 (E°Fe + 5E°'Mn)/6，E°'Mn 用當量點時的 [H+] */
  function Eeq(p) {
    const f = stateAt(p, Veq(p));
    return (E_FE + 5 * E2prime(hFree(f))) / 6;
  }

  // ======================= 顏色 =======================
  // 每 M 每 cm 的吸光度（紅、綠、藍；教學用近似值）。KMnO4 的吸收峰在 525–545 nm（綠光）
  const ABS = {
    MnO4: [180, 2400, 520],
    Fe3: [0, 0.08, 0.9],
    Fe2: [0.25, 0.02, 0.1],
    MnO2: [90, 160, 280]
  };
  function absorbance(f) {
    const V = vTot(f), fe = isFe(f.p.sys), A = [0, 0, 0];
    const add = function (k, c) { for (let i = 0; i < 3; i++) A[i] += ABS[k][i] * c * PATH_CM; };
    add('MnO4', f.nMnO4 / V);
    add('MnO2', f.nMnO2 / V);
    if (fe) { add('Fe3', f.nP / V); add('Fe2', f.nA / V); }
    return A;
  }
  /** 穿透率 [r, g, b]（0–1）與混濁度（MnO2 沉澱，0–1） */
  function transmit(f) {
    const A = absorbance(f);
    return { T: A.map(function (a) { return Math.pow(10, -Math.min(a, 6)); }), turb: Math.min(1, f.nMnO2 / vTot(f) / 2e-3) };
  }
  /** 只有某濃度 KMnO4 時的穿透率（滴定管、滴落處） */
  function mnO4Transmit(c, cm) { return ABS.MnO4.map(function (a) { return Math.pow(10, -Math.min(6, a * c * (cm == null ? PATH_CM : cm))); }); }

  // ======================= 未知樣品 =======================
  /** KMnO4 濃度 0.0150–0.0250 M（取到 0.0001）、Fe2+ 濃度 0.0600–0.1400 M（取到 0.001） */
  function mysterySample(rng) {
    rng = rng || Math.random;
    return { Cb: Math.round(150 + rng() * 100) / 10000, CFe: Math.round(60 + rng() * 80) / 1000 };
  }
  /** 標定：草酸晶體 m g 用去 V mL → KMnO4 濃度 */
  function cbFromStd(mass, V) { return mass / M_OXD * 1000 * 2 / 5 / V; }
  /** 未知 Fe2+：用去 V mL、KMnO4 濃度 Cb、取樣 Va mL → Fe2+ 濃度 */
  function cFeFrom(Cb, V, Va) { return 5 * Cb * V / Va; }

  // ======================= 一次實驗的紀錄（頁面與任務證明共用） =======================
  // 體積一律記成「半滴」的整數倍 u（1 單位 = 0.025 mL）。
  // run.out：這一瓶從滴定管流出的總量；run.fill：滴定管讀數（補充後歸零）；run.u：已落進瓶中的量。
  const MAX_ARCHIVE = 5;     // 圖上最多留 5 條舊曲線
  const MNO2_SEEN = 1e-4;    // 看得出棕色混濁的 MnO2（M）
  const NEAR = 0.05;         // 「停在半當量點、兩倍當量點」的容許值（mL）

  function createSession(rng) {
    const S = { archive: [], flaskNo: 0, firsts: [], at2: [], sample: null, sampleNo: 0, run: null, rng: rng || Math.random };
    newSample(S);
    return S;
  }
  function newSample(S) {
    const s = mysterySample(S.rng);
    S.sample = { Cb: s.Cb, CFe: s.CFe, no: ++S.sampleNo, flasks: { std: 0, mx: 0 }, revealed: false };
  }
  /** 換一瓶：o = { sys, Ca, Va, Vacid, Cb, T, mass, meter }；std、mx 的 KMnO4 用未知樣品，mx 的 Fe2+ 濃度也是 */
  function newRun(S, o, keepOld) {
    const r0 = S.run;
    if (keepOld !== false && r0 && r0.u > 0) {
      S.archive.unshift(r0);
      if (S.archive.length > MAX_ARCHIVE) S.archive.pop();
    }
    const q = Object.assign({}, o);
    if (o.sys === 'std' || o.sys === 'mx') q.Cb = S.sample.Cb;
    if (o.sys === 'mx') q.Ca = S.sample.CFe;
    const p = setup(q), f = createFlask(p), E = potential(f);
    S.run = {
      p: p, f: f, u: 0, out: 0, fill: 0, Veq: Veq(p), Eeq: isFe(p.sys) ? Eeq(p) : null, E: E,
      pts: [{ u: 0, E: E, m: !!o.meter }], rows: [{ u: 0, E: o.meter ? E : null, pink: false }],
      endpoint: null, meterUsed: false, halfSeen: false, no: 0, counted: false, firstDur: null,
      sample: (p.sys === 'std' || p.sys === 'mx') ? S.sample : null
    };
    return S.run;
  }
  function clearAll(S, o) {
    S.archive = []; S.flaskNo = 0; S.firsts = []; S.at2 = [];
    newRun(S, o, false);
  }
  /** 從滴定管放出 n 個單位：傳回實際放出的量（流空了是 0） */
  function release(S, n, meter) {
    const r = S.run, left = BURETTE_UNITS - r.fill;
    if (left <= 0) return 0;
    n = Math.min(n, left);
    r.out += n; r.fill += n;
    if (meter) r.meterUsed = true;
    if (r.sample && !r.counted) { r.counted = true; r.sample.flasks[r.p.sys]++; }
    if (!r.no) r.no = ++S.flaskNo;
    return n;
  }
  function fades(S, list) {
    const r = S.run;
    list.forEach(function (e) {
      if (e.first) {
        r.firstDur = e.dur;
        S.firsts.push({ sys: r.p.sys, T: r.p.T, dur: e.dur, Vstart: e.Vstart, Cb: r.p.Cb, no: r.no });
        if (S.firsts.length > 20) S.firsts.shift();
      }
    });
    return list;
  }
  /** 液體落進瓶中（攪勻）：傳回粉紅色消失的事件 */
  function land(S, n, meter) {
    const r = S.run;
    r.u += n;
    const ev = addTitrant(r.f, n / UNITS_PER_ML);
    r.E = potential(r.f);
    r.pts.push({ u: r.u, E: r.E, m: !!meter });
    return fades(S, ev);
  }
  /** 時間前進 dt 秒（草酸的反應、分解、粉紅色持續多久） */
  function tick(S, dt) {
    const r = S.run, ev = advance(r.f, dt);
    if (!SYSTEMS[r.p.sys].fast) {
      r.E = potential(r.f);
      const last = r.pts[r.pts.length - 1];
      if (last && last.u === r.u) last.E = r.E;
    }
    return fades(S, ev);
  }
  function curves(S) {
    return S.archive.concat(S.run.u > 0 ? [S.run] : []).map(function (q) {
      return { sys: q.p.sys, Ca: q.p.Ca, Va: q.p.Va, Vacid: q.p.Vacid, Cb: q.p.Cb, T: q.p.T, Vmax: q.u / UNITS_PER_ML, Veq: q.Veq, no: q.no };
    });
  }
  /** 任務事件的共同資料 */
  function eventData(S, meter) {
    const r = S.run, p = r.p, f = r.f, V = vTot(f), red = f.nMnO2 + f.nMn2;
    return {
      sys: p.sys, Ca: p.Ca, Va: p.Va, Vacid: p.Vacid, Cb: p.Cb, T: p.T, mass: p.mass == null ? null : p.mass,
      V: r.u / UNITS_PER_ML, Vread: r.fill / UNITS_PER_ML, Vout: r.out / UNITS_PER_ML, Veq: r.Veq,
      E: meter ? r.E : null, Eeq: r.Eeq, meter: !!meter, meterUsed: r.meterUsed,
      pink: pink(f), cMnO4: f.nMnO4 / V, held: held(f), mno2: f.nMnO2 / V >= MNO2_SEEN, fMnO2: red > 0 ? f.nMnO2 / red : 0,
      H: hFree(f), excess: f.nA <= 0, empty: r.fill >= BURETTE_UNITS, halfSeen: r.halfSeen, firstDur: r.firstDur,
      mystery: p.sys === 'std' || p.sys === 'mx', curves: curves(S), at2: S.at2.slice(), firsts: S.firsts.slice()
    };
  }
  /** 一次加入的液體都落進瓶中、停下來：記一列數據，傳回 'settle' 事件的資料 */
  function settle(S, meter) {
    const r = S.run, V = r.u / UNITS_PER_ML;
    const row = { u: r.u, E: meter ? r.E : null, pink: pink(r.f) };
    const last = r.rows[r.rows.length - 1];
    if (last && last.u === r.u) r.rows[r.rows.length - 1] = row; else r.rows.push(row);
    if (r.rows.length > 600) r.rows.splice(1, r.rows.length - 600);
    if (meter && isFe(r.p.sys) && r.E != null) {
      if (Math.abs(V - r.Veq / 2) <= NEAR + 1e-9) r.halfSeen = true;
      if (Math.abs(V - 2 * r.Veq) <= NEAR + 1e-9 && r.fill < BURETTE_UNITS) {
        const red = r.f.nMnO2 + r.f.nMn2;
        S.at2 = S.at2.filter(function (x) { return x.no !== r.no; });
        S.at2.push({ no: r.no, Vacid: r.p.Vacid, H: hFree(r.f), E: r.E, fMnO2: red > 0 ? r.f.nMnO2 / red : 0 });
        if (S.at2.length > 10) S.at2.shift();
      }
    }
    return eventData(S, meter);
  }
  function fadeData(S, ev, meter) {
    return Object.assign(eventData(S, meter), { dur: ev.dur, peak: ev.peak, Vstart: ev.Vstart, first: ev.first });
  }
  /** 「記錄終點」：終點體積是這一瓶流出的總量 */
  function endpoint(S, meter) {
    const r = S.run;
    r.endpoint = r.out / UNITS_PER_ML;
    if (meter) r.meterUsed = true;
    return Object.assign(eventData(S, meter), { Vend: r.endpoint, err: r.endpoint - r.Veq });
  }
  /** 未知樣品的答案：cMn（KMnO4 M）、cFe（Fe2+ M），沒填是 NaN */
  function answer(S, cMn, cFe) {
    const s = S.sample;
    return {
      cMn: cMn, cFe: cFe, errMn: cMn > 0 ? cMn / s.Cb - 1 : NaN, errFe: cFe > 0 ? cFe / s.CFe - 1 : NaN,
      revealed: s.revealed, flasksStd: s.flasks.std, flasksMx: s.flasks.mx
    };
  }

  const api = {
    E_FE: E_FE, E_MN: E_MN, S: S, KA_HSO4: KA_HSO4, KA1_OX: KA1_OX, KA2_OX: KA2_OX, C_H2SO4: C_H2SO4, M_OXD: M_OXD,
    UNIT_ML: UNIT_ML, UNITS_PER_ML: UNITS_PER_ML, DROP_ML: DROP_ML, BURETTE_ML: BURETTE_ML, BURETTE_UNITS: BURETTE_UNITS,
    FE3_START: FE3_START, PINK_M: PINK_M, H_FULL: H_FULL, TAU_REF: TAU_REF, T_REF: T_REF, EA: EA, M0: M0, T_DEC: T_DEC, KD_REF: KD_REF, PATH_CM: PATH_CM,
    SYSTEMS: SYSTEMS, isFe: isFe, setup: setup, Veq: Veq, moleRatio: moleRatio,
    createFlask: createFlask, vTot: vTot, hFree: hFree, phiMnO2: phiMnO2, addTitrant: addTitrant, advance: advance,
    k0: k0, kRate: kRate, kDec: kDec, pink: pink, held: held,
    E2prime: E2prime, potential: potential, stateAt: stateAt, E_at: E_at, Eeq: Eeq,
    ABS: ABS, absorbance: absorbance, transmit: transmit, mnO4Transmit: mnO4Transmit,
    mysterySample: mysterySample, cbFromStd: cbFromStd, cFeFrom: cFeFrom,
    MAX_ARCHIVE: MAX_ARCHIVE, MNO2_SEEN: MNO2_SEEN, NEAR: NEAR,
    createSession: createSession, newSample: newSample, newRun: newRun, clearAll: clearAll, release: release, land: land, tick: tick,
    curves: curves, eventData: eventData, settle: settle, fadeData: fadeData, endpoint: endpoint, answer: answer
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RedoxCore = api;
})(typeof window !== 'undefined' ? window : this);
