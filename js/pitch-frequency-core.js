/*
 * pitch-frequency-core.js — 「音高與頻率：從振動到音名」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 一個音：振動多快（頻率 f，Hz）→ 週期 T = 1/f、波長 λ = v/f → 最接近的平均律音名、八度數字、MIDI 編號、偏差（音分）。
 *   平均律：f = f_A4 · 2^(n/12)（n = 相對 A4 的半音數）；反過來 n = 12 log2(f / f_A4)。
 *   音分：1200 log2(f2 / f1)；一個半音 100 音分，一個八度 1200 音分。
 * 頻率滑桿是對數刻度：滑桿位置 p（0–8700）就是「比 A0 = 27.5 Hz 高幾音分」，f = 27.5 · 2^(p/1200)，
 *   所以滑桿每一格都是 1 音分，最右邊剛好是 C8（4186.009 Hz）。
 * 鍵盤座標：以白鍵寬度為單位，A0 的左緣是 0；白鍵中心在 i + 0.5，黑鍵中心在兩個白鍵的交界。
 *   帶小數的 MIDI 編號（不在鍵上的音）在相鄰兩個鍵的中心之間線性內插：每個八度剛好 7 個白鍵寬，所以八度是等距的（對數軸）。
 * 樂器音域：每一筆都是「大致範圍」，來源寫在 src（頁面的參考資料逐條列出）。
 * 用到共用的 MusicTheory（音名、MIDI、音分）；不改它。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.PitchCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const F_MIN = 27.5;                  // A0
  const POS_MAX = 8700;                // 7.25 個八度 = 8700 音分
  const F_MAX = F_MIN * Math.pow(2, POS_MAX / 1200);   // = C8 = 4186.009 Hz（A4 = 440 時）
  const A4_DEFAULT = 440;              // ISO 16:1975
  const A4_MIN = 400, A4_MAX = 466;    // 標準音可以設的範圍（含巴洛克 415 與德國教堂管風琴約 465）
  const A4_PRESETS = [415, 440, 442, 443];
  const SPEED = 343;                   // 20 °C 空氣中的聲速（m/s）
  const KEY_LO = 21, KEY_HI = 108;     // 鋼琴 88 鍵：A0（MIDI 21）到 C8（MIDI 108）
  const WHITE_COUNT = 52;
  const LOG2 = Math.log2 || function (x) { return Math.log(x) / Math.LN2; };
  const mod = MT.mod;

  // ---------- 對數滑桿 ----------
  /** 滑桿位置（比 A0 高幾音分）→ 頻率 */
  function fFromPos(p) { return F_MIN * Math.pow(2, p / 1200); }
  /** 頻率 → 滑桿位置 */
  function posFromF(f) { return 1200 * LOG2(f / F_MIN); }
  function clampF(f) { return Math.max(F_MIN, Math.min(F_MAX, f)); }
  function clampA4(a) { return Math.max(A4_MIN, Math.min(A4_MAX, a)); }

  // ---------- 音名 ----------
  /** 音分：f2 比 f1 高幾音分 */
  function cents(f1, f2) { return 1200 * LOG2(f2 / f1); }
  /** 平均律中 MIDI 編號 m 的頻率（標準音 a4） */
  function etFreq(m, a4) { return MT.midiToFreq(m, a4 || A4_DEFAULT); }
  /** 頻率 → 帶小數的 MIDI 編號 */
  function midiFloat(f, a4) { return MT.freqToMidi(f, a4 || A4_DEFAULT); }
  function isBlack(m) { const pc = mod(Math.round(m), 12); return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10; }
  /** 音名：opt.flat 用降記號；opt.solfege 用唱名（固定唱名 Do = C）；opt.octave === false 不加八度數字 */
  function label(m, opt) {
    opt = opt || {};
    const r = Math.round(m), pc = mod(r, 12), oct = Math.floor(r / 12) - 1;
    let s;
    if (opt.solfege) {
      const base = ['Do', 'Do', 'Re', 'Re', 'Mi', 'Fa', 'Fa', 'Sol', 'Sol', 'La', 'La', 'Si'][pc];
      const nextBase = ['Re', 'Re', 'Mi', 'Mi', 'Fa', 'Sol', 'Sol', 'La', 'La', 'Si', 'Si', 'Do'][pc];
      s = isBlack(r) ? (opt.flat ? nextBase + '♭' : base + '♯') : base;
    } else s = MT.noteName(r, { flat: !!opt.flat, octave: false });
    return opt.octave === false ? s : s + oct;
  }

  /**
   * 分析一個頻率：f（Hz）、標準音 a4（Hz）。
   * 傳回 { f, a4, mf, midi, pc, oct, name（升記號寫法，例如 'C♯4'）, cents（相對最接近的平均律音，−50 到 +50）,
   *        n（相對 A4 的半音數，可以有小數）, nRound, T（週期，ms）, lambda（波長，m）, fNote（最接近的音的平均律頻率）,
   *        onKey（|偏差| ≤ 0.5 音分）, inPiano（最接近的音是鋼琴 88 鍵之一）, insts（演奏得到這個頻率的樂器與聲部代號）}
   */
  function analyze(f, a4) {
    a4 = a4 || A4_DEFAULT;
    const mf = midiFloat(f, a4);
    const midi = Math.round(mf);          // 剛好在兩鍵正中間（±50 音分）時，照四捨五入歸到上面那個音
    const c = 100 * (mf - midi);
    const pc = mod(midi, 12);
    return {
      f: f, a4: a4, mf: mf, midi: midi, pc: pc, oct: Math.floor(midi / 12) - 1,
      name: label(midi), cents: c, n: mf - 69, nRound: midi - 69,
      T: 1000 / f, lambda: SPEED / f, fNote: etFreq(midi, a4),
      onKey: Math.abs(c) <= 0.5, inPiano: midi >= KEY_LO && midi <= KEY_HI,
      insts: instsAt(mf)
    };
  }

  // ---------- 樂器與人聲的大致音域 ----------
  /**
   * lo、hi 是 MIDI 編號（以音名定義，跟著標準音一起移動）。全部是「大致範圍」：最高音常因演奏者、樂器與曲目而異。
   * src：A = Samuel Adler《The Study of Orchestration》（樂器法教科書）；F = Fletcher & Rossing《The Physics of Musical Instruments》；
   *      P = 鋼琴 88 鍵的標準鍵盤；V = 合唱分部常見的大致範圍（各合唱教材略有出入）。
   */
  const INSTRUMENTS = [
    { id: 'piano', zh: '鋼琴', en: 'Piano', lo: 21, hi: 108, group: 'inst', src: 'P' },             // A0–C8
    { id: 'piccolo', zh: '短笛', en: 'Piccolo', lo: 74, hi: 108, group: 'inst', src: 'A' },         // D5–C8（實際發音，比譜高八度）
    { id: 'flute', zh: '長笛', en: 'Flute', lo: 60, hi: 96, group: 'inst', src: 'AF' },             // C4–C7
    { id: 'violin', zh: '小提琴', en: 'Violin', lo: 55, hi: 105, group: 'inst', src: 'A' },         // G3–A7
    { id: 'guitar', zh: '吉他', en: 'Guitar', lo: 40, hi: 83, group: 'inst', src: 'A' },            // E2–B5（實際發音，比譜低八度；19 格）
    { id: 'cello', zh: '大提琴', en: 'Cello', lo: 36, hi: 81, group: 'inst', src: 'A' },            // C2–A5
    { id: 'bass', zh: '低音提琴', en: 'Double bass', lo: 28, hi: 67, group: 'inst', src: 'A' },     // E1–G4（實際發音，比譜低八度）
    { id: 'soprano', zh: '女高音', en: 'Soprano', lo: 60, hi: 81, group: 'voice', src: 'V' },       // C4–A5
    { id: 'alto', zh: '女低音', en: 'Alto', lo: 53, hi: 74, group: 'voice', src: 'V' },             // F3–D5
    { id: 'tenor', zh: '男高音', en: 'Tenor', lo: 48, hi: 69, group: 'voice', src: 'V' },           // C3–A4
    { id: 'bassv', zh: '男低音', en: 'Bass voice', lo: 40, hi: 64, group: 'voice', src: 'V' }       // E2–E4
  ];
  /** 帶小數的 MIDI 編號 mf 落在哪些樂器的音域裡（包含音域兩端的鍵各 ±半個半音） */
  function instsAt(mf) {
    return INSTRUMENTS.filter(function (x) { return mf >= x.lo - 0.5 && mf < x.hi + 0.5; }).map(function (x) { return x.id; });
  }
  function instById(id) { return INSTRUMENTS.filter(function (x) { return x.id === id; })[0] || null; }

  // ---------- 鍵盤座標 ----------
  /** A0 到 m（不含）之間有幾個白鍵 */
  function whitesBefore(m) {
    let n = 0;
    for (let k = KEY_LO; k < m; k++) if (!isBlack(k)) n++;
    return n;
  }
  const CENTERS = (function () {
    const out = {};
    for (let m = KEY_LO; m <= KEY_HI; m++) out[m] = isBlack(m) ? whitesBefore(m) : whitesBefore(m) + 0.5;
    return out;
  })();
  /** 鍵 m 的中心（白鍵寬度為單位，A0 左緣 = 0） */
  function keyCenter(m) { return CENTERS[m]; }
  /** 帶小數的 MIDI 編號 → 鍵盤座標（相鄰兩鍵中心之間內插；鍵盤外用每八度 7 個白鍵寬外推） */
  function xOfMidi(mf) {
    if (mf <= KEY_LO) return CENTERS[KEY_LO] + (mf - KEY_LO) * 7 / 12;
    if (mf >= KEY_HI) return CENTERS[KEY_HI] + (mf - KEY_HI) * 7 / 12;
    const a = Math.floor(mf), u = mf - a;
    return CENTERS[a] + (CENTERS[a + 1] - CENTERS[a]) * u;
  }
  /** 鍵盤座標 → 帶小數的 MIDI 編號（xOfMidi 的反函數） */
  function midiOfX(x) {
    if (x <= CENTERS[KEY_LO]) return KEY_LO + (x - CENTERS[KEY_LO]) * 12 / 7;
    if (x >= CENTERS[KEY_HI]) return KEY_HI + (x - CENTERS[KEY_HI]) * 12 / 7;
    for (let m = KEY_LO; m < KEY_HI; m++) {
      const a = CENTERS[m], b = CENTERS[m + 1];
      if (x >= a && x <= b) return m + (x - a) / (b - a);
    }
    return KEY_HI;
  }
  /** 鍵盤上的點擊：x（白鍵寬度為單位）、y（0 = 鍵頂，1 = 鍵底；黑鍵長 0.62）→ 按到的鍵 */
  function keyAt(x, y) {
    const wi = Math.floor(x);
    if (wi < 0 || wi >= WHITE_COUNT) return null;
    if (y < 0.62) {
      // 黑鍵寬 0.6 個白鍵、中心在交界上
      for (let m = KEY_LO; m <= KEY_HI; m++) if (isBlack(m) && Math.abs(x - CENTERS[m]) <= 0.3) return m;
    }
    for (let m = KEY_LO; m <= KEY_HI; m++) if (!isBlack(m) && Math.abs(x - CENTERS[m]) <= 0.5) return m;
    return null;
  }

  // ---------- 線性軸與對數軸 ----------
  /** 從 f0 起每個八度的邊界（f0、2f0、4f0…，不超過 fTop） */
  function octaveEdges(f0, fTop) {
    const out = [];
    for (let f = f0; f <= fTop * (1 + 1e-12); f *= 2) out.push(f);
    return out;
  }
  /** 線性軸上的位置（0–1）：f 在 [0, fTop] 之間的比例 */
  function linPos(f, fTop) { return f / fTop; }
  /** 對數軸上的位置（0–1）：log2(f/fLo) / log2(fTop/fLo) */
  function logPos(f, fLo, fTop) { return LOG2(f / fLo) / LOG2(fTop / fLo); }

  /**
   * 3D「頻率之梯」：88 個鍵每根柱子的高度（0–1）。
   * mode = 'lin'：高度 ∝ 頻率（f / f_C8）；mode = 'log'：高度 ∝ log2(f / f_A0)（每個八度一樣高）。
   */
  function ladderHeight(f, mode, a4) {
    a4 = a4 || A4_DEFAULT;
    const lo = etFreq(KEY_LO, a4), hi = etFreq(KEY_HI, a4);
    return mode === 'lin' ? f / hi : LOG2(f / lo) / LOG2(hi / lo);
  }

  /** 「加 100 Hz」：新的頻率（超過上限傳回 null）與跨了幾音分 */
  function add100(f) {
    const g = f + 100;
    return g > F_MAX + 1e-9 ? null : { f: g, cents: cents(f, g) };
  }
  /** 「＋／−1 半音」「＋／−1 八度」：f · 2^(k/12)（超出範圍傳回 null） */
  function step(f, semis) {
    const g = f * Math.pow(2, semis / 12);
    return g < F_MIN - 1e-9 || g > F_MAX + 1e-9 ? null : g;
  }
  /** 「加 100 Hz」剛好跨過 c 音分時的起點：f + 100 = f · 2^(c/1200) ⇒ f = 100 / (2^(c/1200) − 1) */
  function add100Start(c) { return 100 / (Math.pow(2, c / 1200) - 1); }

  return {
    F_MIN: F_MIN, F_MAX: F_MAX, POS_MAX: POS_MAX, A4_DEFAULT: A4_DEFAULT, A4_MIN: A4_MIN, A4_MAX: A4_MAX, A4_PRESETS: A4_PRESETS,
    SPEED: SPEED, KEY_LO: KEY_LO, KEY_HI: KEY_HI, WHITE_COUNT: WHITE_COUNT, INSTRUMENTS: INSTRUMENTS,
    fFromPos: fFromPos, posFromF: posFromF, clampF: clampF, clampA4: clampA4,
    cents: cents, etFreq: etFreq, midiFloat: midiFloat, isBlack: isBlack, label: label, analyze: analyze,
    instsAt: instsAt, instById: instById, keyCenter: keyCenter, xOfMidi: xOfMidi, midiOfX: midiOfX, keyAt: keyAt,
    octaveEdges: octaveEdges, linPos: linPos, logPos: logPos, ladderHeight: ladderHeight,
    add100: add100, step: step, add100Start: add100Start, mod: mod
  };
}));
