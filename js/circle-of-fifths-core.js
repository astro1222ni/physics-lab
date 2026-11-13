/*
 * circle-of-fifths-core.js — 「五度圈、調號與轉調」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 用一個整數 j 代表調號：j > 0 是 j 個升記號，j < 0 是 |j| 個降記號（C 大調、a 小調是 0）。
 *   五度鏈：… B♭(−2) F(−1) C(0) G(1) D(2) A(3) E(4) B(5) F♯(6) …，位置 q 的音：
 *     字母 = 'FCGDAEB'[(q + 1) mod 7]、升降 = ⌊(q + 1) / 7⌋（正 = 升、負 = 降）、音高類別 pc = 7q mod 12。
 *   調號 j 的大調：主音在 q = j；自然小調（關係小調）：主音在 q = j + 3；七個音是 q = j − 1 … j + 5（連續七個五度）。
 *   所以升記號依 F C G D A E B 的順序加上去（每多一個升記號，多的是新調的第 7 級），降記號順序相反（多的是新調的第 4 級）。
 *   同名異音：j 與 j − 12 是同一組鍵（例如 F♯ 大調 6 升＝G♭ 大調 6 降、C♯ 大調 7 升＝D♭ 大調 5 降），升記號數＋降記號數 = 12。
 * 共同音：兩個調號 j1、j2 在五度圈上相距 d（取 −6…5），共同音數 = 7 − |d|（|d| ≤ 5），相距 6 時是 2。
 * 乘 k：從 0 開始每次加 k 個半音（mod 12），走 12 / gcd(k, 12) 步回到起點；12 個音分成 gcd(k, 12) 個圈。
 *   五度圈就是 k = 7：7 與 12 互質，所以一個圈就走遍 12 個音。
 *   重排：把音高類別 n 放到第 a·n mod 12 格（a 與 12 互質才不會疊在一起）；a = 7 時半音圈變成五度圈。
 *   1、5、7、11 乘兩次都等於 1（mod 12），所以每一種重排做兩次都回到原樣（它們組成克萊因四元群）。
 * 頻率：十二平均律，A4 = 440 Hz（ISO 16:1975），主音放在 C4–B4。
 *
 * 用法：瀏覽器 window.CircleFifthsCore；Node require('./circle-of-fifths-core.js')（會自動載入 music-theory.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.CircleFifthsCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const mod = function (a, n) { return ((a % n) + n) % n; };
  const gcd = function (a, b) { a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b)); while (b) { const t = a % b; a = b; b = t; } return a; };

  // ---------- 五度鏈上的音 ----------
  const FIFTH_LETTERS = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  /** 升降記號的文字：重升、重降寫成兩個符號（避免用少見的音樂符號字元） */
  function accText(a) { return a > 0 ? '♯'.repeat(a) : a < 0 ? '♭'.repeat(-a) : ''; }
  /** 五度鏈位置 q 的音：{ q, letter, acc, pc, name } */
  function noteAt(q) {
    const letter = FIFTH_LETTERS[mod(q + 1, 7)], acc = Math.floor((q + 1) / 7);
    return { q: q, letter: letter, acc: acc, pc: mod(7 * q, 12), name: letter + accText(acc) };
  }
  /** 字母在五度鏈上的基本位置（F −1、C 0、G 1、D 2、A 3、E 4、B 5） */
  function baseQ(letter) { return FIFTH_LETTERS.indexOf(letter) - 1; }
  /** 字母在 C 大調音階中的順序（C 0、D 1 … B 6），畫五線譜用 */
  const LETTER_STEP = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

  // ---------- 調 ----------
  const MODES = ['major', 'minor'];
  /** 主音在五度鏈上的位置 */
  function tonicQ(j, mode) { return mode === 'minor' ? j + 3 : j; }
  /** 調的名稱：大調大寫（C、F♯），小調小寫（a、f♯） */
  function keyLabel(j, mode) {
    const n = noteAt(tonicQ(j, mode));
    return (mode === 'minor' ? n.letter.toLowerCase() : n.letter) + accText(n.acc);
  }
  /** 五度圈上的格子（0–11，C 在 0，順時針往升記號方向）＝ j mod 12 */
  function posOf(j) { return mod(j, 12); }
  /**
   * 格子 pos 用哪一個調號：spell = 'auto'（常用：記號最少；6 個時用升記號）、'sharp'（一律寫成升記號 0…11）、'flat'（一律寫成降記號 −11…0）。
   * 升記號或降記號超過 7 個的是「理論上的調」，會用到重升或重降記號。
   */
  function jOf(pos, spell) {
    pos = mod(Math.round(pos), 12);
    if (spell === 'sharp') return pos;
    if (spell === 'flat') return pos === 0 ? 0 : pos - 12;
    return pos <= 6 ? pos : pos - 12;
  }
  /** 這一格有沒有兩種常用寫法（升、降記號都不超過 7 個）：B／C♭、F♯／G♭、C♯／D♭（小調 g♯／a♭、d♯／e♭、a♯／b♭） */
  function enharmonicPos(pos) { pos = mod(pos, 12); return pos >= 5 && pos <= 7; }
  /** 一般用的兩種寫法（常用的在前）；只有一種時傳回一個 */
  function standardJs(pos) {
    pos = mod(pos, 12);
    if (pos === 0) return [0];
    const a = pos, b = pos - 12, out = [];
    [jOf(pos, 'auto'), a, b].forEach(function (j) { if (Math.abs(j) <= 7 && out.indexOf(j) < 0) out.push(j); });
    return out;
  }

  /** 調號：記號依序寫出來（最多 7 個符號；理論上的調某些字母是重升或重降） */
  function signature(j) {
    const n = Math.abs(j), sharp = j > 0;
    const order = sharp ? ['F', 'C', 'G', 'D', 'A', 'E', 'B'] : ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
    const marks = [];
    for (let i = 0; i < Math.min(n, 7); i++) {
      const cnt = 1 + (n >= i + 8 ? 1 : 0);
      marks.push({ letter: order[i], acc: sharp ? cnt : -cnt, name: order[i] + accText(sharp ? cnt : -cnt) });
    }
    // 依加上去的順序列出每一個記號（第 8 個以後是重升或重降）
    const added = [];
    for (let i = 0; i < n; i++) {
      const L = order[i % 7], cnt = Math.floor(i / 7) + 1;
      added.push(L + accText(sharp ? cnt : -cnt));
    }
    return { j: j, sharps: Math.max(0, j), flats: Math.max(0, -j), doubles: Math.max(0, n - 7), marks: marks, added: added, sharp: sharp && n > 0 };
  }
  /** 調號 j 的七個音（五度鏈位置 j − 1 … j + 5）的音高類別，由小到大 */
  function keyPcs(j) {
    const out = [];
    for (let q = j - 1; q <= j + 5; q++) out.push(mod(7 * q, 12));
    return out.sort(function (a, b) { return a - b; });
  }
  /** 調號 j 裡，字母 L 的音（例如 j = 2 時 F → F♯） */
  function letterNote(j, L) {
    const b = baseQ(L);
    const q = b + 7 * Math.floor((j + 5 - b) / 7);   // [j − 1, j + 5] 裡字母是 L 的那一個
    return noteAt(q);
  }
  const MAJOR_OFF = [0, 2, 4, -1, 1, 3, 5];     // 大調第 1–7 級在五度鏈上相對主音的位置
  const MINOR_OFF = [0, 2, -3, -1, 1, -4, -2];  // 自然小調
  const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_SEMIS = [0, 2, 3, 5, 7, 8, 10];
  /** 音階（第 1–7 級）：每個音的名字、音高類別、五度鏈位置 */
  function scale(j, mode) {
    const t = tonicQ(j, mode), off = mode === 'minor' ? MINOR_OFF : MAJOR_OFF;
    return off.map(function (o, i) { const n = noteAt(t + o); n.degree = i + 1; return n; });
  }
  /** 主三和弦（第 1、3、5 級）的音高類別 */
  function triad(j, mode) {
    const s = scale(j, mode);
    return [s[0].pc, s[2].pc, s[4].pc];
  }
  /** 關係調（同調號、另一種調式）與平行調（同主音、另一種調式） */
  function relative(j, mode) { return { j: j, mode: mode === 'minor' ? 'major' : 'minor' }; }
  function parallel(j, mode) { return mode === 'minor' ? { j: j + 3, mode: 'major' } : { j: j - 3, mode: 'minor' }; }
  /** 近關係調（五個）：屬調、下屬調、關係調、屬調的關係調、下屬調的關係調 */
  function nearKeys(j, mode) {
    const o = mode === 'minor' ? 'major' : 'minor';
    return [
      { j: j + 1, mode: mode, role: 'dominant' }, { j: j - 1, mode: mode, role: 'subdominant' }, { j: j, mode: o, role: 'relative' },
      { j: j + 1, mode: o, role: 'dominantRel' }, { j: j - 1, mode: o, role: 'subdominantRel' }
    ];
  }

  // ---------- 兩個調的比較 ----------
  /** 五度圈上的距離：j2 − j1 化到 −6 … 5（同名異音的兩個寫法距離 0） */
  function fifthDist(j1, j2) { return mod(j2 - j1 + 6, 12) - 6; }
  /** 共同音的音高類別 */
  function commonPcs(j1, j2) { const B = keyPcs(j2); return keyPcs(j1).filter(function (x) { return B.indexOf(x) >= 0; }); }
  /** 共同音數的公式（測試用來對照集合的計算）：7 − |d|，相距 6 時是 2 */
  function commonByDist(d) { d = Math.abs(fifthDist(0, d)); return d <= 5 ? 7 - d : 2; }
  /** 從調號 j1 轉到 j2，哪些字母要改（例如 C → G：F → F♯） */
  function changedNotes(j1, j2) {
    const out = [];
    ['C', 'D', 'E', 'F', 'G', 'A', 'B'].forEach(function (L) {
      const a = letterNote(j1, L), b = letterNote(j2, L);
      if (a.acc !== b.acc) out.push({ letter: L, from: a.name, to: b.name, fromPc: a.pc, toPc: b.pc });
    });
    return out;
  }
  /**
   * 同名異音的兩個調號（j1 與 j2 相差 12，七個音高完全相同）：依「音高」配對，只是換寫法（例如 F♯ → G♭、E♯ → F）。
   * 依目前的調（j1、m1）的音階順序，從主音開始列出。調號不是同一組音時傳回 []。
   */
  function respelledNotes(j1, m1, j2) {
    if (j1 === j2 || commonPcs(j1, j2).length !== 7) return [];
    const byPc = {};
    ['C', 'D', 'E', 'F', 'G', 'A', 'B'].forEach(function (L) { const n = letterNote(j2, L); byPc[n.pc] = n; });
    return scale(j1, m1).map(function (n) {
      const b = byPc[n.pc];
      return { letter: n.letter, toLetter: b.letter, from: n.name, to: b.name, fromPc: n.pc, toPc: b.pc };
    });
  }
  /**
   * 比較兩個調（k1 = 目前的調，k2 = 比較的調）。
   * changed：一般情況逐字母比較「要改的音」（C → G：F → F♯）；兩個調的音完全相同但寫法不同（同名異音）時是 []，
   * 改由 respell 列出依音高配對的換寫法（F♯ → G♭ …）。
   */
  function compare(j1, m1, j2, m2) {
    const cm = commonPcs(j1, j2), t1 = triad(j1, m1), t2 = triad(j2, m2);
    const tq1 = noteAt(tonicQ(j1, m1)), tq2 = noteAt(tonicQ(j2, m2));
    const respell = respelledNotes(j1, m1, j2);
    return {
      j: j2, mode: m2, label: keyLabel(j2, m2), tonicName: tq2.name, tonicPc: tq2.pc,
      common: cm.length, commonPcs: cm, changed: respell.length ? [] : changedNotes(j1, j2), respell: respell, d: fifthDist(j1, j2),
      sameSet: cm.length === 7, sameKey: j1 === j2 && m1 === m2,
      enharm: m1 === m2 && j1 !== j2 && tq1.pc === tq2.pc,
      sameTonic: tq1.pc === tq2.pc,
      triadCommon: t1.filter(function (x) { return t2.indexOf(x) >= 0; }).length
    };
  }
  /** 12 × 12 共同音表（大調；order = 'fifths' 依五度、'chrom' 依半音）：rows[i][k] = 第 i 個調與第 k 個調的共同音數 */
  function heatKeys(order) {
    const out = [];
    for (let i = 0; i < 12; i++) {
      // 依半音：主音 pc = i，調號 j ≡ 7i (mod 12)；依五度：調號 j ≡ i
      const pos = order === 'chrom' ? mod(7 * i, 12) : i;
      out.push(jOf(pos, 'auto'));
    }
    return out;
  }
  function heatTable(order) {
    const ks = heatKeys(order);
    return ks.map(function (a) { return ks.map(function (b) { return commonPcs(a, b).length; }); });
  }

  // ---------- 乘 k ----------
  /** 乘 k 的循環分解：從 c = 0 … g − 1 出發，每次加 k，走回起點；傳回 g 個圈 */
  function cycles(k) {
    k = mod(Math.round(k), 12);
    const g = gcd(k, 12) || 12, len = 12 / g, out = [];
    for (let c = 0; c < g; c++) {
      const cyc = [];
      for (let i = 0; i < len; i++) cyc.push(mod(c + i * k, 12));
      out.push(cyc);
    }
    return out;
  }
  /** 從 start 開始的乘 k 序列：start, start + k, … 走回 start（含最後回到起點的那一個） */
  function kSequence(start, k) {
    k = mod(Math.round(k), 12);
    const g = gcd(k, 12) || 12, len = 12 / g, out = [];
    for (let i = 0; i <= len; i++) out.push(mod(start + i * k, 12));
    return out;
  }
  function isUnit(a) { return gcd(a, 12) === 1; }
  /** 重排：音高類別 n 在第幾格 */
  function slotOf(n, a) { return mod(a * n, 12); }
  /** 在排列 a 上，「加 k 個半音」的一步跨幾格 */
  function slotStep(a, k) { return mod(a * k, 12); }
  const ARRANGE = { 1: ['半音圈', 'chromatic circle'], 5: ['四度圈', 'circle of fourths'], 7: ['五度圈', 'circle of fifths'], 11: ['倒過來的半音圈', 'reversed chromatic circle'] };

  // ---------- 頻率與播放用的音 ----------
  const TONIC_MIDI0 = 60;   // 主音放在 C4–B4
  function freq(midi) { return MT.midiToFreq(midi); }
  /** 主音的 MIDI 編號（C4–B4） */
  function tonicMidi(j, mode) { return TONIC_MIDI0 + noteAt(tonicQ(j, mode)).pc; }
  /** 上行音階的 MIDI 編號（8 個音，含高八度主音） */
  function scaleMidis(j, mode) {
    const t = tonicMidi(j, mode), s = mode === 'minor' ? MINOR_SEMIS : MAJOR_SEMIS;
    return s.map(function (x) { return t + x; }).concat([t + 12]);
  }
  /**
   * 調裡第 deg 級（1–7）的和弦（原位三和弦）：根音放在 G3–F♯4，另加低八度的根音。
   * 小調的屬和弦（第 5 級）用和聲小調的大三和弦（升高第 7 級，古典音樂的慣例）。
   */
  function chord(j, mode, deg) {
    const s = scale(j, mode);
    const pick = function (i) { return s[(deg - 1 + i) % 7].pc; };
    let pcs = [pick(0), pick(2), pick(4)];
    if (mode === 'minor' && deg === 5) pcs[1] = mod(pcs[1] + 1, 12);
    const root = 55 + mod(pcs[0] - 7, 12);
    const mids = [root - 12, root];
    let prev = root;
    for (let i = 1; i < 3; i++) { let m = root + mod(pcs[i] - pcs[0], 12); if (m <= prev) m += 12; mids.push(m); prev = m; }
    return { deg: deg, pcs: pcs, midis: mids };
  }
  /** 終止式 I–IV–V–I（小調 i–iv–V–i） */
  function cadence(j, mode) { return [1, 4, 5, 1].map(function (d) { return Object.assign({ key: 1 }, chord(j, mode, d)); }); }
  /** 轉調示範：第一個調的 I–IV–V–I，接第二個調的 IV–V–I（直接轉調） */
  function modulation(j1, m1, j2, m2) {
    return [1, 4, 5, 1].map(function (d) { return Object.assign({ key: 1 }, chord(j1, m1, d)); })
      .concat([4, 5, 1].map(function (d) { return Object.assign({ key: 2 }, chord(j2, m2, d)); }));
  }
  /** 乘 k 序列的 MIDI 編號：從主音開始，每個音都放在主音到高八度之間 */
  function kMidis(startPc, k) {
    const base = TONIC_MIDI0 + mod(startPc, 12);
    return kSequence(startPc, k).map(function (pc, i, arr) { return base + mod(pc - startPc, 12) + (i === arr.length - 1 ? 12 : 0); });
  }
  /** 音高類別的名字：跟著調的方向（調號 ≥ 0 用升記號、< 0 用降記號）；在調裡就用調的拼法 */
  function pcName(pc, j) {
    pc = mod(pc, 12);
    for (let q = j - 1; q <= j + 5; q++) if (mod(7 * q, 12) === pc) return noteAt(q).name;
    return (j >= 0 ? MT.SHARP_NAMES : MT.FLAT_NAMES)[pc];
  }

  // ---------- 3D：調號螺旋 ----------
  /** 螺旋上的位置：角度 = 五度圈格子（30° 一格），高度 = 調號 j（升記號往上、降記號往下）；同名異音在同一條直線上，相差 12 層 */
  function helix(j, mode, h) {
    return { angle: mod(j, 12) / 12 * 2 * Math.PI, turn: j / 12, y: j * (h == null ? 1 : h), r: mode === 'minor' ? 0.68 : 1 };
  }

  // ---------- 全部的分析（頁面讀數與任務事件共用） ----------
  /**
   * st = { pos（0–11）, spell（'auto'|'sharp'|'flat'）, mode, target（{ j, mode } 或 null）, k（1–11）, a（排列：1、5、7、11） }
   */
  function analyze(st) {
    const pos = mod(Math.round(st.pos || 0), 12), spell = st.spell || 'auto', mode = st.mode === 'minor' ? 'minor' : 'major';
    const j = jOf(pos, spell), sig = signature(j), sc = scale(j, mode), tn = noteAt(tonicQ(j, mode));
    const rel = relative(j, mode), par = parallel(j, mode);
    const k = Math.max(1, Math.min(11, Math.round(st.k || 7))), a = isUnit(st.a) ? mod(st.a, 12) : 1;
    const cyc = cycles(k);
    const out = {
      pos: pos, j: j, mode: mode, spell: spell, tonicPc: tn.pc, tonicName: tn.name, label: keyLabel(j, mode),
      sharps: sig.sharps, flats: sig.flats, doubles: sig.doubles, sig: sig, accCount: Math.abs(j),
      notes: sc, names: sc.map(function (n) { return n.name; }), pcs: keyPcs(j), triad: triad(j, mode),
      rel: { j: rel.j, mode: rel.mode, label: keyLabel(rel.j, rel.mode) },
      par: { j: par.j, mode: par.mode, label: keyLabel(par.j, par.mode) },
      near: nearKeys(j, mode).map(function (x) { return { j: x.j, mode: x.mode, role: x.role, label: keyLabel(x.j, x.mode) }; }),
      theoretical: Math.abs(j) > 7,
      k: k, g: cyc.length, len: 12 / cyc.length, cycles: cyc, a: a, slotStep: slotStep(a, k),
      t: null
    };
    if (st.target && typeof st.target.j === 'number') out.t = compare(j, mode, st.target.j, st.target.mode === 'minor' ? 'minor' : 'major');
    return out;
  }

  /**
   * 任務事件的資料（js/circle-of-fifths.js 送出的，與 tools/mission-proofs/circle-of-fifths.js 用的完全相同）：
   * 分析結果去掉音表與圈的細節，再加上 extra（src、run、what、heat…）。
   */
  function eventData(A, extra) {
    const d = {
      pos: A.pos, j: A.j, mode: A.mode, spell: A.spell, tonicPc: A.tonicPc, tonicName: A.tonicName, label: A.label,
      sharps: A.sharps, flats: A.flats, doubles: A.doubles, accCount: A.accCount, theoretical: A.theoretical,
      names: A.names.slice(), sigNames: A.sig.marks.map(function (m) { return m.name; }),
      k: A.k, g: A.g, len: A.len, a: A.a, slotStep: A.slotStep,
      t: A.t ? { j: A.t.j, mode: A.t.mode, label: A.t.label, tonicPc: A.t.tonicPc, common: A.t.common, d: A.t.d, sameSet: A.t.sameSet,
        sameKey: A.t.sameKey, enharm: A.t.enharm, sameTonic: A.t.sameTonic, triadCommon: A.t.triadCommon, changed: A.t.changed.length, respell: A.t.respell.length } : null
    };
    if (extra) for (const key in extra) d[key] = extra[key];
    return d;
  }

  return {
    mod: mod, gcd: gcd, FIFTH_LETTERS: FIFTH_LETTERS, LETTER_STEP: LETTER_STEP, accText: accText, noteAt: noteAt, baseQ: baseQ,
    MODES: MODES, tonicQ: tonicQ, keyLabel: keyLabel, posOf: posOf, jOf: jOf, enharmonicPos: enharmonicPos, standardJs: standardJs,
    signature: signature, keyPcs: keyPcs, letterNote: letterNote, scale: scale, triad: triad, relative: relative, parallel: parallel, nearKeys: nearKeys,
    MAJOR_SEMIS: MAJOR_SEMIS, MINOR_SEMIS: MINOR_SEMIS,
    fifthDist: fifthDist, commonPcs: commonPcs, commonByDist: commonByDist, changedNotes: changedNotes, respelledNotes: respelledNotes, compare: compare, heatKeys: heatKeys, heatTable: heatTable,
    cycles: cycles, kSequence: kSequence, isUnit: isUnit, slotOf: slotOf, slotStep: slotStep, ARRANGE: ARRANGE,
    TONIC_MIDI0: TONIC_MIDI0, freq: freq, tonicMidi: tonicMidi, scaleMidis: scaleMidis, chord: chord, cadence: cadence, modulation: modulation, kMidis: kMidis, pcName: pcName,
    helix: helix, analyze: analyze, eventData: eventData
  };
}));
