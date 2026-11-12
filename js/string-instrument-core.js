/*
 * string-instrument-core.js — 「弦樂器：弦長、張力與品格」的物理核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   梅森定律：波速 v = √(T/μ)、基頻 f₁ = (1/2L)√(T/μ)、泛音 fₙ = n·f₁；反過來求張力、線密度、直徑
 *   弦的材料：μ = ρπd²/4（尼龍 1140 kg/m³、鋼 7850 kg/m³）
 *   品格：十二平均律 xₙ = L(1 − 2^(−n/12))；傳統「18 法則」xₙ = L(1 − (17/18)ⁿ)；兩者的位置差與音分差
 *   撥弦：三角形初始形狀的傅立葉係數 aₙ = 2h sin(nπβ) / (n²π²β(1−β))（β = 撥弦點到琴橋的距離 ÷ 振動部分的長度）
 *   輕觸泛音：手指輕觸的地方，只有在那裡有節點的模態留下（濾波係數 gₙ = exp(−(sin(nπξ)/w)²)）
 *   弦形：模態疊加 y(u, t) = Σ aₙ gₙ sin(nπu) cos(2πn f₁ t)；擦弦（亥姆霍茲運動）y = (8/π²) Σ sin(nπu) sin(2πn f₁ t) / n²
 *   樂器預設：古典吉他六條弦、小提琴四條弦、二胡內外弦（弦長、張力、線密度是典型值）
 *   analyze()：頁面與任務證明共用的「撥一下」與「調弦」資料
 *
 * 單位：長度 m（直徑 mm）、張力 N、線密度 kg/m（介面顯示 g/m）、頻率 Hz。
 * 用法：瀏覽器 window.StringCore；Node require('./string-instrument-core.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.StringCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const G = 9.80665;                       // 標準重力加速度（kgw 換算）
  const N_MODES = 24;                      // 計算與發聲的模態數
  const TOUCH_W = 0.1;                     // 輕觸的寬容度 w（|sin(nπξ)| 比 w 小很多的模態才留下）
  const SILENT = 0.03;                     // 輕觸後最強的成分不到原本的 3% → 幾乎無聲
  const AUDIBLE = 0.05;                    // 比最強成分的 5% 還弱的泛音不算「聽到的最低泛音」
  const RULE18_K = 1 / (1 - Math.pow(2, -1 / 12));   // 真正的「法則常數」17.817…

  /** 控制項範圍（頁面滑桿與任務證明共用） */
  const RANGES = {
    L: [0.2, 1.4], T: [10, 200], muG: [0.3, 15], beta: [0.05, 0.5],
    fret: [0, 19], finger: [0, 19], touch: [0.05, 0.95]
  };
  /** 材料密度（kg/m³，工程材料手冊的典型值）與直徑滑桿的範圍（mm；讓線密度留在 0.3–15 g/m 附近） */
  const MATERIALS = {
    nylon: { rho: 1140, d: [0.6, 3.0], zh: '尼龍', en: 'Nylon' },
    steel: { rho: 7850, d: [0.22, 1.5], zh: '鋼', en: 'Steel' }
  };

  // ======================= 梅森定律 =======================
  /** 波速 v = √(T/μ)（m/s） */
  function waveSpeed(T, mu) { return Math.sqrt(T / mu); }
  /** 基頻 f₁ = (1/2L)√(T/μ)（Hz） */
  function fundamental(L, T, mu) { return waveSpeed(T, mu) / (2 * L); }
  /** 第 n 個泛音 fₙ = n·f₁ */
  function harmonic(n, L, T, mu) { return n * fundamental(L, T, mu); }
  /** 要得到頻率 f 需要的張力 T = μ(2Lf)² */
  function tensionFor(f, L, mu) { const v = 2 * L * f; return mu * v * v; }
  /** 要得到頻率 f 需要的線密度 μ = T/(2Lf)² */
  function muFor(f, L, T) { const v = 2 * L * f; return T / (v * v); }
  /** 實心圓弦的線密度 μ = ρπd²/4（d 以 mm 輸入，傳回 kg/m） */
  function muWire(rho, dmm) { const d = dmm / 1000; return rho * Math.PI * d * d / 4; }
  /** 線密度 μ（kg/m）的實心弦，直徑是多少 mm */
  function diameterFor(mu, rho) { return Math.sqrt(4 * mu / (Math.PI * rho)) * 1000; }
  /** 張力換算成公斤重 */
  function kgw(T) { return T / G; }

  // ======================= 品格 =======================
  /** 按第 n 品後剩下（振動部分）的長度比：十二平均律 2^(−n/12)；18 法則 (17/18)ⁿ */
  function fretRatio(n, rule) {
    if (rule === 'r18') return Math.pow(17 / 18, n);
    if (rule === 'k') return Math.pow(1 - 1 / RULE18_K, n);
    return Math.pow(2, -n / 12);
  }
  /** 第 n 品到琴枕的距離 xₙ = L(1 − 剩下的比例) */
  function fretX(n, L, rule) { return L * (1 - fretRatio(n, rule)); }
  /** 18 法則的第 n 品比十二平均律的位置靠近琴枕多少（m，正值） */
  function rule18Gap(n, L) { return L * (Math.pow(17 / 18, n) - Math.pow(2, -n / 12)); }
  /** 18 法則的第 n 品比十二平均律低多少音分（負值：偏低） */
  function rule18Cents(n) { return n * (1200 * Math.log2(18 / 17) - 100); }
  /** 1 到 maxFret 品之中，18 法則位置誤差最大的一品 */
  function rule18Worst(maxFret) {
    let best = 1;
    for (let n = 2; n <= (maxFret || 19); n++) if (rule18Gap(n, 1) > rule18Gap(best, 1)) best = n;
    return best;
  }
  /** 手指離琴枕 s 個半音（無品樂器，可以是小數）時振動部分的長度 */
  function fingerLength(s, L) { return L * Math.pow(2, -s / 12); }
  /** 輕觸位置（離琴枕的比例 ξ）相當於第幾品（十二平均律，可以是小數） */
  function touchFret(xi) { return -12 * Math.log2(1 - xi); }
  /** 第 n 品（十二平均律）的位置 ξ = 1 − 2^(−n/12) */
  function fretXi(n) { return 1 - Math.pow(2, -n / 12); }

  // ======================= 撥弦與輕觸 =======================
  /** 撥弦係數 aₙ = 2h sin(nπβ) / (n²π²β(1−β))：三角形初始形狀的傅立葉正弦級數 */
  function pluckCoeff(n, beta, h) {
    return 2 * (h == null ? 1 : h) * Math.sin(n * Math.PI * beta) / (n * n * Math.PI * Math.PI * beta * (1 - beta));
  }
  /** 撥的瞬間的三角形（u：離琴橋的比例，0–1；頂點在 u = β，高度 h） */
  function triangle(u, beta, h) {
    h = h == null ? 1 : h;
    return u <= beta ? h * u / beta : h * (1 - u) / (1 - beta);
  }
  /** 輕觸的濾波係數：模態在輕觸點的位移 sin(nπξ) 越小（越接近節點），留下得越多 */
  function touchFactor(n, xi, w) {
    if (xi == null) return 1;
    const s = Math.sin(n * Math.PI * xi) / (w || TOUCH_W);
    return Math.exp(-s * s);
  }
  /**
   * 頻譜：o = { beta, touch（輕觸位置 ξ，沒有輕觸為 null）, bow（擦弦）, N }
   * 傳回：a（位移的模態振幅，含輕觸濾波）、A（聲音＝琴橋受力 ∝ n·aₙ，以沒有輕觸時的最大成分為 1）、
   *       g（輕觸濾波）、peak（A 的最大值）、silent（幾乎無聲）、lowest（聽到的最低泛音的次數）。
   * 擦弦用理想的亥姆霍茲運動：位移 ∝ 1/n²、琴橋受力 ∝ 1/n（所有泛音都在）。
   */
  function spectrum(o) {
    const N = o.N || N_MODES;
    const a = [], A = [], g = [], raw = [];
    let rawMax = 0;
    for (let n = 1; n <= N; n++) {
      const r = o.bow ? 1 / n : Math.abs(Math.sin(n * Math.PI * o.beta)) / n;
      raw.push(r);
      if (r > rawMax) rawMax = r;
    }
    let peak = 0;
    for (let n = 1; n <= N; n++) {
      const gn = touchFactor(n, o.touch);
      g.push(gn);
      a.push((o.bow ? 8 / (Math.PI * Math.PI * n * n) : pluckCoeff(n, o.beta, 1)) * gn);
      const An = raw[n - 1] * gn / rawMax;
      A.push(An);
      if (An > peak) peak = An;
    }
    const silent = peak < SILENT;
    let lowest = null;
    if (!silent) for (let n = 1; n <= N; n++) if (A[n - 1] >= AUDIBLE * peak) { lowest = n; break; }
    return { a: a, A: A, g: g, peak: peak, silent: silent, lowest: lowest };
  }
  /** 模態疊加的弦形：u 是離琴橋的比例；amps = aₙ（已含濾波）；phase = 2π f₁ t；decay[n−1] 是各模態目前的衰減倍數 */
  function shapeAt(u, amps, phase, decay, bow) {
    let y = 0;
    for (let n = 1; n <= amps.length; n++) {
      const an = amps[n - 1];
      if (!an) continue;
      const d = decay ? decay[n - 1] : 1;
      y += an * d * Math.sin(n * Math.PI * u) * (bow ? Math.sin(n * phase) : Math.cos(n * phase));
    }
    return y;
  }
  /** 各模態的衰減時間 τₙ（秒，振幅降到 1/e）：高次泛音衰減較快（近似）；inst 決定整體長短 */
  function decayTau(n, f1, inst) {
    const k = (INSTRUMENTS[inst] || INSTRUMENTS.guitar).decay;
    const base = Math.max(0.5, Math.min(3.5, 1.8 * Math.pow(220 / f1, 0.4))) * k;
    return base * Math.pow(n, -0.7);
  }

  // ======================= 音名與音分 =======================
  function freqOf(midi) { return MT.midiToFreq(midi); }
  /** 頻率 → 最接近的十二平均律音（A4 = 440 Hz）與偏差音分 */
  function nearest(f) {
    const m = MT.freqToMidi(f);
    const r = Math.round(m);
    return { midi: r, cents: (m - r) * 100, name: MT.noteName(r) };
  }
  /** 頻率比 → 音分 */
  function cents(r) { return 1200 * Math.log2(r); }

  // ======================= 樂器預設 =======================
  /*
   * 典型值（依常見弦組的規格估算，各廠牌不同）：
   *   古典吉他：弦長 650 mm；高音三條是實心尼龍弦，低音三條是尼龍芯外面纏金屬線的纏繞弦；每條約 60–80 N。
   *   小提琴：弦長 328 mm；G、D、A 是合成纖維芯的纏繞弦，E 是實心鋼弦。
   *   二胡：千斤到琴碼約 400 mm；內弦 D4、外弦 A4，都是鋼弦。
   * detune：拿出琴盒、還沒調音時偏離標準音的音分（頁面一開始的狀態）。
   */
  const INSTRUMENTS = {
    guitar: {
      zh: '古典吉他', en: 'Classical guitar', L: 0.65, frets: true, decay: 1,
      strings: [
        { label: '6', midi: 40, muG: 5.92, d: 1.09, kind: 'wound', core: 'nylon', detune: -28 },
        { label: '5', midi: 45, muG: 3.42, d: 0.89, kind: 'wound', core: 'nylon', detune: 17 },
        { label: '4', midi: 50, muG: 1.92, d: 0.76, kind: 'wound', core: 'nylon', detune: -12 },
        { label: '3', midi: 55, d: 1.02, kind: 'plain', core: 'nylon', detune: 24 },
        { label: '2', midi: 59, d: 0.82, kind: 'plain', core: 'nylon', detune: -19 },
        { label: '1', midi: 64, d: 0.7, kind: 'plain', core: 'nylon', detune: 11 }
      ]
    },
    violin: {
      zh: '小提琴', en: 'Violin', L: 0.328, frets: false, decay: 0.5,
      strings: [
        { label: 'G', midi: 55, muG: 2.66, d: 0.8, kind: 'wound', core: 'nylon', detune: 14 },
        { label: 'D', midi: 62, muG: 1.13, d: 0.7, kind: 'wound', core: 'nylon', detune: -11 },
        { label: 'A', midi: 69, muG: 0.6, d: 0.65, kind: 'wound', core: 'nylon', detune: -16 },
        { label: 'E', midi: 76, d: 0.26, kind: 'plain', core: 'steel', detune: 20 }
      ]
    },
    erhu: {
      zh: '二胡', en: 'Erhu', L: 0.4, frets: false, decay: 0.45,
      strings: [
        { label: 'in', zh: '內弦', en: 'Inner', midi: 62, d: 0.3, kind: 'plain', core: 'steel', detune: -13 },
        { label: 'out', zh: '外弦', en: 'Outer', midi: 69, d: 0.25, kind: 'plain', core: 'steel', detune: 18 }
      ]
    }
  };
  const INST_IDS = ['guitar', 'violin', 'erhu'];
  /** 預設弦的線密度（g/m）：纏繞弦用規格值，實心弦用 ρπd²/4 */
  function presetMuG(s) { return s.muG != null ? s.muG : muWire(MATERIALS[s.core].rho, s.d) * 1000; }
  /** 剛好調準時的張力（N） */
  function inTuneTension(inst, i) {
    const I = INSTRUMENTS[inst], s = I.strings[i];
    return tensionFor(freqOf(s.midi), I.L, presetMuG(s) / 1000);
  }
  /** 預設（還沒調音）的弦：張力四捨五入到 0.1 N */
  function presetString(inst, i) {
    const s = INSTRUMENTS[inst].strings[i];
    const T = Math.round(inTuneTension(inst, i) * Math.pow(2, s.detune / 600) * 10) / 10;
    return { T: T, muG: presetMuG(s), mode: 'mu', mat: s.core, d: s.d };
  }
  function presetInstrument(inst) {
    const I = INSTRUMENTS[inst];
    return { L: I.L, si: inst === 'guitar' ? 1 : I.strings.length - 2, strings: I.strings.map(function (s, i) { return presetString(inst, i); }) };
  }
  /** 一條弦目前的線密度（kg/m）：材料模式用 ρπd²/4 */
  function stringMu(st) { return st.mode === 'mat' ? muWire(MATERIALS[st.mat].rho, st.d) : st.muG / 1000; }

  // ======================= 頁面與任務證明共用的資料 =======================
  /**
   * cfg = { inst, L, strings: [{ T, muG, mode, mat, d }], si, hand: 'press'|'touch', fret, finger, rule: 'et'|'r18',
   *         touch（ξ）, beta, bow }
   * 傳回撥一下（或拉弓）的完整資料：空弦與振動部分的基頻、有效弦長、頻譜、聽到的音……
   */
  function analyze(cfg) {
    const I = INSTRUMENTS[cfg.inst];
    const L = cfg.L;
    const opens = cfg.strings.map(function (st) { return fundamental(L, st.T, stringMu(st)); });
    const st = cfg.strings[cfg.si];
    const mu = stringMu(st);
    const fOpen = opens[cfg.si];
    const touch = cfg.hand === 'touch';
    let Leff = L, fret = null, finger = null;
    if (!touch) {
      if (I.frets) { fret = Math.round(cfg.fret || 0); Leff = L * fretRatio(fret, cfg.rule); }
      else { finger = cfg.finger || 0; Leff = fingerLength(finger, L); }
    }
    const f1 = fundamental(Leff, st.T, mu);
    const sp = spectrum({ beta: cfg.beta, touch: touch ? cfg.touch : null, bow: !!cfg.bow });
    const fSound = sp.silent ? null : sp.lowest * f1;
    const devs = cfg.strings.map(function (s, i) { return cents(opens[i] / freqOf(I.strings[i].midi)); });
    const near = fSound ? nearest(fSound) : null;
    return {
      inst: cfg.inst, si: cfg.si, target: I.strings[cfg.si].midi, L: L, T: st.T, mu: mu, muG: mu * 1000,
      mode: st.mode, mat: st.mode === 'mat' ? st.mat : null, d: st.mode === 'mat' ? st.d : null,
      hand: cfg.hand, fret: fret, finger: finger, rule: I.frets ? cfg.rule : null, touch: touch ? cfg.touch : null,
      touchFret: touch ? touchFret(cfg.touch) : null, beta: cfg.beta, bow: !!cfg.bow,
      v: waveSpeed(st.T, mu), fOpen: fOpen, Leff: Leff, f1: f1,
      A: sp.A.slice(), a: sp.a.slice(), peak: sp.peak, silent: sp.silent, lowest: sp.lowest, fSound: fSound,
      centsUp: fSound ? cents(fSound / fOpen) : null, note: near ? near.name : null, noteCents: near ? near.cents : null,
      opens: opens, devs: devs, Ts: cfg.strings.map(function (s) { return s.T; }),
      gap18: I.frets && fret ? rule18Gap(fret, L) : null
    };
  }

  return {
    G: G, N_MODES: N_MODES, TOUCH_W: TOUCH_W, SILENT: SILENT, AUDIBLE: AUDIBLE, RULE18_K: RULE18_K,
    RANGES: RANGES, MATERIALS: MATERIALS, INSTRUMENTS: INSTRUMENTS, INST_IDS: INST_IDS,
    waveSpeed: waveSpeed, fundamental: fundamental, harmonic: harmonic, tensionFor: tensionFor, muFor: muFor,
    muWire: muWire, diameterFor: diameterFor, kgw: kgw,
    fretRatio: fretRatio, fretX: fretX, rule18Gap: rule18Gap, rule18Cents: rule18Cents, rule18Worst: rule18Worst,
    fingerLength: fingerLength, touchFret: touchFret, fretXi: fretXi,
    pluckCoeff: pluckCoeff, triangle: triangle, touchFactor: touchFactor, spectrum: spectrum, shapeAt: shapeAt, decayTau: decayTau,
    freqOf: freqOf, nearest: nearest, cents: cents,
    presetMuG: presetMuG, inTuneTension: inTuneTension, presetString: presetString, presetInstrument: presetInstrument, stringMu: stringMu,
    analyze: analyze
  };
}));
