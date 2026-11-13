// 以 Node 執行：node tests/text-encoding-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/text-encoding-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const enc8 = new TextEncoder();
const dec8 = new TextDecoder('utf-8', { ignoreBOM: true });
const H = s => Array.from(Buffer.from(s.replace(/\s+/g, ''), 'hex'));
const str8 = bytes => C.decode(bytes, 'utf8').text;
const rnd = C.rng(20261113);

console.log('字元與碼位');
test('items：代理對合成一個碼位，孤立代理自成一項', () => {
  const it = C.items('A中😀\uD83D!\uDE00');
  assert.deepStrictEqual(it.map(x => x.cp), [0x41, 0x4E2D, 0x1F600, 0xD83D, 0x21, 0xDE00]);
  assert.deepStrictEqual(it.map(x => x.lone), [false, false, false, true, false, true]);
  assert.deepStrictEqual(it[2].units, [0xD83D, 0xDE00]);
  assert.strictEqual(C.fromCp(0x1F600), '😀');
  assert.strictEqual(C.items('\uD83D' + '\uDE00').length, 1);   // 兩半靠在一起就是一個字
});

console.log('UTF-8 編碼（與 TextEncoder 比對）');
test('邊界 U+007F／0080／07FF／0800／FFFF／10000／10FFFF 的位元組與長度', () => {
  const want = { 0x7F: '7F', 0x80: 'C2 80', 0x7FF: 'DF BF', 0x800: 'E0 A0 80', 0xFFFF: 'EF BF BF', 0x10000: 'F0 90 80 80', 0x10FFFF: 'F4 8F BF BF' };
  Object.keys(want).forEach(k => {
    const cp = +k;
    assert.strictEqual(C.hexStr(C.utf8Bytes(cp)), want[k], C.uplus(cp));
    assert.deepStrictEqual(C.utf8Bytes(cp), Array.from(enc8.encode(C.fromCp(cp))), C.uplus(cp));
    assert.strictEqual(C.utf8Len(cp), want[k].split(' ').length);
  });
});
test('全部 1 114 112 個碼位（代理除外）都和 TextEncoder 一致，且解得回來', () => {
  let n = 0;
  for (let cp = 0; cp <= 0x10FFFF; cp++) {
    if (C.isSurrogate(cp)) continue;
    const a = C.utf8Bytes(cp);
    if (cp % 97 === 0 || cp < 0x900 || cp > 0x10F000) {
      const b = enc8.encode(C.fromCp(cp));
      assert.strictEqual(a.length, b.length, C.uplus(cp));
      for (let i = 0; i < a.length; i++) assert.strictEqual(a[i], b[i], C.uplus(cp));
    }
    const d = C.utf8Decode(a);
    assert.ok(d.length === 1 && d[0].ok && d[0].cp === cp, C.uplus(cp));
    n++;
  }
  assert.strictEqual(n, 0x110000 - 0x800);
});
test('孤立代理：和 TextEncoder 一樣寫成 EF BF BD（U+FFFD）', () => {
  ['\uD800', '\uDBFF', '\uDC00', '\uDFFF', 'a\uD83Db', '\uDE00\uD83D'].forEach(s => {
    assert.deepStrictEqual(C.encode(s, 'utf8').bytes, Array.from(enc8.encode(s)), JSON.stringify(s));
  });
  const e = C.encode('x\uD83D', 'utf8');
  assert.strictEqual(e.bad, 1);
  assert.strictEqual(C.decode(e.bytes, 'utf8').text, 'x�');
});
test('前綴：1 位元組 0xxxxxxx；n 位元組的開頭 n 個 1 再一個 0；延續位元組 10xxxxxx', () => {
  for (let n = 1; n <= 4; n++) {
    const cp = [0x41, 0x3A9, 0x4E2D, 0x1F600][n - 1], b = C.utf8Bytes(cp);
    assert.strictEqual(b.length, n);
    b.forEach((x, k) => {
      const p = C.utf8Prefix(n, k), s = C.bin(x, 8).slice(0, p);
      assert.strictEqual(s, n === 1 ? '0' : k === 0 ? '1'.repeat(n) + '0' : '10');
    });
    // 有效位元數 = 8n − 前綴位元數總和
    const sum = b.reduce((a, x, k) => a + 8 - C.utf8Prefix(n, k), 0);
    assert.strictEqual(sum, C.payloadBits(n));
  }
});

