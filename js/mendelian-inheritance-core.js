/*
 * mendelian-inheritance-core.js — 孟德爾遺傳的核心（與畫面無關，可單獨測試）
 *
 * 個體的基因型：每個基因座的「顯性對偶基因個數」g（0、1、2）組成的陣列。
 *   例如雙性狀 [1, 2] = Rr YY；單性狀 [0] = rr。
 * 分離律：異型合子 Aa 產生 A、a 兩種配子的機率各 1/2；同型合子只產生一種。
 * 獨立分配律：不同基因座（位於不同的染色體上）各自獨立分離，所以 RrYy 產生 RY、Ry、rY、ry 各 1/4。
 * 傳統龐氏方格：每個親本列出 2^L 個「等機率」的配子格（同型合子的格子會重複），
 *   所以方格裡每一格的機率都一樣（單性狀 1/4、雙性狀 1/16）。
 *   抽一個子代 = 母本的配子格與父本的配子格各隨機抽一個（均勻），與「每個基因座各自隨機分離」完全等價。
 * 機率一律用精確分數（{n, d}）；卡方適合度檢定的 p 值用正則化不完全 Gamma 函數精確計算：
 *   p = Q(df/2, χ²/2)，Q 為上側正則化不完全 Gamma 函數。
 * 亂數用可設定種子的 mulberry32，測試結果可重現。
 */
