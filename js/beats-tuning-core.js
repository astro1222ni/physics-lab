/*
 * beats-tuning-core.js — 「拍頻與調音」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 模型：
 *   參考音 f1（固定）與待調音 f2（調音旋鈕）。待調音 = 純律目標 + 旋鈕偏差（Hz）：f2 = f1·m/n + Δ。
 *   兩個純音 a·sin(2π f t) + b·sin(2π f' t) 相加：振幅（響度包絡）A(t)² = a² + b² + 2ab·cos(2π (f' − f) t)，
 *   每秒起伏 |f' − f| 次，這就是拍頻。
 *   帶泛音的音（第 k 個泛音在 k·f、振幅 1/k，共 8 個）：音程 m:n（f2/f1 ≈ m/n）時，參考音的第 m 泛音 m·f1
 *   和待調音的第 n 泛音 n·f2 幾乎重合，打出 |n·f2 − m·f1| 的拍（五度 3f1 對 2f2、四度 4f1 對 3f2、大三度 5f1 對 4f2、八度 2f1 對 f2）。
 *   純音（只有基頻）只有同度有可以數的拍；其他音程沒有重合的成分。
 *   有正負號的拍頻 s = n·f2 − m·f1：s > 0 是「寬」（待調音偏高），s < 0 是「窄」（偏低）。
 *   平均律的目標：f2 = f1·2^(半音數/12)，這時那一對泛音「該有」的拍頻 = n·f1·2^(半音數/12) − m·f1（不是 0）。
 *   音分：1200·log2(f2 / 目標頻率)。
 *
 * 內容：IVS（五種音程與打拍的泛音對）、partials（音色）、justFreq／etFreq／targetFreq、beatSigned、etBeatSigned、
 *   envelope（響度包絡）、pairs（所有互質泛音對的拍頻）、twinOf（另一對泛音拍得一樣快）、tapRate（跟著拍按 → 數到的拍頻）、
 *   windowFor（畫面時間窗）、phasor（3D：旋轉座標裡的合成相量）、analyze（頁面與任務共用的分析結果）。
 *
 * 用法：瀏覽器 window.BeatsTuningCore；Node require('./beats-tuning-core.js')（會自動載入 music-theory.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.BeatsTuningCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const cents = function (r) { return 1200 * Math.log2(r); };

  // ---------- 範圍（和介面一致） ----------
  const REF_MIN_MIDI = 33, REF_MAX_MIDI = 81;          // A1（55 Hz）到 A5（880 Hz）
  const REF_MIN = MT.midiToFreq(REF_MIN_MIDI);          // 55 Hz
  const REF_MAX = MT.midiToFreq(REF_MAX_MIDI);          // 880 Hz
  const REF_DEFAULT_MIDI = 69, REF_DEFAULT = 440;       // A4 = 440 Hz（ISO 16:1975）
  const COARSE_MAX = 20, FINE_MAX = 1;                  // 調音旋鈕：粗調 ±20 Hz（間隔 0.1），細調 ±1 Hz（間隔 0.01）
  const OFFSET_DEFAULT = 3;                             // 預設偏差（同度時每秒 3 拍）
  const N_PARTIALS = 8;                                 // 帶泛音的音：8 個泛音，振幅 1/k
  const PAIR_MAX = 8;                                   // 找泛音對時，泛音號最大到 8

  /** 五種音程：semis 半音數；打拍的泛音對：參考音的第 m 泛音對待調音的第 n 泛音（純律 f2/f1 = m/n） */
  const IVS = {
    unison: { key: 'unison', semis: 0, m: 1, n: 1, zh: '同度', en: 'Unison' },
    octave: { key: 'octave', semis: 12, m: 2, n: 1, zh: '八度', en: 'Octave' },
    fifth: { key: 'fifth', semis: 7, m: 3, n: 2, zh: '五度', en: 'Fifth' },
    fourth: { key: 'fourth', semis: 5, m: 4, n: 3, zh: '四度', en: 'Fourth' },
    third: { key: 'third', semis: 4, m: 5, n: 4, zh: '大三度', en: 'Major third' }
  };
  const IV_KEYS = ['unison', 'octave', 'fifth', 'fourth', 'third'];
  const ivOf = function (k) { return IVS[k] || IVS.unison; };

  /** 音色的成分：純音只有基頻；帶泛音：k = 1…8，振幅 1/k */
  function partials(mode) {
    if (mode === 'pure') return [{ k: 1, a: 1 }];
    const out = [];
    for (let k = 1; k <= N_PARTIALS; k++) out.push({ k: k, a: 1 / k });
    return out;
  }
  function ampOf(mode, k) { return mode === 'pure' ? (k === 1 ? 1 : 0) : (k >= 1 && k <= N_PARTIALS ? 1 / k : 0); }

  // ---------- 目標頻率 ----------
  function justFreq(fRef, iv) { const I = ivOf(iv); return fRef * I.m / I.n; }
  function etFreq(fRef, iv) { return fRef * Math.pow(2, ivOf(iv).semis / 12); }
  function targetFreq(fRef, iv, target) { return target === 'equal' ? etFreq(fRef, iv) : justFreq(fRef, iv); }
  /** 待調音 = 純律目標 + 旋鈕偏差 */
  function tunedFreq(fRef, iv, offset) { return justFreq(fRef, iv) + offset; }

  // ---------- 拍頻 ----------
  /** 有正負號的拍頻：n·f2 − m·f1（正 = 寬、待調音偏高；負 = 窄） */
  function beatSigned(f1, f2, m, n) { return n * f2 - m * f1; }
  /** 平均律音程在參考音 fRef 的拍頻（有正負號） */
  function etBeatSigned(fRef, iv) { const I = ivOf(iv); return I.n * etFreq(fRef, iv) - I.m * fRef; }
  /** 目標「該有」的拍頻：純律 0，平均律 etBeatSigned */
  function targetBeatSigned(fRef, iv, target) { return target === 'equal' ? etBeatSigned(fRef, iv) : 0; }

  /** 兩個振幅 a、b 的正弦波相加，相位差 phase 時的合成振幅（響度包絡） */
  function envelope(a, b, phase) { return Math.sqrt(Math.max(0, a * a + b * b + 2 * a * b * Math.cos(phase))); }

  /** 兩個音所有互質泛音對（m, n ≤ PAIR_MAX、兩者都有這個泛音）的拍頻，由慢到快排序 */
  function pairs(f1, f2, mode) {
    const out = [];
    for (let m = 1; m <= PAIR_MAX; m++) {
      for (let n = 1; n <= PAIR_MAX; n++) {
        if (MT.gcd(m, n) !== 1) continue;
        const a = ampOf(mode, m), b = ampOf(mode, n);
        if (!a || !b) continue;
        const s = beatSigned(f1, f2, m, n);
        out.push({ m: m, n: n, fa: m * f1, fb: n * f2, signed: s, beat: Math.abs(s), a: a, b: b });
      }
    }
    out.sort(function (p, q) { return p.beat - q.beat; });
    return out;
  }
  /** 另一對泛音（不是音程指定的那一對）拍得和指定那一對一樣快、方向相反（相差 tol 比例以內，預設 0.2%）；指定的拍頻要至少 minBeat */
  function twinOf(f1, f2, iv, mode, tol, minBeat) {
    const I = ivOf(iv);
    const sg = beatSigned(f1, f2, I.m, I.n), b = Math.abs(sg);
    if (!ampOf(mode, I.m) || !ampOf(mode, I.n) || b < (minBeat == null ? 0.5 : minBeat)) return null;
    const t = tol == null ? 0.002 : tol;
    let best = null;
    pairs(f1, f2, mode).forEach(function (p) {
      // 只算「站在兩對中間」：另一對的拍和指定那一對方向相反（一對偏寬、一對偏窄），f2/f1 剛好是兩個比值的中間數 (m + m')/(n + n')
      if ((p.m === I.m && p.n === I.n) || p.signed * sg >= 0) return;
      const e = Math.abs(p.beat - b) / b;
      if (e <= t && (!best || e < best.err)) best = { m: p.m, n: p.n, beat: p.beat, signed: p.signed, err: e };
    });
    return best;
  }

  /**
   * 跟著拍按：tap 的時刻（秒）→ 數到的拍頻。從最後一下往回取，最多 8 下，
   * 每個間隔都要在平均間隔的 ±30% 以內（按得穩）；傳回 { rate, taps, mean } 或 null（不到 2 下）。
   */
  function tapRate(times) {
    const t = (times || []).filter(function (x) { return isFinite(x); });
    if (t.length < 2) return null;
    let best = null;
    for (let k = 2; k <= Math.min(8, t.length); k++) {
      const seg = t.slice(t.length - k);
      const span = seg[seg.length - 1] - seg[0];
      if (!(span > 0)) break;
      const mean = span / (k - 1);
      let ok = true;
      for (let i = 1; i < seg.length; i++) { const d = seg[i] - seg[i - 1]; if (d < 0.7 * mean || d > 1.3 * mean) { ok = false; break; } }
      if (!ok) break;
      best = { rate: 1 / mean, taps: k, mean: mean };
    }
    return best;
  }

  /** 畫面的時間窗（秒）：至少看得到 2.5 拍，最長 10 秒 */
  const WINDOWS = [0.25, 0.5, 1, 2, 5, 10];
  function windowFor(beat) {
    if (!(beat > 0)) return 10;
    for (let i = 0; i < WINDOWS.length; i++) if (WINDOWS[i] * beat >= 2.5) return WINDOWS[i];
    return 10;
  }

  /**
   * 3D：在「跟著參考泛音一起轉」的座標裡，參考泛音是固定的相量 a（沿 +x），待調泛音是長度 b、以 2π·s 角速度轉的相量。
   * 合成相量 z(t) = a + b·e^(i·2π·s·t)；|z| 就是響度包絡。s > 0（寬）逆時針轉，s < 0（窄）順時針轉。
   */
  function phasor(a, b, s, t, phase0) {
    const th = 2 * Math.PI * s * t + (phase0 || 0);
    const x = a + b * Math.cos(th), y = b * Math.sin(th);
    return { x: x, y: y, len: Math.hypot(x, y), th: th };
  }

  /** 整理狀態到合法範圍 */
  function normState(s) {
    s = s || {};
    return {
      fRef: clamp(s.fRef == null ? REF_DEFAULT : +s.fRef, REF_MIN - 1e-9, REF_MAX + 1e-9),
      offset: clamp(s.offset == null ? OFFSET_DEFAULT : +s.offset, -(COARSE_MAX + FINE_MAX), COARSE_MAX + FINE_MAX),
      iv: IVS[s.iv] ? s.iv : 'unison',
      target: s.target === 'equal' ? 'equal' : 'just',
      mode: s.mode === 'pure' ? 'pure' : 'rich'
    };
  }

  /**
   * 頁面與任務共用的分析結果：
   * { fRef, offset, f2, iv, target, mode, semis, m, n, fa（m·f1）, fb（n·f2）, hasPair, beatSigned, beat, side（'wide' | 'narrow' | 'zero' | null）,
   *   fJust, fEt, fTarget, targetSigned, targetBeat, err（和目標拍頻差，含方向）, wrongErr（拍數一樣但方向相反時的差）,
   *   sideOk（方向對：平均律時和目標同號；純律時 null）, cents（相對目標）, centsJust, centsEt, period（每拍幾秒）,
   *   twin（另一對拍得一樣快的泛音，或 null）, win（畫面時間窗） }
   */
  function analyze(s) {
    s = normState(s);
    const I = ivOf(s.iv);
    const f2 = tunedFreq(s.fRef, s.iv, s.offset);
    const fJust = justFreq(s.fRef, s.iv), fEt = etFreq(s.fRef, s.iv), fTarget = s.target === 'equal' ? fEt : fJust;
    const hasPair = !!(ampOf(s.mode, I.m) && ampOf(s.mode, I.n));
    const sg = hasPair ? beatSigned(s.fRef, f2, I.m, I.n) : null;
    const beat = sg == null ? null : Math.abs(sg);
    const ts = targetBeatSigned(s.fRef, s.iv, s.target);
    const side = sg == null ? null : Math.abs(sg) < 1e-9 ? 'zero' : sg > 0 ? 'wide' : 'narrow';
    return {
      fRef: s.fRef, offset: s.offset, f2: f2, iv: s.iv, target: s.target, mode: s.mode,
      semis: I.semis, m: I.m, n: I.n, fa: I.m * s.fRef, fb: I.n * f2,
      hasPair: hasPair, beatSigned: sg, beat: beat, side: side,
      fJust: fJust, fEt: fEt, fTarget: fTarget,
      targetSigned: ts, targetBeat: Math.abs(ts),
      err: sg == null ? null : Math.abs(sg - ts),
      wrongErr: sg == null ? null : Math.abs(sg + ts),
      sideOk: sg == null || s.target !== 'equal' || Math.abs(ts) < 1e-9 ? null : (sg * ts > 0),
      cents: cents(f2 / fTarget), centsJust: cents(f2 / fJust), centsEt: cents(f2 / fEt),
      period: beat == null ? null : beat > 1e-9 ? 1 / beat : Infinity,
      twin: hasPair ? twinOf(s.fRef, f2, s.iv, s.mode) : null,
      win: windowFor(beat)
    };
  }

  return {
    IVS: IVS, IV_KEYS: IV_KEYS, ivOf: ivOf,
    REF_MIN_MIDI: REF_MIN_MIDI, REF_MAX_MIDI: REF_MAX_MIDI, REF_MIN: REF_MIN, REF_MAX: REF_MAX,
    REF_DEFAULT_MIDI: REF_DEFAULT_MIDI, REF_DEFAULT: REF_DEFAULT,
    COARSE_MAX: COARSE_MAX, FINE_MAX: FINE_MAX, OFFSET_DEFAULT: OFFSET_DEFAULT, N_PARTIALS: N_PARTIALS, PAIR_MAX: PAIR_MAX,
    WINDOWS: WINDOWS,
    cents: cents, partials: partials, ampOf: ampOf,
    justFreq: justFreq, etFreq: etFreq, targetFreq: targetFreq, tunedFreq: tunedFreq,
    beatSigned: beatSigned, etBeatSigned: etBeatSigned, targetBeatSigned: targetBeatSigned,
    envelope: envelope, pairs: pairs, twinOf: twinOf, tapRate: tapRate, windowFor: windowFor, phasor: phasor,
    normState: normState, analyze: analyze
  };
}));
