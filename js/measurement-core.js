/*
 * measurement-core.js — 「測量與不確定度（游標尺與螺旋測微器）」的核心（讀數演算法、有效數字、統計），與畫面無關，可單獨測試
 *
 * 單位：長度一律用 mm；儀器讀數在內部用整數 µm（0.001 mm）表示，避免浮點誤差（23.45 mm = 23450 µm）。
 *
 * 游標尺（vernier caliper）：主尺每格 1 mm；游標 N 格的總長是 (N − 1) mm，所以游標每格 (N − 1)/N mm，
 *   比主尺每格短 c = 1/N mm（精度、最小讀數）：N = 20 → 0.05 mm，N = 50 → 0.02 mm。
 *   游標 0 刻線在主尺位置 R 時，游標第 k 條刻線在 R + k (N − 1)/N。設 R = M + f（M 為整數 mm，0 ≤ f < 1），
 *   第 k 條刻線與主尺第 M + k 條刻線相差 f − k c，所以 f = k c 時第 k 條「對齊」：讀數 R = M + k c。
 *   R 為整數 mm 時，第 0 條與第 N 條（游標最末一條）同時對齊。
 * 螺旋測微器（micrometer）：螺距 0.5 mm（套管轉一圈，測軸前進 0.5 mm），套管一圈 50 格，每格 0.01 mm；估讀到 0.001 mm。
 *   讀數 R = 套筒讀數（套管邊緣左邊露出的最後一條刻線，上排整毫米、下排半毫米）＋ 對齊基準線的格數 × 0.01 mm。
 * 零點誤差 e：夾爪（測軸與測砧）完全合攏時的讀數。量物體時讀數 R = L + e，修正後 L = R − e。
 *
 * 不確定度（依 ISO-GUM，選修物理Ⅰ 第 1 章的寫法）：
 *   A 類：u_A = s/√n，s 為樣本標準差（分母 n − 1）。B 類：u_B = 最小刻度 / (2√3)。組合：u = √(u_A² + u_B²)。
 *   不確定度以「無條件進位」取至多 2 位有效數字，但第 3 位有效數字是 0 時捨去（0.1417 → 0.15，0.1407 → 0.14）；
 *   最佳估計值（平均值）以四捨五入保留到與不確定度的末位一致；結果寫成 X ± ΔX。
 *
 * 隨機數：mulberry32（可設定種子，測試可重現）；常態分布用 Box–Muller。
 */
