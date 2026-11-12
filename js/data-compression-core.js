/* data-compression-core.js — 「資料壓縮：遊程編碼與霍夫曼編碼」的計算核心（與畫面分離，Node 單元測試：tests/data-compression-core.test.js）
 *
 * 一、遊程編碼（run-length encoding）：16 × 16 的黑白圖（每格 1 位元，原始 256 位元）。
 *   1. 依掃描順序把 256 格排成一長串：逐列（每列由左而右）、逐行（每行由上而下）、蛇行（逐列，但奇數列由右而左）。
 *      整張圖串成一條，遊程可以跨過列（行）的交界。
 *   2. 連續同色的一段叫一個遊程（run）。長度欄位有 k 位元（2 ≤ k ≤ 8），能記的長度是 0 到 2^k − 1。
 *   3. 兩種格式：
 *      「顏色＋長度」（pair）：每個遊程記 1 位元顏色（白 0、黑 1）＋ k 位元長度，共 k + 1 位元；長度超過 2^k − 1 就拆成幾段。
 *      「只記長度」（alt）：規定第一段是白色、之後黑白輪流，所以只記 k 位元長度。圖從黑色開始時，第一段是長度 0 的白；
 *        遊程超過 2^k − 1 時拆成「2^k − 1、0（另一色，長度 0）、剩下的」，讓顏色輪流的規則不被打斷（傳真機 ITU-T T.4 也用這個想法）。
 *   4. 編碼後位元數 = 段數 × 每段位元數（不含檔頭：圖的寬高、k、格式，這些雙方事先約定好）。
 *
 * 二、霍夫曼編碼（Huffman 1952）：
 *   1. 數每個字（Unicode 碼點）出現的次數 n_i；N = Σ n_i，機率 p_i = n_i / N。
 *   2. 每個字是一個葉節點。節點編號：先把葉依（次數，字的碼點）由小到大編成 0, 1, 2, …；之後每合併出一個新節點，給下一個編號。
 *   3. 重複：從還沒合併的節點中取出權重最小的兩個（先取出的放左邊、碼加 0；後取出的放右邊、碼加 1），
 *      合併成新節點（權重 = 兩者之和），直到只剩一個（根）。
 *   4. 平手規則（權重相同時誰先被取出）：「舊的優先」= 編號小的先；「新的優先」= 編號大的先。兩種都是最佳碼，平均碼長相同，
 *      但樹的形狀、最長碼可能不同（「舊的優先」得到最長碼最短、碼長變異最小的那一種，見 Schwartz 1964）。
 *   5. 碼 = 從根走到葉經過的 0／1。只有一種字時，樹只有一個節點，碼是空的（0 位元：沒有不確定性就不必傳任何位元）。
 *   熵 H = −Σ p_i log₂ p_i；平均碼長 L = Σ p_i l_i。最佳前綴碼滿足 H ≤ L < H + 1（Cover & Thomas 定理 5.4.1）；
 *   每個 p_i 都是 2 的負整數次方時 L = H。固定長度編碼每個字用 ⌈log₂ k⌉ 位元（k = 字的種類數）。
 *   原始大小以 UTF-8 計：英數字 1 位元組（8 位元）、大多數中文字 3 位元組（24 位元）（RFC 3629）。
 */
