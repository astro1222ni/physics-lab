// 以 Node 執行：node tests/twos-complement-core.test.js
'use strict';
const assert = require('assert');
const T = require('../js/twos-complement-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const P = n => Math.pow(2, n);
const REPS = ['twos', 'ones', 'sign', 'bias'];
/** n ≤ 16 每個圖樣都試；更寬時抽樣（含兩端與符號位附近） */
function patterns(n) {
  const m = P(n), h = P(n - 1);
  if (n <= 16) { const a = []; for (let u = 0; u < m; u++) a.push(u); return a; }
  const a = [0, 1, 2, h - 2, h - 1, h, h + 1, m - 2, m - 1];
  for (let k = 0; k < 3000; k++) a.push(Math.floor(((k * 2654435761) % 4294967296) / 4294967296 * m));
  return a;
}

console.log('四種表示法：讀值與編碼');
test('8 位元的已知值：−1、−128、127、兩個 0', () => {
  // −1 在四種表示法
  assert.strictEqual(T.encode(-1, 8, 'twos'), 0xFF);
  assert.strictEqual(T.encode(-1, 8, 'ones'), 0xFE);
  assert.strictEqual(T.encode(-1, 8, 'sign'), 0x81);
  assert.strictEqual(T.encode(-1, 8, 'bias'), 0x7F);
  // 範圍的兩端
  assert.strictEqual(T.value(0x80, 8, 'twos'), -128);
  assert.strictEqual(T.value(0x7F, 8, 'twos'), 127);
  assert.strictEqual(T.value(0x80, 8, 'ones'), -127);
  assert.strictEqual(T.value(0xFF, 8, 'sign'), -127);
  assert.strictEqual(T.value(0x00, 8, 'bias'), -128);
  assert.strictEqual(T.value(0xFF, 8, 'bias'), 127);
  // 負零
  assert.ok(T.isNegZero(0xFF, 8, 'ones') && T.value(0xFF, 8, 'ones') === 0);
  assert.ok(T.isNegZero(0x80, 8, 'sign') && T.value(0x80, 8, 'sign') === 0);
  assert.ok(!T.isNegZero(0xFF, 8, 'twos') && !T.isNegZero(0x80, 8, 'bias'));
  assert.strictEqual(T.encode(0, 8, 'ones', true), 0xFF);
  assert.strictEqual(T.encode(0, 8, 'sign', true), 0x80);
  assert.strictEqual(T.encode(0, 8, 'twos', true), 0);
  // 超出範圍
  assert.strictEqual(T.encode(-128, 8, 'ones'), null);
  assert.strictEqual(T.encode(-128, 8, 'sign'), null);
  assert.strictEqual(T.encode(128, 8, 'twos'), null);
  assert.strictEqual(T.encode(-129, 8, 'bias'), null);
});
test('範圍：二補數與偏移碼 −2^(n−1) … 2^(n−1) − 1（一個 0），一補數與原碼 ±(2^(n−1) − 1)（兩個 0）', () => {
  for (let n = 4; n <= 32; n++) {
    const h = P(n - 1);
    assert.deepStrictEqual(T.range(n, 'twos'), { min: -h, max: h - 1, zeros: 1, values: P(n) });
    assert.deepStrictEqual(T.range(n, 'bias'), { min: -h, max: h - 1, zeros: 1, values: P(n) });
    assert.deepStrictEqual(T.range(n, 'ones'), { min: -(h - 1), max: h - 1, zeros: 2, values: P(n) - 1 });
    assert.deepStrictEqual(T.range(n, 'sign'), { min: -(h - 1), max: h - 1, zeros: 2, values: P(n) - 1 });
  }
});
test('每個 n（4–16 全部圖樣、17–32 抽樣）：圖樣 → 值 → 圖樣 一致；每個值都落在範圍內', () => {
  for (let n = 4; n <= 32; n++) for (const rep of REPS) {
    const r = T.range(n, rep);
    for (const u of patterns(n)) {
      const v = T.value(u, n, rep);
      assert.ok(v >= r.min && v <= r.max, `n=${n} ${rep} u=${u}`);
      assert.strictEqual(T.encode(v, n, rep, T.isNegZero(u, n, rep)), u, `n=${n} ${rep} u=${u}`);
    }
  }
});
test('每個 n（4–16）：範圍內每個值 → 圖樣 → 值 一致；不同的值得到不同的圖樣（一對一）', () => {
  for (let n = 4; n <= 16; n++) for (const rep of REPS) {
    const r = T.range(n, rep), seen = new Set();
    for (let v = r.min; v <= r.max; v++) {
      const u = T.encode(v, n, rep);
      assert.ok(u !== null && u >= 0 && u < P(n));
      assert.strictEqual(T.value(u, n, rep), v);
      assert.ok(!seen.has(u)); seen.add(u);
    }
    assert.strictEqual(seen.size, r.values);
    assert.strictEqual(P(n) - seen.size, r.zeros - 1);   // 多出來的圖樣剛好是負零
  }
});
test('二補數的定義：值 = −b(n−1)·2^(n−1) + Σ b(i)·2^i（n = 4–12 全部圖樣）', () => {
  for (let n = 4; n <= 12; n++) for (let u = 0; u < P(n); u++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += T.bit(u, i) * T.weight(i, n);
    assert.strictEqual(s, T.value(u, n, 'twos'));
    // 負數的圖樣 = 2^n − |v|（二補數名稱的由來：對 2^n 取補數）
    const v = T.value(u, n, 'twos');
    if (v < 0) assert.strictEqual(u, P(n) + v);
  }
});
test('偏移碼 = 二補數翻轉最高位；一補數的負數 = 二補數的負數 − 1', () => {
  for (let n = 4; n <= 12; n++) {
    const h = P(n - 1);
    for (let v = -h; v < h; v++) {
      const t = T.encode(v, n, 'twos'), b = T.encode(v, n, 'bias');
      assert.strictEqual(t ^ b, h);
      if (v < 0 && v > -h) assert.strictEqual(T.encode(v, n, 'ones'), t - 1);
      if (v > 0) { assert.strictEqual(T.encode(v, n, 'ones'), t); assert.strictEqual(T.encode(v, n, 'sign'), t); }
    }
  }
});

console.log('取負');
test('二補數：取反再加一 = 2^n − u（mod 2^n），值變成相反數；只有 0 和 −2^(n−1) 取負還是自己', () => {
  for (let n = 4; n <= 32; n++) {
    const h = P(n - 1);
    for (const u of patterns(n)) {
      const g = T.negate(u, n, 'twos');
      assert.strictEqual(g.inv, T.not(u, n));
      assert.strictEqual(g.u, T.wrap(P(n) - u, n));
      const v = T.value(u, n, 'twos');
      if (u === h) { assert.ok(g.same && g.overflow); assert.strictEqual(T.value(g.u, n, 'twos'), -h); }
      else { assert.strictEqual(T.value(g.u, n, 'twos'), -v || 0); assert.ok(!g.overflow); assert.strictEqual(g.same, u === 0); }
    }
  }
});
test('取負再取負回到原圖樣；「加一」的進位鏈長度 = 取反後尾端連續 1 的個數', () => {
  for (let n = 4; n <= 10; n++) for (let u = 0; u < P(n); u++) {
    for (const rep of REPS) assert.strictEqual(T.negate(T.negate(u, n, rep).u, n, rep).u, u, `${rep} n=${n} u=${u}`);
    const g = T.negate(u, n, 'twos');
    let ones = 0;
    while (ones < n && T.bit(g.inv, ones)) ones++;
    const carried = g.carries.slice(1).filter(c => c).length;
    assert.strictEqual(carried, ones, `n=${n} u=${u}`);
  }
});
test('一補數取負 = 取反（+0 ↔ −0）；原碼取負 = 翻轉符號位；偏移碼的 −2^(n−1) 取負也還是自己', () => {
  for (let n = 4; n <= 12; n++) {
    const h = P(n - 1);
    for (let u = 0; u < P(n); u++) {
      for (const rep of ['ones', 'sign', 'bias']) {
        const g = T.negate(u, n, rep), v = T.value(u, n, rep), w = T.value(g.u, n, rep);
        if (rep === 'bias' && u === 0) { assert.ok(g.overflow && g.same && w === -h); continue; }
        assert.strictEqual(w, -v || 0, `${rep} n=${n} u=${u}`);
        if (v === 0 && rep !== 'bias') assert.notStrictEqual(g.u, u);   // 一補數、原碼：+0 與 −0 互換
      }
      assert.strictEqual(T.negate(u, n, 'ones').u, T.not(u, n));
      assert.strictEqual(T.negate(u, n, 'sign').u, u ^ h);
    }
  }
});

console.log('加法、減法與旗標（n = 4–8 全部組合）');
test('加法 = (A + B) mod 2^n，減法 = (A − B) mod 2^n（無號與二補數的讀法都一樣）', () => {
  for (let n = 4; n <= 8; n++) {
    const m = P(n);
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
      assert.strictEqual(T.add(a, b, n).r, (a + b) % m);
      assert.strictEqual(T.sub(a, b, n).r, ((a - b) % m + m) % m);
      const x = T.value(a, n, 'twos'), y = T.value(b, n, 'twos');
      assert.strictEqual(T.value(T.add(a, b, n).r, n, 'twos'), T.value(T.wrap(x + y, n), n, 'twos'));
    }
  }
});
test('V 旗標：c(n) ⊕ c(n−1) ＝ 同號規則 ＝「真正的有號結果超出範圍」（加法與減法，n = 4–8 全部 2^(2n) 組合）', () => {
  let count = 0, vOn = 0;
  for (let n = 4; n <= 8; n++) {
    const m = P(n);
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) for (const op of ['add', 'sub']) {
      const x = T.arith(a, b, n, op);
      assert.strictEqual(x.V, T.vBySigns(a, b, x.r, n, op), `n=${n} ${a} ${op} ${b}`);
      assert.strictEqual(x.V, T.vByRange(a, b, n, op), `n=${n} ${a} ${op} ${b}`);
      count++; vOn += x.V;
    }
  }
  assert.ok(count === 2 * (256 + 1024 + 4096 + 16384 + 65536) && vOn > 0);
});
test('C 旗標：加法 C = 1 ⇔ A + B ≥ 2^n（無號溢位）；減法 C = 1 ⇔ A ≥ B（沒有借位），borrow = 1 − C', () => {
  for (let n = 4; n <= 8; n++) {
    const m = P(n);
    for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) {
      const s = T.add(a, b, n), d = T.sub(a, b, n);
      assert.strictEqual(s.C, a + b >= m ? 1 : 0);
      assert.strictEqual(s.C, T.cByRange(a, b, n, 'add'));
      assert.strictEqual(d.C, a >= b ? 1 : 0);
      assert.strictEqual(d.borrow, a < b ? 1 : 0);
      assert.strictEqual(d.C, T.cByRange(a, b, n, 'sub'));
      // N、Z
      assert.strictEqual(s.N, T.bit(s.r, n - 1)); assert.strictEqual(s.Z, s.r === 0 ? 1 : 0);
      // 進位鏈：c(i+1) = 多數決(a(i), b(i), c(i))
      for (let i = 0; i < n; i++) {
        const k = T.bit(a, i) + T.bit(b, i) + s.carries[i];
        assert.strictEqual(s.carries[i + 1], k >= 2 ? 1 : 0);
      }
    }
  }
});
test('C 與 V 互相獨立：加法與減法，四種 (C, V) 組合都會發生；例：8 位元', () => {
  const ex = (a, b, op) => { const x = T.arith(T.encode(a, 8, 'twos'), T.encode(b, 8, 'twos'), 8, op); return [x.C, x.V]; };
  assert.deepStrictEqual(ex(-1, 1, 'add'), [1, 0]);       // 進位但沒有溢位：−1 + 1 = 0
  assert.deepStrictEqual(ex(100, 50, 'add'), [0, 1]);     // 溢位但沒有進位：150 放不下
  assert.deepStrictEqual(ex(-100, -100, 'add'), [1, 1]);  // 兩個負數加出正數
  assert.deepStrictEqual(ex(3, 4, 'add'), [0, 0]);
  assert.deepStrictEqual(ex(3, 5, 'sub'), [0, 0]);         // 借位：3 − 5（無號 3 < 5），但 −2 沒有溢位
  assert.deepStrictEqual(ex(127, -1, 'sub'), [0, 1]);
  assert.deepStrictEqual(ex(-128, 1, 'sub'), [1, 1]);
  assert.deepStrictEqual(ex(5, 3, 'sub'), [1, 0]);
  assert.deepStrictEqual(ex(-128, -128, 'add'), [1, 1]);    // 兩個最小值相加 = 0
  assert.strictEqual(T.add(0x80, 0x80, 8).Z, 1);
});
test('減去最小值：A − (−2^(n−1)) 在 A < 0 時不溢位、A ≥ 0 時溢位；A + min 與 A − min 的結果、C、N、Z 都相同，只有 V 相反', () => {
  for (let n = 4; n <= 10; n++) {
    const h = P(n - 1);
    for (let a = 0; a < P(n); a++) {
      const d = T.sub(a, h, n), s = T.add(a, h, n);
      assert.strictEqual(d.V, T.value(a, n, 'twos') >= 0 ? 1 : 0);
      assert.deepStrictEqual([d.r, d.C, d.N, d.Z], [s.r, s.C, s.N, s.Z]);
      assert.strictEqual(d.V + s.V, 1);
    }
    // 除了 0 與 min，沒有別的 B 讓 A + B 與 A − B 的結果一樣（B ≡ −B mod 2^n）
    for (let a = 0; a < P(n); a += 7) for (let b = 1; b < P(n); b++) if (b !== h) assert.notStrictEqual(T.add(a, b, n).r, T.sub(a, b, n).r);
  }
});
test('原碼與二補數只在一個負數上一致：圖樣 3·2^(n−2)，值 −2^(n−2)', () => {
  for (let n = 4; n <= 16; n++) {
    const both = [];
    for (let u = 0; u < P(n); u++) {
      const t = T.value(u, n, 'twos'), s = T.value(u, n, 'sign');
      if (t < 0 && t === s) both.push(u);
      // 一補數與原碼的負數永遠不一致；二補數與一補數的負數永遠差 1
      if (u >= P(n - 1) && !T.isNegZero(u, n, 'ones') && !T.isNegZero(u, n, 'sign')) assert.notStrictEqual(T.value(u, n, 'ones'), s);
    }
    assert.deepStrictEqual(both, [3 * P(n - 2)]);
    assert.strictEqual(T.value(3 * P(n - 2), n, 'twos'), -P(n - 2));
  }
});
test('最大減最小 = 2^n − 1，讀成 −1（V = 1）', () => {
  for (let n = 4; n <= 32; n++) {
    const h = P(n - 1), d = T.sub(h - 1, h, n);
    assert.strictEqual(T.value(d.r, n, 'twos'), -1);
    assert.strictEqual(d.V, 1);
  }
});

