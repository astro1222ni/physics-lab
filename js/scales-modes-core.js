/*
 * scales-modes-core.js — 「音階與調式」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   音階的定義：一串「步伐」（相鄰兩音差幾個半音，加起來 = 12）。七個教會調式是大調步伐 W W H W W W H 的循環移位（轉位）。
 *   拼音：從主音的字母開始，每個音用一個字母（七聲音階剛好每個字母一次），選升降記號最少的寫法（F 大調是 B♭ 不是 A♯）。
 *   辨認：給一組音（相對主音的半音數），找出它是哪一族音階的第幾個轉位（教會調式、和聲小調、旋律小調、五聲、全音、八聲、半音）。
 *   亮暗：七聲音階每個音在「五度鏈」（… F C G D A E B …，升一個記號 = 往右 7 格）上的位置，減去主音的位置後加總；
 *     利底亞 +21、伊奧尼亞 +14、混合利底亞 +7、多利亞 0、伊奧利亞 −7、弗里吉亞 −14、洛克里亞 −21，每一步只降一個音（−7）。
 *   音程向量（Forte 1973）、最大均勻（Clough & Douthett 1991）、Myhill 性質（Carey & Clampitt 1989）。
 *   頻率：主音在 C4–B4（十二平均律，A4 = 440 Hz），其他音用十二平均律 2^(k/12) 或以主音為準的 5 限純律（music-theory.js 的 JUST_RATIOS）。
 *
 * 用法：瀏覽器 window.ScalesModesCore；Node require('./scales-modes-core.js')（會自動載入 music-theory.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.ScalesModesCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const mod = function (a, n) { return ((a % n) + n) % n; };
  const cents = function (r) { return 1200 * Math.log2(r); };

  // ---------- 字母、升降記號、唱名 ----------
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  /** 字母在五度鏈上的位置（C = 0，往右是升的方向：F −1、C 0、G 1、D 2、A 3、E 4、B 5） */
  const LETTER_FIFTH = [0, 2, 4, -1, 1, 3, 5];
  /** 唱名（Do Re Mi Fa Sol La Si，臺灣中小學常用 Si） */
  const SOLF = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
  /** 升降記號的文字：重升、重降寫成兩個符號（避免用少見的音樂符號字元） */
  function accText(a) { return a > 0 ? '♯'.repeat(a) : a < 0 ? '♭'.repeat(-a) : ''; }
  const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
  const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];

  /** 主音選單：12 個音高、17 種常用寫法（黑鍵有升、降兩種寫法） */
  const TONICS = [
    ['C', 0, 0], ['C♯', 0, 1], ['D♭', 1, -1], ['D', 1, 0], ['D♯', 1, 1], ['E♭', 2, -1], ['E', 2, 0], ['F', 3, 0], ['F♯', 3, 1],
    ['G♭', 4, -1], ['G', 4, 0], ['G♯', 4, 1], ['A♭', 5, -1], ['A', 5, 0], ['A♯', 5, 1], ['B♭', 6, -1], ['B', 6, 0]
  ].map(function (t) { return { name: t[0], letter: t[1], acc: t[2], pc: mod(LETTER_PC[t[1]] + t[2], 12) }; });
  function tonicByName(name) { return TONICS.filter(function (t) { return t.name === name; })[0] || null; }
  function tonicsOfPc(pc) { return TONICS.filter(function (t) { return t.pc === mod(pc, 12); }); }

  // ---------- 音階與音階族 ----------
  /** 預設可選的音階（步伐序列）；七個教會調式依大調步伐的轉位順序（rot = 從大調的第幾級開始） */
  const SCALES = [
    { id: 'ionian', zh: '伊奧尼亞（大調）', en: 'Ionian (major)', family: 'diatonic', rot: 0 },
    { id: 'dorian', zh: '多利亞', en: 'Dorian', family: 'diatonic', rot: 1 },
    { id: 'phrygian', zh: '弗里吉亞', en: 'Phrygian', family: 'diatonic', rot: 2 },
    { id: 'lydian', zh: '利底亞', en: 'Lydian', family: 'diatonic', rot: 3 },
    { id: 'mixolydian', zh: '混合利底亞', en: 'Mixolydian', family: 'diatonic', rot: 4 },
    { id: 'aeolian', zh: '伊奧利亞（自然小調）', en: 'Aeolian (natural minor)', family: 'diatonic', rot: 5 },
    { id: 'locrian', zh: '洛克里亞', en: 'Locrian', family: 'diatonic', rot: 6 },
    { id: 'harmonic', zh: '和聲小調', en: 'Harmonic minor', family: 'harmonic', rot: 0 },
    { id: 'melodic', zh: '旋律小調（上行）', en: 'Melodic minor (ascending)', family: 'melodic', rot: 0 },
    { id: 'wholetone', zh: '全音音階', en: 'Whole-tone scale', family: 'wholetone', rot: 0 },
    { id: 'chromatic', zh: '半音音階', en: 'Chromatic scale', family: 'chromatic', rot: 0 }
  ];
  const MODE_IDS = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian'];
  /** 亮暗階梯：由亮到暗，每往下一格只降一個音 */
  const BRIGHT_ORDER = ['lydian', 'ionian', 'mixolydian', 'dorian', 'aeolian', 'phrygian', 'locrian'];
  /** 音階族：基本步伐，與各轉位的名稱（沒有常用名稱的轉位就叫「第 k 個調式」） */
  const FAMILIES = {
    diatonic: { base: MAJOR_STEPS, zh: '自然音階（七個教會調式）', en: 'diatonic scale (the seven church modes)', names: MODE_IDS.map(function (id) { return scaleById(id); }) },
    harmonic: { base: [2, 1, 2, 2, 1, 3, 1], zh: '和聲小調', en: 'harmonic minor', names: [{ zh: '和聲小調', en: 'Harmonic minor' }] },
    melodic: {
      base: [2, 1, 2, 2, 2, 2, 1], zh: '旋律小調', en: 'melodic minor',
      names: [{ zh: '旋律小調（上行）', en: 'Melodic minor (ascending)' }, null, { zh: '利底亞增音階', en: 'Lydian augmented' },
        { zh: '利底亞屬音階（聲學音階）', en: 'Lydian dominant (acoustic scale)' }, null, null, { zh: '變化音階', en: 'Altered scale' }]
    },
    pentatonic: {
      base: [2, 2, 3, 2, 3], zh: '五聲音階', en: 'pentatonic scale',
      names: [{ zh: '五聲音階・宮調式', en: 'Pentatonic, gong mode' }, { zh: '五聲音階・商調式', en: 'Pentatonic, shang mode' },
        { zh: '五聲音階・角調式', en: 'Pentatonic, jue mode' }, { zh: '五聲音階・徵調式', en: 'Pentatonic, zhi mode' }, { zh: '五聲音階・羽調式', en: 'Pentatonic, yu mode' }]
    },
    wholetone: { base: [2, 2, 2, 2, 2, 2], zh: '全音音階', en: 'whole-tone scale', names: [{ zh: '全音音階', en: 'Whole-tone scale' }] },
    octatonic: { base: [2, 1, 2, 1, 2, 1, 2, 1], zh: '八聲音階（減音階）', en: 'octatonic (diminished) scale', names: [{ zh: '八聲音階（全半）', en: 'Octatonic (whole–half)' }, { zh: '八聲音階（半全）', en: 'Octatonic (half–whole)' }] },
    chromatic: { base: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], zh: '半音音階', en: 'chromatic scale', names: [{ zh: '半音音階', en: 'Chromatic scale' }] }
  };
  function scaleById(id) { return SCALES.filter(function (s) { return s.id === id; })[0] || null; }
  /** 循環移位：從第 r 步開始 */
  function rotate(arr, r) { const n = arr.length; return arr.map(function (x, i) { return arr[(i + r) % n]; }); }
  function sameList(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  /** 預設音階的步伐 */
  function scaleSteps(id) {
    const s = scaleById(id);
    if (!s) return null;
    return rotate(FAMILIES[s.family].base, s.rot);
  }
  /** 步伐 → 相對主音的半音數（不含八度上的主音）：[0, s1, s1+s2, …] */
  function semisFromSteps(steps) {
    const out = [0];
    for (let i = 0; i < steps.length - 1; i++) out.push(out[i] + steps[i]);
    return out;
  }
  /** 一組音（相對主音的半音數，可亂序、可重複、可超過 12）→ 整理好的 [0, …]（一定含主音 0） */
  function normSemis(list) {
    const seen = {};
    seen[0] = true;
    (list || []).forEach(function (s) { seen[mod(Math.round(s), 12)] = true; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }
  /** 半音數 → 步伐（最後一步回到八度上的主音） */
  function stepsOf(semis) {
    const s = normSemis(semis), n = s.length;
    return s.map(function (x, i) { return (i + 1 < n ? s[i + 1] : 12) - x; });
  }
  /** 辨認：這組音是哪一族音階的第幾個轉位（以主音為起點）；不是任何一族就傳回 null */
  function identify(semis) {
    const steps = stepsOf(semis);
    for (const fam in FAMILIES) {
      const F = FAMILIES[fam], b = F.base;
      if (b.length !== steps.length) continue;
      for (let r = 0; r < b.length; r++) {
        if (sameList(rotate(b, r), steps)) {
          const nm = F.names[r] || null;
          return {
            family: fam, rot: r, id: fam === 'diatonic' ? MODE_IDS[r] : (fam === 'harmonic' || fam === 'melodic') && r === 0 ? fam : fam === 'wholetone' || fam === 'chromatic' ? fam : null,
            zh: nm ? nm.zh : F.zh + '的第 ' + (r + 1) + ' 個調式', en: nm ? nm.en : 'Mode ' + (r + 1) + ' of the ' + F.en
          };
        }
      }
    }
    return null;
  }

  // ---------- 拼音（每個字母最多用一次，升降記號最少） ----------
  /**
   * 把一組音拼成音名。tonic = TONICS 裡的一個；semis = normSemis 過的半音數。
   * 七個音以下：字母照順序往上（可以跳過字母），每個音的升降最多兩個；動態規劃找升降記號最少的拼法
   * （重升、重降多扣 3 分；同分時跟著主音的方向：主音是升記號或在五度鏈右邊就偏好升記號）。
   * 超過七個音（八聲、半音音階）字母一定會重複，就逐個音用升或降記號的寫法（ok = false）。
   */
  function spell(tonic, semis) {
    const s = normSemis(semis), n = s.length;
    const prefSharp = tonic.acc > 0 || (tonic.acc === 0 && LETTER_FIFTH[tonic.letter] >= 0);
    const make = function (off, i) {
      const L = (tonic.letter + off) % 7, pc = mod(tonic.pc + s[i], 12);
      return { letter: L, acc: mod(pc - LETTER_PC[L] + 6, 12) - 6, pc: pc, semis: s[i], off: off };
    };
    if (n <= 7) {
      // best[i][o]：前 i+1 個音、第 i 個音用字母偏移 o 時的最小分數
      const INF = 1e9, best = [], from = [];
      for (let i = 0; i < n; i++) { best.push(new Array(7).fill(INF)); from.push(new Array(7).fill(-1)); }
      best[0][0] = 0;
      const cost = function (a) {
        const k = Math.abs(a);
        if (k > 2) return INF;
        return k + (k === 2 ? 3 : 0) + (a > 0 && !prefSharp ? 0.01 : a < 0 && prefSharp ? 0.01 : 0);
      };
      for (let i = 1; i < n; i++) {
        for (let o = i; o <= 6 - (n - 1 - i); o++) {
          const c = cost(make(o, i).acc);
          if (c >= INF) continue;
          for (let p = i - 1; p < o; p++) {
            if (best[i - 1][p] + c < best[i][o]) { best[i][o] = best[i - 1][p] + c; from[i][o] = p; }
          }
        }
      }
      let o = -1, b = INF;
      for (let k = 0; k <= 6; k++) if (best[n - 1][k] < b) { b = best[n - 1][k]; o = k; }
      if (o >= 0 || n === 1) {
        const offs = new Array(n);
        if (n === 1) offs[0] = 0;
        else { for (let i = n - 1; i >= 0; i--) { offs[i] = o; o = from[i][o]; } }
        return finish(offs.map(make), true);
      }
    }
    // 字母會重複：逐個音寫
    return finish(s.map(function (x, i) {
      const pc = mod(tonic.pc + x, 12);
      if (i === 0) return { letter: tonic.letter, acc: tonic.acc, pc: pc, semis: x, off: 0 };
      const white = LETTER_PC.indexOf(pc);
      let L, a;
      if (white >= 0) { L = white; a = 0; }
      else if (prefSharp) { L = LETTER_PC.indexOf(pc - 1); a = 1; }
      else { L = LETTER_PC.indexOf(pc + 1); a = -1; }
      return { letter: L, acc: a, pc: pc, semis: x, off: mod(L - tonic.letter, 7) };
    }), false);
    function finish(list, ok) {
      list.forEach(function (x) {
        x.name = LETTERS[x.letter] + accText(x.acc);
        x.fifth = LETTER_FIFTH[x.letter] + 7 * x.acc;
        x.fixedDo = accText(x.acc) + SOLF[x.letter];
        // 首調唱名：主音是 Do，以大調為準標出升降（例如多利亞的第 3 級是 ♭Mi）
        if (ok) { const d = x.off % 7; x.movDo = accText(x.semis - MAJOR_SEMIS[d]) + SOLF[d]; x.degree = accText(x.semis - MAJOR_SEMIS[d]) + (d + 1); }
        else { x.movDo = MT.SOLFEGE[x.semis]; x.degree = String(x.semis); }
      });
      list.ok = ok;
      return list;
    }
  }
  /** 拼法的分數（升降記號總數，重升重降多扣），用來比較兩種主音寫法 */
  function spellCost(sp) {
    if (!sp.ok) return 1e6;
    return sp.reduce(function (a, x) { const k = Math.abs(x.acc); return a + k + (k === 2 ? 3 : 0); }, 0);
  }
  /** 某個音高、某組音，用哪一種主音寫法最省記號（同分時用選單上較前面的） */
  function bestTonic(pc, semis) {
    let best = null, bc = Infinity;
    tonicsOfPc(pc).forEach(function (t) { const c = spellCost(spell(t, semis)) + (t.acc ? 0.001 * (t.acc > 0 ? 1 : 2) : 0); if (c < bc) { bc = c; best = t; } });
    return best;
  }
  /** 調號：有幾個音帶升、帶降、帶重升重降 */
  function signature(sp) {
    let sharps = 0, flats = 0, doubles = 0;
    sp.forEach(function (x) { if (x.acc > 0) sharps++; if (x.acc < 0) flats++; if (Math.abs(x.acc) >= 2) doubles++; });
    return { sharps: sharps, flats: flats, doubles: doubles };
  }
  /** 和大調比：哪幾級降低或升高（只對七聲音階），例如多利亞 → ['♭3', '♭7'] */
  function vsMajor(semis) {
    const s = normSemis(semis);
    if (s.length !== 7) return null;
    const out = [];
    s.forEach(function (x, i) { const d = x - MAJOR_SEMIS[i]; if (d) out.push(accText(d) + (i + 1)); });
    return out;
  }
  /** 亮度：七聲音階（字母每個一次）各音在五度鏈上相對主音的位置總和 */
  function brightness(sp) {
    if (!sp.ok || sp.length !== 7) return null;
    const f0 = sp[0].fifth;
    return sp.reduce(function (a, x) { return a + x.fifth - f0; }, 0);
  }

  // ---------- 音集合的數學 ----------
  /** 音程向量：六種音程類（1–6 個半音，大於 6 的取 12 − d）各出現幾次 */
  function intervalVector(pcs) {
    const v = [0, 0, 0, 0, 0, 0], p = normPcs(pcs);
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) { let d = mod(p[j] - p[i], 12); if (d > 6) d = 12 - d; if (d) v[d - 1]++; }
    return v;
  }
  function normPcs(pcs) {
    const seen = {};
    (pcs || []).forEach(function (x) { seen[mod(Math.round(x), 12)] = true; });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }
  /** 各「度數」（跨 d 個音，d = 1 … n−1）有哪些大小（半音數 → 次數） */
  function genericSizes(semis) {
    const s = normSemis(semis), n = s.length, out = [];
    for (let d = 1; d < n; d++) {
      const m = {};
      for (let i = 0; i < n; i++) { const k = mod(s[(i + d) % n] - s[i], 12) || 12; m[k] = (m[k] || 0) + 1; }
      out.push({ d: d, sizes: Object.keys(m).map(Number).sort(function (a, b) { return a - b; }), count: m });
    }
    return out;
  }
  /** 最大均勻：每一種度數的大小最多兩種，而且只差 1 個半音（Clough & Douthett 1991） */
  function maxEven(semis) {
    return genericSizes(semis).every(function (g) { return g.sizes[g.sizes.length - 1] - g.sizes[0] <= 1; });
  }
  /** Myhill 性質：每一種度數（二度、三度…）剛好有兩種大小（至少兩個音） */
  function myhill(semis) {
    const g = genericSizes(semis);
    return g.length > 0 && g.every(function (x) { return x.sizes.length === 2; });
  }
  /** 兩組音共用幾個音高（音類） */
  function common(a, b) { const B = normPcs(b); return normPcs(a).filter(function (x) { return B.indexOf(x) >= 0; }); }
  /** 是不是移位或倒影（鏡像）後就一樣（同一個「集合類」） */
  function sameSetClass(a, b) {
    const A = normPcs(a), B = normPcs(b);
    if (A.length !== B.length) return false;
    const key = B.join(',');
    for (let t = 0; t < 12; t++) {
      if (normPcs(A.map(function (x) { return x + t; })).join(',') === key) return true;
      if (normPcs(A.map(function (x) { return t - x; })).join(',') === key) return true;
    }
    return false;
  }
  /** 移位對稱：整組音往上移 t 個半音（1 ≤ t ≤ 11）後還是同一組音的最小 t；沒有就是 0（梅湘的「有限移位調式」） */
  function transSym(pcs) {
    const p = normPcs(pcs), key = p.join(',');
    if (!p.length) return 0;
    for (let t = 1; t < 12; t++) if (normPcs(p.map(function (x) { return x + t; })).join(',') === key) return t;
    return 0;
  }
  /** 步伐序列前後對稱（倒著走和正著走一樣） */
  function palindrome(steps) { return sameList(steps, steps.slice().reverse()); }

  // ---------- 頻率 ----------
  const TONIC_MIDI0 = 60;     // 主音放在 C4–B4
  const TUNINGS = ['equal', 'just'];
  /** 比主音高 s 個半音（可以超過 12）的頻率比；純律傳回最簡分數 */
  function ratio(tuning, s) {
    const oct = Math.floor(s / 12), i = mod(s, 12);
    if (tuning === 'just') {
      const r = MT.JUST_RATIOS[i], p = r[0] * Math.pow(2, Math.max(0, oct)), q = r[1] * Math.pow(2, Math.max(0, -oct));
      const f = MT.simplify(p, q);
      return { value: f[0] / f[1], p: f[0], q: f[1] };
    }
    return { value: Math.pow(2, s / 12), et: s };
  }
  function tonicFreq(pc) { return MT.midiToFreq(TONIC_MIDI0 + mod(pc, 12)); }
  function freq(tuning, tonicPc, s) { return tonicFreq(tonicPc) * ratio(tuning, s).value; }
  /** 兩個音（相對主音 s1 < s2）之間的比值與音分 */
  function stepRatio(tuning, s1, s2) {
    const a = ratio(tuning, s1), b = ratio(tuning, s2);
    if (tuning === 'just') { const f = MT.simplify(b.p * a.q, b.q * a.p); return { value: f[0] / f[1], p: f[0], q: f[1], cents: cents(f[0] / f[1]) }; }
    return { value: b.value / a.value, et: s2 - s1, cents: 100 * (s2 - s1) };
  }
  /** 音名加八度數字（以字母為準：B♯3 = C4、C♭5 = B4） */
  function nameOct(x, midi) { return x.name + (Math.floor((midi - x.acc) / 12) - 1); }
  /** 音階裡每個音的 MIDI 編號（主音在 C4–B4；最後加上高八度的主音） */
  function midis(tonicPc, semis) {
    const s = normSemis(semis), t = TONIC_MIDI0 + mod(tonicPc, 12);
    return s.map(function (x) { return t + x; }).concat([t + 12]);
  }

  /**
   * 播放的音序：dir = 'up' 上行（含高八度主音）、'down' 下行、'updown' 上行再下行（頂端不重複）、'arp' 主三和弦琶音 1–3–5–8–5–3–1。
   * 傳回相對主音的半音數陣列（八度上的主音是 12）。
   */
  function sequence(semis, dir) {
    const s = normSemis(semis).concat([12]), n = s.length;
    if (dir === 'down') return s.slice().reverse();
    if (dir === 'updown') return s.concat(s.slice(0, n - 1).reverse());
    if (dir === 'arp') {
      const k = s.length - 1;   // 音階有幾個音
      const third = k >= 3 ? s[2] : s[Math.min(1, k)], fifth = k >= 5 ? s[4] : s[Math.min(2, k)];
      const up = [0, third, fifth, 12].filter(function (x, i, a) { return a.indexOf(x) === i; });
      return up.concat(up.slice(0, up.length - 1).reverse());
    }
    return s;
  }
  /** 主三和弦（第 1、3、5 級）的性質：大、小、減、增；不是七聲音階就 null */
  function tonicTriad(semis) {
    const s = normSemis(semis);
    if (s.length !== 7) return null;
    const a = s[2], b = s[4];
    const kind = a === 4 && b === 7 ? 'major' : a === 3 && b === 7 ? 'minor' : a === 3 && b === 6 ? 'dim' : a === 4 && b === 8 ? 'aug' : 'other';
    return { third: a, fifth: b, kind: kind };
  }

  // ---------- 亮暗階梯 ----------
  /** 由亮到暗的第 k 格（0 = 利底亞 … 6 = 洛克里亞）的半音數 */
  function ladderSemis(k) { return semisFromSteps(scaleSteps(BRIGHT_ORDER[k])); }
  /**
   * 往暗（dir = +1）或往亮（−1）走一格。在洛克里亞再往暗：剩下沒降過的只有主音，主音降半音就變成低半音的利底亞（亮暗循環）；
   * 利底亞再往亮同理（主音升半音變成洛克里亞）。傳回 { mode, tonicPc, degree（被移動的是第幾級，1–7）, wrap }
   */
  function ladderStep(modeId, tonicPc, dir) {
    const k = BRIGHT_ORDER.indexOf(modeId);
    if (k < 0) return null;
    if (dir > 0 && k === 6) return { mode: 'lydian', tonicPc: mod(tonicPc - 1, 12), degree: 1, wrap: true };
    if (dir < 0 && k === 0) return { mode: 'locrian', tonicPc: mod(tonicPc + 1, 12), degree: 1, wrap: true };
    const k2 = k + (dir > 0 ? 1 : -1), a = ladderSemis(k), b = ladderSemis(k2);
    let deg = 0;
    for (let i = 0; i < 7; i++) if (a[i] !== b[i]) deg = i + 1;
    return { mode: BRIGHT_ORDER[k2], tonicPc: tonicPc, degree: deg, wrap: false };
  }
  /** 「調式之塔」（3D）用：同一個主音的七個調式由亮到暗，每一層的半音數與「比上一層低半音的是第幾級」 */
  function tower() {
    return BRIGHT_ORDER.map(function (id, k) {
      const s = ladderSemis(k);
      let moved = -1;
      if (k > 0) { const p = ladderSemis(k - 1); for (let i = 0; i < 7; i++) if (p[i] !== s[i]) moved = i; }
      return { id: id, semis: s, moved: moved, bright: 21 - 7 * k };
    });
  }

  // ---------- 全部的分析（頁面讀數與任務事件共用） ----------
  /**
   * tonicName：主音的寫法（例如 'B♭'）；semis：相對主音的半音數；type：預設音階代號或 'custom'；
   * opt = { tuning: 'equal' | 'just', ref: { tonicName, semis, type }（記住的音階，可省略） }
   */
  function analyze(tonicName, semis, type, opt) {
    opt = opt || {};
    const tonic = tonicByName(tonicName) || TONICS[0];
    const s = normSemis(semis), n = s.length, steps = stepsOf(s);
    const sp = spell(tonic, s), id = identify(s), sig = signature(sp);
    const pcs = normPcs(s.map(function (x) { return x + tonic.pc; }));
    const tuning = opt.tuning === 'just' ? 'just' : 'equal';
    const ms = midis(tonic.pc, s);
    const notes = sp.map(function (x, i) {
      const r = ratio(tuning, x.semis);
      return { name: x.name, nameOct: nameOct(x, ms[i]), letter: x.letter, acc: x.acc, pc: x.pc, semis: x.semis, midi: ms[i], degree: x.degree, movDo: x.movDo, fixedDo: x.fixedDo,
        freq: tonicFreq(tonic.pc) * r.value, ratio: r, cents: cents(r.value), dev: cents(r.value) - 100 * x.semis };
    });
    const top = sp[0];
    notes.push({ name: top.name, nameOct: nameOct(top, ms[n]), letter: top.letter, acc: top.acc, pc: top.pc, semis: 12, midi: ms[n], degree: '8', movDo: 'Do', fixedDo: top.fixedDo,
      freq: tonicFreq(tonic.pc) * 2, ratio: ratio(tuning, 12), cents: 1200, dev: 0 });
    let parent = null;
    if (id && id.family === 'diatonic') parent = sp[(7 - id.rot) % 7].name;
    const out = {
      tonic: tonic.pc, tonicName: tonic.name, type: type || 'custom', n: n, semis: s, steps: steps, pcs: pcs,
      names: sp.map(function (x) { return x.name; }), spelledOk: sp.ok,
      family: id ? id.family : null, rot: id ? id.rot : null, mode: id && id.family === 'diatonic' ? id.id : null, scaleId: id ? id.id : null,
      idZh: id ? id.zh : null, idEn: id ? id.en : null, parent: parent,
      sharps: sig.sharps, flats: sig.flats, doubles: sig.doubles,
      vsMajor: vsMajor(s), brightness: brightness(sp), iv: intervalVector(pcs), maxEven: maxEven(s), myhill: myhill(s),
      palindrome: palindrome(steps), sym: transSym(s), triad: tonicTriad(s), tuning: tuning, notes: notes,
      white: pcs.every(function (p) { return LETTER_PC.indexOf(p) >= 0; })
    };
    if (opt.ref && opt.ref.semis) {
      const rt = tonicByName(opt.ref.tonicName) || TONICS[0], rs = normSemis(opt.ref.semis);
      const rp = normPcs(rs.map(function (x) { return x + rt.pc; })), rid = identify(rs);
      const cm = common(pcs, rp);
      out.ref = { tonic: rt.pc, tonicName: rt.name, type: opt.ref.type || 'custom', semis: rs, pcs: rp, n: rp.length, mode: rid && rid.family === 'diatonic' ? rid.id : null,
        family: rid ? rid.family : null, iv: intervalVector(rp), common: cm.length, commonPcs: cm, sameSet: cm.length === rp.length && cm.length === pcs.length,
        sameClass: sameSetClass(pcs, rp) };
    } else out.ref = null;
    return out;
  }

  /**
   * 任務事件的資料（js/scales-modes.js 送出的，與 tools/mission-proofs/scales-modes.js 用的完全相同）：
   * 分析結果去掉音表（notes），再加上 extra（src、dir、tempo、step…）。
   */
  function eventData(a, extra) {
    const d = {
      tonic: a.tonic, tonicName: a.tonicName, type: a.type, n: a.n, semis: a.semis.slice(), steps: a.steps.slice(), pcs: a.pcs.slice(), names: a.names.slice(),
      family: a.family, rot: a.rot, mode: a.mode, scaleId: a.scaleId, sharps: a.sharps, flats: a.flats, doubles: a.doubles,
      brightness: a.brightness, iv: a.iv.slice(), maxEven: a.maxEven, myhill: a.myhill, palindrome: a.palindrome, sym: a.sym,
      triad: a.triad ? a.triad.kind : null, tuning: a.tuning, white: a.white,
      ref: a.ref ? { tonic: a.ref.tonic, tonicName: a.ref.tonicName, type: a.ref.type, n: a.ref.n, pcs: a.ref.pcs.slice(), mode: a.ref.mode, family: a.ref.family,
        iv: a.ref.iv.slice(), common: a.ref.common, sameSet: a.ref.sameSet, sameClass: a.ref.sameClass } : null
    };
    if (extra) for (const k in extra) d[k] = extra[k];
    return d;
  }

  return {
    eventData: eventData,
    mod: mod, cents: cents, LETTERS: LETTERS, LETTER_PC: LETTER_PC, LETTER_FIFTH: LETTER_FIFTH, SOLF: SOLF, accText: accText,
    MAJOR_STEPS: MAJOR_STEPS, MAJOR_SEMIS: MAJOR_SEMIS, TONICS: TONICS, tonicByName: tonicByName, tonicsOfPc: tonicsOfPc,
    SCALES: SCALES, MODE_IDS: MODE_IDS, BRIGHT_ORDER: BRIGHT_ORDER, FAMILIES: FAMILIES, scaleById: scaleById, rotate: rotate, sameList: sameList,
    scaleSteps: scaleSteps, semisFromSteps: semisFromSteps, normSemis: normSemis, normPcs: normPcs, stepsOf: stepsOf, identify: identify,
    spell: spell, spellCost: spellCost, bestTonic: bestTonic, signature: signature, vsMajor: vsMajor, brightness: brightness,
    intervalVector: intervalVector, genericSizes: genericSizes, maxEven: maxEven, myhill: myhill, common: common, sameSetClass: sameSetClass, palindrome: palindrome, transSym: transSym,
    TONIC_MIDI0: TONIC_MIDI0, TUNINGS: TUNINGS, ratio: ratio, tonicFreq: tonicFreq, freq: freq, stepRatio: stepRatio, nameOct: nameOct, midis: midis,
    sequence: sequence, tonicTriad: tonicTriad, ladderSemis: ladderSemis, ladderStep: ladderStep, tower: tower, analyze: analyze
  };
}));
