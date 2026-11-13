/*
 * electron-configuration-core.js — 「電子組態」的化學核心（純計算、與畫面無關，Node 可直接 require）
 *
 * 內容：
 *   - 19 個副層（1s … 7p）依構築原理的 n + l 規則排出填入順序（n + l 小的先填；相同時 n 小的先填），共 118 個電子。
 *   - 中性原子的基態組態：照 n + l 規則填，再套用 NIST 實測（或理論推估）的 20 個例外。
 *   - 離子：陽離子先從「鈍氣核心以外」的價電子中拿走 n 最大（同 n 時 l 最大）的電子
 *           （所以過渡金屬先失去 ns 再失去 (n − 1)d、鑭系先失去 6s、5d 再失去 4f）；
 *           陰離子照 n + l 規則把電子接著填進去。
 *   - 洪德定則：同一副層內先一個軌域放一個、自旋平行，放滿一輪才開始配對。
 *   - 包立不相容原理：每個軌域最多兩個電子、自旋相反（資料結構上就是每格只有「↑」「↓」兩個位置）。
 *
 * 數據來源：
 *   - 基態電子組態：NIST Atomic Spectra Database（Ground levels and ionization energies for the neutral atoms，
 *     NIST Standard Reference Database 78 與 SP 966「Periodic Table: Atomic Properties of the Elements」）。
 *     104 號以後是理論預測（照 n + l 規則）。
 *   - 103 號鐒（Lr）NIST 列 [Rn]5f14 7s2 7p1（相對論效應讓 7p 低於 6d），不是課本常見的 6d1。
 *
 * 週期表位置照真正的週期表：18 族、7 週期，鑭系（57–71）、錒系（89–103）放在下方兩列（與 periodic-trends 相同）。
 */
