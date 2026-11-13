/*
 * intervals-core.js — 「音程與頻率比」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   拼寫好的音：字母（C D E F G A B）＋升降記號（−2…+2，重降到重升）＋八度數字；MIDI 編號與五線譜上的位置（diatonic index = 八度 × 7 + 字母）。
 *   音程命名：度數 = 兩個音在五線譜上相差幾格 + 1（看字母，不看黑白鍵）；性質 = 實際的半音數和「大／完全」標準差多少：
 *     一、四、五、八度：減 −1、完全 0、增 +1；二、三、六、七度：減 −2、小 −1、大 0、增 +1（倍增、倍減只出現在疊出來的結果）。
 *     所以 C–E♭ 是小三度、C–D♯ 是增二度：同樣 3 個半音，字母差的格數不同。
 *   頻率比：十二平均律 2^(半音數/12)；純律（5 限純律：只用質數 2、3、5）每一種音程一個比值（JUST 表，複音程再乘 2 的次方）。
 *     轉位（下方音升高八度）：度數 n ↔ 9 − n、大 ↔ 小、增 ↔ 減、完全 ↔ 完全；比值變成 2 ÷ 比值。
 *     表上的比值兩兩轉位相乘都剛好是 2，只有大二度 9/8 與小七度 9/5 例外：相乘 = 2 × 81/80（多一個同音差）。
 *   疊音程：音程相接 = 頻率比相乘 = 音分相加；度數相加要減掉重複數的那一個音（n1 + n2 − 1）。
 *   音差：疊出來的比值和表上的比值差一點點（同音差 81/80、小迪耶西斯 128/125、大迪耶西斯 648/625、迪亞斯基斯瑪 2048/2025……）。
 *   5 限格子：每個純律比值 = 2^a · 3^b · 5^c，3D 檢視用 (b, c) 當地板座標、音分當高度。
 *
 * 用法：瀏覽器 window.IntervalsCore；Node require('./intervals-core.js')（會自動載入 music-theory.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.IntervalsCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const mod = function (a, n) { return ((a % n) + n) % n; };
  const cents = function (r) { return 1200 * Math.log2(r); };
  const A4 = MT ? MT.A4 : 440;

  // ---------- 字母、升降記號 ----------
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  const MAX_ACC = 2;
  /** 升降記號的文字：重升、重降寫成兩個符號（♯ ♭ 是一般符號，不是上下標字元） */
  function accText(a) { return a > 0 ? '♯'.repeat(a) : a < 0 ? '♭'.repeat(-a) : ''; }

  /** 拼寫好的音：letter 0–6（C…B）、acc −2…+2、oct 八度數字（C4 是中央 C） */
  function note(letter, acc, oct) {
    letter = mod(letter, 7);
    const name = LETTERS[letter] + accText(acc);
    return { letter: letter, acc: acc, oct: oct, d: oct * 7 + letter, midi: (oct + 1) * 12 + LETTER_PC[letter] + acc, name: name, full: name + oct };
  }
  /** 由五線譜位置（diatonic index）與 MIDI 編號組出拼寫；升降超過 ±limit 時傳回 null */
  function noteAt(d, midi, limit) {
    const letter = mod(d, 7), oct = Math.floor(d / 7);
    const acc = midi - ((oct + 1) * 12 + LETTER_PC[letter]);
    if (Math.abs(acc) > (limit == null ? MAX_ACC : limit)) return null;
    return note(letter, acc, oct);
  }
  /** 'C♯4'、'Eb4'、'Bbb3'、'F##5' → 音 */
  function parseNote(s) {
    const m = /^([A-Ga-g])((?:#|♯|b|♭){0,3})(-?\d+)$/.exec(String(s).trim());
    if (!m) return null;
    const letter = LETTERS.indexOf(m[1].toUpperCase());
    let acc = 0;
    for (const ch of m[2]) acc += (ch === '#' || ch === '♯') ? 1 : -1;
    return note(letter, acc, parseInt(m[3], 10));
  }
  /** 十二平均律頻率（A4 = 440 Hz，ISO 16:1975） */
  function freqOf(n) { return A4 * Math.pow(2, (n.midi - 69) / 12); }

  // ---------- 度數與性質 ----------
  const QUALS = ['dd', 'd', 'm', 'P', 'M', 'A', 'AA'];
  /** 單音程的「大／完全」標準半音數：一度 0、二度 2、三度 4、四度 5、五度 7、六度 9、七度 11 */
  const MAJOR_REF = [0, 2, 4, 5, 7, 9, 11];
  /** 度數 n（1 起算）化成 1–7 的類別（八度 = 一度那一類） */
  const cls = function (n) { return mod(n - 1, 7) + 1; };
  const isPerfect = function (n) { const c = cls(n); return c === 1 || c === 4 || c === 5; };
  function refSemis(n) { return MAJOR_REF[cls(n) - 1] + 12 * Math.floor((n - 1) / 7); }
  const PERF_OFF = { dd: -2, d: -1, P: 0, A: 1, AA: 2 };
  const IMP_OFF = { dd: -3, d: -2, m: -1, M: 0, A: 1, AA: 2 };
  function qualityOffset(n, q) {
    const t = isPerfect(n) ? PERF_OFF : IMP_OFF;
    return Object.prototype.hasOwnProperty.call(t, q) ? t[q] : null;
  }
  /** 度數與半音數 → 性質（'P'、'M'、'm'、'A'、'd'、'AA'、'dd'），超出範圍傳回 null */
  function qualityOf(n, semis) {
    if (!(n >= 1)) return null;
    const diff = semis - refSemis(n);
    const t = isPerfect(n) ? PERF_OFF : IMP_OFF;
    for (const k in t) if (t[k] === diff) return k;
    return null;
  }
  /** 選單上能選的性質（倍增、倍減不提供；一度沒有「減一度」） */
  function allowedQualities(n) {
    if (n === 1) return ['P', 'A'];
    return isPerfect(n) ? ['d', 'P', 'A'] : ['d', 'm', 'M', 'A'];
  }
  function semisOf(n, q) { const o = qualityOffset(n, q); return o == null ? null : refSemis(n) + o; }
  /** 兩個拼寫好的音之間的音程（下方音 → 上方音）；上方音在五線譜上比下方音低時傳回 null */
  function between(lo, hi) {
    const n = hi.d - lo.d + 1, semis = hi.midi - lo.midi;
    if (n < 1) return null;
    const q = qualityOf(n, semis);
    return { n: n, q: q, semis: semis, short: q ? q + n : null };
  }
  /** 下方音往上 n 度、性質 q 的上方音（拼寫正確）；升降超過 ±limit 時傳回 null */
  function upperOf(lo, n, q, limit) {
    const s = semisOf(n, q);
    if (s == null || n < 1) return null;
    return noteAt(lo.d + n - 1, lo.midi + s, limit);
  }

  // ---------- 名稱 ----------
  const QZH = { P: '完全', M: '大', m: '小', A: '增', d: '減', AA: '倍增', dd: '倍減' };
  const QEN = { P: 'perfect', M: 'major', m: 'minor', A: 'augmented', d: 'diminished', AA: 'doubly augmented', dd: 'doubly diminished' };
  const ZH_DIGIT = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function zhNum(k) {
    if (k <= 10) return ZH_DIGIT[k];
    if (k < 20) return '十' + ZH_DIGIT[k - 10];
    return ZH_DIGIT[Math.floor(k / 10)] + '十' + (k % 10 ? ZH_DIGIT[k % 10] : '');
  }
  const EN_ORD = ['', 'unison', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'octave', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
    'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty-first', 'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth', 'twenty-sixth'];
  /** 度數的名稱（不含性質）：「五度」／'fifth' */
  function numName(n, lang) { return lang === 'en' ? (EN_ORD[n] || n + 'th') : zhNum(n) + '度'; }
  /** 音程全名：「完全五度」／'perfect fifth' */
  function name(n, q, lang) {
    if (!q) return lang === 'en' ? 'unnamed interval' : '無法命名的音程';
    return lang === 'en' ? QEN[q] + ' ' + numName(n, 'en') : QZH[q] + numName(n, 'zh');
  }

  // ---------- 分數 ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
  function frac(p, q) { const g = gcd(p, q); return [p / g, q / g]; }
  function mul(x, y) { return frac(x[0] * y[0], x[1] * y[1]); }
  function div(x, y) { return frac(x[0] * y[1], x[1] * y[0]); }
  const fval = function (x) { return x[0] / x[1]; };
  const fstr = function (x) { return x ? x[0] + '/' + x[1] : '—'; };
  const feq = function (x, y) { return !!x && !!y && x[0] * y[1] === x[1] * y[0]; };
  /** 2^a · 3^b · 5^c 的指數（5 限純律）；有其他質因數時 other = true */
  function exps(x) {
    const out = { a: 0, b: 0, c: 0, other: false };
    let p = x[0], q = x[1];
    [[2, 'a'], [3, 'b'], [5, 'c']].forEach(function (f) {
      while (p % f[0] === 0) { p /= f[0]; out[f[1]]++; }
      while (q % f[0] === 0) { q /= f[0]; out[f[1]]--; }
    });
    out.other = p !== 1 || q !== 1;
    return out;
  }

  // ---------- 純律的比值表（5 限純律） ----------
  /**
   * 單音程（一度到七度）每一種性質一個比值。大、小、完全的比值和 music-theory.js 的 INTERVALS 相同；
   * 增、減音程選常用的 5 限比值，並讓轉位兩兩相乘剛好是 2（例如增四度 45/32 ↔ 減五度 64/45、增五度 25/16 ↔ 減四度 32/25）。
   * 唯一的例外是大二度 9/8 ↔ 小七度 9/5：相乘 = 81/40 = 2 × 81/80（純律的小七度也有人用 16/9）。
   * 減一度 24/25 小於 1，選單不提供，只用來算減八度 48/25。
   */
  const JUST = {
    1: { d: [24, 25], P: [1, 1], A: [25, 24] },
    2: { d: [128, 125], m: [16, 15], M: [9, 8], A: [75, 64] },
    3: { d: [256, 225], m: [6, 5], M: [5, 4], A: [125, 96] },
    4: { d: [32, 25], P: [4, 3], A: [45, 32] },
    5: { d: [64, 45], P: [3, 2], A: [25, 16] },
    6: { d: [192, 125], m: [8, 5], M: [5, 3], A: [225, 128] },
    7: { d: [128, 75], m: [9, 5], M: [15, 8], A: [125, 64] }
  };
  /** 純律比值 [p, q]（複音程 = 單音程 × 2^八度數）；表上沒有的（倍增、倍減）傳回 null */
  function justRatio(n, q) {
    const t = JUST[cls(n)];
    if (!t || !t[q]) return null;
    const oct = Math.floor((n - 1) / 7);
    return frac(t[q][0] * Math.pow(2, oct), t[q][1]);
  }
  /** 某一種音律的音分（十二平均律：半音數 × 100；純律：表上的比值） */
  function centsOf(n, q, tuning) {
    if (tuning === 'just') { const r = justRatio(n, q); return r ? cents(fval(r)) : null; }
    const s = semisOf(n, q);
    return s == null ? null : 100 * s;
  }

  // ---------- 音差（comma） ----------
  const COMMAS = [
    { r: [81, 80], zh: '同音差（西頓音差）', en: 'syntonic comma' },
    { r: [128, 125], zh: '小迪耶西斯', en: 'lesser diesis' },
    { r: [648, 625], zh: '大迪耶西斯', en: 'greater diesis' },
    { r: [2048, 2025], zh: '迪亞斯基斯瑪', en: 'diaschisma' },
    { r: [32805, 32768], zh: '斯基斯瑪', en: 'schisma' },
    { r: [531441, 524288], zh: '畢氏音差', en: 'Pythagorean comma' },
    { r: [15625, 15552], zh: '克萊斯瑪', en: 'kleisma' },
    { r: [3125, 3072], zh: '魔術音差', en: 'magic comma' },
    { r: [25, 24], zh: '純律小半音', en: 'just chromatic semitone' },
    { r: [16, 15], zh: '純律大半音', en: 'just diatonic semitone' },
    { r: [135, 128], zh: '大變化半音', en: 'major chroma' }
  ];
  /** 比值（≥ 1 或 ≤ 1 都可以）若是一個有名字的音差，傳回 { r, zh, en, cents } */
  function commaOf(x) {
    if (!x) return null;
    const y = x[0] >= x[1] ? x : [x[1], x[0]];
    for (const c of COMMAS) if (feq(c.r, y)) return { r: c.r, zh: c.zh, en: c.en, cents: cents(fval(c.r)) };
    return null;
  }

  // ---------- 轉位、等音程 ----------
  const INV_Q = { P: 'P', M: 'm', m: 'M', A: 'd', d: 'A', AA: 'dd', dd: 'AA' };
  /** 化成單音程（一度到八度）：九度 → 二度、十五度 → 八度 */
  function simpleNum(n) { return n <= 8 ? n : mod(n - 2, 7) + 2; }
  /** 轉位（複音程先化成單音程）：度數 9 − n，大↔小、增↔減 */
  function invert(n, q) {
    const s = simpleNum(n);
    return { n: 9 - s, q: INV_Q[q] };
  }
  /**
   * 同樣半音數、不同名字的音程（等音程）：度數差 1、性質在選單範圍內；依度數排列。
   * 「等音（換個寫法）」按鈕依這個順序輪流換。
   */
  function enharmonics(n, q) {
    const s = semisOf(n, q), out = [];
    if (s == null) return out;
    for (let m = Math.max(1, n - 2); m <= n + 2; m++) {
      if (m === n) continue;
      const qq = qualityOf(m, s);
      if (qq && allowedQualities(m).indexOf(qq) >= 0) out.push({ n: m, q: qq, short: qq + m });
    }
    return out;
  }
  /** 「等音」按鈕：同一個下方音，換成下一個等音程（拼寫不能超過重升重降）；沒有就傳回 null */
  function respell(lo, n, q) {
    const all = [{ n: n, q: q }].concat(enharmonics(n, q)).sort(function (a, b) { return a.n - b.n; });
    const ok = all.filter(function (x) { return upperOf(lo, x.n, x.q) && x.n <= MAX_NUM; });
    if (ok.length < 2) return null;
    const i = ok.findIndex(function (x) { return x.n === n && x.q === q; });
    const nx = ok[(i + 1) % ok.length];
    return { n: nx.n, q: nx.q, short: nx.q + nx.n };
  }

  // ---------- 鍵盤：點一個鍵，選最自然的拼法 ----------
  const MAX_NUM = 15;
  /**
   * 下方音 lo 固定，點到 MIDI 編號 midi 的鍵當上方音：列出所有能用的拼法（度數 1–15、性質在選單內、升降不超過 ±2），
   * 優先順序：大、小、完全 → 增四度（三全音）→ 其他增減；同等時度數接近「半音數 × 7/12」、上方音升降記號少的優先。
   */
  function spellUpper(lo, midi) {
    const semis = midi - lo.midi;
    if (semis < 0) return null;
    const cands = [];
    for (let n = 1; n <= MAX_NUM; n++) {
      const q = qualityOf(n, semis);
      if (!q || allowedQualities(n).indexOf(q) < 0) continue;
      const hi = upperOf(lo, n, q);
      if (!hi) continue;
      let score = (q === 'P' || q === 'M' || q === 'm') ? 0 : (q === 'A' && cls(n) === 4) ? 1 : 3;
      score += Math.abs(hi.acc) * 0.5;
      cands.push({ n: n, q: q, hi: hi, score: score });
    }
    cands.sort(function (a, b) { return a.score - b.score || Math.abs(a.hi.acc) - Math.abs(b.hi.acc) || a.n - b.n; });
    return cands[0] || null;
  }
  /** 鍵盤點到的鍵當下方音：白鍵用本位；黑鍵沿用目前下方音的升降方向，否則 F♯ 用升、其他用降 */
  function spellLower(midi, prevAcc) {
    const pc = mod(midi, 12), oct = Math.floor(midi / 12) - 1;
    const wi = LETTER_PC.indexOf(pc);
    if (wi >= 0) return note(wi, 0, oct);
    const sharp = prevAcc > 0 ? true : prevAcc < 0 ? false : pc === 6;
    if (sharp) return note(LETTER_PC.indexOf(pc - 1), 1, oct);
    return note(LETTER_PC.indexOf(pc + 1), -1, oct);
  }

  // ---------- 疊音程 ----------
  const MAX_BRICKS = 4, MAX_STACK_SEMIS = 36;
  /**
   * 從 start 開始依序疊上 bricks（[{ n, q }]）：每一個音都要拼得出來（升降不超過 ±2）、總共不超過三個八度。
   * 傳回 { ok, notes, bricks（各自的比值、音分）, total（拼出來的整體音程）, prod（純律比值相乘）, centsJ, centsE, table, tableDiff, tableComma, why }
   */
  function stack(start, bricks) {
    const notes = [start], items = [];
    let prod = [1, 1], cJ = 0, semis = 0, why = null;
    for (let i = 0; i < bricks.length; i++) {
      const b = bricks[i];
      const r = justRatio(b.n, b.q), s = semisOf(b.n, b.q);
      const nx = upperOf(notes[notes.length - 1], b.n, b.q);
      if (!nx) { why = 'acc'; break; }
      if (semis + s > MAX_STACK_SEMIS) { why = 'range'; break; }
      notes.push(nx);
      prod = mul(prod, r);
      cJ += cents(fval(r));
      semis += s;
      items.push({ n: b.n, q: b.q, short: b.q + b.n, ratio: r, centsJ: cents(fval(r)), centsE: 100 * s, semis: s, from: notes[notes.length - 2], to: nx });
    }
    const last = notes[notes.length - 1];
    const tot = between(start, last);
    const table = tot && tot.q ? justRatio(tot.n, tot.q) : null;
    return {
      ok: !why, why: why, notes: notes, bricks: items,
      total: tot, prod: prod, centsJ: cJ, centsE: 100 * semis, semis: semis,
      table: table, tableCents: table ? cents(fval(table)) : null,
      tableDiff: table ? cJ - cents(fval(table)) : null,
      tableComma: table ? commaOf(div(prod, table)) : null
    };
  }
  /** 能不能再疊一塊（不超過 4 塊、三個八度、拼得出來） */
  function canPush(start, bricks, b) {
    if (bricks.length >= MAX_BRICKS) return { ok: false, why: 'count' };
    const s = stack(start, bricks.concat([b]));
    return { ok: s.ok, why: s.why };
  }

  // ---------- 一次算出畫面需要的所有東西 ----------
  /**
   * st = { lo（音）, n, q, tuning（'equal' | 'just'）, chain（null 或 { start, bricks }） }
   * 傳回 A：主音程（下方音、上方音、名稱、半音數、比值、兩種音分、轉位、等音程、頻率）與疊音程的結果。
   */
  function analyze(st) {
    const lo = st.lo, n = st.n, q = st.q, tuning = st.tuning === 'just' ? 'just' : 'equal';
    const hi = upperOf(lo, n, q);
    const semis = semisOf(n, q);
    const ratio = justRatio(n, q);
    const cJ = ratio ? cents(fval(ratio)) : null, cE = 100 * semis;
    const sn = simpleNum(n);
    const inv = invert(n, q);
    const sRatio = justRatio(sn, q);          // 單音程部分的比值
    const iRatio = justRatio(inv.n, inv.q);
    const prod = sRatio && iRatio ? mul(sRatio, iRatio) : null;
    const enh = enharmonics(n, q).map(function (e) {
      const r = justRatio(e.n, e.q);
      return { n: e.n, q: e.q, short: e.short, ratio: r, centsJ: r ? cents(fval(r)) : null, diffJ: r && ratio ? cents(fval(r)) - cJ : null, comma: r && ratio ? commaOf(div(r, ratio)) : null, hi: upperOf(lo, e.n, e.q) };
    });
    const fLo = freqOf(lo);
    const fHi = tuning === 'just' && ratio ? fLo * fval(ratio) : (hi ? freqOf(hi) : fLo * Math.pow(2, semis / 12));
    const A = {
      lo: lo, hi: hi, n: n, q: q, short: q + n, semis: semis, tuning: tuning,
      simple: { n: sn, short: q + sn }, compound: n > 8, octaves: Math.floor(semis / 12), octPart: n > 8 ? Math.floor((n - 2) / 7) : 0,
      ratio: ratio, centsJ: cJ, centsE: cE, cents: tuning === 'just' ? cJ : cE, diffJE: cJ == null ? null : cJ - cE,
      inv: {
        n: inv.n, q: inv.q, short: inv.q + inv.n, ratio: iRatio, centsJ: iRatio ? cents(fval(iRatio)) : null, centsE: 100 * semisOf(inv.n, inv.q),
        prod: prod, prodTwo: feq(prod, [2, 1]), prodComma: prod && !feq(prod, [2, 1]) ? commaOf(div(prod, [2, 1])) : null
      },
      enh: enh, fLo: fLo, fHi: fHi,
      exps: ratio ? exps(ratio) : null,
      chain: null
    };
    if (st.chain && st.chain.bricks && st.chain.bricks.length) {
      const S = stack(st.chain.start, st.chain.bricks);
      S.cents = tuning === 'just' ? S.centsJ : S.centsE;
      // 和目前的音程比（同樣從下方音量起）：純律看比值、平均律看半音
      S.mainDiff = (tuning === 'just' ? S.centsJ - cJ : S.centsE - cE);
      S.mainComma = ratio ? commaOf(div(S.prod, ratio)) : null;
      S.mainSame = tuning === 'just' ? feq(S.prod, ratio) : S.semis === semis;
      A.chain = S;
    }
    return A;
  }

  /** 任務事件的資料（頁面與任務證明共用）：主音程與疊音程的重點數字，全部是普通的數字、字串與陣列 */
  function eventData(A, extra) {
    const c = A.chain;
    const d = {
      lo: A.lo.full, loName: A.lo.name, hi: A.hi ? A.hi.full : null, hiName: A.hi ? A.hi.name : null,
      n: A.n, qual: A.q, short: A.short, simpleShort: A.simple.short, semis: A.semis, compound: A.compound, tuning: A.tuning,
      ratio: A.ratio ? A.ratio.slice() : null, cents: A.cents, centsJ: A.centsJ, centsE: A.centsE, diffJE: A.diffJE,
      inv: { short: A.inv.short, prod: A.inv.prod ? A.inv.prod.slice() : null, prodTwo: A.inv.prodTwo },
      enh: A.enh.map(function (e) { return e.short; }),
      chain: c ? {
        shorts: c.bricks.map(function (b) { return b.short; }), len: c.bricks.length, start: c.notes[0].full,
        total: c.total && c.total.short, semis: c.semis, prod: c.prod.slice(), centsJ: c.centsJ, centsE: c.centsE,
        tableDiff: c.tableDiff, mainDiff: c.mainDiff, mainSame: c.mainSame,
        tableComma: c.tableComma ? c.tableComma.en : null, mainComma: c.mainComma ? c.mainComma.en : null
      } : null
    };
    return Object.assign(d, extra || {});
  }

  return {
    LETTERS: LETTERS, LETTER_PC: LETTER_PC, MAX_ACC: MAX_ACC, MAX_NUM: MAX_NUM, MAX_BRICKS: MAX_BRICKS, MAX_STACK_SEMIS: MAX_STACK_SEMIS,
    mod: mod, cents: cents, accText: accText, note: note, noteAt: noteAt, parseNote: parseNote, freqOf: freqOf,
    QUALS: QUALS, cls: cls, isPerfect: isPerfect, refSemis: refSemis, qualityOffset: qualityOffset, qualityOf: qualityOf,
    allowedQualities: allowedQualities, semisOf: semisOf, between: between, upperOf: upperOf,
    QZH: QZH, QEN: QEN, numName: numName, name: name,
    gcd: gcd, frac: frac, mul: mul, div: div, fval: fval, fstr: fstr, feq: feq, exps: exps,
    JUST: JUST, justRatio: justRatio, centsOf: centsOf, COMMAS: COMMAS, commaOf: commaOf,
    simpleNum: simpleNum, invert: invert, enharmonics: enharmonics, respell: respell,
    spellUpper: spellUpper, spellLower: spellLower,
    stack: stack, canPush: canPush, analyze: analyze, eventData: eventData
  };
}));