console.log('UTF-8 解碼（與 TextDecoder 比對，含不合法序列）');
test('不合法序列的種類與 U+FFFD 個數', () => {
  const cases = [
    ['C0 AF', ['overlong', 'orphan']],
    ['C1 BF', ['overlong', 'orphan']],
    ['E0 80 AF', ['overlong', 'orphan', 'orphan']],
    ['F0 80 80 AF', ['overlong', 'orphan', 'orphan', 'orphan']],
    ['80', ['orphan']],
    ['BF 80', ['orphan', 'orphan']],
    ['E4 B8', ['trunc']],
    ['E4 B8 41', ['trunc', '']],
    ['ED A0 80', ['surrogate', 'orphan', 'orphan']],
    ['F4 90 80 80', ['range', 'orphan', 'orphan', 'orphan']],
    ['F5 80', ['range', 'orphan']],
    ['FF', ['range']],
    ['E4 B8 AD', ['']]
  ];
  cases.forEach(([h, kinds]) => {
    const b = H(h), seg = C.utf8Decode(b);
    assert.deepStrictEqual(seg.map(g => g.kind), kinds, h);
    assert.strictEqual(str8(b), dec8.decode(Uint8Array.from(b)), h);
  });
});
test('20 萬串隨機位元組（偏重容易出錯的值）的解碼結果與 TextDecoder 完全一樣', () => {
  const pool = [0x00, 0x2F, 0x41, 0x7F, 0x80, 0x8F, 0x90, 0x9F, 0xA0, 0xAE, 0xBF, 0xC0, 0xC1, 0xC2, 0xDF, 0xE0, 0xE4, 0xED, 0xEE, 0xEF, 0xF0, 0xF3, 0xF4, 0xF5, 0xFE, 0xFF];
  for (let t = 0; t < 200000; t++) {
    const len = 1 + Math.floor(rnd() * 10), b = [];
    for (let i = 0; i < len; i++) b.push(rnd() < 0.7 ? pool[Math.floor(rnd() * pool.length)] : Math.floor(rnd() * 256));
    const want = dec8.decode(Uint8Array.from(b));
    const got = C.utf8Decode(b);
    assert.strictEqual(got.map(g => C.fromCp(g.cp)).join(''), want, C.hexStr(b));
    // 每一段剛好接續、蓋滿全部位元組
    let p = 0;
    got.forEach(g => { assert.strictEqual(g.start, p); p += g.len; });
    assert.strictEqual(p, b.length);
  }
});
test('過長編碼：寬鬆的解碼器會把 C0 AE 讀成「.」——RFC 3629 第 10 節的例子 2F C0 AE 2E 2F', () => {
  const b = H('2F C0 AE 2E 2F');
  assert.deepStrictEqual(C.overlongs(b), [{ start: 1, len: 2, cp: 0x2E }]);
  assert.strictEqual(str8(b), '/��./');
  assert.deepStrictEqual(C.overlongs(H('C0 80')).map(o => o.cp), [0]);
  assert.deepStrictEqual(C.overlongs(H('E0 80 AF F0 80 80 AF')).map(o => o.cp), [0x2F, 0x2F]);
  assert.deepStrictEqual(C.overlongs(H('E4 B8 AD C2 80')), []);
});
test('UTF-8 會自我同步：從中間切開，只壞掉被切到的那一個字', () => {
  const b = C.encode('資訊科技', 'utf8').bytes.slice(1);
  const d = C.decode(b, 'utf8');
  assert.strictEqual(d.text, '��訊科技');
  assert.strictEqual(C.commonSuffix(d.text, '資訊科技'), 3);
});

