/* cell-division-core.js — 細胞分裂的核心（與畫面分離，Node 可直接 require）
 *
 * 染色體的表示：n 對同源染色體，第 p 對有母方（h = 0，記 M）與父方（h = 1，記 P）各一條；複製後每條有兩條姊妹染色分體（s = 0、1）。
 * 每條染色分體記成沿長度 0–1 的片段清單 [{a, b, o}]，o 是那一段 DNA 來自母方（0）或父方（1），互換之後一條分體會變成兩種顏色。
 * 第 0 對上有兩個基因座：A（位置 posA）與 B（位置 posB）；母方帶 A、B，父方帶 a、b（相引相）。
 *
 * 互換（Haldane 1919 的無干擾模型）：一個二價體上的交叉（chiasma）是沿染色體的卜瓦松過程，每 Morgan 平均 2 個；
 * 每個交叉隨機挑母方一條、父方一條分體交換尾段。於是一條配子分體上的交換次數是每 Morgan 1 次的卜瓦松過程，
 * 相距 d Morgan 的兩個基因座重組率 r = (1 − e^(−2d))/2（Haldane 作圖函數）：d 小時 r ≈ d，d 很大時 r → 50%。
 * 獨立分配：第一次分裂中期每一對二價體的方向各自隨機（機率 1/2），n 對有 2^n 種組合（Mendel 第二定律的細胞基礎）。
 * 不分離：指定的一對在第一次分裂（同源染色體不分開）或第二次分裂（姊妹分體不分開）走到同一極。
 *
 * 時間軸 frame(rec, τ)：依時期算出細胞、紡錘體極、核膜、每條分體的位置與凝縮程度（2D 用 x、y；3D 另有 z）；counts(rec, τ) 算每個細胞的染色體數、DNA 量。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CellCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 可重現的亂數（mulberry32） */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(lambda, R) {
    if (lambda <= 0) return 0;
    if (lambda > 30) { // 常態近似（只在很長的染色體才會用到）
      const u = Math.max(1e-12, R()), v = R();
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
    }
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= R(); } while (p > L);
    return k - 1;
  }
  /** Haldane 作圖函數：距離 d（Morgan）→ 重組率 */
  function haldane(d) { return 0.5 * (1 - Math.exp(-2 * Math.max(0, d))); }
  function haldaneInv(r) { return r >= 0.5 ? Infinity : -0.5 * Math.log(1 - 2 * r); }
  /** n 對染色體、N 個配子時，平均會看到幾種不同的組合（每種機率 2^−n） */
  function expectDistinct(n, N) { const K = Math.pow(2, n); return K * (1 - Math.pow(1 - 1 / K, N)); }

  // 畫面用的各對染色體（相對長度、著絲點位置）；長度也當作遺傳長度（Morgan）
  const PAIRS = [
    { L: 1.6, cen: 0.42 }, { L: 1.3, cen: 0.3 }, { L: 1.0, cen: 0.46 }, { L: 0.8, cen: 0.22 },
    { L: 0.7, cen: 0.38 }, { L: 0.6, cen: 0.5 }
  ];
  const LOCI = { A: 0.18, B: 0.72 };   // 第一部分第 0 對上 A、B 的位置（長度比例）

  function seg(o) { return [{ a: 0, b: 1, o: o }]; }
  function cut(segs, x) {   // 在 x 切開，回傳 [前段, 後段]
    const head = [], tail = [];
    segs.forEach(function (s) {
      if (s.b <= x) head.push({ a: s.a, b: s.b, o: s.o });
      else if (s.a >= x) tail.push({ a: s.a, b: s.b, o: s.o });
      else { head.push({ a: s.a, b: x, o: s.o }); tail.push({ a: x, b: s.b, o: s.o }); }
    });
    return [head, tail];
  }
  function merge(segs) {
    const out = [];
    segs.forEach(function (s) {
      const l = out[out.length - 1];
      if (l && l.o === s.o && Math.abs(l.b - s.a) < 1e-12) l.b = s.b; else out.push({ a: s.a, b: s.b, o: s.o });
    });
    return out;
  }
  function originAt(segs, x) {
    for (let i = 0; i < segs.length; i++) if (x >= segs[i].a && x <= segs[i].b) return segs[i].o;
    return segs[segs.length - 1].o;
  }

  /**
   * 一次細胞分裂的紀錄。o = {mode: 'mitosis'|'meiosis', n（對數）, xo（互換開關）, lengths（每對的 Morgan 長度，可省略）,
   *   nd: 0（無）| 1（第一次分裂不分離）| 2（第二次分裂不分離）, ndPair（哪一對，預設 0）, seed}
   * 回傳 {mode, n, chromatids[(p, h, s) → segs], xo[{p, x, a, b}]（a、b 是交換的兩條分體的索引）, mi[p]（母方去哪一極：0 左、1 右）, mii[p][h]（哪條姊妹去上方）,
   *       nd, ndPair, ndPole, ndCell, gametes[4 或 2]}
   */
  function make(o) {
    o = Object.assign({ mode: 'meiosis', n: 2, xo: true, nd: 0, ndPair: 0, seed: 1 }, o);
    const R = rng(o.seed);
    const n = o.n;
    const len = function (p) { return o.lengths ? o.lengths[p] : PAIRS[p % PAIRS.length].L; };
    const ch = [];   // 索引 (p*2 + h)*2 + s
    for (let p = 0; p < n; p++) for (let h = 0; h < 2; h++) for (let s = 0; s < 2; s++) ch.push(seg(h));
    const idx = function (p, h, s) { return (p * 2 + h) * 2 + s; };
    const rec = { mode: o.mode, n: n, xo: [], mi: [], mii: [], nd: o.mode === 'meiosis' ? o.nd : 0, ndPair: o.ndPair, ndPole: 0, ndCell: 0, idx: idx, chromatids: ch, lengths: [] };
    rec.cens = [];
    for (let p = 0; p < n; p++) { rec.lengths.push(len(p)); rec.cens.push(o.cens ? o.cens[p] : PAIRS[p % PAIRS.length].cen); }
    if (o.mode === 'meiosis') {
      // 互換
      if (o.xo) {
        for (let p = 0; p < n; p++) {
          const k = poisson(2 * len(p), R);
          const xs = []; for (let i = 0; i < k; i++) xs.push(R());
          xs.sort(function (a, b) { return a - b; });
          xs.forEach(function (x) {
            // 在交叉的位置上挑一條「這一段是母方」的分體與一條「這一段是父方」的分體（前面的交換已經改變了尾段的來源）
            const four = [idx(p, 0, 0), idx(p, 0, 1), idx(p, 1, 0), idx(p, 1, 1)];
            const mat = four.filter(function (c) { return originAt(ch[c], x) === 0; }), pat = four.filter(function (c) { return originAt(ch[c], x) === 1; });
            const a = mat[R() < 0.5 ? 0 : 1], b = pat[R() < 0.5 ? 0 : 1];
            // 交換不含著絲點的那一段：分體的身分（往哪一極走）跟著著絲點
            const ca = cut(ch[a], x), cb = cut(ch[b], x);
            if (x >= rec.cens[p]) { ch[a] = merge(ca[0].concat(cb[1])); ch[b] = merge(cb[0].concat(ca[1])); }
            else { ch[a] = merge(cb[0].concat(ca[1])); ch[b] = merge(ca[0].concat(cb[1])); }
            rec.xo.push({ p: p, x: x, a: a, b: b });
          });
        }
      }
      // 第一次分裂：每一對的方向各自隨機
      for (let p = 0; p < n; p++) rec.mi.push(R() < 0.5 ? 0 : 1);
      // 第二次分裂：每條染色體哪一條姊妹去上方
      for (let p = 0; p < n; p++) rec.mii.push([R() < 0.5 ? 0 : 1, R() < 0.5 ? 0 : 1]);
      rec.ndPole = R() < 0.5 ? 0 : 1;
      rec.ndCell = R() < 0.5 ? 0 : 1;
    } else {
      for (let p = 0; p < n; p++) rec.mii.push([R() < 0.5 ? 0 : 1, R() < 0.5 ? 0 : 1]);
    }
    rec.dest = destinations(rec);
    rec.gametes = gametesOf(rec);
    return rec;
  }

  /** 每條分體最後到哪一個細胞，以及第一次分裂後在哪一個細胞（減數分裂：0 左、1 右；最後 0 左上、1 左下、2 右上、3 右下） */
  function destinations(rec) {
    const n = rec.n, d1 = [], d2 = [];
    for (let p = 0; p < n; p++) for (let h = 0; h < 2; h++) for (let s = 0; s < 2; s++) {
      const c = rec.idx(p, h, s);
      if (rec.mode === 'mitosis') {
        const side = rec.mii[p][h] === s ? 0 : 1;
        d1[c] = side; d2[c] = side;
        continue;
      }
      // 第一次分裂
      let cell = h === 0 ? rec.mi[p] : 1 - rec.mi[p];
      if (rec.nd === 1 && p === rec.ndPair) cell = rec.ndPole;
      d1[c] = cell;
      // 第二次分裂：上（0）或下（1）
      let up = rec.mii[p][h] === s ? 0 : 1;
      if (rec.nd === 2 && p === rec.ndPair && cell === rec.ndCell) up = rec.ndPole;
      d2[c] = cell * 2 + up;
    }
    return { d1: d1, d2: d2 };
  }
  /** 配子（減數分裂 4 個）或子細胞（有絲分裂 2 個）：每個是染色體清單 [{p, h, segs, sis（還連著幾條分體）}] */
  function gametesOf(rec) {
    const k = rec.mode === 'mitosis' ? 2 : 4;
    const out = []; for (let i = 0; i < k; i++) out.push([]);
    for (let p = 0; p < rec.n; p++) for (let h = 0; h < 2; h++) for (let s = 0; s < 2; s++) {
      const c = rec.idx(p, h, s);
      out[rec.dest.d2[c]].push({ p: p, h: h, s: s, segs: rec.chromatids[c] });
    }
    return out;
  }
  /** 配子在第 0 對上 A、B 的基因型（例如 'AB'、'Ab'）；第 0 對有幾條就寫幾組，沒有寫 '—' */
  function genotype(g, posA, posB) {
    posA = posA == null ? LOCI.A : posA; posB = posB == null ? LOCI.B : posB;
    const c0 = g.filter(function (q) { return q.p === 0; });
    if (!c0.length) return '—';
    return c0.map(function (q) { return (originAt(q.segs, posA) ? 'a' : 'A') + (originAt(q.segs, posB) ? 'b' : 'B'); }).join('/');
  }
  function isRecombinant(geno) { return geno === 'Ab' || geno === 'aB'; }
  /** 配子在著絲點處的來源組合（每對寫 M 或 P） */
  function originPattern(g, n) {
    let s = '';
    for (let p = 0; p < n; p++) {
      const c = g.filter(function (q) { return q.p === p; });
      s += c.length === 1 ? (c[0].h ? 'P' : 'M') : c.length === 0 ? '0' : '2';
    }
    return s;
  }

  /**
   * 第二部分：很多次減數分裂的統計。o = {d（A–B 距離，Morgan）, n（對數）, N（次數）, seed}
   * 第 0 對的長度取 d + 0.4，著絲點在一端，A 在 0.2 Morgan、B 在 0.2 + d。回傳每種配子的數目、重組數、來源組合（著絲點處）清單。
   */
  function batch(o) {
    const n = o.n || 1, d = o.d, L0 = d + 0.4;
    const lengths = [], cens = []; for (let p = 0; p < n; p++) { lengths.push(p === 0 ? L0 : 1); cens.push(0); }
    const posA = 0.2 / L0, posB = (0.2 + d) / L0;
    const cnt = { AB: 0, Ab: 0, aB: 0, ab: 0 };
    const pats = [];
    let seed = o.seed || 1;
    const R = rng(seed);
    for (let i = 0; i < o.N; i++) {
      const rec = make({ mode: 'meiosis', n: n, xo: true, lengths: lengths, cens: cens, seed: Math.floor(R() * 4294967295) + 1 });
      rec.gametes.forEach(function (g) {
        const ge = genotype(g, posA, posB);
        cnt[ge] = (cnt[ge] || 0) + 1;
        let s = '';
        for (let p = 0; p < n; p++) { const c = g.filter(function (q) { return q.p === p; })[0]; s += c.h ? 'P' : 'M'; }
        pats.push(s);
      });
    }
    return { counts: cnt, rec: cnt.Ab + cnt.aB, total: 4 * o.N, patterns: pats };
  }
  /** 比例的 95% 信賴區間（Wilson） */
  function wilson(k, N) {
    if (!N) return [0, 1];
    const z = 1.96, p = k / N, den = 1 + z * z / N;
    const c = (p + z * z / (2 * N)) / den, h = z * Math.sqrt(p * (1 - p) / N + z * z / (4 * N * N)) / den;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }

  // =====================================================================
  // 時間軸
  // =====================================================================
  const STAGES = {
    mitosis: [
      { k: 'G1', d: 1.0 }, { k: 'S', d: 1.2 }, { k: 'G2', d: 0.7 }, { k: 'pro', d: 1.3 }, { k: 'prometa', d: 1.0 },
      { k: 'meta', d: 1.1 }, { k: 'ana', d: 1.1 }, { k: 'telo', d: 1.5 }
    ],
    meiosis: [
      { k: 'G1', d: 0.8 }, { k: 'S', d: 1.0 }, { k: 'G2', d: 0.6 }, { k: 'pro1', d: 2.2 }, { k: 'meta1', d: 1.3 }, { k: 'ana1', d: 1.1 },
      { k: 'telo1', d: 1.3 }, { k: 'pro2', d: 0.9 }, { k: 'meta2', d: 1.1 }, { k: 'ana2', d: 1.0 }, { k: 'telo2', d: 1.4 }
    ]
  };
  function total(mode) { return STAGES[mode].reduce(function (a, s) { return a + s.d; }, 0); }
  /** τ → {i（時期序號）, k, f（這一期的進度 0–1）} */
  function stageAt(mode, tau) {
    const st = STAGES[mode];
    let t = Math.max(0, tau);
    for (let i = 0; i < st.length; i++) {
      if (t < st[i].d || i === st.length - 1) return { i: i, k: st[i].k, f: Math.min(1, t / st[i].d) };
      t -= st[i].d;
    }
  }
  function stageStart(mode, i) { let t = 0; for (let j = 0; j < i; j++) t += STAGES[mode][j].d; return t; }
  const ease = function (x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  const lerp = function (a, b, u) { return a + (b - a) * u; };
  const ramp = function (f, a, b) { return ease((f - a) / (b - a)); };

  /** 細胞分裂完成到哪裡：第幾次分裂已經把細胞分開（0、1、2） */
  function divided(rec, s) {
    const i = s.i, k = s.k;
    if (rec.mode === 'mitosis') return (k === 'telo' && s.f >= 0.6) ? 1 : 0;
    if (i > 6 || (k === 'telo1' && s.f >= 0.6)) { if (k === 'telo2' && s.f >= 0.6) return 2; return 1; }
    return 0;
  }
  /** 姊妹分體還連在一起嗎（著絲點還沒分開） */
  function joined(rec, s) {
    if (rec.mode === 'mitosis') return ['ana', 'telo'].indexOf(s.k) < 0;
    return ['ana2', 'telo2'].indexOf(s.k) < 0;
  }
  /** 複製進度：S 期從 0 到 1 */
  function replicated(rec, s) { return s.k === 'G1' ? 0 : s.k === 'S' ? s.f : 1; }

  /** 每條分體目前屬於哪個細胞（依已經完成的分裂） */
  function cellOf(rec, c, dv) {
    if (dv === 0) return 0;
    if (rec.mode === 'mitosis') return rec.dest.d1[c];
    return dv === 1 ? rec.dest.d1[c] : rec.dest.d2[c];
  }
  /**
   * 每個細胞的染色體數（數著絲點）、染色分體數、DNA 量（C；G1 的二倍體 = 2C，用每對的相對長度加權：一套單倍體的總長度 = 1C）
   */
  function counts(rec, tau) {
    const s = stageAt(rec.mode, tau), dv = divided(rec, s), rep = replicated(rec, s), jn = joined(rec, s);
    const ncell = dv === 0 ? 1 : rec.mode === 'mitosis' ? 2 : dv === 1 ? 2 : 4;
    const cells = []; for (let i = 0; i < ncell; i++) cells.push({ chrom: 0, chromatids: 0, dna: 0 });
    let hap = 0; for (let p = 0; p < rec.n; p++) hap += rec.lengths[p];
    for (let p = 0; p < rec.n; p++) for (let h = 0; h < 2; h++) {
      const c0 = rec.idx(p, h, 0), c1 = rec.idx(p, h, 1);
      const a = cellOf(rec, c0, dv), b = cellOf(rec, c1, dv);
      const w = rec.lengths[p] / hap;
      if (rep === 0) { cells[a].chrom++; cells[a].chromatids++; cells[a].dna += w; continue; }
      if (jn && a === b) {
        cells[a].chrom++; cells[a].chromatids += 2; cells[a].dna += w * (1 + rep);
      } else {
        cells[a].chrom++; cells[a].chromatids++; cells[a].dna += w;
        cells[b].chrom++; cells[b].chromatids++; cells[b].dna += w;
      }
    }
    return { stage: s, cells: cells, joined: jn, replicated: rep, divided: dv };
  }

  // ---------- 幾何：世界座標（單一細胞半徑 1，中心在原點；紡錘體沿 x） ----------
  const NUC = 0.6;
  function homePos(p, h, n) {
    const k = p * 2 + h, m = 2 * n;
    const ang = k * 2.39996 + 0.7, r = NUC * (0.28 + 0.5 * Math.sqrt((k + 0.5) / m));
    return [r * Math.cos(ang), r * Math.sin(ang) * 0.92];
  }
  /** 中期板上第 k 個（共 m 個）的位置：2D 沿 y 排；3D 在圓盤上以向日葵排列 */
  function plate(k, m, span) {
    const sp = Math.min(0.17, (span || 1.5) / Math.max(1, m));
    const y2 = (k - (m - 1) / 2) * sp;
    const r = 0.62 * Math.sqrt((k + 0.5) / m), a = k * 2.39996;
    return { y2: y2, y3: r * Math.cos(a), z3: r * Math.sin(a) };
  }
  /** 沿一條線依序排開長度 lens 的物體（間隔 gap），回傳各自的中心（以 0 為中點） */
  function linePos(lens, gap, maxTot) {
    const tot = lens.reduce(function (a, b) { return a + b; }, 0) + gap * Math.max(0, lens.length - 1);
    const sc = maxTot && tot > maxTot ? maxTot / tot : 1;   // 太擠時等比例壓縮（染色體會稍微交錯重疊）
    let y = -tot / 2; const out = [];
    lens.forEach(function (L) { out.push((y + L / 2) * sc); y += L + gap; });
    return out;
  }
  /** 細胞的中心與半徑（含分裂中的兩個圓） */
  function cellShapes(rec, s) {
    const k = s.k, f = s.f;
    if (rec.mode === 'mitosis') {
      if (k !== 'telo') return [{ x: 0, y: 0, r: 1 }];
      const u = ease(f / 0.85);
      return [{ x: -lerp(0.3, 1.05, u), y: 0, r: lerp(1, 0.75, u) }, { x: lerp(0.3, 1.05, u), y: 0, r: lerp(1, 0.75, u) }];
    }
    const i = s.i;
    if (i < 6) return [{ x: 0, y: 0, r: 1 }];
    if (k === 'telo1') {
      const u = ease(f / 0.85);
      return [{ x: -lerp(0.3, 1.05, u), y: 0, r: lerp(1, 0.75, u) }, { x: lerp(0.3, 1.05, u), y: 0, r: lerp(1, 0.75, u) }];
    }
    if (k !== 'telo2') return [{ x: -1.05, y: 0, r: 0.75 }, { x: 1.05, y: 0, r: 0.75 }];
    const u = ease(f / 0.85), out = [];
    [-1.05, 1.05].forEach(function (cx) {
      out.push({ x: cx, y: -lerp(0.22, 0.62, u), r: lerp(0.75, 0.52, u) });
      out.push({ x: cx, y: lerp(0.22, 0.62, u), r: lerp(0.75, 0.52, u) });
    });
    return out;
  }

  /**
   * 這一刻的畫面：{stage, cells[{x, y, r}], pinch（分裂中：成對的細胞索引）, poles[{x, y, z, cell}], envelope（核膜 0–1）, spindle（0–1）,
   *   nuclei[{x, y, r, a}], chromatids[{c, p, h, s, x, y, z, ang, len, cond（凝縮 0–1）, rep（這條分體出現的程度）, segs, pole（被哪一極拉，−1 沒有）, sx, sy}],
   *   chiasmata[{x, y, z}], synapsis（0–1）}
   * 姊妹分體並排：sx、sy 是另一條姊妹相對的方向（單位向量）。
   */
  function frame(rec, tau) {
    const s = stageAt(rec.mode, tau), k = s.k, f = s.f, n = rec.n;
    const out = { stage: s, cells: cellShapes(rec, s), poles: [], envelope: 1, spindle: 0, nuclei: [], chromatids: [], chiasmata: [], synapsis: 0 };
    const isMe = rec.mode === 'meiosis';
    const rep = replicated(rec, s);
    // 核膜與紡錘體
    const pre = ['G1', 'S', 'G2'].indexOf(k) >= 0;
    if (pre) out.envelope = 1;
    else if (k === 'pro') out.envelope = 1 - 0.5 * ramp(f, 0.5, 1);
    else if (k === 'pro1') out.envelope = 1 - 0.5 * ramp(f, 0.7, 1);
    else if (k === 'prometa') out.envelope = 0.5 * (1 - ramp(f, 0, 0.5));
    else if (k === 'meta1') out.envelope = 0.5 * (1 - ramp(f, 0, 0.35));
    else if (k === 'pro2') out.envelope = 0;
    else out.envelope = 0;
    const SPIN = { pro: function () { return 0.5 * ramp(f, 0.4, 1); }, prometa: function () { return 0.5 + 0.5 * ramp(f, 0, 0.6); }, meta: 1, ana: 1, telo: function () { return 1 - ramp(f, 0.2, 0.7); },
      pro1: function () { return 0.5 * ramp(f, 0.65, 1); }, meta1: function () { return 0.5 + 0.5 * ramp(f, 0, 0.4); }, ana1: 1, telo1: function () { return 1 - ramp(f, 0.2, 0.7); },
      pro2: function () { return ramp(f, 0.3, 1); }, meta2: 1, ana2: 1, telo2: function () { return 1 - ramp(f, 0.2, 0.7); } };
    const sp = SPIN[k]; out.spindle = sp == null ? 0 : typeof sp === 'function' ? sp() : sp;

    // 紡錘體極（中心體）
    const twoCells = isMe && s.i >= 7;
    if (!twoCells) {
      let px = 0.82;
      if (k === 'G2') px = 0.06 + 0.04 * f;
      else if (k === 'pro' || k === 'pro1') px = lerp(0.1, 0.82, ramp(f, k === 'pro' ? 0.1 : 0.45, 1));
      else if (pre) px = 0.06;
      if (k === 'telo' || k === 'telo1') { const cs = out.cells; px = cs.length > 1 ? Math.abs(cs[1].x) + lerp(0.52, 0.72, ramp(f, 0, 0.85)) * cs[1].r : 0.82; }   // 中心體留在新細胞核外
      const py = pre || (k === 'pro' && f < 0.1) ? -NUC - 0.12 : 0;
      out.poles.push({ x: -px, y: py, z: 0, cell: 0 }, { x: px, y: py, z: 0, cell: 0 });
      if (k === 'G1' || k === 'S') out.poles = [{ x: 0, y: -NUC - 0.12, z: 0, cell: 0 }];
    } else {
      [-1.05, 1.05].forEach(function (cx, ci) {
        let py = 0.55;
        if (k === 'pro2') py = lerp(0.08, 0.55, ramp(f, 0, 0.8));
        if (k === 'telo2') { const c = out.cells[ci * 2 + 1]; py = c.y + lerp(0.44, 0.72, ramp(f, 0, 0.85)) * c.r; }
        out.poles.push({ x: cx, y: -py, z: 0, cell: ci }, { x: cx, y: py, z: 0, cell: ci });
      });
    }
    // 細胞核（間期與分裂完成後）
    if (pre || k === 'pro' || k === 'pro1') out.nuclei.push({ x: 0, y: 0, r: NUC, a: out.envelope });
    if ((k === 'telo' || k === 'telo1' || k === 'telo2') && f > 0.55) {
      const a = ramp(f, 0.55, 1);
      out.cells.forEach(function (c) { out.nuclei.push({ x: c.x, y: c.y, r: c.r * 0.55, a: a }); });
    }
    if (k === 'pro2') out.cells.forEach(function (c) { out.nuclei.push({ x: c.x, y: c.y, r: c.r * 0.55, a: 0.6 * (1 - ramp(f, 0, 0.5)) }); });

    // 染色體（畫面長度依遺傳長度）
    const m = 2 * n;
    const lenOf = function (p) { return 0.22 * Math.sqrt(rec.lengths[p] / 1.2) + 0.05; };
    const L1 = [], LB = [];
    for (let p = 0; p < n; p++) { L1.push(lenOf(p), lenOf(p)); LB.push(lenOf(p)); }
    const PY = linePos(L1, 0.05, 1.75), PYB = linePos(LB, 0.1, 1.5);
    const inCell = [[], []];   // 第二次分裂：每個次級細胞裡有哪些染色體（依 p、h 順序）
    if (isMe) for (let p = 0; p < n; p++) for (let h = 0; h < 2; h++) inCell[rec.dest.d1[rec.idx(p, h, 0)]].push(p * 2 + h);
    const PX2 = inCell.map(function (list) { return linePos(list.map(function (ci) { return lenOf(Math.floor(ci / 2)); }), 0.09, 1.2); });
    for (let p = 0; p < n; p++) for (let h = 0; h < 2; h++) for (let sI = 0; sI < 2; sI++) {
      const c = rec.idx(p, h, sI);
      const L = lenOf(p);
      const hp = homePos(p, h, n);
      const q = { bend: 0, c: c, p: p, h: h, s: sI, x: hp[0], y: hp[1], z: 0, ang: 1.2 + p * 0.9 + h * 0.4, len: L, cond: 0, rep: sI === 0 ? 1 : rep, segs: rec.chromatids[c], pole: -1, sx: 1, sy: 0, gap: 0.02 };
      const nonXo = isMe && (k === 'G1' || k === 'S' || k === 'G2' || (k === 'pro1' && f < 0.62));
      if (nonXo) q.segs = [{ a: 0, b: 1, o: h }];
      const z0 = ((p * 2 + h) % 5 - 2) * 0.08;
      q.z = z0;
      const setAng = function (a) { q.ang = a; q.sx = -Math.sin(a); q.sy = Math.cos(a); };
      setAng(q.ang);
      // 著絲點相對於分體中心的位移（角度 a、完全凝縮時）；後期由著絲點帶頭，手臂拖在後面
      const cenOff = function (a) { const t = (rec.cens[p] - 0.5) * L; return [Math.cos(a) * t, Math.sin(a) * t]; };
      const placeByCen = function (cx, cy, a) { setAng(a); const o = cenOff(a); q.x = cx - o[0]; q.y = cy - o[1]; };
      if (k === 'pro') q.cond = ramp(f, 0, 0.8);
      else if (k === 'pro1') q.cond = ramp(f, 0, 0.35);
      else if (!pre) q.cond = 1;
      if (isMe && (k === 'pro1' || k === 'meta1')) {
        // 聯會：同源染色體靠在一起
        // 每個二價體在核內各占一處（向日葵排列），沿圓周方向擺放，彼此不重疊
        const ba = p * 2.39996 + 0.4, br = NUC * 0.6 * Math.sqrt((p + 0.5) / n);
        const mx = Math.cos(ba) * br, my = Math.sin(ba) * br;
        const u = k === 'meta1' ? 1 : ramp(f, 0.3, 0.6);   // 中期 I 從聯會的位置出發
        const a = ba + Math.PI / 2;
        const off = (h ? 1 : -1) * 0.055;
        q.x = lerp(hp[0], mx - Math.sin(a) * off, u); q.y = lerp(hp[1], my + Math.cos(a) * off, u);
        setAng(lerp(q.ang, a, u));
        out.synapsis = u;
      }
      // 中期板的位置
      const bivIdx = p, chrIdx = p * 2 + h;
      if (!isMe) {
        const pl = plate(chrIdx, m); pl.y2 = PY[chrIdx];
        const toPole = rec.dest.d1[c];   // 0 左、1 右
        const ma = Math.PI / 2 + (chrIdx % 2 ? 0.22 : -0.22);   // 中期板上交錯傾斜，不排成一直線
        if (k === 'prometa' || k === 'meta') {
          const u = k === 'meta' ? 1 : ramp(f, 0.15, 1);
          q.x = lerp(hp[0], 0, u) + (toPole ? 1 : -1) * 0.025 * u; q.y = lerp(hp[1], pl.y2, u); q.z = lerp(z0, pl.z3, u);
          q.y3 = lerp(hp[1], pl.y3, u);
          setAng(lerp(q.ang, ma, u));
          if (u > 0.2) q.pole = toPole;
        } else if (k === 'ana' || k === 'telo') {
          const cs = out.cells, sgn = toPole ? 1 : -1;
          const u = k === 'ana' ? ease(f) : 1;
          const ea = toPole ? Math.PI : 0;     // 手臂朝向赤道
          const c0 = cenOff(ma), C0x = sgn * 0.025 + c0[0], C0y = pl.y2 + c0[1];
          q.bend = k === 'ana' ? ramp(f, 0, 0.35) : 1 - ramp(f, 0.5, 1);   // 末期：一邊解凝縮一邊伸直
          if (k === 'ana') placeByCen(lerp(C0x, sgn * 0.62, u), C0y * lerp(1, 0.8, u), lerp(ma, ea, ramp(f, 0, 0.35)));
          else placeByCen(lerp(sgn * 0.62, sgn * Math.abs(cs[1].x), ramp(f, 0, 0.85)), C0y * 0.8, ea);
          q.y3 = q.y; q.z = pl.z3 * lerp(1, 0.8, u);
          q.pole = k === 'ana' || (k === 'telo' && f < 0.3) ? toPole : -1;
          if (k === 'telo') q.cond = 1 - ramp(f, 0.5, 1);
          if (k === 'telo' && f > 0.5) { const hh = homePos(p, h, n), cc = cs[toPole]; const v = ramp(f, 0.5, 1); const sc = cc.r * 0.55 / NUC; q.x = lerp(q.x, cc.x + hh[0] * sc, v); q.y = lerp(q.y, cc.y + hh[1] * sc, v); q.len = L * lerp(1, Math.max(0.5, cc.r * 0.8), v); q.y3 = q.y; q.z = lerp(q.z, 0, v); setAng(lerp(ea, ea + (1.2 + p * 0.9 + h * 0.4 - ea) * 0.5, v)); }
          q.gap = 0;
        }
      } else {
        const toCell = rec.dest.d1[c];       // 第一次分裂去哪邊
        const homolSide = toCell ? 1 : -1;
        const pl = plate(bivIdx, n, 1.4); pl.y2 = PYB[bivIdx];
        const ma = Math.PI / 2 + (bivIdx % 2 ? 0.18 : -0.18);
        if (k === 'meta1') {
          const u = ramp(f, 0, 0.7);
          const bx = homolSide * 0.07 + (sI ? 1 : -1) * 0.0;
          q.x = lerp(q.x, bx, u); q.y = lerp(q.y, pl.y2 + (sI ? 0.022 : -0.022) * 0, u); q.y3 = lerp(q.y, pl.y3, u); q.z = lerp(z0, pl.z3, u);
          setAng(lerp(q.ang, ma, u));
          if (u > 0.3) q.pole = toCell;
          out.synapsis = 1 - ramp(f, 0.6, 1) * 0;
        } else if (k === 'ana1' || k === 'telo1') {
          const cs = out.cells;
          const u = k === 'ana1' ? ease(f) : 1;
          const ea = toCell ? Math.PI : 0;
          const c0 = cenOff(ma), C0x = homolSide * 0.07 + c0[0], C0y = pl.y2 + c0[1];
          q.bend = k === 'ana1' ? ramp(f, 0, 0.35) : 1 - ramp(f, 0.5, 1);
          if (k === 'ana1') placeByCen(lerp(C0x, homolSide * 0.62, u), C0y * lerp(1, 0.7, u), lerp(ma, ea, ramp(f, 0, 0.35)));
          else placeByCen(lerp(homolSide * 0.62, homolSide * Math.abs(cs[1].x), ramp(f, 0, 0.85)), C0y * 0.7, ea);
          q.y3 = q.y; q.z = pl.z3 * lerp(1, 0.7, u);
          q.pole = k === 'ana1' || (k === 'telo1' && f < 0.3) ? toCell : -1;
          if (k === 'telo1') q.cond = 1 - 0.4 * ramp(f, 0.5, 1);
        } else if (s.i >= 7) {
          // 第二次分裂：在兩個子細胞裡，紡錘體沿 y
          const cx = toCell ? 1.05 : -1.05;
          // 這個細胞裡的第幾條染色體
          const here = inCell[toCell];
          const kk = here.indexOf(chrIdx), mm = here.length;
          const pl2 = plate(kk, mm, 1.1); pl2.y2 = PX2[toCell][kk] / 0.8;
          const hp2 = homePos(p, h, n);
          const sx0 = cx + hp2[0] * 0.75, sy0 = hp2[1] * 0.75;
          const up = rec.dest.d2[c] % 2;   // 0 上（y 負）、1 下
          if (k === 'pro2') {
            const fromX = cx + homolSide * 0 + (q.x - (toCell ? 0.62 : -0.62)) * 0.0;
            q.x = lerp(cx + (pl.y2 * 0.7) * 0, sx0, 1); q.y = sy0; q.y3 = sy0; q.z = z0;
            q.cond = 0.6 + 0.4 * ramp(f, 0, 0.6);
            setAng(lerp(Math.PI / 2, 0.4 + p, 0.5));
            void fromX;
          } else if (k === 'meta2') {
            const u = ramp(f, 0, 0.6);
            q.x = lerp(sx0, cx + pl2.y2 * 0.8, u); q.y = lerp(sy0, (up ? 1 : -1) * 0.022, u); q.y3 = lerp(sy0, pl2.y3 * 0.7, u); q.z = lerp(z0, pl2.z3 * 0.7, u);
            setAng(lerp(0.4 + p, kk % 2 ? 0.25 : -0.25, u));
            if (u > 0.3) q.pole = toCell * 2 + up;
          } else {
            const cs = out.cells;
            const u = k === 'ana2' ? ease(f) : 1;
            const sg = up ? 1 : -1, ma2 = kk % 2 ? 0.25 : -0.25, ea = up ? -Math.PI / 2 : Math.PI / 2;
            const c0 = cenOff(ma2), C0x = cx + pl2.y2 * 0.8 + c0[0], C0y = sg * 0.022 + c0[1];
            let y = lerp(C0y, sg * 0.45, u);
            if (k === 'telo2') { const cc = cs[toCell * 2 + up]; y = lerp(sg * 0.45, cc.y, ramp(f, 0, 0.85)); }
            const xC = cx + (C0x - cx) * lerp(1, 0.7, u);
            placeByCen(xC, y, k === 'ana2' ? lerp(ma2, ea, ramp(f, 0, 0.35)) : ea);
            q.bend = k === 'ana2' ? ramp(f, 0, 0.35) : 1 - ramp(f, 0.5, 1);
            q.y3 = q.y; q.z = pl2.z3 * 0.7 * lerp(1, 0.7, u);
            q.pole = k === 'ana2' || (k === 'telo2' && f < 0.3) ? toCell * 2 + up : -1;
            q.gap = 0;
            if (k === 'telo2') {
              q.cond = 1 - ramp(f, 0.5, 1);
              if (f > 0.5) { const cc = cs[toCell * 2 + up], hh = homePos(p, h, n), v = ramp(f, 0.5, 1); const sc = cc.r * 0.55 / NUC; q.x = lerp(q.x, cc.x + hh[0] * sc, v); q.y = lerp(q.y, cc.y + hh[1] * sc, v); q.len = L * lerp(1, Math.max(0.5, cc.r * 0.8), v); q.y3 = q.y; q.z = lerp(q.z, 0, v); }
            }
          }
          if (k === 'pro2' || k === 'meta2') q.gap = 0.02;
        }
      }
      // 姊妹分體在還連著的時候稍微錯開（第一次分裂的二價體：同源染色體也並排）
      if (q.y3 == null) q.y3 = q.y;
      out.chromatids.push(q);
    }
    // 姊妹分體還在同一個位置（著絲點還連著）時並排：沿垂直於染色體的方向各偏 gap；S 期隨複製進度分開
    for (let i = 0; i < out.chromatids.length; i += 2) {
      const u = out.chromatids[i], v = out.chromatids[i + 1];
      if (Math.abs(u.x - v.x) < 1e-9 && Math.abs(u.y - v.y) < 1e-9 && u.gap > 0) {
        const g = u.gap * (k === 'S' ? rep : 1) * (0.6 + 0.4 * u.cond);
        u.x -= u.sx * g; u.y -= u.sy * g; v.x += v.sx * g; v.y += v.sy * g;
        u.y3 = u.y; v.y3 = v.y;
      }
    }
    // 二價體上 A、B 標籤只標最外側的兩條分體（lab = ±1：標在 sx 方向的哪一側；0：不標）
    if (isMe && (k === 'pro1' || k === 'meta1')) for (let p = 0; p < n; p++) {
      const four = out.chromatids.slice(p * 4, p * 4 + 4);
      const mx = four.reduce(function (a, q) { return a + q.x; }, 0) / 4, my = four.reduce(function (a, q) { return a + q.y; }, 0) / 4;
      const pr = four.map(function (q) { return (q.x - mx) * q.sx + (q.y - my) * q.sy; });
      let hi = 0, lo = 0;
      pr.forEach(function (v, i) { if (v > pr[hi]) hi = i; if (v < pr[lo]) lo = i; });
      four.forEach(function (q, i) { q.lab = i === hi ? 1 : i === lo ? -1 : 0; });
    }
    // 交叉（前期 I 後段到中期 I）
    if (isMe && ((k === 'pro1' && f > 0.55) || k === 'meta1')) {
      const a = k === 'pro1' ? ramp(f, 0.55, 0.7) : 1 - ramp(f, 0.4, 1);
      rec.xo.forEach(function (x) {
        const cM = out.chromatids[x.a], cP = out.chromatids[x.b];
        const t = x.x - 0.5;
        const ax = function (q) { return [q.x + Math.cos(q.ang) * q.len * t, q.y + Math.sin(q.ang) * q.len * t]; };
        const A = ax(cM), Bp = ax(cP);
        out.chiasmata.push({ x: (A[0] + Bp[0]) / 2, y: (A[1] + Bp[1]) / 2, z: (cM.z + cP.z) / 2, a: a, p: x.p });
      });
    }
    return out;
  }

  return {
    rng: rng, poisson: poisson, haldane: haldane, haldaneInv: haldaneInv, expectDistinct: expectDistinct, wilson: wilson,
    PAIRS: PAIRS, LOCI: LOCI, make: make, genotype: genotype, isRecombinant: isRecombinant, originAt: originAt, originPattern: originPattern,
    batch: batch, STAGES: STAGES, total: total, stageAt: stageAt, stageStart: stageStart, counts: counts, frame: frame, cut: cut, merge: merge
  };
});
