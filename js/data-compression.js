/* data-compression.js — 「資料壓縮：遊程編碼與霍夫曼編碼」的畫面與互動（計算在 data-compression-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 所有數字（遊程、段數、位元數、霍夫曼樹、碼、熵）都由核心精確算好；掃描頭、樹長出來、解碼游標的動畫只是把結果一步步呈現（不改任何數字）。
 * 任務事件只在使用者操作之後送出（見 js/missions/data-compression.js 開頭的說明）；載入、預設圖與預設文字不送。
 * 學生打的文字只在瀏覽器裡處理：最多 120 個字、32 種，用 textContent 放進畫面，不當成程式執行。 */
(function () {
  'use strict';
  const K = window.CompressCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const LANG = window.LabSettings ? window.LabSettings.lang : 'zh-Hant';
  const val = function (el) { return window.LabNum ? window.LabNum.value(el) : +el.value; };
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade;
  const N16 = K.SIZE, NPX = N16 * N16;

  // 範例文字（英文模式用英文；簡體模式用簡體字）
  const EXAMPLES = {
    ex1: { hant: 'ABRACADABRA', hans: 'ABRACADABRA', en: 'ABRACADABRA' },
    ex2: { hant: '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮', hans: '吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮', en: 'she sells sea shells by the sea shore' },
    ex3: { hant: '床前明月光，疑是地上霜。舉頭望明月，低頭思故鄉。', hans: '床前明月光，疑是地上霜。举头望明月，低头思故乡。', en: 'to be or not to be that is the question' }
  };
  function exampleText(id) { const e = EXAMPLES[id]; return LANG === 'en' ? e.en : LANG === 'zh-Hans' ? e.hans : e.hant; }
  // 播放速度 1–10 級 → 每秒幾格（遊程）、幾步（建樹）、幾個位元（解碼）
  const RLE_RATE = [4, 6, 10, 16, 25, 40, 64, 100, 160, 256];
  const HUF_RATE = [0.6, 0.9, 1.3, 1.8, 2.5, 3.5, 5, 7, 10, 14];
  const DEC_RATE = [2, 3, 4, 6, 8, 11, 15, 20, 28, 40];

  // =====================================================================
  // 狀態
  // =====================================================================
  const state = {
    mode: 'rle', speed: 5, playing: false,
    rle: {
      px: K.pattern('heart'), origin: 'heart', painted: 0, scan: 'row', fmt: 'pair', k: 8,
      sum: null, order: null, hash: '', tokIdx: 0, pos: NPX, done: true, stepped: true,
      cursor: 7 * 16 + 7, hover: -1, kbFocus: false, drag: null, noiseSeed: 20261112, lastTok: -1
    },
    huf: {
      text: '', syms: [], counts: [], tie: 'old', tree: null, built: 0, typed: false, stepped: true, anim: null,
      order: [], pos: {}, bits: '', H: 0, L: 0, hist: [], sel: -1, ready: false
    },
    dec: { bits: '', pos: 0, cur: -1, out: [], done: false, stepped: true, playing: false, acc: 0, flip: 0, trail: [], flash: null, started: false },
    quiz: null, rounds: [], streak: 0
  };
  let qrand = K.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);

  // ---------- 色彩 ----------
  let C = {};
  let sprites = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface', 'bg',
      'dc-paper', 'dc-ink', 'dc-runA', 'dc-runB', 'dc-raw', 'dc-enc', 'dc-warn', 'dc-leaf', 'dc-node', 'dc-zero', 'dc-one', 'dc-hl', 'dc-ok']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
    sprites = {};
  }
  function fnt(px, weight, family) { return (weight ? weight + ' ' : '') + px + 'px ' + (family || FONT); }
  function fmt(x, d) { return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
  function intText(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function showSym(s) { return s === ' ' ? '␣' : s === '\t' ? '⇥' : s; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // =====================================================================
  // 版面
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const stage = $('stage'), lab = $('lab');
  let dpr = 1, cw = 320, ch = 420, cw2 = 320, ch2 = 220, L = null;

  function layoutRle() {
    const W = cw, wide = W >= 620, pad = wide ? 16 : 10;
    const top = 30;
    let G = wide ? Math.min(400, Math.floor((W - 3 * pad) * 0.54)) : Math.min(W - 2 * pad, 420);
    const cell = Math.floor(G / N16);
    G = cell * N16;
    const gx = wide ? pad : Math.round((W - G) / 2), gy = top;
    const tokW = state.rle.fmt === 'alt' ? 36 : 46, tokH = 24, gap = 5;
    let tx, ty, tw, th;
    if (wide) { tx = gx + G + pad + 4; ty = gy; tw = W - tx - pad; th = G; }
    else { tx = pad; ty = gy + G + 30; tw = W - 2 * pad; th = 5 * (tokH + gap) + 22; }
    const perRow = Math.max(1, Math.floor((tw + gap) / (tokW + gap)));
    const rows = Math.max(1, Math.floor((th - 22 + gap) / (tokH + gap)));
    const barY = (wide ? gy + G : ty + th) + 22;
    return { kind: 'rle', wide: wide, pad: pad, G: G, cell: cell, gx: gx, gy: gy, tx: tx, ty: ty, tw: tw, th: th, tokW: tokW, tokH: tokH, gap: gap, perRow: perRow, rows: rows, barY: barY, H: barY + 66 };
  }
  function layoutHuf() {
    const W = cw, narrow = W < 560, h = state.huf;
    const padL = narrow ? 30 : 44, padR = narrow ? 8 : 16;
    const qH = 54;
    const tree = h.tree;
    const k = tree ? tree.k : 1;
    const depth = tree ? tree.maxLen : 0;
    const sx = (W - padL - padR) / k;
    const bw = Math.max(14, Math.min(46, sx - 5)), bh = narrow ? 30 : 34;
    const nr = Math.max(6, Math.min(13, sx * 0.3));
    const y0 = qH + 34;
    const want = narrow ? 300 : 340;
    const dy = depth ? Math.max(20, Math.min(62, want / depth)) : 0;
    const codeH = 22;
    const treeBottom = y0 + depth * dy + bh / 2 + codeH;
    const decY = treeBottom + 16;
    return { kind: 'huf', narrow: narrow, padL: padL, padR: padR, qH: qH, sx: sx, bw: bw, bh: bh, nr: nr, y0: y0, dy: dy, decY: decY, H: Math.round(decY + 74) };
  }
  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    L = state.mode === 'rle' ? layoutRle() : layoutHuf();
    if (state.mode === 'huf') placeTree();
    ch = L.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr);
    cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    ch2 = cw2 < 560 ? 210 : 230;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr);
    cv2.height = Math.round(ch2 * dpr);
    sprites = {};
    requestDraw();
  }

  // =====================================================================
  // 遊程編碼
  // =====================================================================
  function rleRecompute() {
    const r = state.rle;
    r.sum = K.rleSummary(r.px, N16, N16, r.scan, r.fmt, r.k);
    r.order = K.scanOrder(N16, N16, r.scan);
    r.hash = K.pixelsHash(r.px);
    // 改了圖或設定：停止播放，直接顯示完整的結果
    if (state.mode === 'rle') stopPlay();
    r.tokIdx = r.sum.tokens.length; r.pos = NPX; r.done = true; r.lastTok = r.tokIdx - 1;
  }
  function rleEventData(src) {
    const r = state.rle, s = r.sum;
    const byK = [];
    for (let k = K.K_MIN; k <= K.K_MAX; k++) byK.push(s.bitsByK[k]);
    return { src: src, origin: r.origin, painted: r.painted, scan: r.scan, fmt: r.fmt, k: r.k, raw: s.raw, runs: s.runs.length, segs: s.tokens.length,
      bits: s.bits, per: s.per, black: s.black, bitsByK: byK, hash: r.hash };
  }
  function rleChanged(src) {
    rleRecompute();
    updateRleReadouts();
    if (state.mode === 'rle') { if (L && L.kind === 'rle' && L.tokW !== (state.rle.fmt === 'alt' ? 36 : 46)) resize(); requestDraw(); }
    if (src) emit('rle', rleEventData(src));
  }
  function tokEnd(t) { return t.start + t.n; }
  function rleReset() {
    const r = state.rle;
    r.tokIdx = 0; r.pos = 0; r.done = false; r.stepped = true; r.lastTok = -1;
  }
  function rleStep() {
    const r = state.rle, toks = r.sum.tokens;
    if (r.done) rleReset();
    if (r.tokIdx < toks.length) {
      r.tokIdx++;
      r.pos = Math.max(r.pos, tokEnd(toks[r.tokIdx - 1]));
      sndToken(toks[r.tokIdx - 1]);
      r.lastTok = r.tokIdx - 1;
      sayToken(toks[r.tokIdx - 1], r.tokIdx);
    }
    if (r.tokIdx >= toks.length && r.pos >= NPX) rleFinish();
    requestDraw();
  }
  function rleAdvance(dt) {
    const r = state.rle, toks = r.sum.tokens;
    r.pos = Math.min(NPX, r.pos + RLE_RATE[state.speed - 1] * dt);
    while (r.tokIdx < toks.length && tokEnd(toks[r.tokIdx]) <= r.pos + 1e-9) {
      r.tokIdx++;
      if (r.tokIdx - 1 > r.lastTok) { r.lastTok = r.tokIdx - 1; sndToken(toks[r.tokIdx - 1], true); }
    }
    if (r.tokIdx >= toks.length && r.pos >= NPX) rleFinish();
  }
  function rleFinish() {
    const r = state.rle;
    if (r.done) return;
    r.done = true;
    state.playing = false;
    updatePlayButton();
    sndDone(r.sum.bits <= r.sum.raw);
    const s = r.sum;
    say(T('掃描完成：' + s.tokens.length + ' 段 × ' + s.per + ' 位元 = ' + s.bits + ' 位元，' + (s.bits < s.raw ? '比原始的 256 位元少 ' + (s.raw - s.bits) + ' 位元。' : s.bits === s.raw ? '和原始的 256 位元一樣多。' : '比原始的 256 位元還多 ' + (s.bits - s.raw) + ' 位元！'),
      'Scan finished: ' + s.tokens.length + ' runs × ' + s.per + ' bits = ' + s.bits + ' bits, ' + (s.bits < s.raw ? (s.raw - s.bits) + ' bits fewer than the original 256.' : s.bits === s.raw ? 'exactly the same as the original 256.' : (s.bits - s.raw) + ' bits MORE than the original 256!')));
    const d = rleEventData('run');
    d.stepped = r.stepped;
    emit('rleRun', d);
  }
  function sayToken(t, idx) {
    const r = state.rle;
    const col = t.c ? T('黑', 'black') : T('白', 'white');
    let msg;
    if (t.zero) msg = T('第 ' + idx + ' 段：長度 0 的' + col + '（「只記長度」要黑白輪流，用它來換顏色）。', 'Run ' + idx + ': a ' + col + ' run of length 0 (with “Length only” the colours must take turns, so this switches colour).');
    else msg = T('第 ' + idx + ' 段：' + t.n + ' 個' + col + '格' + (t.split ? '（太長了，拆段）' : '') + ' → ' + K.tokenCode(t, r.fmt, r.k), 'Run ' + idx + ': ' + t.n + ' ' + col + ' square' + (t.n === 1 ? '' : 's') + (t.split ? ' (too long, split)' : '') + ' → ' + K.tokenCode(t, r.fmt, r.k));
    say(msg);
  }

  // ---------- 畫圖 ----------
  function setPixel(i, c) {
    const r = state.rle;
    if (i < 0 || i >= NPX || r.px[i] === c) return false;
    r.px[i] = c;
    r.painted++;
    return true;
  }
  function loadPattern(name) {
    const r = state.rle;
    if (name === 'noise') { r.noiseSeed = (r.noiseSeed * 48271) % 2147483647; r.px = K.noise(r.noiseSeed); }
    else r.px = name === 'blank' ? new Array(NPX).fill(0) : K.pattern(name);
    r.origin = name;
    r.painted = 0;
    sndPattern();
    rleChanged('preset');
    const names = { blank: T('空白', 'blank'), heart: T('愛心', 'heart'), smile: T('笑臉', 'smiley'), house: T('房子', 'house'), noise: T('雜訊', 'random noise') };
    say(T('換成「' + names[name] + '」圖：', 'Picture: ' + names[name] + '. ') + summaryText());
  }
  function summaryText() {
    const s = state.rle.sum;
    return T(s.runs.length + ' 個遊程，編碼後 ' + s.bits + ' 位元（原始 256）。', s.runs.length + ' runs, ' + s.bits + ' bits encoded (original 256).');
  }

  // =====================================================================
  // 霍夫曼
  // =====================================================================
  function setText(text, src) {
    const h = state.huf;
    let syms = K.symbols(text).filter(function (s) { return s !== '\n' && s !== '\r'; });
    let note = '';
    if (syms.length > K.MAX_CHARS) { syms = syms.slice(0, K.MAX_CHARS); note = T('只用前 120 個字。', 'Only the first 120 characters are used.'); }
    const counts = K.countSymbols(syms);
    if (!syms.length) { setMsg(T('先打一些字。', 'Type something first.'), 'bad'); return false; }
    if (counts.length > K.MAX_KINDS) {
      setMsg(T('這段文字有 ' + counts.length + ' 種不同的字，這裡最多 32 種（樹才畫得下）。', 'This text has ' + counts.length + ' different characters; at most 32 are allowed here (so the tree fits).'), 'bad');
      return false;
    }
    h.text = syms.join(''); h.syms = syms; h.counts = counts;
    if (src === 'typed') h.typed = true;
    else if (src === 'example' || src === 'init') h.typed = false;
    setMsg(note || T(syms.length + ' 個字、' + counts.length + ' 種。', syms.length + ' characters, ' + counts.length + ' different.'), note ? 'bad' : '');
    rebuild(src);
    return true;
  }
  function rebuild(src) {
    const h = state.huf;
    stopPlay();
    h.tree = K.huffman(h.counts, h.tie);
    h.built = h.tree ? h.tree.steps.length : 0;
    h.anim = null; h.sel = -1;
    h.bits = h.tree ? K.encodeSyms(h.syms, h.tree.codes) : '';
    h.H = K.entropy(h.counts);
    h.L = h.tree ? K.avgLength(h.counts, h.tree.lengths) : 0;
    h.ready = true;
    // H–L 圖：記下這一點（和上一點不同時）
    const last = h.hist[h.hist.length - 1];
    if (!last || Math.abs(last.H - h.H) > 1e-9 || Math.abs(last.L - h.L) > 1e-9) { h.hist.push({ H: h.H, L: h.L }); if (h.hist.length > 300) h.hist.shift(); }
    // 解碼與出錯滑桿跟著新的位元串
    const flipEl = $('flip');
    flipEl.max = String(Math.max(1, h.bits.length));
    if (val(flipEl) > h.bits.length) { if (window.LabNum) window.LabNum.set(flipEl, 0); else flipEl.value = 0; }
    state.dec.flip = Math.round(val(flipEl));
    decReset(true);
    if (state.quiz) quizExit(T('碼表變了，挑戰結束。', 'The code table changed, so the challenge ended.'));
    updateHufReadouts();
    if (state.mode === 'huf') resize();
    if (src && src !== 'init') emit('huff', hufEventData(src));
  }
  function sortedCounts() { return state.huf.counts.map(function (c) { return c.n; }).sort(function (a, b) { return b - a; }); }
  function hufEventData(src) {
    const h = state.huf, t = h.tree;
    const k = t ? t.k : 0, N = h.syms.length;
    const sorted = h.counts.slice().sort(function (a, b) { return b.n - a.n || a.s.codePointAt(0) - b.s.codePointAt(0); });
    const fixed = K.fixedLength(k);
    return {
      src: src, typed: h.typed, tid: textId(h.text), N: N, k: k, counts: sorted.map(function (c) { return c.n; }), lens: sorted.map(function (c) { return t.lengths[c.s]; }),
      H: h.H, L: h.L, fixed: fixed, fixedBits: fixed * N, bits: h.bits.length, utf8Bits: 8 * K.utf8Bytes(h.syms), maxLen: t ? t.maxLen : 0, minLen: t ? t.minLen : 0,
      tie: h.tie
    };
  }
  /** 文字的指紋（任務判定只需要知道「是不是同一段文字」，不把文字本身交出去） */
  function textId(t) {
    let x = 2166136261;
    for (let i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
    return x.toString(36) + ':' + t.length;
  }
  /** 依最終的樹排出每個節點的位置（葉由左到右照中序排列） */
  function placeTree() {
    const h = state.huf, t = h.tree;
    h.pos = {};
    if (!t || !L || L.kind !== 'huf') return;
    let li = 0;
    (function walk(id) {
      const nd = t.nodes[id];
      if (nd.leaf) { h.pos[id] = { x: L.padL + (li + 0.5) * L.sx, y: L.y0 + t.depth[id] * L.dy }; li++; return; }
      walk(nd.l); walk(nd.r);
      h.pos[id] = { x: (h.pos[nd.l].x + h.pos[nd.r].x) / 2, y: L.y0 + t.depth[id] * L.dy };
    })(t.root);
  }
  function hufStep() {
    const h = state.huf, t = h.tree;
    if (!t) return;
    if (t.k < 2) { say(T('只有一種字：不需要合併，樹只有一個節點，碼是空的（0 位元）。', 'Only one kind of character: nothing to merge. The tree is a single node and its code is empty (0 bits).')); return; }
    if (h.built >= t.steps.length) { h.built = 0; h.stepped = true; }
    doMerge();
    if (h.built >= t.steps.length) hufFinish();
    requestDraw();
  }
  function doMerge() {
    const h = state.huf, t = h.tree;
    const st = t.steps[h.built];
    h.built++;
    h.anim = { step: h.built - 1, t0: performance.now() };
    sndMerge(h.built - 1, t.steps.length);
    const A = t.nodes[st.a], B = t.nodes[st.b];
    const nm = function (n) { return n.leaf ? '「' + showSym(n.s) + '」' + n.w : T('節點 ', 'node ') + n.w; };
    const nmEn = function (n) { return n.leaf ? '“' + showSym(n.s) + '” ' + n.w : 'node ' + n.w; };
    say(T('第 ' + h.built + ' 步：取出最小的 ' + nm(A) + '（左，0）和 ' + nm(B) + '（右，1），合併成 ' + (A.w + B.w) + '。',
      'Step ' + h.built + ': take the two smallest, ' + nmEn(A) + ' (left, 0) and ' + nmEn(B) + ' (right, 1), and join them into ' + (A.w + B.w) + '.'));
  }
  function hufAdvance(dt) {
    const h = state.huf, t = h.tree;
    h.acc = (h.acc || 0) + dt * HUF_RATE[state.speed - 1];
    while (h.acc >= 1 && h.built < t.steps.length) { h.acc -= 1; doMerge(); }
    if (h.built >= t.steps.length) { h.acc = 0; hufFinish(); }
  }
  function hufFinish() {
    const h = state.huf, t = h.tree;
    state.playing = false;
    updatePlayButton();
    sndDone(true);
    say(T('樹建好了：從樹根走到每個字的路徑就是它的碼（左 0、右 1）。平均碼長 L = ' + fmt(h.L, 3) + '，熵 H = ' + fmt(h.H, 3) + '。',
      'The tree is complete: the path from the root to each character is its code (left 0, right 1). Average length L = ' + fmt(h.L, 3) + ', entropy H = ' + fmt(h.H, 3) + '.'));
    emit('huffDone', { stepped: h.stepped, k: t.k, N: h.syms.length, typed: h.typed, tie: h.tie });
  }
  function hufRestart() {
    const h = state.huf;
    stopPlay();
    h.built = 0; h.stepped = true; h.anim = null; h.acc = 0;
    say(T('回到一開始：每個字各自是一棵只有一個節點的樹。按「下一步」合併最小的兩個。', 'Back to the start: every character is a tree with a single node. Press “Next step” to join the two smallest.'));
    requestDraw();
  }

  // ---------- 解碼 ----------
  function decReset(silent) {
    const h = state.huf, d = state.dec;
    d.playing = false; d.acc = 0; d.pos = 0; d.out = []; d.done = false; d.stepped = true; d.flash = null; d.started = false; d.leftover = 0; d.fa = null;
    d.flip = Math.round(val($('flip')));
    let bits = h.bits;
    if (d.flip >= 1 && d.flip <= bits.length) bits = bits.slice(0, d.flip - 1) + (bits[d.flip - 1] === '0' ? '1' : '0') + bits.slice(d.flip);
    d.bits = bits;
    d.cur = h.tree ? h.tree.root : -1;
    d.trail = d.cur >= 0 ? [d.cur] : [];
    updateDecButton();
    renderBitString();
    renderDecOut();
    if (!silent) requestDraw();
  }
  function decReady() {
    const h = state.huf;
    if (!h.tree || h.tree.k < 2) { say(T('只有一種字時碼是空的，沒有位元可以解碼。', 'With only one kind of character the code is empty: there are no bits to decode.')); return false; }
    if (h.built < h.tree.steps.length) { if (state.playing) stopPlay(); h.built = h.tree.steps.length; h.anim = null; }
    if (state.playing) stopPlay();
    return true;
  }
  function decStepBit() {
    const h = state.huf, d = state.dec, t = h.tree;
    if (d.pos >= d.bits.length) return;
    const b = d.bits[d.pos];
    const nd = t.nodes[d.cur];
    d.cur = b === '0' ? nd.l : nd.r;
    d.trail.push(d.cur);
    d.pos++;
    d.started = true;
    let leaf = false;
    if (t.nodes[d.cur].leaf) {
      leaf = true;
      d.out.push(t.nodes[d.cur].s);
      d.flash = { id: d.cur, t0: performance.now() };
      d.cur = t.root;
      d.trail = [t.root];
    }
    sndBit(b, leaf);
    if (d.pos >= d.bits.length) decFinish();
  }
  function decNext() {
    if (!decReady()) return;
    const d = state.dec;
    if (d.done) decReset(true);
    d.playing = false;
    updateDecButton();
    decStepBit();
    const h = state.huf;
    if (!d.done) {
      const node = h.tree.nodes[d.cur];
      say(T('讀到第 ' + d.pos + ' 個位元「' + d.bits[d.pos - 1] + '」' + (d.trail.length === 1 ? '：走到葉，寫下「' + showSym(d.out[d.out.length - 1]) + '」，回到樹根。' : '：往' + (d.bits[d.pos - 1] === '0' ? '左' : '右') + '走（目前節點的權重 ' + node.w + '）。'),
        'Bit ' + d.pos + ' is “' + d.bits[d.pos - 1] + '”' + (d.trail.length === 1 ? ': a leaf — write “' + showSym(d.out[d.out.length - 1]) + '” and go back to the root.' : ': go ' + (d.bits[d.pos - 1] === '0' ? 'left' : 'right') + ' (this node has weight ' + node.w + ').')));
    }
    renderBitPos(); renderDecOut();
    requestDraw();
  }
  function decPlay() {
    if (!decReady()) return;
    const d = state.dec;
    if (d.playing) { d.playing = false; updateDecButton(); return; }
    if (d.done) decReset(true);
    d.playing = true; d.stepped = false; d.acc = 0;
    updateDecButton();
    requestDraw();
  }
  function decAdvance(dt) {
    const d = state.dec;
    d.acc += dt * DEC_RATE[state.speed - 1];
    let n = 0;
    while (d.acc >= 1 && !d.done && n < 8) { d.acc -= 1; decStepBit(); n++; }
    renderBitPos(); renderDecOut();
  }
  function decFinish() {
    const h = state.huf, d = state.dec, t = h.tree;
    d.done = true; d.playing = false;
    updateDecButton();
    // 最後沒走到葉的位元
    let leftover = 0;
    if (d.cur !== t.root) leftover = d.trail.length - 1;
    const ok = leftover === 0 && d.out.join('') === h.syms.join('');
    let fa = null;
    if (d.flip > 0) fa = K.flipAnalysis(h.syms, t, d.flip);
    sndDecodeEnd(ok);
    d.leftover = leftover; d.fa = fa;
    renderDecOut();
    if (ok) say(T('解碼完成：' + d.out.length + ' 個字，和原文一模一樣。', 'Decoding finished: ' + d.out.length + ' characters, exactly the original text.'));
    else say(T('解碼完成，但和原文不一樣：一個位元的錯誤' + (fa && fa.resync ? '，解碼器在原文第 ' + (fa.resyncAt + 1) + ' 個字又對回來了。' : '，一路錯到最後都沒有對回來。'),
      'Decoding finished, but the result differs from the original: one wrong bit' + (fa && fa.resync ? ', and the decoder got back on track at character ' + (fa.resyncAt + 1) + '.' : ', and the decoder never got back on track.')));
    emit('decode', {
      stepped: d.stepped, flip: d.flip, ok: ok, origLen: h.syms.length, outLen: d.out.length, leftover: leftover,
      resync: fa ? fa.resync : true, after: fa ? fa.after : 0, k: t.k, N: h.syms.length, typed: h.typed
    });
  }

  // =====================================================================
  // 播放控制（兩個模式共用「下一步／播放／重來」）
  // =====================================================================
  function stopPlay() { state.playing = false; updatePlayButton(); }
  function updatePlayButton() {
    const b = $('playBtn');
    b.textContent = state.playing ? T('暫停', 'Pause') : T('播放', 'Play');
    b.setAttribute('aria-pressed', String(state.playing));
  }
  function onPlay() {
    if (state.playing) { stopPlay(); return; }
    if (state.mode === 'rle') {
      const r = state.rle;
      if (r.done) rleReset();
      r.stepped = false;
      say(T('掃描中：依「' + scanName(r.scan) + '」的順序一格一格讀，顏色一變就輸出一段。', 'Scanning ' + scanName(r.scan).toLowerCase() + ', square by square; every change of colour outputs a run.'));
    } else {
      const h = state.huf;
      if (!h.tree || h.tree.k < 2) { hufStep(); return; }
      state.dec.playing = false; updateDecButton();
      if (h.built >= h.tree.steps.length) { h.built = 0; }
      h.stepped = false; h.acc = 0.999;
    }
    state.playing = true;
    updatePlayButton();
    requestDraw();
  }
  function onStep() {
    if (state.playing) stopPlay();
    if (state.mode === 'rle') rleStep();
    else { state.dec.playing = false; updateDecButton(); hufStep(); }
  }
  function onRestart() {
    stopPlay();
    if (state.mode === 'rle') {
      rleReset();
      say(T('回到開頭：還沒有掃描任何一格。按「下一步」一段一段看，或按「播放」。', 'Back to the start: nothing scanned yet. Press “Next step” to go run by run, or “Play”.'));
      requestDraw();
    } else hufRestart();
  }
  function scanName(s) { return s === 'col' ? T('逐行', 'By columns') : s === 'snake' ? T('蛇行', 'Snake') : T('逐列', 'By rows'); }

  // =====================================================================
  // 繪圖
  // =====================================================================
  let drawQueued = false, lastT = 0;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  function frame(t) {
    drawQueued = false;
    const dt = lastT ? Math.min(1 / 30, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    let busy = false;
    if (state.playing) {
      busy = true;
      if (state.mode === 'rle') rleAdvance(dt); else hufAdvance(dt);
    }
    if (state.dec.playing) { busy = true; decAdvance(dt); }
    const h = state.huf;
    if (h.anim && t - h.anim.t0 < 420) busy = true;
    if (state.dec.flash && t - state.dec.flash.t0 < 500) busy = true;
    if (state.mode === 'rle' && state.rle.drag) busy = false;
    draw(t);
    drawChart();
    updateStepInfo();
    if (busy) requestDraw(); else lastT = 0;
  }
  function draw(t) {
    if (!L) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    D.backdrop(ctx, cw, ch);
    if (L.kind === 'rle') drawRle(t); else drawHuf(t);
  }

  // ---------- 像素格的小圖（每格一個，預先畫好） ----------
  function cellSprite(kind, s) {
    const key = kind + '|' + s + '|' + dpr + '|' + D.ver;
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(s * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const base = kind === 'ink' ? C['dc-ink'] : C['dc-paper'];
    const r = Math.max(1, s * 0.12), m = Math.max(0.6, s * 0.05);
    const gr = g.createLinearGradient(0, 0, 0, s);
    if (kind === 'ink') { gr.addColorStop(0, shade(base, D.dark ? 0.16 : 0.22)); gr.addColorStop(1, shade(base, D.dark ? -0.2 : -0.25)); }
    else { gr.addColorStop(0, shade(base, D.dark ? 0.12 : 0.6)); gr.addColorStop(1, shade(base, D.dark ? -0.12 : -0.06)); }
    D.roundRect(g, m, m, s - 2 * m, s - 2 * m, r);
    g.fillStyle = gr; g.fill();
    // 頂邊的高光、底邊的暗線
    g.save(); D.roundRect(g, m, m, s - 2 * m, s - 2 * m, r); g.clip();
    g.fillStyle = 'rgba(255,255,255,' + (kind === 'ink' ? (D.dark ? 0.1 : 0.18) : 0.55) + ')'; g.fillRect(m, m, s, Math.max(0.8, s * 0.06));
    g.fillStyle = 'rgba(0,0,0,' + (kind === 'ink' ? 0.35 : (D.dark ? 0.18 : 0.08)) + ')'; g.fillRect(m, s - m - Math.max(0.8, s * 0.06), s, Math.max(0.8, s * 0.06));
    g.restore();
    sprites[key] = c;
    return c;
  }
  function cellXY(i) { return { x: L.gx + (i % N16) * L.cell, y: L.gy + Math.floor(i / N16) * L.cell }; }

  function drawRle(t) {
    const r = state.rle, s = r.sum, cell = L.cell, G = L.G;
    // 標題：掃描順序
    D.haloText(ctx, T('掃描順序：', 'Scan order: ') + scanName(r.scan), L.gx, L.gy - 10, C.muted, 'left', 'alphabetic', fnt(12.5, 600));
    D.haloText(ctx, T('1 格 = 1 位元', '1 square = 1 bit'), L.gx + G, L.gy - 10, alpha(C.muted, 0.85), 'right', 'alphabetic', fnt(11.5, 500));
    // 面板與陰影
    ctx.save();
    ctx.shadowColor = D.shadowInk(D.dark ? 0.55 : 0.2); ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    D.roundRect(ctx, L.gx - 5, L.gy - 5, G + 10, G + 10, 10);
    ctx.fillStyle = shade(C.border, D.dark ? 0.05 : 0.35); ctx.fill();
    ctx.restore();
    D.roundRect(ctx, L.gx - 4.5, L.gy - 4.5, G + 9, G + 9, 10);
    ctx.strokeStyle = alpha(C.text, D.dark ? 0.18 : 0.14); ctx.lineWidth = 1; ctx.stroke();
    // 像素
    const ink = cellSprite('ink', cell), paper = cellSprite('paper', cell);
    for (let i = 0; i < NPX; i++) {
      const p = cellXY(i);
      ctx.drawImage(r.px[i] ? ink : paper, p.x, p.y, cell, cell);
    }
    // 掃描路徑（淡淡的導引線）
    drawScanGuide();
    // 已輸出的遊程：沿掃描路徑畫成交替兩色的膠囊
    drawRuns();
    // 掃描頭
    if (!r.done && r.pos < NPX) {
      const i = r.order[Math.min(NPX - 1, Math.floor(r.pos))];
      const p = cellXY(i);
      ctx.save();
      ctx.shadowColor = alpha(C['dc-hl'], 0.8); ctx.shadowBlur = 10;
      D.roundRect(ctx, p.x - 1.5, p.y - 1.5, cell + 3, cell + 3, 4);
      ctx.strokeStyle = C['dc-hl']; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }
    // 滑過與鍵盤游標
    if (r.hover >= 0 && !r.drag) { const p = cellXY(r.hover); D.roundRect(ctx, p.x + 0.5, p.y + 0.5, cell - 1, cell - 1, 3); ctx.strokeStyle = alpha(C.accent, 0.8); ctx.lineWidth = 1.5; ctx.stroke(); }
    if (r.kbFocus) { const p = cellXY(r.cursor); ctx.save(); ctx.setLineDash([3, 2]); D.roundRect(ctx, p.x - 1, p.y - 1, cell + 2, cell + 2, 4); ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
    drawTokens();
    drawBitBars();
  }
  function drawScanGuide() {
    const r = state.rle, cell = L.cell, G = L.G;
    ctx.save();
    ctx.strokeStyle = alpha(C.accent, D.dark ? 0.22 : 0.18);
    ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
    ctx.beginPath();
    const ord = r.order;
    for (let i = 0; i < NPX; i++) {
      const p = cellXY(ord[i]);
      const x = p.x + cell / 2, y = p.y + cell / 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    void G;
  }
  function runColor(segIdx) { return segIdx % 2 ? C['dc-runB'] : C['dc-runA']; }
  function drawRuns() {
    const r = state.rle, toks = r.sum.tokens, cell = L.cell, ord = r.order;
    const shown = r.done ? toks.length : Math.min(toks.length, r.tokIdx + 1);
    const lw = Math.max(2.5, cell * 0.22);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let segNo = 0;
    for (let ti = 0; ti < shown; ti++) {
      const tk = toks[ti];
      if (tk.zero) continue;
      const myNo = segNo++;
      let end = tokEnd(tk);
      if (!r.done && ti >= r.tokIdx) end = Math.min(end, Math.floor(r.pos));   // 正在讀的這一段
      if (end <= tk.start) continue;
      const col = runColor(myNo);
      // 依格子的列（或行）切成幾段直線
      let a = tk.start;
      while (a < end) {
        let b = a;
        const pa = cellXY(ord[a]);
        while (b + 1 < end) {
          const pb = cellXY(ord[b]), pn = cellXY(ord[b + 1]);
          if (Math.abs(pn.x - pb.x) + Math.abs(pn.y - pb.y) > cell + 0.5) break;
          if ((pn.x !== pa.x) && (pn.y !== pa.y)) break;
          b++;
        }
        const pb = cellXY(ord[b]);
        const x0 = pa.x + cell / 2, y0 = pa.y + cell / 2, x1 = pb.x + cell / 2, y1 = pb.y + cell / 2;
        ctx.strokeStyle = alpha(D.dark ? '#000000' : '#ffffff', 0.5);
        ctx.lineWidth = lw + 2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + 0.01, y1); ctx.stroke();
        ctx.strokeStyle = alpha(col, 0.82);
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + 0.01, y1); ctx.stroke();
        ctx.strokeStyle = alpha(shade(col, 0.6), 0.6);
        ctx.lineWidth = Math.max(1, lw * 0.28);
        ctx.beginPath(); ctx.moveTo(x0, y0 - lw * 0.18); ctx.lineTo(x1 + 0.01, y1 - lw * 0.18); ctx.stroke();
        a = b + 1;
      }
    }
    ctx.restore();
  }
  function drawTokens() {
    const r = state.rle, toks = r.sum.tokens;
    const shownAll = r.done ? toks.length : r.tokIdx;
    const cap = L.perRow * L.rows;
    D.haloText(ctx, T('輸出的段（', 'Runs output (') + shownAll + ' / ' + toks.length + T('）', ')'), L.tx, L.ty + 12, C.muted, 'left', 'alphabetic', fnt(12.5, 600));
    let first = 0;
    if (toks.length > cap) first = Math.max(0, Math.min(toks.length - (cap - 1), shownAll - (cap - 1)));
    let slot = 0;
    const y0 = L.ty + 22;
    const put = function (draw) {
      const row = Math.floor(slot / L.perRow), col = slot % L.perRow;
      draw(L.tx + col * (L.tokW + L.gap), y0 + row * (L.tokH + L.gap));
      slot++;
    };
    if (first > 0) put(function (x, y) { pillBox(x, y, L.tokW, L.tokH, '…' + first, C.muted, false, alpha(C.muted, 0.12)); });
    let segNo = 0;
    for (let i = 0; i < first; i++) if (!toks[i].zero) segNo++;
    const last = Math.min(toks.length, first + cap - (first > 0 ? 1 : 0));
    for (let i = first; i < last; i++) {
      const tk = toks[i];
      const out = i < shownAll;
      const myNo = tk.zero ? -1 : segNo++;
      put(function (x, y) {
        const col = tk.zero ? C.muted : runColor(myNo);
        const cur = !r.done && i === shownAll - 1;
        tokenCard(x, y, tk, col, out, cur);
      });
    }
  }
  function pillBox(x, y, w, h, text, color, strong, fill) {
    D.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
    ctx.fillStyle = fill || alpha(C.surface, 0.9); ctx.fill();
    ctx.strokeStyle = alpha(color, strong ? 0.9 : 0.45); ctx.lineWidth = strong ? 1.6 : 1; ctx.stroke();
    ctx.fillStyle = color; ctx.font = fnt(12, 600, MONO); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
  }
  function tokenCard(x, y, tk, col, out, cur) {
    const r = state.rle, w = L.tokW, h = L.tokH;
    ctx.save();
    ctx.globalAlpha = out ? 1 : 0.28;
    if (cur) { ctx.shadowColor = alpha(C['dc-hl'], 0.7); ctx.shadowBlur = 8; }
    D.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, alpha(col, D.dark ? 0.28 : 0.16)); g.addColorStop(1, alpha(col, D.dark ? 0.16 : 0.07));
    ctx.fillStyle = alpha(C.surface, 0.95); ctx.fill();
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = cur ? C['dc-hl'] : alpha(col, tk.split ? 0.5 : 0.75);
    ctx.lineWidth = cur ? 2 : 1.1;
    if (tk.split && !cur) ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    let tx = x + w / 2;
    if (r.fmt === 'pair') {
      // 顏色的小方塊
      const s = 10, sx = x + 6, sy = y + h / 2 - s / 2;
      D.roundRect(ctx, sx, sy, s, s, 2);
      ctx.fillStyle = tk.c ? C['dc-ink'] : C['dc-paper']; ctx.fill();
      ctx.strokeStyle = alpha(C.text, 0.4); ctx.lineWidth = 0.8; ctx.stroke();
      tx = x + 6 + s + (w - 6 - s) / 2;
    } else {
      // 只記長度：上緣一條細線表示這段的顏色（由輪流推得）
      ctx.fillStyle = tk.c ? alpha(C['dc-ink'], 0.85) : alpha(C['dc-paper'], 1);
      ctx.fillRect(x + 6, y + 2.5, w - 12, 2.5);
    }
    ctx.fillStyle = tk.zero ? C.muted : C.text;
    ctx.font = fnt(12.5, 700, MONO); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(tk.n), tx, y + h / 2 + 1);
    ctx.restore();
  }
  function drawBitBars() {
    const r = state.rle, s = r.sum;
    const x0 = L.pad, x1 = cw - L.pad, y = L.barY;
    const outBits = (r.done ? s.tokens.length : r.tokIdx) * s.per;
    const lblW = L.wide ? 110 : 62, valW = L.wide ? 96 : 84;
    const bx = x0 + lblW, bw = Math.max(40, x1 - bx - valW);
    const sc = bw / Math.max(s.raw, s.bits);
    const bar = function (yy, v, total, col, label) {
      D.haloText(ctx, label, x0, yy + 11, C.muted, 'left', 'alphabetic', fnt(12, 600));
      D.roundRect(ctx, bx, yy, Math.max(2, total * sc), 14, 7);
      ctx.fillStyle = alpha(col, D.dark ? 0.2 : 0.14); ctx.fill();
      if (v > 0) D.block(ctx, bx, yy, Math.max(4, v * sc), 14, col, { r: 7, shadow: false });
      // 數字放在整條（最終長度）的右邊，播放時不會跳來跳去
      D.haloText(ctx, intText(v) + T(' 位元', ' bits'), bx + Math.max(v, total) * sc + 8, yy + 11.5, C.text, 'left', 'alphabetic', fnt(12, 700, MONO));
    };
    bar(y, s.raw, s.raw, C['dc-raw'], T('原始', 'Original'));
    bar(y + 24, outBits, s.bits, outBits > s.raw ? C['dc-warn'] : C['dc-enc'], T('編碼後', 'Encoded'));
    // 原始大小的參考線
    const rx = Math.round(bx + s.raw * sc) + 0.5;
    ctx.save(); ctx.setLineDash([3, 3]);
    ctx.strokeStyle = alpha(C['dc-raw'], 0.7); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rx, y + 16); ctx.lineTo(rx, y + 42); ctx.stroke();
    ctx.restore();
  }

  // ---------- 霍夫曼樹 ----------
  function drawHuf(t) {
    const h = state.huf, tr = h.tree;
    if (!tr) { D.haloText(ctx, T('打一段文字，按「建樹」。', 'Type some text and press “Build the tree”.'), cw / 2, 60, C.muted, 'center', 'alphabetic', fnt(14, 600)); return; }
    drawQueue(t);
    // 左側刻度：碼長（= 深度）
    ctx.save();
    for (let d = 0; d <= tr.maxLen; d++) {
      const y = L.y0 + d * L.dy;
      ctx.strokeStyle = alpha(C.text, d === 0 ? 0.08 : 0.05); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(L.padL - 6, Math.round(y) + 0.5); ctx.lineTo(cw - L.padR, Math.round(y) + 0.5); ctx.stroke();
      if (L.dy >= 16 || d % 2 === 0) D.haloText(ctx, String(d), L.padL - 10, y + 4, alpha(C.muted, 0.9), 'right', 'alphabetic', fnt(11, 600, MONO));
    }
    D.haloText(ctx, T('碼長', 'length'), 4, L.y0 - 14, C.muted, 'left', 'alphabetic', fnt(11, 600));
    ctx.restore();
    const built = h.built, now = performance.now();
    const d = state.dec;
    const decoding = d.started || d.playing || d.done;
    const trailSet = {};
    if (decoding) for (let i = 1; i < d.trail.length; i++) trailSet[d.trail[i]] = true;
    // 邊
    tr.nodes.forEach(function (nd) {
      if (nd.leaf || nd.step >= built) return;
      const u = h.anim && h.anim.step === nd.step ? Math.min(1, (now - h.anim.t0) / 380) : 1;
      const p = h.pos[nd.id];
      [nd.l, nd.r].forEach(function (cid, side) {
        const c = h.pos[cid];
        const x1 = c.x + (p.x - c.x) * u, y1 = c.y + (p.y - c.y) * u;
        const col = side ? C['dc-one'] : C['dc-zero'];
        const hot = trailSet[cid];
        D.tube(ctx, function (g) { g.moveTo(c.x, c.y); g.lineTo(x1, y1); }, hot ? C['dc-hl'] : alpha(col, 0.85), hot ? 5 : 3.2);
        if (u >= 1 && L.dy >= 18 && Math.abs(p.x - c.x) >= 18) {
          const mx = (p.x + c.x) / 2, my = (p.y + c.y) / 2;
          D.pill(ctx, side ? '1' : '0', mx + (side ? 7 : -7), my + 7, col, 'center', fnt(10.5, 700, MONO));
        }
      });
    });
    // 節點
    const queue = built < tr.steps.length ? tr.steps[built].order : [tr.root];
    const qset = {}; queue.forEach(function (id) { qset[id] = true; });
    const next = built < tr.steps.length ? [tr.steps[built].a, tr.steps[built].b] : [];
    tr.nodes.forEach(function (nd) {
      if (!nd.leaf && nd.step >= built) return;
      const p = h.pos[nd.id];
      const u = !nd.leaf && h.anim && h.anim.step === nd.step ? Math.min(1, (now - h.anim.t0) / 380) : 1;
      const isNext = next.indexOf(nd.id) >= 0;
      const flash = d.flash && d.flash.id === nd.id ? Math.max(0, 1 - (now - d.flash.t0) / 500) : 0;
      const cur = decoding && d.cur === nd.id && !d.done;
      if (nd.leaf) drawLeaf(nd, p, qset[nd.id], isNext, flash, h.sel === nd.id);
      else drawInner(nd, p, u, qset[nd.id] && built < tr.steps.length, isNext);
      if (isNext) D.pill(ctx, String(next.indexOf(nd.id) + 1), p.x + (nd.leaf ? L.bw / 2 : L.nr) + 2, p.y - (nd.leaf ? L.bh / 2 : L.nr) + 4, C['dc-hl'], 'left', fnt(10.5, 700));
      if (cur) {
        ctx.save(); ctx.shadowColor = alpha(C['dc-hl'], 0.9); ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(p.x, p.y, (nd.leaf ? Math.max(L.bw, L.bh) / 2 : L.nr) + 5, 0, Math.PI * 2);
        ctx.strokeStyle = C['dc-hl']; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
      }
    });
    // 葉下面的碼（已經長出來的部分）
    for (let i = 0; i < tr.k; i++) {
      const nd = tr.nodes[i], p = h.pos[i];
      const code = tr.k === 1 ? '' : K.partialCode(tr, i, built);
      const text = tr.k === 1 ? T('（空）', '(empty)') : code;
      if (!text) continue;
      let fs = Math.min(12, (L.sx - 2) / Math.max(1, text.length * 0.62));
      if (fs < 6.5) continue;
      D.haloText(ctx, text, p.x, p.y + L.bh / 2 + 14, built >= tr.steps.length ? C['dc-leaf'] : alpha(C['dc-leaf'], 0.8), 'center', 'alphabetic', fnt(fs, 700, MONO));
      void nd;
    }
    drawDecodeStrip(t);
  }
  function drawQueue() {
    const h = state.huf, tr = h.tree, built = h.built;
    const queue = built < tr.steps.length ? tr.steps[built].order : [tr.root];
    const title = built < tr.steps.length ? T('待合併（依取出的先後排好）', 'Waiting to be merged (in the order they will be taken)') : T('合併完成：只剩樹根', 'Done: only the root is left');
    D.haloText(ctx, title, 8, 16, C.muted, 'left', 'alphabetic', fnt(12, 600));
    const x0 = 8, y = 24, hh = 24;
    let x = x0;
    const maxX = cw - 8;
    for (let i = 0; i < queue.length; i++) {
      const nd = tr.nodes[queue[i]];
      const label = nd.leaf ? showSym(nd.s) + ' ' + nd.w : String(nd.w);
      ctx.font = fnt(12, 700, nd.leaf ? FONT : MONO);
      const w = Math.max(28, ctx.measureText(label).width + 16);
      if (x + w > maxX - 30 && i < queue.length - 1) {
        D.haloText(ctx, '… +' + (queue.length - i), x + 2, y + 16, C.muted, 'left', 'alphabetic', fnt(12, 600));
        break;
      }
      const hot = i < 2 && built < tr.steps.length;
      const col = nd.leaf ? C['dc-leaf'] : C['dc-node'];
      ctx.save();
      if (hot) { ctx.shadowColor = alpha(C['dc-hl'], 0.6); ctx.shadowBlur = 8; }
      D.roundRect(ctx, x + 0.5, y + 0.5, w - 1, hh - 1, hh / 2);
      ctx.fillStyle = alpha(C.surface, 0.96); ctx.fill();
      ctx.fillStyle = alpha(col, D.dark ? 0.22 : 0.12); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hot ? C['dc-hl'] : alpha(col, 0.6); ctx.lineWidth = hot ? 2 : 1; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = fnt(12, 700, nd.leaf ? FONT : MONO);
      ctx.fillText(label, x + w / 2, y + hh / 2 + 0.5);
      x += w + 6;
    }
  }
  function drawLeaf(nd, p, inQueue, isNext, flash, sel) {
    const w = L.bw, hgt = L.bh;
    const x = p.x - w / 2, y = p.y - hgt / 2;
    const col = C['dc-leaf'];
    ctx.save();
    if (isNext || flash > 0 || sel) { ctx.shadowColor = alpha(C['dc-hl'], 0.75 * Math.max(isNext || sel ? 1 : 0, flash)); ctx.shadowBlur = 12; }
    D.block(ctx, x, y, w, hgt, shade(col, D.dark ? -0.45 : 0.82), { r: 7, shadow: !isNext, stroke: isNext || sel ? C['dc-hl'] : alpha(col, inQueue ? 0.9 : 0.55) });
    ctx.restore();
    if (flash > 0) { D.roundRect(ctx, x - 2, y - 2, w + 4, hgt + 4, 9); ctx.strokeStyle = alpha(C['dc-hl'], flash); ctx.lineWidth = 2.5; ctx.stroke(); }
    // 字與次數
    const fs = Math.max(9, Math.min(16, w * 0.42));
    ctx.fillStyle = C.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = fnt(fs, 700);
    ctx.fillText(showSym(nd.s), p.x, p.y - hgt * 0.15);
    ctx.font = fnt(Math.max(8, Math.min(11, w * 0.3)), 600, MONO);
    ctx.fillStyle = alpha(C.muted, 1);
    ctx.fillText(String(nd.w), p.x, p.y + hgt * 0.27);
  }
  function drawInner(nd, p, u, inQueue, isNext) {
    const r = L.nr * (0.4 + 0.6 * u);
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.7 * u;
    if (isNext) { ctx.shadowColor = alpha(C['dc-hl'], 0.8); ctx.shadowBlur = 12; }
    D.ball(ctx, p.x, p.y, r, C['dc-node'], { glow: D.dark ? 0.25 : 0, ring: isNext ? C['dc-hl'] : (inQueue ? alpha(C['dc-hl'], 0.6) : undefined) });
    ctx.restore();
    if (L.nr >= 8) {
      ctx.font = fnt(Math.min(11, r * 0.95), 700, MONO);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = u;
      ctx.fillText(String(nd.w), p.x, p.y + 0.5);
      ctx.globalAlpha = 1;
    }
  }
  function drawDecodeStrip() {
    const h = state.huf, d = state.dec, tr = h.tree;
    const y = L.decY;
    ctx.save();
    ctx.strokeStyle = alpha(C.text, 0.08); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(8, Math.round(y) - 6.5); ctx.lineTo(cw - 8, Math.round(y) - 6.5); ctx.stroke();
    ctx.restore();
    if (tr.k < 2) {
      D.haloText(ctx, T('只有一種字：碼是空的，編碼後 0 位元。', 'Only one kind of character: the code is empty, 0 bits after encoding.'), 8, y + 18, C.muted, 'left', 'alphabetic', fnt(12.5, 600));
      return;
    }
    const decoding = d.started || d.playing || d.done;
    D.haloText(ctx, decoding ? T('解碼中的位元', 'Bits being decoded') : T('編碼後的位元', 'Encoded bits'), 8, y + 10, C.muted, 'left', 'alphabetic', fnt(11.5, 600));
    // 位元窗口：目前位置附近
    const cwid = 11.5, lbl = 8;
    const cap = Math.max(8, Math.floor((cw - 16) / cwid));
    const bits = d.bits;
    let start = 0;
    if (bits.length > cap) start = Math.max(0, Math.min(bits.length - cap, d.pos - Math.floor(cap / 2)));
    ctx.font = fnt(13, 700, MONO); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    for (let i = start; i < Math.min(bits.length, start + cap); i++) {
      const x = lbl + (i - start + 0.5) * cwid;
      const isCur = decoding && i === d.pos && !d.done;
      if (isCur) { D.roundRect(ctx, x - cwid / 2 + 0.5, y + 15, cwid - 1, 18, 3); ctx.fillStyle = C['dc-hl']; ctx.fill(); }
      const flipped = d.flip === i + 1;
      ctx.fillStyle = isCur ? C.surface : flipped ? C['dc-warn'] : (decoding && i < d.pos) ? alpha(C.muted, 0.7) : (bits[i] === '0' ? C['dc-zero'] : C['dc-one']);
      ctx.fillText(bits[i], x, y + 29);
      if (flipped) { ctx.fillRect(x - 4, y + 32, 8, 1.5); ctx.fillStyle = C['dc-warn']; }
    }
    if (start > 0) D.haloText(ctx, '…', 2, y + 29, C.muted, 'left', 'alphabetic', fnt(12, 700));
    // 解出的字
    const outText = d.out.map(showSym).join('');
    const label = T('解出：', 'Decoded: ');
    ctx.font = fnt(13.5, 600);
    const lw = ctx.measureText(label).width;
    let show = outText;
    const maxW = cw - 16 - lw - 8;
    ctx.font = fnt(14, 700);
    while (show.length > 1 && ctx.measureText('…' + show).width > maxW) show = Array.from(show).slice(1).join('');
    if (show !== outText) show = '…' + show;
    D.haloText(ctx, label, 8, y + 56, C.muted, 'left', 'alphabetic', fnt(13.5, 600));
    D.haloText(ctx, show || (decoding ? '' : T('（按「下一位」或「自動解碼」）', '(press “Next bit” or “Auto-decode”)')), 8 + lw + 4, y + 56, outText ? C.text : alpha(C.muted, 0.85), 'left', 'alphabetic', fnt(outText ? 14 : 12.5, outText ? 700 : 500));
  }

  // ---------- 下方的圖 ----------
  function drawChart() {
    const c = ctx2, w = cw2, h = ch2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    if (state.mode === 'rle') drawKChart(c, w, h); else drawHLChart(c, w, h);
  }
  function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }
  function drawKChart(c, w, h) {
    const r = state.rle, s = r.sum;
    const left = 48, right = w - 12, top = 30, bottom = h - 42, narrow = w < 560;
    const vals = [];
    for (let k = K.K_MIN; k <= K.K_MAX; k++) vals.push(s.bitsByK[k]);
    const vmax = niceMax(Math.max(s.raw, Math.max.apply(null, vals)) * 1.08);
    const Y = function (v) { return bottom - (bottom - top) * v / vmax; };
    D.haloText(c, narrow ? T('每一種長度欄位 k', 'Each length field k') : T('長度欄位 k 的每一種選擇（同樣的掃描順序與格式）', 'Every choice of the length field k (same scan order and format)'), 12, 16, C.muted, 'left', 'alphabetic', fnt(12, 600));
    // 圖例：虛線 = 原始 256 位元
    const lg = T('原始 256 位元', 'original 256 bits');
    c.font = fnt(11.5, 600);
    const lgx = right - c.measureText(lg).width;
    c.save(); c.setLineDash([5, 4]); c.strokeStyle = C['dc-raw']; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(lgx - 26, 12); c.lineTo(lgx - 6, 12); c.stroke(); c.restore();
    D.haloText(c, lg, lgx, 16, C.muted, 'left', 'alphabetic', fnt(11.5, 600));
    // 格線與刻度
    c.save();
    for (let g = 0; g <= 4; g++) {
      const v = vmax * g / 4, y = Math.round(Y(v)) + 0.5;
      c.strokeStyle = alpha(C.text, g === 0 ? 0.18 : 0.07); c.lineWidth = 1;
      c.beginPath(); c.moveTo(left, y); c.lineTo(right, y); c.stroke();
      D.haloText(c, intText(Math.round(v)), left - 6, y + 4, C.muted, 'right', 'alphabetic', fnt(11, 500));
    }
    c.restore();
    const n = vals.length, slot = (right - left) / n, bw = Math.min(46, slot * 0.62);
    const best = Math.min.apply(null, vals);
    for (let i = 0; i < n; i++) {
      const k = K.K_MIN + i, v = vals[i];
      const x = left + (i + 0.5) * slot - bw / 2, y = Y(v);
      const cur = k === r.k;
      const col = v > s.raw ? C['dc-warn'] : cur ? C['dc-enc'] : shade(C['dc-enc'], D.dark ? -0.35 : 0.45);
      D.block(c, x, y, bw, bottom - y, col, { r: 4, shadow: true, stroke: cur ? C['dc-hl'] : undefined });
      if (cur) { c.save(); D.roundRect(c, x - 2, y - 2, bw + 4, bottom - y + 4, 6); c.strokeStyle = C['dc-hl']; c.lineWidth = 2; c.stroke(); c.restore(); }
      D.haloText(c, String(v), x + bw / 2, y - 5, cur ? C.text : C.muted, 'center', 'alphabetic', fnt(11, cur ? 700 : 500, MONO));
      D.haloText(c, 'k=' + k, x + bw / 2, bottom + 15, cur ? C.text : C.muted, 'center', 'alphabetic', fnt(11.5, cur ? 700 : 500));
      if (v === best) D.pill(c, T('最省', 'best'), x + bw / 2, bottom + 37, C['dc-ok'], 'center', fnt(10.5, 700));
    }
    // 原始 256 的虛線
    const ry = Math.round(Y(s.raw)) + 0.5;
    c.save(); c.setLineDash([5, 4]); c.strokeStyle = C['dc-raw']; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(left, ry); c.lineTo(right, ry); c.stroke(); c.restore();
  }
  function drawHLChart(c, w, h) {
    const hh = state.huf;
    const left = 40, right = w - 16, top = 28, bottom = h - 30;
    const hmax = 5.2, lmax = 6.2;   // 最多 32 種字：H ≤ 5，L < H + 1 ≤ 6
    const X = function (v) { return left + v * (right - left) / hmax; }, Y = function (v) { return bottom - v * (bottom - top) / lmax; };
    D.haloText(c, w < 560 ? T('熵 H 與平均碼長 L（每段文字一個點）', 'Entropy H and average length L') : T('每段文字一個點：熵 H（橫軸）與平均碼長 L（縱軸）', 'One point per text: entropy H (across) and average code length L (up)'), 12, 16, C.muted, 'left', 'alphabetic', fnt(12, 600));
    // 格線與刻度
    c.save();
    c.lineWidth = 1;
    for (let v = 0; v <= 5; v++) {
      const x = Math.round(X(v)) + 0.5;
      c.strokeStyle = alpha(C.text, v === 0 ? 0.2 : 0.06);
      c.beginPath(); c.moveTo(x, Y(0)); c.lineTo(x, Y(lmax)); c.stroke();
      D.haloText(c, String(v), x, bottom + 15, C.muted, 'center', 'alphabetic', fnt(11, 500));
    }
    for (let v = 0; v <= 6; v++) {
      const y = Math.round(Y(v)) + 0.5;
      c.strokeStyle = alpha(C.text, v === 0 ? 0.2 : 0.06);
      c.beginPath(); c.moveTo(X(0), y); c.lineTo(X(hmax), y); c.stroke();
      D.haloText(c, String(v), left - 8, y + 4, C.muted, 'right', 'alphabetic', fnt(11, 500));
    }
    c.restore();
    D.haloText(c, 'H', right, bottom + 26, C.muted, 'right', 'alphabetic', fnt(12, 700));
    D.haloText(c, 'L', left + 6, Y(lmax) + 5, C.muted, 'left', 'alphabetic', fnt(12, 700));
    // 帶狀區 H ≤ L < H + 1
    c.save();
    c.beginPath();
    c.moveTo(X(0), Y(0)); c.lineTo(X(hmax), Y(hmax)); c.lineTo(X(hmax), Y(hmax + 1)); c.lineTo(X(0), Y(1)); c.closePath();
    const g = c.createLinearGradient(0, Y(1), 0, Y(0));
    g.addColorStop(0, alpha(C['dc-ok'], D.dark ? 0.08 : 0.06)); g.addColorStop(1, alpha(C['dc-ok'], D.dark ? 0.2 : 0.15));
    c.fillStyle = g; c.fill();
    c.lineCap = 'round';
    c.strokeStyle = C['dc-ok']; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(hmax), Y(hmax)); c.stroke();
    c.setLineDash([6, 5]); c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(X(0), Y(1)); c.lineTo(X(hmax), Y(hmax + 1)); c.stroke();
    c.restore();
    D.pill(c, 'L = H + 1', X(2.5) - 6, Y(3.5) + 2, C['dc-ok'], 'right', fnt(11, 700));
    D.pill(c, 'L = H', X(4.3) + 6, Y(4.3) + 20, C['dc-ok'], 'left', fnt(11, 700));
    // 以前的點
    const hist = hh.hist;
    for (let i = 0; i < hist.length - 1; i++) D.ball(c, X(hist[i].H), Y(hist[i].L), 3.6, C['dc-node'], { shadow: false });
    if (hh.tree) {
      const x = X(hh.H), y = Y(hh.L);
      D.ball(c, x, y, 6.5, C['dc-hl'], { glow: D.dark ? 0.35 : 0.15 });
      const lbl = 'H = ' + fmt(hh.H, 2) + ', L = ' + fmt(hh.L, 2);
      const rightSide = x < (left + right) / 2;
      D.pill(c, lbl, x + (rightSide ? 12 : -12), y + 22, C.text, rightSide ? 'left' : 'right', fnt(11.5, 700));
    }
  }

  // =====================================================================
  // 讀數
  // =====================================================================
  const lastHTML = {};
  function setHTML(id, html) { if (lastHTML[id] !== html) { lastHTML[id] = html; $(id).innerHTML = html; } }
  function katexInto(el, tex) {
    if (el._tex === tex) return;
    el._tex = tex;
    if (window.katex) { try { window.katex.render(tex, el, { throwOnError: false, displayMode: false }); return; } catch (e) { /* 退回純文字 */ } }
    el.textContent = tex;
  }
  function updateRleReadouts() {
    const r = state.rle, s = r.sum;
    const bitsU = T(' 位元', ' bits');
    setHTML('rRaw', '256' + bitsU + ' <small>(16 × 16)</small>');
    setHTML('rBlack', s.black + ' ／ 256');
    setHTML('rRuns', s.tokens.length + T(' 段', '') + ' <small>' + T('（遊程 ' + s.runs.length + ' 個）', '(' + s.runs.length + ' runs before splitting)') + '</small>');
    setHTML('rPer', s.per + bitsU + ' <small>' + (r.fmt === 'alt' ? T('（長度 ' + r.k + '）', '(length ' + r.k + ')') : T('（顏色 1 + 長度 ' + r.k + '）', '(colour 1 + length ' + r.k + ')')) + '</small>');
    setHTML('rBits', s.bits + bitsU);
    $('rBits').className = s.bits > s.raw ? 'big' : s.bits < s.raw ? 'good' : '';
    setHTML('rRatio', fmt(s.raw / s.bits, 2) + ' : 1');
    const ch = (s.bits - s.raw) / s.raw * 100;
    setHTML('rChange', (ch > 0 ? '+' : ch < 0 ? '−' : '') + fmt(Math.abs(ch), 1) + '%');
    $('rChange').className = ch > 0 ? 'big' : ch < 0 ? 'good' : '';
    katexInto($('rleEq'), s.tokens.length + ' \\times ' + (r.fmt === 'alt' ? r.k : '(1 + ' + r.k + ')') + ' = ' + s.bits + (s.bits < 256 ? ' < ' : s.bits > 256 ? ' > ' : ' = ') + '256');
    // 遊程清單
    let html = '';
    s.tokens.forEach(function (t) {
      html += '<span class="tk' + (t.zero ? ' z' : '') + '">' + (r.fmt === 'pair' ? '<i class="' + (t.c ? 'b' : 'w') + '"></i>' : '<i class="' + (t.c ? 'b' : 'w') + '"></i>') + t.n + '</span>';
    });
    setHTML('rleList', html);
    let bh = '';
    s.tokens.forEach(function (t, i) { bh += '<span class="cw' + (i % 2 ? ' alt' : '') + '">' + K.tokenCode(t, r.fmt, r.k) + '</span>'; });
    setHTML('rleBits', bh);
    $('kbitso').textContent = String(r.k);
    $('fmtHint').textContent = r.fmt === 'alt'
      ? T('只記長度：從白色開始、黑白輪流，每段 ' + r.k + ' 位元，最長 ' + K.maxRun(r.k) + '。圖從黑色開始時先記一段長度 0 的白；太長的段拆成「' + K.maxRun(r.k) + '、0、剩下的」。',
        'Length only: the colours take turns starting with white; each run is ' + r.k + ' bits, at most ' + K.maxRun(r.k) + ' long. A picture that starts with black begins with a white run of length 0; a run that is too long becomes “' + K.maxRun(r.k) + ', 0, the rest”.')
      : T('顏色＋長度：每段先 1 位元顏色（白 0、黑 1），再 ' + r.k + ' 位元長度，最長 ' + K.maxRun(r.k) + '；更長的段要拆開。',
        'Colour + length: each run is 1 bit of colour (white 0, black 1) followed by ' + r.k + ' bits of length, at most ' + K.maxRun(r.k) + '; longer runs are split.');
  }
  function updateHufReadouts() {
    const h = state.huf, t = h.tree;
    const bitsU = T(' 位元', ' bits'), perU = T(' 位元／字', ' bits/char');
    if (!t) return;
    const N = h.syms.length, k = t.k, fixed = K.fixedLength(k), utf = K.utf8Bytes(h.syms);
    setHTML('hN', String(N));
    setHTML('hK', String(k));
    setHTML('hH', fmt(h.H, 3) + perU);
    setHTML('hL', fmt(h.L, 3) + perU);
    setHTML('hFix', fixed + perU);
    setHTML('hUtf', intText(utf * 8) + bitsU + ' <small>' + T('（' + utf + ' 位元組）', '(' + utf + ' bytes)') + '</small>');
    setHTML('hFixBits', intText(fixed * N) + bitsU);
    setHTML('hBits', intText(h.bits.length) + bitsU);
    $('hBits').className = h.bits.length < fixed * N ? 'good' : '';
    setHTML('hEff', h.L > 0 ? fmt(h.H / h.L * 100, 1) + '%' : '—');
    if (k > 1) katexInto($('hufEq'), 'H = ' + fmt(h.H, 3) + ' \\le L = ' + fmt(h.L, 3) + ' < H + 1 = ' + fmt(h.H + 1, 3));
    else katexInto($('hufEq'), 'H = 0 = L');
    // 次數表：依次數由大到小
    const rows = h.counts.slice().sort(function (a, b) { return b.n - a.n || a.s.codePointAt(0) - b.s.codePointAt(0); });
    const tab = $('freqTab');
    tab.textContent = '';
    const head = document.createElement('tr');
    [T('字', 'Char'), T('次數', 'Count'), 'p', '−log<sub>2</sub> p', T('碼', 'Code'), T('碼長', 'Length')].forEach(function (x) { const th = document.createElement('th'); th.innerHTML = x; head.appendChild(th); });
    tab.appendChild(head);
    rows.forEach(function (c) {
      const tr = document.createElement('tr');
      const p = c.n / N;
      const cells = [showSym(c.s), String(c.n), fmt(p, 3), fmt(-Math.log2(p), 2), t.codes[c.s] === '' ? T('（空）', '(empty)') : t.codes[c.s], String(t.lengths[c.s])];
      cells.forEach(function (x, j) {
        const td = document.createElement('td');
        td.textContent = x;
        if (j === 0) td.className = 'sym';
        if (j === 4) td.className = 'code';
        tr.appendChild(td);
      });
      const leafId = t.nodes.findIndex(function (nd) { return nd.leaf && nd.s === c.s; });
      if (leafId === h.sel) tr.className = 'sel';
      tab.appendChild(tr);
    });
    renderBitString();
  }
  // 位元串：每個字的碼一塊（交替底色），每一位一個 span（解碼時標出目前的位置）
  let bitSpans = [];
  function renderBitString() {
    const h = state.huf, t = h.tree, box = $('bitStr');
    box.textContent = '';
    bitSpans = [];
    if (!t) return;
    if (t.k < 2) { box.textContent = T('（空的：只有一種字，0 位元）', '(empty: only one kind of character, 0 bits)'); return; }
    const d = state.dec;
    let bi = 0;
    h.syms.forEach(function (s, i) {
      const cw = document.createElement('span');
      cw.className = 'cw' + (i % 2 ? ' alt' : '');
      cw.title = showSym(s);
      const code = t.codes[s];
      for (let j = 0; j < code.length; j++) {
        const b = document.createElement('span');
        b.className = 'bit';
        b.textContent = d.bits[bi] != null ? d.bits[bi] : code[j];
        if (d.flip === bi + 1) b.classList.add('flip');
        bitSpans.push(b);
        cw.appendChild(b);
        bi++;
      }
      box.appendChild(cw);
    });
    renderBitPos();
  }
  let lastBitPos = -1;
  function renderBitPos() {
    const d = state.dec;
    const decoding = d.started || d.playing || d.done;
    const pos = decoding ? d.pos : -1;
    if (pos === lastBitPos && bitSpans.length && bitSpans._pos === pos) return;
    bitSpans.forEach(function (b, i) {
      b.classList.toggle('read', decoding && i < d.pos);
      b.classList.toggle('cur', decoding && i === d.pos && !d.done);
    });
    bitSpans._pos = pos;
    lastBitPos = pos;
  }
  function renderDecOut() {
    const leftover = state.dec.leftover || 0, fa = state.dec.fa;
    const h = state.huf, d = state.dec, box = $('decOut');
    box.textContent = '';
    if (!h.tree) return;
    if (h.tree.k < 2) { box.textContent = T('只有一種字，沒有位元可以解碼（接收的人只要知道字數就能還原）。', 'Only one kind of character, so there are no bits to decode (the receiver only needs the number of characters).'); return; }
    const decoding = d.started || d.playing || d.done;
    if (!decoding) {
      box.textContent = d.flip > 0
        ? T('第 ' + d.flip + ' 個位元在傳輸時被弄錯了（紅色底線）。按「下一位」或「自動解碼」看看會發生什麼事。', 'Bit ' + d.flip + ' was flipped during transmission (red underline). Press “Next bit” or “Auto-decode” and see what happens.')
        : T('按「下一位」一個位元一個位元解碼，或按「自動解碼」。', 'Press “Next bit” to decode one bit at a time, or “Auto-decode”.');
      return;
    }
    const lab1 = document.createElement('div');
    lab1.appendChild(document.createTextNode(T('解出：', 'Decoded: ')));
    const b = document.createElement('b');
    d.out.forEach(function (s, i) {
      const sp = document.createElement('span');
      sp.textContent = showSym(s);
      if (d.done && (i >= h.syms.length || h.syms[i] !== s)) sp.className = 'bad';
      b.appendChild(sp);
    });
    lab1.appendChild(b);
    box.appendChild(lab1);
    if (d.done) {
      const lab2 = document.createElement('div');
      const ok = leftover === 0 && d.out.join('') === h.syms.join('');
      if (ok) { lab2.className = 'ok'; lab2.textContent = T('✓ 和原文一模一樣（' + d.out.length + ' 個字）。', '✓ Exactly the original text (' + d.out.length + ' characters).'); }
      else {
        let msg = T('原文 ' + h.syms.length + ' 個字，解出 ' + d.out.length + ' 個字', 'Original ' + h.syms.length + ' characters, decoded ' + d.out.length);
        if (leftover) msg += T('，最後還剩 ' + leftover + ' 個位元走不到葉', '; ' + leftover + ' bit' + (leftover > 1 ? 's are' : ' is') + ' left over at the end without reaching a leaf');
        if (fa) msg += fa.resync ? T('；從原文第 ' + (fa.resyncAt + 1) + ' 個字起又對回來了。', '; back on track from character ' + (fa.resyncAt + 1) + ' of the original.') : T('；錯誤一路傳到最後。', '; the error ran all the way to the end.');
        else msg += T('。', '.');
        lab2.textContent = msg;
      }
      box.appendChild(lab2);
    }
  }
  function updateDecButton() {
    $('decPlay').textContent = state.dec.playing ? T('暫停解碼', 'Pause') : T('自動解碼', 'Auto-decode');
    $('flipo').textContent = String(state.dec.flip);
  }
  function updateStepInfo() {
    let s = '';
    if (state.mode === 'rle') {
      const r = state.rle, n = r.sum.tokens.length;
      s = T('段 ', 'run ') + (r.done ? n : r.tokIdx) + ' / ' + n + ' · ' + T('格 ', 'square ') + (r.done ? NPX : Math.floor(r.pos)) + ' / 256';
    } else if (state.huf.tree) {
      const h = state.huf, n = h.tree.steps.length;
      s = T('合併 ', 'merge ') + h.built + ' / ' + n;
    }
    if ($('stepInfo')._s !== s) { $('stepInfo')._s = s; $('stepInfo').textContent = s; }
  }
  function updateCap() {
    $('cap2').textContent = state.mode === 'rle'
      ? T('同一張圖、同樣的掃描順序與格式，只改長度欄位 k：太短要拆很多段，太長每段都浪費。紅色表示比原始還大。', 'Same picture, scan order and format, changing only the length field k: too short means many splits, too long wastes bits on every run. Red means larger than the original.')
      : T('綠色帶是 H ≤ L < H + 1：每一段文字的霍夫曼碼都落在這條帶子裡。點會一直累積，按「全部清除」可以清掉。', 'The green band is H ≤ L < H + 1: the Huffman code of every text lands inside it. The points keep piling up; “Clear all” removes them.');
  }

  // =====================================================================
  // 解碼挑戰
  // =====================================================================
  function quizPool() {
    const h = state.huf;
    if (!h.tree) return [];
    return h.counts.map(function (c) { return c.s; }).filter(function (s) { return /\S/.test(s); });
  }
  function quizStart() {
    if (state.quiz) { quizNext(); return; }
    const pool = quizPool();
    if (pool.length < 4) { $('quizQ').textContent = T('碼表裡至少要有 4 種看得見的字（不算空白）才能出題。換一段文字試試。', 'The code table needs at least 4 different visible characters (not counting spaces). Try another text.'); return; }
    const h = state.huf;
    state.quiz = { i: 0, correct: 0, t0: performance.now(), q: null, wait: false, k: h.tree.k, maxLen: h.tree.maxLen, pool: pool };
    state.streak = 0;
    $('quizStop').hidden = false;
    $('quizStart').textContent = T('下一題', 'Next question');
    quizNext();
    tickQuiz();
  }
  function quizNext() {
    const z = state.quiz;
    if (!z || (z.q && !z.wait)) return;
    const h = state.huf;
    const len = 4 + Math.floor(qrand() * 3);
    const word = K.quizWord(qrand, z.pool, len);
    z.q = { word: word, bits: K.encodeSyms(word, h.tree.codes) };
    z.wait = false;
    $('quizQ').innerHTML = '';
    const sp = document.createElement('span');
    sp.textContent = T('第 ' + (z.i + 1) + '／5 題：這串位元是哪些字？ ', 'Question ' + (z.i + 1) + ' of 5: which characters are these bits? ');
    const code = document.createElement('code');
    code.textContent = z.q.bits;
    $('quizQ').appendChild(sp); $('quizQ').appendChild(code);
    $('quizIn').value = '';
    $('quizOk').disabled = false;
    $('quizStart').disabled = true;
  }
  function quizCheck() {
    const z = state.quiz;
    if (!z || !z.q || z.wait) return;
    const ans = K.symbols($('quizIn').value.replace(/\s+/g, '')).join('');
    if (!ans) { $('quizIn').focus(); return; }
    const ok = ans === z.q.word.join('');
    z.wait = true; z.i++;
    if (ok) { z.correct++; state.streak++; } else state.streak = 0;
    sndChime(ok);
    emit('quiz', { ok: ok, streak: state.streak, k: z.k, maxLen: z.maxLen });
    $('quizOk').disabled = true;
    $('quizQ').textContent = ok ? T('✓ 答對了！', '✓ Correct!') : T('✗ 正確答案是「' + z.q.word.map(showSym).join('') + '」', '✗ The answer is “' + z.q.word.map(showSym).join('') + '”');
    if (z.i >= 5) { setTimeout(quizEnd, reducedMotion ? 200 : 700); return; }
    $('quizStart').disabled = false;
  }
  function quizEnd() {
    const z = state.quiz;
    if (!z) return;
    const time = Math.round((performance.now() - z.t0) / 100) / 10;
    state.rounds.push({ k: z.k, correct: z.correct, time: time });
    emit('round', { correct: z.correct, total: 5, time: time, k: z.k });
    quizExit(T('這一回合答對 ' + z.correct + '／5，用了 ' + time.toFixed(1) + ' 秒。', 'This round: ' + z.correct + ' / 5 correct in ' + time.toFixed(1) + ' s.'));
    renderRounds();
  }
  function quizExit(msg) {
    state.quiz = null;
    $('quizStop').hidden = true;
    $('quizStart').disabled = false;
    $('quizStart').textContent = T('出題', 'New question');
    $('quizOk').disabled = true;
    $('quizStat').innerHTML = '';
    if (msg) $('quizQ').textContent = msg;
  }
  function tickQuiz() {
    const z = state.quiz;
    if (!z) return;
    const s = (performance.now() - z.t0) / 1000;
    setHTML('quizStat', '<span>' + T('答對 ', 'Correct ') + '<b>' + z.correct + '</b>／' + z.i + '</span><span>' + T('連對 ', 'Streak ') + '<b>' + state.streak + '</b></span><span>' + T('時間 ', 'Time ') + '<b>' + s.toFixed(1) + '</b> ' + T('秒', 's') + '</span>');
    setTimeout(tickQuiz, 200);
  }
  function renderRounds() {
    const tab = $('roundLog');
    if (!state.rounds.length) { tab.innerHTML = ''; $('logEmpty').hidden = false; return; }
    $('logEmpty').hidden = true;
    let html = '<tr><th>' + T('回合', 'Round') + '</th><th>' + T('字的種類', 'Kinds') + '</th><th>' + T('答對', 'Correct') + '</th><th>' + T('時間（秒）', 'Time (s)') + '</th></tr>';
    state.rounds.forEach(function (r, i) { html += '<tr><td>' + (i + 1) + '</td><td>' + r.k + '</td><td>' + r.correct + '／5</td><td>' + r.time.toFixed(1) + '</td></tr>'; });
    tab.innerHTML = html;
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  let lastSnd = 0;
  function throttled(ms) { const now = performance.now(); if (now - lastSnd < ms) return true; lastSnd = now; return false; }
  function sndToken(t, auto) {
    const S = sound(); if (!S || (auto && throttled(70))) return;
    if (t.zero) { S.tone({ freq: 300, dur: 0.04, type: 'triangle', gain: 0.08 }); return; }
    S.tone({ freq: t.c ? 440 : 660, dur: 0.04 + Math.min(0.16, t.n * 0.004), type: 'triangle', gain: 0.13 });
  }
  function sndPaint(c) { const S = sound(); if (!S || throttled(45)) return; S.tone({ freq: c ? 520 : 780, dur: 0.035, type: 'sine', gain: 0.1 }); }
  function sndPattern() { const S = sound(); if (S) S.sweep({ from: 420, to: 640, dur: 0.12, type: 'triangle', gain: 0.1 }); }
  function sndDone(good) {
    const S = sound(); if (!S) return;
    if (good) { S.tone({ freq: 659.25, dur: 0.12, gain: 0.18 }); S.tone({ freq: 987.77, dur: 0.2, gain: 0.16, delay: 0.09 }); }
    else S.sweep({ from: 700, to: 300, dur: 0.3, type: 'sawtooth', gain: 0.08 });
  }
  function sndMerge(i, n) { const S = sound(); if (!S) return; S.tone({ freq: 330 * Math.pow(2, 1.5 * i / Math.max(1, n)), dur: 0.12, type: 'sine', gain: 0.16 }); }
  function sndBit(b, leaf) {
    const S = sound(); if (!S || (state.dec.playing && throttled(40))) return;
    S.tone({ freq: b === '0' ? 520 : 700, dur: 0.03, type: 'square', gain: 0.05 });
    if (leaf) S.tone({ freq: 1046.5, dur: 0.09, type: 'sine', gain: 0.12, delay: 0.03 });
  }
  function sndDecodeEnd(ok) { sndDone(ok); }
  function sndChime(ok) {
    const S = sound(); if (!S) return;
    if (ok) { S.tone({ freq: 659.25, dur: 0.14, type: 'sine', gain: 0.25 }); S.tone({ freq: 987.77, dur: 0.22, type: 'sine', gain: 0.22, delay: 0.1 }); }
    else S.tone({ freq: 311.13, dur: 0.22, type: 'triangle', gain: 0.22 });
  }
  function updateSoundButton() {
    const on = !!(window.LabSettings && window.LabSettings.get('sound'));
    $('soundBtn').setAttribute('aria-pressed', String(on));
    $('soundLabel').textContent = on ? T('音效：開', 'Sound: on') : T('音效：關', 'Sound: off');
  }
  $('soundBtn').addEventListener('click', function () {
    if (window.LabSettings) window.LabSettings.set('sound', !window.LabSettings.get('sound'));
    updateSoundButton();
  });
  window.addEventListener('lab:settingschange', function (ev) { if (ev.detail && ev.detail.name === 'sound') updateSoundButton(); });

  // =====================================================================
  // 事件與訊息
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }
  function setMsg(text, cls) { const el = $('txtMsg'); el.textContent = text; el.className = 'msg' + (cls ? ' ' + cls : ''); }

  // =====================================================================
  // 控制項
  // =====================================================================
  function setMode(m) {
    if (m === state.mode) return;
    stopPlay();
    state.dec.playing = false; updateDecButton();
    state.mode = m;
    $('modeRle').setAttribute('aria-pressed', String(m === 'rle'));
    $('modeHuf').setAttribute('aria-pressed', String(m === 'huf'));
    document.querySelectorAll('.m-rle').forEach(function (el) { el.hidden = m !== 'rle'; });
    document.querySelectorAll('.m-huf').forEach(function (el) { el.hidden = m !== 'huf'; });
    cv.style.touchAction = m === 'rle' ? 'pan-y' : 'pan-y';
    cv.style.cursor = 'default';
    $('cv2').setAttribute('aria-label', m === 'rle'
      ? T('長度欄位 k 的每一種選擇的編碼後位元數長條圖，虛線是原始的 256 位元。', 'Bar chart of the encoded size for every choice of the length field k; the dashed line is the original 256 bits.')
      : T('H–L 圖：每段文字一個點，橫軸是熵 H，縱軸是平均碼長 L；所有點都落在 L = H 與 L = H + 1 兩條線之間。', 'H–L chart: one point per text, entropy H across and average code length L up; every point lies between the lines L = H and L = H + 1.'));
    updateCap();
    if (m === 'huf') say(T('霍夫曼編碼：常見的字給短碼、少見的字給長碼。按「下一步」看樹一步一步長出來。', 'Huffman coding: common characters get short codes, rare ones long codes. Press “Next step” to watch the tree grow step by step.'));
    else say(T('遊程編碼：把連續同色的格子記成「一段有多長」。', 'Run-length coding: store each stretch of same-coloured squares as its length.'));
    resize();
  }
  $('modeRle').addEventListener('click', function () { setMode('rle'); });
  $('modeHuf').addEventListener('click', function () { setMode('huf'); });
  $('stepBtn').addEventListener('click', onStep);
  $('playBtn').addEventListener('click', onPlay);
  $('restartBtn').addEventListener('click', onRestart);
  $('wipeBtn').addEventListener('click', function () {
    const h = state.huf;
    h.hist = h.tree ? [{ H: h.H, L: h.L }] : [];
    state.rounds = [];
    if (state.quiz) quizExit('');
    $('quizQ').textContent = T('按「出題」。', 'Press “New question”.');
    renderRounds();
    say(T('已清除 H–L 圖上的點與解碼挑戰紀錄；圖、文字與設定不變。', 'Cleared the points on the H–L chart and the decoding challenge log; the picture, the text and the settings stay.'));
    requestDraw();
  });
  const elSpeed = $('speed'), elK = $('kbits'), elFlip = $('flip');
  elSpeed.addEventListener('input', function () { state.speed = Math.max(1, Math.min(10, Math.round(val(elSpeed)))); $('speedo').textContent = String(state.speed); });
  elK.addEventListener('input', function () {
    const k = Math.max(K.K_MIN, Math.min(K.K_MAX, Math.round(val(elK))));
    if (k === state.rle.k) return;
    state.rle.k = k;
    rleChanged('k');
    say(T('長度欄位 ' + k + ' 位元：一段最長 ' + K.maxRun(k) + ' 格。', 'Length field of ' + k + ' bits: a run can be at most ' + K.maxRun(k) + ' squares long. ') + summaryText());
  });
  elFlip.addEventListener('input', function () {
    const f = Math.max(0, Math.round(val(elFlip)));
    state.dec.flip = f;
    decReset();
    updateDecButton();
    say(f ? T('傳輸時第 ' + f + ' 個位元被弄錯（0、1 對調）。解碼看看會怎樣。', 'Bit ' + f + ' is flipped in transmission (0 and 1 swapped). Decode and see what happens.') : T('傳輸沒有出錯。', 'No transmission error.'));
  });
  function segGroup(ids, values, key, apply) {
    ids.forEach(function (id, i) {
      $(id).addEventListener('click', function () {
        ids.forEach(function (j, jj) { $(j).setAttribute('aria-pressed', String(jj === i)); });
        apply(values[i]);
      });
    });
  }
  segGroup(['scanRow', 'scanCol', 'scanSnake'], ['row', 'col', 'snake'], 'scan', function (v) {
    if (state.rle.scan === v) return;
    state.rle.scan = v;
    rleChanged('scan');
    say(T('掃描順序改成「' + scanName(v) + '」：', 'Scan order: ' + scanName(v).toLowerCase() + '. ') + summaryText());
  });
  segGroup(['fmtPair', 'fmtAlt'], ['pair', 'alt'], 'fmt', function (v) {
    if (state.rle.fmt === v) return;
    state.rle.fmt = v;
    rleChanged('fmt');
    say((v === 'alt' ? T('只記長度：顏色由輪流推得，每段省 1 位元。', 'Length only: the colour follows from taking turns, saving 1 bit per run. ') : T('顏色＋長度：每段都寫明顏色。', 'Colour + length: every run states its colour. ')) + summaryText());
  });
  segGroup(['tieOld', 'tieNew'], ['old', 'new'], 'tie', function (v) {
    const h = state.huf;
    if (h.tie === v) return;
    h.tie = v;
    rebuild('tie');
    say(v === 'new'
      ? T('新的優先：權重一樣時，先取號碼大的（剛合併出來的）。最長碼 ' + h.tree.maxLen + ' 位元，平均碼長 ' + fmt(h.L, 3) + '。', 'Newer first: on a tie, the larger number (the newly merged node) is taken first. Longest code ' + h.tree.maxLen + ' bits, average length ' + fmt(h.L, 3) + '.')
      : T('舊的優先：權重一樣時，先取號碼小的。最長碼 ' + h.tree.maxLen + ' 位元，平均碼長 ' + fmt(h.L, 3) + '。', 'Older first: on a tie, the smaller number is taken first. Longest code ' + h.tree.maxLen + ' bits, average length ' + fmt(h.L, 3) + '.'));
  });
  ['patBlank', 'patHeart', 'patSmile', 'patHouse', 'patNoise'].forEach(function (id) {
    const name = { patBlank: 'blank', patHeart: 'heart', patSmile: 'smile', patHouse: 'house', patNoise: 'noise' }[id];
    $(id).addEventListener('click', function () { loadPattern(name); });
  });
  // 文字輸入：打字（中文輸入法組字完成後）停 0.5 秒就重建；Enter 或「建樹」立刻建
  const elTxt = $('txt');
  let typeTimer = 0, composing = false;
  elTxt.addEventListener('compositionstart', function () { composing = true; });
  elTxt.addEventListener('compositionend', function () { composing = false; scheduleTyped(); });
  elTxt.addEventListener('input', function (e) { if (composing || e.isComposing) return; scheduleTyped(); });
  function scheduleTyped() { clearTimeout(typeTimer); typeTimer = setTimeout(function () { if (elTxt.value !== state.huf.text) setText(elTxt.value, 'typed'); }, 500); }
  elTxt.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); clearTimeout(typeTimer); setText(elTxt.value, 'typed'); } });
  $('buildBtn').addEventListener('click', function () {
    clearTimeout(typeTimer);
    const h = state.huf;
    if (elTxt.value !== h.text) setText(elTxt.value, 'typed');
    else hufRestart();
  });
  ['ex1', 'ex2', 'ex3'].forEach(function (id) {
    $(id).addEventListener('click', function () {
      clearTimeout(typeTimer);
      elTxt.value = exampleText(id);
      setText(elTxt.value, 'example');
      if (state.mode !== 'huf') setMode('huf');
    });
  });
  $('decStep').addEventListener('click', decNext);
  $('decPlay').addEventListener('click', decPlay);
  $('decReset').addEventListener('click', function () { decReset(); say(T('從頭解碼：回到樹根、第 1 個位元。', 'Start over: back to the root and bit 1.')); });
  $('quizStart').addEventListener('click', quizStart);
  $('quizStop').addEventListener('click', function () { quizExit(T('挑戰結束。按「出題」再來一次。', 'Challenge stopped. Press “New question” to try again.')); });
  $('quizOk').addEventListener('click', quizCheck);
  $('quizIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); quizCheck(); } });

  // ---------- 畫布：畫圖（遊程模式）、點葉（霍夫曼模式） ----------
  function canvasXY(ev) { const rect = cv.getBoundingClientRect(); return { x: ev.clientX - rect.left, y: ev.clientY - rect.top }; }
  function hitCell(p) {
    if (!L || L.kind !== 'rle') return -1;
    const c = Math.floor((p.x - L.gx) / L.cell), r = Math.floor((p.y - L.gy) / L.cell);
    if (c < 0 || c >= N16 || r < 0 || r >= N16) return -1;
    return r * N16 + c;
  }
  function hitLeaf(p) {
    const h = state.huf, t = h.tree;
    if (!t || !L || L.kind !== 'huf') return -1;
    for (let i = 0; i < t.k; i++) { const q = h.pos[i]; if (q && Math.abs(p.x - q.x) <= Math.max(L.bw / 2, 10) && Math.abs(p.y - q.y) <= L.bh / 2 + 6) return i; }
    return -1;
  }
  function cellsOnLine(a, b) {
    const out = [];
    const ar = Math.floor(a / N16), ac = a % N16, br = Math.floor(b / N16), bc = b % N16;
    const n = Math.max(Math.abs(br - ar), Math.abs(bc - ac));
    for (let s = 1; s <= n; s++) { const r = Math.round(ar + (br - ar) * s / n), c = Math.round(ac + (bc - ac) * s / n); out.push(r * N16 + c); }
    return out;
  }
  function paintDone() {
    const r = state.rle;
    if (!r.drag) return;
    const changed = r.drag.changed;
    r.drag = null;
    if (changed) {
      rleChanged('paint');
      say(T('畫了 ' + changed + ' 格。', 'Painted ' + changed + ' square' + (changed > 1 ? 's' : '') + '. ') + summaryText());
    }
    requestDraw();
  }
  cv.addEventListener('pointerdown', function (ev) {
    const p = canvasXY(ev);
    if (state.mode === 'rle') {
      const i = hitCell(p);
      if (i < 0) return;
      const r = state.rle;
      stopPlay();
      const color = r.px[i] ? 0 : 1;
      r.drag = { color: color, last: i, changed: 0, id: ev.pointerId };
      r.cursor = i;
      if (setPixel(i, color)) { r.drag.changed++; sndPaint(color); }
      try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
      ev.preventDefault();
      rleLiveUpdate();
    } else {
      const i = hitLeaf(p);
      selectLeaf(i);
    }
  });
  cv.addEventListener('pointermove', function (ev) {
    const p = canvasXY(ev);
    if (state.mode === 'rle') {
      const r = state.rle, i = hitCell(p);
      if (r.drag && r.drag.id === ev.pointerId) {
        if (i >= 0 && i !== r.drag.last) {
          cellsOnLine(r.drag.last, i).forEach(function (j) { if (setPixel(j, r.drag.color)) { r.drag.changed++; sndPaint(r.drag.color); } });
          r.drag.last = i; r.cursor = i;
          rleLiveUpdate();
        }
        return;
      }
      const hv = ev.pointerType === 'mouse' ? i : -1;
      if (hv !== r.hover) { r.hover = hv; cv.style.cursor = hv >= 0 ? 'crosshair' : 'default'; requestDraw(); }
    } else {
      const i = ev.pointerType === 'mouse' ? hitLeaf(p) : -1;
      cv.style.cursor = i >= 0 ? 'pointer' : 'default';
    }
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) { cv.addEventListener(t, function () { if (state.mode === 'rle') paintDone(); }); });
  cv.addEventListener('pointerleave', function () { if (state.rle.hover !== -1) { state.rle.hover = -1; requestDraw(); } });
  // 手機：按在像素格上時不要捲動頁面
  cv.addEventListener('touchstart', function (ev) {
    if (state.mode !== 'rle' || !ev.touches.length) return;
    const t = ev.touches[0];
    if (hitCell(canvasXY(t)) >= 0) ev.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', function (ev) { if (state.mode === 'rle' && state.rle.drag) ev.preventDefault(); }, { passive: false });
  /** 畫圖中：只更新讀數與畫面（放開手指才送任務事件） */
  function rleLiveUpdate() {
    const r = state.rle;
    r.sum = K.rleSummary(r.px, N16, N16, r.scan, r.fmt, r.k);
    r.tokIdx = r.sum.tokens.length; r.pos = NPX; r.done = true;
    updateRleReadouts();
    requestDraw();
  }
  function selectLeaf(i) {
    const h = state.huf;
    h.sel = i;
    if (i >= 0 && h.tree) {
      const nd = h.tree.nodes[i];
      const code = h.tree.codes[nd.s];
      say(T('「' + showSym(nd.s) + '」出現 ' + nd.w + ' 次，碼是 ' + (code || '（空）') + '（' + code.length + ' 位元）。', '“' + showSym(nd.s) + '” appears ' + nd.w + ' time' + (nd.w > 1 ? 's' : '') + '; its code is ' + (code || '(empty)') + ' (' + code.length + ' bit' + (code.length === 1 ? '' : 's') + ').'));
    }
    updateHufReadouts();
    requestDraw();
  }
  // 鍵盤：Enter／空白鍵在遊程模式切換游標所在的格子（先處理，不交給 LabKeys）
  cv.addEventListener('keydown', function (e) {
    if (state.mode !== 'rle' || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const r = state.rle, i = r.cursor;
    stopPlay();
    const c = r.px[i] ? 0 : 1;
    setPixel(i, c);
    sndPaint(c);
    rleChanged('paint');
    window.LabKeys.say(cellDesc());
  });
  function cellDesc() {
    const r = state.rle, i = r.cursor;
    return T('第 ' + (Math.floor(i / N16) + 1) + ' 列第 ' + (i % N16 + 1) + ' 行：' + (r.px[i] ? '黑' : '白') + '。', 'Row ' + (Math.floor(i / N16) + 1) + ', column ' + (i % N16 + 1) + ': ' + (r.px[i] ? 'black' : 'white') + '.');
  }
  const kb = window.LabKeys ? window.LabKeys.attach(cv, {
    label: T('壓縮畫布。遊程編碼：用方向鍵移動游標，Enter 或空白鍵切換這一格的黑白。霍夫曼編碼：用左右方向鍵選一個字，聽它的碼。',
      'Compression canvas. Run-length: move the cursor with the arrow keys; Enter or Space switches the square between black and white. Huffman: use the left and right arrow keys to pick a character and hear its code.'),
    items: [{
      name: function () { return state.mode === 'rle' ? T('畫筆游標', 'Paint cursor') : T('霍夫曼樹的葉', 'Leaves of the Huffman tree'); },
      move: function (dx, dy, big) {
        const step = big ? 4 : 1;
        if (state.mode === 'rle') {
          const r = state.rle;
          let row = Math.floor(r.cursor / N16), col = r.cursor % N16;
          col = Math.max(0, Math.min(N16 - 1, col + dx * step));
          row = Math.max(0, Math.min(N16 - 1, row - dy * step));
          r.cursor = row * N16 + col;
          requestDraw();
          return true;
        }
        const h = state.huf, t = h.tree;
        if (!t) return false;
        const leaves = [];
        (function walk(id) { const nd = t.nodes[id]; if (nd.leaf) { leaves.push(id); return; } walk(nd.l); walk(nd.r); })(t.root);
        let k = leaves.indexOf(h.sel);
        k = k < 0 ? 0 : Math.max(0, Math.min(leaves.length - 1, k + (dx || -dy)));
        selectLeaf(leaves[k]);
        return true;
      },
      describe: function () {
        if (state.mode === 'rle') return cellDesc();
        const h = state.huf;
        if (!h.tree || h.sel < 0) return T('還沒選字。', 'No character selected.');
        const nd = h.tree.nodes[h.sel];
        return T('「' + showSym(nd.s) + '」' + nd.w + ' 次，碼 ' + (h.tree.codes[nd.s] || '（空）'), '“' + showSym(nd.s) + '” ' + nd.w + ' times, code ' + (h.tree.codes[nd.s] || '(empty)'));
      }
    }],
    onChange: requestDraw
  }) : null;
  cv.addEventListener('focus', function () { state.rle.kbFocus = state.mode === 'rle'; requestDraw(); });
  cv.addEventListener('blur', function () { state.rle.kbFocus = false; requestDraw(); });
  void kb;

  // ---------- 測試用介面（Playwright 腳本使用；不影響一般操作） ----------
  window.CompressLab = {
    state: state,
    mode: setMode,
    pattern: loadPattern,
    /** 親手畫：cells 是格子索引陣列，每一格切換成 color（預設黑），等同一次拖曳 */
    paint: function (cells, color) {
      const r = state.rle; let n = 0;
      cells.forEach(function (i) { if (setPixel(i, color == null ? 1 : color)) n++; });
      if (n) rleChanged('paint');
      return n;
    },
    scan: function (s) { $({ row: 'scanRow', col: 'scanCol', snake: 'scanSnake' }[s]).click(); },
    format: function (f) { $(f === 'alt' ? 'fmtAlt' : 'fmtPair').click(); },
    k: function (k) { if (window.LabNum) window.LabNum.set(elK, k); else elK.value = k; elK.dispatchEvent(new Event('input')); },
    /** 模擬學生打字 */
    type: function (s) { elTxt.value = s; setText(s, 'typed'); },
    tie: function (t) { $(t === 'new' ? 'tieNew' : 'tieOld').click(); },
    flip: function (n) { if (window.LabNum) window.LabNum.set(elFlip, n); else elFlip.value = n; elFlip.dispatchEvent(new Event('input')); },
    seed: function (s) { qrand = K.rng(s); }
  };

  // =====================================================================
  // 啟動
  // =====================================================================
  function themeChanged() {
    readColors();
    for (const id in lastHTML) delete lastHTML[id];
    $('rleEq')._tex = ''; $('hufEq')._tex = '';
    updateRleReadouts();
    updateHufReadouts();
    renderDecOut();
    renderRounds();
    updateSoundButton();
    updatePlayButton();
    updateDecButton();
    requestDraw();
  }
  readColors();
  state.speed = Math.max(1, Math.min(10, Math.round(val(elSpeed))));
  $('speedo').textContent = String(state.speed);
  state.rle.k = Math.max(K.K_MIN, Math.min(K.K_MAX, Math.round(val(elK))));
  rleRecompute();
  updateRleReadouts();
  // 預設文字：英文模式用英文句子，中文模式用繞口令
  elTxt.value = exampleText('ex2');
  setText(elTxt.value, 'init');
  setMsg(T('預設的例子。改成你自己的文字試試。', 'A built-in example. Try your own text.'), '');
  renderRounds();
  updateSoundButton();
  updatePlayButton();
  updateDecButton();
  updateCap();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { stopPlay(); state.dec.playing = false; updateDecButton(); } });
  say(T('遊程編碼：把連續同色的格子記成「一段有多長」。按「播放」看掃描，或在格子上自己畫。', 'Run-length coding: store each stretch of same-coloured squares as its length. Press “Play” to watch the scan, or paint on the grid.'));
  resize();
})();