console.log('UTF-16（大端序）');
test('BMP 一個碼元；補充平面拆成一對代理，與 JavaScript 字串的碼元相同', () => {
  [0x41, 0x7FF, 0xFFFF, 0x10000, 0x1F600, 0x10FFFF].forEach(cp => {
    const s = C.fromCp(cp), u = C.utf16Units(cp);
    assert.deepStrictEqual(u, Array.from({ length: s.length }, (_, i) => s.charCodeAt(i)));
  });
  assert.deepStrictEqual(C.utf16Units(0x1F600), [0xD83D, 0xDE00]);
  assert.deepStrictEqual(C.utf16Units(0x10000), [0xD800, 0xDC00]);
  assert.deepStrictEqual(C.utf16Units(0x10FFFF), [0xDBFF, 0xDFFF]);
  const s = 'A中😀';
  assert.strictEqual(C.decode(C.encode(s, 'utf16').bytes, 'utf16').text, s);
  assert.strictEqual(C.hexStr(C.encode(s, 'utf16').bytes), '00 41 4E 2D D8 3D DE 00');
  const be = new TextDecoder('utf-16be');
  assert.strictEqual(be.decode(Uint8Array.from(C.encode(s, 'utf16').bytes)), s);
});

console.log('Big5（WHATWG，用 TextDecoder 建索引）');
const B5 = C.buildBig5(TextDecoder);
const decB5 = new TextDecoder('big5');
// 瀏覽器（Chromium、Firefox）的 TextDecoder('big5') 照 WHATWG；Node 內建的 ICU 版本不完全一樣（例如 80、FF 會被當成字、香港增補區的對照不同）。
// 判斷方法：WHATWG 的 pointer 1133（88 62）是兩個碼位 U+00CA U+0304。
const WHATWG = decB5.decode(Uint8Array.of(0x88, 0x62)) === 'Ê̄';
if (!WHATWG) console.log('      （這個 Node 的 Big5 解碼器不是 WHATWG 版本：隨機比對時避開 80、FF 這兩個位元組；瀏覽器裡的完整比對見交件單）');
test('索引：19 782 個 pointer；可反查的字數；同一個字對到多組位元組的字有多少', () => {
  assert.strictEqual(B5.dec.length, 126 * 157);
  const filled = B5.dec.filter(Boolean).length;
  const dup = Object.keys(B5.multi).filter(k => B5.multi[k].length > 1).length;
  console.log('      索引有字的 pointer ' + filled + ' 個，可以編碼的字 ' + B5.enc.size + ' 個，對到兩組以上位元組的字 ' + dup + ' 個');
  assert.ok(filled > 18000 && B5.enc.size > 13000);
});
test('常用字：中 = A4 A4、文 = A4 E5、許 = B3 5C、功 = A5 5C、蓋 = BB 5C（第二個位元組 5C 就是反斜線「\\」）', () => {
  assert.strictEqual(C.hexStr(C.big5Bytes('中'.codePointAt(0))), 'A4 A4');
  assert.strictEqual(C.hexStr(C.big5Bytes('文'.codePointAt(0))), 'A4 E5');
  assert.strictEqual(C.hexStr(C.big5Bytes('許'.codePointAt(0))), 'B3 5C');
  assert.strictEqual(C.hexStr(C.big5Bytes('功'.codePointAt(0))), 'A5 5C');
  assert.strictEqual(C.hexStr(C.big5Bytes('蓋'.codePointAt(0))), 'BB 5C');
  assert.strictEqual(String.fromCharCode(0x5C), '\\');
});
test('每一個可編碼的字都解得回來（來回一致），而且寫出的 pointer 不在香港增補區', () => {
  B5.enc.forEach((p, cp) => {
    const b = C.big5Bytes(cp);
    assert.ok(p >= C.B5_EXCL);
    assert.strictEqual(decB5.decode(Uint8Array.from(b)), C.fromCp(cp), C.uplus(cp));
    const d = C.big5Decode(b);
    assert.ok(d.length === 1 && d[0].ok && d[0].cp === cp);
  });
});
test('同一個字對到多組位元組：一般取第一組，U+2550 等六個字取最後一組（WHATWG index Big5 pointer）', () => {
  C.B5_LAST.forEach(cp => {
    const list = B5.multi[cp].filter(p => p >= C.B5_EXCL);
    assert.strictEqual(B5.enc.get(cp), list[list.length - 1], C.uplus(cp));
  });
  let checked = 0;
  Object.keys(B5.multi).forEach(k => {
    const cp = +k, list = B5.multi[k].filter(p => p >= C.B5_EXCL);
    if (!list.length || C.B5_LAST.indexOf(cp) >= 0) return;
    assert.strictEqual(B5.enc.get(cp), list[0]);
    checked++;
  });
  assert.ok(checked > 13000);
});
test('20 萬串隨機位元組的 Big5 解碼與 TextDecoder 完全一樣（含不合法、第二個位元組是 ASCII 的情況）', () => {
  for (let t = 0; t < 200000; t++) {
    const len = 1 + Math.floor(rnd() * 8), b = [];
    for (let i = 0; i < len; i++) {
      const u = rnd();
      b.push(u < 0.25 ? 0x40 + Math.floor(rnd() * 0x3F) : u < 0.3 ? (WHATWG ? [0x80, 0xFF, 0x7F, 0x30] : [0x7F, 0x30, 0x0A, 0x41])[Math.floor(rnd() * 4)] : 0x81 + Math.floor(rnd() * 0x7E));
    }
    const got = C.decode(b, 'big5');
    assert.strictEqual(got.text, decB5.decode(Uint8Array.from(b)), C.hexStr(b));
    let p = 0;
    got.segs.forEach(g => { assert.strictEqual(g.start, p); p += g.len; });
    assert.strictEqual(p, b.length);
  }
});
test('Big5 沒有的字：表情符號、é（香港增補區有，但編碼時排除）', () => {
  assert.strictEqual(C.big5Bytes(0x1F600), null);
  assert.strictEqual(C.big5Bytes(0xE9), null);
  const e = C.encode('中😀', 'big5');
  assert.strictEqual(C.hexStr(e.bytes), 'A4 A4 3F');
  assert.strictEqual(e.bad, 1);
  assert.strictEqual(C.sizes('中😀').b5, null);
});

