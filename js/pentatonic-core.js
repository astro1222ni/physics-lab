/*
 * pentatonic-core.js — 「五聲音階：宮商角徵羽」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   五聲音階：宮商角徵羽 = 以宮為 Do 的 Do Re Mi Sol La（比宮高 0、2、4、7、9 個半音），步伐 2 2 3 2 3（大二度與小三度兩種）。
 *   五種調式：以宮、商、角、徵、羽為主音（宮調式…羽調式），步伐是 2 2 3 2 3 的循環移位。
 *   拼音：先由主音與調式找出宮音（例如 A 羽調式的宮是 C），五個音用宮的大調音階第 1、2、3、5、6 級的字母。
 *   亮度：每個音在五度鏈（… F C G D A E …）上的位置減去主音的位置後加總；宮 +10、徵 +5、商 0、羽 −5、角 −10。
 *   三分損益：弦長乘 2/3（三分損一，音升高純五度）或乘 4/3（三分益一，音降低純四度），讓音留在一個八度裡。
 *     先損（《史記・律書》）：宮 81 → 徵 54 → 商 72 → 羽 48 → 角 64；先益（《管子・地員》）：宮 81 → 徵 108 → 商 72 → 羽 96 → 角 64。
 *     第 n 個音比宮高 n − 1 個純五度（頻率 × 3/2），再用八度（× 2 或 ÷ 2）拉回範圍，和五度相生相同。
 *   音律：五度相生（三分損益；比值都是 3 與 2 的次方）與十二平均律（2^(k/12)），主音在 C4–B4，A4 = 440 Hz（ISO 16）。
 *   其他：音程向量、最大均勻、步伐種類、半音與三全音個數、三種中國七聲音階（雅樂、清樂、燕樂）、隨機旋律（只用音階裡的音）。
 *
 * 用法：瀏覽器 window.PentatonicCore；Node require('./pentatonic-core.js')（會自動載入 music-theory.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.PentatonicCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const mod = function (a, n) { return ((a % n) + n) % n; };
  const LOG2_3 = Math.log2(3);

  // ---------- 字母與升降記號 ----------
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  /** 字母在五度鏈上的位置（F −1、C 0、G 1、D 2、A 3、E 4、B 5） */
  const LETTER_FIFTH = [0, 2, 4, -1, 1, 3, 5];
  function accText(a) { return a > 0 ? '♯'.repeat(a) : a < 0 ? '♭'.repeat(-a) : ''; }
  const BLACK = [1, 3, 6, 8, 10];

  /** 主音選單：12 個音高、17 種寫法（黑鍵有升、降兩種寫法） */
  const TONICS = [
    ['C', 0, 0], ['C♯', 0, 1], ['D♭', 1, -1], ['D', 1, 0], ['D♯', 1, 1], ['E♭', 2, -1], ['E', 2, 0], ['F', 3, 0], ['F♯', 3, 1],
    ['G♭', 4, -1], ['G', 4, 0], ['G♯', 4, 1], ['A♭', 5, -1], ['A', 5, 0], ['A♯', 5, 1], ['B♭', 6, -1], ['B', 6, 0]
  ].map(function (t) { return { name: t[0], letter: t[1], acc: t[2], pc: mod(LETTER_PC[t[1]] + t[2], 12) }; });
  function tonicByName(name) { return TONICS.filter(function (t) { return t.name === name; })[0] || null; }

  // ---------- 五聲：宮商角徵羽 ----------
  /** 五個音（照音高排列）：比宮高幾個半音、在宮的大調裡是第幾個字母（0 起算）、在五度鏈上比宮高幾個五度 */
  const ROLES = [
    { zh: '宮', en: 'gong', solf: 'Do', semis: 0, letter: 0, fifth: 0 },
    { zh: '商', en: 'shang', solf: 'Re', semis: 2, letter: 1, fifth: 2 },
    { zh: '角', en: 'jue', solf: 'Mi', semis: 4, letter: 2, fifth: 4 },
    { zh: '徵', en: 'zhi', solf: 'Sol', semis: 7, letter: 4, fifth: 1 },
    { zh: '羽', en: 'yu', solf: 'La', semis: 9, letter: 5, fifth: 3 }
  ];
  const GONG_SEMIS = [0, 2, 4, 7, 9];
  const GONG_STEPS = [2, 2, 3, 2, 3];
  /** 五種調式（k = 主音是第幾個音：0 宮、1 商、2 角、3 徵、4 羽） */
  const MODES = ROLES.map(function (r, k) {
    return { id: r.en, k: k, zh: r.zh + '調式', en: r.en.charAt(0).toUpperCase() + r.en.slice(1) + ' mode', role: r.zh };
  });
  function modeById(id) { return MODES.filter(function (m) { return m.id === id; })[0] || null; }
  /** 五度鏈上的順序（三分損益產生的順序）：宮 徵 商 羽 角 → 角色索引 */
  const FIFTH_ORDER = [0, 3, 1, 4, 2];
  /** 亮度：每個音在五度鏈上的位置減主音的位置，加總 */
  const BRIGHTNESS = ROLES.map(function (r) { return 10 - 5 * r.fifth; });

  function rotate(arr, r) { const n = arr.length; return arr.map(function (x, i) { return arr[(i + r) % n]; }); }
  function sameList(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  /** 調式 k 的音（比主音高幾個半音） */
  function modeSemis(k) { return GONG_SEMIS.map(function (x, i) { return mod(GONG_SEMIS[(k + i) % 5] - GONG_SEMIS[k], 12); }); }
  function modeSteps(k) { return rotate(GONG_STEPS, k); }
  /** 一組音（相對主音的半音數）→ 整理好的 [0, …]（一定含主音 0） */
  function normSemis(list) {
    const seen = { 0: true };
    (list || []).forEach(function (s) { seen[mod(Math.round(s), 12)] = true; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }
  /** 半音數 → 步伐（最後一步回到八度上的主音） */
  function stepsOf(semis) {
    const s = normSemis(semis), n = s.length;
    return s.map(function (x, i) { return (i + 1 < n ? s[i + 1] : 12) - x; });
  }
  /** 這組音是不是五聲音階（步伐是 2 2 3 2 3 的某個轉位）；是的話傳回調式 k，不是傳回 −1 */
  function pentMode(semis) {
    const st = stepsOf(semis);
    if (st.length !== 5) return -1;
    for (let k = 0; k < 5; k++) if (sameList(modeSteps(k), st)) return k;
    return -1;
  }

  // ---------- 三種中國七聲音階（相對宮） ----------
  const SEVEN = {
    ya: { semis: [0, 2, 4, 6, 7, 9, 11], zh: '雅樂音階（古音階）', en: 'yayue (ancient) scale', extra: ['變徵', '變宮'], extraEn: ['bianzhi', 'biangong'] },
    qing: { semis: [0, 2, 4, 5, 7, 9, 11], zh: '清樂音階（新音階）', en: 'qingyue (new) scale', extra: ['清角', '變宮'], extraEn: ['qingjue', 'biangong'] },
    yan: { semis: [0, 2, 4, 5, 7, 9, 10], zh: '燕樂音階（清商音階）', en: 'yanyue (qingshang) scale', extra: ['清角', '閏'], extraEn: ['qingjue', 'run'] }
  };
  /** 七個音的集合以 g（比主音高幾個半音）為宮時，是哪一種中國七聲音階 */
  function sevenAt(semis, g) {
    const rel = semis.map(function (s) { return mod(s - g, 12); }).sort(function (a, b) { return a - b; });
    for (const id in SEVEN) if (sameList(SEVEN[id].semis, rel)) return id;
    return null;
  }

  // ---------- 比值（3 與 2 的次方）與分數 ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
  /** 比值 3^a · 2^b → 最簡分數 [p, q] */
  function expFrac(a, b) {
    const p = Math.pow(3, Math.max(0, a)) * Math.pow(2, Math.max(0, b));
    const q = Math.pow(3, Math.max(0, -a)) * Math.pow(2, Math.max(0, -b));
    return [p, q];
  }
  const expVal = function (a, b) { return Math.pow(3, a) * Math.pow(2, b); };
  const expCents = function (a, b) { return 1200 * (a * LOG2_3 + b); };
  /** 三分損益的範圍：先損時是 [1, 2)（宮最低）；先益時是 [3/4, 3/2)（徵、羽在宮的下面） */
  const WINDOW_LO2 = { sun: 0, yi: Math.log2(0.75) };
  /** 比宮高 q 個五度的音在範圍裡的比值 3^q · 2^b：b 使比值落在 [2^lo2, 2^(lo2+1)) */
  function windowExp(q, order) {
    const lo2 = WINDOW_LO2[order] == null ? 0 : WINDOW_LO2[order];
    let b = Math.ceil(lo2 - q * LOG2_3 - 1e-12);
    // 修正：q·log2(3) + b 要在 [lo2, lo2 + 1)
    while (q * LOG2_3 + b < lo2 - 1e-12) b++;
    while (q * LOG2_3 + b >= lo2 + 1 - 1e-12) b--;
    return [q, b];
  }
  /** 五度相生（以主音為準，往上 6 個、往下 5 個五度）：非五聲的自訂音階用 */
  const CHAIN_OF_PC = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 5: -1, 10: -2, 3: -3, 8: -4, 1: -5 };
  /** 比主音高 d 個五度的音、在主音上方第 oct 個八度：比值的次方 [a, b] */
  function fifthsUp(d, oct) {
    let b = -Math.floor(d * LOG2_3 + 1e-12);
    return [d, b + (oct || 0)];
  }

  // ---------- 拼音 ----------
  /** 五聲音階的拼法：主音 tonic、調式 k → 宮音與五個音（每個音用宮的大調第 1、2、3、5、6 級的字母） */
  function spellPent(tonic, k) {
    const gLetter = mod(tonic.letter - ROLES[k].letter, 7);
    const gPc = mod(tonic.pc - ROLES[k].semis, 12);
    const gAcc = mod(gPc - LETTER_PC[gLetter] + 6, 12) - 6;
    const notes = [];
    for (let i = 0; i < 5; i++) {
      const j = (k + i) % 5, L = (gLetter + ROLES[j].letter) % 7, pc = mod(gPc + ROLES[j].semis, 12);
      const acc = mod(pc - LETTER_PC[L] + 6, 12) - 6;
      notes.push({ role: j, letter: L, acc: acc, pc: pc, name: LETTERS[L] + accText(acc) });
    }
    return { gong: { letter: gLetter, acc: gAcc, pc: gPc, name: LETTERS[gLetter] + accText(gAcc) }, notes: notes };
  }
  /** 主音偏好升記號還是降記號（不在五聲音階裡的音用） */
  function prefSharp(tonic) { return tonic.acc > 0 || (tonic.acc === 0 && LETTER_FIFTH[tonic.letter] >= 0); }
  function plainName(tonic, pc) {
    pc = mod(pc, 12);
    if (pc === tonic.pc) return tonic.name;
    return (prefSharp(tonic) ? MT.SHARP_NAMES : MT.FLAT_NAMES)[pc];
  }
  /** 音名加八度數字（照字母算，所以 B♯3 = C4 的音高也寫對） */
  function withOctave(name, midi) {
    const L = LETTERS.indexOf(name.charAt(0));
    const acc = (name.match(/♯/g) || []).length - (name.match(/♭/g) || []).length;
    const oct = Math.floor((midi - acc - LETTER_PC[L]) / 12) - 1;
    return name + oct;
  }

  // ---------- 音程向量、均勻度 ----------
  function intervalVector(semis) {
    const s = normSemis(semis), v = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      const d = s[j] - s[i], ic = Math.min(d, 12 - d);
      if (ic >= 1 && ic <= 6) v[ic - 1]++;
    }
    return v;
  }
  /** 每一種「跨 d 步」的音程有哪幾種大小（半音） */
  function genericSizes(semis) {
    const s = normSemis(semis), n = s.length, out = [];
    for (let d = 1; d < n; d++) {
      const set = {};
      for (let i = 0; i < n; i++) set[mod(s[(i + d) % n] - s[i], 12) || 12] = true;
      out.push({ d: d, sizes: Object.keys(set).map(Number).sort(function (a, b) { return a - b; }) });
    }
    return out;
  }
  function maxEven(semis) {
    const g = genericSizes(semis);
    return g.every(function (x) { return x.sizes[x.sizes.length - 1] - x.sizes[0] <= 1; });
  }

  // ---------- 主音頻率 ----------
  const TONIC_MIDI0 = 60;     // 主音放在 C4–B4
  function tonicFreq(pc) { return MT.midiToFreq(TONIC_MIDI0 + mod(pc, 12)); }

  // =====================================================================
  // 分析：主音、音集合、類型（調式代號或 'custom'）、音律、起手、宮的弦長
  // =====================================================================
  /**
   * opt：{ tuning: 'pyth' | 'equal', order: 'sun' | 'yi', L0: 宮的弦長 }
   * 傳回 { tonic, tonicName, type, semis, n, steps, pcs, k（五聲調式；不是五聲為 −1）, mode, gong, gongPc, gongName,
   *        notes[ {i, semis, pc, name, nameOct, midi, role, roleZh, solf, freq, ratio{p,q,value,cents}, len{n,d,value}, dev} ]（含八度上的主音）,
   *        names, white, black, sharps, flats, doubles, brightness, iv, maxEven, sizes, minStep, semitones, tritones, seven, sevenGongs }
   */
  function analyze(tonicName, semisIn, type, opt) {
    opt = opt || {};
    const tuning = opt.tuning === 'equal' ? 'equal' : 'pyth';
    const order = opt.order === 'yi' ? 'yi' : 'sun';
    const L0 = opt.L0 > 0 ? opt.L0 : 81;
    const tonic = tonicByName(tonicName) || TONICS[0];
    const semis = normSemis(semisIn);
    const n = semis.length, steps = stepsOf(semis);
    const k = pentMode(semis);
    const pcs = semis.map(function (s) { return mod(tonic.pc + s, 12); }).sort(function (a, b) { return a - b; });
    const f0 = tonicFreq(tonic.pc);
    const A = {
      tonic: tonic.pc, tonicName: tonic.name, type: type || 'custom', semis: semis, n: n, steps: steps, pcs: pcs,
      k: k, mode: k >= 0 ? MODES[k].id : null, tuning: tuning, order: order, L0: L0
    };
    let sp = null;
    if (k >= 0) {
      sp = spellPent(tonic, k);
      A.gongPc = sp.gong.pc; A.gongName = sp.gong.name;
      A.sharps = sp.notes.reduce(function (s, x) { return s + Math.max(0, x.acc); }, 0);
      A.flats = sp.notes.reduce(function (s, x) { return s + Math.max(0, -x.acc); }, 0);
      A.doubles = sp.notes.filter(function (x) { return Math.abs(x.acc) >= 2; }).length;
      A.brightness = BRIGHTNESS[k];
    } else { A.gongPc = null; A.gongName = null; A.sharps = A.flats = A.doubles = null; A.brightness = null; }

    // 主音在三分損益範圍裡的位置（宮在範圍的哪裡）：比值次方 [qT, bT]；非五聲時「宮」就是主音
    const qT = k >= 0 ? ROLES[k].fifth : 0;
    const wT = windowExp(qT, order);
    const semisW = k >= 0 ? Math.round(1200 * (wT[0] * LOG2_3 + wT[1]) / 100) : 0;   // 主音比宮高幾個半音（可以是負的）
    A.tonicWindowCents = expCents(wT[0], wT[1]);

    A.notes = [];
    for (let i = 0; i <= n; i++) {
      const oct = i === n ? 1 : 0, s = i === n ? 12 : semis[i], pc = mod(tonic.pc + s, 12);
      const midi = TONIC_MIDI0 + tonic.pc + s;
      let role = -1, name, d;
      if (k >= 0) {
        const nt = sp.notes[i % 5];
        role = nt.role; name = nt.name;
        d = ROLES[role].fifth - qT;                    // 比主音高幾個五度（−4…4）
      } else {
        name = plainName(tonic, pc);
        d = CHAIN_OF_PC[mod(s, 12)];
      }
      // 五度相生：主音 × 3^d，再用八度拉到 [1, 2)；最後一個是八度上的主音
      const pe = fifthsUp(d, oct);
      const pf = expFrac(pe[0], pe[1]);
      const et = Math.pow(2, s / 12);
      const pv = expVal(pe[0], pe[1]);
      const ratio = tuning === 'equal'
        ? { p: null, q: null, value: et, cents: s * 100, et: s }
        : { p: pf[0], q: pf[1], value: pv, cents: expCents(pe[0], pe[1]), et: s };
      // 弦長：宮的弦長 L0 ÷（這個音比宮的頻率比）
      const fromG = [pe[0] + wT[0], pe[1] + wT[1]];
      let len;
      if (tuning === 'equal') len = { n: null, d: null, value: L0 / Math.pow(2, (semisW + s) / 12) };
      else {
        const lf = expFrac(-fromG[0], -fromG[1]);
        const num = L0 * lf[0], den = lf[1], g = gcd(num, den);
        len = { n: num / g, d: den / g, value: num / den };
      }
      A.notes.push({
        i: i, semis: s, pc: pc, name: name, midi: midi, nameOct: withOctave(name, midi), role: role,
        roleZh: role >= 0 ? ROLES[role].zh : '', roleEn: role >= 0 ? ROLES[role].en : '',
        solf: role >= 0 ? ROLES[role].solf : MT.SOLFEGE[mod(s, 12)],
        freq: f0 * ratio.value, ratio: ratio, len: len,
        dev: 1200 * Math.log2(pv) - s * 100
      });
    }
    A.names = A.notes.slice(0, n).map(function (x) { return x.name; });
    A.white = pcs.every(function (p) { return BLACK.indexOf(p) < 0; });
    A.black = pcs.every(function (p) { return BLACK.indexOf(p) >= 0; });
    A.iv = intervalVector(semis);
    A.sizes = genericSizes(semis);
    A.maxEven = n >= 2 && maxEven(semis);
    A.minStep = Math.min.apply(null, steps);
    A.semitones = steps.filter(function (x) { return x === 1; }).length;
    A.tritones = A.iv[5];
    A.stepKinds = Object.keys(steps.reduce(function (o, x) { o[x] = 1; return o; }, {})).map(Number).sort(function (a, b) { return a - b; });
    A.seven = n === 7 ? sevenAt(semis, 0) : null;
    A.sevenGongs = [];
    if (n === 7) semis.forEach(function (g) { const id = sevenAt(semis, g); if (id) A.sevenGongs.push({ g: g, pc: mod(tonic.pc + g, 12), id: id }); });
    return A;
  }

  /** 雙音（兩根弦或兩個音）之間的比值與音分；夾在 0–1200 音分之外的照實際算 */
  function pairInfo(a, b) {
    // a、b：[3 的次方, 2 的次方]（相對宮的頻率比）
    const da = b[0] - a[0], db = b[1] - a[1];
    const f = expFrac(da, db);
    return { p: f[0], q: f[1], cents: expCents(da, db) };
  }

  // =====================================================================
  // 三分損益：產生 gen 個音（1–13）
  // =====================================================================
  const CHAIN_ROLE = ['宮', '徵', '商', '羽', '角', '變宮', '變徵'];
  const CHAIN_ROLE_EN = ['gong', 'zhi', 'shang', 'yu', 'jue', 'biangong', 'bianzhi'];
  const GEN_MAX = 13;
  /**
   * 傳回 { gen, order, L0, notes[ {idx, q, b, op（'sun' 損 ×2/3、'yi' 益 ×4/3、null）, len{n,d,value}, int, pcG（比宮高幾個半音的音高類）,
   *        cents（比宮高幾音分）, role, roleEn } ], sorted（由低到高）, steps[ {from, to, p, q, cents} ], kinds[ {p,q,cents,count} ],
   *        allInt, minCents, semitonePairs, minGapSemis, comma（第 13 個音和宮差多少：{ len, cents } 或 null）}
   */
  function chain(gen, order, L0) {
    order = order === 'yi' ? 'yi' : 'sun';
    L0 = L0 > 0 ? L0 : 81;
    gen = Math.max(1, Math.min(GEN_MAX, Math.round(gen) || 1));
    const notes = [];
    for (let q = 0; q < gen; q++) {
      const w = windowExp(q, order);
      const lf = expFrac(-w[0], -w[1]);
      const num = L0 * lf[0], den = lf[1], g = gcd(num, den);
      const len = { n: num / g, d: den / g, value: num / den };
      const prev = notes[q - 1];
      notes.push({
        idx: q, q: w[0], b: w[1], len: len, int: len.d === 1,
        op: prev ? (len.value < prev.len.value ? 'sun' : 'yi') : null,
        pcG: mod(7 * q, 12), cents: expCents(w[0], w[1]),
        role: CHAIN_ROLE[q] || '', roleEn: CHAIN_ROLE_EN[q] || ''
      });
    }
    const sorted = notes.slice().sort(function (a, b) { return a.cents - b.cents; });
    const steps = [];
    for (let i = 0; i < sorted.length && sorted.length > 1; i++) {
      const a = sorted[i], b = sorted[(i + 1) % sorted.length];
      const bq = b.q, bb = b.b + (i + 1 === sorted.length ? 1 : 0);
      const pi = pairInfo([a.q, a.b], [bq, bb]);
      steps.push({ from: a.idx, to: b.idx, p: pi.p, q: pi.q, cents: pi.cents });
    }
    const kinds = [];
    steps.forEach(function (s) {
      const k = kinds.filter(function (x) { return x.p === s.p && x.q === s.q; })[0];
      if (k) k.count++; else kinds.push({ p: s.p, q: s.q, cents: s.cents, count: 1 });
    });
    kinds.sort(function (a, b) { return b.cents - a.cents; });
    const pcsSet = {};
    notes.forEach(function (x) { pcsSet[x.pcG] = (pcsSet[x.pcG] || 0) + 1; });
    const uniq = Object.keys(pcsSet).map(Number).sort(function (a, b) { return a - b; });
    let minGap = 12;
    if (uniq.length < notes.length) minGap = 0;
    else if (uniq.length > 1) uniq.forEach(function (p, i) { const nx = i + 1 < uniq.length ? uniq[i + 1] : uniq[0] + 12; minGap = Math.min(minGap, nx - p); });
    const semitonePairs = steps.filter(function (s) { return s.cents > 60 && s.cents < 150; }).map(function (s) { return [s.from, s.to]; });
    const comma = gen >= 13 ? { len: L0 - notes[12].len.value, cents: 1200 * Math.log2(L0 / notes[12].len.value), p: Math.pow(3, 12), q: Math.pow(2, 19) } : null;
    return {
      gen: gen, order: order, L0: L0, notes: notes, sorted: sorted, steps: steps, kinds: kinds,
      allInt: notes.every(function (x) { return x.int; }),
      minCents: steps.length ? Math.min.apply(null, steps.map(function (s) { return s.cents; })) : null,
      semitonePairs: semitonePairs, minGapSemis: notes.length > 1 ? minGap : null, comma: comma
    };
  }
  /** 讓前 gen 個音的弦長都是整數，宮的弦長必須是 3^(gen−1) 的倍數 */
  function minIntegerL0(gen) { return Math.pow(3, Math.max(0, gen - 1)); }

  // =====================================================================
  // 隨機旋律（只用音階裡的音；程式自己生成，不是任何現成的曲子）
  // =====================================================================
  const RHYTHMS = [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [0.5, 0.5, 1, 1, 1], [1, 0.5, 0.5, 1, 1], [1.5, 0.5, 1, 1], [2, 2], [1, 1, 1, 0.5, 0.5]];
  const ENDINGS = [[1, 1, 2], [2, 2], [1, 1, 1, 1], [0.5, 0.5, 1, 2]];
  function rng(seed) {
    let s = (Math.abs(Math.round(seed)) % 2147483646) + 1;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }
  /**
   * 四小節（4/4，共 16 拍）的旋律：音級 d（0 = 主音，n = 高八度的主音，負的是低八度）、拍數 beats。
   * 規則：大多走一步（音階裡相鄰的音），偶爾跳兩步或三步；範圍是主音下方 2 個音到上方 n + 2 個音；最後一定回到主音（或高八度的主音），倒數第二個音從相鄰的音走過去。
   */
  function melody(seed, n) {
    n = Math.max(1, n || 5);
    const r = rng(seed);
    const pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    const rhythm = [];
    for (let bar = 0; bar < 3; bar++) pick(RHYTHMS).forEach(function (b) { rhythm.push(b); });
    pick(ENDINGS).forEach(function (b) { rhythm.push(b); });
    const lo = -2, hi = n + 2;
    const MOVES = [-1, -1, -1, 1, 1, 1, -2, 2, 0, -3, 3];
    let d = r() < 0.6 ? 0 : (n >= 3 ? 2 : 0);
    const out = [];
    const target = r() < 0.65 ? 0 : n;
    for (let i = 0; i < rhythm.length; i++) {
      if (i > 0) {
        if (i === rhythm.length - 1) d = target;
        else if (i === rhythm.length - 2) d = Math.abs(d - target) <= 1 && d !== target ? d : target + (d > target ? 1 : -1);
        else {
          let nd = d + pick(MOVES);
          if (nd < lo || nd > hi) nd = d - (nd - d);
          d = Math.max(lo, Math.min(hi, nd));
        }
      }
      out.push({ d: d, beats: rhythm[i] });
    }
    return out;
  }
  /** 音級 d → 比主音高幾個半音 */
  function degreeSemis(semis, d) { const n = semis.length; return semis[mod(d, n)] + 12 * Math.floor(d / n); }

  // =====================================================================
  // 播放的順序
  // =====================================================================
  /** 上行、下行、上行再下行：傳回 [{ i（第幾個音，n = 高八度主音）, beats }] */
  function sequence(n, dir) {
    const up = []; for (let i = 0; i <= n; i++) up.push(i);
    const list = dir === 'down' ? up.slice().reverse() : dir === 'updown' ? up.concat(up.slice(0, n).reverse()) : up;
    return list.map(function (i, j) { return { i: i, beats: j === list.length - 1 ? 2 : 1 }; });
  }

  // =====================================================================
  // 任務事件的資料
  // =====================================================================
  function eventData(A, S, extra) {
    S = S || {};
    const C = S.chain || null;
    const d = {
      tonic: A.tonic, tonicName: A.tonicName, type: A.type, n: A.n, semis: A.semis.slice(), steps: A.steps.slice(), pcs: A.pcs.slice(),
      names: A.names.slice(), pent: A.k >= 0, k: A.k, mode: A.mode, gongPc: A.gongPc, gongName: A.gongName,
      white: A.white, black: A.black, sharps: A.sharps, flats: A.flats, doubles: A.doubles, brightness: A.brightness,
      iv: A.iv.slice(), maxEven: A.maxEven, minStep: A.minStep, semitones: A.semitones, tritones: A.tritones, seven: A.seven,
      tuning: A.tuning, order: A.order, L0: A.L0, arr: S.arr || 'chrom', gen: C ? C.gen : null
    };
    if (C) {
      d.allInt = C.allInt; d.kinds = C.kinds.length; d.minGap = C.minGapSemis;
      d.genPcs = C.notes.map(function (x) { return mod((S.gongPc == null ? 0 : S.gongPc) + x.pcG, 12); });
      d.genBlack = d.genPcs.every(function (p) { return BLACK.indexOf(p) >= 0; });
      d.lens = C.notes.map(function (x) { return x.len.value; });
    }
    return Object.assign(d, extra || {});
  }

  return {
    mod: mod, LETTERS: LETTERS, LETTER_PC: LETTER_PC, LETTER_FIFTH: LETTER_FIFTH, BLACK: BLACK, accText: accText,
    TONICS: TONICS, tonicByName: tonicByName,
    ROLES: ROLES, MODES: MODES, modeById: modeById, GONG_SEMIS: GONG_SEMIS, GONG_STEPS: GONG_STEPS, FIFTH_ORDER: FIFTH_ORDER, BRIGHTNESS: BRIGHTNESS,
    rotate: rotate, modeSemis: modeSemis, modeSteps: modeSteps, normSemis: normSemis, stepsOf: stepsOf, pentMode: pentMode,
    SEVEN: SEVEN, sevenAt: sevenAt, spellPent: spellPent, plainName: plainName, withOctave: withOctave,
    intervalVector: intervalVector, genericSizes: genericSizes, maxEven: maxEven,
    expFrac: expFrac, expCents: expCents, windowExp: windowExp, fifthsUp: fifthsUp, pairInfo: pairInfo,
    TONIC_MIDI0: TONIC_MIDI0, tonicFreq: tonicFreq,
    analyze: analyze, chain: chain, GEN_MAX: GEN_MAX, CHAIN_ROLE: CHAIN_ROLE, CHAIN_ROLE_EN: CHAIN_ROLE_EN, minIntegerL0: minIntegerL0,
    melody: melody, degreeSemis: degreeSemis, sequence: sequence, eventData: eventData
  };
}));
