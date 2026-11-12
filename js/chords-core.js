/*
 * chords-core.js — 「和弦的頻率比」的數學核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   十種和弦（大三、小三、減三、增三、掛四、屬七、大七、小七、減七、自然七度）：
 *     十二平均律的半音數，與純律版本的整數比（大三 4:5:6、小三 10:12:15、屬七 20:25:30:36、自然七度 4:5:6:7……）。
 *     純律版本的規則：大三、小三、掛四與七和弦用「和根音的純音程」（5/4、6/5、4/3、3/2、15/8、9/5、7/4）；
 *     減三、增三、減七是把純小三度 6/5 或純大三度 5/4 疊起來（所以數字會很大）。
 *   轉位（最低的幾個音升高八度）、個別音的開關。
 *   週期：純律時每個音 = 單位頻率 × 整數，整數的最大公因數決定「虛擬基頻」f_v，合成波形的週期 T = 1 / f_v。
 *   平均律：頻率比是無理數，波形永遠不會完全重複；算出「純律週期那一刻錯開幾度」（drift）與「最接近重複」的時刻。
 *   和弦進行：I–IV–V–I、I–vi–IV–V、I–vi–ii–V–I；三種音律：十二平均律、純律（固定音階）、
 *     純律（共同音不動：每個和弦都唱純，和前一個和弦共有的音頻率不變，像合唱團）——最後一種在 I–vi–ii–V–I 會往下漂一個同音差。
 *
 * 用法：瀏覽器 window.ChordsCore；Node require('./chords-core.js')（會自動載入 music-theory.js）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.ChordsCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const cents = function (r) { return 1200 * Math.log2(r); };
  const mod = function (a, n) { return ((a % n) + n) % n; };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  // ---------- 分數（[分子, 分母]，都是正整數） ----------
  function fr(p, q) {
    q = q == null ? 1 : q;
    const g = MT.gcd(p, q) || 1;
    return [Math.round(p / g), Math.round(q / g)];
  }
  function fmul(a, b) { return fr(a[0] * b[0], a[1] * b[1]); }
  function fdiv(a, b) { return fr(a[0] * b[1], a[1] * b[0]); }
  function fval(a) { return a[0] / a[1]; }
  function fpow2(a, k) { return k >= 0 ? fr(a[0] * Math.pow(2, k), a[1]) : fr(a[0], a[1] * Math.pow(2, -k)); }

  /**
   * 十種和弦。semis：十二平均律相對根音的半音數；just：純律版本的整數比（第一個是根音）；roles：根音、三音（掛四是四音）、五音、七音。
   */
  const CHORDS = {
    major: { zh: '大三和弦', short: '大三', en: 'Major triad', enShort: 'Major', sym: '', semis: [0, 4, 7], just: [4, 5, 6], roles: ['R', '3', '5'] },
    minor: { zh: '小三和弦', short: '小三', en: 'Minor triad', enShort: 'Minor', sym: 'm', semis: [0, 3, 7], just: [10, 12, 15], roles: ['R', '3', '5'] },
    dim: { zh: '減三和弦', short: '減三', en: 'Diminished triad', enShort: 'Diminished', sym: 'dim', semis: [0, 3, 6], just: [25, 30, 36], roles: ['R', '3', '5'] },
    aug: { zh: '增三和弦', short: '增三', en: 'Augmented triad', enShort: 'Augmented', sym: 'aug', semis: [0, 4, 8], just: [16, 20, 25], roles: ['R', '3', '5'] },
    sus4: { zh: '掛四和弦', short: '掛四', en: 'Suspended fourth', enShort: 'Sus4', sym: 'sus4', semis: [0, 5, 7], just: [6, 8, 9], roles: ['R', '4', '5'] },
    dom7: { zh: '屬七和弦', short: '屬七', en: 'Dominant seventh', enShort: 'Dominant 7th', sym: '7', semis: [0, 4, 7, 10], just: [20, 25, 30, 36], roles: ['R', '3', '5', '7'] },
    maj7: { zh: '大七和弦', short: '大七', en: 'Major seventh', enShort: 'Major 7th', sym: 'maj7', semis: [0, 4, 7, 11], just: [8, 10, 12, 15], roles: ['R', '3', '5', '7'] },
    min7: { zh: '小七和弦', short: '小七', en: 'Minor seventh', enShort: 'Minor 7th', sym: 'm7', semis: [0, 3, 7, 10], just: [10, 12, 15, 18], roles: ['R', '3', '5', '7'] },
    dim7: { zh: '減七和弦', short: '減七', en: 'Diminished seventh', enShort: 'Diminished 7th', sym: 'dim7', semis: [0, 3, 6, 9], just: [125, 150, 180, 216], roles: ['R', '3', '5', '7'] },
    nat7: { zh: '自然七度和弦', short: '自然七度', en: 'Harmonic seventh chord', enShort: 'Harmonic 7th', sym: '7', semis: [0, 4, 7, 10], just: [4, 5, 6, 7], roles: ['R', '3', '5', '7'] }
  };
  const ORDER = ['major', 'minor', 'dim', 'aug', 'sus4', 'dom7', 'maj7', 'min7', 'dim7', 'nat7'];
  const TRIADS = ORDER.filter(function (k) { return CHORDS[k].semis.length === 3; });
  const ROLE_NAMES = { R: ['根音', 'Root'], '3': ['三音', 'Third'], '4': ['四音', 'Fourth'], '5': ['五音', 'Fifth'], '7': ['七音', 'Seventh'] };
  const ROOT_LO = 48, ROOT_HI = 72;       // 根音 C3–C5
  const ROOT_DEFAULT = 60;
  const SPAN_MIN = 2, SPAN_MAX = 1000;    // 顯示的時間（ms）
  const SPAN_DEFAULT = 40;
  const NEAR_K = 100;                     // 平均律「最接近重複」找到第幾個低音週期為止
  /** 兩種音色：風琴（前 6 個泛音，近似）與純音 */
  const TIMBRES = { organ: [1, 0.55, 0.34, 0.22, 0.14, 0.09], pure: [1] };

  /** 對數滑桿：位置 0–1000 ↔ 2–1000 ms */
  function spanFromPos(p) { return SPAN_MIN * Math.pow(SPAN_MAX / SPAN_MIN, clamp(p, 0, 1000) / 1000); }
  function posFromSpan(v) { return 1000 * Math.log(clamp(v, SPAN_MIN, SPAN_MAX) / SPAN_MIN) / Math.log(SPAN_MAX / SPAN_MIN); }

  function noteName(m) { return MT.noteName(m); }

  // ---------- 音名拼法：依和弦的字母（例如 C 減七 = C、E♭、G♭、B♭♭；E 增三 = E、G♯、B♯） ----------
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
  /** 黑鍵當根音或主音時的拼法：D♭、E♭、F♯、A♭、B♭（[字母, 升降]） */
  const ROOT_SPELL = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [3, 1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
  const ROLE_STEP = { R: 0, '3': 2, '4': 3, '5': 4, '7': 6 };
  const DEG_STEP = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
  /** 用指定的字母（0 = C … 6 = B，可超過 6）拼出 MIDI 音 m 的名字；octave === false 時不加八度 */
  function spellAt(m, letter, octave) {
    const L = mod(letter, 7);
    let acc = mod(m, 12) - LETTER_PC[L];
    if (acc > 6) acc -= 12;
    if (acc < -6) acc += 12;
    const name = LETTERS[L] + (acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc));
    return octave === false ? name : name + (Math.floor((m - acc) / 12) - 1);
  }
  function rootLetter(m) { return ROOT_SPELL[mod(m, 12)][0]; }
  function spellRoot(m, octave) { return spellAt(m, rootLetter(m), octave); }

  // ---------- 一組頻率的週期（每個頻率都是 F × 分數） ----------
  /**
   * fracs：每個音相對參考頻率 F 的分數（由低到高）。傳回
   *   n：通分後的整數、g：最大公因數、ints：約分後的整數比、unit：F / 公分母、fv：虛擬基頻 = unit × g、T = 1 / fv。
   */
  function periodOf(fracs, F) {
    if (!fracs.length) return null;
    const L = MT.lcmList(fracs.map(function (a) { return a[1]; }));
    const n = fracs.map(function (a) { return Math.round(a[0] * L / a[1]); });
    const g = MT.gcdList(n);
    const ints = n.map(function (x) { return x / g; });
    const fv = F * g / L;
    return { ints: ints, fv: fv, T: 1 / fv, n: n, g: g, L: L };
  }

  // ---------- 一個和弦的音 ----------
  /**
   * 和弦的每個音（依音高由低到高）。轉位 inv：根位置時最低的 inv 個音升高八度。
   * 每個音：i（第幾個和弦音，0 = 根音）、role、midi、fracJ（純律，相對根音的分數）、rJ、rE（平均律比）、f（目前音律的頻率）。
   */
  function chordTones(type, root, tuning, inv) {
    const c = CHORDS[type] || CHORDS.major, n = c.semis.length;
    inv = clamp(inv | 0, 0, n - 1);
    const f0 = MT.midiToFreq(root);
    return c.semis.map(function (s, i) {
      const up = i < inv ? 1 : 0;
      const fracJ = fr(c.just[i] * (up ? 2 : 1), c.just[0]);
      const rJ = fval(fracJ), rE = Math.pow(2, (s + 12 * up) / 12);
      return {
        i: i, role: c.roles[i], midi: root + s + 12 * up, semis: s + 12 * up, fracJ: fracJ, rJ: rJ, rE: rE,
        name: spellAt(root + s + 12 * up, rootLetter(root) + ROLE_STEP[c.roles[i]]),
        fJ: f0 * rJ, fE: f0 * rE, f: tuning === 'just' ? f0 * rJ : f0 * rE
      };
    }).sort(function (a, b) { return a.rE - b.rE; });
  }

  /** 平均律：第 k 個低音週期時，每個音離整數個週期最遠差多少（0–0.5 週） */
  function phaseErr(ratios, k, ints) {
    let e = 0;
    for (let i = 1; i < ratios.length; i++) {
      const x = k * ratios[i];
      const d = ints ? Math.abs(x - ints[i]) : Math.abs(x - Math.round(x));
      e = Math.max(e, d);
    }
    return e;
  }

  /**
   * 分析一個和弦。o = { type, root（MIDI）, tuning（'just' | 'equal'）, inv（0–3）, on（每個和弦音開或關，依 0 = 根音…的順序） }
   * 傳回（數值單位：Hz、秒、音分、度）：
   *   tones（全部和弦音，含開關）、act（開著的音，由低到高）、count、n、full（全部開著）、bassRole、
   *   ints（純律時約分後的整數比；平均律為 null）、intsJ（同樣的音用純律時的整數比）、
   *   T、fv（純律才有）、TJ、fvJ（純律版本的週期與虛擬基頻）、perRoot（T 是根音週期的幾倍）、
   *   fullJ（全部和弦音都開、純律時的 { ints, T }）、
   *   drift（平均律在純律週期那一刻錯開的角度；純律為 0）、near（平均律最接近重複的 { k, t, deg }）、
   *   gaps（相鄰兩音相差幾音分）、wrap（最高音到「最低音高八度」還差幾音分）、
   *   devs（每個開著的音：平均律 − 純律的音分）、maxDev（絕對值最大的那一個，帶正負號）、maxDevRole。
   */
  function analyze(o) {
    const type = CHORDS[o.type] ? o.type : 'major';
    const c = CHORDS[type], n = c.semis.length;
    const root = clamp(Math.round(o.root == null ? ROOT_DEFAULT : o.root), ROOT_LO, ROOT_HI);
    const tuning = o.tuning === 'just' ? 'just' : 'equal';
    const inv = clamp((o.inv | 0), 0, n - 1);
    const on = [];
    for (let i = 0; i < n; i++) on.push(!(o.on && o.on[i] === false));
    const f0 = MT.midiToFreq(root);
    const tones = chordTones(type, root, tuning, inv);
    tones.forEach(function (t) { t.on = on[t.i]; });
    const act = tones.filter(function (t) { return t.on; });
    const a = {
      type: type, root: root, tuning: tuning, inv: inv, on: on, n: n, count: act.length, full: act.length === n,
      f0: f0, tones: tones, act: act,
      bass: act.length ? act[0].midi : null, bassRole: act.length ? act[0].role : null,
      ints: null, intsJ: null, T: null, fv: null, TJ: null, fvJ: null, perRoot: null, perRootJ: null,
      fullJ: null, drift: 0, near: null, gaps: [], wrap: null, devs: [], maxDev: 0, maxDevRole: null
    };
    if (!act.length) return a;
    const pJ = periodOf(act.map(function (t) { return t.fracJ; }), f0);
    const pFull = periodOf(tones.map(function (t) { return t.fracJ; }), f0);
    a.intsJ = pJ.ints; a.TJ = pJ.T; a.fvJ = pJ.fv; a.perRootJ = pJ.T * f0;
    a.fullJ = { ints: pFull.ints, T: pFull.T, fv: pFull.fv };
    if (tuning === 'just') { a.ints = pJ.ints; a.T = pJ.T; a.fv = pJ.fv; a.perRoot = a.perRootJ; }
    // 相鄰音的距離、到八度的缺口
    for (let i = 1; i < act.length; i++) a.gaps.push(cents(act[i].f / act[i - 1].f));
    if (act.length >= 2) a.wrap = 1200 - cents(act[act.length - 1].f / act[0].f);
    // 平均律與純律的差
    act.forEach(function (t) {
      const d = cents(t.rE) - cents(t.rJ);
      a.devs.push(d);
      if (Math.abs(d) > Math.abs(a.maxDev) + 1e-12) { a.maxDev = d; a.maxDevRole = t.role; }
    });
    // 平均律的漂移與最接近重複
    if (act.length >= 2) {
      const ratios = act.map(function (t) { return t.f / act[0].f; });
      const fb = act[0].f;
      if (tuning === 'equal') {
        const k = pJ.ints[0];
        a.drift = phaseErr(ratios, k, pJ.ints) * 360;
        let best = { k: 1, e: Infinity };
        for (let kk = 1; kk <= NEAR_K; kk++) {
          const e = phaseErr(ratios, kk, null);
          if (e < best.e - 1e-12) best = { k: kk, e: e };
        }
        a.near = { k: best.k, t: best.k / fb, deg: best.e * 360 };
      } else {
        a.near = { k: pJ.ints[0], t: pJ.T, deg: 0 };
      }
    }
    return a;
  }

  /** 合成波形（每個音用同樣的音色泛音 partials），t 單位秒 */
  function waveAt(freqs, partials, t) {
    let s = 0;
    for (let i = 0; i < freqs.length; i++) {
      const w = 2 * Math.PI * freqs[i] * t;
      for (let k = 0; k < partials.length; k++) s += partials[k] * Math.sin((k + 1) * w);
    }
    return s;
  }
  /** 合成波形的峰值（取樣估計，給畫面縮放用） */
  function wavePeak(freqs, partials, T) {
    let m = 0;
    const top = Math.max.apply(null, freqs) * partials.length;
    const N = Math.min(20000, Math.max(400, Math.ceil(T * top * 12)));
    for (let j = 0; j <= N; j++) m = Math.max(m, Math.abs(waveAt(freqs, partials, T * j / N)));
    return m || 1;
  }

  /** 虛擬基頻最接近的音名與差幾音分 */
  function nearestNote(f) {
    const m = MT.freqToMidi(f), r = Math.round(m);
    return { midi: r, name: noteName(r), off: (m - r) * 100 };
  }

  /** 給任務用的事件資料（只有數字、字串、陣列，和 tools/mission-proofs/chords.js 用的相同） */
  function payload(a, extra) {
    const r4 = function (v) { return v == null ? null : Math.round(v * 1e6) / 1e6; };
    const r9 = function (v) { return v == null ? null : Math.round(v * 1e9) / 1e9; };   // 週期（秒）多留幾位
    const out = {
      type: a.type, root: a.root, tuning: a.tuning, inv: a.inv, on: a.on.slice(), n: a.n, count: a.count, full: a.full,
      bassRole: a.bassRole, roles: a.act.map(function (t) { return t.role; }),
      freqs: a.act.map(function (t) { return r4(t.f); }), midis: a.act.map(function (t) { return t.midi; }),
      ints: a.ints ? a.ints.slice() : null, intsJ: a.intsJ ? a.intsJ.slice() : null,
      T: r9(a.T), TJ: r9(a.TJ), fv: r4(a.fv), fvJ: r4(a.fvJ), perRoot: r4(a.perRoot), perRootJ: r4(a.perRootJ),
      fullInts: a.fullJ ? a.fullJ.ints.slice() : null, fullT: a.fullJ ? r9(a.fullJ.T) : null,
      drift: r4(a.drift), nearK: a.near ? a.near.k : null, nearDeg: a.near ? r4(a.near.deg) : null,
      gaps: a.gaps.map(r4), wrap: r4(a.wrap), maxDev: r4(a.maxDev), maxDevRole: a.maxDevRole
    };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  // =====================================================================
  // 和弦進行
  // =====================================================================
  const QUAL = { major: { semis: [0, 4, 7], rel: [[1, 1], [5, 4], [3, 2]] }, minor: { semis: [0, 3, 7], rel: [[1, 1], [6, 5], [3, 2]] } };
  const PROGS = {
    'I-IV-V-I': [{ deg: 0, q: 'major', roman: 'I' }, { deg: 5, q: 'major', roman: 'IV' }, { deg: 7, q: 'major', roman: 'V' }, { deg: 0, q: 'major', roman: 'I' }],
    'I-vi-IV-V': [{ deg: 0, q: 'major', roman: 'I' }, { deg: 9, q: 'minor', roman: 'vi' }, { deg: 5, q: 'major', roman: 'IV' }, { deg: 7, q: 'major', roman: 'V' }],
    'I-vi-ii-V-I': [{ deg: 0, q: 'major', roman: 'I' }, { deg: 9, q: 'minor', roman: 'vi' }, { deg: 2, q: 'minor', roman: 'ii' }, { deg: 7, q: 'major', roman: 'V' }, { deg: 0, q: 'major', roman: 'I' }]
  };
  const PROG_ORDER = ['I-IV-V-I', 'I-vi-IV-V', 'I-vi-ii-V-I'];
  const PMODES = ['equal', 'just', 'adaptive'];
  /** 純律音階（主音上方第 i 個半音，相對主音的分數；5 限純律，和 music-theory.js 相同） */
  function scaleFrac(semis) {
    const r = MT.JUST_RATIOS[mod(semis, 12)];
    return fpow2(fr(r[0], r[1]), Math.floor(semis / 12));
  }

  /** 四聲部的排法：低音 = 和弦根音（主音下方 6–17 個半音之間）；上面三個聲部從主和弦原位開始，每次選移動最少的排法 */
  const BASS_MIN = 33;   // A1 = 55 Hz
  function voiceProg(id, tonic) {
    const steps = PROGS[id] || PROGS['I-IV-V-I'];
    let prev = null;
    const center = tonic + 3.5;
    return steps.map(function (st) {
      const qs = QUAL[st.q].semis, rootM = tonic + st.deg;
      let upper;
      if (!prev) upper = qs.map(function (s) { return rootM + s; });
      else {
        let best = null;
        for (let inv = 0; inv < 3; inv++) for (let o = -1; o <= 1; o++) {
          const cand = qs.map(function (s, i) { return rootM + s + 12 * o + (i < inv ? 12 : 0); }).sort(function (a, b) { return a - b; });
          if (cand[0] < tonic - 7 || cand[2] > tonic + 19) continue;
          let d = 0;
          for (let i = 0; i < 3; i++) d += Math.abs(cand[i] - prev[i]);
          const mean = (cand[0] + cand[1] + cand[2]) / 3;
          const score = d + Math.abs(mean - center) * 1e-3;
          if (!best || score < best.score - 1e-9) best = { cand: cand, score: score };
        }
        upper = best.cand;
      }
      prev = upper;
      let bass = rootM - 12;
      while (bass > tonic - 6) bass -= 12;
      while (bass < tonic - 17) bass += 12;
      while (bass < BASS_MIN) bass += 12;   // 低音不低於 A1 = 55 Hz
      return { st: st, bass: bass, upper: upper };
    });
  }

  /**
   * 和弦進行的每個和弦。mode：'equal' 十二平均律、'just' 純律（固定音階）、'adaptive' 純律（共同音不動）。
   * 每個和弦：roman、q、deg、name、notes（[{ midi, f, frac（相對主音；平均律為 null）, role }]，由低到高）、
   *   tri（根音、三音、五音排成原位的整數比；平均律為 null）、pure（tri 是 4:5:6 或 10:12:15）、
   *   period（四個聲部一起的週期分析）、commonPrev、commonNext（和前、後一個和弦共有幾個音名）、commonPcs、
   *   rootCents（這個和弦的根音比固定音階高或低幾音分；只有「共同音不動」會不是 0）。
   * drift：最後一個和弦的根音比固定音階高或低幾音分。
   */
  function progression(id, tonic, mode) {
    id = PROGS[id] ? id : 'I-IV-V-I';
    mode = PMODES.indexOf(mode) >= 0 ? mode : 'equal';
    tonic = clamp(Math.round(tonic == null ? ROOT_DEFAULT : tonic), ROOT_LO, ROOT_HI);
    const F = MT.midiToFreq(tonic);
    const voiced = voiceProg(id, tonic);
    const pcsOf = function (st) { return QUAL[st.q].semis.map(function (s) { return mod(st.deg + s, 12); }); };
    let prevRoot = null, prevPcFrac = null, prevDeg = null, prevPcs = null;
    const chords = voiced.map(function (v, k) {
      const st = v.st, qd = QUAL[st.q];
      const pcs = pcsOf(st);
      // 根音（在主音上方 deg 個半音的那個八度）的分數
      let rootFrac = null;
      if (mode === 'just') rootFrac = scaleFrac(st.deg);
      else if (mode === 'adaptive') {
        if (k === 0) rootFrac = scaleFrac(st.deg);
        else {
          let anchor = -1;
          for (let i = 0; i < 3 && anchor < 0; i++) if (prevPcs.indexOf(pcs[i]) >= 0) anchor = i;
          if (anchor >= 0) {
            const s = st.deg + qd.semis[anchor];
            const relN = fpow2(fr(qd.rel[anchor][0], qd.rel[anchor][1]), -Math.floor(s / 12));
            rootFrac = fdiv(prevPcFrac[pcs[anchor]], relN);
          } else {
            const i = mod(st.deg - prevDeg, 12), r = MT.JUST_RATIOS[i];
            rootFrac = fmul(prevRoot, fr(r[0], r[1]));
            if (prevDeg + i >= 12) rootFrac = fpow2(rootFrac, -1);
          }
        }
      }
      // 每個聲部
      const roleOf = function (m) { const s = mod(m - (tonic + st.deg), 12); return qd.semis.indexOf(s); };
      const cl = rootLetter(tonic) + DEG_STEP[st.deg];   // 這個和弦根音的字母
      const mk = function (m, isBass) {
        const ri = roleOf(m);
        let frac = null, f;
        if (mode === 'just') {
          // 固定音階：每個音都照主音的純律音階，不管它在這個和弦裡是什麼角色
          frac = scaleFrac(m - tonic);
          f = F * fval(frac);
        } else if (rootFrac) {
          const s = qd.semis[ri];
          const oct = Math.round((m - (tonic + st.deg + s)) / 12);
          frac = fpow2(fmul(rootFrac, fr(qd.rel[ri][0], qd.rel[ri][1])), oct);
          f = F * fval(frac);
        } else f = MT.midiToFreq(m);
        return { midi: m, f: f, frac: frac, role: ['R', '3', '5'][ri], bass: !!isBass, name: spellAt(m, cl + [0, 2, 4][ri]) };
      };
      const notes = [mk(v.bass, true)].concat(v.upper.map(function (m) { return mk(m, false); }));
      // 這個和弦裡每個音名的分數（拉回主音上方的八度），給下一個和弦找共同音
      const pcFrac = {};
      if (rootFrac) pcs.forEach(function (pc, i) {
        const s = st.deg + qd.semis[i];
        pcFrac[pc] = fpow2(fmul(rootFrac, fr(qd.rel[i][0], qd.rel[i][1])), -Math.floor(s / 12));
      });
      let tri = null, pure = false;
      if (rootFrac) {
        const triFracs = mode === 'just'
          ? qd.semis.map(function (s) { return scaleFrac(st.deg + s); })
          : qd.rel.map(function (x) { return fmul(rootFrac, fr(x[0], x[1])); });
        const p = periodOf(triFracs, F);
        tri = p.ints;
        const key = tri.join(':');
        pure = key === '4:5:6' || key === '10:12:15';
      }
      const period = rootFrac ? periodOf(notes.map(function (x) { return x.frac; }), F) : null;
      const rootCents = rootFrac ? cents(fval(rootFrac) / fval(scaleFrac(st.deg))) : 0;
      const common = prevPcs ? pcs.filter(function (pc) { return prevPcs.indexOf(pc) >= 0; }) : [];
      prevPcs = pcs; prevPcFrac = pcFrac; prevRoot = rootFrac; prevDeg = st.deg;
      const nameRoot = spellAt(tonic + st.deg, rootLetter(tonic) + DEG_STEP[st.deg], false);
      return {
        idx: k, roman: st.roman, q: st.q, deg: st.deg, name: nameRoot + (st.q === 'minor' ? 'm' : ''),
        notes: notes, tri: tri, pure: pure, period: period, rootCents: rootCents,
        commonPcs: common, commonPrev: k ? common.length : null, commonNext: null
      };
    });
    for (let k = 0; k + 1 < chords.length; k++) chords[k].commonNext = chords[k + 1].commonPrev;
    return { id: id, mode: mode, tonic: tonic, F: F, chords: chords, drift: chords[chords.length - 1].rootCents };
  }

  /** 和弦進行給任務用的事件資料 */
  function progPayload(p, extra) {
    const r6 = function (v) { return v == null ? null : Math.round(v * 1e6) / 1e6; };
    const out = {
      prog: p.id, mode: p.mode, tonic: p.tonic, n: p.chords.length, drift: r6(p.drift),
      chords: p.chords.map(function (c) {
        return { roman: c.roman, q: c.q, pure: c.pure, tri: c.tri ? c.tri.slice() : null, commonPrev: c.commonPrev, commonNext: c.commonNext, rootCents: r6(c.rootCents) };
      })
    };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  /** 點和弦進行清單裡第 idx 個和弦時的任務資料 */
  function pickPayload(p, idx) {
    const c = p.chords[idx], r6 = function (v) { return v == null ? null : Math.round(v * 1e6) / 1e6; };
    return {
      prog: p.id, mode: p.mode, tonic: p.tonic, idx: idx, roman: c.roman, q: c.q, pure: c.pure, tri: c.tri ? c.tri.slice() : null,
      commonPrev: c.commonPrev, commonNext: c.commonNext, rootCents: r6(c.rootCents), drift: r6(p.drift)
    };
  }

  /** 3D「讓曲線長出來」的任務資料：span（ms）、loops（畫了幾個純律週期）、closed（純律且至少兩個音：曲線閉合） */
  function growPayload(a, span) {
    return payload(a, { span: span, loops: a.TJ ? Math.round(span / 1000 / a.TJ * 1000) / 1000 : null, closed: a.tuning === 'just' && a.count >= 2 });
  }

  /** 三維李薩如曲線上的一點：x、y、z = 最低三個音的 sin(2π f t)；第四個音（若有）當顏色參數 w */
  function lissajous(freqs, t) {
    const s = function (i) { return i < freqs.length ? Math.sin(2 * Math.PI * freqs[i] * t) : 0; };
    return { x: s(0), y: s(1), z: s(2), w: freqs.length > 3 ? s(3) : null };
  }

  return {
    CHORDS: CHORDS, ORDER: ORDER, TRIADS: TRIADS, ROLE_NAMES: ROLE_NAMES,
    ROOT_LO: ROOT_LO, ROOT_HI: ROOT_HI, ROOT_DEFAULT: ROOT_DEFAULT,
    SPAN_MIN: SPAN_MIN, SPAN_MAX: SPAN_MAX, SPAN_DEFAULT: SPAN_DEFAULT, NEAR_K: NEAR_K, TIMBRES: TIMBRES,
    PROGS: PROGS, PROG_ORDER: PROG_ORDER, PMODES: PMODES, QUAL: QUAL,
    cents: cents, mod: mod, fr: fr, fmul: fmul, fdiv: fdiv, fval: fval, fpow2: fpow2,
    spanFromPos: spanFromPos, posFromSpan: posFromSpan, noteName: noteName, nearestNote: nearestNote, spellAt: spellAt, spellRoot: spellRoot, rootLetter: rootLetter,
    periodOf: periodOf, chordTones: chordTones, phaseErr: phaseErr, analyze: analyze, payload: payload,
    waveAt: waveAt, wavePeak: wavePeak, scaleFrac: scaleFrac, voiceProg: voiceProg, progression: progression, progPayload: progPayload, pickPayload: pickPayload, growPayload: growPayload,
    lissajous: lissajous
  };
}));