console.log('Latin-1（windows-1252）');
test('256 個位元組都和 TextDecoder("windows-1252") 一樣，而且寫得回同一個位元組', () => {
  const w = new TextDecoder('windows-1252');
  for (let b = 0; b < 256; b++) {
    const s = C.decode([b], 'latin1').text;
    assert.strictEqual(s, w.decode(Uint8Array.of(b)), 'byte ' + C.hex(b));
    assert.deepStrictEqual(C.encode(s, 'latin1').bytes, [b]);
  }
  assert.strictEqual(new TextDecoder('iso-8859-1').encoding, 'windows-1252');
});

console.log('亂碼與救回');
test('café 用 UTF-8 存、Latin-1 開 → cafÃ©；再用 Latin-1 存、UTF-8 開就救回來', () => {
  const b = C.encode('café', 'utf8').bytes;
  const g = C.decode(b, 'latin1').text;
  assert.strictEqual(g, 'cafÃ©');
  assert.strictEqual(C.decode(C.encode(g, 'latin1').bytes, 'utf8').text, 'café');
  // 兩層亂碼也能一層一層剝回來
  const g2 = C.decode(C.encode(g, 'utf8').bytes, 'latin1').text;
  assert.strictEqual(g2, 'cafÃƒÂ©');
  const back1 = C.decode(C.encode(g2, 'latin1').bytes, 'utf8').text;
  assert.strictEqual(back1, g);
});
test('BOM：EF BB BF 當 Latin-1 讀成「ï»¿」', () => {
  assert.strictEqual(C.decode(C.encode('﻿Hi', 'utf8').bytes, 'latin1').text, 'ï»¿Hi');
});
test('Big5 文字用 UTF-8 開：變成 U+FFFD，資訊就丟了；再存成 UTF-8 用 Big5 開，兩個 U+FFFD 讀成「嚙踝蕭」', () => {
  const b = C.encode('資訊科技', 'big5').bytes;
  const d = C.decode(b, 'utf8');
  assert.ok(d.errors >= 4 && !/[一-鿿]/.test(d.text), JSON.stringify(d.text));
  const again = C.decode(C.encode('��', 'utf8').bytes, 'big5').text;
  assert.strictEqual(again, '嚙踝蕭');
  // 對照：同樣六個位元組用 GBK 讀就是「锟斤拷」；0xCC 0xCC 用 GBK 讀是「烫」（Big5 則是「昍」）
  assert.strictEqual(new TextDecoder('gbk').decode(Uint8Array.from(H('EF BF BD EF BF BD'))), '锟斤拷');
  assert.strictEqual(new TextDecoder('gbk').decode(Uint8Array.from(H('CC CC'))), '烫');
  assert.strictEqual(C.decode(H('CC CC'), 'big5').text, '昍');
});
test('Big5 從中間切開：第二個位元組都在 A1–FE 時，後面的字全部錯位；碰到落在 ASCII 範圍的第二個位元組才碰巧對回來', () => {
  const t = '中文資料';
  assert.ok(C.encode(t, 'big5').bytes.every((x, i) => i % 2 === 0 || x >= 0xA1));
  const d = C.decode(C.encode(t, 'big5').bytes.slice(1), 'big5');
  assert.strictEqual(C.commonSuffix(d.text, t), 0);
  const e = C.decode(C.encode('資訊科技', 'big5').bytes.slice(1), 'big5');   // 訊 = B0 54，54 是「T」
  assert.strictEqual(e.text, '穈T科技');
});

