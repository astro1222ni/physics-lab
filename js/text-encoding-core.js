/* text-encoding-core.js — 「文字編碼：ASCII、Big5 與 UTF-8」的計算核心（與畫面分離，Node 單元測試：tests/text-encoding-core.test.js）
 *
 * 一、字元與碼位：JavaScript 字串是一串 UTF-16 碼元。items() 把它切成「字元」：
 *   一般的字一個碼元；高代理（D800–DBFF）後面緊接低代理（DC00–DFFF）時合成一個補充平面的碼位
 *   U+10000 + (hi − D800) × 0x400 + (lo − DC00)；落單的代理（孤立代理）自成一項、標 lone。
 * 二、UTF-8（RFC 3629；The Unicode Standard 第 3 章 D92、表 3-6、表 3-7）：
 *   U+0000–007F：0xxxxxxx；U+0080–07FF：110xxxxx 10xxxxxx；U+0800–FFFF：1110xxxx 10xxxxxx 10xxxxxx；
 *   U+10000–10FFFF：11110xxx 10xxxxxx 10xxxxxx 10xxxxxx。代理 D800–DFFF 不可編碼：
 *   和瀏覽器的 TextEncoder 一樣，孤立代理改寫成 U+FFFD（EF BF BD）。
 *   解碼照 WHATWG Encoding Standard 的 UTF-8 decoder：遇到錯誤輸出一個 U+FFFD（「最大子部分」規則，
 *   與 Unicode 第 3 章 U+FFFD 的建議做法相同），錯誤的位元組若可能是下一個字的開頭就重新讀。
 *   錯誤分五類：orphan 孤立的延續位元組、overlong 過長編碼（C0、C1、E0 80–9F、F0 80–8F）、
 *   surrogate 編了代理（ED A0–BF）、range 超出 U+10FFFF（F4 90–BF、F5–FF）、trunc 不完整（開頭之後的位元組不夠）。
 *   本頁解碼時保留開頭的 BOM（U+FEFF），相當於 TextDecoder 的 ignoreBOM: true。
 * 三、UTF-16：本頁一律寫成大端序（UTF-16BE，高位元組在前），不加 BOM；補充平面的字拆成一對代理。
 * 四、Big5：WHATWG Encoding Standard 的 Big5（以 Big5-HKSCS 為基礎，含香港增補字符集）。
 *   不附對照表，而是在頁面（與 Node 測試）裡用瀏覽器內建的 TextDecoder('big5') 把每一個雙位元組解碼一次，建立「索引」：
 *   pointer = (lead − 0x81) × 157 + (trail − offset)，offset = trail < 0x7F ? 0x40 : 0x62。
 *   編碼（反查）照標準的「index Big5 pointer」：先排除 pointer < (0xA1 − 0x81) × 157 = 5024 的香港增補區，
 *   U+2550、U+255E、U+2561、U+256A、U+5341、U+5345 取最後一個 pointer，其他取第一個。所以同一個字對到多組位元組時，
 *   本頁一律寫出標準指定的那一組；解碼時每一組都認得。
 *   解碼照標準的 Big5 decoder：pointer 沒有字時輸出 U+FFFD；第二個位元組是 ASCII 時把它還回去重新讀。
 * 五、Latin-1：瀏覽器把標成 ISO-8859-1 的網頁一律當 windows-1252 讀（WHATWG），本頁的「Latin-1」也是 windows-1252：
 *   0x00–0x7F 與 0xA0–0xFF 就是同號碼的 Unicode，0x80–0x9F 有 27 個印刷符號（例如 0x80 = €），其餘 5 個對到同號碼的控制字元。
 * 六、存檔時遇到該編碼沒有的字，本頁寫成「?」（0x3F）並計數。
 */