(function (root) {
  'use strict';

  // ---------- 分數 ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
  function lcm(a, b) { return a / gcd(a, b) * b; }
  function frac(n, d) {
    if (d == null) d = 1;
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    return { n: n / g, d: d / g };
  }
  function fadd(a, b) { return frac(a.n * b.d + b.n * a.d, a.d * b.d); }
  function fmul(a, b) { return frac(a.n * b.n, a.d * b.d); }
  function fval(a) { return a.n / a.d; }
  function fstr(a) { return a.d === 1 ? String(a.n) : a.n + '/' + a.d; }
  /** 一組分數化成最簡整數比（例如 9/16、3/16、3/16、1/16 → 9:3:3:1）；機率為 0 的項目保留 0 */
  function ratioOf(fs) {
    let L = 1;
    fs.forEach(function (f) { if (f.n) L = lcm(L, f.d); });
    const ints = fs.map(function (f) { return f.n * (L / f.d); });
    let g = 0;
    ints.forEach(function (x) { if (x) g = g ? gcd(g, x) : x; });
    return ints.map(function (x) { return g ? x / g : 0; });
  }

  // ---------- 性狀（孟德爾的豌豆；顯隱性照孟德爾的實驗） ----------
  // mendel：孟德爾 1866 年論文中子二代（F2）的「顯性：隱性」計數（實驗 1、2、3、7）。
  //   種子形狀、子葉顏色數的是種子；花色（孟德爾記錄的是種皮顏色灰褐／白，與紫花／白花由同一對基因控制）、莖的高度數的是植株。
  const TRAITS = {
    shape: { sym: 'R', part: 'seed', name: ['種子形狀', 'Seed shape'], dom: ['圓形', 'round'], rec: ['皺縮', 'wrinkled'], mendel: [5474, 1850], exp: 1 },
    color: { sym: 'Y', part: 'seed', name: ['子葉顏色', 'Cotyledon colour'], dom: ['黃色', 'yellow'], rec: ['綠色', 'green'], mendel: [6022, 2001], exp: 2 },
    flower: { sym: 'P', part: 'plant', name: ['花色', 'Flower colour'], dom: ['紫花', 'purple'], rec: ['白花', 'white'], mendel: [705, 224], exp: 3 },
    height: { sym: 'T', part: 'plant', name: ['莖的高度', 'Stem height'], dom: ['高莖', 'tall'], rec: ['矮莖', 'dwarf'], mendel: [787, 277], exp: 7 }
  };
  const TRAIT_IDS = ['shape', 'color', 'flower', 'height'];
  /** 孟德爾的雙性狀實驗（種子形狀 × 子葉顏色，子二代 556 粒）：圓黃、圓綠、皺黃、皺綠 */
  const MENDEL_DIHYBRID = { traits: ['shape', 'color'], counts: [315, 108, 101, 32] };
  /** 孟德爾檢驗雜種配子的實驗（RrYy 與 rryy 雜交，即試交）：雜種當母本、雜種當父本；順序同上 */
  const MENDEL_TESTCROSS = { hybridSeed: [31, 26, 27, 26], hybridPollen: [24, 25, 22, 27] };

  // ---------- 基因型與表現型 ----------
  /** 基因型文字：g = [1, 2]、syms = ['R', 'Y'] → 'RrYY'（顯性字母在前） */
  function genoStr(g, syms) {
    return g.map(function (k, i) { const S = syms[i], s = S.toLowerCase(); return k === 2 ? S + S : k === 1 ? S + s : s + s; }).join('');
  }
  /** 表現型類別：每個基因座顯性為 0、隱性為 1，第一個基因座是最高位。雙性狀 0 = 顯顯、1 = 顯隱、2 = 隱顯、3 = 隱隱 */
  function phenoIndex(g) {
    let k = 0;
    for (let i = 0; i < g.length; i++) k = k * 2 + (g[i] === 0 ? 1 : 0);
    return k;
  }
  /** 表現型類別 → 每個基因座是否為顯性 */
  function phenoBits(k, L) {
    const out = [];
    for (let i = L - 1; i >= 0; i--) { out[i] = ((k >> (L - 1 - i)) & 1) === 0; }
    return out;
  }
  /** 基因型類別：每個基因座 AA、Aa、aa 依序為 0、1、2（三進位，第一個基因座是最高位） */
  function genoIndex(g) {
    let k = 0;
    for (let i = 0; i < g.length; i++) k = k * 3 + (2 - g[i]);
    return k;
  }
  function genoOf(k, L) {
    const g = [];
    for (let i = L - 1; i >= 0; i--) { g[i] = 2 - (k % 3); k = Math.floor(k / 3); }
    return g;
  }

  // ---------- 配子 ----------
  /** 一個基因座的兩個對偶基因（1 = 顯性、0 = 隱性），顯性寫在前面 */
  function allelesOf(k) { return k === 2 ? [1, 1] : k === 1 ? [1, 0] : [0, 0]; }
  /**
   * 傳統龐氏方格的配子格：2^L 個等機率的配子（每格是每個基因座的一個對偶基因）。
   * 雙性狀順序：[a1 b1, a1 b2, a2 b1, a2 b2]，例如 RrYy → RY、Ry、rY、ry；RRYy → RY、Ry、RY、Ry。
   */
  function gameteSlots(g) {
    let slots = [[]];
    g.forEach(function (k) {
      const al = allelesOf(k), next = [];
      slots.forEach(function (s) { al.forEach(function (a) { next.push(s.concat([a])); }); });
      slots = next;
    });
    return slots;
  }
  /** 合併相同的配子，附上精確機率（顯性多的排前面）：RRYy → [{a:[1,1], p:1/2}, {a:[1,0], p:1/2}] */
  function gametes(g) {
    const slots = gameteSlots(g), map = {};
    const unit = frac(1, slots.length);
    slots.forEach(function (s) {
      const key = s.join('');
      map[key] = map[key] ? { a: s, p: fadd(map[key].p, unit) } : { a: s, p: unit };
    });
    return Object.keys(map).sort().reverse().map(function (k) { return map[k]; });
  }
  /** 配子文字：[1, 0] 與 ['R', 'Y'] → 'Ry' */
  function gameteStr(a, syms) { return a.map(function (x, i) { return x ? syms[i] : syms[i].toLowerCase(); }).join(''); }
  /** 卵與精細胞結合成受精卵 */
  function zygote(a1, a2) { return a1.map(function (x, i) { return x + a2[i]; }); }

  // ---------- 雜交 ----------
  /**
   * 雜交 g1（母本 ♀）× g2（父本 ♂）。
   * 傳回 slots1、slots2（龐氏方格的列與行）、cells[i][j]（子代基因型）、
   * genoP（各基因型類別的精確機率）、phenoP（各表現型類別的精確機率）與最簡整數比。
   */
  function cross(g1, g2) {
    const L = g1.length;
    if (g2.length !== L) throw new Error('兩個親本的基因座數目不同');
    const s1 = gameteSlots(g1), s2 = gameteSlots(g2);
    const cell = frac(1, s1.length * s2.length);
    const nG = Math.pow(3, L), nP = Math.pow(2, L);
    const genoP = [], phenoP = [];
    for (let k = 0; k < nG; k++) genoP.push(frac(0));
    for (let k = 0; k < nP; k++) phenoP.push(frac(0));
    const cells = s1.map(function (a) {
      return s2.map(function (b) {
        const g = zygote(a, b), gi = genoIndex(g), pi = phenoIndex(g);
        genoP[gi] = fadd(genoP[gi], cell);
        phenoP[pi] = fadd(phenoP[pi], cell);
        return { g: g, geno: gi, pheno: pi };
      });
    });
    return {
      L: L, g1: g1.slice(), g2: g2.slice(), slots1: s1, slots2: s2, cells: cells,
      genoP: genoP, phenoP: phenoP, genoRatio: ratioOf(genoP), phenoRatio: ratioOf(phenoP),
      gametes1: gametes(g1), gametes2: gametes(g2)
    };
  }
  /**
   * 雜交的種類：
   *   'P'    每個基因座都是顯性同型合子 × 隱性同型合子（純種親代 → 子一代）
   *   'F2'   兩個親本每個基因座都是異型合子（子一代自交 → 子二代）
   *   'test' 一方每個基因座都是隱性同型合子，另一方每個基因座都至少有一個顯性對偶基因（試交）
   *   'same' 兩個親本基因型相同（相當於自交）
   *   'other' 其他
   */
  function crossKind(g1, g2) {
    const L = g1.length;
    let P = true, F2 = true;
    for (let i = 0; i < L; i++) {
      if (!((g1[i] === 2 && g2[i] === 0) || (g1[i] === 0 && g2[i] === 2))) P = false;
      if (!(g1[i] === 1 && g2[i] === 1)) F2 = false;
    }
    if (P) return 'P';
    if (F2) return 'F2';
    const allRec = function (g) { return g.every(function (k) { return k === 0; }); };
    const allDom = function (g) { return g.every(function (k) { return k >= 1; }); };
    if ((allRec(g2) && allDom(g1)) || (allRec(g1) && allDom(g2))) return 'test';
    if (g1.join() === g2.join()) return 'same';
    return 'other';
  }

  // ---------- 亂數與抽樣 ----------
  /** 可設定種子的亂數產生器（mulberry32），傳回 [0, 1) 的均勻亂數 */
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 抽一個子代：母本與父本的配子格各均勻抽一格，傳回方格的列 i、行 j */
  function sampleOne(cr, rand) {
    return { i: Math.floor(rand() * cr.slots1.length), j: Math.floor(rand() * cr.slots2.length) };
  }
  /** 抽 n 個子代，只傳回計數（任務證明與測試用）：表現型、基因型、方格每一格 */
  function sampleCounts(cr, n, rand, into) {
    const nP = cr.phenoP.length, nG = cr.genoP.length, m1 = cr.slots1.length, m2 = cr.slots2.length;
    const out = into || { N: 0, pheno: new Array(nP).fill(0), geno: new Array(nG).fill(0), cell: new Array(m1 * m2).fill(0) };
    for (let k = 0; k < n; k++) {
      const i = Math.floor(rand() * m1), j = Math.floor(rand() * m2), c = cr.cells[i][j];
      out.pheno[c.pheno]++; out.geno[c.geno]++; out.cell[i * m2 + j]++;
    }
    out.N += n;
    return out;
  }
  /** 神秘豌豆：顯性表現型、但基因型未知（每個基因座 AA 或 Aa 各 1/2） */
  function mysteryPick(L, rand) {
    const g = [];
    for (let i = 0; i < L; i++) g.push(rand() < 0.5 ? 2 : 1);
    return g;
  }

  // ---------- Gamma 函數與卡方分布 ----------
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  /** ln Γ(x)（Lanczos 近似，g = 7，相對誤差約 1e-15） */
  function lnGamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const EPS = 1e-16, TINY = 1e-300;
  /** 級數：下側正則化不完全 Gamma 函數 P(a, x)（x < a + 1 時收斂快） */
  function gser(a, x) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n < 2000; n++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  /** 連分數（修正 Lentz 法）：上側正則化不完全 Gamma 函數 Q(a, x)（x ≥ a + 1 時收斂快） */
  function gcf(a, x) {
    let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let i = 1; i < 2000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }
  /** 下側正則化不完全 Gamma 函數 P(a, x) = γ(a, x)/Γ(a) */
  function gammaP(a, x) {
    if (!(x > 0)) return 0;
    if (x === Infinity) return 1;
    return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
  }
  /** 上側正則化不完全 Gamma 函數 Q(a, x) = Γ(a, x)/Γ(a) = 1 − P(a, x) */
  function gammaQ(a, x) {
    if (!(x > 0)) return 1;
    if (x === Infinity) return 0;
    return x < a + 1 ? 1 - gser(a, x) : gcf(a, x);
  }
  /** 卡方分布的上側機率（p 值）：P(χ² ≥ x)，自由度 df */
  function chi2Sf(x, df) { return gammaQ(df / 2, x / 2); }
  /** 卡方分布的累積機率 P(χ² ≤ x) */
  function chi2Cdf(x, df) { return gammaP(df / 2, x / 2); }
  /** 臨界值：上側機率為 alpha 時的 χ²（二分法，精確到 1e-12） */
  function chi2Inv(alpha, df) {
    let lo = 0, hi = Math.max(10, df * 4);
    while (chi2Sf(hi, df) > alpha) hi *= 2;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (chi2Sf(mid, df) > alpha) lo = mid; else hi = mid;
      if (hi - lo < 1e-12 * Math.max(1, hi)) break;
    }
    return (lo + hi) / 2;
  }
  /**
   * 卡方適合度檢定：obs 觀察數、probs 假說的機率（分數或小數）。
   *   χ² = Σ (O − E)²/E，只算機率大於 0 的類別；自由度 df = 類別數 − 1。
   *   假說說「不可能」的類別（機率 0）卻出現了 → impossible，χ² = ∞、p = 0（假說直接被推翻）。
   * 傳回 { N, chi2, df, p, expected, contrib, minExpected, impossible }。
   */
  function chiSquare(obs, probs) {
    const N = obs.reduce(function (a, b) { return a + b; }, 0);
    const pr = probs.map(function (p) { return typeof p === 'number' ? p : fval(p); });
    const expected = pr.map(function (p) { return N * p; });
    let chi2 = 0, k = 0, minE = Infinity, impossible = false;
    const contrib = obs.map(function (o, i) {
      if (pr[i] <= 0) { if (o > 0) impossible = true; return 0; }
      k++;
      const e = expected[i];
      minE = Math.min(minE, e);
      const c = N > 0 ? (o - e) * (o - e) / e : 0;
      chi2 += c;
      return c;
    });
    const df = Math.max(0, k - 1);
    if (impossible) return { N: N, chi2: Infinity, df: df, p: 0, expected: expected, contrib: contrib, minExpected: minE, impossible: true };
    const p = N === 0 || df === 0 ? 1 : chi2Sf(chi2, df);
    return { N: N, chi2: chi2, df: df, p: p, expected: expected, contrib: contrib, minExpected: N ? minE : 0, impossible: false };
  }

  // ---------- 二項分布（小樣本的機率、任務證明用） ----------
  function lnChoose(n, k) { return lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1); }
  function binomPmf(k, n, p) {
    if (k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(lnChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }
  /** P(X ≥ k)，X ~ B(n, p) */
  function binomAtLeast(k, n, p) {
    let s = 0;
    for (let x = Math.max(0, k); x <= n; x++) s += binomPmf(x, n, p);
    return Math.min(1, s);
  }
  /** 多項分布：觀察到恰好 counts 的機率 */
  function multinomPmf(counts, probs) {
    const N = counts.reduce(function (a, b) { return a + b; }, 0);
    let s = lnGamma(N + 1);
    for (let i = 0; i < counts.length; i++) {
      const p = typeof probs[i] === 'number' ? probs[i] : fval(probs[i]);
      if (counts[i] === 0) continue;
      if (p <= 0) return 0;
      s += counts[i] * Math.log(p) - lnGamma(counts[i] + 1);
    }
    return Math.exp(s);
  }

  // ---------- 試交判斷的證據 ----------
  /**
   * 神秘親本與隱性同型合子試交時，某個基因座「看過隱性表現型的子代」嗎？
   * counts：表現型計數（phenoIndex 的順序），L：基因座數。傳回每個基因座看到的隱性子代數。
   */
  function recessiveSeen(counts, L) {
    const out = [];
    for (let i = 0; i < L; i++) out.push(0);
    counts.forEach(function (c, k) {
      const bits = phenoBits(k, L);
      for (let i = 0; i < L; i++) if (!bits[i]) out[i] += c;
    });
    return out;
  }
  /**
   * 判斷有沒有根據（任務用）：猜異型合子的基因座要看過隱性子代；猜同型合子的基因座要看過至少 minN 個子代、且沒有隱性子代。
   * （試交時，異型合子連續 minN 個子代都是顯性的機率只有 (1/2)^minN。）
   */
  function guessJustified(guess, counts, minN) {
    const L = guess.length, N = counts.reduce(function (a, b) { return a + b; }, 0), rs = recessiveSeen(counts, L);
    for (let i = 0; i < L; i++) {
      if (guess[i] === 1 && !(rs[i] > 0)) return false;
      if (guess[i] === 2 && !(N >= minN && rs[i] === 0)) return false;
    }
    return true;
  }

  const api = {
    frac: frac, fadd: fadd, fmul: fmul, fval: fval, fstr: fstr, ratioOf: ratioOf, gcd: gcd,
    TRAITS: TRAITS, TRAIT_IDS: TRAIT_IDS, MENDEL_DIHYBRID: MENDEL_DIHYBRID, MENDEL_TESTCROSS: MENDEL_TESTCROSS,
    genoStr: genoStr, phenoIndex: phenoIndex, phenoBits: phenoBits, genoIndex: genoIndex, genoOf: genoOf,
    allelesOf: allelesOf, gameteSlots: gameteSlots, gametes: gametes, gameteStr: gameteStr, zygote: zygote,
    cross: cross, crossKind: crossKind,
    rng: rng, sampleOne: sampleOne, sampleCounts: sampleCounts, mysteryPick: mysteryPick,
    lnGamma: lnGamma, gammaP: gammaP, gammaQ: gammaQ, chi2Sf: chi2Sf, chi2Cdf: chi2Cdf, chi2Inv: chi2Inv, chiSquare: chiSquare,
    binomPmf: binomPmf, binomAtLeast: binomAtLeast, multinomPmf: multinomPmf,
    recessiveSeen: recessiveSeen, guessJustified: guessJustified
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MendelCore = api;
})(typeof window !== 'undefined' ? window : this);