console.log('位元數改變與符號延伸');
test('符號延伸保留二補數的值；補零延伸保留無號的值（負數的值會變）', () => {
  for (let n = 4; n <= 16; n++) for (let m = n + 1; m <= 32; m += (n <= 8 ? 1 : 5)) for (const u of patterns(n)) {
    const e = T.signExtend(u, n, m);
    assert.strictEqual(T.value(e, m, 'twos'), T.value(u, n, 'twos'));
    assert.strictEqual(T.truncate(e, n), u);                 // 截回去還是原來的圖樣
    for (let i = n; i < m; i++) assert.strictEqual(T.bit(e, i), T.bit(u, n - 1));
    assert.strictEqual(T.value(T.zeroExtend(u), m, 'twos'), u);
  }
});
test('改位元數：裝得下就保留值（二補數變寬 = 符號延伸）、裝不下就截斷；負零保留負零', () => {
  for (let n = 4; n <= 12; n++) for (let m = 4; m <= 16; m++) for (const rep of REPS) for (let u = 0; u < P(n); u += 3) {
    const r = T.resize(u, n, m, rep), v = T.value(u, n, rep);
    if (T.inRange(v, m, rep)) {
      assert.ok(r.kept); assert.strictEqual(T.value(r.u, m, rep), v);
      assert.strictEqual(T.isNegZero(r.u, m, rep), T.isNegZero(u, n, rep));
      if (rep === 'twos' && m > n) assert.strictEqual(r.u, T.signExtend(u, n, m));
      if (rep === 'twos' && m < n) assert.strictEqual(r.u, T.truncate(u, m));
    } else { assert.ok(!r.kept); assert.strictEqual(r.u, T.truncate(u, m)); }
  }
  // 例：16 位元的 200 截成 8 位元 → −56（Java 的 (byte) 200）
  const r = T.resize(200, 16, 8, 'twos');
  assert.ok(r.kept === false && T.value(r.u, 8, 'twos') === -56);
});
test('字元 0xFF（ÿ）符號延伸成 32 位元是 −1（和 C 語言的 EOF 相同），補零延伸是 255', () => {
  assert.strictEqual(T.value(T.signExtend(0xFF, 8, 32), 32, 'twos'), -1);
  assert.strictEqual(T.value(T.zeroExtend(0xFF), 32, 'twos'), 255);
});