(function (root) {
  'use strict';
  const SIZE = 16;               // 圖的寬與高
  const K_MIN = 2, K_MAX = 8;    // 長度欄位的位元數
  const MAX_CHARS = 120;         // 霍夫曼：文字最多幾個字
  const MAX_KINDS = 32;          // 霍夫曼：最多幾種不同的字

  // =====================================================================
  // 遊程編碼
  // =====================================================================
  /** 掃描順序：回傳格子索引（i = 列 × w + 行）的陣列 */
  function scanOrder(w, h, order) {
    const out = [];
    if (order === 'col') {
      for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) out.push(r * w + c);
    } else {
      for (let r = 0; r < h; r++) {
        const rev = order === 'snake' && r % 2 === 1;
        for (let k = 0; k < w; k++) out.push(r * w + (rev ? w - 1 - k : k));
      }
    }
    return out;
  }
  /** 依掃描順序把像素排成 0／1 序列 */
  function sequence(pixels, w, h, order) { return scanOrder(w, h, order).map(function (i) { return pixels[i] ? 1 : 0; }); }
  /** 原始遊程（不拆分）：[{ c 顏色, n 長度, start 在序列中的起點 }] */
  function runsOf(seq) {
    const out = [];
    for (let i = 0; i < seq.length; i++) {
      if (out.length && out[out.length - 1].c === seq[i]) out[out.length - 1].n++;
      else out.push({ c: seq[i], n: 1, start: i });
    }
    return out;
  }
  /** k 位元的長度欄位能記的最大長度 */
  function maxRun(k) { return Math.pow(2, k) - 1; }
  /** 每一段用幾個位元 */
  function tokenBits(fmt, k) { return fmt === 'alt' ? k : k + 1; }
  /**
   * 編碼後的段（token）：[{ c, n, start, split（這段是拆出來的）, zero（長度 0 的佔位段）, run（屬於第幾個原始遊程） }]
   * pair：每段 = 顏色＋長度；alt：只記長度，從白色開始輪流。
   */
  function rleTokens(seq, fmt, k) {
    const M = maxRun(k), runs = runsOf(seq), out = [];
    if (fmt === 'alt') {
      if (runs.length && runs[0].c === 1) out.push({ c: 0, n: 0, start: 0, split: false, zero: true, run: -1 });
      runs.forEach(function (r, ri) {
        let left = r.n, at = r.start, first = true;
        while (left > M) {
          out.push({ c: r.c, n: M, start: at, split: true, zero: false, run: ri });
          out.push({ c: 1 - r.c, n: 0, start: at + M, split: true, zero: true, run: ri });
          left -= M; at += M; first = false;
        }
        out.push({ c: r.c, n: left, start: at, split: !first, zero: false, run: ri });
      });
      return out;
    }
    runs.forEach(function (r, ri) {
      let left = r.n, at = r.start, first = true;
      while (left > M) { out.push({ c: r.c, n: M, start: at, split: true, zero: false, run: ri }); left -= M; at += M; first = false; }
      out.push({ c: r.c, n: left, start: at, split: !first, zero: false, run: ri });
    });
    return out;
  }
  function pad(v, k) { let s = v.toString(2); while (s.length < k) s = '0' + s; return s; }
  /** 一段的位元：pair = 顏色 1 位元＋長度 k 位元；alt = 長度 k 位元 */
  function tokenCode(t, fmt, k) { return (fmt === 'alt' ? '' : String(t.c)) + pad(t.n, k); }
  /** 遊程編碼的完整位元串 */
  function rleEncode(seq, fmt, k) { return rleTokens(seq, fmt, k).map(function (t) { return tokenCode(t, fmt, k); }).join(''); }
  /** 解碼：位元串 → 0／1 序列；格式錯誤（長度不對、超出總數）回傳 null */
  function rleDecode(bits, fmt, k, total) {
    const per = tokenBits(fmt, k);
    if (bits.length % per !== 0) return null;
    const out = [];
    let color = 0;
    for (let i = 0; i < bits.length; i += per) {
      let c, n;
      if (fmt === 'alt') { c = color; n = parseInt(bits.substr(i, k), 2); color = 1 - color; }
      else { c = +bits[i]; n = parseInt(bits.substr(i + 1, k), 2); }
      for (let j = 0; j < n; j++) out.push(c);
      if (out.length > total) return null;
    }
    return out.length === total ? out : null;
  }
  /** 一張圖在某個設定下的結果；bitsByK[k] 是同樣掃描順序與格式、長度欄位 k 位元時的編碼位元數 */
  function rleSummary(pixels, w, h, order, fmt, k) {
    const seq = sequence(pixels, w, h, order);
    const runs = runsOf(seq);
    const tokens = rleTokens(seq, fmt, k);
    const bitsByK = {};
    for (let kk = K_MIN; kk <= K_MAX; kk++) bitsByK[kk] = rleTokens(seq, fmt, kk).length * tokenBits(fmt, kk);
    let black = 0;
    for (let i = 0; i < pixels.length; i++) if (pixels[i]) black++;
    return { seq: seq, runs: runs, tokens: tokens, raw: w * h, bits: tokens.length * tokenBits(fmt, k), per: tokenBits(fmt, k), black: black, bitsByK: bitsByK };
  }
  /** 圖的指紋：每 4 格一個十六進位字（16 × 16 → 64 個字） */
  function pixelsHash(pixels) {
    let s = '';
    for (let i = 0; i < pixels.length; i += 4) {
      let v = 0;
      for (let j = 0; j < 4; j++) v = v * 2 + (pixels[i + j] ? 1 : 0);
      s += v.toString(16);
    }
    return s;
  }

  // ---------- 內建圖案（用字串畫，# 是黑） ----------
  const PATTERNS = {
    smile: [
      '................',
      '.....######.....',
      '...##......##...',
      '..#..........#..',
      '.#............#.',
      '.#...##..##...#.',
      '#....##..##....#',
      '#..............#',
      '#..............#',
      '#..#........#..#',
      '.#..#......#..#.',
      '.#...######...#.',
      '..#..........#..',
      '...##......##...',
      '.....######.....',
      '................'
    ],
    heart: [
      '................',
      '................',
      '..####....####..',
      '.######..######.',
      '################',
      '################',
      '################',
      '.##############.',
      '..############..',
      '...##########...',
      '....########....',
      '.....######.....',
      '......####......',
      '.......##.......',
      '................',
      '................'
    ],
    house: [
      '................',
      '.......##.......',
      '......####......',
      '.....######.....',
      '....########....',
      '...##########...',
      '..############..',
      '.##############.',
      '..#..........#..',
      '..#.##....##.#..',
      '..#.##....##.#..',
      '..#......#...#..',
      '..#....###...#..',
      '..#....###...#..',
      '..#....###...#..',
      '################'
    ]
  };
  function pattern(name) {
    const rows = PATTERNS[name];
    const px = new Array(SIZE * SIZE).fill(0);
    if (!rows) return px;
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) px[r * SIZE + c] = rows[r][c] === '#' ? 1 : 0;
    return px;
  }
  /** 隨機雜訊：每格以機率 1/2 是黑（種子可重現） */
  function noise(seed) {
    const r = rng(seed), px = [];
    for (let i = 0; i < SIZE * SIZE; i++) px.push(r() < 0.5 ? 1 : 0);
    return px;
  }

  // =====================================================================
  // 霍夫曼編碼
  // =====================================================================
  /** 文字切成字（Unicode 碼點；表情符號這類 UTF-16 代理對算一個字） */
  function symbols(text) { return Array.from(String(text == null ? '' : text)); }
  /** 每個字的次數，依第一次出現的順序：[{ s, n }] */
  function countSymbols(syms) {
    const idx = {}, out = [];
    syms.forEach(function (s) {
      if (idx[s] === undefined) { idx[s] = out.length; out.push({ s: s, n: 0 }); }
      out[idx[s]].n++;
    });
    return out;
  }
  function cp(s) { return s.codePointAt(0); }
  /**
   * 建霍夫曼樹。counts：[{ s, n }]；tie：'old'（舊的優先，預設）或 'new'（新的優先）。
   * 回傳 { nodes, k, steps, root, codes, lengths, maxLen, minLen }：
   *   nodes[id] = { id, w 權重, s（葉才有）, leaf, l, r（子節點編號）, parent, step（第幾步合併出來的，葉為 −1） }
   *   steps[t] = { a（先取出，左、0）, b（後取出，右、1）, p（新節點）, order（這一步之前佇列裡的節點，依取出的先後排好） }
   */
  function huffman(counts, tie) {
    const leaves = counts.filter(function (c) { return c.n > 0; }).slice()
      .sort(function (a, b) { return a.n - b.n || cp(a.s) - cp(b.s); });
    const k = leaves.length;
    if (!k) return null;
    const nodes = leaves.map(function (c, i) { return { id: i, w: c.n, s: c.s, leaf: true, l: -1, r: -1, parent: -1, step: -1 }; });
    const cmp = tie === 'new'
      ? function (a, b) { return nodes[a].w - nodes[b].w || b - a; }
      : function (a, b) { return nodes[a].w - nodes[b].w || a - b; };
    let queue = nodes.map(function (n) { return n.id; });
    const steps = [];
    while (queue.length > 1) {
      queue.sort(cmp);
      const order = queue.slice();
      const a = queue.shift(), b = queue.shift();
      const p = nodes.length;
      nodes.push({ id: p, w: nodes[a].w + nodes[b].w, s: null, leaf: false, l: a, r: b, parent: -1, step: steps.length });
      nodes[a].parent = p; nodes[b].parent = p;
      steps.push({ a: a, b: b, p: p, order: order });
      queue.push(p);
    }
    const rootId = queue[0];
    const codes = {}, lengths = {};
    const depth = new Array(nodes.length).fill(0);
    (function walk(id, code) {
      const nd = nodes[id];
      depth[id] = code.length;
      if (nd.leaf) { codes[nd.s] = code; lengths[nd.s] = code.length; return; }
      walk(nd.l, code + '0');
      walk(nd.r, code + '1');
    })(rootId, '');
    let maxLen = 0, minLen = Infinity;
    for (let i = 0; i < k; i++) { maxLen = Math.max(maxLen, depth[i]); minLen = Math.min(minLen, depth[i]); }
    return { nodes: nodes, k: k, steps: steps, root: rootId, codes: codes, lengths: lengths, depth: depth, maxLen: maxLen, minLen: minLen, tie: tie === 'new' ? 'new' : 'old' };
  }
  /** 合併了 t 步之後，第 id 個葉已經確定的碼（由葉往上長出來的後綴） */
  function partialCode(tree, id, t) {
    let s = '', cur = id;
    while (tree.nodes[cur].parent >= 0 && tree.nodes[tree.nodes[cur].parent].step < t) {
      const p = tree.nodes[tree.nodes[cur].parent];
      s = (p.l === cur ? '0' : '1') + s;
      cur = p.id;
    }
    return s;
  }
  /** 熵（位元／字） */
  function entropy(counts) {
    let N = 0;
    counts.forEach(function (c) { N += c.n; });
    if (!N) return 0;
    let H = 0;
    counts.forEach(function (c) { if (c.n > 0) { const p = c.n / N; H -= p * Math.log2(p); } });
    return Math.abs(H) < 1e-15 ? 0 : H;
  }
  /** 平均碼長（位元／字） */
  function avgLength(counts, lengths) {
    let N = 0, S = 0;
    counts.forEach(function (c) { N += c.n; S += c.n * lengths[c.s]; });
    return N ? S / N : 0;
  }
  /** 固定長度編碼每個字的位元數 ⌈log₂ k⌉（只有一種字時是 0） */
  function fixedLength(k) { return k <= 1 ? 0 : Math.ceil(Math.log2(k) - 1e-12); }
  /** UTF-8 位元組數（RFC 3629：U+0000–007F 1 個、–07FF 2 個、–FFFF 3 個、其餘 4 個） */
  function utf8Bytes(syms) {
    let b = 0;
    syms.forEach(function (s) { const c = cp(s); b += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; });
    return b;
  }
  function encodeSyms(syms, codes) { return syms.map(function (s) { return codes[s]; }).join(''); }
  /**
   * 沿著樹解碼：每讀一個位元往左（0）或往右（1）走，走到葉就輸出那個字、回到根。
   * 回傳 { syms（解出的字）, leftover（最後沒走到葉的位元數）, path }；只有一種字（碼是空的）時無法從位元解出字數，回傳 null。
   */
  function decodeBits(bits, tree) {
    if (!tree || tree.k < 2) return null;
    const out = [], ends = [];
    let cur = tree.root, used = 0;
    for (let i = 0; i < bits.length; i++) {
      const nd = tree.nodes[cur];
      cur = bits[i] === '0' ? nd.l : nd.r;
      used++;
      if (tree.nodes[cur].leaf) { out.push(tree.nodes[cur].s); ends.push(i + 1); cur = tree.root; used = 0; }
    }
    return { syms: out, ends: ends, leftover: used };
  }
  /**
   * 傳輸時第 pos 個位元（1 起算）出錯（0、1 對調）之後解碼的結果。
   * 回傳 { bits（出錯後的位元串）, syms, leftover, at（出錯的位元在原文第幾個字，0 起算）, after（那個字後面還有幾個字）,
   *        resync（解碼器後來有沒有在原文的字界重新對齊；對齊之後的字就全部正確）, resyncAt（從原文第幾個字開始又對了，沒對齊為 −1）,
   *        same（解出的字和原文逐字相同的個數，以位置對齊）}
   */
  function flipAnalysis(syms, tree, pos) {
    if (!tree || tree.k < 2) return null;
    const bits = encodeSyms(syms, tree.codes);
    if (!(pos >= 1 && pos <= bits.length)) return null;
    const flipped = bits.slice(0, pos - 1) + (bits[pos - 1] === '0' ? '1' : '0') + bits.slice(pos);
    const dec = decodeBits(flipped, tree);
    const origEnds = [];
    let acc = 0;
    syms.forEach(function (s) { acc += tree.codes[s].length; origEnds.push(acc); });
    let at = 0;
    while (origEnds[at] < pos) at++;
    const decSet = {};
    dec.ends.forEach(function (e) { decSet[e] = true; });
    let resyncAt = -1;
    for (let j = at; j < origEnds.length - 1; j++) if (decSet[origEnds[j]]) { resyncAt = j + 1; break; }
    let same = 0;
    for (let i = 0; i < Math.min(syms.length, dec.syms.length); i++) if (syms[i] === dec.syms[i]) same++;
    return { bits: flipped, syms: dec.syms, leftover: dec.leftover, at: at, after: syms.length - 1 - at, resync: resyncAt >= 0, resyncAt: resyncAt, same: same };
  }
  /** 沒有任何碼是另一個碼的前綴 */
  function isPrefixFree(codeList) {
    for (let i = 0; i < codeList.length; i++) for (let j = 0; j < codeList.length; j++) {
      if (i !== j && codeList[j].indexOf(codeList[i]) === 0) return false;
    }
    return true;
  }
  /** Kraft 和 Σ 2^(−l)；完整的二元樹（每個內部節點都有兩個子節點）剛好等於 1 */
  function kraft(lengthList) { return lengthList.reduce(function (a, l) { return a + Math.pow(2, -l); }, 0); }
  /**
   * 暴力找最佳前綴碼的總位元數 min Σ n_i l_i（測試用）：枚舉所有碼長 1 ≤ l_i ≤ k − 1，只要滿足 Kraft 不等式 Σ 2^(−l_i) ≤ 1，
   * 就一定排得出前綴碼（Kraft–McMillan）。與霍夫曼的演算法完全無關，用來獨立驗證霍夫曼是最佳的。
   */
  function bruteOptimal(ns) {
    const k = ns.length;
    if (k <= 1) return 0;
    const top = k - 1, full = Math.pow(2, top);
    let best = Infinity;
    (function rec(i, used, cost) {
      if (cost >= best) return;
      if (i === k) { best = cost; return; }
      for (let l = 1; l <= top; l++) {
        const u = used + Math.pow(2, top - l);
        if (u > full) continue;
        rec(i + 1, u, cost + ns[i] * l);
      }
    })(0, 0, 0);
    return best;
  }

  // ---------- 小工具 ----------
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
  /** 費氏數列的前 k 項 1, 1, 2, 3, 5, … */
  function fibs(k) { const f = []; for (let i = 0; i < k; i++) f.push(i < 2 ? 1 : f[i - 1] + f[i - 2]); return f; }
  /** 解碼挑戰的題目：從 pool 裡隨機抽 len 個字（相鄰兩字盡量不同） */
  function quizWord(rnd, pool, len) {
    const out = [];
    for (let i = 0; i < len; i++) {
      let s, tries = 0;
      do { s = pool[Math.floor(rnd() * pool.length)]; tries++; } while (pool.length > 1 && out.length && s === out[out.length - 1] && tries < 8);
      out.push(s);
    }
    return out;
  }

  const api = {
    SIZE: SIZE, K_MIN: K_MIN, K_MAX: K_MAX, MAX_CHARS: MAX_CHARS, MAX_KINDS: MAX_KINDS, PATTERNS: PATTERNS,
    scanOrder: scanOrder, sequence: sequence, runsOf: runsOf, maxRun: maxRun, tokenBits: tokenBits, rleTokens: rleTokens,
    tokenCode: tokenCode, rleEncode: rleEncode, rleDecode: rleDecode, rleSummary: rleSummary, pixelsHash: pixelsHash, pattern: pattern, noise: noise,
    symbols: symbols, countSymbols: countSymbols, huffman: huffman, partialCode: partialCode, entropy: entropy, avgLength: avgLength,
    fixedLength: fixedLength, utf8Bytes: utf8Bytes, encodeSyms: encodeSyms, decodeBits: decodeBits, flipAnalysis: flipAnalysis, isPrefixFree: isPrefixFree,
    kraft: kraft, bruteOptimal: bruteOptimal, rng: rng, fibs: fibs, quizWord: quizWord
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CompressCore = api;
})(typeof window !== 'undefined' ? window : this);
