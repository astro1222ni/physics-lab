/* text-encoding.js — 「文字編碼：ASCII、Big5 與 UTF-8」的畫面與互動（計算在 text-encoding-core.js；共用繪圖工具 LabDraw 在 drawkit.js）
 *
 * 兩張畫布：
 *   #cv 選取的字的解剖圖：字與碼位、UTF-8（碼位的位元往下落進前綴後面的空格）、UTF-16（代理對）、Big5。點 UTF-8 的位元可以翻轉。
 *   #cv2 位元組長條：三種編碼的長度尺；存檔後的每一個位元組，上方括號是原來的字，下方括號是開檔編碼切出來的字。
 * 被編碼的文字是「資料」不是介面文字：DOM 裡放在 data-no-convert 的元素（簡體模式不轉），含中文時加 lang="zh-Hant"；
 *   畫布上用 raw() 包起來（簡體模式不轉）。
 * 任務事件只在使用者操作之後送出（見 js/missions/text-encoding.js 開頭的說明）。 */
(function () {
  'use strict';
  const K = window.TextEncCore;
  const D = window.LabDraw;
  const FONT = D.FONT;
  const MONO = 'ui-monospace, "Cascadia Mono", Consolas, "Courier New", monospace';
  const $ = function (id) { return document.getElementById(id); };
  const T = function (zh, en) { return window.LabSettings ? window.LabSettings.t(zh, en) : zh; };
  const LANG = window.LabSettings ? window.LabSettings.lang : 'zh-Hant';
  const EN = LANG === 'en', HANS = LANG === 'zh-Hans';
  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const alpha = D.alpha, shade = D.shade;
  /** 被編碼的字：簡體模式下不可以被畫布自動轉成簡體（String 物件會略過轉換） */
  function raw(s) { return HANS ? new String(s) : s; } // eslint-disable-line no-new-wrappers
  const HAN = /[⺀-鿿豈-﫿︰-﹏＀-￯]|[\uD840-\uD87F][\uDC00-\uDFFF]/;
  const ENC_NAME = { utf8: 'UTF-8', big5: 'Big5', latin1: 'Latin-1', utf16: 'UTF-16' };

  let b5ok = true;
  try { K.buildBig5(); } catch (e) { b5ok = false; }

  // ---------- 範例 ----------
  const EXAMPLES = {
    exHello: 'Hello, world!',
    exZh: '中文資料',
    exEmoji: '👍😀🎉',
    exMix: 'A é 中 😀',
    exAcc: 'café naïve',
    exRare: '𠃌字'
  };
  const DEFAULT_TEXT = EN ? 'Hi café 😀' : 'Hi 資訊 😀';

  // ---------- 狀態 ----------
  const state = {
    text: DEFAULT_TEXT, origin: 'init', sel: 0,
    write: 'utf8', read: 'utf8',
    raw: null, rawPrev: null,
    chain: null,
    quiz: null, rounds: [], streak: 0,
    bitFocus: -1, kbA: false, kbB: false,
    glow: 0, flipAt: -1, flipCell: null
  };
  let qrand = K.rng(((Date.now() % 2147483647) ^ Math.floor(Math.random() * 1e9)) >>> 0);
  let its = [], sz = null, mix = null;

  // ---------- 色彩 ----------
  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ['canvas-bg', 'text', 'muted', 'border', 'accent', 'accent-soft', 'surface',
      'te-b1', 'te-b2', 'te-b3', 'te-b4', 'te-pre', 'te-err', 'te-ok', 'te-panel', 'te-sur', 'te-tile']
      .forEach(function (k) { C[k] = cs.getPropertyValue('--' + k).trim() || '#888888'; });
  }
  function fnt(px, weight, family) { return (weight ? weight + ' ' : '') + px + 'px ' + (family || FONT); }
  /** 放不下時把字縮小到剛好放得下（最小 8 px） */
  function fitFnt(c, text, px, weight, family, maxW) {
    c.font = fnt(px, weight, family);
    const m = c.measureText(text).width;
    return m <= maxW ? c.font : fnt(Math.max(8, Math.floor(px * maxW / m * 10) / 10), weight, family);
  }
  function lenColor(n) { return C['te-b' + Math.max(1, Math.min(4, n))]; }

  // ---------- 字的顯示名稱 ----------
  const CTRL = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI',
    'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];
  /** 畫在畫布上的樣子：{ s, small }（small = true 表示是縮寫，不是字形） */
  function glyph(it) {
    const cp = it.cp;
    if (it.lone) return { s: K.hex(cp, 4), small: true };
    if (cp < 0x20) return { s: CTRL[cp], small: true };
    if (cp === 0x20) return { s: '␣', small: false };
    if (cp === 0x7F) return { s: 'DEL', small: true };
    if (cp >= 0x80 && cp <= 0x9F) return { s: K.hex(cp, 2), small: true };
    if (cp === 0xA0) return { s: 'NBSP', small: true };
    if (cp === 0xFEFF) return { s: 'BOM', small: true };
    if (cp === 0x200D) return { s: 'ZWJ', small: true };
    if (cp === 0x200B) return { s: 'ZWSP', small: true };
    if ((cp >= 0x300 && cp <= 0x36F) || (cp >= 0xFE00 && cp <= 0xFE0F)) return { s: '◌' + it.s, small: false };
    return { s: it.s, small: false };
  }
  /** DOM 裡的顯示（控制字元、BOM、U+FFFD 等標出來） */
  function domText(el, str, errs) {
    // 先組在一個還沒放進頁面的 span 裡再整個換上：簡體模式的轉換只會看到「新加了一個 span」，
    // 它在 data-no-convert 裡面所以被略過（直接加文字節點的話，文字節點本身會被轉成簡體）
    const box = document.createElement('span');
    const list = K.items(str);
    list.forEach(function (it, i) {
      const g = glyph(it);
      if (it.cp === 0xFFFD && (!errs || errs[i])) { const b = document.createElement('span'); b.className = 'e'; b.textContent = '�'; box.appendChild(b); return; }
      if (g.small) { const b = document.createElement('span'); b.className = 'cc'; b.textContent = g.s; box.appendChild(b); return; }
      box.appendChild(document.createTextNode(it.cp === 0x20 ? ' ' : it.s));
    });
    if (HAN.test(str)) el.setAttribute('lang', 'zh-Hant'); else el.removeAttribute('lang');
    el.textContent = '';
    el.appendChild(box);
  }

  // =====================================================================
  // 計算
  // =====================================================================
  function recompute() {
    its = K.items(state.text);
    if (state.sel >= its.length) state.sel = Math.max(0, its.length - 1);
    sz = K.sizes(state.text);
    const enc = state.raw ? null : K.encode(state.text, state.write);
    const bytes = state.raw ? state.raw : enc.bytes;
    const dec = K.decode(bytes, state.read);
    mix = { enc: enc, bytes: bytes, dec: dec };
  }
  function b5Of(it) { return it.lone ? null : K.big5Bytes(it.cp); }
  function lensCount() {
    const c = [0, 0, 0, 0];
    its.forEach(function (it) { c[(it.lone ? 3 : K.utf8Len(it.cp)) - 1]++; });
    return c;
  }
  function b5cCount() {
    const seen = {};
    let n = 0;
    its.forEach(function (it) { const b = b5Of(it); if (b && b.length === 2 && b[1] === 0x5C && !seen[it.cp]) { seen[it.cp] = 1; n++; } });
    return n;
  }
  function nonAscii(list) { return list.filter(function (it) { return it.cp >= 0x80; }).length; }

  // =====================================================================
  // 版面：解剖圖（#cv）
  // =====================================================================
  const cv = $('cv'), ctx = cv.getContext('2d');
  const cv2 = $('cv2'), ctx2 = cv2.getContext('2d');
  const stage = $('stage');
  let dpr = 1, cw = 320, ch = 380, cw2 = 320, ch2 = 260, A = null, B = null;

  function cur() { return its[state.sel] || null; }
  function layoutA() {
    const W = cw, narrow = W < 560;
    const pad = narrow ? 10 : 18, gap = narrow ? 6 : 10;
    const avail = W - 2 * pad;
    let perRow = 4, cell = Math.min(22, (avail - 3 * gap) / 32);
    if (cell < 12.5) { perRow = 2; cell = Math.min(22, (avail - gap) / 16); }
    cell = Math.floor(cell * 2) / 2;
    const cellH = Math.max(20, Math.min(26, Math.round(cell * 1.15)));
    const rowW = perRow * 8 * cell + (perRow - 1) * gap;
    const x0 = Math.round((W - rowW) / 2);
    const G = narrow ? 60 : 74;
    const it = cur();
    const o = { narrow: narrow, pad: pad, gap: gap, perRow: perRow, cell: cell, cellH: cellH, x0: x0, rowW: rowW, G: G, cells: [], it: it };
    let y = pad;
    o.head = { x: pad, y: y };
    y += G + 18;
    if (!it) { o.H = y + 30; return o; }
    // UTF-8
    const n8 = it.lone ? 3 : K.utf8Len(it.cp);
    o.u8 = { title: y, rows: [] };
    y += 22;
    const rows8 = Math.ceil(n8 / perRow);
    for (let r = 0; r < rows8; r++) {
      o.u8.rows.push({ cpY: y, byteY: y + cellH + 16, hexY: y + 2 * cellH + 16 + 14 });
      y += 2 * cellH + 16 + 24;
    }
    y += 8;
    // UTF-16
    const nu = it.units.length === 2 ? 2 : (it.cp >= 0x10000 ? 2 : 1);
    o.u16 = { title: y, rows: [] };
    y += 22 + (nu === 2 ? 18 : 0);
    const unitsPerRow = Math.max(1, perRow / 2);
    for (let r = 0; r < Math.ceil(nu / unitsPerRow); r++) { o.u16.rows.push({ y: y, hexY: y + cellH + 14 }); y += cellH + 24; }
    y += 8;
    // Big5
    o.b5 = { title: y, y: y + 22, hexY: y + 22 + cellH + 14 };
    y += 22 + cellH + 26;
    o.H = Math.round(y + 4);
    return o;
  }
  /** 第 k 個位元組（或 UTF-16 的第 k 個半碼元）槽位的左上角 x 與列號 */
  function slotX(k) { const c = k % A.perRow; return A.x0 + c * (8 * A.cell + A.gap); }
  function slotRow(k) { return Math.floor(k / A.perRow); }

  // =====================================================================
  // 版面：位元組長條（#cv2）
  // =====================================================================
  function layoutB() {
    const W = cw2, narrow = W < 560, pad = narrow ? 8 : 16;
    const o = { narrow: narrow, pad: pad };
    let y = 10;
    // 長度尺
    o.bars = { y: y, lab: narrow ? 50 : 58, right: narrow ? 44 : 54, h: 14, gap: 8 };
    y += 3 * (o.bars.h + o.bars.gap) + 8;
    o.headY = y + 14;
    y += 26;
    const u = narrow ? 28 : 34;
    const per = Math.max(4, Math.floor((W - 2 * pad) / u));
    o.u = u; o.per = per; o.bx = Math.round((W - per * u) / 2);
    o.top = 24; o.bh = 28; o.bot = 30; o.rowH = o.top + o.bh + o.bot + 10;
    o.y0 = y;
    const nb = mix ? mix.bytes.length : 0;
    // 換列時盡量不把一個字的位元組拆開：只在「存檔的字」與「開檔切出的段」兩邊都是分界的地方換列
    const cut = new Array(nb + 1).fill(0);
    if (mix) {
      if (mix.enc) mix.enc.chars.forEach(function (c) { cut[c.start]++; }); else cut.fill(1);
      mix.dec.segs.forEach(function (g) { cut[g.start]++; });
    }
    const need = 2;
    o.pos = []; let r = 0, col = 0;
    for (let i = 0; i < nb; i++) {
      if (cut[i] >= need && col > 0) {
        let j = i + 1; while (j < nb && cut[j] < need) j++;
        const len = j - i;
        if (len <= per && col + len > per) { r++; col = 0; }
      }
      if (col >= per) { r++; col = 0; }
      o.pos.push({ r: r, c: col });
      col++;
    }
    o.rows = Math.max(1, r + 1);
    o.H = Math.round(y + o.rows * o.rowH + 6);
    return o;
  }
  function bytePos(i) { const q = B.pos[i] || { r: Math.floor(i / B.per), c: i % B.per }; return { x: B.bx + q.c * B.u, y: B.y0 + q.r * B.rowH + B.top, r: q.r, c: q.c }; }

  function resize() {
    const w = cv.clientWidth;
    if (!w) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cw = w;
    A = layoutA();
    ch = A.H;
    if (cv.style.height !== ch + 'px') cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cw2 = cv2.clientWidth || cw;
    B = layoutB();
    ch2 = B.H;
    if (cv2.style.height !== ch2 + 'px') cv2.style.height = ch2 + 'px';
    cv2.width = Math.round(cw2 * dpr); cv2.height = Math.round(ch2 * dpr);
    requestDraw();
  }
  function relayout() {
    if (!cv.clientWidth) return;
    const a = layoutA(), b = layoutB();
    if (a.H !== ch || b.H !== ch2) { resize(); return; }
    A = a; B = b;
    requestDraw();
  }

  // =====================================================================
  // 繪圖
  // =====================================================================
  let drawQueued = false;
  function requestDraw() { if (!drawQueued) { drawQueued = true; requestAnimationFrame(frame); } }
  function frame(t) {
    drawQueued = false;
    const busy = draw(t);
    drawB(t);
    if (busy) requestDraw();
  }
  /** 一格位元（不加陰影，數量多） */
  function bitCell(c, x, y, w, h, color, bit, kind, font) {
    const r = Math.min(4, w * 0.25);
    const top = kind === 'pre' ? shade(color, D.dark ? 0.0 : 0.35) : shade(color, bit ? (D.dark ? 0.05 : 0.0) : (D.dark ? -0.5 : 0.72));
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, shade(top, 0.14));
    g.addColorStop(1, shade(top, -0.12));
    D.roundRect(c, x + 0.75, y, w - 1.5, h, r);
    c.fillStyle = g; c.fill();
    c.strokeStyle = alpha(shade(color, -0.4), kind === 'pre' ? 0.45 : 0.55); c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,' + (D.dark ? 0.12 : 0.45) + ')';
    c.fillRect(x + 2, y + 1.5, w - 4, 1);
    c.font = font || fnt(Math.min(13, w * 0.7), 700, MONO);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const onDark = kind === 'pre' ? D.dark : bit ? true : D.dark;
    c.fillStyle = kind === 'pre' ? (D.dark ? '#f1f5f9' : '#1e293b') : (onDark ? '#ffffff' : shade(color, -0.55));
    c.fillText(bit ? '1' : '0', x + w / 2, y + h / 2 + 0.5);
  }
  /** 空的槽位（碼位那一列的前綴位置） */
  function emptyCell(c, x, y, w, h) {
    D.roundRect(c, x + 1.5, y + 1.5, w - 3, h - 3, 3);
    c.setLineDash([2, 3]);
    c.strokeStyle = alpha(C.muted, 0.35); c.lineWidth = 1; c.stroke();
    c.setLineDash([]);
  }
  function title(c, text, x, y, color) { D.haloText(c, text, x, y, color || C.muted, 'left', 'alphabetic', fitFnt(c, text, 12.5, 600, null, cw - x - 6)); }

  function draw(t) {
    if (!A) return false;
    const w = cw, h = ch, c = ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const it = A.it;
    let busy = false;
    A.cells = [];
    // ---------- 字的磚塊 ----------
    const G = A.G, hx = A.head.x, hy = A.head.y;
    if (!it) {
      D.haloText(c, T('先打幾個字。', 'Type some text first.'), w / 2, hy + G / 2, C.muted, 'center', 'middle', fnt(15, 600));
      return false;
    }
    const n8 = it.lone ? 3 : K.utf8Len(it.cp);
    const col = it.lone ? C['te-err'] : lenColor(n8);
    D.block(c, hx, hy, G, G, C['te-tile'], { r: 10, stroke: alpha(col, 0.8) });
    c.save(); D.roundRect(c, hx, hy, G, G, 10); c.clip();
    c.fillStyle = alpha(col, D.dark ? 0.22 : 0.12); c.fillRect(hx, hy + G - 7, G, 7);
    c.fillStyle = col; c.fillRect(hx, hy + G - 4, G, 4);
    c.restore();
    const g = glyph(it);
    c.font = g.small ? fnt(G * 0.26, 700, MONO) : fnt(G * 0.52, 500);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = C.text;
    c.fillText(raw(g.s), hx + G / 2, hy + G / 2 - 2);
    // 右邊的說明
    const tx = hx + G + 14;
    const big = it.lone ? K.uplus(it.cp) + T('（孤立代理）', ' (lone surrogate)') : K.uplus(it.cp);
    D.haloText(c, big, tx, hy + 22, C.text, 'left', 'alphabetic', fnt(A.narrow ? 19 : 23, 700, MONO));
    D.haloText(c, T('第 ' + (state.sel + 1) + '／' + its.length + ' 個字', 'character ' + (state.sel + 1) + ' of ' + its.length), tx, hy + 42, C.muted, 'left', 'alphabetic', fnt(12.5, 500));
    const pb = K.payloadBits(n8), cpv = it.lone ? 0xFFFD : it.cp;
    let binS = K.bin(cpv, Math.max(pb, 4 * Math.ceil(Math.log2(cpv + 1) / 4)));
    binS = binS.replace(/\B(?=(\d{4})+(?!\d))/g, ' ');
    if (!A.narrow || binS.length <= 26) { const bt = '= ' + binS + T('（二進位）', ' (binary)'); D.haloText(c, bt, tx, hy + 60, alpha(C.muted, 0.95), 'left', 'alphabetic', fitFnt(c, bt, 12, 500, MONO, w - tx - 6)); }
    else D.haloText(c, '= ' + binS, tx, hy + 60, alpha(C.muted, 0.95), 'left', 'alphabetic', fnt(11, 500, MONO));

    // ---------- UTF-8 ----------
    const bytes8 = K.utf8Bytes(it.lone ? 0xFFFD : it.cp);
    title(c, it.lone ? T('UTF-8：孤立代理不能編碼，改寫成 U+FFFD', 'UTF-8: a lone surrogate cannot be encoded; U+FFFD is written instead') : T('UTF-8：碼位的 ' + pb + ' 個位元依序落進前綴後面的空格', 'UTF-8: the ' + pb + ' bits of the code point drop into the gaps after the prefixes'), A.pad, A.u8.title + 12, it.lone ? C['te-err'] : C.muted);
    // 碼位的位元由左而右分配：第 k 個位元組拿 8 − 前綴 個位元
    let bitPtr = pb - 1;
    const cs = A.cell, chh = A.cellH;
    for (let k = 0; k < n8; k++) {
      const row = A.u8.rows[slotRow(k)], x = slotX(k);
      const pre = K.utf8Prefix(n8, k);
      const gcol = n8 === 1 ? col : D.mix(col, k % 2 ? C.text : C['canvas-bg'], k % 2 ? 0.12 : 0.0);
      for (let j = 0; j < 8; j++) {
        const cx = x + j * cs;
        const bitIdx = 7 - j;
        const bit = (bytes8[k] >> bitIdx) & 1;
        if (j < pre) {
          emptyCell(c, cx, row.cpY, cs, chh);
          bitCell(c, cx, row.byteY, cs, chh, C['te-pre'], bit, 'pre');
        } else {
          const cbit = (cpv >> bitPtr) & 1;
          bitCell(c, cx, row.cpY, cs, chh, gcol, cbit, 'cp');
          bitPtr--;
          bitCell(c, cx, row.byteY, cs, chh, gcol, bit, 'data');
        }
        A.cells.push({ x: cx, y: row.byteY, w: cs, h: chh, k: k, bit: bitIdx });
      }
      // 落下的小箭頭（資料位元那一段的中間）
      const mx = x + (pre + (8 - pre) / 2) * cs;
      c.strokeStyle = alpha(gcol, 0.7); c.lineWidth = 1.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(mx, row.cpY + chh + 3); c.lineTo(mx, row.byteY - 4); c.stroke();
      c.beginPath(); c.moveTo(mx - 3.5, row.byteY - 7.5); c.lineTo(mx, row.byteY - 3.5); c.lineTo(mx + 3.5, row.byteY - 7.5); c.stroke();
      // 前綴的說明與十六進位
      const preLab = n8 === 1 ? '0' : k === 0 ? '1'.repeat(n8) + '0' : '10';
      if (pre * cs >= 18 || k === 0) D.haloText(c, preLab, x + pre * cs / 2, row.cpY + chh / 2 + 4, alpha(C['te-pre'], 0.95), 'center', 'alphabetic', fnt(10, 600, MONO));
      D.pill(c, K.hex(bytes8[k]), x + 4 * cs, row.hexY + 6, gcol, 'center', fnt(13, 700, MONO));
    }
    // 翻轉位元的閃光、鍵盤焦點
    if (state.flipCell && t - state.flipAt < 600 && !reducedMotion) {
      const u = (t - state.flipAt) / 600, f = A.cells[state.flipCell.k * 8 + (7 - state.flipCell.bit)];
      if (f) { D.ripple(c, f.x + f.w / 2, f.y + f.h / 2, f.w * 0.6, u, C.accent); busy = true; }
    }
    if (state.kbA && state.bitFocus >= 0 && A.cells[state.bitFocus]) {
      const f = A.cells[state.bitFocus];
      c.save(); c.setLineDash([3, 2]); D.roundRect(c, f.x - 1, f.y - 2, f.w + 2, f.h + 4, 4);
      c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke(); c.restore();
    }

    // ---------- UTF-16 ----------
    const units = it.lone ? [it.cp] : K.utf16Units(it.cp);
    title(c, units.length === 2 ? T('UTF-16：超過 U+FFFF，拆成一對代理（每個 16 位元）', 'UTF-16: beyond U+FFFF, split into a surrogate pair (16 bits each)')
      : it.lone ? T('UTF-16：只有半個代理，另一半不見了', 'UTF-16: only half of a surrogate pair; the other half is missing')
        : T('UTF-16：一個 16 位元的碼元', 'UTF-16: one 16-bit code unit'), A.pad, A.u16.title + 12);
    if (units.length === 2) {
      const cp2 = it.cp - 0x10000;
      const ft = K.uplus(it.cp) + ' − 10000 = ' + K.hex(cp2, 5) + T('：前 10 位、後 10 位', ': first 10 bits, last 10 bits');
      D.haloText(c, ft, A.pad, A.u16.title + 30, alpha(C.muted, 0.95), 'left', 'alphabetic', fitFnt(c, ft, 11.5, 500, MONO, w - A.pad - 6));
    }
    const upr = Math.max(1, A.perRow / 2);
    units.forEach(function (u, k) {
      const row = A.u16.rows[Math.floor(k / upr)], x = A.x0 + (k % upr) * (16 * cs + 2 * A.gap);
      const sur = units.length === 2;
      const ucol = it.lone ? C['te-err'] : sur ? C['te-sur'] : col;
      for (let j = 0; j < 16; j++) {
        const bit = (u >> (15 - j)) & 1;
        const isPre = sur && j < 6;
        bitCell(c, x + j * cs + (j >= 8 ? A.gap * 0 : 0), row.y, cs, chh, isPre ? C['te-pre'] : ucol, bit, isPre ? 'pre' : 'data');
      }
      D.pill(c, K.hex(u, 4) + (sur ? (k === 0 ? T('（高）', ' (high)') : T('（低）', ' (low)')) : ''), x + 8 * cs, row.hexY + 6, ucol, 'center', fnt(12.5, 700, MONO));
    });

    // ---------- Big5 ----------
    const b5 = b5Of(it);
    title(c, b5 ? (b5.length === 1 ? T('Big5：ASCII 的字照舊一個位元組', 'Big5: ASCII characters stay one byte') : T('Big5：查表得到兩個位元組（沒有前綴規則）', 'Big5: two bytes from the table (no prefix rule)'))
      : T('Big5：沒有這個字', 'Big5: this character does not exist in Big5'), A.pad, A.b5.title + 12, b5 ? C.muted : C['te-err']);
    if (b5) {
      b5.forEach(function (b, k) {
        const x = A.x0 + k * (8 * cs + A.gap);
        const bc = b5.length === 1 ? C['te-b1'] : C['te-b2'];
        for (let j = 0; j < 8; j++) bitCell(c, x + j * cs, A.b5.y, cs, chh, bc, (b >> (7 - j)) & 1, 'data');
        D.pill(c, K.hex(b) + (b === 0x5C ? '  = \\' : ''), x + 4 * cs, A.b5.hexY + 6, b === 0x5C ? C['te-err'] : bc, 'center', fnt(12.5, 700, MONO));
      });
    } else {
      const x = A.x0, ww = Math.min(A.rowW, 16 * cs + A.gap);
      D.roundRect(c, x + 1, A.b5.y, ww - 2, chh, 6);
      c.setLineDash([5, 4]); c.strokeStyle = alpha(C['te-err'], 0.7); c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
      D.haloText(c, T('存成 Big5 會變成「?」（3F）', 'Saved as Big5 it becomes “?” (3F)'), x + ww / 2, A.b5.y + chh / 2 + 4, C['te-err'], 'center', 'alphabetic', fnt(12, 600));
    }
    return busy;
  }

  // ---------- 位元組長條 ----------
  function drawB(t) {
    if (!B || !mix) return;
    const w = cw2, h = ch2, c = ctx2;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    D.backdrop(c, w, h);
    const pad = B.pad;
    // ---------- 三條長度尺 ----------
    const bars = B.bars;
    const list = [
      { name: 'UTF-8', len: function (it) { return it.lone ? 3 : K.utf8Len(it.cp); }, total: sz.u8 },
      { name: 'UTF-16', len: function (it) { return it.units.length * 2; }, total: sz.u16 },
      { name: 'Big5', len: function (it) { const b = b5Of(it); return b ? b.length : 1; }, bad: function (it) { return !b5Of(it); }, total: sz.b5 === null ? null : sz.b5 }
    ];
    const totals = list.map(function (L) { let s = 0; its.forEach(function (it) { s += L.len(it); }); return s; });
    const maxT = Math.max(1, Math.max.apply(null, totals));
    c.font = fnt(12, 700, MONO);
    const bx0 = pad + Math.max(bars.lab, c.measureText('UTF-16').width + 8), bw = w - pad - bars.right - bx0;
    list.forEach(function (L, li) {
      const y = bars.y + li * (bars.h + bars.gap);
      D.haloText(c, L.name, pad, y + bars.h - 2, C.text, 'left', 'alphabetic', fnt(12, 700, MONO));
      let x = bx0;
      const sc = bw / maxT;
      its.forEach(function (it, i) {
        const n = L.len(it), ww = n * sc, bad = L.bad && L.bad(it);
        const base = bad || it.lone ? C['te-err'] : lenColor(it.lone ? 3 : K.utf8Len(it.cp));
        const colr = i % 2 ? shade(base, D.dark ? -0.18 : 0.18) : base;
        const gg = c.createLinearGradient(0, y, 0, y + bars.h);
        gg.addColorStop(0, shade(colr, 0.2)); gg.addColorStop(1, shade(colr, -0.12));
        c.fillStyle = gg;
        D.roundRect(c, x + 0.5, y, Math.max(1, ww - 1), bars.h, Math.min(4, ww / 3)); c.fill();
        if (bad) { c.strokeStyle = alpha('#ffffff', 0.8); c.lineWidth = 1; c.beginPath(); c.moveTo(x + 2, y + 2); c.lineTo(x + ww - 2, y + bars.h - 2); c.stroke(); }
        if (i === state.sel) { D.roundRect(c, x - 0.5, y - 2, ww + 1, bars.h + 4, 4); c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke(); }
        x += ww;
      });
      const lab = L.total === null ? totals[li] + ' B*' : totals[li] + ' B';
      D.haloText(c, lab, w - pad, y + bars.h - 2, L.total === null ? C['te-err'] : C.text, 'right', 'alphabetic', fnt(12, 600, MONO));
    });

    // ---------- 存檔與開檔 ----------
    const dec = mix.dec, enc = mix.enc, bytes = mix.bytes;
    const head = state.raw
      ? T('自己打的 ' + bytes.length + ' 個位元組　→　用 ' + ENC_NAME[state.read] + ' 打開：' + dec.segs.length + ' 個字、' + dec.errors + ' 個錯誤', bytes.length + ' bytes typed by you  →  opened as ' + ENC_NAME[state.read] + ': ' + dec.segs.length + ' characters, ' + dec.errors + ' errors')
      : T('存成 ' + ENC_NAME[state.write] + '：' + bytes.length + ' 個位元組　→　用 ' + ENC_NAME[state.read] + ' 打開：' + dec.segs.length + ' 個字、' + dec.errors + ' 個錯誤', 'Saved as ' + ENC_NAME[state.write] + ': ' + bytes.length + ' bytes  →  opened as ' + ENC_NAME[state.read] + ': ' + dec.segs.length + ' characters, ' + dec.errors + ' errors');
    D.haloText(c, head, pad, B.headY, dec.errors ? C['te-err'] : C.text, 'left', 'alphabetic', fitFnt(c, head, B.narrow ? 12 : 13, 600, null, w - pad * 2));
    if (!bytes.length) {
      D.haloText(c, T('沒有位元組。', 'No bytes.'), w / 2, B.y0 + 40, C.muted, 'center', 'middle', fnt(13, 500));
      return;
    }
    // 位元組 → 來源字、解碼段
    const srcOf = new Array(bytes.length).fill(-1);
    if (enc) enc.chars.forEach(function (ch, i) { for (let k = 0; k < ch.len; k++) srcOf[ch.start + k] = i; });
    const segOf = new Array(bytes.length).fill(-1);
    dec.segs.forEach(function (g, i) { for (let k = 0; k < g.len; k++) segOf[g.start + k] = i; });
    // 磚塊
    const u = B.u, bh = B.bh;
    for (let i = 0; i < bytes.length; i++) {
      const p = bytePos(i);
      let base;
      if (enc) {
        const ch = enc.chars[srcOf[i]];
        base = !ch.ok ? C['te-err'] : lenColor(state.write === 'utf8' ? ch.len : ch.len === 1 ? 1 : 2);
        if (srcOf[i] % 2) base = shade(base, D.dark ? -0.2 : 0.22);
      } else {
        const g = dec.segs[segOf[i]];
        base = g.ok ? lenColor(g.len) : C['te-err'];
        if (segOf[i] % 2) base = shade(base, D.dark ? -0.2 : 0.22);
      }
      D.block(c, p.x + 1.5, p.y, u - 3, bh, base, { r: 5, shadow: false });
      c.font = fnt(B.narrow ? 11.5 : 13, 700, MONO);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#ffffff';
      c.fillText(K.hex(bytes[i]), p.x + u / 2, p.y + bh / 2 + 0.5);
      if (enc && srcOf[i] === state.sel) {
        D.roundRect(c, p.x + 0.5, p.y - 1.5, u - 1, bh + 3, 6);
        c.strokeStyle = C.accent; c.lineWidth = 2; c.stroke();
      }
    }
    // 括號（可能跨列）
    function bracket(start, len, yOff, up, color, label, labFont) {
      const pieces = [];
      for (let k = 0; k < len; k++) {
        const p = bytePos(start + k);
        const last = pieces[pieces.length - 1];
        if (last && last.r === p.r) last.x1 = p.x + u; else pieces.push({ r: p.r, x0: p.x, x1: p.x + u, y: p.y });
      }
      pieces.forEach(function (pc, pi) {
        const y = up ? pc.y - 4 : pc.y + bh + 4, dy = up ? -5 : 5;
        c.beginPath();
        c.moveTo(pc.x0 + 3, y); c.lineTo(pc.x0 + 3, y + dy); c.lineTo(pc.x1 - 3, y + dy); c.lineTo(pc.x1 - 3, y);
        c.strokeStyle = color; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
        if (pi === 0 && label) {
          const xm = (pc.x0 + pc.x1) / 2;
          if (up) D.pill(c, raw(label), xm, y + dy - 1, color, 'center', labFont);
          else D.pill(c, raw(label), xm, y + dy + 20, color, 'center', labFont);
        }
      });
    }
    if (enc) enc.chars.forEach(function (ch, i) {
      const g = glyph({ cp: ch.cp, s: ch.s, lone: K.isSurrogate(ch.cp) });
      bracket(ch.start, ch.len, 0, true, ch.ok ? alpha(C.text, 0.7) : C['te-err'], g.s, g.small ? fnt(10.5, 700, MONO) : fnt(14, 500));
    });
    dec.segs.forEach(function (gs) {
      const it = { cp: gs.cp, s: gs.s, lone: false };
      const g = gs.ok ? glyph(it) : { s: '�', small: false };
      bracket(gs.start, gs.len, 0, false, gs.ok ? C['te-ok'] : C['te-err'], g.s, g.small ? fnt(10.5, 700, MONO) : fnt(14, 600));
    });
    void t;
  }

  // =====================================================================
  // 音效
  // =====================================================================
  function sound() { const S = window.LabSound; return S && S.enabled() ? S : null; }
  /** 選到一個字：幾個位元組就響幾聲（越長越高） */
  function sndPick(n) {
    const S = sound(); if (!S) return;
    const f = [0, 440, 523.25, 659.25, 783.99][n] || 440;
    for (let k = 0; k < n; k++) S.tone({ freq: f, dur: 0.05, type: 'triangle', gain: 0.16, delay: k * 0.085 });
  }
  function sndMix(errors, same) {
    const S = sound(); if (!S) return;
    if (errors) S.noise({ dur: 0.12, gain: 0.22, filter: 900, q: 1.4 });
    else if (!same) S.tone({ freq: 392, dur: 0.12, type: 'square', gain: 0.07 });
    else S.tone({ freq: 659.25, dur: 0.1, type: 'sine', gain: 0.16 });
  }
  function sndRescue() { const S = sound(); if (S) S.sweep({ from: 440, to: 1046.5, dur: 0.35, type: 'sine', gain: 0.18 }); }
  function sndFlip() { const S = sound(); if (S) S.tone({ freq: 1200, dur: 0.035, type: 'square', gain: 0.07 }); }
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
  // 任務事件
  // =====================================================================
  function emit(type, data) { if (window.LabMission) window.LabMission.emit(type, data); }
  let sayTimer = 0;
  function say(msg) { clearTimeout(sayTimer); sayTimer = setTimeout(function () { $('status').textContent = msg || ''; }, 20); }
  function textData(src, extra) {
    const lens = lensCount();
    return Object.assign({
      src: src, origin: state.origin, n: its.length, units: state.text.length, u8: sz.u8, u16: sz.u16, b5: sz.b5, b5bad: sz.b5bad,
      lens: lens, nonAscii: nonAscii(its), lone: its.filter(function (x) { return x.lone; }).length,
      cps: its.map(function (x) { return x.cp; }), twins: K.twins(state.text), b5c: b5cCount(), joined: false
    }, extra || {});
  }
  function chainDepth() { return state.chain ? state.chain.depth[state.chain.depth.length - 1] : 0; }
  function mixData(src, extra) {
    const dec = mix.dec, ch = state.chain;
    const kinds = K.errorKinds(dec.segs);
    const out = dec.text;
    const back = !!(ch && !state.raw && chainDepth() >= 1 && out === ch.orig);
    return Object.assign({
      src: src, write: state.write, read: state.read, raw: !!state.raw, n: its.length, nonAscii: nonAscii(its),
      same: !state.raw && out === state.text, errors: dec.errors, kinds: kinds, kindsN: Object.keys(kinds).length, outN: dec.segs.length, nb: mix.bytes.length,
      bad: mix.enc ? mix.enc.bad : 0, bom: !state.raw && state.text.charCodeAt(0) === 0xFEFF, outIBS: out.indexOf('ï»¿') === 0,
      jiao: out.indexOf('嚙踝蕭') >= 0, srcFFFD: (state.text.match(/�/g) || []).length,
      chainLen: ch ? ch.steps.length : 0, b5u8: !!(ch && ch.steps.some(function (s) { return s.write === 'big5' && s.read === 'utf8' && s.errors > 0; })),
      back: back, depth: chainDepth(), maxDepth: ch ? ch.maxDepth : 0, origNonAscii: ch ? nonAscii(K.items(ch.orig)) : 0,
      overDot: K.overlongs(mix.bytes).filter(function (o) { return o.cp === 0x2E || o.cp === 0x2F; }).length,
      edited: false, new3: 0
    }, extra || {});
  }

  // =====================================================================
  // 畫面更新
  // =====================================================================
  function fmtBytes(n) { return n + T(' 位元組', n === 1 ? ' byte' : ' bytes'); }
  function updateDom() {
    $('rN').textContent = String(its.length);
    $('rUnits').textContent = String(state.text.length);
    $('rU8').textContent = fmtBytes(sz.u8);
    $('rU16').textContent = fmtBytes(sz.u16);
    $('rB5').textContent = !b5ok ? T('瀏覽器不支援', 'not supported')
      : sz.b5 === null ? T(sz.b5bad + ' 個字沒有', sz.b5bad + ' missing') : fmtBytes(sz.b5);
    // 存檔與開檔
    ['utf8', 'big5', 'latin1'].forEach(function (e) {
      $('w-' + e).setAttribute('aria-pressed', String(state.write === e));
      $('r-' + e).setAttribute('aria-pressed', String(state.read === e));
    });
    const dec = mix.dec;
    const errs = dec.segs.map(function (g) { return !g.ok; });
    domText($('mixOut'), dec.text, errs);
    const m = $('mixMsg');
    let msg, cls = '';
    if (state.raw) { msg = T('位元組是你自己改的（文字框不變）。', 'You edited the bytes (the text box is unchanged).'); }
    else if (dec.text === state.text) { msg = T('和原文完全一樣。', 'Exactly the same as the original.'); cls = 'ok'; }
    else msg = T('變成亂碼了。', 'It has turned into garbled text.');
    if (dec.errors) { msg += T(' 有 ' + dec.errors + ' 處無法解讀，換成了「�」。', ' ' + dec.errors + (dec.errors === 1 ? ' place' : ' places') + ' could not be read and became “�”.'); cls = 'bad'; }
    if (mix.enc && mix.enc.bad) { msg += T(' 存檔時有 ' + mix.enc.bad + ' 個字這種編碼沒有，寫成了「?」。', ' While saving, ' + mix.enc.bad + (mix.enc.bad === 1 ? ' character was' : ' characters were') + ' missing from this encoding and became “?”.'); cls = 'bad'; }
    if (state.chain && !state.raw && dec.text === state.chain.orig && chainDepth() >= 1) { msg = T('救回來了！和最初的原文一模一樣。', 'Rescued! Identical to the very first text.'); cls = 'ok'; }
    m.textContent = msg; m.className = 'msg' + (cls ? ' ' + cls : '');
    $('backBtn').disabled = !(state.chain || state.raw);
    const hexEl = $('hexIn');
    if (document.activeElement !== hexEl) { hexEl.value = K.hexStr(mix.bytes); hexEl.classList.remove('bad'); }
    $('cutBtn').disabled = mix.bytes.length < 2;
    renderChain();
    markAscii();
    const t = $('txt');
    if (document.activeElement !== t && t.value !== state.text) t.value = state.text;
    if (HAN.test(state.text)) t.setAttribute('lang', 'zh-Hant'); else t.removeAttribute('lang');
  }
  function refresh() { recompute(); updateDom(); relayout(); }
  function describeSel() {
    const it = cur();
    if (!it) return '';
    const n = it.lone ? 3 : K.utf8Len(it.cp), b = b5Of(it);
    return K.uplus(it.cp) + T('：UTF-8 ' + n + ' 個位元組（' + K.hexStr(K.utf8Bytes(it.lone ? 0xFFFD : it.cp)) + '）、UTF-16 ' + it.units.length + ' 個碼元、Big5 ' + (b ? K.hexStr(b) : '沒有'),
      ': UTF-8 ' + n + (n === 1 ? ' byte' : ' bytes') + ' (' + K.hexStr(K.utf8Bytes(it.lone ? 0xFFFD : it.cp)) + '), UTF-16 ' + it.units.length + (it.units.length === 1 ? ' code unit' : ' code units') + ', Big5 ' + (b ? K.hexStr(b) : 'none'));
  }

  // =====================================================================
  // 操作
  // =====================================================================
  /** 改文字（所有改文字的操作都經過這裡）；src：typed、example、cp、ascii、flip、push、back、init */
  function setText(str, src, extra) {
    let list = K.items(str);
    let clipped = false;
    if (list.length > K.MAX_CHARS) { list = list.slice(0, K.MAX_CHARS); clipped = true; }
    str = list.map(function (x) { return x.s; }).join('');
    state.text = str;
    state.raw = null; state.rawPrev = null;
    if (src === 'example' || src === 'init') state.origin = src; else state.origin = 'typed';
    if (src !== 'push') state.chain = null;
    if (extra && extra.sel != null) state.sel = extra.sel;
    recompute();
    $('txtMsg').textContent = clipped ? T('最多 40 個字，後面的已經刪掉。', 'At most 40 characters; the rest was cut off.') : '';
    $('txtMsg').className = 'msg' + (clipped ? ' bad' : '');
    updateDom();
    relayout();
    if (src === 'init') return;
    emit('text', textData(src, extra && extra.ev));
    emit('mix', mixData(src));
  }
  function select(i, src) {
    if (!its.length) return;
    state.sel = (i + its.length) % its.length;
    state.glow = performance.now();
    relayout();
    const it = cur();
    const n = it.lone ? 3 : K.utf8Len(it.cp);
    sndPick(n);
    say(describeSel());
    markAscii();
    const b = b5Of(it);
    emit('pick', { src: src, cp: it.cp, u8: n, u16: it.units.length, b5: b ? b.length : 0, lone: it.lone });
  }
  $('prevBtn').addEventListener('click', function () { select(state.sel - 1, 'btn'); });
  $('nextBtn').addEventListener('click', function () { select(state.sel + 1, 'btn'); });

  // 文字框：打字（中文輸入法組字完成後）停 0.4 秒就更新
  const elTxt = $('txt');
  let typeTimer = 0, composing = false;
  elTxt.addEventListener('compositionstart', function () { composing = true; });
  elTxt.addEventListener('compositionend', function () { composing = false; scheduleTyped(); });
  elTxt.addEventListener('input', function (e) { if (composing || e.isComposing) return; scheduleTyped(); });
  function scheduleTyped() { clearTimeout(typeTimer); typeTimer = setTimeout(applyTyped, 400); }
  function applyTyped() { if (elTxt.value !== state.text) setText(elTxt.value, 'typed', { sel: Math.max(0, K.items(elTxt.value).length - 1) }); }
  elTxt.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); clearTimeout(typeTimer); applyTyped(); } });
  elTxt.addEventListener('blur', function () { clearTimeout(typeTimer); applyTyped(); });
  Object.keys(EXAMPLES).forEach(function (id) {
    $(id).addEventListener('click', function () {
      clearTimeout(typeTimer);
      const s = EXAMPLES[id];
      elTxt.value = s;
      const list = K.items(s);
      let sel = 0;
      for (let i = 0; i < list.length; i++) if (list[i].cp >= 0x80) { sel = i; break; }
      setText(s, 'example', { sel: sel });
      say(describeSel());
    });
  });
  // 碼位
  function insertCp() {
    const v = K.parseCp($('cpIn').value);
    const msg = $('cpMsg');
    if (v === null) { msg.textContent = T('請輸入 0 到 10FFFF 之間的十六進位數字，例如 4E2D。', 'Enter a hexadecimal number from 0 to 10FFFF, for example 4E2D.'); msg.className = 'msg bad'; $('cpIn').classList.add('bad'); return; }
    $('cpIn').classList.remove('bad');
    if (its.length >= K.MAX_CHARS) { msg.textContent = T('已經 40 個字了，先刪掉一些。', 'Already 40 characters; delete some first.'); msg.className = 'msg bad'; return; }
    const at = its.length ? state.sel + 1 : 0;
    const before = its.slice(0, at).map(function (x) { return x.s; }).join('');
    const after = its.slice(at).map(function (x) { return x.s; }).join('');
    const prev = its[at - 1];
    const next = its[at];
    const joinPrev = !!(prev && prev.lone && prev.cp >= 0xD800 && prev.cp <= 0xDBFF && v >= 0xDC00 && v <= 0xDFFF);
    const joinNext = !!(next && next.lone && next.cp >= 0xDC00 && next.cp <= 0xDFFF && v >= 0xD800 && v <= 0xDBFF);
    const joined = joinPrev || joinNext;
    const s = before + K.fromCp(v) + after;
    const newSel = joinPrev ? at - 1 : at;
    msg.className = 'msg';
    msg.textContent = joined ? T('兩個半邊接成了一對代理：' + K.uplus(K.items(s)[newSel].cp) + '。', 'The two halves joined into a surrogate pair: ' + K.uplus(K.items(s)[newSel].cp) + '.')
      : K.isSurrogate(v) ? T(K.uplus(v) + ' 是半個代理：自己不是一個字。', K.uplus(v) + ' is half of a surrogate pair: not a character on its own.') : T('加入了 ' + K.uplus(v) + '。', 'Added ' + K.uplus(v) + '.');
    elTxt.value = s;
    setText(s, 'cp', { sel: newSel, ev: { joined: joined, cp: v } });
    say(describeSel());
  }
  $('cpBtn').addEventListener('click', insertCp);
  $('cpIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); insertCp(); } });

  // 存檔、開檔編碼
  ['utf8', 'big5', 'latin1'].forEach(function (e) {
    $('w-' + e).addEventListener('click', function () {
      state.write = e;
      if (state.raw) { state.raw = null; state.rawPrev = null; }
      recompute(); updateDom(); relayout();
      sndMix(mix.dec.errors, mix.dec.text === state.text);
      afterMix('write');
    });
    $('r-' + e).addEventListener('click', function () {
      state.read = e;
      recompute(); updateDom(); relayout();
      sndMix(mix.dec.errors, !state.raw && mix.dec.text === state.text);
      afterMix('read');
    });
  });
  function afterMix(src, extra) {
    const d = mixData(src, extra);
    if (d.back) sndRescue();
    emit('mix', d);
  }
  // 用這段亂碼繼續：把開檔得到的文字當成新的原文，鏈接下去
  $('pushBtn').addEventListener('click', function () {
    const out = mix.dec.text;
    if (!out.length) return;
    let ch = state.chain;
    if (!ch || state.raw) ch = state.chain = { orig: state.raw ? out : state.text, steps: [], texts: [state.raw ? out : state.text], depth: [0], maxDepth: 0 };
    if (!state.raw) {
      const prevDepth = ch.depth[ch.depth.length - 1];
      let d;
      const k = ch.texts.indexOf(out);
      if (k >= 0) d = ch.depth[k]; else d = out === state.text ? prevDepth : prevDepth + 1;
      ch.steps.push({ write: state.write, read: state.read, src: state.text, result: out, errors: mix.dec.errors });
      ch.texts.push(out); ch.depth.push(d);
      ch.maxDepth = Math.max(ch.maxDepth, d);
    }
    const keep = state.chain;
    elTxt.value = out;
    setText(out, 'push', { sel: Math.min(state.sel, K.items(out).length - 1) });
    state.chain = keep;
    updateDom();
    say(T('亂碼變成了新的文字。換一組存檔、開檔編碼試試看。', 'The garbled text is now the new text. Try another pair of encodings.'));
  });
  $('backBtn').addEventListener('click', function () {
    if (state.chain) {
      const o = state.chain.orig;
      elTxt.value = o;
      setText(o, 'back');
    } else if (state.raw) {
      state.raw = null; state.rawPrev = null;
      recompute(); updateDom(); relayout();
    }
  });
  function renderChain() {
    const tb = $('chainLog'), ch = state.chain;
    tb.textContent = '';
    $('chainEmpty').hidden = !!(ch && ch.steps.length);
    if (!ch || !ch.steps.length) return;
    const hr = document.createElement('tr');
    [T('次', 'Step'), T('存 → 開', 'Save → open'), T('得到', 'Result')].forEach(function (s) { const th = document.createElement('th'); th.textContent = s; hr.appendChild(th); });
    tb.appendChild(hr);
    const tr0 = document.createElement('tr');
    tr0.innerHTML = '<td>0</td><td>' + T('原文', 'original') + '</td><td class="g" data-no-convert></td>';
    domText(tr0.lastChild, ch.orig);
    tb.appendChild(tr0);
    ch.steps.forEach(function (s, i) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + ENC_NAME[s.write] + ' → ' + ENC_NAME[s.read] + '</td><td class="g" data-no-convert></td>';
      domText(tr.lastChild, s.result);
      tb.appendChild(tr);
    });
  }
  // 自己改位元組
  const elHex = $('hexIn');
  function applyHex() {
    const r = K.parseHex(elHex.value), m = $('hexMsg');
    if (r.error) {
      elHex.classList.add('bad');
      m.textContent = r.error === 'long' ? T('最多 200 個位元組。', 'At most 200 bytes.') : r.error === 'odd' ? T('每個位元組要兩位十六進位數字，例如 E4 B8 AD。', 'Each byte needs two hexadecimal digits, for example E4 B8 AD.') : T('只能打 0–9、A–F 和空格。', 'Only 0–9, A–F and spaces.');
      m.className = 'msg bad';
      return;
    }
    elHex.classList.remove('bad');
    m.className = 'msg';
    const prevBytes = mix.bytes.slice();
    const prevText = state.raw ? mix.dec.text : state.text;
    const edited = r.bytes.length !== prevBytes.length || r.bytes.some(function (b, i) { return b !== prevBytes[i]; });
    state.raw = r.bytes; state.rawPrev = prevText;
    recompute();
    elHex.blur();
    updateDom(); relayout();
    sndMix(mix.dec.errors, false);
    // 解出來的 3 位元組字裡，原來的文字沒有的有幾個
    let new3 = 0;
    const had = {};
    K.items(prevText).forEach(function (x) { had[x.cp] = 1; });
    mix.dec.segs.forEach(function (g) { if (g.ok && g.len === 3 && state.read === 'utf8' && !had[g.cp]) { new3++; had[g.cp] = 1; } });
    m.textContent = T('用 ' + ENC_NAME[state.read] + ' 打開這 ' + r.bytes.length + ' 個位元組。', 'Opened these ' + r.bytes.length + ' bytes as ' + ENC_NAME[state.read] + '.');
    afterMix('hex', { edited: edited, new3: new3 });
  }
  $('hexBtn').addEventListener('click', applyHex);
  elHex.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyHex(); } });
  // 刪掉第一個位元組
  $('cutBtn').addEventListener('click', function () {
    if (mix.bytes.length < 2) return;
    const wasRaw = !!state.raw;
    const before = mix.dec;
    const srcText = wasRaw ? before.text : state.text;
    const srcIts = K.items(srcText);
    const multiAll = !wasRaw && mix.enc.chars.every(function (c) { return c.len >= 2 && c.ok; });
    state.raw = mix.bytes.slice(1); state.rawPrev = srcText;
    recompute(); updateDom(); relayout();
    sndMix(mix.dec.errors, false);
    const common = K.commonSuffix(mix.dec.text, srcText);
    const lost = srcIts.length - common;
    say(T('從第二個位元組開始讀：原來的 ' + srcIts.length + ' 個字，最後有 ' + common + ' 個字對得回來。', 'Reading from the second byte: of the ' + srcIts.length + ' original characters, the last ' + common + ' come out right.'));
    emit('cut', { write: state.write, read: state.read, raw: wasRaw, n: srcIts.length, multiAll: multiAll, common: common, lost: lost, errorsBefore: before.errors, errors: mix.dec.errors });
    emit('mix', mixData('cut'));
  });

  // ---------- 翻轉位元 ----------
  function flipBit(k, bit) {
    const it = cur();
    if (!it) return;
    const enc = K.encode(state.text, 'utf8');
    const ch = enc.chars[state.sel];
    const pos = ch.start + k;
    if (pos >= enc.bytes.length) return;
    const bytes = enc.bytes.slice();
    const before = it;
    bytes[pos] ^= (1 << bit);
    const dec = K.decode(bytes, 'utf8');
    // 新的選取：找出蓋住這個位元組的段落是第幾個字
    let selNew = 0;
    for (let i = 0; i < dec.segs.length; i++) { if (dec.segs[i].start <= pos && pos < dec.segs[i].start + dec.segs[i].len) { selNew = i; break; } }
    const seg = dec.segs[selNew];
    const after = seg ? seg.cp : 0xFFFD;
    const isUp = function (c) { return c >= 0x41 && c <= 0x5A; }, isLo = function (c) { return c >= 0x61 && c <= 0x7A; };
    const caseSwap = !before.lone && ((isUp(before.cp) && after === before.cp + 32) || (isLo(before.cp) && after === before.cp - 32));
    state.flipCell = { k: k, bit: bit }; state.flipAt = performance.now();
    sndFlip();
    elTxt.value = dec.text;
    setText(dec.text, 'flip', { sel: selNew });
    say(T('第 ' + (k + 1) + ' 個位元組的第 ' + bit + ' 位翻轉：' + K.hex(bytes[pos] ^ (1 << bit)) + ' → ' + K.hex(bytes[pos]) + '。', 'Bit ' + bit + ' of byte ' + (k + 1) + ' flipped: ' + K.hex(bytes[pos] ^ (1 << bit)) + ' → ' + K.hex(bytes[pos]) + '.') + (dec.errors ? T(' 這串位元組不合法了。', ' The bytes are no longer valid.') : ''));
    emit('flip', { k: k, bit: bit, mask: 1 << bit, before: before.cp, after: after, caseSwap: caseSwap, errors: dec.errors, n: dec.segs.length });
  }
  function canvasXY(cnv, ev) { const r = cnv.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
  function hitBit(p) {
    if (!A) return -1;
    for (let i = 0; i < A.cells.length; i++) { const q = A.cells[i]; if (p.x >= q.x && p.x < q.x + q.w && p.y >= q.y - 3 && p.y < q.y + q.h + 3) return i; }
    return -1;
  }
  cv.addEventListener('pointerdown', function (ev) {
    const i = hitBit(canvasXY(cv, ev));
    if (i < 0) return;
    ev.preventDefault();
    state.bitFocus = i;
    flipBit(A.cells[i].k, A.cells[i].bit);
  });
  cv.addEventListener('pointermove', function (ev) { cv.style.cursor = hitBit(canvasXY(cv, ev)) >= 0 ? 'pointer' : 'default'; });
  cv.tabIndex = 0;
  cv.addEventListener('focus', function () { state.kbA = true; if (state.bitFocus < 0) state.bitFocus = 0; requestDraw(); });
  cv.addEventListener('blur', function () { state.kbA = false; requestDraw(); });
  cv.addEventListener('keydown', function (e) {
    if (!A || !A.cells.length) return;
    const n = A.cells.length;
    if (e.key === 'ArrowRight') { state.bitFocus = (state.bitFocus + 1) % n; }
    else if (e.key === 'ArrowLeft') { state.bitFocus = (state.bitFocus - 1 + n) % n; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(state.sel - 1, 'key'); state.bitFocus = 0; return; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); select(state.sel + 1, 'key'); state.bitFocus = 0; return; }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const q = A.cells[Math.min(state.bitFocus, n - 1)]; if (q) flipBit(q.k, q.bit); return; }
    else return;
    e.preventDefault();
    const q = A.cells[state.bitFocus];
    say(T('第 ' + (q.k + 1) + ' 個位元組、第 ' + q.bit + ' 位。按 Enter 翻轉。', 'Byte ' + (q.k + 1) + ', bit ' + q.bit + '. Press Enter to flip it.'));
    requestDraw();
  });
  // 點位元組選字
  cv2.addEventListener('pointerdown', function (ev) {
    if (!B || !mix) return;
    const p = canvasXY(cv2, ev);
    // 長度尺
    const bars = B.bars;
    if (p.y >= bars.y && p.y < bars.y + 3 * (bars.h + bars.gap) && its.length) {
      const li = Math.floor((p.y - bars.y) / (bars.h + bars.gap));
      const bx0 = B.pad + bars.lab, bw = cw2 - B.pad - bars.right - bx0;
      const lenF = [function (it) { return it.lone ? 3 : K.utf8Len(it.cp); }, function (it) { return it.units.length * 2; }, function (it) { const b = b5Of(it); return b ? b.length : 1; }][li];
      let tot = [0, 0, 0];
      its.forEach(function (it) { tot[0] += it.lone ? 3 : K.utf8Len(it.cp); tot[1] += it.units.length * 2; const b = b5Of(it); tot[2] += b ? b.length : 1; });
      const sc = bw / Math.max(1, Math.max.apply(null, tot));
      let x = bx0;
      for (let i = 0; i < its.length; i++) { const ww = lenF(its[i]) * sc; if (p.x >= x && p.x < x + ww) { ev.preventDefault(); select(i, 'click'); return; } x += ww; }
      return;
    }
    if (!mix.enc) return;
    for (let i = 0; i < mix.bytes.length; i++) {
      const q = bytePos(i);
      if (p.x >= q.x && p.x < q.x + B.u && p.y >= q.y - B.top && p.y < q.y + B.bh + B.bot) {
        const ci = mix.enc.chars.findIndex(function (c) { return c.start <= i && i < c.start + c.len; });
        if (ci >= 0) { ev.preventDefault(); select(ci, 'click'); }
        return;
      }
    }
  });
  cv2.tabIndex = 0;
  cv2.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); select(state.sel + 1, 'key'); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); select(state.sel - 1, 'key'); }
  });

  // =====================================================================
  // ASCII 表
  // =====================================================================
  const asciiCells = [];
  (function buildAscii() {
    const box = $('asciiTab');
    for (let col = 0; col < 8; col++) { const h = document.createElement('div'); h.className = 'h'; h.textContent = K.hex(col, 1) + '_'; box.appendChild(h); }
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 8; col++) {
        const code = col * 16 + row;
        let el;
        if (code < 0x20 || code === 0x7F) {
          el = document.createElement('span'); el.className = 'c';
          el.innerHTML = (code === 0x7F ? 'DEL' : CTRL[code]) + '<small>' + K.hex(code) + '</small>';
          el.title = K.hex(code) + ' ' + (code === 0x7F ? 'DEL' : CTRL[code]);
        } else {
          el = document.createElement('button'); el.type = 'button';
          el.innerHTML = (code === 0x20 ? '␣' : code === 0x3C ? '&lt;' : code === 0x26 ? '&amp;' : String.fromCharCode(code)) + '<small>' + K.hex(code) + '</small>';
          el.setAttribute('aria-label', (code === 0x20 ? 'space' : String.fromCharCode(code)) + ' ' + K.hex(code));
          if (code >= 0x41 && code <= 0x5A) el.classList.add('upper');
          if (code >= 0x61 && code <= 0x7A) el.classList.add('lower');
          el.addEventListener('click', function () {
            if (its.length >= K.MAX_CHARS) { say(T('已經 40 個字了。', 'Already 40 characters.')); return; }
            const at = its.length ? state.sel + 1 : 0;
            const s = its.slice(0, at).map(function (x) { return x.s; }).join('') + String.fromCharCode(code) + its.slice(at).map(function (x) { return x.s; }).join('');
            elTxt.value = s;
            setText(s, 'ascii', { sel: at });
            say(describeSel());
          });
        }
        el.style.gridColumn = String(col + 1);
        el.style.gridRow = String(row + 2);
        box.appendChild(el);
        asciiCells[code] = el;
      }
    }
  })();
  let lastAscii = -1;
  function markAscii() {
    const it = cur();
    const code = it && it.cp < 128 ? it.cp : -1;
    if (code === lastAscii) return;
    if (lastAscii >= 0 && asciiCells[lastAscii]) asciiCells[lastAscii].classList.remove('cur');
    if (code >= 0 && asciiCells[code]) asciiCells[code].classList.add('cur');
    lastAscii = code;
  }

  // =====================================================================
  // UTF-8 挑戰
  // =====================================================================
  const QN = 5;
  function quizStart() {
    if (state.quiz && state.quiz.wait) { nextQuestion(); return; }
    state.quiz = { i: 0, correct: 0, t0: performance.now(), q: null, wait: false };
    state.streak = state.streak || 0;
    $('quizStop').hidden = false;
    nextQuestion();
  }
  function nextQuestion() {
    const z = state.quiz;
    z.q = K.quizItem(qrand, z.i % 2 ? 'dec' : 'enc', 2 + (z.i % 3));
    z.wait = false;
    const q = z.q, qq = $('quizQ');
    qq.innerHTML = '';
    const b = document.createElement('b');
    if (q.kind === 'enc') {
      qq.appendChild(document.createTextNode(T('第 ' + (z.i + 1) + '／' + QN + ' 題：把 ', 'Question ' + (z.i + 1) + ' of ' + QN + ': write ')));
      b.textContent = K.uplus(q.cp); qq.appendChild(b);
      qq.appendChild(document.createTextNode(T(' 寫成 UTF-8 的位元組（十六進位，例如 C3 A9）。', ' as UTF-8 bytes (hexadecimal, for example C3 A9).')));
    } else {
      qq.appendChild(document.createTextNode(T('第 ' + (z.i + 1) + '／' + QN + ' 題：UTF-8 位元組 ', 'Question ' + (z.i + 1) + ' of ' + QN + ': the UTF-8 bytes ')));
      b.textContent = K.hexStr(q.bytes); qq.appendChild(b);
      qq.appendChild(document.createTextNode(T(' 是哪一個碼位？（例如 U+00E9）', ' are which code point? (for example U+00E9)')));
    }
    const inp = $('quizIn');
    inp.disabled = false; inp.value = ''; $('quizOk').disabled = false;
    $('quizOk').textContent = T('確定', 'Check');
    inp.focus({ preventScroll: true });
    quizStat();
  }
  function quizCheck() {
    const z = state.quiz;
    if (!z) return;
    if (z.wait) { nextQuestion(); return; }
    const ans = $('quizIn').value.trim();
    if (!ans) return;
    const ok = K.quizCheck(z.q, ans);
    z.wait = true; z.i++;
    if (ok) { z.correct++; state.streak++; } else state.streak = 0;
    sndChime(ok);
    const qq = $('quizQ');
    const right = z.q.kind === 'enc' ? K.hexStr(z.q.bytes) : K.uplus(z.q.cp);
    qq.textContent = ok ? T('答對了！' + K.uplus(z.q.cp) + ' = ' + K.hexStr(z.q.bytes) + '。', 'Correct! ' + K.uplus(z.q.cp) + ' = ' + K.hexStr(z.q.bytes) + '.')
      : T('不對。正確答案是 ' + right + '（' + K.uplus(z.q.cp) + ' = ' + K.hexStr(z.q.bytes) + '）。', 'Not quite. The answer is ' + right + ' (' + K.uplus(z.q.cp) + ' = ' + K.hexStr(z.q.bytes) + ').');
    emit('quiz', { ok: ok, streak: state.streak, kind: z.q.kind, n: z.q.n });
    $('quizIn').disabled = true;
    if (z.i >= QN) {
      const time = Math.round((performance.now() - z.t0) / 100) / 10;
      state.rounds.push({ correct: z.correct, time: time });
      emit('round', { correct: z.correct, total: QN, time: time });
      renderRounds();
      qq.textContent += T(' 這一回合答對 ' + z.correct + '／' + QN + ' 題，用了 ' + time.toFixed(1) + ' 秒。', ' This round: ' + z.correct + ' of ' + QN + ' right in ' + time.toFixed(1) + ' s.');
      quizEnd();
    } else {
      $('quizOk').textContent = T('下一題', 'Next question');
    }
    quizStat();
  }
  function quizEnd() {
    state.quiz = null;
    $('quizStop').hidden = true;
    $('quizOk').disabled = true; $('quizIn').disabled = true;
    $('quizOk').textContent = T('確定', 'Check');
  }
  function quizStat() {
    const z = state.quiz, el = $('quizStat');
    if (!z) { el.innerHTML = state.streak ? T('連續答對：<b>' + state.streak + '</b>', 'Streak: <b>' + state.streak + '</b>') : ''; return; }
    el.innerHTML = T('答對 <b>' + z.correct + '</b>／' + z.i + '　連續答對 <b>' + state.streak + '</b>', 'Right <b>' + z.correct + '</b> of ' + z.i + '   streak <b>' + state.streak + '</b>');
  }
  function renderRounds() {
    const tb = $('roundLog');
    tb.textContent = '';
    $('logEmpty').hidden = state.rounds.length > 0;
    if (!state.rounds.length) return;
    const hr = document.createElement('tr');
    [T('回合', 'Round'), T('答對', 'Right'), T('時間', 'Time')].forEach(function (s) { const th = document.createElement('th'); th.textContent = s; hr.appendChild(th); });
    tb.appendChild(hr);
    state.rounds.forEach(function (r, i) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + r.correct + '／' + QN + '</td><td>' + r.time.toFixed(1) + ' s</td>';
      tb.appendChild(tr);
    });
  }
  $('quizStart').addEventListener('click', quizStart);
  $('quizStop').addEventListener('click', function () { quizEnd(); $('quizQ').textContent = T('挑戰結束。按「開始挑戰」再來一次。', 'Challenge stopped. Press “Start the challenge” to try again.'); quizStat(); });
  $('quizOk').addEventListener('click', quizCheck);
  $('quizIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); quizCheck(); } });

  // ---------- 全部清除 ----------
  $('wipeBtn').addEventListener('click', function () {
    state.chain = null; state.rounds = []; state.streak = 0;
    if (state.quiz) quizEnd();
    $('quizQ').textContent = T('按「開始挑戰」。', 'Press “Start the challenge”.');
    renderRounds(); quizStat();
    state.flipCell = null;
    recompute(); updateDom(); relayout();
    say(T('已清除接力紀錄與挑戰紀錄；文字與編碼沒有改變。', 'The relay log and the challenge log are cleared; the text and the encodings are unchanged.'));
  });

  // =====================================================================
  // 開始
  // =====================================================================
  function themeChanged() { readColors(); requestDraw(); }
  readColors();
  if (!b5ok) { ['w-big5', 'r-big5'].forEach(function (id) { $(id).disabled = true; }); }
  elTxt.value = DEFAULT_TEXT;
  (function () { const l = K.items(DEFAULT_TEXT); for (let i = 0; i < l.length; i++) if (l[i].cp >= 0x80) { state.sel = i; break; } })();
  setText(DEFAULT_TEXT, 'init', { sel: state.sel });
  renderRounds();
  updateSoundButton();
  resize();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);
  window.addEventListener('lab:themechange', themeChanged);
  if (window.ResizeObserver) {
    let lastW = 0;
    new ResizeObserver(function () { if (cv.clientWidth !== lastW || cv2.clientWidth !== cw2) { lastW = cv.clientWidth; resize(); } }).observe(stage);
  } else window.addEventListener('resize', resize);

  // 給測試腳本用的介面（不是 __pt）
  window.TextEncLab = {
    state: state, setText: setText, select: select, flipBit: flipBit,
    mix: function () { return mix; }, items: function () { return its; }
  };
})();
