// 以 Node 執行：node tests/cryptography-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/cryptography-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const ALL_TEXTS = [].concat(C.SAMPLES, C.MYST_SHORT, C.MYST_LONG);
const big = BigInt;
function powBig(b, e, m) { let B = big(b) % big(m), E = big(e), M = big(m), R = 1n; while (E > 0n) { if (E & 1n) R = R * B % M; B = B * B % M; E >>= 1n; } return Number(R); }

console.log('英文字母頻率表（Lewand 2000）');
test('26 個字母、加總 100%（四捨五入誤差 0.01 以內）、由多到少是 ETAOINSHRDLCUMWFGYPBVKJXQZ', () => {
  assert.strictEqual(C.FREQ_EN.length, 26);
  const s = C.FREQ_EN.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s - 100) < 0.01, 'sum ' + s);
  const order = C.FREQ_EN.map((f, i) => [f, String.fromCharCode(65 + i)]).sort((a, b) => b[0] - a[0]).map(x => x[1]).join('');
  assert.strictEqual(order, 'ETAOINSHRDLCUMWFGYPBVKJXQZ');
});
test('英文的重合指數 Σp² ≈ 0.0655，完全隨機是 1/26 ≈ 0.0385', () => {
  assert.ok(Math.abs(C.IC_EN - 0.0655) < 0.0005, String(C.IC_EN));
  assert.ok(Math.abs(C.IC_RANDOM - 1 / 26) < 1e-12);
});

