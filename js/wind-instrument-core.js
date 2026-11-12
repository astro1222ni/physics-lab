/*
 * wind-instrument-core.js — 「管樂器：直笛、長笛與單簧管」的物理核心（不碰 DOM，瀏覽器與 Node 都能用）
 *
 * 內容：
 *   聲速與溫度：v ≈ 331.3 + 0.606 T（m/s，T 是攝氏溫度；0–40 °C 內和 331.3√(1 + T/273.15) 相差不到 0.3%）
 *   管口修正：開口端的駐波其實延伸到管口外 δ 處。無凸緣的細管 δ = 0.6133 r（Levine & Schwinger 1948），
 *             有凸緣（管口外有一大片平板）δ = 0.8216 r；「不計」δ = 0（課本的理想管）
 *   有效長度：開管（兩端開）L′ = L + 2δ；閉管（一端閉，另一端開）L′ = L + δ
 *   共振頻率：開管第 m 模式 f = m v / 2L′（m = 1, 2, 3, …，全部整數倍）
 *             閉管第 m 模式 f = (2m − 1) v / 4L′（只有奇數倍：1、3、5…）
 *   駐波形狀：開管 位移 ξ ∝ cos(nπu)、壓力 p ∝ sin(nπu)；閉管 ξ ∝ sin(nπu/2)、p ∝ −cos(nπu/2)
 *             （u = 沿有效長度的位置比例 0–1；p = −(dξ/dx)/k，所以位移收攏的地方壓力為正＝壓縮）
 *   直笛（示意）：8 孔的 C 調高音直笛，簡化成圓柱管＋按孔的「等效長度」模型（見 recorderLength）
 *   analyze()：頁面、任務與任務證明共用的完整資料
 *
 * 單位：長度 m（內徑、孔徑、頭管拉出量介面上用 mm）、溫度 °C、頻率 Hz、聲速 m/s。
 * 用法：瀏覽器 window.WindCore；Node require('./wind-instrument-core.js')。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./music-theory.js'));
  else root.WindCore = factory(root.MusicTheory);
}(typeof self !== 'undefined' ? self : this, function (MT) {
  'use strict';

  const V0 = 331.3;          // 0 °C 乾燥空氣的聲速（m/s）
  const KV = 0.606;          // 每升高 1 °C 聲速增加約 0.606 m/s
  const T0 = 273.15;
  /** 管口修正係數 δ = k·r */
  const END = { none: 0, unflanged: 0.6133, flanged: 0.8216 };
  const CORRS = ['none', 'unflanged', 'flanged'];
  /** 控制項範圍（頁面滑桿與任務證明共用） */
  const RANGES = { L: [0.1, 1.5], d: [8, 30], T: [0, 40], m: [1, 3], pull: [0, 10] };
  const DEFAULT = { inst: 'tube', type: 'open', L: 0.645, d: 19, T: 20, m: 1, corr: 'unflanged', pull: 0 };

  // ======================= 聲速、管口修正、共振 =======================
  /** 聲速（m/s）：線性近似 v = 331.3 + 0.606 T */
  function soundSpeed(Tc) { return V0 + KV * Tc; }
  /** 理想氣體的精確式 v = 331.3√(1 + T/273.15)（只用來比較線性近似的誤差） */
  function soundSpeedExact(Tc) { return V0 * Math.sqrt(1 + Tc / T0); }
  /** 聲速 v 對應的溫度（°C） */
  function tempFor(v) { return (v - V0) / KV; }
  /** 一個開口端的管口修正 δ（m）；d 是內徑（mm） */
  function endCorrection(dmm, corr) { return (END[corr] == null ? END.unflanged : END[corr]) * dmm / 2000; }
  /** 有效長度 L′：開管兩端各加 δ，閉管只有開口那一端加 δ */
  function effLength(type, L, dmm, corr) { return L + (type === 'closed' ? 1 : 2) * endCorrection(dmm, corr); }
  /** 第 m 個振動模式是第幾個「泛音倍數」n：開管 n = m；閉管 n = 2m − 1 */
  function harmonicNumber(type, m) { return type === 'closed' ? 2 * m - 1 : m; }
  /** 第 m 模式的頻率：開管 m v / 2L′、閉管 (2m − 1) v / 4L′ */
  function modeFreq(type, m, Lp, v) { return harmonicNumber(type, m) * v / ((type === 'closed' ? 4 : 2) * Lp); }
  /** 前 M 個振動模式的頻率 */
  function resonances(type, Lp, v, M) {
    const out = [];
    for (let m = 1; m <= (M || 5); m++) out.push(modeFreq(type, m, Lp, v));
    return out;
  }
  /** 要在第 m 模式發出頻率 f，管子（實際長度）要多長 */
  function lengthFor(f, type, m, dmm, corr, Tc) {
    const Lp = harmonicNumber(type, m) * soundSpeed(Tc) / ((type === 'closed' ? 4 : 2) * f);
    return Lp - (type === 'closed' ? 1 : 2) * endCorrection(dmm, corr);
  }
  /**
   * 駐波形狀（振幅的空間部分）：u = 沿有效長度的位置比例（開管 0 與 1 都是有效開口；閉管 0 是閉口、1 是有效開口）
   * 傳回 { xi（空氣位移）, p（壓力變化） }，兩者最大值都是 1。時間部分兩者同為 sin(ωt)。
   */
  function shapeAt(type, n, u) {
    if (type === 'closed') return { xi: Math.sin(n * Math.PI * u / 2), p: -Math.cos(n * Math.PI * u / 2) };
    return { xi: Math.cos(n * Math.PI * u), p: Math.sin(n * Math.PI * u) };
  }
  /** 壓力節點與壓力腹點的位置（u，0–1） */
  function nodesOf(type, n) {
    const nodes = [], anti = [];
    if (type === 'closed') {
      for (let j = 0; 2 * j <= n; j++) anti.push(2 * j / n);
      for (let j = 0; 2 * j + 1 <= n; j++) nodes.push((2 * j + 1) / n);
    } else {
      for (let j = 0; j <= n; j++) nodes.push(j / n);
      for (let j = 0; j < n; j++) anti.push((j + 0.5) / n);
    }
    return { pNodes: nodes.filter(function (u) { return u <= 1 + 1e-12; }), pAnti: anti.filter(function (u) { return u <= 1 + 1e-12; }) };
  }

  // ======================= 音色（聲音與頻譜共用；近似） =======================
  /**
   * 發聲的泛音振幅（第 j 個泛音 = j × 發聲頻率，j = 1…J）：
   *   閉管（單簧管類）只有奇次泛音，振幅約 1/j；
   *   開管（長笛類）全部泛音，振幅約 1/j^1.6；直笛的音更接近純音，約 1/j^2.2。
   * 這是用泛音參數調出來的近似音色，不是錄音。
   */
  function toneSpectrum(type, inst, J) {
    J = J || 12;
    const out = [];
    for (let j = 1; j <= J; j++) {
      if (type === 'closed') out.push(j % 2 ? 1 / j : 0);
      else out.push(Math.pow(j, inst === 'recorder' ? -2.2 : -1.6));
    }
    return out;
  }

  // ======================= 直笛（示意） =======================
  /*
   * C 調高音直笛（soprano / descant recorder）簡化成內徑 12.5 mm 的圓柱管（真的直笛是越往下越細的錐形管）。
   * 位置 s 從唇口（labium，發聲的那個邊緣）往下量；8 個孔：0 是背面的拇指孔，1–3 左手，4–7 右手
   * （真的直笛 6、7 是雙孔，這裡各簡化成一個面積相同的孔）。孔徑是常見塑膠直笛的大約值，管壁厚 4 mm。
   *
   * 按孔的等效長度模型（低頻、集總近似；Fletcher & Rossing 第 15 章、Benade 1976 的簡化）：
   *   打開的孔像一條很短的「旁路」：孔裡的空氣柱（長 tₑ = 管壁 t + 1.5 b，b 是孔的半徑）要推動，
   *   相當於一段截面積和主管一樣、長 h = (a/b)²·tₑ 的管子（a 是主管半徑）。
   *   聲波到了孔，可以從孔出去（等效長 h），也可以繼續往下走（下面管子的等效長 ℓ），
   *   兩條路「並聯」：從孔往下的等效長度 E = h·ℓ / (h + ℓ)。
   *   孔越大 h 越小，E 越接近 0，管子就像在孔的地方被截斷；孔越小 E 越接近 ℓ，幾乎沒有截斷。
   *   由管尾往上一個一個孔算：管尾 E = δ；關著的孔 E = 到下一個孔的距離 + 下一個孔的 E；打開的孔再和 h 並聯。
   *   最後 L′ = δ（唇口端）＋ 頭管拉出量 ＋ 到拇指孔的距離 ＋ 拇指孔的 E；發聲頻率 f = m v / 2L′。
   * 拇指孔「半開」：只當成讓基音不穩、跳到第 2 模式的小通氣孔（register hole），不改變等效長度（簡化）。
   * 孔的位置是用這個模型在 20 °C 反推出來的（designRecorder），四捨五入到 0.1 mm：製笛師也是先算再修。
   */
  const REC = {
    d: 12.5,                        // 內徑（mm）
    wall: 4,                        // 管壁厚（mm）
    holeD: [6.0, 4.6, 6.9, 6.9, 5.5, 6.2, 6.9, 5.0],   // 孔徑（mm）：0 = 拇指孔（選成讓孔距大約平均，約 2 cm）
    designT: 20
  };
  /** 指法（0 = 按住、1 = 打開、0.5 = 半開；第 0 個是拇指孔）。巴洛克式（英式）指法 */
  const FINGERINGS = {
    C5: [0, 0, 0, 0, 0, 0, 0, 0],
    D5: [0, 0, 0, 0, 0, 0, 0, 1],
    E5: [0, 0, 0, 0, 0, 0, 1, 1],
    F5: [0, 0, 0, 0, 0, 1, 0, 0],   // 叉指：第 5 孔開，第 6、7 孔仍按住
    G5: [0, 0, 0, 0, 1, 1, 1, 1],
    A5: [0, 0, 0, 1, 1, 1, 1, 1],
    B5: [0, 0, 1, 1, 1, 1, 1, 1],
    C6: [0, 1, 0, 1, 1, 1, 1, 1],   // 叉指：第 1 孔開，第 2 孔按住
    D6: [1, 1, 0, 1, 1, 1, 1, 1],   // 拇指孔全開當通氣孔，只按第 2 孔（和真的直笛一樣）
    E6: [0.5, 0, 0, 0, 0, 0, 1, 1]  // 拇指孔半開：E5 的指法吹高八度
  };
  const SCALE = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
  /** 孔的等效長度 h = (a/b)²·(t + 1.5 b)（m） */
  function holeLen(dh, dBore, wall) {
    const a = dBore / 2000, b = dh / 2000, t = (wall == null ? REC.wall : wall) / 1000;
    return (a / b) * (a / b) * (t + 1.5 * b);
  }
  function par(h, l) { return h * l / (h + l); }
  /**
   * 直笛的等效長度。xs：8 個孔的位置（m，從唇口量）；Lb：唇口到管尾；holes：8 個孔的狀態；pull：頭管拉出量（m）；
   * corr：管口修正。傳回 { Lp, E（各孔往下的等效長度）, first（最上面打開的孔，沒有為 −1）, sEnd（有效開口在管內的位置 s） }
   */
  function recorderLength(xs, Lb, holes, pull, corr, dBore) {
    dBore = dBore || REC.d;
    const delta = endCorrection(dBore, corr || 'unflanged');
    const E = new Array(8);
    let below = Lb, Ebelow = delta;
    for (let k = 7; k >= 0; k--) {
      const l = (below - xs[k]) + Ebelow;
      const open = holes[k] === 1;
      E[k] = open ? par(holeLen(REC.holeD[k], dBore), l) : l;
      below = xs[k]; Ebelow = E[k];
    }
    let first = -1;
    for (let k = 0; k < 8; k++) if (holes[k] === 1) { first = k; break; }
    const Lp = delta + (pull || 0) + xs[0] + E[0];
    return { Lp: Lp, E: E, first: first, delta: delta, sEnd: Lp - delta };
  }
  /**
   * 製笛師的設計：在 designT（20 °C）讓 8 個常用指法剛好是十二平均律的 C5…C6，拇指全開的 D6 指法剛好是 D6。
   * 由下往上一個孔一個孔用二分法求位置（每個指法只多出一個未知的孔）。
   */
  function designRecorder() {
    const v = soundSpeed(REC.designT);
    const target = function (name) { return v / (2 * MT.midiToFreq(MT.parseNote(name))); };
    const delta = endCorrection(REC.d, 'unflanged');
    const Lb = target('C5') - 2 * delta;
    const xs = [0, 0, 0, 0, 0, 0, 0, 0];
    function solve(k, name, lo, hi) {
      const want = target(name), fing = FINGERINGS[name];
      for (let it = 0; it < 80; it++) {
        const mid = (lo + hi) / 2;
        xs[k] = mid;
        const Lp = recorderLength(xs, Lb, fing, 0, 'unflanged').Lp;
        if (Lp > want) hi = mid; else lo = mid;
      }
      xs[k] = (lo + hi) / 2;
    }
    // 求解時，還沒決定的（較上面的）孔先放在唇口附近；它們在這個指法裡都是按住的，不影響結果
    solve(7, 'D5', 0.001, Lb);
    solve(6, 'E5', 0.001, xs[7]);
    solve(5, 'F5', 0.001, xs[6]);
    solve(4, 'G5', 0.001, xs[5]);
    solve(3, 'A5', 0.001, xs[4]);
    solve(2, 'B5', 0.001, xs[3]);
    solve(1, 'C6', 0.001, xs[2]);
    solve(0, 'D6', 0.001, xs[1]);
    const r = function (x) { return Math.round(x * 10000) / 10000; };   // 0.1 mm
    return { L: r(Lb), xs: xs.map(r) };
  }
  const DESIGN = designRecorder();
  REC.L = DESIGN.L;
  REC.xs = DESIGN.xs;
  /** 這組孔是不是某個標準指法（傳回名稱或 null） */
  function fingeringName(holes) {
    const names = Object.keys(FINGERINGS);
    for (let i = 0; i < names.length; i++) {
      const f = FINGERINGS[names[i]];
      let same = true;
      for (let k = 0; k < 8; k++) if (f[k] !== holes[k]) { same = false; break; }
      if (same) return names[i];
    }
    return null;
  }

  // ======================= 音名與音分 =======================
  function nearest(f) {
    const m = MT.freqToMidi(f);
    const r = Math.round(m);
    return { midi: r, cents: (m - r) * 100, name: MT.noteName(r) };
  }
  function cents(r) { return 1200 * Math.log2(r); }

  // ======================= 頁面、任務與證明共用的資料 =======================
  /**
   * cfg = { inst: 'tube' | 'recorder', type: 'open' | 'closed', L, d（mm）, T（°C）, m（1–3）, corr, holes（8 個）, pull（mm） }
   * 直笛模式固定：開管、L 與內徑是直笛的值、管口修正「無凸緣」、模式由拇指孔決定（半開 = 第 2 模式）。
   */
  function analyze(cfg) {
    const rec = cfg.inst === 'recorder';
    const T = cfg.T;
    const v = soundSpeed(T);
    const holes = rec ? (cfg.holes || FINGERINGS.C5).slice() : null;
    const type = rec ? 'open' : (cfg.type === 'closed' ? 'closed' : 'open');
    const corr = rec ? 'unflanged' : (END[cfg.corr] == null ? 'unflanged' : cfg.corr);
    const d = rec ? REC.d : cfg.d;
    const pull = rec ? Math.max(0, cfg.pull || 0) : 0;
    const m = rec ? (holes[0] === 0.5 ? 2 : 1) : Math.max(1, Math.min(3, Math.round(cfg.m || 1)));
    const delta = endCorrection(d, corr);
    let L, Lp, first = -1, sEnd, E = null, holeDelta = null;
    if (rec) {
      L = REC.L + pull / 1000;
      const R = recorderLength(REC.xs, REC.L, holes, pull / 1000, corr, d);
      Lp = R.Lp; first = R.first; sEnd = R.sEnd; E = R.E;
      if (first >= 0) holeDelta = R.E[first];
    } else {
      L = cfg.L;
      Lp = effLength(type, L, d, corr);
      sEnd = L + delta;
    }
    const n = harmonicNumber(type, m);
    const f = modeFreq(type, m, Lp, v);
    const f1 = modeFreq(type, 1, Lp, v);
    const near = nearest(f);
    return {
      inst: rec ? 'recorder' : 'tube', type: type, L: L, d: d, r: d / 2000, T: T, v: v, corr: corr, kEnd: END[corr], delta: delta,
      m: m, n: n, Lp: Lp, f: f, f1: f1, lambda: v / f, res: resonances(type, Lp, v, 5),
      midi: near.midi, name: near.name, cents: near.cents,
      sStart: type === 'closed' ? 0 : -delta, sEnd: sEnd,
      holes: holes, thumb: rec ? holes[0] : null, fing: rec ? fingeringName(holes) : null, first: first, holeDelta: holeDelta, E: E,
      pull: pull, spectrum: toneSpectrum(type, rec ? 'recorder' : 'tube', 12)
    };
  }
  /** 指法表：每個常用指法在目前溫度與頭管拉出量下的頻率與偏差 */
  function fingeringTable(T, pull) {
    return SCALE.concat(['D6', 'E6']).map(function (name) {
      const a = analyze({ inst: 'recorder', T: T, holes: FINGERINGS[name], pull: pull });
      const want = MT.midiToFreq(MT.parseNote(name));
      return { name: name, holes: FINGERINGS[name], f: a.f, m: a.m, want: want, cents: cents(a.f / want) };
    });
  }

  return {
    V0: V0, KV: KV, END: END, CORRS: CORRS, RANGES: RANGES, DEFAULT: DEFAULT, REC: REC, FINGERINGS: FINGERINGS, SCALE: SCALE,
    soundSpeed: soundSpeed, soundSpeedExact: soundSpeedExact, tempFor: tempFor, endCorrection: endCorrection, effLength: effLength,
    harmonicNumber: harmonicNumber, modeFreq: modeFreq, resonances: resonances, lengthFor: lengthFor, shapeAt: shapeAt, nodesOf: nodesOf,
    toneSpectrum: toneSpectrum, holeLen: holeLen, recorderLength: recorderLength, designRecorder: designRecorder, fingeringName: fingeringName,
    nearest: nearest, cents: cents, analyze: analyze, fingeringTable: fingeringTable
  };
}));