(function (root) {
  'use strict';

  // ======================= 隨機數 =======================
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /** 標準常態分布（Box–Muller） */
  function gaussian(rng) {
    let u = 0;
    while (u <= 1e-12) u = rng();
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** a ≤ 整數 ≤ b */
  function randInt(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }

  // ======================= 儀器 =======================
  const VERNIER = {
    20: { N: 20, c: 0.05, cUm: 50, div: 19 / 20, span: 19, label: 2 },  // label：每幾格標一個數字（數字 k 代表 0.k mm）
    50: { N: 50, c: 0.02, cUm: 20, div: 49 / 50, span: 49, label: 5 }
  };
  const MICRO = { pitch: 0.5, pitchUm: 500, divisions: 50, c: 0.01, cUm: 10, est: 0.001, rangeMm: 25 };
  /** 多次測量用的三種儀器：最小刻度 lc（B 類不確定度用）、讀數的間隔 stepUm、讀數寫到小數第幾位 */
  const INSTR = {
    v20: { kind: 'vernier', N: 20, lc: 0.05, stepUm: 50, decimals: 2 },
    v50: { kind: 'vernier', N: 50, lc: 0.02, stepUm: 20, decimals: 2 },
    micro: { kind: 'micro', N: 0, lc: 0.01, stepUm: 1, decimals: 3 }
  };

  // ======================= 游標尺 =======================
  /**
   * 游標尺讀數：游標 0 刻線在主尺位置 xUm（µm，可為負、可不在格點上）。
   * 傳回 { mainMm（游標 0 刻線左邊最近的主尺刻線，整數 mm）, k（最對齊的游標刻線 0…N−1）, valueUm（M·1000 + k·c）, mismatchUm（x − 讀數）}
   */
  function vernierRead(xUm, N) {
    const V = VERNIER[N];
    let main = Math.floor(xUm / 1000);
    const f = xUm - main * 1000;
    let k = Math.round(f / V.cUm);
    if (k >= N) { main += 1; k -= N; }
    const valueUm = (main * 1000 + k * V.cUm) || 0; // 不要 −0
    return { mainMm: main, k: k, valueUm: valueUm, mismatchUm: xUm - valueUm };
  }
  /** 游標第 k 條刻線在主尺上的位置（mm） */
  function vernierLineMm(zeroMm, k, N) { return zeroMm + k * VERNIER[N].div; }
  /** 游標每一條刻線與最近主尺刻線的距離（µm，正 = 在主尺刻線右邊），k = 0…N */
  function vernierOffsets(zeroUm, N) {
    const out = [];
    for (let k = 0; k <= N; k++) {
      const p = zeroUm + k * (N - 1) * 1000 / N; // µm
      out.push(p - Math.round(p / 1000) * 1000);
    }
    return out;
  }

  // ======================= 螺旋測微器 =======================
  /**
   * 螺旋測微器讀數：讀數 xUm（µm）。
   * 傳回 { sleeveUm（套筒讀數，500 µm 的倍數）, halfShown（露出的最後一條是下排的半毫米刻線）, div（對齊格數，0 ≤ div < 50，可有小數）,
   *        divInt、tenth（整格與估讀的十分之一格）, valueUm }
   */
  function microRead(xUm) {
    const sleeve = Math.floor(xUm / MICRO.pitchUm) * MICRO.pitchUm;
    const div = (xUm - sleeve) / MICRO.cUm;
    const tenthsTotal = Math.round(div * 10);
    return {
      sleeveUm: sleeve,
      halfShown: Math.abs(sleeve % 1000) === 500,
      div: div, divInt: Math.floor(tenthsTotal / 10), tenth: tenthsTotal % 10,
      valueUm: sleeve + tenthsTotal
    };
  }
  /** 套管轉過的圈數（讀數 0 時為 0；讀數每增加 0.5 mm 轉一圈） */
  function thimbleTurns(xUm) { return xUm / MICRO.pitchUm; }

  // ======================= 讀數的輸入與核對 =======================
  /** 學生輸入的讀數（mm）：接受全形數字、逗號小數點、「mm」、各種負號。傳回 { value, decimals, um, exactUm, str } 或 null */
  function parseReading(str) {
    let s = String(str == null ? '' : str).normalize('NFKC').trim()
      .replace(/\s*(mm|毫米|公釐|公厘)\s*$/i, '')
      .replace(/[，,]/g, '.').replace(/[−–—]/g, '-').replace(/\s+/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const body = s.replace(/^[-+]/, '');
    const i = body.indexOf('.');
    const decimals = i < 0 ? 0 : body.length - i - 1;
    const value = parseFloat(s);
    const um = Math.round(value * 1000);
    return { value: value, decimals: decimals, um: um, exactUm: Math.abs(value * 1000 - um) < 1e-6, str: s };
  }
  /** 游標尺：讀數要完全正確，並寫到 0.01 mm 位（2 位小數） */
  function checkVernier(str, expectedUm) {
    const p = parseReading(str);
    if (!p) return { parsed: null, ok: false, valueOk: false, formatOk: false };
    const valueOk = p.exactUm && p.um === expectedUm;
    const formatOk = p.decimals === 2;
    return { parsed: p, valueOk: valueOk, formatOk: formatOk, ok: valueOk && formatOk, diffUm: p.value * 1000 - expectedUm };
  }
  /** 螺旋測微器：估讀位可差 ±0.001 mm，要寫到 0.001 mm 位（3 位小數）；exact = 估讀也完全正確 */
  function checkMicro(str, expectedUm) {
    const p = parseReading(str);
    if (!p) return { parsed: null, ok: false, valueOk: false, formatOk: false, exact: false };
    const diff = p.value * 1000 - expectedUm;
    const valueOk = Math.abs(diff) <= 1 + 1e-6;
    const formatOk = p.decimals === 3;
    return { parsed: p, valueOk: valueOk, formatOk: formatOk, ok: valueOk && formatOk, exact: valueOk && formatOk && Math.abs(diff) < 1e-6, diffUm: diff };
  }

  // ======================= 四捨五入與有效數字 =======================
  /** 四捨五入到小數第 d 位（d 可為負），避開二進位浮點的 2.0775 → 2.077 問題 */
  function roundHalfUp(x, d) {
    if (!isFinite(x)) return x;
    const m = Math.pow(10, d);
    const y = Math.abs(x) * m;
    const r = Math.floor(y + 0.5 + 1e-9 * Math.max(1, y));
    return (x < 0 ? -r : r) / m;
  }
  /** 四捨五入後的固定小數字串（負號用 ASCII '-'；−0 寫成 0） */
  function fixed(x, d) {
    if (!isFinite(x)) return '—';
    const r = roundHalfUp(x, d);
    const s = r.toFixed(Math.max(0, d));
    return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
  }
  /**
   * 數字字串的有效數字位數：{ n, ambiguous（整數的後綴零，無法判斷）}。
   * 規則：非零數字都是；非零數字之間的零是；前綴零不是；小數點後的後綴零是。全為 0（如 0.00）時 n = 0。
   */
  function sigFigs(str) {
    const s = String(str).trim().replace(/^[-+−]/, '');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    const hasDot = s.indexOf('.') >= 0;
    const digits = s.replace('.', '').replace(/^0+/, '');
    if (!digits.length) return { n: 0, ambiguous: false };
    if (hasDot) return { n: digits.length, ambiguous: false };
    const core = digits.replace(/0+$/, '');
    return { n: digits.length, ambiguous: core.length < digits.length, min: core.length };
  }
  /**
   * 不確定度的取法：無條件進位取 2 位有效數字，但第 3 位有效數字是 0 時捨去。
   * 傳回 { value, decimals（小數位數）, str } ；u ≤ 0 或非數字時傳回 null。
   */
  function roundUncertainty(u) {
    if (!(u > 0) || !isFinite(u)) return null;
    const e = u.toExponential(11);           // 例如 "1.31000000000e-2"：先取 12 位有效數字，消去浮點雜訊
    const mant = e.split('e')[0].replace('.', '');
    let exp = parseInt(e.split('e')[1], 10);
    let q = parseInt(mant.slice(0, 2), 10);
    const third = parseInt(mant.charAt(2), 10);
    if (third !== 0) q += 1;
    if (q >= 100) { q = 10; exp += 1; }
    const decimals = Math.max(0, 1 - exp);
    const value = q * Math.pow(10, exp - 1);
    return { value: roundHalfUp(value, decimals), decimals: decimals, str: value.toFixed(decimals) };
  }
  /** 測量結果：平均值四捨五入到與不確定度的末位一致 → { best, unc, decimals, sig（最佳估計值的有效數字位數）, bestValue, uncValue } */
  function formatResult(mean, u) {
    const U = roundUncertainty(u);
    if (!U || !isFinite(mean)) return null;
    const best = fixed(mean, U.decimals);
    const sf = sigFigs(best);
    return { best: best, unc: U.str, decimals: U.decimals, sig: sf ? sf.n : 0, bestValue: parseFloat(best), uncValue: U.value };
  }

  // ======================= 統計 =======================
  function mean(a) {
    if (!a.length) return NaN;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i];
    return s / a.length;
  }
  function sumSq(a) {
    const m = mean(a);
    let s = 0;
    for (let i = 0; i < a.length; i++) { const d = a[i] - m; s += d * d; }
    return s;
  }
  /** 樣本標準差（分母 n − 1）；n < 2 時為 NaN */
  function sampleStd(a) { return a.length < 2 ? NaN : Math.sqrt(sumSq(a) / (a.length - 1)); }
  /** 母體標準差（分母 n） */
  function popStd(a) { return a.length < 1 ? NaN : Math.sqrt(sumSq(a) / a.length); }
  /** 平均值的標準誤差 s/√n（＝ A 類不確定度） */
  function stdError(a) { return sampleStd(a) / Math.sqrt(a.length); }
  /** B 類不確定度：最小刻度 / (2√3)（讀數在一格之內均勻分布） */
  function typeB(lc) { return lc / (2 * Math.sqrt(3)); }
  /** 組合不確定度 √(Σ u²) */
  function combine() {
    let s = 0;
    for (let i = 0; i < arguments.length; i++) s += arguments[i] * arguments[i];
    return Math.sqrt(s);
  }
  /** 要讓 s/√n ≤ target 至少要量幾次（至少 2 次） */
  function nForTarget(s, target) { return Math.max(2, Math.ceil((s / target) * (s / target) - 1e-9)); }
  /** 直方圖：以 origin 為格點、寬 w 分組 → [{ x0, x1, count }]（由小到大，只含有資料的範圍） */
  function histogram(values, w, origin) {
    if (!values.length || !(w > 0)) return [];
    origin = origin || 0;
    const idx = values.map(function (v) { return Math.floor((v - origin) / w + 1e-9); });
    const lo = Math.min.apply(null, idx), hi = Math.max.apply(null, idx);
    const bins = [];
    for (let i = lo; i <= hi; i++) bins.push({ x0: origin + i * w, x1: origin + (i + 1) * w, count: 0 });
    idx.forEach(function (i) { bins[i - lo].count++; });
    return bins;
  }

  // ======================= 模擬的儀器讀數 =======================
  /**
   * 一次測量（多次測量模式）：真值 trueUm（µm）、系統誤差 biasMm、隨機誤差 sigmaMm（常態分布）。
   * 讀數取到儀器的間隔：游標尺 0.05／0.02 mm（對齊最近的刻線）、螺旋測微器估讀到 0.001 mm。傳回 µm（整數）。
   */
  function simulateReading(trueUm, instrKey, sigmaMm, biasMm, rng) {
    const I = INSTR[instrKey];
    const x = trueUm + 1000 * (biasMm + (sigmaMm > 0 ? sigmaMm * gaussian(rng) : 0));
    return Math.round(x / I.stepUm) * I.stepUm;
  }
  /**
   * 一組數據的統計（頁面與任務證明共用）：readingsUm（µm）、instrKey、trueMm、mode（'AB' 組合或 'A' 只算 A 類）、tau（精密的門檻，預設 2 × 最小刻度）。
   * 傳回 n、平均值、樣本與母體標準差、u_A、u_B、u、測量結果字串、是否精密／準確、區間是否含真值。
   */
  function summarize(readingsUm, instrKey, trueMm, mode) {
    const I = INSTR[instrKey];
    const xs = readingsUm.map(function (u) { return u / 1000; });
    const n = xs.length;
    const m = mean(xs), s = sampleStd(xs), sp = popStd(xs);
    const uA = n >= 2 ? s / Math.sqrt(n) : NaN;
    const uB = typeB(I.lc);
    const uAB = n >= 2 ? combine(uA, uB) : NaN;
    const u = mode === 'A' ? uA : uAB;
    const res = n >= 2 ? formatResult(m, u) : null;
    const resAB = n >= 2 ? formatResult(m, uAB) : null;
    let allSame = n >= 1;
    for (let i = 1; i < n; i++) if (readingsUm[i] !== readingsUm[0]) { allSame = false; break; }
    const tau = 2 * I.lc;
    const accurate = n >= 2 ? Math.abs(m - trueMm) <= 2 * uAB : null;
    const precise = n >= 2 ? s <= tau + 1e-12 : null;
    const contains = resAB ? Math.abs(resAB.bestValue - trueMm) <= resAB.uncValue + 1e-9 : null;
    return {
      instr: instrKey, n: n, mean: m, s: s, sp: sp, uA: uA, uB: uB, uAB: uAB, u: u,
      result: res, resultAB: resAB, allSame: allSame, tau: tau,
      precise: precise, accurate: accurate, contains: contains, bias: m - trueMm
    };
  }

  // ======================= 題目（隨機物件） =======================
  const V_RANGE = { outer: [6000, 40000], inner: [10000, 38000], depth: [5000, 35000] };
  const M_RANGE = { wire: [100, 2000], sheet: [50, 1500], ball: [3000, 15000] };
  /** 游標尺的題目：尺寸在格點上（讀數唯一）；零點誤差 ±(1…6) 格（20 格）或 ±(1…10) 格（50 格） */
  function makeVernierItem(rng, N, kind, zeroOn) {
    const c = VERNIER[N].cUm, r = V_RANGE[kind];
    const sizeUm = c * randInt(rng, Math.ceil(r[0] / c), Math.floor(r[1] / c));
    let zeroUm = 0;
    if (zeroOn) zeroUm = (rng() < 0.5 ? -1 : 1) * c * randInt(rng, 1, N === 20 ? 6 : 10);
    return {
      instr: 'vernier', N: N, kind: kind, sizeUm: sizeUm, zeroUm: zeroUm, readingUm: sizeUm + zeroUm,
      wallUm: 2500 + 500 * randInt(rng, 0, 3), shade: rng()
    };
  }
  /** 螺旋測微器的題目：尺寸在 0.001 mm 的格點上；零點誤差 ±(2…15) µm */
  function makeMicroItem(rng, kind, zeroOn) {
    const r = M_RANGE[kind];
    const sizeUm = randInt(rng, r[0], r[1]);
    let zeroUm = 0;
    if (zeroOn) zeroUm = (rng() < 0.5 ? -1 : 1) * randInt(rng, 2, 15);
    return { instr: 'micro', N: 0, kind: kind, sizeUm: sizeUm, zeroUm: zeroUm, readingUm: sizeUm + zeroUm, shade: rng() };
  }
  /** 這一題要填的答案（µm）：檢查零點時是零點讀數 e；量物體時是修正後的長度 L = R − e */
  function expectedUm(item, zeroCheck) { return zeroCheck ? item.zeroUm : item.sizeUm; }

  const api = {
    mulberry32: mulberry32, gaussian: gaussian, randInt: randInt,
    VERNIER: VERNIER, MICRO: MICRO, INSTR: INSTR, V_RANGE: V_RANGE, M_RANGE: M_RANGE,
    vernierRead: vernierRead, vernierLineMm: vernierLineMm, vernierOffsets: vernierOffsets,
    microRead: microRead, thimbleTurns: thimbleTurns,
    parseReading: parseReading, checkVernier: checkVernier, checkMicro: checkMicro,
    roundHalfUp: roundHalfUp, fixed: fixed, sigFigs: sigFigs, roundUncertainty: roundUncertainty, formatResult: formatResult,
    mean: mean, sampleStd: sampleStd, popStd: popStd, stdError: stdError, typeB: typeB, combine: combine, nForTarget: nForTarget, histogram: histogram,
    simulateReading: simulateReading, summarize: summarize,
    makeVernierItem: makeVernierItem, makeMicroItem: makeMicroItem, expectedUm: expectedUm
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MeasurementCore = api;
})(typeof window !== 'undefined' ? window : this);