console.log('統計與輸入');
test('sizes：三種編碼的位元組數；希臘字母三種都一樣長', () => {
  assert.deepStrictEqual(C.sizes('Hi中'), { n: 3, units: 3, u8: 5, u16: 6, b5: 4, b5bad: 0 });
  assert.deepStrictEqual(C.sizes('😀'), { n: 1, units: 2, u8: 4, u16: 4, b5: null, b5bad: 1 });
  const g = C.sizes('αβγδ');
  assert.ok(g.u8 === 8 && g.u16 === 8 && g.b5 === 8);
});
test('twins：é（U+00E9）與 e + U+0301 長得一樣、位元組不同', () => {
  assert.strictEqual(C.twins('é é'), 1);
  assert.strictEqual(C.twins('éé'), 0);
  assert.notDeepStrictEqual(C.encode('é', 'utf8').bytes, C.encode('é', 'utf8').bytes);
});
test('parseHex、parseCp', () => {
  assert.deepStrictEqual(C.parseHex('E4 B8 AD').bytes, [0xE4, 0xB8, 0xAD]);
  assert.deepStrictEqual(C.parseHex('e4b8ad').bytes, [0xE4, 0xB8, 0xAD]);
  assert.deepStrictEqual(C.parseHex('0xE4,0xB8').bytes, [0xE4, 0xB8]);
  assert.deepStrictEqual(C.parseHex('A 0B').bytes, [0x0A, 0x0B]);
  assert.strictEqual(C.parseHex('E4B').error, 'odd');
  assert.strictEqual(C.parseHex('ZZ').error, 'char');
  assert.strictEqual(C.parseHex('00 '.repeat(201)).error, 'long');
  assert.strictEqual(C.parseCp('U+4E2D'), 0x4E2D);
  assert.strictEqual(C.parseCp('10ffff'), 0x10FFFF);
  assert.strictEqual(C.parseCp('110000'), null);
  assert.strictEqual(C.parseCp('xyz'), null);
});
test('挑戰題：題目的位元組數是 2–4、答案檢查正確', () => {
  const r = C.rng(7);
  for (let i = 0; i < 2000; i++) {
    const q = C.quizItem(r);
    assert.ok(q.n >= 2 && q.n <= 4 && C.utf8Len(q.cp) === q.n && !C.isSurrogate(q.cp));
    assert.ok(C.quizCheck(Object.assign({}, q, { kind: 'enc' }), C.hexStr(q.bytes)));
    assert.ok(C.quizCheck(Object.assign({}, q, { kind: 'dec' }), C.uplus(q.cp)));
    assert.ok(!C.quizCheck(Object.assign({}, q, { kind: 'dec' }), C.uplus(q.cp + 1)));
  }
});

console.log(process.exitCode ? '\n有測試失敗。' : '\n全部 ' + passed + ' 項測試通過。');
