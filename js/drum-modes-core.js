/*
 * drum-modes-core.js — 「鼓與板的振動模態」的物理核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   貝索函數 J_m(x)：貝索積分 J_m(x) = (1/2pi) * integral_0^2pi cos(m t - x sin t) dt，用梯形法（週期函數，誤差隨點數指數下降）
 *   零點 j_{m,n}：掃描找變號，再用二分法收斂到 1e-13
 *   圓形膜（邊緣固定）：模態 (m, n) 的形狀 J_m(j_{m,n} r/a) cos(m(theta - theta0))，頻率 f_{m,n} = j_{m,n} c / (2 pi a)，c = sqrt(T/sigma)
 *   定音鼓：空氣負載與鼓腔讓 (1,1)…(5,1) 變成 1.00 : 1.50 : 1.98 : 2.44 : 2.94（Fletcher & Rossing 1998，Rossing 1982 的實測）
 *   方形薄板（四邊簡支）：形狀 sin(m pi x/L) sin(n pi y/L)，頻率 f = (pi/2) sqrt(D/(rho h)) (m^2 + n^2)/L^2
 *   敲擊：點狀的瞬間敲擊，每個模態得到的速度 = 正規化模態在敲擊點的值（正規化：模態在整個面上的均方根 = 1），
 *         振動幅度（位移）= 速度 / 角頻率：頻譜長條、聲音與動畫都用這個振幅
 *   聽起來有沒有音高：各模態離「整數倍泛音」多少音分（振幅加權平均）
 *
 * 單位：長度 m、膜的張力 T（每公尺邊長的力，N/m）、面密度 kg/m^2、頻率 Hz。敲擊點：圓膜用 r/a 與方位角（度），方板用 x/L、y/L。
 * 用法：瀏覽器 window.DrumCore；Node require('./drum-modes-core.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.DrumCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  // ======================= 材料與控制項範圍 =======================
  /** 鼓皮：聚酯薄膜（Mylar）厚 0.19 mm、密度 1390 kg/m^3（定音鼓鼓皮的典型值） */
  const MYLAR = { rho: 1390, h: 0.19e-3 };
  const SIGMA = MYLAR.rho * MYLAR.h;                 // 面密度 0.264 kg/m^2
  /** 方板：鋁（E = 69 GPa、密度 2700 kg/m^3、帕松比 0.33，材料手冊典型值） */
  const ALU = { E: 69e9, rho: 2700, nu: 0.33 };
  /** 控制項範圍（頁面滑桿與任務證明共用）：半徑 a（m）、張力 T（N/m）、邊長 L（m）、板厚 h（mm）、阻尼（1/s） */
  const RANGES = { a: [0.1, 0.4], T: [800, 10000], L: [0.15, 0.4], h: [1.5, 5], r: [0, 0.98], th: [0, 359], x: [0.02, 0.98], y: [0.02, 0.98], damp: [0.3, 8] };
  const DEFAULTS = { drum: 'membrane', a: 0.3, T: 3000, L: 0.3, h: 2, r: 0.55, th: 30, x: 0.3, y: 0.37, damp: 1.2 };
  const SILENT = 0.03;      // 最強的模態振幅比這個還小（正規化單位）→ 幾乎無聲
  const AUDIBLE = 0.01;     // 比最強模態的 1% 還弱的模態不算「被激發」
  const J_MAX = 12.4;       // 圓膜列出 j_{m,n} <= 12.4 的模態（共 19 個，最高約是 (0,1) 的 5.1 倍）

  // ======================= 貝索函數與零點 =======================
  /** J_m(x)，m 為非負整數。梯形法的誤差約為 J_{N-m}(x)，N - m >= x + 32 時小於 1e-20 */
  function besselJ(m, x) {
    m = Math.abs(Math.round(m));
    if (x < 0) return (m % 2 ? -1 : 1) * besselJ(m, -x);
    const N = m + Math.ceil(x) + 32;
    let s = 0;
    for (let k = 0; k < N; k++) {
      const t = 2 * Math.PI * k / N;
      s += Math.cos(m * t - x * Math.sin(t));
    }
    return s / N;
  }
  /** 冪級數 J_m(x) = sum (-1)^k (x/2)^(2k+m) / (k! (k+m)!)（只給測試對照用；x 大時會有抵消誤差） */
  function besselSeries(m, x) {
    let term = Math.pow(x / 2, m);
    for (let i = 1; i <= m; i++) term /= i;
    let s = term;
    for (let k = 1; k < 200; k++) {
      term *= -(x * x / 4) / (k * (k + m));
      s += term;
      if (Math.abs(term) < 1e-18 * Math.max(1, Math.abs(s))) break;
    }
    return s;
  }
  const zeroCache = {};
  /** J_m 的第 n 個正零點 j_{m,n}（n = 1, 2, …） */
  function besselZero(m, n) {
    const list = zeroCache[m] || (zeroCache[m] = []);
    if (list.length >= n) return list[n - 1];
    let x = list.length ? list[list.length - 1] + 0.05 : 0.5;
    let fx = besselJ(m, x);
    const step = 0.05;
    while (list.length < n) {
      const x2 = x + step, f2 = besselJ(m, x2);
      if (fx === 0) { list.push(x); }
      else if (fx * f2 < 0) {
        let lo = x, hi = x2, flo = fx;
        for (let i = 0; i < 80 && hi - lo > 1e-14; i++) {
          const mid = (lo + hi) / 2, fm = besselJ(m, mid);
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        list.push((lo + hi) / 2);
      }
      x = x2; fx = f2;
    }
    return list[n - 1];
  }

  // ======================= 三種鼓的模態 =======================
  /** 圓膜模態的正規化係數：讓模態在整個圓面上的均方根 = 1。
   *  integral_0^1 r J_m(j r)^2 dr = J_{m+1}(j)^2 / 2，cos^2(m theta) 在一圈的平均 = 1/2（m >= 1） */
  function membraneNorm(m, j) { return (m === 0 ? 1 : Math.SQRT2) / Math.abs(besselJ(m + 1, j)); }
  const MEMBRANE = [];
  for (let m = 0; m <= 9; m++) {
    for (let n = 1; ; n++) {
      const j = besselZero(m, n);
      if (j > J_MAX) break;
      MEMBRANE.push({ m: m, n: n, key: m + '-' + n, j: j, norm: membraneNorm(m, j), deg: m > 0 });
    }
  }
  MEMBRANE.sort(function (p, q) { return p.j - q.j; });
  const byKey = {};
  MEMBRANE.forEach(function (o) { byKey[o.key] = o; });
  /** 定音鼓（以 (1,1) 為 1）：Fletcher & Rossing《The Physics of Musical Instruments》第 18 章，Rossing (1982) 的實測比值 */
  const TIMPANI_RATIOS = [[1, 1, 1.00], [2, 1, 1.50], [3, 1, 1.98], [4, 1, 2.44], [5, 1, 2.94]];
  const TIMPANI = TIMPANI_RATIOS.map(function (t) {
    const b = byKey[t[0] + '-' + t[1]];
    return { m: t[0], n: t[1], key: b.key, j: b.j, norm: b.norm, deg: true, ratio11: t[2] };
  });
  /** 方板（四邊簡支）：m, n = 1…7 且 m^2 + n^2 <= 50（50 = 1 + 49 = 25 + 25，最小的「兩種不同平方和」） */
  const PLATE = [];
  for (let m = 1; m <= 7; m++) for (let n = 1; n <= 7; n++) {
    if (m * m + n * n <= 50) PLATE.push({ m: m, n: n, key: m + '-' + n, s: m * m + n * n, norm: 2, deg: false });
  }
  PLATE.sort(function (p, q) { return p.s - q.s || p.m - q.m; });
  const DRUMS = ['membrane', 'timpani', 'plate'];
  function modesOf(drum) { return drum === 'plate' ? PLATE : drum === 'timpani' ? TIMPANI : MEMBRANE; }

  // ======================= 頻率 =======================
  /** 膜上的橫波波速 c = sqrt(T/sigma) */
  function waveSpeed(T) { return Math.sqrt(T / SIGMA); }
  /** 理想圓膜模態的頻率 f = j c / (2 pi a) */
  function membraneFreq(j, a, T) { return j * waveSpeed(T) / (2 * Math.PI * a); }
  /** 方板的彎曲剛度 D = E h^3 / (12 (1 - nu^2))（h 以 m 計） */
  function plateD(hm) { return ALU.E * hm * hm * hm / (12 * (1 - ALU.nu * ALU.nu)); }
  /** 方板 (m, n) 模態的頻率（L 以 m、h 以 mm 輸入） */
  function plateFreq(m, n, L, hmm) {
    const hm = hmm / 1000;
    return Math.PI / 2 * Math.sqrt(plateD(hm) / (ALU.rho * hm)) * (m * m + n * n) / (L * L);
  }
  /** 一個模態在目前設定下的頻率 */
  function modeFreq(drum, md, cfg) {
    if (drum === 'plate') return plateFreq(md.m, md.n, cfg.L, cfg.h);
    if (drum === 'timpani') return md.ratio11 * membraneFreq(byKey['1-1'].j, cfg.a, cfg.T);
    return membraneFreq(md.j, cfg.a, cfg.T);
  }
  /** 基準模態：理想膜用 (0,1)、定音鼓與方板用 (1,1) */
  function baseKey(drum) { return drum === 'membrane' ? '0-1' : '1-1'; }
  /** 整數倍泛音的參考基音：理想膜 f(0,1)；定音鼓 f(1,1)/2（主要模態像同一個音的第 2、3、4、5、6 泛音）；方板 f(1,1) */
  function harmonicRef(drum, fBase) { return drum === 'timpani' ? fBase / 2 : fBase; }
  /** 要讓理想膜的 (m, n) 模態等於頻率 f，需要的張力 T = sigma (2 pi a f / j)^2 */
  function tensionFor(f, j, a) { const c = 2 * Math.PI * a * f / j; return SIGMA * c * c; }

  // ======================= 模態形狀 =======================
  /** 正規化的模態值。圓膜：p = { r（0–1）, th（弧度）}、orient = 這個模態的方向（弧度）；方板：p = { x, y }（0–1） */
  function modeValue(drum, md, p, orient) {
    if (drum === 'plate') return md.norm * Math.sin(md.m * Math.PI * p.x) * Math.sin(md.n * Math.PI * p.y);
    if (p.r >= 1) return 0;
    return md.norm * besselJ(md.m, md.j * p.r) * (md.m ? Math.cos(md.m * (p.th - (orient || 0))) : 1);
  }
  /** 圓膜的徑向表：J_m(j r) 在 r = 0…1 的 N + 1 個等距點（畫面與 3D 用，查表再內插） */
  function radialTable(md, N) {
    const t = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) t[i] = besselJ(md.m, md.j * i / N);
    return t;
  }
  /** 圓膜 (m, n) 的節圓半徑（不含鼓邊）：r = j_{m,k} / j_{m,n}，k = 1 … n - 1 */
  function nodalCircles(md) {
    const out = [];
    for (let k = 1; k < md.n; k++) out.push(besselZero(md.m, k) / md.j);
    return out;
  }
  /** 圓膜 (m, n) 的直徑節線方向（弧度）：cos(m(theta - orient)) = 0，共 m 條直徑 */
  function nodalDiameters(md, orient) {
    const out = [];
    for (let k = 0; k < md.m; k++) out.push((orient || 0) + (2 * k + 1) * Math.PI / (2 * md.m));
    return out;
  }
  /** 方板 (m, n) 的節線：x = k/m、y = k/n（不含四邊） */
  function plateNodalLines(md) {
    const xs = [], ys = [];
    for (let k = 1; k < md.m; k++) xs.push(k / md.m);
    for (let k = 1; k < md.n; k++) ys.push(k / md.n);
    return { xs: xs, ys: ys };
  }

  // ======================= 音名、音分與整數倍 =======================
  function cents(r) { return 1200 * Math.log2(r); }
  function nearest(f) {
    const m = MT.freqToMidi(f), r = Math.round(m);
    return { midi: r, cents: (m - r) * 100, name: MT.noteName(r) };
  }
  /** 頻率 f 離參考基音 fH 的整數倍多遠：最接近的整數 k（>= 1）與差幾音分 */
  function harmonicFit(f, fH) {
    const h = f / fH, k = Math.max(1, Math.round(h));
    return { h: h, k: k, dev: cents(h / k) };
  }

  // ======================= 頁面與任務證明共用的資料 =======================
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  /** 敲擊點：圓膜 { r, th（度）}、方板 { x, y } */
  function strikePoint(cfg) {
    return cfg.drum === 'plate' ? { x: cfg.x, y: cfg.y } : { r: cfg.r, th: cfg.th * Math.PI / 180 };
  }
  /**
   * cfg = { drum, a, T, L, h, r, th, x, y, damp }
   * 傳回敲一下的完整資料：每個模態的頻率、比值、敲擊點的模態值 A（= 得到的速度）、振動幅度 D = A f_low / f、
   * 相對強度 rel = |D| / 最大的 |D|、衰減時間、
   * 離整數倍泛音的偏差；以及基準頻率、最低頻率、頻譜重心、加權偏差……
   * 圓膜的 m >= 1 模態有 cos m(theta) 與 sin m(theta) 兩個方向、頻率相同：敲擊激發的是讓敲擊點落在波腹的那個組合，
   * 所以振幅 = norm J_m(j r_s)，方向 = 敲擊點的方位角（直徑節線躲不掉，只有節圓與中心躲得掉）。
   */
  function analyze(cfg) {
    const drum = DRUMS.indexOf(cfg.drum) >= 0 ? cfg.drum : 'membrane';
    const list = modesOf(drum);
    const p = strikePoint(Object.assign({}, cfg, { drum: drum }));
    const orient = drum === 'plate' ? 0 : p.th;
    const bk = baseKey(drum);
    const bmd = list.filter(function (o) { return o.key === bk; })[0];
    const fBase = modeFreq(drum, bmd, cfg);
    const fH = harmonicRef(drum, fBase);
    const damp = cfg.damp == null ? DEFAULTS.damp : cfg.damp;
    let fLow = Infinity;
    list.forEach(function (md) { const f = modeFreq(drum, md, cfg); if (f < fLow) fLow = f; });
    const modes = list.map(function (md) {
      const f = modeFreq(drum, md, cfg);
      const A = modeValue(drum, md, p, orient);
      const D = A * fLow / f;            // 位移振幅 = 速度 / 角頻率（以最低模態為準的相對單位）
      const fit = harmonicFit(f, fH);
      return { m: md.m, n: md.n, key: md.key, f: f, ratio: f / fBase, A: A, D: D, amp: Math.abs(D), rel: 0, h: fit.h, k: fit.k, dev: fit.dev, tau: 0, deg: md.deg };
    });
    let peak = 0;
    modes.forEach(function (o) { if (o.amp > peak) peak = o.amp; });
    let sw = 0, sdev = 0, sf = 0, excited = 0;
    modes.forEach(function (o) {
      o.rel = peak > 0 ? o.amp / peak : 0;
      o.tau = 1 / (damp * o.f / fLow);
      if (o.rel >= AUDIBLE && peak >= SILENT) {
        excited++;
        sw += o.amp; sdev += o.amp * Math.abs(o.dev); sf += o.amp * o.f;
      }
    });
    const silent = peak < SILENT;
    const near = nearest(fBase);
    const strongest = silent ? null : modes.reduce(function (b, o) { return o.amp > b.amp ? o : b; }, modes[0]);
    return {
      drum: drum, a: cfg.a, T: cfg.T, L: cfg.L, h: cfg.h, r: cfg.r, th: cfg.th, x: cfg.x, y: cfg.y, damp: damp,
      c: drum === 'plate' ? null : waveSpeed(cfg.T),
      modes: modes, peak: peak, silent: silent, excited: excited,
      fBase: fBase, fH: fH, fLow: fLow, baseKey: bk,
      f01: drum === 'membrane' ? fBase : null, f11: drum === 'membrane' ? membraneFreq(byKey['1-1'].j, cfg.a, cfg.T) : fBase,
      inharm: sw ? sdev / sw : null, centroid: sw ? sf / sw / fLow : null,
      strongest: strongest ? strongest.key : null,
      note: near.name, noteCents: near.cents
    };
  }
  /** 依代號找 analyze 結果裡的模態 */
  function mode(info, key) {
    for (let i = 0; i < info.modes.length; i++) if (info.modes[i].key === key) return info.modes[i];
    return null;
  }

  /**
   * 任務事件的資料（頁面與任務證明共用）：analyze 的摘要，加上每個模態的相對振幅 rel、敲擊點的模態值 A（有正負）、
   * 對基準模態的頻率比 ratio（都以模態代號 'm-n' 為鍵）。extra 會併進去（via、sel……）。
   */
  function payload(info, extra) {
    const rel = {}, A = {}, ratio = {};
    info.modes.forEach(function (o) {
      rel[o.key] = Math.round(o.rel * 1e4) / 1e4;
      A[o.key] = Math.round(o.A * 1e4) / 1e4;
      ratio[o.key] = Math.round(o.ratio * 1e5) / 1e5;
    });
    return Object.assign({
      drum: info.drum, a: info.a, T: info.T, L: info.L, h: info.h, r: info.r, th: info.th, x: info.x, y: info.y, damp: info.damp,
      fBase: info.fBase, fLow: info.fLow, f01: info.f01, f11: info.f11, baseKey: info.baseKey,
      silent: info.silent, excited: info.excited, inharm: info.inharm, centroid: info.centroid, strongest: info.strongest,
      note: info.note, noteCents: info.noteCents, rel: rel, A: A, ratio: ratio, top: topTwo(info)
    }, extra || {});
  }
  /** 依強度排序的前兩名模態代號 */
  function topTwo(info) {
    const s = info.modes.slice().sort(function (p, q) { return q.amp - p.amp; });
    return [s[0] && s[0].key, s[1] && s[1].key];
  }

  return {
    payload: payload, topTwo: topTwo,
    MYLAR: MYLAR, SIGMA: SIGMA, ALU: ALU, RANGES: RANGES, DEFAULTS: DEFAULTS, SILENT: SILENT, AUDIBLE: AUDIBLE, J_MAX: J_MAX,
    MEMBRANE: MEMBRANE, TIMPANI: TIMPANI, TIMPANI_RATIOS: TIMPANI_RATIOS, PLATE: PLATE, DRUMS: DRUMS, byKey: byKey,
    besselJ: besselJ, besselSeries: besselSeries, besselZero: besselZero, membraneNorm: membraneNorm,
    modesOf: modesOf, waveSpeed: waveSpeed, membraneFreq: membraneFreq, plateD: plateD, plateFreq: plateFreq, modeFreq: modeFreq,
    baseKey: baseKey, harmonicRef: harmonicRef, tensionFor: tensionFor,
    modeValue: modeValue, radialTable: radialTable, nodalCircles: nodalCircles, nodalDiameters: nodalDiameters, plateNodalLines: plateNodalLines,
    cents: cents, nearest: nearest, harmonicFit: harmonicFit, clamp: clamp, strikePoint: strikePoint, analyze: analyze, mode: mode
  };
}));