(function (root) {
  'use strict';
  const SYM = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
    'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg ' +
    'Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');
  const EN = ('Hydrogen|Helium|Lithium|Beryllium|Boron|Carbon|Nitrogen|Oxygen|Fluorine|Neon|Sodium|Magnesium|Aluminum|Silicon|Phosphorus|' +
    'Sulfur|Chlorine|Argon|Potassium|Calcium|Scandium|Titanium|Vanadium|Chromium|Manganese|Iron|Cobalt|Nickel|Copper|Zinc|Gallium|Germanium|' +
    'Arsenic|Selenium|Bromine|Krypton|Rubidium|Strontium|Yttrium|Zirconium|Niobium|Molybdenum|Technetium|Ruthenium|Rhodium|Palladium|Silver|' +
    'Cadmium|Indium|Tin|Antimony|Tellurium|Iodine|Xenon|Cesium|Barium|Lanthanum|Cerium|Praseodymium|Neodymium|Promethium|Samarium|Europium|' +
    'Gadolinium|Terbium|Dysprosium|Holmium|Erbium|Thulium|Ytterbium|Lutetium|Hafnium|Tantalum|Tungsten|Rhenium|Osmium|Iridium|Platinum|Gold|' +
    'Mercury|Thallium|Lead|Bismuth|Polonium|Astatine|Radon|Francium|Radium|Actinium|Thorium|Protactinium|Uranium|Neptunium|Plutonium|' +
    'Americium|Curium|Berkelium|Californium|Einsteinium|Fermium|Mendelevium|Nobelium|Lawrencium|Rutherfordium|Dubnium|Seaborgium|Bohrium|' +
    'Hassium|Meitnerium|Darmstadtium|Roentgenium|Copernicium|Nihonium|Flerovium|Moscovium|Livermorium|Tennessine|Oganesson').split('|');
  const ZH = ('氫 氦 鋰 鈹 硼 碳 氮 氧 氟 氖 鈉 鎂 鋁 矽 磷 硫 氯 氬 鉀 鈣 鈧 鈦 釩 鉻 錳 鐵 鈷 鎳 銅 鋅 鎵 鍺 砷 硒 溴 氪 ' +
    '銣 鍶 釔 鋯 鈮 鉬 鎝 釕 銠 鈀 銀 鎘 銦 錫 銻 碲 碘 氙 銫 鋇 鑭 鈰 鐠 釹 鉕 釤 銪 釓 鋱 鏑 鈥 鉺 銩 鐿 鎦 鉿 鉭 鎢 錸 鋨 銥 鉑 金 汞 ' +
    '鉈 鉛 鉍 釙 砈 氡 鍅 鐳 錒 釷 鏷 鈾 錼 鈽 鋂 鋦 鉳 鉲 鑀 鐨 鍆 鍩 鐒 鑪 𨧀 𨭎 𨨏 𨭆 䥑 鐽 錀 鎶 鉨 鈇 鏌 鉝 鿬 鿫').split(' ');
  const N = 118;
  const LL = 'spdf';
  const NOBLE = [2, 10, 18, 36, 54, 86, 118];

  // ---------------- 副層與填入順序 ----------------
  /** SUB[i] = { i, n, l, m（軌域數 2l+1）, cap（容量 2(2l+1)）, label（'3d'） }，依 n + l 規則排序 */
  const SUB = [];
  (function () {
    const list = [];
    for (let n = 1; n <= 7; n++) for (let l = 0; l < Math.min(n, 4); l++) list.push([n, l]);
    list.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]; });
    let tot = 0;
    for (let k = 0; k < list.length && tot < N; k++) {
      const n = list[k][0], l = list[k][1], m = 2 * l + 1;
      SUB.push({ i: SUB.length, n: n, l: l, m: m, cap: 2 * m, label: n + LL[l] });
      tot += 2 * m;
    }
  })();
  const NS = SUB.length;   // 19
  function idx(n, l) { for (let i = 0; i < NS; i++) if (SUB[i].n === n && SUB[i].l === l) return i; return -1; }

  /** 照 n + l 規則（構築原理）填 Ne 個電子的各副層電子數 */
  function aufbau(Ne) {
    const occ = new Array(NS).fill(0);
    let left = Math.max(0, Math.min(N, Ne));
    for (let i = 0; i < NS && left > 0; i++) { const k = Math.min(SUB[i].cap, left); occ[i] = k; left -= k; }
    return occ;
  }
  /** '[Ar]3d5 4s1' → 各副層電子數 */
  function parseCfg(s) {
    const occ = new Array(NS).fill(0);
    const m = /^\[([A-Z][a-z]?)\]/.exec(s);
    if (m) { const g = aufbau(SYM.indexOf(m[1]) + 1); for (let i = 0; i < NS; i++) occ[i] += g[i]; }
    (s.replace(/^\[[A-Za-z]+\]/, '').match(/\d[spdf]\d+/g) || []).forEach(function (t) {
      const i = idx(+t.charAt(0), LL.indexOf(t.charAt(1)));
      occ[i] += +t.slice(2);
    });
    return occ;
  }

  /** 不照 n + l 規則的中性原子（NIST 基態組態） */
  const EXC = {
    24: '[Ar]3d5 4s1', 29: '[Ar]3d10 4s1',
    41: '[Kr]4d4 5s1', 42: '[Kr]4d5 5s1', 44: '[Kr]4d7 5s1', 45: '[Kr]4d8 5s1', 46: '[Kr]4d10', 47: '[Kr]4d10 5s1',
    57: '[Xe]5d1 6s2', 58: '[Xe]4f1 5d1 6s2', 64: '[Xe]4f7 5d1 6s2', 78: '[Xe]4f14 5d9 6s1', 79: '[Xe]4f14 5d10 6s1',
    89: '[Rn]6d1 7s2', 90: '[Rn]6d2 7s2', 91: '[Rn]5f2 6d1 7s2', 92: '[Rn]5f3 6d1 7s2', 93: '[Rn]5f4 6d1 7s2', 96: '[Rn]5f7 6d1 7s2',
    103: '[Rn]5f14 7s2 7p1'
  };
  const EXC_OCC = {};
  Object.keys(EXC).forEach(function (z) { EXC_OCC[z] = parseCfg(EXC[z]); });
  function isException(Z) { return !!EXC[Z]; }
  function isPredicted(Z) { return Z >= 104; }
  /** 中性原子的基態 */
  function groundNeutral(Z) { return EXC_OCC[Z] ? EXC_OCC[Z].slice() : aufbau(Z); }

  // ---------------- 週期表位置 ----------------
  const PERIOD_END = [2, 10, 18, 36, 54, 86, 118];
  function period(Z) { for (let p = 0; p < 7; p++) if (Z <= PERIOD_END[p]) return p + 1; return null; }
  /** period 週期、group 族（鑭系錒系 null）、row/col 畫面上的列與行（鑭系 row 9、錒系 row 10） */
  function pos(Z) {
    const p = period(Z);
    if ((Z >= 57 && Z <= 71) || (Z >= 89 && Z <= 103)) {
      return { period: p, group: null, row: Z <= 71 ? 9 : 10, col: 3 + (Z <= 71 ? Z - 57 : Z - 89), f: true };
    }
    let g;
    if (Z === 1) g = 1;
    else if (Z === 2) g = 18;
    else if (p <= 3) { const k = Z - PERIOD_END[p - 2] - 1; g = k < 2 ? k + 1 : k + 11; }
    else if (p <= 5) g = Z - PERIOD_END[p - 2];
    else { const k = Z - PERIOD_END[p - 2]; g = k <= 2 ? k : k - 14; }
    return { period: p, group: g, row: p, col: g, f: false };
  }
  function block(Z) {
    const q = pos(Z);
    if (q.f) return 'f';
    if (Z === 2 || q.group <= 2) return 's';
    if (q.group >= 13) return 'p';
    return 'd';
  }
  /** 比 Z 小的最大鈍氣原子序（鈍氣核心）；沒有則 0 */
  function coreNoble(Z) { let g = 0; NOBLE.forEach(function (x) { if (x < Z) g = x; }); return g; }
  function nextNoble(Z) { for (let k = 0; k < NOBLE.length; k++) if (NOBLE[k] >= Z) return NOBLE[k]; return N; }

  // ---------------- 離子 ----------------
  /** 這個元素在本實驗可選的電荷範圍：陽離子到 +4（但不超過 Z）；陰離子只給氫與第 15–17 族，最多補到下一個鈍氣 */
  function chargeRange(Z) {
    const g = pos(Z).group;
    const qmax = Math.min(4, Z);
    let qmin = 0;
    if (Z === 1 || (g >= 15 && g <= 17)) qmin = Math.max(-3, Z - nextNoble(Z));
    return { min: qmin, max: qmax };
  }
  function clampQ(Z, q) { const r = chargeRange(Z); return Math.max(r.min, Math.min(r.max, Math.round(q))); }
  /** 陽離子拿電子的順序：先拿鈍氣核心以外的電子，n 大的先、同 n 時 l 大的先；核心以外拿完才拿核心 */
  function removalIndex(occ, coreOcc) {
    let best = -1;
    const better = function (i, j) { return j < 0 || SUB[i].n > SUB[j].n || (SUB[i].n === SUB[j].n && SUB[i].l > SUB[j].l); };
    for (let i = 0; i < NS; i++) if (occ[i] - coreOcc[i] > 0 && better(i, best)) best = i;
    if (best >= 0) return best;
    for (let i = 0; i < NS; i++) if (occ[i] > 0 && better(i, best)) best = i;
    return best;
  }
  /** 陰離子加電子的位置：n + l 順序中第一個沒滿的副層 */
  function additionIndex(occ) { for (let i = 0; i < NS; i++) if (occ[i] < SUB[i].cap) return i; return -1; }
  /** 原子或離子（電荷 q）的基態各副層電子數 */
  function config(Z, q) {
    q = q || 0;
    const occ = groundNeutral(Z), core = aufbau(coreNoble(Z));
    for (let k = 0; k < q; k++) { const i = removalIndex(occ, core); if (i < 0) break; occ[i]--; }
    for (let k = 0; k < -q; k++) { const i = additionIndex(occ); if (i < 0) break; occ[i]++; }
    return occ;
  }
  function total(occ) { return occ.reduce(function (a, b) { return a + b; }, 0); }

  // ---------------- 洪德定則與軌域圖 ----------------
  /** 第 k 個（從 0 起）放進這個副層的電子，照洪德定則放在哪一格、哪一種自旋 */
  function slotOf(k, m) { return k < m ? { o: k, spin: 0 } : { o: k - m, spin: 1 }; }   // spin 0 = ↑、1 = ↓
  /** 各副層電子數 → 軌域圖：boxes[i][o] = [↑ 有沒有, ↓ 有沒有] */
  function boxesOf(occ) {
    return SUB.map(function (s, i) {
      const b = []; for (let o = 0; o < s.m; o++) b.push([0, 0]);
      for (let k = 0; k < occ[i]; k++) { const t = slotOf(k, s.m); b[t.o][t.spin] = 1; }
      return b;
    });
  }
  function emptyBoxes() { return boxesOf(new Array(NS).fill(0)); }
  /** 照洪德定則，一個副層 k 個電子時的未成對電子數 */
  function unpairedIn(k, m) { return k <= m ? k : 2 * m - k; }
  function unpaired(occ) { let u = 0; for (let i = 0; i < NS; i++) u += unpairedIn(occ[i], SUB[i].m); return u; }

  // ---------------- 文字表示 ----------------
  /** [[n, l, 電子數], …]，依 n、再依 l 排序（NIST 的寫法），只列有電子的副層 */
  function tokens(occ) {
    const out = [];
    for (let i = 0; i < NS; i++) if (occ[i] > 0) out.push([SUB[i].n, SUB[i].l, occ[i]]);
    return out.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }
  function contains(occ, g) { const a = aufbau(g); for (let i = 0; i < NS; i++) if (a[i] > 0 && occ[i] < a[i]) return false; return true; }
  /** 鈍氣核心簡寫：最大的、完整包含在組態裡、而且比總電子數少的鈍氣 */
  function shortForm(occ) {
    const Ne = total(occ);
    let g = 0;
    NOBLE.forEach(function (x) { if (x < Ne && contains(occ, x)) g = x; });
    const a = aufbau(g), rest = occ.map(function (k, i) { return k - a[i]; });
    return { core: g ? SYM[g - 1] : null, coreZ: g, tokens: tokens(rest) };
  }
  /** 組態剛好等於某個鈍氣原子時傳回那個鈍氣的原子序，否則 0 */
  function nobleMatch(occ) {
    const Ne = total(occ);
    if (NOBLE.indexOf(Ne) < 0) return 0;
    const a = aufbau(Ne);
    for (let i = 0; i < NS; i++) if (a[i] !== occ[i]) return 0;
    return Ne;
  }
  function cfgText(occ, short) {
    const f = short ? shortForm(occ) : { core: null, tokens: tokens(occ) };
    const t = f.tokens.map(function (x) { return x[0] + LL[x[1]] + x[2]; }).join(' ');
    return (f.core ? '[' + f.core + ']' : '') + (f.core && t ? ' ' : '') + t;
  }
  /** 比對用的鍵：'1s2 2s2 2p6 3p1' */
  function key(occ) { return cfgText(occ, false); }
  /** 最高的（n + l 順序中最後一個）有電子的副層 */
  function highest(occ) { let h = -1; for (let i = 0; i < NS; i++) if (occ[i] > 0) h = i; return h; }
  /** 主族元素（中性）的價電子數：最外層 s + p；過渡元素 null */
  function valence(Z) {
    const b = block(Z);
    if (b === 'd' || b === 'f') return null;
    const occ = groundNeutral(Z);
    let nmax = 0; for (let i = 0; i < NS; i++) if (occ[i] > 0) nmax = Math.max(nmax, SUB[i].n);
    let v = 0; for (let i = 0; i < NS; i++) if (SUB[i].n === nmax && SUB[i].l <= 1) v += occ[i];
    return v;
  }

  // ---------------- 自己填：檢查 ----------------
  /**
   * 學生自己填的軌域圖 boxes 與粒子 (Z, q) 的基態比較。
   * 傳回 { N, count, occ, occMatch, hundOK, hundBad（違反洪德的副層）, aufbauOK, ground, unpaired, key }
   *   ground：電子數、每個副層的電子數都和基態一樣，而且每個副層都照洪德定則（未成對數最多、自旋平行）。
   */
  function evaluate(boxes, Z, q) {
    const target = config(Z, q), Ntar = total(target);
    const occ = boxes.map(function (b) { return b.reduce(function (a, o) { return a + o[0] + o[1]; }, 0); });
    const count = total(occ);
    let occMatch = true;
    for (let i = 0; i < NS; i++) if (occ[i] !== target[i]) occMatch = false;
    const hundBad = [];
    let un = 0;
    boxes.forEach(function (b, i) {
      const singles = b.filter(function (o) { return o[0] + o[1] === 1; });
      un += singles.length;
      if (!occ[i]) return;
      const spins = singles.map(function (o) { return o[0] ? 0 : 1; });
      const parallel = spins.every(function (s) { return s === spins[0]; });
      if (singles.length !== unpairedIn(occ[i], SUB[i].m) || !parallel) hundBad.push(i);
    });
    let aufbauOK = true, seenGap = false;
    for (let i = 0; i < NS; i++) {
      if (occ[i] > 0 && seenGap) aufbauOK = false;
      if (occ[i] < SUB[i].cap) seenGap = true;
    }
    return {
      N: Ntar, count: count, occ: occ, occMatch: occMatch, hundOK: !hundBad.length, hundBad: hundBad,
      aufbauOK: aufbauOK, ground: occMatch && !hundBad.length && count === Ntar, unpaired: un, key: key(occ)
    };
  }

  // ---------------- 逐一填入：動畫的步驟 ----------------
  /**
   * 從空的軌域圖開始，一步一步做出 (Z, q) 的基態：
   *   1. 照 n + l 規則放進 Z 個電子（phase 'aufbau'）；
   *   2. 例外原子把電子從構築原理的位置搬到真正的位置（'exception'，type 'move'）；
   *   3. 陽離子拿走電子（'ionize'）；陰離子再放進電子（'anion'）。
   * 每一步 { type: 'add'|'remove'|'move', s, o, spin, [s2, o2, spin2], phase }；move 是從 (s, o, spin) 搬到 (s2, o2, spin2)。
   */
  function steps(Z, q) {
    q = q || 0;
    const out = [], occ = new Array(NS).fill(0);
    const add = function (i, phase) { const t = slotOf(occ[i], SUB[i].m); occ[i]++; return { type: 'add', s: i, o: t.o, spin: t.spin, phase: phase }; };
    const rem = function (i, phase) { occ[i]--; const t = slotOf(occ[i], SUB[i].m); return { type: 'remove', s: i, o: t.o, spin: t.spin, phase: phase }; };
    for (let k = 0; k < Z; k++) out.push(add(additionIndex(occ), 'aufbau'));
    const g = groundNeutral(Z);
    const from = [], to = [];
    for (let i = NS - 1; i >= 0; i--) for (let k = occ[i]; k > g[i]; k--) from.push(i);
    for (let i = 0; i < NS; i++) for (let k = occ[i]; k < g[i]; k++) to.push(i);
    for (let k = 0; k < from.length; k++) {
      const r = rem(from[k], 'exception'), a = add(to[k], 'exception');
      out.push({ type: 'move', s: r.s, o: r.o, spin: r.spin, s2: a.s, o2: a.o, spin2: a.spin, phase: 'exception' });
    }
    const core = aufbau(coreNoble(Z));
    for (let k = 0; k < q; k++) { const i = removalIndex(occ, core); if (i < 0) break; out.push(rem(i, 'ionize')); }
    for (let k = 0; k < -q; k++) { const i = additionIndex(occ); if (i < 0) break; out.push(add(i, 'anion')); }
    return out;
  }
  /** 把一步套用在 boxes 上（會改 boxes） */
  function apply(boxes, st) {
    if (st.type === 'add') boxes[st.s][st.o][st.spin] = 1;
    else if (st.type === 'remove') boxes[st.s][st.o][st.spin] = 0;
    else { boxes[st.s][st.o][st.spin] = 0; boxes[st.s2][st.o2][st.spin2] = 1; }
    return boxes;
  }
  /** 「先填好鈍氣核心」用的核心：不超過電子數、而且完整包含在基態裡的最大鈍氣 */
  function buildCore(Z, q) {
    const occ = config(Z, q), Ne = total(occ);
    let g = 0;
    NOBLE.forEach(function (x) { if (x <= coreNoble(Z) && x <= Ne && contains(occ, x)) g = x; });
    return g;
  }

  const api = {
    N: N, SYM: SYM, EN: EN, ZH: ZH, SUB: SUB, NS: NS, NOBLE: NOBLE, EXC: EXC, LL: LL,
    idx: idx, aufbau: aufbau, parseCfg: parseCfg, isException: isException, isPredicted: isPredicted, groundNeutral: groundNeutral,
    period: period, pos: pos, block: block, coreNoble: coreNoble, nextNoble: nextNoble,
    chargeRange: chargeRange, clampQ: clampQ, config: config, total: total,
    slotOf: slotOf, boxesOf: boxesOf, emptyBoxes: emptyBoxes, unpairedIn: unpairedIn, unpaired: unpaired,
    tokens: tokens, shortForm: shortForm, nobleMatch: nobleMatch, cfgText: cfgText, key: key, highest: highest, valence: valence,
    evaluate: evaluate, steps: steps, apply: apply, buildCore: buildCore
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ECCore = api;
})(typeof window !== 'undefined' ? window : this);
