// 以 Node 執行：node tests/data-compression-core.test.js
'use strict';
const assert = require('assert');
const C = require('../js/data-compression-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const N = C.SIZE * C.SIZE;
const blank = () => new Array(N).fill(0);
const fill = f => { const p = blank(); for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) p[r * 16 + c] = f(r, c) ? 1 : 0; return p; };
const cnt = ns => ns.map((n, i) => ({ s: String.fromCharCode(97 + i), n }));
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 1e-9);

console.log('遊程編碼');
test('三種掃描順序都是 0–255 的排列；蛇行的奇數列由右往左', () => {
  ['row', 'col', 'snake'].forEach(o => {
    const s = C.scanOrder(16, 16, o);
    assert.strictEqual(s.length, 256);
    assert.deepStrictEqual(s.slice().sort((a, b) => a - b), Array.from({ length: 256 }, (_, i) => i));
  });
  assert.deepStrictEqual(C.scanOrder(16, 16, 'row').slice(14, 18), [14, 15, 16, 17]);
  assert.deepStrictEqual(C.scanOrder(16, 16, 'snake').slice(14, 18), [14, 15, 31, 30]);
  assert.deepStrictEqual(C.scanOrder(16, 16, 'col').slice(14, 18), [224, 240, 1, 17]);
});
test('遊程數：全白 1 個；直條紋（寬 1）逐列 256 個、逐行 16 個；棋盤逐列 241 個、蛇行 256 個', () => {
  assert.strictEqual(C.runsOf(C.sequence(blank(), 16, 16, 'row')).length, 1);
  const vs = fill((r, c) => c % 2 === 0);
  assert.strictEqual(C.runsOf(C.sequence(vs, 16, 16, 'row')).length, 256);
  assert.strictEqual(C.runsOf(C.sequence(vs, 16, 16, 'col')).length, 16);
  const ck = fill((r, c) => (r + c) % 2 === 1);
  assert.strictEqual(C.runsOf(C.sequence(ck, 16, 16, 'row')).length, 241);   // 列尾和下一列的列頭同色，接起來
  assert.strictEqual(C.runsOf(C.sequence(ck, 16, 16, 'snake')).length, 256);
});
test('長遊程要拆段：全白 → 「顏色＋長度」255、1（18 位元）；「只記長度」255、0、1（24 位元）', () => {
  const seq = C.sequence(blank(), 16, 16, 'row');
  assert.deepStrictEqual(C.rleTokens(seq, 'pair', 8).map(t => t.n), [255, 1]);
  assert.strictEqual(C.rleSummary(blank(), 16, 16, 'row', 'pair', 8).bits, 18);
  assert.deepStrictEqual(C.rleTokens(seq, 'alt', 8).map(t => t.n), [255, 0, 1]);
  assert.strictEqual(C.rleSummary(blank(), 16, 16, 'row', 'alt', 8).bits, 24);
  // 全黑、只記長度：先放長度 0 的白
  const black = new Array(N).fill(1);
  assert.deepStrictEqual(C.rleTokens(C.sequence(black, 16, 16, 'row'), 'alt', 8).map(t => t.n), [0, 255, 0, 1]);
  // k = 4：上限 15，一個 40 長的遊程拆成 15、15、10
  const seq40 = new Array(40).fill(0).concat(new Array(216).fill(1));
  assert.deepStrictEqual(C.rleTokens(seq40, 'pair', 4).slice(0, 3).map(t => t.n), [15, 15, 10]);
  assert.strictEqual(C.rleEncode([0, 0, 0, 1], 'pair', 2), '011' + '101');
});
test('每段的長度不超過 2^k − 1；「只記長度」的顏色一定黑白輪流、從白開始', () => {
  const r = C.rng(5);
  for (let t = 0; t < 300; t++) {
    const p = blank().map(() => r() < (t % 3 === 0 ? 0.05 : 0.5) ? 1 : 0);
    for (let k = 2; k <= 8; k++) ['row', 'col', 'snake'].forEach(o => {
      const seq = C.sequence(p, 16, 16, o);
      C.rleTokens(seq, 'pair', k).forEach(tk => assert.ok(tk.n >= 1 && tk.n <= C.maxRun(k)));
      C.rleTokens(seq, 'alt', k).forEach((tk, i) => { assert.ok(tk.n >= 0 && tk.n <= C.maxRun(k)); assert.strictEqual(tk.c, i % 2); });
    });
  }
});
test('編碼再解碼一定還原（600 張隨機圖 × 3 種掃描 × 2 種格式 × k = 2–8）', () => {
  const r = C.rng(11);
  for (let t = 0; t < 600; t++) {
    const dens = [0.02, 0.2, 0.5, 0.8, 0.98][t % 5];
    const p = blank().map(() => r() < dens ? 1 : 0);
    ['row', 'col', 'snake'].forEach(o => ['pair', 'alt'].forEach(f => {
      const k = 2 + (t % 7);
      const seq = C.sequence(p, 16, 16, o);
      const bits = C.rleEncode(seq, f, k);
      const s = C.rleSummary(p, 16, 16, o, f, k);
      assert.strictEqual(bits.length, s.bits);
      assert.strictEqual(s.bits, s.tokens.length * C.tokenBits(f, k));
      assert.deepStrictEqual(C.rleDecode(bits, f, k, 256), seq);
      // 解回的序列放回格子，就是原圖
      const back = blank();
      C.scanOrder(16, 16, o).forEach((idx, i) => { back[idx] = seq[i]; });
      assert.deepStrictEqual(back, p);
    }));
  }
});
test('bitsByK 和逐一計算相同；段數 ≥ 原始遊程數', () => {
  ['smile', 'heart', 'house'].forEach(name => {
    const p = C.pattern(name);
    ['row', 'col', 'snake'].forEach(o => ['pair', 'alt'].forEach(f => {
      const s = C.rleSummary(p, 16, 16, o, f, 8);
      for (let k = 2; k <= 8; k++) {
        const sk = C.rleSummary(p, 16, 16, o, f, k);
        assert.strictEqual(s.bitsByK[k], sk.bits);
        assert.ok(sk.tokens.length >= sk.runs.length);
      }
    }));
  });
});
test('沒有重複時反而變大：直條紋（寬 1）256 個遊程 × 9 位元 = 2304 位元，是原始的 9 倍', () => {
  const s = C.rleSummary(fill((r, c) => c % 2 === 0), 16, 16, 'row', 'pair', 8);
  assert.strictEqual(s.bits, 2304);
  assert.strictEqual(s.bits / s.raw, 9);
});
test('內建圖案：都是 16 × 16、黑格數、指紋 64 字', () => {
  Object.keys(C.PATTERNS).forEach(k => { assert.strictEqual(C.PATTERNS[k].length, 16); C.PATTERNS[k].forEach(row => assert.strictEqual(row.length, 16)); });
  assert.strictEqual(C.pattern('heart').reduce((a, b) => a + b, 0), 124);
  assert.strictEqual(C.pixelsHash(C.pattern('heart')).length, 64);
  assert.notStrictEqual(C.pixelsHash(C.pattern('heart')), C.pixelsHash(C.pattern('smile')));
  assert.deepStrictEqual(C.noise(7), C.noise(7));
});

