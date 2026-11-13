/*
 * temperament-core.js — 「五度相生、純律與十二平均律」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   四種音律在任意主音下的頻率：五度相生（畢達哥拉斯）、純律（五限純律）、十二平均律、
 *     調和律（每個五度比純五度窄 w 音分，十二個音 = 主音的五度鏈 −5…+6，拉回同一個八度；w = 0 就是五度相生）。
 *   主音的頻率一律等於它在十二平均律（A4 = 440 Hz，ISO 16）的頻率，所以四種音律可以直接比較。
 *   五度疊疊樂：從 C 開始一直疊同一種五度，每個音的累積音分、拉回八度後的位置、離 C 多遠。
 *   音程分析：頻率比、音分、和純音程（5 限純律）差幾音分、兩個音最接近的泛音之間的拍頻。
 *   誤差地圖：十二個五度、大三度、小三度各自比純音程寬或窄多少音分（找狼五度）。
 *   調和律的解析公式：五度 = 701.955 − w，十二個五度比七個八度多 23.46 − 12w，
 *     一般的大三度誤差 21.51 − 4w，一般的小三度誤差 3w − 21.51。
 *
 * 用法：瀏覽器 window.TemperamentCore；Node require('./temperament-core.js')（會自動載入 music-theory.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.TemperamentCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const LOG2_3 = Math.log2(3);
  const cents = function (r) { return 1200 * Math.log2(r); };
  const mod = function (a, n) { return ((a % n) + n) % n; };

  /** 純五度 3/2、純大三度 5/4、純小三度 6/5 的音分 */
  const PURE5 = cents(3 / 2);          // 701.955…
  const PURE_M3 = cents(5 / 4);        // 386.314…
  const PURE_m3 = cents(6 / 5);        // 315.641…
  /** 畢氏音差 3^12 / 2^19（23.46 音分）、同音差 81/80（21.51 音分）、小迪西斯 128/125（41.06 音分：三個純大三度比八度少這麼多） */
  const PYTH_COMMA = cents(Math.pow(3, 12) / Math.pow(2, 19));
  const SYNTONIC = cents(81 / 80);
  const DIESIS = cents(128 / 125);
  const C4 = 60;
  const KEY_LO = 60, KEY_HI = 72;      // 鍵盤 C4 到 C5
  const KINDS = ['pythagorean', 'just', 'equal', 'regular'];
  const BASIC = ['pythagorean', 'just', 'equal'];
  const STACK_MAX = 60;
  const W_MAX = 8;                     // 五度收窄滑桿的上限（音分）
  /** 鍵盤的音色：前 8 個泛音，振幅 1/k（溫和的風琴感音色，近似） */
  const PARTIALS = [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8];
  const K_PARTIALS = PARTIALS.length;

  /** 主音上方第 i 個半音（0–11）在五度鏈上的位置（往上幾個五度；負的是往下）：G D A E B F♯ 是 +1…+6，F B♭ E♭ A♭ D♭ 是 −1…−5 */
  const POS = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

  /** 某個音律中，比主音高 semis 個半音（可以是負的、可以超過八度）的音相對主音的音分 */
  function centsRel(kind, semis, w) {
    const oct = Math.floor(semis / 12), i = mod(semis, 12);
    let c;
    if (kind === 'equal') c = 100 * i;
    else if (kind === 'just') { const r = MT.JUST_RATIOS[i]; c = cents(r[0] / r[1]); }
    else {
      // 五度相生（w = 0）或調和律：在五度鏈上走 POS[i] 步，每步 PURE5 − w，再拉回同一個八度
      const fifth = kind === 'regular' ? PURE5 - (w || 0) : PURE5;
      c = mod(POS[i] * fifth, 1200);
      if (c > 1200 - 1e-9) c = 0;
    }
    return c + 1200 * oct;
  }
  function ratioRel(kind, semis, w) { return Math.pow(2, centsRel(kind, semis, w) / 1200); }
  /** 十二平均律的頻率（A4 = 440 Hz） */
  function etFreq(midi) { return MT.midiToFreq(midi); }
  /** 主音 tonic（0 = C … 11 = B，放在第 4 個八度）建立的音律裡，鍵 midi 的頻率 */
  function freq(kind, tonic, midi, w) {
    const T = C4 + mod(tonic, 12);
    return etFreq(T) * ratioRel(kind, midi - T, w);
  }
  /** 鍵 midi 相對十二平均律高（+）或低（−）幾音分 */
  function devET(kind, tonic, midi, w) { return cents(freq(kind, tonic, midi, w) / etFreq(midi)); }
  /** 一個八度內十二個音（C 到 B）相對十二平均律的偏差 */
  function deviations(kind, tonic, w) {
    const out = [];
    for (let pc = 0; pc < 12; pc++) out.push(devET(kind, tonic, C4 + pc, w));
    return out;
  }

  /** 這個音在主音的五度鏈上的位置（−5…+6） */
  function chainPos(tonic, pc) { return POS[mod(pc - tonic, 12)]; }
  /**
   * 音名：照主音的五度鏈拼（例如以 C 為主音：F♯、D♭；以 D♭ 為主音：E♭、A♭）。
   * 五度鏈的編號：C = 0、G = 1、D = 2 …、F = −1、B♭ = −2 …（主音的編號剛好就是 POS[主音]）。
   * 重升、重降與 B♯、E♯、C♭、F♭ 改用鍵盤上常見的名稱，學生比較好對照。
   */
  function spell(tonic, pc) {
    pc = mod(pc, 12);
    const t = mod(tonic, 12), k = chainPos(t, pc);
    const i = POS[t] + k;
    const acc = Math.floor((i + 1) / 7), s = 'FCGDAEB'[mod(i + 1, 7)] + (acc === 1 ? '♯' : acc === -1 ? '♭' : '');
    if (Math.abs(acc) > 1 || /^(B♯|E♯|C♭|F♭)$/.test(s)) return (k < 0 ? MT.FLAT_NAMES : MT.SHARP_NAMES)[pc];
    return s;
  }
  function noteName(tonic, midi) { return spell(tonic, midi) + (Math.floor(midi / 12) - 1); }
  /** 主音選單用的名稱（常用的調號寫法） */
  const TONIC_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  /** 五度圈上從 C 往上第 k 個五度的音名（k ≤ 12 用正確的拼法，例如第 12 個是 B♯；往下用降記號） */
  function fifthName(k) {
    const i = k + 1;                  // 五度鏈：F = 0、C = 1、G = 2 …
    const acc = Math.floor(i / 7);
    const letter = 'FCGDAEB'[mod(i, 7)];
    if (acc > 1 || acc < -1) return null;
    return letter + (acc === 1 ? '♯' : acc === -1 ? '♭' : '');
  }

  // ---------- 精確的比值（五度相生是 3 和 2 的次方，純律是小整數比） ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  /** 比主音高 semis 個半音的音，寫成 3^a3 × 2^a2（五度相生）或 p/q（純律）；其他音律傳回 null */
  function exactRel(kind, semis) {
    const oct = Math.floor(semis / 12), i = mod(semis, 12);
    if (kind === 'pythagorean') {
      const k = POS[i];
      return { a3: k, a2: -Math.floor(k * LOG2_3 + 1e-12) + oct };
    }
    if (kind === 'just') {
      const r = MT.JUST_RATIOS[i];
      return oct >= 0 ? { p: r[0] * Math.pow(2, oct), q: r[1] } : { p: r[0], q: r[1] * Math.pow(2, -oct) };
    }
    return null;
  }
  /** 兩個鍵之間的精確頻率比 {p, q}（最簡分數）；十二平均律傳回 {et: 半音數}；調和律傳回 null */
  function pairRatio(kind, tonic, m1, m2) {
    const T = C4 + mod(tonic, 12);
    if (kind === 'equal') return { et: m2 - m1 };
    const a = exactRel(kind, m1 - T), b = exactRel(kind, m2 - T);
    if (!a || !b) return null;
    if (kind === 'pythagorean') {
      const d3 = b.a3 - a.a3, d2 = b.a2 - a.a2;
      const p = Math.pow(3, Math.max(0, d3)) * Math.pow(2, Math.max(0, d2));
      const q = Math.pow(3, Math.max(0, -d3)) * Math.pow(2, Math.max(0, -d2));
      return { p: p, q: q };
    }
    const p = b.p * a.q, q = b.q * a.p, g = gcd(p, q);
    return { p: p / g, q: q / g };
  }
  /** 鍵 midi 相對主音的精確比值 */
  function tonicRatio(kind, tonic, midi) { return pairRatio(kind, tonic, C4 + mod(tonic, 12), midi); }

  // ---------- 拍頻：兩個音最接近的泛音 ----------
  /**
   * f1、f2 兩個複合音（各有前 K 個泛音）之間，頻率最接近的一對泛音：第 m 個（m·f1）與第 n 個（n·f2）。
   * 拍頻 = |m·f1 − n·f2|。一樣接近時取 m + n 較小的（純音程的所有倍數都剛好相等，取最低的那一對）。
   */
  function closestPartials(f1, f2, K) {
    K = K || K_PARTIALS;
    let best = null;
    for (let m = 1; m <= K; m++) {
      for (let n = 1; n <= K; n++) {
        const d = Math.abs(m * f1 - n * f2);
        if (!best || d < best.beat - 1e-9 || (Math.abs(d - best.beat) <= 1e-9 && m + n < best.m + best.n)) best = { m: m, n: n, beat: d };
      }
    }
    best.fm = best.m * f1; best.fn = best.n * f2;
    if (best.beat < 1e-9) best.beat = 0;
    return best;
  }
  /** 兩個正弦（振幅 a1、a2、頻率差 df）相加後的包絡（瞬時振幅）：√(a1² + a2² + 2a1a2·cos 2πΔf t) */
  function envelope(a1, a2, df, t) { return Math.sqrt(Math.max(0, a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(2 * Math.PI * df * t))); }

  /** 半音數 → 5 限純律的純音程（同度到兩個八度內），{ p, q, cents, zh, en, short } */
  function pureInterval(semis) {
    const oct = Math.floor(semis / 12), it = MT.INTERVALS[mod(semis, 12)];
    let p = it.ratio[0] * Math.pow(2, oct), q = it.ratio[1];
    if (mod(semis, 12) === 0 && semis > 0) { p = Math.pow(2, oct); q = 1; }
    const g = gcd(p, q);
    const name = semis === 12 ? MT.INTERVALS[12] : it;
    const plus = oct >= 1 && semis !== 12;
    return { p: p / g, q: q / g, cents: cents(p / q), zh: name.zh + (plus ? '＋八度' : ''), en: name.en + (plus ? ' + octave' : ''), short: name.short, tritone: mod(semis, 12) === 6 };
  }

  /** 兩個鍵（m1 < m2）在某個音律中的音程：頻率、音分、和純音程差幾音分、拍頻 */
  function intervalInfo(kind, tonic, w, m1, m2) {
    if (m2 < m1) { const t = m1; m1 = m2; m2 = t; }
    const f1 = freq(kind, tonic, m1, w), f2 = freq(kind, tonic, m2, w);
    const c = cents(f2 / f1), semis = m2 - m1;
    const pure = pureInterval(semis);
    const b = closestPartials(f1, f2);
    return { lo: m1, hi: m2, f1: f1, f2: f2, semis: semis, cents: c, pure: pure, dev: c - pure.cents, beat: b.beat, m: b.m, n: b.n, fm: b.fm, fn: b.fn };
  }
  /** 一組音（1–3 個鍵）在某個音律中的分析：每個音的頻率與偏差、每一對音的音程 */
  function analyze(kind, tonic, w, notes) {
    const ns = notes.slice().sort(function (a, b) { return a - b; });
    const out = { kind: kind, tonic: mod(tonic, 12), w: w || 0, notes: ns, freqs: [], devs: [], pairs: [] };
    ns.forEach(function (m) { out.freqs.push(freq(kind, tonic, m, w)); out.devs.push(devET(kind, tonic, m, w)); });
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) out.pairs.push(intervalInfo(kind, tonic, w, ns[i], ns[j]));
    return out;
  }

  /** 誤差地圖：從每個音（C4 到 B4）往上的五度、大三度、小三度，比純音程寬（+）或窄（−）幾音分 */
  function errorTable(kind, tonic, w) {
    const rows = [];
    for (let pc = 0; pc < 12; pc++) {
      const m = C4 + pc;
      const f0 = freq(kind, tonic, m, w);
      const e = function (iv, pure) { return cents(freq(kind, tonic, m + iv, w) / f0) - pure; };
      rows.push({ pc: pc, P5: e(7, PURE5), M3: e(4, PURE_M3), m3: e(3, PURE_m3) });
    }
    return rows;
  }
  /** 誤差超過 tol 音分的五度（狼五度與其他走音的五度），由大到小 */
  function badFifths(kind, tonic, w, tol) {
    return errorTable(kind, tonic, w).filter(function (r) { return Math.abs(r.P5) > (tol == null ? 10 : tol); })
      .map(function (r) { return { pc: r.pc, err: r.P5 }; })
      .sort(function (a, b) { return Math.abs(b.err) - Math.abs(a.err); });
  }

  /** 調和律（五度比純五度窄 w 音分）的解析結果 */
  function regular(w) {
    const fifth = PURE5 - w;
    return {
      w: w, fifth: fifth,
      gap12: 12 * fifth - 8400,                 // 十二個五度比七個八度多多少（= 23.46 − 12w）
      M3: 4 * fifth - 2400 - PURE_M3,           // 一般的大三度（往上 4 個五度）：21.51 − 4w
      m3: 2400 - 3 * fifth - PURE_m3,           // 一般的小三度（往下 3 個五度）：3w − 21.51
      dim4: 6000 - 8 * fifth - PURE_M3,         // 跨過狼五度、充當大三度的減四度：8w − 1.954（施氏音差）
      wolf: 8400 - 11 * fifth - PURE5,          // 狼五度（另外 11 個五度都是 fifth）：11w − 23.46
      tritone: 6 * fifth - 3600                 // 往上 6 個五度的增四度
    };
  }

  /** 疊疊樂用的五度大小：五度相生與純律疊純五度 3/2，十二平均律疊 700 音分，調和律疊 701.955 − w */
  function stackFifth(kind, w) {
    if (kind === 'equal') return 700;
    if (kind === 'regular') return PURE5 - (w || 0);
    return PURE5;
  }
  /** 從 C 往上疊 k 個大小為 fifth 音分的五度：累積音分、幾個八度、拉回八度後的位置 r（0–1200）、離最近的 C 多遠 */
  function stackPoint(k, fifth) {
    const total = k * fifth;
    const oct = Math.floor(total / 1200 + 1e-12);
    let r = total - 1200 * oct;
    if (r < 0) r = 0;
    const offC = r <= 600 ? r : r - 1200;
    const near = Math.round(r / 100);
    return { k: k, total: total, oct: oct, r: r, angle: r / 1200 * 360, offC: offC, pc: mod(near, 12), devNear: r - 100 * near };
  }
  /** 疊到第 k 個五度後，「和 C 一起聽」的兩個頻率：最近的 C（C4 或 C5）與拉回 C4–C5 的那個音 */
  function stackPair(k, fifth) {
    const p = stackPoint(k, fifth);
    const fx = etFreq(C4) * Math.pow(2, p.r / 1200);
    const fc = p.r <= 600 ? etFreq(C4) : etFreq(C4 + 12);
    const lo = Math.min(fx, fc), hi = Math.max(fx, fc);
    const b = closestPartials(lo, hi);
    return { point: p, fx: fx, fc: fc, beat: b.beat, m: b.m, n: b.n };
  }

  /** 樂音的音色（給 MusicAudio）：[1, 1/2, …, 1/8] */
  function partials() { return PARTIALS.slice(); }

  return {
    PURE5: PURE5, PURE_M3: PURE_M3, PURE_m3: PURE_m3, PYTH_COMMA: PYTH_COMMA, SYNTONIC: SYNTONIC, DIESIS: DIESIS,
    C4: C4, KEY_LO: KEY_LO, KEY_HI: KEY_HI, KINDS: KINDS, BASIC: BASIC, STACK_MAX: STACK_MAX, W_MAX: W_MAX,
    PARTIALS: PARTIALS, K_PARTIALS: K_PARTIALS, POS: POS, TONIC_NAMES: TONIC_NAMES,
    cents: cents, mod: mod,
    centsRel: centsRel, ratioRel: ratioRel, etFreq: etFreq, freq: freq, devET: devET, deviations: deviations,
    chainPos: chainPos, spell: spell, noteName: noteName, fifthName: fifthName,
    exactRel: exactRel, pairRatio: pairRatio, tonicRatio: tonicRatio, gcd: gcd,
    closestPartials: closestPartials, envelope: envelope, pureInterval: pureInterval,
    intervalInfo: intervalInfo, analyze: analyze, errorTable: errorTable, badFifths: badFifths,
    regular: regular, stackFifth: stackFifth, stackPoint: stackPoint, stackPair: stackPair, partials: partials
  };
}));