console.log('同一個加法器、不同的表示法');
test('二補數：答案在範圍內時，加法器直接給的就是正確答案（加法、減法，n = 4–8 全部組合）', () => {
  for (let n = 4; n <= 8; n++) for (let a = 0; a < P(n); a++) for (let b = 0; b < P(n); b++) for (const op of ['add', 'sub']) {
    const q = T.viaAdder(a, b, n, 'twos', op);
    assert.strictEqual(q.ok, q.fits);
  }
});
test('一補數做迴繞進位、偏移碼翻轉最高位之後就正確；原碼沒辦法（有反例）', () => {
  let signBad = 0, onesRawBad = 0;
  for (let n = 4; n <= 8; n++) for (let a = 0; a < P(n); a++) for (let b = 0; b < P(n); b++) for (const op of ['add', 'sub']) {
    const o = T.viaAdder(a, b, n, 'ones', op);
    if (o.fits) { assert.ok(o.fixedOk, `ones n=${n} ${a} ${op} ${b}`); if (!o.ok) onesRawBad++; }
    const s = T.viaAdder(a, b, n, 'bias', op);
    if (s.fits) assert.ok(s.fixedOk, `bias n=${n} ${a} ${op} ${b}`);
    const g = T.viaAdder(a, b, n, 'sign', op);
    if (g.fits && !g.ok) signBad++;
  }
  assert.ok(signBad > 0 && onesRawBad > 0);
  // 原碼的例子：5 + (−3) → 0101 + 1011 = 1 0000 → 讀成 +0，不是 2
  const g = T.viaAdder(T.encode(5, 4, 'sign'), T.encode(-3, 4, 'sign'), 4, 'sign', 'add');
  assert.ok(g.fits && !g.ok && g.raw === 0 && g.truth === 2);
  // 一補數：x + (−x) = −0（全 1）
  const o = T.viaAdder(T.encode(5, 8, 'ones'), T.encode(-5, 8, 'ones'), 8, 'ones', 'add');
  assert.ok(o.res.r === 0xFF && o.rawNegZero && o.res.C === 0);
});
test('RFC 1071 的例子：16 位元一補數和 0001 + F203 + F4F5 + F6F7 = DDF2', () => {
  let s = 0;
  [0x0001, 0xF203, 0xF4F5, 0xF6F7].forEach(w => { s = T.onesAdd(s, w, 16); });
  assert.strictEqual(s, 0xDDF2);
});