console.log('霍夫曼編碼');
test('ABRACADABRA：A 5、B 2、R 2、C 1、D 1 → 23 位元、平均碼長 23/11', () => {
  const syms = C.symbols('ABRACADABRA'), c = C.countSymbols(syms);
  ['old', 'new'].forEach(tie => {
    const t = C.huffman(c, tie);
    assert.strictEqual(C.encodeSyms(syms, t.codes).length, 23);
    assert.ok(near(C.avgLength(c, t.lengths), 23 / 11));
    assert.strictEqual(t.lengths.A, 1);
  });
  // 平手規則與左右：葉依（次數，碼點）編號 C0 D1 B2 R3 A4；舊的優先 → 先合併 C、D，再 B、R
  const t = C.huffman(c, 'old');
  assert.deepStrictEqual(t.steps.map(s => [t.nodes[s.a].w, t.nodes[s.b].w]), [[1, 1], [2, 2], [2, 4], [5, 6]]);
  assert.deepStrictEqual(t.codes, { A: '0', B: '110', R: '111', C: '100', D: '101' });
});
test('前綴碼：沒有一個碼是另一個碼的前綴（2000 組隨機次數、兩種平手規則）', () => {
  const r = C.rng(21);
  for (let t = 0; t < 2000; t++) {
    const k = 2 + Math.floor(r() * 30);
    const ns = Array.from({ length: k }, () => 1 + Math.floor(r() * (r() < 0.3 ? 3 : 40)));
    ['old', 'new'].forEach(tie => {
      const tr = C.huffman(cnt(ns.map(n => n)).map((x, i) => ({ s: String.fromCodePoint(0x4e00 + i), n: x.n })), tie);
      assert.ok(C.isPrefixFree(Object.values(tr.codes)));
    });
  }
});
test('Kraft 和 Σ 2^(−l) = 1（霍夫曼樹是完整二元樹）', () => {
  const r = C.rng(22);
  for (let t = 0; t < 800; t++) {
    const k = 2 + Math.floor(r() * 30);
    const ns = Array.from({ length: k }, () => 1 + Math.floor(r() * 50));
    const tr = C.huffman(cnt(ns).map((x, i) => ({ s: String.fromCodePoint(0x100 + i), n: x.n })), t % 2 ? 'new' : 'old');
    assert.ok(near(C.kraft(Object.values(tr.lengths)), 1));
  }
});
test('夏農的界限 H ≤ L < H + 1（3000 組隨機次數，含很不均勻的）', () => {
  const r = C.rng(23);
  for (let t = 0; t < 3000; t++) {
    const k = 2 + Math.floor(r() * 31);
    const ns = Array.from({ length: k }, (_, i) => i === 0 && t % 4 === 0 ? 500 : 1 + Math.floor(r() * 30));
    const c = cnt(ns).map((x, i) => ({ s: String.fromCodePoint(0x100 + i), n: x.n }));
    const tr = C.huffman(c, 'old');
    const H = C.entropy(c), L = C.avgLength(c, tr.lengths);
    assert.ok(H <= L + 1e-12, `H=${H} L=${L}`);
    assert.ok(L < H + 1, `H=${H} L=${L}`);
  }
});
test('霍夫曼是最佳的：與暴力枚舉所有碼長（Kraft 不等式）的最小總位元數相同（k ≤ 7 共 400 組，k = 8 共 20 組）', () => {
  const r = C.rng(24);
  for (let t = 0; t < 420; t++) {
    const k = t < 400 ? 2 + (t % 6) : 8;
    const ns = Array.from({ length: k }, () => 1 + Math.floor(r() * (t % 3 === 0 ? 4 : 25)));
    const c = cnt(ns);
    const best = C.bruteOptimal(ns);
    ['old', 'new'].forEach(tie => {
      const tr = C.huffman(c, tie);
      const total = c.reduce((a, x) => a + x.n * tr.lengths[x.s], 0);
      assert.strictEqual(total, best, `次數 ${ns.join(',')}：霍夫曼 ${total}、暴力 ${best}`);
    });
  }
});
test('每個機率都是 2 的負整數次方時 L = H（4,2,1,1；8,4,2,1,1；均勻 2^m 種）', () => {
  [[4, 2, 1, 1], [8, 4, 2, 1, 1], [2, 2, 2, 2], [1, 1, 1, 1, 1, 1, 1, 1], [16, 8, 4, 2, 1, 1], [6, 3, 3]].forEach(ns => {
    const c = cnt(ns);
    ['old', 'new'].forEach(tie => {
      const tr = C.huffman(c, tie);
      assert.ok(near(C.avgLength(c, tr.lengths), C.entropy(c), 1e-12), ns.join(','));
    });
  });
  const c = cnt([3, 1, 1]);   // 3/5 不是 2 的次方 → L > H
  assert.ok(C.avgLength(c, C.huffman(c, 'old').lengths) > C.entropy(c) + 1e-6);
});
test('兩種平手規則：平均碼長一定相同；同樣的輸入每次都得到同樣的碼（確定性）', () => {
  const r = C.rng(25);
  for (let t = 0; t < 1500; t++) {
    const k = 2 + Math.floor(r() * 20);
    const ns = Array.from({ length: k }, () => 1 + Math.floor(r() * 5));
    const c = cnt(ns).map((x, i) => ({ s: String.fromCodePoint(0x41 + i), n: x.n }));
    const a = C.huffman(c, 'old'), b = C.huffman(c, 'new');
    assert.ok(near(C.avgLength(c, a.lengths), C.avgLength(c, b.lengths)));
    assert.deepStrictEqual(C.huffman(c.slice().reverse(), 'old').codes, a.codes);   // 輸入順序不影響
    assert.deepStrictEqual(C.huffman(c, 'new').codes, b.codes);
  }
});
test('平手規則讓樹的形狀不同：AABBCD（舊的優先全部 2 位元；新的優先 1、2、3、3）；1,1,1,2,3,5 的最長碼 3 對 5', () => {
  const c = C.countSymbols(C.symbols('AABBCD'));
  assert.deepStrictEqual(Object.values(C.huffman(c, 'old').lengths).sort(), [2, 2, 2, 2]);
  assert.deepStrictEqual(Object.values(C.huffman(c, 'new').lengths).sort(), [1, 2, 3, 3]);
  const d = cnt([1, 1, 1, 2, 3, 5]);
  assert.strictEqual(C.huffman(d, 'old').maxLen, 3);
  assert.strictEqual(C.huffman(d, 'new').maxLen, 5);
});
test('「舊的優先」的最長碼是所有最佳碼裡最短的（Schwartz 1964；與暴力枚舉比對 300 組）', () => {
  const r = C.rng(26);
  function bestMax(ns) {   // 在總位元數最少的碼長組合中，最長碼的最小值
    const k = ns.length, top = k - 1, full = Math.pow(2, top);
    const opt = C.bruteOptimal(ns);
    let m = Infinity;
    (function rec(i, used, cost, mx) {
      if (cost > opt || mx >= m) return;
      if (i === k) { if (cost === opt) m = mx; return; }
      for (let l = 1; l <= top; l++) { const u = used + Math.pow(2, top - l); if (u <= full) rec(i + 1, u, cost + ns[i] * l, Math.max(mx, l)); }
    })(0, 0, 0, 0);
    return m;
  }
  for (let t = 0; t < 300; t++) {
    const k = 2 + (t % 6);
    const ns = Array.from({ length: k }, () => 1 + Math.floor(r() * 4));
    const a = C.huffman(cnt(ns), 'old'), b = C.huffman(cnt(ns), 'new');
    assert.strictEqual(a.maxLen, bestMax(ns), ns.join(','));
    assert.ok(a.maxLen <= b.maxLen);
  }
});
test('Huffman 1952 論文表 II：13 個機率 0.20…0.01 → 平均碼長 3.42；「新的優先」的碼長與論文完全相同', () => {
  const ns = [20, 18, 10, 10, 10, 6, 6, 4, 4, 4, 4, 3, 1];
  const c = cnt(ns);
  ['old', 'new'].forEach(tie => assert.ok(near(C.avgLength(c, C.huffman(c, tie).lengths), 3.42, 1e-12)));
  const t = C.huffman(c, 'new');
  assert.deepStrictEqual(c.map(x => t.lengths[x.s]), [2, 3, 3, 3, 3, 4, 5, 5, 5, 5, 5, 6, 6]);
});
test('次數是費氏數列 1, 1, 2, 3, 5, 8, … 時，樹長成一條藤：最長碼 = 種類數 − 1', () => {
  for (let k = 3; k <= 10; k++) {
    const c = cnt(C.fibs(k));
    ['old', 'new'].forEach(tie => assert.strictEqual(C.huffman(c, tie).maxLen, k - 1));
  }
  assert.deepStrictEqual(C.fibs(7), [1, 1, 2, 3, 5, 8, 13]);
});
test('合併 t 步後的部分碼：全部合併完就是完整的碼；碼長 = 這個字被合併的次數（Huffman 表 I）', () => {
  const c = C.countSymbols(C.symbols('she sells sea shells'));
  const t = C.huffman(c, 'old');
  for (let i = 0; i < t.k; i++) {
    assert.strictEqual(C.partialCode(t, i, t.steps.length), t.codes[t.nodes[i].s]);
    assert.strictEqual(C.partialCode(t, i, 0), '');
    let prev = '';
    for (let s = 0; s <= t.steps.length; s++) { const pc = C.partialCode(t, i, s); assert.ok(pc.endsWith(prev)); prev = pc; }
  }
});
test('編碼再解碼一定還原（英文、中文、表情符號、空白；500 段隨機文字）', () => {
  const r = C.rng(27);
  const pool = C.symbols('ab cdeABC中文字吃葡萄😀🎉，。!?');
  for (let t = 0; t < 500; t++) {
    const len = 2 + Math.floor(r() * 80);
    const syms = Array.from({ length: len }, () => pool[Math.floor(r() * (2 + (t % (pool.length - 1))))]);
    const c = C.countSymbols(syms);
    if (c.length < 2) continue;
    const tr = C.huffman(c, t % 2 ? 'new' : 'old');
    const bits = C.encodeSyms(syms, tr.codes);
    const d = C.decodeBits(bits, tr);
    assert.deepStrictEqual(d.syms, syms);
    assert.strictEqual(d.leftover, 0);
    assert.strictEqual(bits.length, c.reduce((a, x) => a + x.n * tr.lengths[x.s], 0));
  }
});
test('只有一種字：樹只有一個節點、碼是空的，H = L = 0（不必傳任何位元）', () => {
  const c = C.countSymbols(C.symbols('aaaaaaa'));
  const t = C.huffman(c, 'old');
  assert.strictEqual(t.k, 1);
  assert.strictEqual(t.codes.a, '');
  assert.strictEqual(C.entropy(c), 0);
  assert.strictEqual(C.avgLength(c, t.lengths), 0);
  assert.strictEqual(C.fixedLength(1), 0);
  assert.strictEqual(C.decodeBits('', t), null);
});
test('固定長度 ⌈log₂ k⌉ 與 UTF-8 位元組數（RFC 3629）', () => {
  assert.deepStrictEqual([1, 2, 3, 4, 5, 8, 9, 16, 17, 32].map(C.fixedLength), [0, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.strictEqual(C.utf8Bytes(C.symbols('A')), 1);
  assert.strictEqual(C.utf8Bytes(C.symbols('é')), 2);
  assert.strictEqual(C.utf8Bytes(C.symbols('中')), 3);
  assert.strictEqual(C.utf8Bytes(C.symbols('😀')), 4);
  assert.strictEqual(C.symbols('a😀b').length, 3);   // 表情符號算一個字
  assert.strictEqual(C.utf8Bytes(C.symbols('吃葡萄不吐葡萄皮，不吃葡萄倒吐葡萄皮')), 18 * 3);
  assert.strictEqual(Buffer.byteLength('a😀中é'), C.utf8Bytes(C.symbols('a😀中é')));
});
test('熵：均勻 k 種 = log₂ k；兩種各半 = 1；一種 = 0', () => {
  for (let k = 1; k <= 32; k++) assert.ok(near(C.entropy(cnt(new Array(k).fill(3))), Math.log2(k), 1e-12));
  assert.ok(near(C.entropy(cnt([4, 4])), 1));
});
test('傳輸出錯：翻一個位元後只差一位；重新對齊之後的字全部正確；也找得到一直對不回來的例子', () => {
  const syms = C.symbols('she sells sea shells by the sea shore');
  const t = C.huffman(C.countSymbols(syms), 'old');
  const bits = C.encodeSyms(syms, t.codes);
  for (let p = 1; p <= bits.length; p++) {
    const f = C.flipAnalysis(syms, t, p);
    let diff = 0;
    for (let i = 0; i < bits.length; i++) if (f.bits[i] !== bits[i]) diff++;
    assert.strictEqual(diff, 1);
    if (f.resync) {
      // 對齊之後：解出的字從尾巴算回來和原文相同
      const tail = syms.slice(f.resyncAt);
      assert.deepStrictEqual(f.syms.slice(f.syms.length - tail.length), tail);
    }
  }
  const s2 = C.symbols('cdadaadb'), t2 = C.huffman(C.countSymbols(s2), 'old');
  const f2 = C.flipAnalysis(s2, t2, 1);
  assert.strictEqual(f2.resync, false);
  assert.ok(f2.after >= 6);
});
test('出題可以用種子重現；相鄰的字盡量不同', () => {
  const a = C.quizWord(C.rng(3), ['a', 'b', 'c', 'd'], 6), b = C.quizWord(C.rng(3), ['a', 'b', 'c', 'd'], 6);
  assert.deepStrictEqual(a, b);
  for (let i = 1; i < a.length; i++) assert.notStrictEqual(a[i], a[i - 1]);
});

console.log(`\n${passed} 項通過` + (process.exitCode ? '，有失敗' : '，全部通過'));
