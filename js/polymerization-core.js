/*
 * polymerization-core.js — 「加成聚合與縮合聚合」的化學核心（與畫面無關，Node 可直接 require）
 *
 * 兩種聚合都用「一小份樣品」的隨機模擬（Gillespie 演算法，每一個反應事件都照機率發生）：
 *
 * 一、加成聚合（自由基鏈成長）：N 個單體 M、起始劑 I
 *   起始  I → 2 R•            速率 kd·[I]（起始效率視為 1）
 *   成長  R•n + M → R•(n+1)   速率 kp·[R•]·[M]
 *   終止  R•n + R•m → Pn+m（結合）或 Pn + Pm（歧化）  速率 2kt·[R•]²
 *   濃度以「單體的起始濃度」為 1（樣品體積 Ω = N），時間單位是「模擬秒」（真實的聚合要數小時，這裡按比例縮短）。
 *   穩定態：[R•] = √(kd[I]/kt)，動力鏈長 ν = kp[M] / (2√(kd·kt·[I]))；結合終止 Xn ≈ 2ν，歧化終止 Xn ≈ ν。
 *   起始劑耗盡時的極限轉化率（dead-end）：−ln(1 − x∞) = 2kp√(kd[I]0/kt) / kd。
 *
 * 二、縮合聚合（逐步成長）：AA + BB（二胺＋二酸、二醇＋二酸）或 AB（乳酸）
 *   A + B ⇌ 鍵 + 水     正反應 k·[A]·[B]，逆反應（水解）(k/K)·[鍵]·[水]；除水時水以速率 kw·[水] 被抽走
 *   任兩個分子的 A、B 端都可能相連（同一個分子的兩端不相連：不考慮成環，Flory 的假設）。
 *   卡羅瑟斯方程式（計數上恆等）：Xn = (1 + r) / (1 + r − 2rp)；r = 1 時 Xn = 1/(1 − p)。
 *   Flory 最可能分布：x 聚體的數量分率 (1 − p)p^(x−1)、重量分率 x(1 − p)²p^(x−1)，Đ = 1 + p。
 *   外加催化、除水、r = 1：1/(1 − p) = 1 + k[A]0·t（Flory 1939 的直線）。
 *   密閉（不除水）的平衡：K = x² / ((A0 − x)(B0 − x))，r = 1 時 p = √K/(1 + √K)、Xn = 1 + √K。
 *
 * 分子量：原子量用 IUPAC 慣用值（H 1.008、C 12.011、N 14.007、O 15.999、F 18.998、Cl 35.45）。
 * 加成聚合的 Mn = Xn × 單體莫耳質量（忽略起始劑碎片的端基）；縮合聚合逐個分子算（單體質量總和 − 鍵數 × 18.015）。
 */
