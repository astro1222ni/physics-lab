/* population-pyramid-core.js — 人口金字塔與人口推估的核心（世代組成法，單一年齡 0–99、100 歲以上 × 男女）
 *
 * 每一年：
 *   1. 存活：a 歲的人一年後變 a+1 歲，存活比 S(a) = L(a+1) / L(a)（生命表的定常人口）；100 歲以上是開放組，用 T(100) / T(99)。
 *   2. 出生：這一年的出生數 B = Σ f(a) × 該年齡婦女的年中人數（年初與年底的平均），f(a) 是年齡別生育率；
 *      男嬰 : 女嬰 = 出生性比例 : 100；活到年底的嬰兒 = B × L(0)。
 *   3. 遷移：每年淨遷入 N 人，男女各半，年齡分布用 Rogers–Castro 標準遷移年齡曲線（青壯年最多）。
 * 死亡機率：2025 年 0–84 歲用內政部簡易生命表，85 歲以上用國發會推估；「國發會中推估」情境照國發會每年的總生育率、
 *   死亡機率、出生性比例與社會增加；自訂情境用 Brass 邏輯斯模型（整條存活曲線的 logit 平移）調整到指定的平均壽命。
 * 穩定人口：生育率、死亡率固定、沒有遷移，年齡結構最後會固定、只按同一個比率增減（Lotka）；這裡直接用同一套推估反覆推到收斂。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./population-pyramid-data.js'));
  else root.PopCore = factory(root.PopData);
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  'use strict';
  const N = 101;                 // 0–99 歲與 100 歲以上
  const BASE_YEAR = DATA.base.year;
  const END_YEAR = BASE_YEAR + 100;
  const A0 = 0.1;                // 0 歲死亡者平均活過的年數（嬰兒死亡多在出生後不久）
  const PAST = Object.keys(DATA.past).map(Number).sort(function (a, b) { return a - b; });
  const NDC_Q_YEARS = Object.keys(DATA.ndc.qx).map(Number).sort(function (a, b) { return a - b; });

  // ---------- 生育率的年齡分布（2025 年單齡，按發生調整；加總後 × 1/1000 = 總生育率） ----------
  const FERT = new Float64Array(N);
  (function () {
    const r = DATA.asfr.rate, a0 = DATA.asfr.ages0;
    let s = 0;
    for (let i = 0; i < r.length; i++) s += r[i];
    for (let i = 0; i < r.length; i++) FERT[a0 + i] = r[i] / s;   // 加總 = 1
  })();

  // ---------- 遷移的年齡分布（Rogers & Castro 1981 的標準遷移年齡曲線，加總 = 1） ----------
  const MIG = new Float64Array(N);
  (function () {
    let s = 0;
    for (let a = 0; a < N; a++) {
      const x = a + 0.5;
      const v = 0.02 * Math.exp(-0.1 * x) + 0.06 * Math.exp(-0.1 * (x - 20) - Math.exp(-0.4 * (x - 20))) + 0.003 * (a < 100 ? 1 : 0);
      MIG[a] = v; s += v;
    }
    for (let a = 0; a < N; a++) MIG[a] /= s;
  })();

  // ---------- 死亡機率 ----------
  function baseQ(sex) {
    const lt = sex === 'm' ? DATA.life.qm : DATA.life.qf, nd = DATA.ndc.qx[NDC_Q_YEARS[0]][sex];
    const q = new Float64Array(N);
    for (let a = 0; a < N; a++) q[a] = a < 85 ? lt[a] : nd[a];
    return q;
  }
  const Q2025 = { m: baseQ('m'), f: baseQ('f') };
  /** 國發會中推估某一年的死亡機率（給定年份之間線性內插；2025 年用簡易生命表） */
  function ndcQ(year, sex) {
    const ys = [BASE_YEAR].concat(NDC_Q_YEARS);
    const get = function (y) { return y === BASE_YEAR ? Q2025[sex] : DATA.ndc.qx[y][sex]; };
    if (year <= BASE_YEAR) return Q2025[sex];
    if (year >= ys[ys.length - 1]) return Float64Array.from(get(ys[ys.length - 1]));
    let i = 0;
    while (ys[i + 1] < year) i++;
    const y0 = ys[i], y1 = ys[i + 1], u = (year - y0) / (y1 - y0), A = get(y0), B = get(y1);
    const q = new Float64Array(N);
    for (let a = 0; a < N; a++) q[a] = A[a] + (B[a] - A[a]) * u;
    return q;
  }
  /** 比例風險：q' = 1 − (1 − q)^k（k > 1 死得多、k < 1 死得少）；開放組維持 1 */
  function scaleQ(q, k) {
    const out = new Float64Array(N);
    for (let a = 0; a < N; a++) out[a] = a === N - 1 ? 1 : 1 - Math.pow(1 - Math.min(q[a], 0.999999), k);
    return out;
  }

  // ---------- 生命表 ----------
  /** 由死亡機率算 l、L、T、e0（l(0) = 1）；100 歲以上的年死亡機率取 99 歲的 1.04 倍 */
  function lifeTable(q) {
    const l = new Float64Array(N + 1), L = new Float64Array(N), T = new Float64Array(N);
    l[0] = 1;
    for (let a = 0; a < N - 1; a++) l[a + 1] = l[a] * (1 - q[a]);
    for (let a = 0; a < N - 1; a++) L[a] = a === 0 ? l[1] + A0 * (l[0] - l[1]) : (l[a] + l[a + 1]) / 2;
    const qo = Math.min(0.9, Math.max(0.05, q[N - 2] * 1.04));
    L[N - 1] = l[N - 1] * (1 / qo - 0.5);
    let s = 0;
    for (let a = N - 1; a >= 0; a--) { s += L[a]; T[a] = s; }
    return { l: l, L: L, T: T, e0: T[0], qOpen: qo };
  }
  /** Brass 邏輯斯模型：logit(存活) 整條平移 α（α > 0 死得多）。比只乘一個倍數更像真實世界不同死亡水準的形狀 */
  function brassQ(q, alpha) {
    const l = new Float64Array(N);
    l[0] = 1;
    for (let a = 0; a < N - 1; a++) l[a + 1] = l[a] * (1 - q[a]);
    const out = new Float64Array(N);
    let prev = 1;
    for (let a = 0; a < N - 1; a++) {
      const ls = l[a + 1], Y = 0.5 * Math.log((1 - ls) / ls) + alpha;
      const nl = 1 / (1 + Math.exp(2 * Y));
      out[a] = Math.min(0.999999, Math.max(0, 1 - nl / prev));
      prev = nl;
    }
    out[N - 1] = 1;
    return out;
  }
  /** 找 Brass 的 α，讓男女平均的出生時平均餘命 = target */
  function mortalityFor(e0target, year) {
    const qm = year != null ? ndcQ(year, 'm') : Q2025.m, qf = year != null ? ndcQ(year, 'f') : Q2025.f;
    const e = function (al) { return (lifeTable(brassQ(qm, al)).e0 + lifeTable(brassQ(qf, al)).e0) / 2; };
    let lo = -3, hi = 4;
    for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (e(mid) > e0target) lo = mid; else hi = mid; }
    const al = (lo + hi) / 2;
    return { alpha: al, qm: brassQ(qm, al), qf: brassQ(qf, al) };
  }

  // ---------- 情境 ----------
  /**
   * 情境：{ mode: 'ndc' } 照國發會中推估；或 { mode: 'custom', tfr, e0（男女平均）, net（每年淨遷入人數）, srb（出生性比例，女嬰 100 對男嬰幾人） }
   * 回傳某一年要用的參數 { tfr, srb, net, qm, qf, ltm, ltf }（會快取）
   */
  const cache = {};
  function paramsFor(sc, year) {
    const key = sc.mode === 'ndc' ? 'ndc|' + year : ['c', sc.tfr, sc.e0, sc.net, sc.srb].join('|');
    if (cache[key]) return cache[key];
    let p;
    if (sc.mode === 'ndc') {
      const y = Math.min(year, 2075), qm = ndcQ(y, 'm'), qf = ndcQ(y, 'f');
      p = { tfr: DATA.ndc.tfr[y] != null ? DATA.ndc.tfr[y] : DATA.asfr.tfr, srb: DATA.ndc.srb[y] || DATA.asfr.srb,
        net: (DATA.ndc.net[y] != null ? DATA.ndc.net[y] : 0) * 1000, qm: qm, qf: qf };
    } else {
      const mk = 'e0|' + sc.e0, mo = cache[mk] || (cache[mk] = mortalityFor(sc.e0));
      p = { tfr: sc.tfr, srb: sc.srb, net: sc.net, qm: mo.qm, qf: mo.qf };
    }
    p.ltm = lifeTable(p.qm); p.ltf = lifeTable(p.qf);
    const keys = Object.keys(cache);
    if (keys.length > 400) keys.slice(0, 200).forEach(function (k) { delete cache[k]; });
    cache[key] = p;
    return p;
  }
  const DEFAULT = { mode: 'custom', tfr: DATA.asfr.tfr, e0: (DATA.life.e0m + DATA.life.e0f) / 2, net: 0, srb: DATA.asfr.srb };

  // ---------- 推估一年 ----------
  function survive(P, lt) {
    const out = new Float64Array(N), L = lt.L, T = lt.T;
    for (let a = 0; a < N - 2; a++) out[a + 1] = P[a] * (L[a + 1] / L[a]);
    out[N - 1] = (P[N - 2] + P[N - 1]) * (T[N - 1] / T[N - 2]);
    return out;
  }
  /** pop = { year, m, f }；回傳下一年的 { year, m, f, births, deaths, net } */
  function step(pop, sc) {
    const y = pop.year + 1, p = paramsFor(sc, y);
    const m1 = survive(pop.m, p.ltm), f1 = survive(pop.f, p.ltf);
    let exp = 0;
    for (let a = 10; a < 55; a++) if (FERT[a] > 0) exp += FERT[a] * (pop.f[a] + f1[a]) / 2;
    const B = p.tfr * exp;
    const bm = B * p.srb / (100 + p.srb), bf = B - bm;
    m1[0] = bm * p.ltm.L[0]; f1[0] = bf * p.ltf.L[0];
    let before = 0, after = 0;
    for (let a = 0; a < N; a++) { before += pop.m[a] + pop.f[a]; after += m1[a] + f1[a]; }
    const deaths = before + B - after;
    // 遷移（男女各半）；不讓任何一格變成負的
    let moved = 0;
    if (p.net) {
      for (let a = 0; a < N; a++) {
        const d = p.net / 2 * MIG[a];
        const nm = Math.max(0, m1[a] + d), nf = Math.max(0, f1[a] + d);
        moved += nm - m1[a] + nf - f1[a];
        m1[a] = nm; f1[a] = nf;
      }
    }
    return { year: y, m: m1, f: f1, births: B, deaths: deaths, net: moved, tfr: p.tfr };
  }

  // ---------- 初始人口 ----------
  function basePop() {
    return { year: BASE_YEAR, m: Float64Array.from(DATA.base.m), f: Float64Array.from(DATA.base.f), births: null, deaths: null, net: null };
  }
  function pastPop(year) {
    const d = DATA.past[year];
    return d ? { year: year, m: Float64Array.from(d.m), f: Float64Array.from(d.f), births: null, deaths: null, net: null, actual: true } : null;
  }
  function ndcPop(year) {
    const d = DATA.ndc.pyr[year];
    return d ? { year: year, m: Float64Array.from(d.m), f: Float64Array.from(d.f), official: true } : null;
  }

  /** 穩定人口：同一個情境一直推到年齡結構不再改變；回傳總數 = total 的人口與年增加率 r */
  function stablePop(sc, total) {
    // 穩定狀態每年乘 λ：P(a+1, t+1) = P(a, t)·L(a+1)/L(a) ⇒ P(a) = P(0)·[L(a)/L(0)]·λ^(−a)
    // 出生：λ·P_f(0) = 女嬰比例 × TFR × Σ f(a)·[P_f(a) + λ·P_f(a)]/2 × L_f(0) ⇒ 1 = s_f·TFR·(1+λ)/(2λ)·Σ f(a)·L_f(a)·λ^(−a)
    const p = paramsFor(Object.assign({}, sc, { mode: 'custom', net: 0 }), BASE_YEAR + 1);
    const Lf = p.ltf.L, Lm = p.ltm.L, sf = 100 / (100 + p.srb);
    const g = function (lam) {
      let s = 0;
      for (let a = 10; a < 55; a++) if (FERT[a] > 0) s += FERT[a] * Lf[a] * Math.pow(lam, -a);
      return sf * p.tfr * (1 + lam) / (2 * lam) * s - 1;
    };
    let lo = 0.8, hi = 1.2;
    for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (g(mid) > 0) lo = mid; else hi = mid; }
    const lam = (lo + hi) / 2;
    const m = new Float64Array(N), f = new Float64Array(N);
    const f0 = 1, m0 = p.srb / 100 * Lm[0] / Lf[0];
    for (let a = 0; a < N - 1; a++) { f[a] = f0 * Lf[a] / Lf[0] * Math.pow(lam, -a); m[a] = m0 * Lm[a] / Lm[0] * Math.pow(lam, -a); }
    // 開放組：λ·P(100) = [P(99) + P(100)]·T(100)/T(99)
    const rf = p.ltf.T[N - 1] / p.ltf.T[N - 2], rm = p.ltm.T[N - 1] / p.ltm.T[N - 2];
    f[N - 1] = f[N - 2] * rf / (lam - rf); m[N - 1] = m[N - 2] * rm / (lam - rm);
    const T = sum(m) + sum(f), k = (total || T) / T;
    for (let a = 0; a < N; a++) { m[a] *= k; f[a] *= k; }
    return { pop: { year: BASE_YEAR, m: m, f: f, births: null, deaths: null, net: null }, r: lam - 1 };
  }
  /** 穩定人口裡，扶養比最低的總生育率（平均壽命、出生性比例固定；黃金分割搜尋 0.5–6） */
  const depCache = {};
  function minDependency(e0, srb) {
    const key = e0 + '|' + srb;
    if (depCache[key]) return depCache[key];
    const dep = function (t) { return indicators(stablePop({ tfr: t, e0: e0, srb: srb }).pop).dep; };
    let a = 0.5, b = 6;
    const R = (Math.sqrt(5) - 1) / 2;
    let c = b - R * (b - a), d = a + R * (b - a), fc = dep(c), fd = dep(d);
    for (let it = 0; it < 60; it++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - R * (b - a); fc = dep(c); }
      else { a = c; c = d; fc = fd; d = a + R * (b - a); fd = dep(d); }
    }
    const t = (a + b) / 2;
    return (depCache[key] = { tfr: t, dep: dep(t) });
  }

  // ---------- 指標 ----------
  function sum(A, a0, a1) {
    let s = 0;
    for (let a = a0 || 0; a <= (a1 == null ? N - 1 : a1); a++) s += A[a];
    return s;
  }
  /** 年齡結構的類型：0–14 歲 ÷ 15–29 歲（底部和上一層比） */
  function shapeOf(base) {
    if (base >= 1.15) return 'expansive';
    if (base >= 0.9) return 'stationary';
    return 'constrictive';
  }
  function indicators(pop) {
    const m = pop.m, f = pop.f;
    const tot = sum(m) + sum(f), y = sum(m, 0, 14) + sum(f, 0, 14), w = sum(m, 15, 64) + sum(f, 15, 64), o = tot - y - w;
    const y15 = sum(m, 15, 29) + sum(f, 15, 29);
    // 年齡中位數（每一歲內均勻分布）
    let acc = 0, med = 0;
    for (let a = 0; a < N; a++) {
      const v = m[a] + f[a];
      if (acc + v >= tot / 2) { med = a + (tot / 2 - acc) / (v || 1); break; }
      acc += v;
    }
    const base = y / (y15 || 1);
    return {
      year: pop.year, total: tot, male: sum(m), female: sum(f),
      p0_14: y, p15_64: w, p65: o, pct0_14: 100 * y / tot, pct15_64: 100 * w / tot, pct65: 100 * o / tot,
      dep: 100 * (y + o) / w, depY: 100 * y / w, depO: 100 * o / w, aging: 100 * o / (y || 1),
      median: med, sexRatio: 100 * sum(m) / sum(f), p80: sum(m, 80) + sum(f, 80), p100: m[N - 1] + f[N - 1],
      base: base, shape: shapeOf(base),
      stage: o / tot >= 0.2 ? 3 : o / tot >= 0.14 ? 2 : o / tot >= 0.07 ? 1 : 0   // 高齡化社會 7%、高齡社會 14%、超高齡社會 20%
    };
  }
  /** 一個人口和另一個的逐歲差距：Σ|差| ÷ 總數（0 = 完全一樣） */
  function distance(A, B) {
    let s = 0, t = 0;
    for (let a = 0; a < N; a++) { s += Math.abs(A.m[a] - B.m[a]) + Math.abs(A.f[a] - B.f[a]); t += B.m[a] + B.f[a]; }
    return s / t;
  }

  /** 由某個人口推估到 toYear，回傳每年的人口（含起點） */
  function project(pop, sc, toYear) {
    const out = [pop];
    let p = pop;
    while (p.year < toYear) { p = step(p, sc); out.push(p); }
    return out;
  }

  return {
    N: N, BASE_YEAR: BASE_YEAR, END_YEAR: END_YEAR, PAST: PAST, NDC_PYR: Object.keys(DATA.ndc.pyr).map(Number),
    DATA: DATA, FERT: FERT, MIG: MIG, Q2025: Q2025, DEFAULT: DEFAULT,
    ndcQ: ndcQ, scaleQ: scaleQ, brassQ: brassQ, lifeTable: lifeTable, mortalityFor: mortalityFor, paramsFor: paramsFor,
    step: step, project: project, basePop: basePop, pastPop: pastPop, ndcPop: ndcPop, stablePop: stablePop, minDependency: minDependency,
    indicators: indicators, shapeOf: shapeOf, distance: distance, sum: sum
  };
});
