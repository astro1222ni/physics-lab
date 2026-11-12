/* geologic-time-core.js — 「地層與地質年代：相對定年與放射性定年」的核心（與畫面無關，UMD）
 *
 * 一、放射性定年：母元素 P 衰變成子元素 D，λ = ln2 / T½。
 *     封閉系統、一開始沒有子元素時 D/P = e^{λt} − 1，所以 t = ln(1 + D/P) / λ。
 *     40K 只有一部分（分支比 λe/λ）變成 40Ar：40Ar/40K = (λe/λ)(e^{λt} − 1)。
 *     14C 量的是剩下的比例 N/N0 = e^{−λt}（大氣補充的 14C 在生物死亡後停止）。
 *     87Rb–87Sr 用等時線：同一岩體不同礦物 (87Sr/86Sr) = 初始值 + (87Rb/86Sr)(e^{λt} − 1)，斜率 = e^{λt} − 1。
 *     衰變常數：U、K、Rb 用 Steiger & Jäger（1977）、Jaffey et al.（1971）與 Villa et al.（2015）；14C 用 NUBASE2020 的 5700 年。
 * 二、地層剖面：一串地質事件（沉積、火山灰、熔岩流、傾斜、侵蝕、斷層、岩脈）依時間發生。
 *     查詢某一點 (x, z) 是哪一個岩層：從最年輕的事件往回推 —— 碰到傾斜就把點繞左端轉回去、碰到斷層就把上盤移回去、
 *     碰到侵蝕面以上就是空氣（後來的沉積會先被找到）、碰到岩脈就在岩脈裡；
 *     沉積層只填滿「當時是空氣、而且在沉積頂面以下」的地方（所以會覆蓋在傾斜或被侵蝕的地層上，形成不整合）。
 *     這就是疊置原理、原始水平原理、截切關係在程式裡的寫法。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GeoTimeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LN2 = Math.LN2;

  // ======================================================================
  // 一、放射性定年
  // ======================================================================
  /** 定年法：lambda（每年）, branch（變成量到的子元素的比例）, rel（量測的相對誤差 1σ）, maxAge（可用上限，年） */
  const SYSTEMS = {
    U238: { lambda: 1.55125e-10, branch: 1, rel: 0.002, minAge: 1e6, maxAge: 4.6e9, kind: 'ratio' },          // 238U → 206Pb（Jaffey 1971）
    U235: { lambda: 9.8485e-10, branch: 1, rel: 0.003, minAge: 1e6, maxAge: 4.6e9, kind: 'ratio' },           // 235U → 207Pb
    K40: { lambda: 5.543e-10, branch: 0.581 / 5.543, rel: 0.006, minAge: 1e5, maxAge: 4.6e9, kind: 'ratio' },  // 40K → 40Ar（Steiger & Jäger 1977）
    Rb87: { lambda: 1.3972e-11, branch: 1, rel: 0.002, minAge: 1e7, maxAge: 4.6e9, kind: 'isochron' },       // 87Rb → 87Sr（Villa 2015）
    C14: { lambda: LN2 / 5700, branch: 1, rel: 0.004, minAge: 0, maxAge: 5e4, kind: 'remain' }               // 14C（NUBASE2020：5700 ± 30 年）
  };
  function halfLife(sys) { return LN2 / SYSTEMS[sys].lambda; }
  /** t 年後的量測值：ratio → D/P（K40 是 Ar/K）；remain → N/N0 */
  function ratioAt(sys, t) {
    const S = SYSTEMS[sys];
    if (S.kind === 'remain') return Math.exp(-S.lambda * t);
    return S.branch * Math.expm1(S.lambda * t);
  }
  /** 由量測值反推年齡（年） */
  function ageFrom(sys, r) {
    const S = SYSTEMS[sys];
    if (S.kind === 'remain') return r > 0 ? -Math.log(r) / S.lambda : Infinity;
    return Math.log1p(r / S.branch) / S.lambda;
  }
  /** 量測值的相對誤差 rel 造成的年齡誤差（年，1σ） */
  function ageSigma(sys, r, rel) {
    const S = SYSTEMS[sys];
    if (S.kind === 'remain') return rel / S.lambda;                   // dt = (dr/r)/λ
    const q = r / S.branch;
    return q / (1 + q) * rel / S.lambda;                              // dt = dr/(λ(B + r))
  }
  // 等時線：同一岩體的四種礦物（斜長石、角閃石、鉀長石、黑雲母）的 87Rb/86Sr
  const ISO_X = [0.05, 0.8, 4, 18], SR0 = 0.7045;
  function isochron(t) { const k = Math.expm1(SYSTEMS.Rb87.lambda * t); return ISO_X.map(function (x) { return [x, SR0 + x * k]; }); }
  /** 最小平方法直線：回傳 { slope, icpt, age } */
  function fitIsochron(pts) {
    const n = pts.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; });
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
    return { slope: slope, icpt: icpt, age: Math.log1p(slope) / SYSTEMS.Rb87.lambda };
  }
  // 決定性的擬隨機（同一個樣本、同一次量測永遠得到同一個數，方便任務與測試）
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function gauss(seed) {
    let a = hash('a' + seed) / 4294967296, b = hash('b' + seed) / 4294967296;
    a = Math.max(a, 1e-12);
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }

  // ======================================================================
  // 二、地層剖面
  // ======================================================================
  const AIR = -2, BASE = -1;
  const W = 4000, Z_LO = -1600, Z_HI = 400;     // 剖面寬 4 km、高程 −1600 到 +400 m
  /** 岩石種類：sed（沉積岩）、ign（火成岩）、met（變質岩）；datable：可用的定年法與「量到的是哪個時間」 */
  const ROCKS = {
    gneiss: { cls: 'met' }, granite: { cls: 'ign' }, sandstone: { cls: 'sed' }, shale: { cls: 'sed' }, limestone: { cls: 'sed' },
    conglomerate: { cls: 'sed' }, ash: { cls: 'ign' }, basalt: { cls: 'ign' }, gravel: { cls: 'sed' }
  };
  // 化石的生存年代（百萬年前，Ma；依 ICS 2023 地質年代表的界線，取整數）
  const FOSSILS = {
    trilobite: { from: 521, to: 252 },     // 三葉蟲：寒武紀第二世到二疊紀末
    graptolite: { from: 486, to: 390 },    // 浮游筆石：奧陶紀初到泥盆紀早期
    ammonite: { from: 409, to: 66 },       // 菊石：泥盆紀到白堊紀末
    dinosaur: { from: 233, to: 66 }        // 非鳥恐龍：三疊紀晚期到白堊紀末
  };
  // 地質年代表（Ma，ICS 2023）：代與紀
  const ERAS = [
    { id: 'precambrian', from: 4600, to: 538.8 }, { id: 'paleozoic', from: 538.8, to: 251.9 },
    { id: 'mesozoic', from: 251.9, to: 66 }, { id: 'cenozoic', from: 66, to: 0 }
  ];
  const PERIODS = [
    { id: 'cambrian', from: 538.8, to: 486.85 }, { id: 'ordovician', from: 486.85, to: 443.1 }, { id: 'silurian', from: 443.1, to: 419.62 },
    { id: 'devonian', from: 419.62, to: 358.86 }, { id: 'carboniferous', from: 358.86, to: 298.9 }, { id: 'permian', from: 298.9, to: 251.902 },
    { id: 'triassic', from: 251.902, to: 201.4 }, { id: 'jurassic', from: 201.4, to: 143.1 }, { id: 'cretaceous', from: 143.1, to: 66 },
    { id: 'paleogene', from: 66, to: 23.04 }, { id: 'neogene', from: 23.04, to: 2.58 }, { id: 'quaternary', from: 2.58, to: 0 }
  ];
  function periodAt(ma) { for (let i = 0; i < PERIODS.length; i++) if (ma <= PERIODS[i].from && ma >= PERIODS[i].to) return PERIODS[i].id; return ma > 538.8 ? 'precambrian' : null; }

  /**
   * 建立一個剖面：events 依時間由老到新，每個事件 { type, t（Ma，沉積是開始與結束 t0、t1）, … }。
   * 建立時依序算出每個事件當時的「水平基準面」level（沉積頂面、侵蝕面），存在事件裡。
   */
  function build(def) {
    const S = { id: def.id, base: def.base, events: [], units: [] };
    let level = def.base.top;
    def.events.forEach(function (d, i) {
      const e = Object.assign({ idx: i }, d);
      if (e.type === 'deposit') { e.bottom = level; e.top = level + e.h; level = e.top; e.t = e.t1; }
      else if (e.type === 'erode') { level = e.to; }
      else if (e.type === 'tilt') { e.px = 0; e.pz = level; }
      else if (e.type === 'fault') { e.z0 = level; }
      else if (e.type === 'dike') { e.top = level; }
      S.events.push(e);
    });
    S.surface = level;
    S.tStart = def.base.t;
    return S;
  }
  function rot(x, z, px, pz, deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - px, dz = z - pz;
    return [px + c * dx - s * dz, pz + s * dx + c * dz];
  }
  function faultX(e, z) { return e.x + (e.z0 - z) / Math.tan(e.dip * Math.PI / 180); }
  function dikeX(e, z) { return e.x + (e.top - z) * Math.tan((e.lean || 0) * Math.PI / 180); }
  /**
   * 時間 tMa（百萬年前）時，位置 (x, z) 是哪一個事件形成的岩石（事件編號），或 BASE（基盤）、AIR（空氣）。
   * n：只考慮前 n 個事件。out（可省略）：回傳這塊岩石「形成當時」的座標 out.x、out.z（畫層理、紋路用）。
   */
  function rockAt(S, x, z, n, out) {
    for (let i = n - 1; i >= 0; i--) {
      const e = S.events[i];
      if (e.type === 'deposit') {
        if (z <= e.top) {
          const o = rockAt(S, x, z, i, out);
          if (o !== AIR) return o;
          if (out) { out.x = x; out.z = z; }
          return i;
        }
      } else if (e.type === 'erode') {
        if (z > e.to) return AIR;
      } else if (e.type === 'tilt') {
        const p = rot(x, z, e.px, e.pz, -e.angle); x = p[0]; z = p[1];
      } else if (e.type === 'fault') {
        if (x > faultX(e, z)) { const a = e.dip * Math.PI / 180; x -= e.slip * Math.cos(a); z += e.slip * Math.sin(a); }
      } else if (e.type === 'dike') {
        if (z <= e.top && Math.abs(x - dikeX(e, z)) <= e.w / 2) { if (out) { out.x = x; out.z = z; } return i; }
      }
    }
    if (out) { out.x = x; out.z = z; }
    return z <= S.base.top ? BASE : AIR;
  }
  /** tMa 時已經發生的事件數 */
  function countAt(S, tMa) { let n = 0; S.events.forEach(function (e, i) { if ((e.type === 'deposit' ? e.t1 : e.t) >= tMa - 1e-9) n = i + 1; }); return n; }
  /** 沉積中的層（t0 > tMa > t1）：回傳 { i, frac }，讓畫面畫「正在堆積」 */
  function depositingAt(S, tMa) {
    for (let i = 0; i < S.events.length; i++) { const e = S.events[i]; if (e.type === 'deposit' && tMa < e.t0 && tMa > e.t1) return { i: i, frac: (e.t0 - tMa) / (e.t0 - e.t1) }; }
    return null;
  }
  /** 時間 tMa 的剖面查詢（正在沉積的那一層只畫到目前的厚度） */
  function rockAtTime(S, x, z, tMa, out) {
    const n = countAt(S, tMa), dep = depositingAt(S, tMa);
    if (dep && dep.i === n) {
      const e = S.events[dep.i], top = e.bottom + e.h * dep.frac;
      const o = rockAt(S, x, z, n, out);
      if (o === AIR && z <= top) return dep.i;
      return o;
    }
    return rockAt(S, x, z, n, out);
  }
  /** tMa 時的地表高度（沉積中的層算到目前的厚度） */
  function levelAt(S, tMa) {
    const n = countAt(S, tMa), dep = depositingAt(S, tMa);
    let lv = S.base.top;
    for (let i = 0; i < n; i++) { const e = S.events[i]; if (e.type === 'deposit') lv = e.top; else if (e.type === 'erode') lv = e.to; }
    if (dep && dep.i === n) { const e = S.events[dep.i]; lv = e.bottom + e.h * dep.frac; }
    return lv;
  }
  /** 一個單元（事件編號或 BASE）真正形成的時間（Ma）：沉積層取中間值 */
  function unitAge(S, u) {
    if (u === BASE) return S.base.t;
    const e = S.events[u];
    return e.type === 'deposit' ? (e.t0 + e.t1) / 2 : e.t;
  }
  function unitRock(S, u) { return u === BASE ? S.base.rock : S.events[u].rock; }
  /**
   * 定年：對單元 u 用定年法 sys 量第 k 次。回傳 { ok, reason, r（量到的比值）, age（Ma）, sigma（Ma，1σ）, trueAge（Ma）, what }。
   * 能不能量、量到的是什麼時間：
   *   火成岩（火山灰、熔岩、岩脈、花崗岩）：U–Pb（鋯石）、K–Ar、Rb–Sr 都是結晶的時間（火山灰、熔岩就是沉積的時間）。
   *   變質岩（片麻岩）：U–Pb 是變質（鋯石再結晶）的時間。
   *   砂岩、礫岩：碎屑鋯石的 U–Pb 是「來源岩石」的年齡，比沉積老（只能當最大年齡）。
   *   頁岩、石灰岩：沒有可以用的礦物（這裡不提供），要靠化石或夾在上下的火成岩。
   *   14C：只能量 5 萬年以內、含有機碳的樣本（例如礫石層裡的木炭）。
   */
  function measure(S, u, sys, k) {
    const rock = unitRock(S, u);
    if (!ROCKS[rock]) return { ok: false, reason: 'not-rock' };     // 傾斜、侵蝕、斷層不是岩石
    const cls = ROCKS[rock].cls, Sy = SYSTEMS[sys];
    const e = u === BASE ? S.base : S.events[u];
    let tMa = unitAge(S, u), what = 'formation';
    if (sys === 'C14') {
      if (!e.charcoal) return { ok: false, reason: rock === 'limestone' || e.fossil ? 'too-old' : 'no-carbon' };   // 石灰岩、化石有碳，但太老
      tMa = e.charcoal;
    } else if (rock === 'gravel') {
      return { ok: false, reason: 'mixed' };                         // 礫石是各種岩石的碎塊，年代各不相同
    } else if (cls === 'sed') {
      if (!(rock === 'sandstone' || rock === 'conglomerate') || sys !== 'U238' && sys !== 'U235') return { ok: false, reason: 'no-mineral' };
      tMa = e.detrital || S.base.t; what = 'detrital';
    } else if (cls === 'met' && sys !== 'U238' && sys !== 'U235') {
      return { ok: false, reason: 'reset' };                         // 變質作用會讓 K–Ar、Rb–Sr 部分重設，這裡不提供
    } else if (rock === 'ash' && sys === 'Rb87') {
      return { ok: false, reason: 'no-mineral' };                    // 火山灰只有少數礦物，等時線做不出來
    }
    const t = tMa * 1e6;
    if (t > Sy.maxAge) return { ok: false, reason: 'too-old' };
    if (sys === 'C14' && t > Sy.maxAge) return { ok: false, reason: 'too-old' };
    if (sys !== 'C14' && t < Sy.minAge) return { ok: false, reason: 'too-young' };
    const seed = S.id + '|' + u + '|' + sys + '|' + (k || 0);
    if (Sy.kind === 'isochron') {
      const pts = isochron(t).map(function (p, i) { return [p[0], p[1] * (1 + Sy.rel * 0.25 * gauss(seed + i))]; });
      const fit = fitIsochron(pts);
      return { ok: true, sys: sys, pts: pts, fit: fit, age: fit.age / 1e6, sigma: tMa * 0.006 + 2, trueAge: tMa, what: what };
    }
    const r0 = ratioAt(sys, t), r = r0 * (1 + Sy.rel * gauss(seed));
    return { ok: true, sys: sys, r: r, age: ageFrom(sys, r) / 1e6, sigma: ageSigma(sys, r, Sy.rel) / 1e6, trueAge: tMa, what: what };
  }
  /** 把事件 k 發生當時的點 (x, z)，依之後的傾斜與斷層移到第 n 個事件之後的位置（畫不整合面、斷層用） */
  function forward(S, x, z, k, n) {
    for (let i = k + 1; i < n; i++) {
      const e = S.events[i];
      if (e.type === 'tilt') { const p = rot(x, z, e.px, e.pz, e.angle); x = p[0]; z = p[1]; }
      else if (e.type === 'fault' && x > faultX(e, z)) { const a = e.dip * Math.PI / 180; x += e.slip * Math.cos(a); z -= e.slip * Math.sin(a); }
    }
    return [x, z];
  }
  /** 沉積速率（m / 百萬年）：兩個定年過的層（u1 在下、u2 在上）之間的地層厚度 ÷ 年代差 */
  function rate(thick, ageLow, ageHigh) { return thick / (ageLow - ageHigh); }

  // ======================================================================
  // 剖面範本
  // ======================================================================
  const SCENARIOS = {
    // 地層的故事：前寒武紀基盤 → 花崗岩 → 傾斜的老地層 → 角度不整合 → 古生代 → 斷層 → 侵蝕 → 中生代 → 岩脈 → 侵蝕 → 現代礫石
    A: {
      id: 'A', base: { t: 1720, rock: 'gneiss', top: -1100 },
      events: [
        { type: 'dike', t: 1430, rock: 'granite', x: 900, w: 700, lean: 12, name: 'granite' },
        { type: 'deposit', t0: 1180, t1: 1120, rock: 'sandstone', h: 260, detrital: 1720 },
        { type: 'deposit', t0: 1120, t1: 1060, rock: 'shale', h: 220 },
        { type: 'deposit', t0: 1060, t1: 1000, rock: 'limestone', h: 220 },
        { type: 'tilt', t: 900, angle: 15 },
        { type: 'erode', t: 560, to: -560 },
        { type: 'deposit', t0: 520, t1: 500, rock: 'sandstone', h: 140, fossil: 'trilobite', detrital: 1430 },
        { type: 'deposit', t0: 500, t1: 499.8, rock: 'ash', h: 18 },
        { type: 'deposit', t0: 486, t1: 445, rock: 'shale', h: 160, fossil: 'graptolite' },        // 499.8–486 Ma 沒有沉積（假整合）
        { type: 'deposit', t0: 445, t1: 420, rock: 'limestone', h: 260, fossil: 'trilobite' },
        { type: 'fault', t: 310, x: 2700, dip: 60, slip: 150 },
        { type: 'erode', t: 255, to: -130 },
        { type: 'deposit', t0: 206, t1: 205.7, rock: 'basalt', h: 40 },
        { type: 'deposit', t0: 205.7, t1: 150.3, rock: 'sandstone', h: 160, fossil: 'dinosaur', detrital: 1430 },
        { type: 'deposit', t0: 150.3, t1: 150, rock: 'ash', h: 16 },
        { type: 'deposit', t0: 150, t1: 92, rock: 'limestone', h: 170, fossil: 'ammonite' },
        { type: 'dike', t: 61, rock: 'basalt', x: 3350, w: 70, lean: -8, name: 'dike' },
        { type: 'erode', t: 30, to: 170 },
        { type: 'deposit', t0: 0.03, t1: 0, rock: 'gravel', h: 50, charcoal: 0.0121 }
      ]
    },
    // 練習：三層 → 岩脈 → 斷層 → 侵蝕 → 熔岩流
    B: {
      id: 'B', base: { t: 520, rock: 'granite', top: -900 },
      events: [
        { type: 'deposit', t0: 380, t1: 340, rock: 'sandstone', h: 300, fossil: 'ammonite', detrital: 520 },
        { type: 'deposit', t0: 340, t1: 300, rock: 'shale', h: 260, fossil: 'trilobite' },
        { type: 'deposit', t0: 300, t1: 260, rock: 'limestone', h: 260, fossil: 'trilobite' },
        { type: 'dike', t: 230, rock: 'basalt', x: 1200, w: 90, lean: 10, name: 'dike' },
        { type: 'fault', t: 180, x: 2400, dip: 65, slip: 150 },
        { type: 'erode', t: 120, to: -230 },
        { type: 'deposit', t0: 95, t1: 94.6, rock: 'basalt', h: 60 },
        { type: 'deposit', t0: 94.6, t1: 70, rock: 'sandstone', h: 120, fossil: 'dinosaur', detrital: 230 }
      ]
    }
  };
  const BUILT = {};
  function scenario(id) { if (!BUILT[id]) BUILT[id] = build(SCENARIOS[id]); return BUILT[id]; }
  /** 現在剖面上看得到的單元（出現在任一點的）：用格點掃描 */
  function visibleUnits(S, tMa, nx, nz) {
    nx = nx || 160; nz = nz || 100;
    const seen = new Map();
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = (i + 0.5) / nx * W, z = Z_HI - (j + 0.5) / nz * (Z_HI - Z_LO);
      const u = tMa == null ? rockAt(S, x, z, S.events.length) : rockAtTime(S, x, z, tMa);
      if (u !== AIR) seen.set(u, (seen.get(u) || 0) + 1);
    }
    return seen;
  }
  /** 相對定年的正確順序（由老到新，只算看得到的單元；同一事件不重複） */
  function trueOrder(S) {
    const vis = visibleUnits(S);
    return Array.from(vis.keys()).sort(function (a, b) { return a - b; });   // BASE = −1 最老，事件編號越大越年輕
  }
  /** 剖面上可以排序的「事件」：單元加上傾斜、侵蝕、斷層（看得到它們留下的痕跡） */
  function orderItems(S) {
    const vis = visibleUnits(S), items = [];
    if (vis.has(BASE)) items.push(BASE);
    S.events.forEach(function (e, i) {
      if (vis.has(i)) items.push(i);
      else if (e.type === 'tilt' || e.type === 'fault') items.push(i);
      else if (e.type === 'erode' && i < S.events.length - 1) {
        // 只有上面還有沉積蓋住的侵蝕面（不整合）才看得到
        if (S.events.slice(i + 1).some(function (q, j) { return q.type === 'deposit' && vis.has(i + 1 + j); })) items.push(i);
      }
    });
    return items;
  }

  return {
    LN2: LN2, SYSTEMS: SYSTEMS, halfLife: halfLife, ratioAt: ratioAt, ageFrom: ageFrom, ageSigma: ageSigma,
    ISO_X: ISO_X, SR0: SR0, isochron: isochron, fitIsochron: fitIsochron, gauss: gauss,
    AIR: AIR, BASE: BASE, W: W, Z_LO: Z_LO, Z_HI: Z_HI, ROCKS: ROCKS, FOSSILS: FOSSILS, ERAS: ERAS, PERIODS: PERIODS, periodAt: periodAt,
    build: build, rockAt: rockAt, rockAtTime: rockAtTime, countAt: countAt, depositingAt: depositingAt, levelAt: levelAt, unitAge: unitAge, unitRock: unitRock,
    measure: measure, rate: rate, SCENARIOS: SCENARIOS, scenario: scenario, visibleUnits: visibleUnits, trueOrder: trueOrder, orderItems: orderItems,
    faultX: faultX, dikeX: dikeX, forward: forward
  };
});