(function (root) {
  'use strict';
  const AW = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Cl: 35.45 };
  function mm(f) { let s = 0; for (const k in f) s += AW[k] * f[k]; return s; }
  const M_H2O = mm({ H: 2, O: 1 });   // 18.015

  // ---------- 加成聚合的單體（rho：液體密度 g/mL；gas：常溫是氣體，在耐壓反應釜裡聚合） ----------
  const ADD_MON = {
    ethylene: { zh: '乙烯', en: 'ethylene', f: 'C2H4', M: mm({ C: 2, H: 4 }), gas: true, poly: ['聚乙烯', 'polyethylene'], ab: 'PE' },
    propylene: { zh: '丙烯', en: 'propene', f: 'C3H6', M: mm({ C: 3, H: 6 }), gas: true, poly: ['聚丙烯', 'polypropene'], ab: 'PP' },
    vinylchloride: { zh: '氯乙烯', en: 'chloroethene', f: 'C2H3Cl', M: mm({ C: 2, H: 3, Cl: 1 }), gas: true, poly: ['聚氯乙烯', 'poly(vinyl chloride)'], ab: 'PVC' },
    tfe: { zh: '四氟乙烯', en: 'tetrafluoroethene', f: 'C2F4', M: mm({ C: 2, F: 4 }), gas: true, poly: ['聚四氟乙烯', 'polytetrafluoroethene'], ab: 'PTFE' },
    styrene: { zh: '苯乙烯', en: 'styrene', f: 'C8H8', M: mm({ C: 8, H: 8 }), gas: false, rho: 0.906, rhoP: 1.05, poly: ['聚苯乙烯', 'polystyrene'], ab: 'PS' },
    mma: { zh: '甲基丙烯酸甲酯', en: 'methyl methacrylate', f: 'C5H8O2', M: mm({ C: 5, H: 8, O: 2 }), gas: false, rho: 0.944, rhoP: 1.18, poly: ['聚甲基丙烯酸甲酯', 'poly(methyl methacrylate)'], ab: 'PMMA' }
  };
  // ---------- 縮合聚合（A 端：胺基或羥基；B 端：羧基） ----------
  const COND = {
    nylon66: { zh: '耐綸-66', en: 'nylon-6,6', ab: false, K: 300,
      A: { zh: '己二胺', en: 'hexane-1,6-diamine', f: 'C6H16N2', M: mm({ C: 6, H: 16, N: 2 }), g: ['胺基', 'amino'] },
      B: { zh: '己二酸', en: 'hexanedioic acid', f: 'C6H10O4', M: mm({ C: 6, H: 10, O: 4 }), g: ['羧基', 'carboxyl'] },
      link: ['醯胺鍵', 'amide'], nA0: 0.100 },
    pet: { zh: 'PET（聚對苯二甲酸乙二酯）', en: 'PET (polyethylene terephthalate)', ab: false, K: 1,
      A: { zh: '乙二醇', en: 'ethane-1,2-diol', f: 'C2H6O2', M: mm({ C: 2, H: 6, O: 2 }), g: ['羥基', 'hydroxyl'] },
      B: { zh: '對苯二甲酸', en: 'terephthalic acid', f: 'C8H6O4', M: mm({ C: 8, H: 6, O: 4 }), g: ['羧基', 'carboxyl'] },
      link: ['酯鍵', 'ester'], nA0: 0.100 },
    pla: { zh: '聚乳酸（PLA）', en: 'poly(lactic acid) (PLA)', ab: true, K: 1,
      A: { zh: '乳酸', en: 'lactic acid', f: 'C3H6O3', M: mm({ C: 3, H: 6, O: 3 }), g: ['羥基', 'hydroxyl'] },
      B: null, g2: ['羧基', 'carboxyl'],
      link: ['酯鍵', 'ester'], nA0: 0.200 }
  };
  // 重複單位的莫耳質量
  COND.nylon66.unit = COND.nylon66.A.M + COND.nylon66.B.M - 2 * M_H2O;   // C12H22N2O2 226.32
  COND.pet.unit = COND.pet.A.M + COND.pet.B.M - 2 * M_H2O;               // C10H8O4 192.17
  COND.pla.unit = COND.pla.A.M - M_H2O;                                  // C3H4O2 72.06

  // ---------- 速率常數（濃度以單體起始濃度為 1） ----------
  // 加成：預設起始劑 0.5% 時 [R•] = 1e-5、ν = 200、kp[R•] = 0.01 /s
  const KADD = { kd: 0.005, kp: 1000, kt: 2.5e5 };
  const KCOND = { k: 1 / 3, kw: 5 };
  // 樣品大小：加成聚合讓任何起始劑濃度下都約有 40 個自由基同時存在（N ∝ 1/√[I]），縮合聚合 6 萬個單體
  const N_ADD = 4e6, N_COND = 60000;
  function nAdd(I) { return Math.round(N_ADD * Math.sqrt(0.005 / I)); }
  const I_MIN = 0.0001, I_MAX = 0.05;     // 起始劑：單體的 0.01%～5%
  const Q_MIN = 0.5, Q_MAX = 2;           // 縮合：n(B 單體)/n(A 單體)

  // ---------- 亂數（可重現） ----------
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ======================= 加成聚合 =======================
  function createAdd(o) {
    o = o || {};
    const I = Math.max(I_MIN, Math.min(I_MAX, o.init == null ? 0.005 : o.init));
    const N = o.N || nAdd(I);
    const s = {
      kind: 'add', mon: ADD_MON[o.mon] ? o.mon : 'styrene', term: o.term === 'disp' ? 'disp' : 'comb', init: I,
      N: N, NM: N, NI0: Math.round(I * N), NI: 0, t: 0, rnd: rng(o.seed == null ? 1 : o.seed),
      rad: [], dead: [], nPoly: 0, s1: 0, s2: 0, nInit: 0, nTerm: 0, ev: 0
    };
    s.NI = s.NI0;
    return s;
  }
  function polyIn(s, n) { if (n >= 1) { s.nPoly++; s.s1 += n; s.s2 += n * n; } }
  function polyOut(s, n) { if (n >= 1) { s.nPoly--; s.s1 -= n; s.s2 -= n * n; } }
  /** 加成聚合前進到 tEnd；out.add = [起始, 成長, 終止] 的次數 */
  function stepAdd(s, tEnd, cap, out) {
    const kd = KADD.kd, kpN = KADD.kp / s.N, ktN = KADD.kt / s.N, r = s.rnd, rad = s.rad, comb = s.term === 'comb';
    let n = 0;
    while (s.t < tEnd) {
      const R = rad.length;
      const ad = kd * s.NI, ap = kpN * R * s.NM, at = ktN * R * (R - 1);
      const a0 = ad + ap + at;
      if (!(a0 > 0)) { s.t = tEnd; break; }
      const tau = -Math.log(1 - r()) / a0;
      if (s.t + tau > tEnd) { s.t = tEnd; break; }     // 指數分布無記憶：下一段重新抽
      s.t += tau;
      const u = r() * a0;
      if (u < ap) {                                      // 成長：任一個自由基接上一個單體
        const i = Math.floor(r() * R), m = rad[i];
        rad[i] = m + 1; s.NM--;
        if (m === 0) { s.nPoly++; s.s1 += 1; s.s2 += 1; } else { s.s1 += 1; s.s2 += 2 * m + 1; }
        out.add[1]++;
      } else if (u < ap + ad) {                          // 起始：一個起始劑分解成兩個自由基
        s.NI--; rad.push(0, 0); s.nInit++;
        out.add[0]++;
      } else {                                           // 終止：任選兩個自由基
        let i = Math.floor(r() * R), j = Math.floor(r() * (R - 1));
        if (j >= i) j++;
        const ni = rad[i], nj = rad[j];
        if (i < j) { const t = i; i = j; j = t; }
        rad[i] = rad[rad.length - 1]; rad.pop();
        rad[j] = rad[rad.length - 1]; rad.pop();
        if (comb) {
          polyOut(s, ni); polyOut(s, nj);
          if (ni + nj >= 1) { s.dead.push(ni + nj); polyIn(s, ni + nj); }
        } else {
          if (ni >= 1) s.dead.push(ni);
          if (nj >= 1) s.dead.push(nj);
        }
        s.nTerm++;
        out.add[2]++;
      }
      s.ev++;
      if (++n >= cap) return n;
    }
    return n;
  }
  function addEnded(s) { return (s.NI === 0 && s.rad.length === 0) || s.NM === 0; }

  // ======================= 縮合聚合 =======================
  // 每個分子：n（單體數）、a（A 端數）、b（B 端數），a + b = 2。AA 單體 (1,2,0)、BB 單體 (1,0,2)、AB 單體 (1,1,1)。
  // 斷鍵（水解）要「任選一個鍵」：用 Fenwick 樹存每個分子的鍵數 n − 1，O(log N) 抽選。
  function createCond(o) {
    o = o || {};
    const sys = COND[o.pair] ? o.pair : 'nylon66', d = COND[sys];
    const q = d.ab ? 1 : Math.max(Q_MIN, Math.min(Q_MAX, o.q == null ? 1 : o.q));
    const N0 = o.N || N_COND;
    let nAA, nBB;
    if (d.ab) { nAA = N0; nBB = 0; } else { nAA = Math.round(N0 / 2); nBB = Math.round(nAA * q); }
    const N = nAA + nBB, cap = N + 8;
    const s = {
      kind: 'cond', pair: sys, ab: d.ab, q: q, K: d.K, dry: o.dry !== false, nAA: nAA, nBB: nBB, N: N, t: 0,
      rnd: rng(o.seed == null ? 1 : o.seed), n: new Int32Array(cap), a: new Uint8Array(cap), b: new Uint8Array(cap),
      fw: new Float64Array(cap + 1), ww: new Int32Array(cap), M: N,
      NA: 0, NB: 0, mix: 0, L: 0, W: 0, Wout: 0, s2: N, ev: 0, nFwd: 0, nRev: 0
    };
    for (let i = 0; i < N; i++) {
      s.n[i] = 1;
      if (d.ab) { s.a[i] = 1; s.b[i] = 1; } else if (i < nAA) { s.a[i] = 2; s.b[i] = 0; } else { s.a[i] = 0; s.b[i] = 2; }
    }
    s.NA = d.ab ? N : 2 * nAA;
    s.NB = d.ab ? N : 2 * nBB;
    s.NA0 = s.NA; s.NB0 = s.NB;
    s.mix = d.ab ? N : 0;
    s.LOG = 1; while ((s.LOG * 2) <= cap) s.LOG *= 2;
    return s;
  }
  // Fenwick 樹（1 起算）：fw 存部分和，ww 存每格目前的權重
  function setW(s, i, w) {
    const d = w - s.ww[i];
    if (!d) return;
    s.ww[i] = w;
    const fw = s.fw, n = fw.length - 1;
    for (let k = i + 1; k <= n; k += k & -k) fw[k] += d;
  }
  /** 傳回最小的索引 i（0 起算），使 ww[0..i] 的和 > u */
  function findW(s, u) {
    const fw = s.fw, n = fw.length - 1;
    let pos = 0;
    for (let st = s.LOG; st > 0; st >>= 1) {
      const nx = pos + st;
      if (nx <= n && fw[nx] <= u) { pos = nx; u -= fw[nx]; }
    }
    return pos;
  }
  function removeMol(s, j) {
    const last = s.M - 1;
    if (j !== last) { s.n[j] = s.n[last]; s.a[j] = s.a[last]; s.b[j] = s.b[last]; setW(s, j, s.n[j] - 1); }
    setW(s, last, 0);
    s.M--;
  }
  /** 縮合聚合前進到 tEnd；out.cond = [成鍵, 水解, 抽走水] 的次數 */
  function stepCond(s, tEnd, cap, out) {
    const k = KCOND.k / s.N, kr = k / s.K, kw = s.dry ? KCOND.kw : 0, r = s.rnd;
    const nn = s.n, aa = s.a, bb = s.b;
    let cnt = 0;
    while (s.t < tEnd) {
      let pf = k * (s.NA * s.NB - s.mix); if (!(pf > 0)) pf = 0;
      const pr = s.L > 0 && s.W > 0 ? kr * s.L * s.W : 0;
      const po = kw * s.W;
      const a0 = pf + pr + po;
      if (!(a0 > 0)) { s.t = tEnd; break; }
      const tau = -Math.log(1 - r()) / a0;
      if (s.t + tau > tEnd) { s.t = tEnd; break; }
      s.t += tau;
      const u = r() * a0;
      if (u < pf) {                               // 成鍵：一個 A 端與另一個分子的 B 端相連，放出一個水
        let i, j;
        for (;;) {
          i = Math.floor(r() * s.M); if (r() * 2 >= aa[i]) continue;
          j = Math.floor(r() * s.M); if (r() * 2 >= bb[j]) continue;
          if (i !== j) break;
        }
        const ni = nn[i], nj = nn[j];
        s.mix -= aa[i] * bb[i] + aa[j] * bb[j];
        const na = aa[i] - 1 + aa[j], nb = bb[i] + bb[j] - 1;
        nn[i] = ni + nj; aa[i] = na; bb[i] = nb;
        setW(s, i, ni + nj - 1);
        s.mix += na * nb;
        s.s2 += 2 * ni * nj;
        removeMol(s, j);
        s.NA--; s.NB--; s.L++; s.W++; s.nFwd++;
        out.cond[0]++;
      } else if (u < pf + pr) {                   // 水解：任選一個鍵斷開，用掉一個水
        const i = findW(s, Math.floor(r() * s.L));
        const n = nn[i], kk = 1 + Math.floor(r() * (n - 1));
        let l1, l2, r1, r2;                       // 左段、右段兩端的種類（1 = A、0 = B）
        if (s.ab) { l1 = 1; l2 = 0; r1 = 1; r2 = 0; }
        else {
          const left = aa[i] >= 1 ? 1 : 0;        // 方向：有 A 端就把 A 端放左邊
          const right = aa[i] === 2 ? 1 : 0;
          l1 = left; l2 = (kk % 2 === 1) ? left : 1 - left;
          r1 = 1 - l2; r2 = right;                // 鍵的兩側一定是一個 AA、一個 BB
        }
        s.mix -= aa[i] * bb[i];
        const a1 = l1 + l2, b1 = 2 - a1, a2 = r1 + r2, b2 = 2 - a2;
        nn[i] = kk; aa[i] = a1; bb[i] = b1; setW(s, i, kk - 1);
        const m = s.M++;
        nn[m] = n - kk; aa[m] = a2; bb[m] = b2; setW(s, m, n - kk - 1);
        s.mix += a1 * b1 + a2 * b2;
        s.s2 -= 2 * kk * (n - kk);
        s.NA++; s.NB++; s.L--; s.W--; s.nRev++;
        out.cond[1]++;
      } else {                                     // 抽走一個水
        s.W--; s.Wout++;
        out.cond[2]++;
      }
      s.ev++;
      if (++cnt >= cap) return cnt;
    }
    return cnt;
  }
  function pMin(s) { return s.L / Math.min(s.NA0, s.NB0); }
  function condEnded(s) { return s.M <= 1 || (s.NA * s.NB - s.mix <= 0 && s.W === 0) || pMin(s) >= 0.99995; }

  // ======================= 共用：時間推進 =======================
  /** 前進到 s.t + dt（模擬秒），最多 maxEv 個事件；傳回 { n（事件數）, done（時間是否走完）, add／cond（各類事件次數）} */
  function step(s, dt, maxEv) {
    const tEnd = s.t + dt, cap = maxEv || Infinity;
    const out = { n: 0, done: true, add: [0, 0, 0], cond: [0, 0, 0] };
    out.n = s.kind === 'add' ? stepAdd(s, tEnd, cap, out) : stepCond(s, tEnd, cap, out);
    out.done = s.t >= tEnd;
    return out;
  }
  function ended(s) { return s.kind === 'add' ? addEnded(s) : condEnded(s); }

  // ======================= 統計量 =======================
  function stats(s) {
    if (s.kind === 'add') {
      const d = ADD_MON[s.mon], conv = 1 - s.NM / s.N;
      const Xn = s.nPoly > 0 ? s.s1 / s.nPoly : 0, Xw = s.s1 > 0 ? s.s2 / s.s1 : 0;
      const mPoly = conv * d.M, mMon = (1 - conv) * d.M;   // 每 1 mol 單體（g）
      let shrink = null;
      if (!d.gas) { const V0 = d.M / d.rho, V = mMon / d.rho + mPoly / d.rhoP; shrink = 1 - V / V0; }
      return {
        kind: 'add', conv: conv, Xn: Xn, Xw: Xw, PDI: Xn > 0 ? Xw / Xn : 0, Mn: Xn * d.M, Mw: Xw * d.M,
        chains: s.nPoly, radicals: s.rad.length, initLeft: s.NI0 ? s.NI / s.NI0 : 0, mPoly: mPoly, mMon: mMon, shrink: shrink,
        molPoly: s.nPoly / s.N, t: s.t, ended: addEnded(s)
      };
    }
    const d = COND[s.pair];
    const scale = d.nA0 / s.nAA;                         // 每個模擬單位代表多少 mol
    const MA = d.A.M, MB = d.ab ? 0 : d.B.M;
    const mTot = s.nAA * MA + s.nBB * MB - s.L * M_H2O; // 樣品中非水物質的質量（以「模擬單位 × g/mol」計）
    const Xn = s.N / s.M, Xw = s.s2 / s.N;
    const Mn = mTot / s.M;
    // Mw：逐個分子算質量（交替鏈的組成由 n 與端基決定）
    let sw = 0, mono = 0;
    for (let i = 0; i < s.M; i++) {
      const n = s.n[i];
      let nA, nB;
      if (s.ab) { nA = n; nB = 0; }
      else if (n % 2 === 0) { nA = n / 2; nB = n / 2; }
      else if (s.a[i] === 2) { nA = (n + 1) / 2; nB = (n - 1) / 2; }
      else { nA = (n - 1) / 2; nB = (n + 1) / 2; }
      const m = nA * MA + nB * MB - (n - 1) * M_H2O;
      sw += m * m;
      if (n === 1) mono++;
    }
    const pm = pMin(s);
    const r = Math.min(s.NA0, s.NB0) / Math.max(s.NA0, s.NB0);
    const peq = s.dry ? null : peqClosed(s.K, s.NA0, s.NB0) / Math.min(s.NA0, s.NB0);
    return {
      kind: 'cond', conv: pm, pA: s.L / s.NA0, pB: s.L / s.NB0, r: r, Xn: Xn, Xw: Xw, PDI: Xw / Xn, Mn: Mn, Mw: sw / mTot,
      molecules: s.M, monoFrac: mono / s.M, monoLeft: mono / s.N,
      water: s.L * scale * M_H2O + 0, waterIn: s.W * scale * M_H2O, waterOut: s.Wout * scale * M_H2O,
      waterMax: Math.min(s.NA0, s.NB0) * scale * M_H2O, mFeed: (s.nAA * MA + s.nBB * MB) * scale,
      mFlask: (s.nAA * MA + s.nBB * MB) * scale - s.Wout * scale * M_H2O, mPolymer: mTot * scale,
      molMolecules: s.M * scale, carothers: carothers(r, pm), peq: peq, t: s.t, ended: condEnded(s)
    };
  }
  /** 鏈長（單體數）清單：加成聚合只列聚合物（不含未反應單體），縮合聚合列全部分子 */
  function lengths(s) {
    if (s.kind === 'add') {
      const out = s.dead.slice();
      for (let i = 0; i < s.rad.length; i++) if (s.rad[i] >= 1) out.push(s.rad[i]);
      return out;
    }
    return Array.prototype.slice.call(s.n, 0, s.M);
  }
  /** 重量分率對 log10(鏈長) 的直方圖：bins 個格子，範圍 10^lo～10^hi；傳回每格的 dw/d(log10 x) */
  function histogram(s, bins, lo, hi) {
    const h = new Float64Array(bins), L = lengths(s), w = (hi - lo) / bins;
    let tot = 0;
    for (let i = 0; i < L.length; i++) {
      const x = L[i];
      tot += x;
      let k = Math.floor((Math.log10(x) - lo) / w);
      if (k < 0) k = 0; if (k >= bins) k = bins - 1;
      h[k] += x;
    }
    if (tot > 0) for (let k = 0; k < bins; k++) h[k] /= tot * w;
    return h;
  }

  // ======================= 理論 =======================
  function carothers(r, p) { return (1 + r) / (1 + r - 2 * r * p); }
  /** 密閉系統（起始沒有水）的平衡鍵數 x：K = x²/((A0 − x)(B0 − x)) */
  function peqClosed(K, A0, B0) {
    if (Math.abs(K - 1) < 1e-12) return A0 * B0 / (A0 + B0);
    const a = 1 - K, b = K * (A0 + B0), c = -K * A0 * B0;
    const disc = Math.sqrt(b * b - 4 * a * c);
    const x1 = (-b + disc) / (2 * a), x2 = (-b - disc) / (2 * a);
    const lim = Math.min(A0, B0);
    return (x1 >= 0 && x1 <= lim) ? x1 : x2;
  }
  function floryNumber(x, p) { return (1 - p) * Math.pow(p, x - 1); }
  function floryWeight(x, p) { return x * (1 - p) * (1 - p) * Math.pow(p, x - 1); }
  /** 自由基聚合的穩定態理論（起始劑濃度 I、單體濃度 M，以單體起始濃度為 1） */
  function addTheory(I, M) {
    const K = KADD, m = M == null ? 1 : M;
    const R = Math.sqrt(K.kd * I / K.kt);
    const nu = K.kp * m / (2 * K.kt * R);
    return { R: R, nu: nu, rate: K.kp * R, xDeadEnd: 1 - Math.exp(-2 * K.kp * R / K.kd) };
  }
  /** 加成聚合的轉化率解析式（穩定態、起始劑一階衰減）：−ln(1 − x) = (2kp R0 / kd)(1 − e^(−kd t/2)) */
  function addConv(I, t) {
    const K = KADD, R0 = Math.sqrt(K.kd * I / K.kt);
    return 1 - Math.exp(-2 * K.kp * R0 / K.kd * (1 - Math.exp(-K.kd * t / 2)));
  }

  const api = {
    AW: AW, M_H2O: M_H2O, ADD_MON: ADD_MON, COND: COND, KADD: KADD, KCOND: KCOND, N_ADD: N_ADD, N_COND: N_COND,
    nAdd: nAdd, I_MIN: I_MIN, I_MAX: I_MAX, Q_MIN: Q_MIN, Q_MAX: Q_MAX, mm: mm, rng: rng,
    createAdd: createAdd, createCond: createCond, step: step, ended: ended, stats: stats, lengths: lengths, histogram: histogram,
    pMin: pMin, carothers: carothers, peqClosed: peqClosed, floryNumber: floryNumber, floryWeight: floryWeight,
    addTheory: addTheory, addConv: addConv
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PolyCore = api;
})(typeof window !== 'undefined' ? window : this);