console.log('歷史數值');
test('32 位元：2 147 483 647 + 1 → −2 147 483 648（V = 1、C = 0）；4 294 967 295 + 1 → 0（C = 1、V = 0）', () => {
  const a = T.add(P(31) - 1, 1, 32);
  assert.strictEqual(T.value(a.r, 32, 'twos'), -2147483648);
  assert.deepStrictEqual([a.C, a.V], [0, 1]);
  const b = T.add(P(32) - 1, 1, 32);
  assert.deepStrictEqual([b.r, b.C, b.V], [0, 1, 0]);
});
test('10 位元的週數：1023 + 1 → 0（C = 1）', () => {
  const a = T.add(1023, 1, 10);
  assert.deepStrictEqual([a.r, a.C, a.V], [0, 1, 0]);
});

console.log('輸入與格式');
test('十進位（含 −0）、十六進位、二進位的輸入', () => {
  assert.deepStrictEqual(T.parse('-42', 'dec', 8, 'twos'), { ok: true, u: 0xD6, v: -42, negZero: false });
  assert.deepStrictEqual(T.parse('−0', 'dec', 8, 'sign'), { ok: true, u: 0x80, v: 0, negZero: true });
  assert.deepStrictEqual(T.parse('-0', 'dec', 8, 'twos'), { ok: true, u: 0, v: 0, negZero: false });
  assert.strictEqual(T.parse('128', 'dec', 8, 'twos').err, 'range');
  assert.strictEqual(T.parse('-128', 'dec', 8, 'ones').err, 'range');
  assert.strictEqual(T.parse('12a', 'dec', 8, 'twos').err, 'syntax');
  assert.strictEqual(T.parse('0xFF', 'hex', 8, 'twos').v, -1);
  assert.strictEqual(T.parse('1FF', 'hex', 8, 'twos').err, 'wide');
  assert.strictEqual(T.parse('1000 0000', 'bin', 8, 'twos').v, -128);
  assert.strictEqual(T.parse('7fffffff', 'hex', 32, 'twos').v, 2147483647);
  assert.strictEqual(T.parse('-2,147,483,648', 'dec', 32, 'twos').u, P(31));
});
test('文字格式：千分位、真正的減號、負零、分組的二進位、十六進位', () => {
  assert.strictEqual(T.intText(-2147483648), '−2,147,483,648');
  assert.strictEqual(T.valText(0xFF, 8, 'ones'), '−0');
  assert.strictEqual(T.valText(5, 8, 'twos', true), '+5');
  assert.strictEqual(T.binText(0xD6, 8, true), '1101 0110');
  assert.strictEqual(T.binText(5, 10, true), '00 0000 0101');
  assert.strictEqual(T.hexText(0xD6, 10), '0D6');
});

console.log('旗標挑戰');
test('出題：四種 (C, V) 組合與兩種運算都會出現，答案和加法器一致，B ≠ 0；同一個種子出同樣的題目', () => {
  for (let n = 4; n <= 8; n++) {
    const rand = T.rng(42 + n), seen = {};
    let prev = null;
    for (let k = 0; k < 400; k++) {
      const q = T.question(rand, n, prev);
      const x = T.arith(q.a, q.b, n, q.op);
      assert.ok(q.b !== 0 && x.C === q.C && x.V === q.V);
      assert.ok(!(prev && prev.a === q.a && prev.b === q.b && prev.op === q.op));
      seen[q.op + q.C + q.V] = (seen[q.op + q.C + q.V] || 0) + 1;
      prev = q;
    }
    assert.strictEqual(Object.keys(seen).length, 8, 'n=' + n + ' ' + JSON.stringify(seen));
  }
  const r1 = T.rng(7), r2 = T.rng(7);
  for (let k = 0; k < 20; k++) assert.deepStrictEqual(T.question(r1, 8, null), T.question(r2, 8, null));
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : ''));
