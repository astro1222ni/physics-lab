/*
 * adsr-envelope-core.js — 「合成器的 ADSR 包絡」的數學核心（不碰 DOM；瀏覽器 window.AdsrCore，Node require）
 *
 * 包絡 a(t) 是振幅隨時間的函數（頂點 = 1），分四段：
 *   起音 Attack：  0 → 1，花 A 秒
 *   衰減 Decay：   1 → S，花 D 秒
 *   延持 Sustain： 按著不放就一直停在 S（S 是「高度」，不是時間）
 *   釋音 Release： 放開的那一刻從「當時的值」a_rel 落到 0，花 R 秒（提早放開也一樣花 R 秒，只是起點比較低）
 *
 * 兩種曲線形狀：
 *   線性 'lin'：每一段都是直線。
 *   指數 'exp'：
 *     衰減、釋音在「分貝刻度」上是直線：a(u) = a0 · (a1/a0)^u（u = 段內進度 0–1）。
 *       終點是 0 時，改成落到起點的千分之一（−60 dB，聽不見了），段結束時才歸零；
 *       所以指數釋音的 R 就是「掉 60 dB 的時間」（和房間的迴響時間 T60 同一個定義）。
 *       這一段的時間常數 τ = 段長 ÷ ln(a0/a1)，振幅每過 τ 秒變成 1/e；半衰期 t½ = τ ln 2。
 *     起音像電容充電（RC）：a(u) = (1 − e^(−k u)) ÷ (1 − e^(−k))，k = 3（一開始衝得快、接近頂點時變慢）。
 *
 * 倒放：把整個音（按住 H 秒，再釋音 R 秒，總長 L = H + R）的包絡左右反過來：a_rev(t) = a(L − t)。
 *
 * 音色：泛音數 N，第 k 個泛音的振幅 = 1/k（鋸齒波的頻譜）。所有預設都用同一個頻譜，只換包絡。
 *   「高泛音衰減較快」：第 k 個泛音的包絡是 a(t)^(q_k)，q_k = 1 + γ(k − 1)、γ = 0.25；
 *   換成分貝就是 dB_k = q_k · dB(a)：包絡掉 10 dB 時，第 5 個泛音掉 20 dB。
 *   （自由振動的弦與鐘，高頻成分的能量散失得比較快；起音時高泛音也比較晚長出來。）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdsrCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LN1000 = Math.log(1000);
  const T_MIN = 0.005, T_MAX = 4;     // A、D、R 的範圍（秒）
  const H_MIN = 0.05, H_MAX = 4;      // 「按住時間」（▶ 播放用）
  const POS_MAX = 1000;               // 對數滑桿的格數
  const ATT_K = 3;                    // 指數起音的彎曲程度
  const EXP_FLOOR = 0.001;            // 指數段落到 0 時，先落到 −60 dB
  const GAMMA = 0.25;                 // 高泛音衰減較快：q_k = 1 + γ(k − 1)
  const N_MIN = 1, N_MAX = 12;
  const SOUND_MIN_ATTACK = 0.015, SOUND_MIN_RELEASE = 0.03;   // 和 MusicAudio 的聽力保護下限相同

  const PRESETS = {
    piano:   { A: 0.008, D: 3,    S: 0,   R: 0.25, shape: 'exp', zh: '鋼琴', en: 'Piano' },
    organ:   { A: 0.02,  D: 0.1,  S: 1,   R: 0.06, shape: 'lin', zh: '風琴', en: 'Organ' },
    strings: { A: 0.8,   D: 0.6,  S: 0.8, R: 1.2,  shape: 'exp', zh: '弦樂', en: 'Strings' },
    pluck:   { A: 0.005, D: 1.2,  S: 0,   R: 0.15, shape: 'exp', zh: '撥弦', en: 'Pluck' },
    perc:    { A: 0.005, D: 0.15, S: 0,   R: 0.08, shape: 'exp', zh: '打擊', en: 'Percussion' }
  };
  const PRESET_IDS = ['piano', 'organ', 'strings', 'pluck', 'perc'];
  const DEFAULT = { A: 0.05, D: 0.3, S: 0.6, R: 0.4, shape: 'exp', H: 1, N: 8, high: false, scale: 'lin', rev: false, key: 0 };

  /** 琴鍵：C 大調一個八度（C4–C5，全部在 250 Hz 以上，手機小喇叭也聽得到），電腦鍵盤 A S D F G H J K */
  const KEYS = [
    { name: 'C4', midi: 60, kb: 'a' }, { name: 'D4', midi: 62, kb: 's' }, { name: 'E4', midi: 64, kb: 'd' }, { name: 'F4', midi: 65, kb: 'f' },
    { name: 'G4', midi: 67, kb: 'g' }, { name: 'A4', midi: 69, kb: 'h' }, { name: 'B4', midi: 71, kb: 'j' }, { name: 'C5', midi: 72, kb: 'k' }
  ];
  KEYS.forEach(function (k) { k.f = 440 * Math.pow(2, (k.midi - 69) / 12); });   // 十二平均律、A4 = 440 Hz

  const clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  // ---------------- 對數滑桿（時間） ----------------
  /** 介面上的時間值：取三位有效數字（顯示的數字就是實際的值） */
  function quant(v) { return v > 0 ? Number(v.toPrecision(3)) : 0; }
  function logScale(min, max) {
    return {
      min: min, max: max,
      fromPos: function (p) { return quant(clamp(min * Math.pow(max / min, clamp(p, 0, POS_MAX) / POS_MAX), min, max)); },
      toPos: function (v) { return clamp(Math.round(POS_MAX * Math.log(clamp(v, min, max) / min) / Math.log(max / min)), 0, POS_MAX); }
    };
  }
  const TIME = logScale(T_MIN, T_MAX);
  const HOLD = logScale(H_MIN, H_MAX);

  // ---------------- 包絡 ----------------
  function norm(p) {
    return {
      A: clamp(+p.A || T_MIN, 1e-6, 100), D: clamp(+p.D || T_MIN, 1e-6, 100),
      S: clamp(p.S == null ? 0 : +p.S, 0, 1), R: clamp(+p.R || T_MIN, 1e-6, 100),
      shape: p.shape === 'lin' ? 'lin' : 'exp'
    };
  }
  /** 起音的形狀（u = 0–1） */
  function attackCurve(u, shape) {
    u = clamp(u, 0, 1);
    return shape === 'lin' ? u : (1 - Math.exp(-ATT_K * u)) / (1 - Math.exp(-ATT_K));
  }
  /** 從 a0 落到 a1 的一段（u = 0–1）；指數 = 分貝刻度上的直線，終點太小時先落到 a0 的 −60 dB */
  function fall(a0, a1, u, shape) {
    if (u >= 1) return a1;
    if (u <= 0) return a0;
    if (shape === 'lin') return a0 + (a1 - a0) * u;
    if (a0 <= 0) return 0;
    const aEnd = Math.max(a1, a0 * EXP_FLOOR);
    return a0 * Math.pow(aEnd / a0, u);
  }
  /** 按住期間（還沒放開）第 t 秒的振幅 */
  function pressLevel(t, p) {
    if (t <= 0) return 0;
    if (t < p.A) return attackCurve(t / p.A, p.shape);
    if (t < p.A + p.D) return fall(1, p.S, (t - p.A) / p.D, p.shape);
    return p.S;
  }
  /** 第 t 秒的振幅；hold = 放開的時刻（null 或 Infinity：一直按著） */
  function level(t, p, hold) {
    if (hold == null) hold = Infinity;
    if (t <= 0) return 0;
    if (t < hold) return pressLevel(t, p);
    const aRel = pressLevel(hold, p);
    return fall(aRel, 0, (t - hold) / p.R, p.shape);
  }
  /** 第 t 秒在哪一段：'A'、'D'、'S'、'R'、'off' */
  function phaseAt(t, p, hold) {
    if (hold == null) hold = Infinity;
    if (t < 0) return 'off';
    if (t < hold) return t < p.A ? 'A' : t < p.A + p.D ? 'D' : 'S';
    return t < hold + p.R ? 'R' : 'off';
  }
  /** 放開時在哪一段（'A'、'D'、'S'） */
  function releasePhase(hold, p) { return hold < p.A ? 'A' : hold < p.A + p.D ? 'D' : 'S'; }
  /** 正放的總長（按住 hold 秒＋釋音） */
  function totalLength(p, hold) { return hold + p.R; }
  /** 倒放：按住 H 秒的音整個左右反過來 */
  function revLevel(t, p, H) {
    const L = H + p.R;
    if (t <= 0 || t >= L) return 0;
    return level(L - t, p, H);
  }
  /** 正放或倒放的包絡（o：{ hold, rev, H }） */
  function envAt(t, p, o) {
    o = o || {};
    return o.rev ? revLevel(t, p, o.H) : level(t, p, o.hold);
  }
  /** 實際發聲用的參數：起音至少 15 ms、釋音至少 30 ms（倒放時兩者對調：倒過來的起音變成結尾） */
  function soundParams(p, rev) {
    const q = Object.assign({}, p);
    q.A = Math.max(p.A, rev ? SOUND_MIN_RELEASE : SOUND_MIN_ATTACK);
    q.R = Math.max(p.R, rev ? SOUND_MIN_ATTACK : SOUND_MIN_RELEASE);
    return q;
  }

  // ---------------- 分貝、時間常數、半衰期 ----------------
  function db(a) { return a > 0 ? 20 * Math.log10(a) : -Infinity; }
  function fromDb(d) { return Math.pow(10, d / 20); }
  /** 衰減段實際的終點（指數時 S 太小會先停在 −60 dB） */
  function decayEnd(p) { return p.shape === 'lin' ? p.S : Math.max(p.S, EXP_FLOOR); }
  /** 衰減段的時間常數（指數才有；S = 1 時沒有衰減 → Infinity；線性 → null） */
  function tauD(p) {
    if (p.shape === 'lin') return null;
    const e = decayEnd(p);
    if (e >= 1) return Infinity;
    return p.D / Math.log(1 / e);
  }
  function tauR(p) { return p.shape === 'lin' ? null : p.R / LN1000; }
  function half(tau) { return tau == null ? null : tau * Math.LN2; }
  /** 分貝刻度上的斜率（dB/s）；指數才是定值 */
  function slopeD(p) { if (p.shape === 'lin') return null; const e = decayEnd(p); return e >= 1 ? 0 : db(e) / p.D; }
  function slopeR(p) { return p.shape === 'lin' ? null : -60 / p.R; }
  /** 品質因數：振幅時間常數 τ 的阻尼振盪，Q = π f τ（τ 秒內振動 f τ 次） */
  function qFactor(f, tau) { return tau == null || !isFinite(tau) ? null : Math.PI * f * tau; }

  /** 一直按著時，第一次降到 dbTarget（例如 −20 dB）的時刻；延持比它高就永遠不會到 → Infinity */
  function timeToDb(p, dbTarget) {
    const thr = fromDb(dbTarget);
    if (thr >= 1) return 0;
    if (pressLevel(p.A + p.D, p) > thr + 1e-12 && p.S > thr) return Infinity;
    let lo = p.A, hi = p.A + p.D;
    if (pressLevel(hi - 1e-12, p) > thr) return hi;   // 指數衰減到 0 時在段尾才跳到 0
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (pressLevel(m, p) > thr) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }

  /** 「聽得到」的長度：振幅在 floorDb（預設 −40 dB）以上的第一刻到最後一刻 */
  function audibleSpan(p, o, floorDb) {
    o = o || {};
    const thr = fromDb(floorDb == null ? -40 : floorDb);
    const L = o.rev ? o.H + p.R : o.hold + p.R;
    if (!(L > 0) || !isFinite(L)) return { t0: 0, t1: 0, dur: 0 };
    const n = 4000, f = function (t) { return envAt(t, p, o) - thr; };
    let first = -1, last = -1;
    for (let i = 0; i <= n; i++) { const t = L * i / n; if (f(t) >= 0) { if (first < 0) first = i; last = i; } }
    if (first < 0) return { t0: 0, t1: 0, dur: 0 };
    function edge(i0, i1) {   // f(i0) 與 f(i1) 不同號：二分
      let a = L * i0 / n, b = L * i1 / n;
      const fa = f(a) >= 0;
      for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if ((f(m) >= 0) === fa) a = m; else b = m; }
      return (a + b) / 2;
    }
    const t0 = first > 0 ? edge(first - 1, first) : 0;
    const t1 = last < n ? edge(last, last + 1) : L;
    return { t0: t0, t1: t1, dur: Math.max(0, t1 - t0) };
  }

  // ---------------- 泛音 ----------------
  function qOf(k, high) { return high ? 1 + GAMMA * (k - 1) : 1; }
  /** 包絡值 e 時，第 1–N 個泛音的振幅（基本頻譜 1/k） */
  function partialAmps(e, N, high) {
    const out = [];
    for (let k = 1; k <= N; k++) out.push(e > 0 ? Math.pow(e, qOf(k, high)) / k : 0);
    return out;
  }
  /** 頻譜重心（以基頻的倍數；振幅平方加權）。全部是 0 時取極限：高泛音衰減較快 → 1，否則和頂點相同 */
  function centroid(amps) {
    let s = 0, w = 0;
    amps.forEach(function (a, i) { s += (i + 1) * a * a; w += a * a; });
    return w > 0 ? s / w : null;
  }
  function centroidAt(e, N, high) {
    const c = centroid(partialAmps(e, N, high));
    if (c != null && e > 1e-6) return c;
    return high ? 1 : centroid(partialAmps(1, N, false));
  }
  /** 目前的頻譜重心 ÷ 頂點（包絡 = 1）時的頻譜重心：小於 1 表示音色變暗了 */
  function brightRatio(e, N, high) { return centroidAt(e, N, high) / centroidAt(1, N, high); }

  // ---------------- 任務事件的資料 ----------------
  function common(s) {
    const p = norm(s);
    const tD = tauD(p), tR = tauR(p);
    return {
      A: p.A, D: p.D, S: p.S, R: p.R, shape: p.shape, sDb: db(p.S),
      N: s.N, high: !!s.high, scale: s.scale === 'db' ? 'db' : 'lin', preset: s.preset || null, edited: !!s.edited,
      tauD: tD, halfD: half(tD), tauR: tR, halfR: half(tR), slopeD: slopeD(p), slopeR: slopeR(p),
      t20: timeToDb(p, -20)
    };
  }
  /** 'env'：包絡設定改變後（s：A D S R shape H N high scale rev preset edited touched） */
  function envData(s) {
    const d = common(s);
    d.H = s.H; d.rev = !!s.rev; d.touched = !!s.touched;
    return d;
  }
  /**
   * 'release'：正放時放開琴鍵（或「▶ 播放」按住時間到）；倒放時整段結束（complete）或中途放開。
   * s 同上，另有 held（實際按住的秒數；倒放時是用來倒過來的按住時間 H）、source（'key' | 'play'）、f0、key（音名）、complete
   */
  function releaseData(s) {
    const d = common(s);
    const p = norm(s);
    const rev = !!s.rev, held = +s.held;
    d.rev = rev; d.held = held; d.source = s.source || 'play'; d.f0 = s.f0; d.key = s.key || null;
    d.complete = rev ? !!s.complete : true;
    d.phase = rev ? null : releasePhase(held, p);
    d.aRel = rev ? null : pressLevel(held, p);
    d.bright = rev ? null : brightRatio(d.aRel, s.N, s.high);
    const span = audibleSpan(p, rev ? { rev: true, H: held } : { hold: held }, -40);
    d.dur40 = span.dur;
    d.cycles = s.f0 ? s.f0 * span.dur : null;
    d.Q = qFactor(s.f0, d.tauD);
    return d;
  }

  return {
    T_MIN: T_MIN, T_MAX: T_MAX, H_MIN: H_MIN, H_MAX: H_MAX, POS_MAX: POS_MAX, N_MIN: N_MIN, N_MAX: N_MAX,
    ATT_K: ATT_K, EXP_FLOOR: EXP_FLOOR, GAMMA: GAMMA, LN1000: LN1000,
    SOUND_MIN_ATTACK: SOUND_MIN_ATTACK, SOUND_MIN_RELEASE: SOUND_MIN_RELEASE,
    PRESETS: PRESETS, PRESET_IDS: PRESET_IDS, DEFAULT: DEFAULT, KEYS: KEYS,
    quant: quant, TIME: TIME, HOLD: HOLD,
    norm: norm, attackCurve: attackCurve, fall: fall, pressLevel: pressLevel, level: level, phaseAt: phaseAt,
    releasePhase: releasePhase, totalLength: totalLength, revLevel: revLevel, envAt: envAt, soundParams: soundParams,
    db: db, fromDb: fromDb, decayEnd: decayEnd, tauD: tauD, tauR: tauR, half: half, slopeD: slopeD, slopeR: slopeR,
    qFactor: qFactor, timeToDb: timeToDb, audibleSpan: audibleSpan,
    qOf: qOf, partialAmps: partialAmps, centroid: centroid, centroidAt: centroidAt, brightRatio: brightRatio,
    envData: envData, releaseData: releaseData
  };
}));