console.log('凱撒（位移）密碼');
test('每個位移 k：先加密再解密回到原文；大小寫、空白、標點、中文都保留', () => {
  const s = 'Hello, World! 你好 123 Zz-Aa';
  for (let k = 0; k < 26; k++) {
    const c = C.caesarApply(s, k, 'enc');
    assert.strictEqual(C.caesarApply(c, k, 'dec'), s);
    assert.strictEqual(c.replace(/[A-Za-z]/g, '*'), s.replace(/[A-Za-z]/g, '*'));
    assert.strictEqual(C.caesar(s, k + 26), c);
    assert.strictEqual(C.caesarApply(s, 26 - k, 'dec'), c, '加密 k = 解密 26 − k');
  }
});
test('已知例子：凱撒自己的位移 3（Veni vidi vici → Yhql ylgl ylfl）、HAL 位移 1 → IBM', () => {
  assert.strictEqual(C.caesar('Veni, vidi, vici', 3), 'Yhql, ylgl, ylfl');
  assert.strictEqual(C.caesar('HAL', 1), 'IBM');
  assert.strictEqual(C.caesar('XYZ', 3), 'ABC');
});
test('ROT13 加密兩次回到原文；只有 k = 0 與 k = 13 是自己的反運算', () => {
  for (const s of ALL_TEXTS) assert.strictEqual(C.caesar(C.caesar(s, 13), 13), s);
  const self = [];
  for (let k = 0; k < 26; k++) if (C.caesar(C.caesar('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k), k) === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') self.push(k);
  assert.deepStrictEqual(self, [0, 13]);
});
test('兩次位移 k1、k2 加密回到原文 ⇔ k1 + k2 是 26 的倍數', () => {
  for (let a = 0; a < 26; a++) for (let b = 0; b < 26; b++) {
    const back = C.caesar(C.caesar(C.DEFAULT_TEXT, a), b) === C.DEFAULT_TEXT;
    assert.strictEqual(back, (a + b) % 26 === 0, a + ',' + b);
  }
});

console.log('頻率分析');
test('每一段範例與神祕密文，在 26 種位移下 χ² 最小的位移都是正確答案', () => {
  ALL_TEXTS.forEach((s, i) => {
    for (let k = 0; k < 26; k++) assert.strictEqual(C.bestShift(C.counts(C.caesar(s, k))), k, 'text ' + i + ' k ' + k);
  });
});
test('χ² 的定義：和英文頻率完全一樣的計數 χ² = 0；位移後的計數在對應位移 χ² = 0', () => {
  const N = 100000, cnt = { c: C.P_EN.map(p => N * p), n: N };
  assert.ok(C.chiSquared(cnt, 0) < 1e-9);
  const sh = { c: cnt.c.map((_, i) => cnt.c[(i - 7 + 26) % 26]), n: N };
  assert.ok(C.chiSquared(sh, 7) < 1e-9);
  assert.strictEqual(C.bestShift(sh), 7);
  assert.ok(Number.isNaN(C.chiSquared(C.counts('123 !?'), 0)));
});
test('不用字母 E 寫的文章（像 1939 年的小說 Gadsby），χ² 仍然在每個位移都找得到答案', () => {
  const s = 'A big brown dog ran away from his family and sat in a sunny spot by a pond. A small girl saw him, sang a soft song, and his tail was wagging as both of us got back to our cozy farm.';
  assert.ok(!/e/i.test(s));
  for (let k = 0; k < 26; k++) assert.strictEqual(C.bestShift(C.counts(C.caesar(s, k))), k);
});
test('重合指數（IC）不受凱撒位移影響；IC 的定義與手算一致', () => {
  for (const s of ALL_TEXTS) {
    const ic0 = C.iocText(s);
    for (let k = 1; k < 26; k += 5) assert.ok(Math.abs(C.iocText(C.caesar(s, k)) - ic0) < 1e-12);
  }
  assert.ok(Math.abs(C.iocText('AABB') - (2 + 2) / 12) < 1e-12);   // Σ n(n−1) = 2 + 2，N(N−1) = 12
  assert.ok(Number.isNaN(C.iocText('A')));
});
test('最常見的字母、字數', () => {
  assert.strictEqual(C.topLetter(C.counts('zzz aa b')), 25);
  assert.strictEqual(C.topLetter(C.counts('')), -1);
  assert.strictEqual(C.words('Hello,  big world 123 !'), 3);
});

console.log('維吉尼亞密碼');
test('先加密再解密回到原文；只有字母會用掉金鑰（空白、標點不算）', () => {
  for (const s of ALL_TEXTS) for (const key of C.MYST_KEYS) assert.strictEqual(C.vigenere(C.vigenere(s, key, 'enc'), key, 'dec'), s);
  assert.strictEqual(C.vigenere('AB, C!', 'BC', 'enc'), 'BD, D!');
  assert.strictEqual(C.vigenere('abc', 'b', 'enc'), 'bcd');
});
test('金鑰只有一個字母時，就是位移等於那個字母的凱撒密碼；金鑰 A 不改變文字', () => {
  for (let k = 0; k < 26; k++) {
    const key = String.fromCharCode(65 + k);
    for (const s of C.SAMPLES) {
      assert.strictEqual(C.vigenere(s, key, 'enc'), C.caesar(s, k));
      assert.strictEqual(C.vigenere(s, key, 'dec'), C.caesar(s, -k));
    }
  }
  assert.strictEqual(C.vigenere(C.DEFAULT_TEXT, 'AAAA', 'enc'), C.DEFAULT_TEXT);
});
test('把金鑰重複兩次（KEY → KEYKEY），加密結果完全一樣', () => {
  for (const key of C.MYST_KEYS) for (const s of C.MYST_LONG) assert.strictEqual(C.vigenere(s, key + key, 'enc'), C.vigenere(s, key, 'enc'));
});
test('猜金鑰長度：每段神祕長文 × 每把金鑰，真正長度的平均 IC ≥ 0.06，比它短的長度都 < 0.058', () => {
  C.MYST_LONG.forEach((s, i) => C.MYST_KEYS.forEach(key => {
    const ct = C.lettersOnly(C.vigenere(s, key, 'enc'));
    const prof = C.iocProfile(ct, C.MAX_L);
    assert.ok(prof[key.length - 1] >= 0.06, 'text ' + i + ' ' + key + ' ' + prof[key.length - 1]);
    for (let L = 1; L < key.length; L++) assert.ok(prof[L - 1] < 0.058, 'text ' + i + ' ' + key + ' L=' + L + ' ' + prof[L - 1]);
  }));
});
test('每一欄做頻率分析（χ² 最小）就能完整找回每一把金鑰', () => {
  C.MYST_LONG.forEach((s, i) => C.MYST_KEYS.forEach(key => {
    const ct = C.lettersOnly(C.vigenere(s, key, 'enc'));
    assert.strictEqual(C.keyFromShifts(C.recoverKey(ct, key.length)), key, 'text ' + i);
  }));
});
test('金鑰和訊息一樣長、隨機、不重複（一次性密碼本）：任何猜的長度，平均 IC 都接近隨機（< 0.05）', () => {
  const r = C.rng(2026);
  C.MYST_LONG.forEach(s => {
    const n = C.lettersOnly(s).length;
    let key = '';
    for (let i = 0; i < n; i++) key += String.fromCharCode(65 + Math.floor(r() * 26));
    const ct = C.lettersOnly(C.vigenere(s, key, 'enc'));
    C.iocProfile(ct, C.MAX_L).forEach((v, L) => assert.ok(v < 0.05, 'L=' + (L + 1) + ' ' + v));
  });
});
test('最短週期、同一個明文字母變成幾種密文字母', () => {
  assert.strictEqual(C.minPeriod('ABCABCAB'), 3);
  assert.strictEqual(C.minPeriod('ABCD'), 4);
  assert.strictEqual(C.minPeriod('AAAA'), 1);
  assert.strictEqual(C.polyMax('EEEE', 'EEEE'), 1);
  assert.strictEqual(C.polyMax('EEEE', C.vigenere('EEEE', 'ABC', 'enc')), 3);
  assert.strictEqual(C.polyMax(C.DEFAULT_TEXT, C.caesar(C.DEFAULT_TEXT, 5)), 1, '凱撒：一個字母永遠只變成一種');
});

console.log('玩具 RSA');
const PAIRS = [];
C.PRIMES.forEach((p, i) => C.PRIMES.forEach((q, j) => { if (j > i) PAIRS.push([p, q]); }));
test('質數表：3 到 97 的 24 個質數，n 最大 89 × 97 = 8633 < 2^26（乘法不會失去精度）', () => {
  assert.strictEqual(C.PRIMES.length, 24);
  C.PRIMES.forEach(p => assert.ok(C.isPrime(p)));
  for (let v = 3; v < 100; v++) assert.strictEqual(C.PRIMES.indexOf(v) >= 0, C.isPrime(v), String(v));
  const nmax = Math.max(...PAIRS.map(x => x[0] * x[1]));
  assert.strictEqual(nmax, 8633);
  assert.ok((nmax - 1) * (nmax - 1) < Number.MAX_SAFE_INTEGER && nmax < C.SAFE_MOD);
});
test('每一組 p ≠ q、每一個和 φ(n) 互質的 e：d·e ≡ 1 (mod φ(n))，而且 0 < d < φ(n)', () => {
  let cnt = 0;
  PAIRS.forEach(([p, q]) => {
    const phi = (p - 1) * (q - 1);
    for (let e = 3; e < phi; e++) {
      const k = C.rsaKey(p, q, e);
      if (C.gcd(e, phi) !== 1) { assert.ok(!k.ok && k.reason === 'gcd'); continue; }
      assert.ok(k.ok && k.d > 0 && k.d < phi && (k.d * e) % phi === 1, p + ' ' + q + ' ' + e);
      cnt++;
    }
  });
  assert.ok(cnt > 100000);
});
test('解密一定還原：每一組 p、q（276 組）× 多個 e，所有 0 ≤ M < n 都有 (M^e)^d ≡ M (mod n)', () => {
  const r = C.rng(1978);
  let checks = 0;
  PAIRS.forEach(([p, q]) => {
    const n = p * q, phi = (p - 1) * (q - 1);
    const es = [];
    for (let e = 3; e < phi && es.length < 3; e++) if (C.gcd(e, phi) === 1) es.push(e);
    if (17 < phi && C.gcd(17, phi) === 1) es.push(17);
    es.push(phi - 1);
    for (let t = 0; t < 2; t++) { let e = 3 + Math.floor(r() * (phi - 4)); while (C.gcd(e, phi) !== 1) e++; if (e < phi) es.push(e); }
    es.forEach(e => {
      const d = C.rsaKey(p, q, e).d;
      for (let M = 0; M < n; M++) {
        const c = C.modPow(M, e, n);
        if (C.modPow(c, d, n) !== M) throw new Error(`p=${p} q=${q} e=${e} M=${M}`);
        checks++;
      }
    });
  });
  assert.ok(checks > 3000000, String(checks));
});
test('平方再乘（Number）和 BigInt 的結果完全相同；模數超過 2^26 自動改用 BigInt', () => {
  const r = C.rng(7);
  for (let i = 0; i < 20000; i++) {
    const m = 2 + Math.floor(r() * 8632), b = Math.floor(r() * m), e = 1 + Math.floor(r() * 100000);
    assert.strictEqual(C.modPow(b, e, m), powBig(b, e, m));
  }
  const m = 1000000007;
  assert.strictEqual(C.modPow(123456789, 987654321, m), powBig(123456789, 987654321, m));
  assert.strictEqual(C.modPow(5, 0, 7), 1);
  const st = {}; C.modPow(920, 17, 2773, st);
  assert.deepStrictEqual([st.sq, st.mul], [4, 2], '17 = 10001（二）：平方 4 次、乘 2 次');
});
test('1978 年 RSA 原始論文的例子：p = 47、q = 59、e = 17 → d = 157；「IT」= 0920 加密成 948', () => {
  const k = C.rsaKey(47, 59, 17);
  assert.deepStrictEqual([k.n, k.phi, k.d], [2773, 2668, 157]);
  assert.strictEqual(C.modPow(920, 17, 2773), 948);
  assert.strictEqual(C.modPow(948, 157, 2773), 920);
  assert.strictEqual(C.paperBlock(920), 'IT');
  const msg = 'ITS ALL GREEK TO ME', blocks = [];
  const code = ch => ch === ' ' ? 0 : ch.charCodeAt(0) - 64;
  for (let i = 0; i < msg.length; i += 2) blocks.push(String(code(msg[i]) * 100 + (i + 1 < msg.length ? code(msg[i + 1]) : 0)).padStart(4, '0'));
  assert.strictEqual(blocks.join(' '), '0920 1900 0112 1200 0718 0505 1100 2015 0013 0500');
  blocks.forEach(b => assert.strictEqual(C.paperBlock(+b).replace(/ /g, '_').length, 2));
  assert.strictEqual(C.paperBlock(2627), null);
  assert.strictEqual(C.paperBlock(1930), null);
});
test('不動點（加密後不變的訊息）個數 = (1 + gcd(e − 1, p − 1))(1 + gcd(e − 1, q − 1))，與暴力數相同', () => {
  PAIRS.filter(([p, q]) => p * q < 2500).forEach(([p, q]) => {
    const n = p * q, phi = (p - 1) * (q - 1);
    [3, 5, 7, 17, phi - 1].filter(e => e < phi && C.gcd(e, phi) === 1).forEach(e => {
      let k = 0;
      for (let M = 0; M < n; M++) if (C.modPow(M, e, n) === M) k++;
      assert.strictEqual(k, C.fixedCount(p, q, e), `p=${p} q=${q} e=${e}`);
    });
  });
});
test('e 是 φ(n) − 1 時 d = e（公鑰就是私鑰）；φ(n) 整除 24 時每一個 e 都有 d = e', () => {
  PAIRS.forEach(([p, q]) => { const phi = (p - 1) * (q - 1); assert.strictEqual(C.rsaKey(p, q, phi - 1).d, phi - 1); });
  [[3, 5], [3, 7], [5, 7], [3, 13]].forEach(([p, q]) => {
    const phi = (p - 1) * (q - 1);
    assert.strictEqual(24 % phi, 0);
    for (let e = 3; e < phi; e++) if (C.gcd(e, phi) === 1) assert.strictEqual(C.rsaKey(p, q, e).d, e);
  });
  assert.strictEqual(C.rsaKey(31, 37, 161).d, 161, '161² = 25921 = 24 × 1080 + 1');
});
test('竊聽者的試除法：每一組都分解回 p × q，試除的次數 = 較小的質數 − 1', () => {
  PAIRS.forEach(([p, q]) => {
    const f = C.factor(p * q);
    assert.deepStrictEqual([f.p, f.q], [p, q]);
    assert.strictEqual(f.steps, p - 1);
  });
});
test('金鑰的錯誤情況：p = q、e 和 φ(n) 不互質、e 超出範圍；下一個可用的 e', () => {
  assert.strictEqual(C.rsaKey(11, 11, 3).reason, 'same');
  assert.strictEqual(C.rsaKey(11, 13, 4).reason, 'gcd');
  assert.strictEqual(C.rsaKey(11, 13, 4).g, 4);
  assert.strictEqual(C.rsaKey(11, 13, 120).reason, 'range');
  assert.strictEqual(C.rsaKey(9, 13, 5).reason, 'notprime');
  PAIRS.forEach(([p, q]) => {
    const phi = (p - 1) * (q - 1);
    [3, 4, 10, phi - 2, phi - 1].forEach(e => { const n = C.nextValidE(e, phi); assert.ok(n > 1 && n < phi && C.gcd(n, phi) === 1, `${p} ${q} ${e} → ${n}`); });
  });
  assert.strictEqual(C.nextValidE(3, 120), 7);
});
test('整數方根：⌊x^(1/k)⌋', () => {
  for (let x = 1; x < 9000; x++) { const r = C.iroot(x, 3); assert.ok(r * r * r <= x && (r + 1) * (r + 1) * (r + 1) > x, String(x)); }
  assert.strictEqual(C.iroot(1926, 3), 12);
  assert.strictEqual(C.iroot(8632, 5), 6);
});

console.log('神祕密文與任務事件');
test('神祕密文：同一個種子出同樣的題目，不會連續出同一段，解密回到原文', () => {
  const r1 = C.rng(5), r2 = C.rng(5), r3 = C.rng(6);
  let prevC = -1, prevV = -1;
  for (let i = 0; i < 300; i++) {
    const a = C.makeCaesarMystery(r1, prevC), b = C.makeCaesarMystery(r2, prevC);
    assert.deepStrictEqual(a, b);
    assert.notStrictEqual(a.idx, prevC);
    assert.ok(a.k >= 1 && a.k <= 25);
    assert.strictEqual(C.caesar(a.cipher, -a.k), a.plain);
    prevC = a.idx;
    const v = C.makeVigMystery(r3, prevV);
    assert.notStrictEqual(v.idx, prevV);
    assert.strictEqual(C.vigenere(v.cipher, v.key, 'dec'), v.plain);
    assert.ok(v.key.length >= 3 && v.key.length <= 8);
    prevV = v.idx;
  }
});
test('事件：凱撒「放回輸入」後回到原文、頻率分析的真正位移、維吉尼亞金鑰的週期、破解判定', () => {
  const T = C.DEFAULT_TEXT;
  const e1 = C.caesarEvent({ src: 'k', input: C.caesar(T, 13), k: 13, dir: 'enc', back: { prevIn: T, k: 13, dir: 'enc' } });
  assert.ok(e1.back && e1.k1 === 13 && e1.d1 === 'enc' && e1.letters === C.lettersOnly(T).length);
  const e2 = C.caesarEvent({ src: 'k', input: C.caesar(T, 13), k: 12, dir: 'enc', back: { prevIn: T, k: 13, dir: 'enc' } });
  assert.ok(!e2.back);
  const f = C.freqEvent({ src: 'g', input: C.caesar(T, 9), g: 9, overlay: true, prov: { plain: T, shift: 9, user: true } });
  assert.ok(f.trueShift === 9 && f.gBest === 9 && f.user && f.plainE > 0);
  const v = C.vigEvent({ src: 'key', input: 'abcdefghij', key: 'QWERTYUIOPAS', keySrc: 'typed', dir: 'enc', L: 1 });
  assert.ok(v.keyLen === 12 && v.keyPeriod === 10 && v.letters === 10);
  const v2 = C.vigEvent({ src: 'key', input: 'abcdefghij', key: 'ABABABABABAB', keySrc: 'typed', dir: 'enc', L: 1 });
  assert.strictEqual(v2.keyPeriod, 2);
  const m = C.makeVigMystery(C.rng(3), -1);
  const ok = C.crackEvent({ output: C.vigenere(m.cipher, m.key + m.key, 'dec'), myst: m, tab: 'vig', usedKey: m.key + m.key });
  assert.ok(ok.ok && !ok.sameKey && ok.kind === 'vig');
  const bad = C.crackEvent({ output: m.cipher, myst: m, tab: 'vig', usedKey: 'A' });
  assert.ok(!bad.ok);
});
test('文字長度上限與只取字母', () => {
  assert.strictEqual(C.clampText('x'.repeat(5000)).length, C.MAX_TEXT);
  assert.strictEqual(C.lettersOnly('a-B c!'), 'ABC');
  assert.strictEqual(C.keyShifts('k e-y').join(','), '10,4,24');
  assert.strictEqual(C.keyShifts('A'.repeat(100)).length, C.MAX_KEY);
});

console.log(`\n${passed} 項測試通過`);