(function (root) {
  'use strict';
  const MAX_CHARS = 40;          // 文字最多幾個字元（碼位）
  const MAX_BYTES = 200;         // 自己打的位元組最多幾個
  const B5_EXCL = (0xA1 - 0x81) * 157;   // 5024：編碼時排除的香港增補區
  const B5_LAST = [0x2550, 0x255E, 0x2561, 0x256A, 0x5341, 0x5345];
  const W1252 = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
    0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];
  const W1252_REV = {};
  W1252.forEach(function (cp, i) { W1252_REV[cp] = 0x80 + i; });
  const FFFD = 0xFFFD;

  // =====================================================================
  // 字元
  // =====================================================================
  /** 字串 → 字元陣列 [{ cp, s, lone, units }] */
  function items(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      const u = str.charCodeAt(i);
      if (u >= 0xD800 && u <= 0xDBFF && i + 1 < str.length) {
        const v = str.charCodeAt(i + 1);
        if (v >= 0xDC00 && v <= 0xDFFF) {
          out.push({ cp: 0x10000 + ((u - 0xD800) << 10) + (v - 0xDC00), s: str.substr(i, 2), lone: false, units: [u, v] });
          i++;
          continue;
        }
      }
      out.push({ cp: u, s: str.charAt(i), lone: u >= 0xD800 && u <= 0xDFFF, units: [u] });
    }
    return out;
  }
  function isSurrogate(cp) { return cp >= 0xD800 && cp <= 0xDFFF; }
  function fromCp(cp) {
    if (cp < 0x10000) return String.fromCharCode(cp);
    const c = cp - 0x10000;
    return String.fromCharCode(0xD800 + (c >> 10), 0xDC00 + (c & 0x3FF));
  }
  function hex(n, w) { let s = n.toString(16).toUpperCase(); while (s.length < (w || 2)) s = '0' + s; return s; }
  function uplus(cp) { return 'U+' + hex(cp, 4); }
  function bin(n, w) { let s = n.toString(2); while (s.length < w) s = '0' + s; return s; }

  // =====================================================================
  // UTF-8
  // =====================================================================
  /** 一個碼位的 UTF-8 位元組數（代理以 U+FFFD 計，3 個） */
  function utf8Len(cp) { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }
  /** 一個碼位 → UTF-8 位元組（孤立代理 → EF BF BD） */
  function utf8Bytes(cp) {
    if (isSurrogate(cp)) cp = FFFD;
    if (cp < 0x80) return [cp];
    if (cp < 0x800) return [0xC0 | (cp >> 6), 0x80 | (cp & 63)];
    if (cp < 0x10000) return [0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
    return [0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
  }
  /** 每個位元組的前綴長度（1 位元組：1 個「0」；n 位元組的開頭：n 個 1 加一個 0；延續位元組：「10」） */
  function utf8Prefix(n, k) { return n === 1 ? 1 : k === 0 ? n + 1 : 2; }
  /** 碼位的有效位元數（UTF-8 長度 1、2、3、4 → 7、11、16、21） */
  function payloadBits(n) { return [0, 7, 11, 16, 21][n]; }

  /** WHATWG UTF-8 解碼：回傳 [{ start, len, cp, ok, kind }]，ok = false 的段落輸出 U+FFFD */
  function utf8Decode(bytes) {
    const out = [];
    let need = 0, seen = 0, cp = 0, lower = 0x80, upper = 0xBF, start = 0, lead = 0;
    function err(st, len, kind) { out.push({ start: st, len: len, cp: FFFD, ok: false, kind: kind }); }
    for (let i = 0; i <= bytes.length; i++) {
      if (i === bytes.length) {
        if (need) { err(start, i - start, 'trunc'); need = 0; }
        break;
      }
      const b = bytes[i];
      if (need === 0) {
        start = i;
        if (b <= 0x7F) { out.push({ start: i, len: 1, cp: b, ok: true, kind: '' }); continue; }
        if (b >= 0xC2 && b <= 0xDF) { need = 1; cp = b & 0x1F; }
        else if (b >= 0xE0 && b <= 0xEF) {
          if (b === 0xE0) lower = 0xA0;
          if (b === 0xED) upper = 0x9F;
          need = 2; cp = b & 0xF;
        } else if (b >= 0xF0 && b <= 0xF4) {
          if (b === 0xF0) lower = 0x90;
          if (b === 0xF4) upper = 0x8F;
          need = 3; cp = b & 7;
        } else {
          err(i, 1, b >= 0x80 && b <= 0xBF ? 'orphan' : (b === 0xC0 || b === 0xC1) ? 'overlong' : 'range');
          continue;
        }
        seen = 0; lead = b;
        continue;
      }
      if (b < lower || b > upper) {
        // 第二個位元組不在允許的範圍：分辨是哪一種錯
        let kind = 'trunc';
        if (seen === 0 && b >= 0x80 && b <= 0xBF) {
          if (lead === 0xE0 || lead === 0xF0) kind = 'overlong';
          else if (lead === 0xED) kind = 'surrogate';
          else if (lead === 0xF4) kind = 'range';
        }
        err(start, i - start, kind);
        need = 0; lower = 0x80; upper = 0xBF;
        i--;                      // 這個位元組重新讀一次
        continue;
      }
      lower = 0x80; upper = 0xBF;
      cp = (cp << 6) | (b & 0x3F);
      seen++;
      if (seen === need) {
        out.push({ start: start, len: need + 1, cp: cp, ok: true, kind: '' });
        need = 0;
      }
    }
    return out;
  }
  /** 寬鬆的解碼器（不檢查過長編碼）會把哪些過長的序列讀成什麼：回傳 [{ start, len, cp }]（只列出過長的） */
  function overlongs(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      let n = 0;
      if ((b & 0xE0) === 0xC0) n = 2; else if ((b & 0xF0) === 0xE0) n = 3; else if ((b & 0xF8) === 0xF0) n = 4;
      if (!n || i + n > bytes.length) continue;
      let cp = b & (0x7F >> n), ok = true;
      for (let k = 1; k < n; k++) { const c = bytes[i + k]; if ((c & 0xC0) !== 0x80) { ok = false; break; } cp = (cp << 6) | (c & 63); }
      if (!ok) continue;
      if (utf8Len(cp) < n) { out.push({ start: i, len: n, cp: cp }); i += n - 1; }
    }
    return out;
  }

  // =====================================================================
  // UTF-16（大端序）
  // =====================================================================
  function utf16Units(cp) {
    if (cp < 0x10000) return [cp];
    const c = cp - 0x10000;
    return [0xD800 + (c >> 10), 0xDC00 + (c & 0x3FF)];
  }
  function utf16Bytes(cp) {
    const out = [];
    utf16Units(cp).forEach(function (u) { out.push(u >> 8, u & 255); });
    return out;
  }
  function utf16Decode(bytes) {
    const out = [];
    for (let i = 0; i < bytes.length; i += 2) {
      if (i + 1 >= bytes.length) { out.push({ start: i, len: 1, cp: FFFD, ok: false, kind: 'trunc' }); break; }
      const u = (bytes[i] << 8) | bytes[i + 1];
      if (u >= 0xD800 && u <= 0xDBFF && i + 3 < bytes.length) {
        const v = (bytes[i + 2] << 8) | bytes[i + 3];
        if (v >= 0xDC00 && v <= 0xDFFF) { out.push({ start: i, len: 4, cp: 0x10000 + ((u - 0xD800) << 10) + (v - 0xDC00), ok: true, kind: '' }); i += 2; continue; }
      }
      if (u >= 0xD800 && u <= 0xDFFF) out.push({ start: i, len: 2, cp: FFFD, ok: false, kind: 'surrogate' });
      else out.push({ start: i, len: 2, cp: u, ok: true, kind: '' });
    }
    return out;
  }

  // =====================================================================
  // Big5（用 TextDecoder 建索引）
  // =====================================================================
  let B5 = null;
  /** 建立 Big5 索引：dec[pointer] = 字串（1 或 2 個碼位）或 null；enc：碼位 → pointer。Dec 是 TextDecoder 建構式。 */
  function buildBig5(Dec) {
    if (B5) return B5;
    const D = Dec || (typeof TextDecoder !== 'undefined' ? TextDecoder : null);
    if (!D) throw new Error('no TextDecoder');
    const N = 126 * 157;
    const buf = new Uint8Array(N * 3);
    let k = 0;
    for (let lead = 0x81; lead <= 0xFE; lead++) {
      for (let off = 0; off < 157; off++) {
        const trail = off < 0x3F ? off + 0x40 : off + 0x62;
        buf[k++] = lead; buf[k++] = trail; buf[k++] = 0x0A;
      }
    }
    const parts = new D('big5').decode(buf).split('\n');
    if (parts.length !== N + 1) throw new Error('Big5 index: unexpected length ' + parts.length);
    const dec = new Array(N), enc = new Map(), multi = {};
    for (let p = 0; p < N; p++) {
      const s = parts[p];
      if (!s || s.indexOf('�') >= 0) { dec[p] = null; continue; }
      dec[p] = s;
      const it = items(s);
      if (it.length !== 1) continue;            // 一組位元組對到兩個碼位（例如 Ê̄）：只解碼，不反查
      const cp = it[0].cp;
      (multi[cp] = multi[cp] || []).push(p);
      if (p < B5_EXCL) continue;
      if (!enc.has(cp) || B5_LAST.indexOf(cp) >= 0) enc.set(cp, p);
    }
    B5 = { dec: dec, enc: enc, multi: multi, size: enc.size };
    return B5;
  }
  function big5Ready() { return !!B5; }
  /** 一個碼位的 Big5 位元組；沒有就回傳 null */
  function big5Bytes(cp) {
    if (cp < 0x80) return [cp];
    const t = buildBig5();
    const p = t.enc.get(cp);
    if (p === undefined) return null;
    const lead = Math.floor(p / 157) + 0x81, tr = p % 157;
    return [lead, tr + (tr < 0x3F ? 0x40 : 0x62)];
  }
  /** WHATWG Big5 解碼 */
  function big5Decode(bytes) {
    const t = buildBig5(), out = [];
    let lead = 0, start = 0;
    for (let i = 0; i <= bytes.length; i++) {
      if (i === bytes.length) { if (lead) out.push({ start: start, len: 1, cp: FFFD, ok: false, kind: 'trunc', s: '�' }); break; }
      const b = bytes[i];
      if (lead) {
        const l = lead; lead = 0;
        let ptr = null;
        if ((b >= 0x40 && b <= 0x7E) || (b >= 0xA1 && b <= 0xFE)) ptr = (l - 0x81) * 157 + (b - (b < 0x7F ? 0x40 : 0x62));
        const s = ptr === null ? null : t.dec[ptr];
        if (s) { const it = items(s); out.push({ start: start, len: 2, cp: it[0].cp, ok: true, kind: '', s: s }); continue; }
        if (b < 0x80) { out.push({ start: start, len: 1, cp: FFFD, ok: false, kind: 'trunc', s: '�' }); i--; continue; }
        out.push({ start: start, len: 2, cp: FFFD, ok: false, kind: 'none', s: '�' });
        continue;
      }
      if (b < 0x80) { out.push({ start: i, len: 1, cp: b, ok: true, kind: '', s: String.fromCharCode(b) }); continue; }
      if (b >= 0x81 && b <= 0xFE) { lead = b; start = i; continue; }
      out.push({ start: i, len: 1, cp: FFFD, ok: false, kind: 'badlead', s: '�' });
    }
    return out;
  }

  // =====================================================================
  // Latin-1（windows-1252）
  // =====================================================================
  function latin1Bytes(cp) {
    if (cp < 0x80 || (cp >= 0xA0 && cp <= 0xFF)) return [cp];
    const b = W1252_REV[cp];
    return b === undefined ? null : [b];
  }
  function latin1Decode(bytes) {
    return bytes.map(function (b, i) { return { start: i, len: 1, cp: b >= 0x80 && b <= 0x9F ? W1252[b - 0x80] : b, ok: true, kind: '' }; });
  }

  // =====================================================================
  // 共用：編碼、解碼
  // =====================================================================
  const ENCODINGS = ['utf8', 'big5', 'latin1'];
  /** 用某種編碼存檔：回傳 { bytes, chars: [{ s, cp, start, len, ok }], bad（存不下的字數） } */
  function encode(str, enc) {
    const its = items(str), bytes = [], chars = [];
    let bad = 0;
    its.forEach(function (it) {
      let b;
      if (enc === 'utf8') { b = utf8Bytes(it.cp); if (it.lone) bad++; }
      else if (enc === 'utf16') b = it.lone ? [0xFF, 0xFD] : utf16Bytes(it.cp);
      else {
        b = it.lone ? null : enc === 'big5' ? big5Bytes(it.cp) : latin1Bytes(it.cp);
        if (!b) { b = [0x3F]; bad++; }
      }
      const ok = !(it.lone || (enc !== 'utf8' && enc !== 'utf16' && b.length === 1 && b[0] === 0x3F && it.cp !== 0x3F));
      chars.push({ s: it.s, cp: it.cp, start: bytes.length, len: b.length, ok: ok });
      for (let k = 0; k < b.length; k++) bytes.push(b[k]);
    });
    return { bytes: bytes, chars: chars, bad: bad };
  }
  /** 用某種編碼開檔：回傳 { segs: [{ start, len, cp, ok, kind, s }], text, errors } */
  function decode(bytes, enc) {
    const segs = enc === 'utf8' ? utf8Decode(bytes) : enc === 'big5' ? big5Decode(bytes) : enc === 'utf16' ? utf16Decode(bytes) : latin1Decode(bytes);
    let text = '', errors = 0;
    segs.forEach(function (g) {
      if (g.s === undefined) g.s = fromCp(g.cp);
      text += g.s;
      if (!g.ok) errors++;
    });
    return { segs: segs, text: text, errors: errors };
  }
  /** 錯誤的種類數 */
  function errorKinds(segs) {
    const k = {};
    segs.forEach(function (g) { if (!g.ok) k[g.kind] = (k[g.kind] || 0) + 1; });
    return k;
  }

  // =====================================================================
  // 統計與小工具
  // =====================================================================
  /** 一段文字在三種編碼的位元組數；Big5 有字存不下時 b5 = null、b5bad = 存不下的字數 */
  function sizes(str) {
    const its = items(str);
    let u8 = 0, u16 = 0, b5 = 0, bad = 0;
    its.forEach(function (it) {
      u8 += it.lone ? 3 : utf8Len(it.cp);
      u16 += it.units.length * 2;
      const b = it.lone ? null : big5Bytes(it.cp);
      if (b) b5 += b.length; else bad++;
    });
    return { n: its.length, units: str.length, u8: u8, u16: u16, b5: bad ? null : b5, b5bad: bad };
  }
  /** 「長得一樣、位元組不同」的雙胞胎：文字裡同時有預組字（例如 é）和它的分解寫法（e + U+0301）的組數 */
  function twins(str) {
    if (!str.normalize) return 0;
    const seen = {};
    let n = 0;
    items(str).forEach(function (it) {
      const d = it.s.normalize('NFD');
      if (d !== it.s && d.length > 1 && !seen[it.s] && str.indexOf(d) >= 0) { seen[it.s] = 1; n++; }
    });
    return n;
  }
  /** 兩段文字（字元陣列）從尾端算起相同的字數 */
  function commonSuffix(a, b) {
    const x = items(a), y = items(b);
    let k = 0;
    while (k < x.length && k < y.length && x[x.length - 1 - k].s === y[y.length - 1 - k].s) k++;
    return k;
  }
  /** 讀十六進位位元組：「E4 B8 AD」「e4b8ad」「0xE4,0xB8」都可以；回傳 { bytes } 或 { error } */
  function parseHex(s) {
    const t = String(s).replace(/0x/gi, ' ').replace(/[\s,;:\-]+/g, ' ').trim();
    if (!t) return { bytes: [] };
    if (/[^0-9a-fA-F ]/.test(t)) return { error: 'char' };
    const out = [];
    const parts = t.split(' ');
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.length % 2) {
        if (parts.length > 1 && p.length === 1) { out.push(parseInt(p, 16)); continue; }
        return { error: 'odd' };
      }
      for (let k = 0; k < p.length; k += 2) out.push(parseInt(p.substr(k, 2), 16));
    }
    if (out.length > MAX_BYTES) return { error: 'long' };
    return { bytes: out };
  }
  /** 讀碼位：「U+4E2D」「4e2d」「0x4E2D」；回傳數字或 null（超出 0–10FFFF） */
  function parseCp(s) {
    const t = String(s).trim().replace(/^(U\+|u\+|0x|0X|\\u|\\x)/, '');
    if (!/^[0-9a-fA-F]{1,6}$/.test(t)) return null;
    const v = parseInt(t, 16);
    return v <= 0x10FFFF ? v : null;
  }
  function hexStr(bytes) { return bytes.map(function (b) { return hex(b); }).join(' '); }

  // ---------- 挑戰題 ----------
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
  /** 一題：kind 'enc'（碼位 → UTF-8）或 'dec'（UTF-8 → 碼位）；位元組數 2、3、4 輪流抽 */
  function quizItem(rnd, kind, len) {
    const n = len || 2 + Math.floor(rnd() * 3);
    const lo = [0, 0x80, 0x800, 0x10000][n - 1], hi = [0x7F, 0x7FF, 0xFFFF, 0x10FFFF][n - 1];
    let cp;
    do { cp = lo + Math.floor(rnd() * (hi - lo + 1)); } while (isSurrogate(cp) || cp === 0xFFFE || cp === 0xFFFF);
    return { kind: kind || (rnd() < 0.5 ? 'enc' : 'dec'), cp: cp, bytes: utf8Bytes(cp), n: n };
  }
  /** 檢查答案：enc 要打出位元組（十六進位），dec 要打出碼位 */
  function quizCheck(q, ans) {
    if (q.kind === 'enc') {
      const r = parseHex(ans);
      return !r.error && r.bytes.length === q.bytes.length && r.bytes.every(function (b, i) { return b === q.bytes[i]; });
    }
    const v = parseCp(ans);
    return v === q.cp;
  }

  const api = {
    MAX_CHARS: MAX_CHARS, MAX_BYTES: MAX_BYTES, B5_EXCL: B5_EXCL, B5_LAST: B5_LAST, W1252: W1252, ENCODINGS: ENCODINGS,
    items: items, isSurrogate: isSurrogate, fromCp: fromCp, hex: hex, uplus: uplus, bin: bin,
    utf8Len: utf8Len, utf8Bytes: utf8Bytes, utf8Prefix: utf8Prefix, payloadBits: payloadBits, utf8Decode: utf8Decode, overlongs: overlongs,
    utf16Units: utf16Units, utf16Bytes: utf16Bytes, utf16Decode: utf16Decode,
    buildBig5: buildBig5, big5Ready: big5Ready, big5Bytes: big5Bytes, big5Decode: big5Decode,
    latin1Bytes: latin1Bytes, latin1Decode: latin1Decode,
    encode: encode, decode: decode, errorKinds: errorKinds, sizes: sizes, twins: twins, commonSuffix: commonSuffix,
    parseHex: parseHex, parseCp: parseCp, hexStr: hexStr, rng: rng, quizItem: quizItem, quizCheck: quizCheck
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TextEncCore = api;
})(typeof window !== 'undefined' ? window : this);
