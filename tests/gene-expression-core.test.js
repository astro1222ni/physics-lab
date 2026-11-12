// 以 Node 執行：node tests/gene-expression-core.test.js
'use strict';
const assert = require('assert');
const G = require('../js/gene-expression-core.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` 期望 ${b} ± ${tol}，得到 ${a}`);
}
/** 模擬頁面上的編輯：回傳 {seq, src} */
function sub(st, i, b) { const s = st.seq.split(''); s[i] = b; return { seq: s.join(''), src: st.src.slice() }; }
function ins(st, i, b) { const src = st.src.slice(); src.splice(i, 0, -1); return { seq: st.seq.slice(0, i) + b + st.seq.slice(i), src: src }; }
function del(st, i, n) { const src = st.src.slice(); src.splice(i, n || 1); return { seq: st.seq.slice(0, i) + st.seq.slice(i + (n || 1)), src: src }; }
function start(ref) { return { seq: ref, src: ref.split('').map((_, i) => i) }; }
function cls(ref, st) { return G.classify(ref, st.seq, G.editsFromMap(ref, st.seq, st.src)); }

console.log('gene-expression-core');

test('標準遺傳密碼表：64 個密碼子、20 種胺基酸＋3 個終止，各胺基酸的密碼子數與課本相同', () => {
  assert.strictEqual(Object.keys(G.CODE).length, 64);
  const count = {};
  Object.values(G.CODE).forEach(a => { count[a] = (count[a] || 0) + 1; });
  assert.strictEqual(Object.keys(count).length, 21);
  assert.deepStrictEqual(G.synonymous('*').sort(), ['UAA', 'UAG', 'UGA']);
  const expect = { L: 6, S: 6, R: 6, A: 4, G: 4, P: 4, T: 4, V: 4, I: 3, '*': 3, M: 1, W: 1, F: 2, Y: 2, H: 2, Q: 2, N: 2, K: 2, D: 2, E: 2, C: 2 };
  for (const k in expect) assert.strictEqual(count[k], expect[k], k);
  assert.strictEqual(G.CODE.AUG, 'M'); assert.strictEqual(G.CODE.UGG, 'W'); assert.strictEqual(G.CODE.UUU, 'F');
  assert.strictEqual(G.CODE.GAG, 'E'); assert.strictEqual(G.CODE.GUG, 'V'); assert.strictEqual(G.CODE.UGA, '*');
});

test('互補配對：A–T、G–C；反向互補做兩次回到原本；轉錄只把 T 換成 U', () => {
  assert.strictEqual(G.complement('ATGC'), 'TACG');
  assert.strictEqual(G.revcomp('ATGCC'), 'GGCAT');
  const s = 'GATTACACGGT';
  assert.strictEqual(G.revcomp(G.revcomp(s)), s);
  assert.strictEqual(G.transcribe('ATGTTT'), 'AUGUUU');
  assert.strictEqual(G.clean(' aug-ccu x '), 'ATGCCT');
});

test('β 血紅素：前 31 個胺基酸 MVHLTPEEKSAVTALWGKVNVDEVGGEALGR，從第 13 個鹼基的 ATG 開始', () => {
  const o = G.orf(G.HBB);
  assert.strictEqual(o.start, 12);
  assert.strictEqual(o.protein, 'MVHLTPEEKSAVTALWGKVNVDEVGGEALGR');
  assert.ok(o.stopped);
  assert.strictEqual(o.end, 12 + 32 * 3);
});

test('鐮刀型貧血突變：第 7 個密碼子 GAG→GTG（A→T），麩胺酸變纈胺酸，是錯義突變', () => {
  const ref = G.HBB;
  const i = 12 + 6 * 3 + 1;
  assert.strictEqual(ref.substr(12 + 18, 3), 'GAG');
  const r = cls(ref, sub(start(ref), i, 'T'));
  assert.strictEqual(r.kind, 'missense');
  assert.strictEqual(r.pMut[6], 'V');
  assert.strictEqual(r.dAA, 1);
});

test('同義突變：第三個位置的擺動（GTG→GTC 仍是 Val）', () => {
  const ref = G.HBB, r = cls(ref, sub(start(ref), 12 + 3 + 2, 'C'));
  assert.strictEqual(r.kind, 'silent');
  assert.strictEqual(r.pMut, r.pRef);
});

test('無意義突變：AAG（Lys）→ TAG 提早終止，蛋白質只剩前 8 個', () => {
  const ref = G.HBB, i = 12 + 8 * 3;
  assert.strictEqual(ref.substr(i, 3), 'AAG');
  const r = cls(ref, sub(start(ref), i, 'T'));
  assert.strictEqual(r.kind, 'nonsense');
  assert.strictEqual(r.pMut, 'MVHLTPEEK'.slice(0, 8));
});

test('移碼：插入或刪除一個鹼基，後面的胺基酸全部改變', () => {
  const ref = G.HBB;
  const a = cls(ref, ins(start(ref), 12 + 12, 'A'));
  assert.strictEqual(a.kind, 'frameshift');
  assert.ok(a.dAA >= 5);
  const b = cls(ref, del(start(ref), 12 + 12));
  assert.strictEqual(b.kind, 'frameshift');
});

test('框內缺失：刪掉整個密碼子，蛋白質剛好少一個胺基酸', () => {
  const ref = G.HBB;
  const r = cls(ref, del(start(ref), 12 + 15, 3));
  assert.strictEqual(r.kind, 'inframe');
  assert.ok(G.oneAAdeleted(r.pRef, r.pMut));
});

test('Crick 1961：+1 與 −1 相隔幾個鹼基，讀碼框救回來，只改了中間幾個胺基酸', () => {
  const ref = G.HBB;
  let st = ins(start(ref), 12 + 9, 'G');      // 第 4 個密碼子插入
  st = del(st, 12 + 16);                      // 再往後刪一個
  const e = G.editsFromMap(ref, st.seq, st.src);
  assert.deepStrictEqual(e.map(x => x.kind).sort(), ['del', 'ins']);
  const r = G.classify(ref, st.seq, e);
  assert.strictEqual(r.kind, 'inframe');
  assert.strictEqual(r.pMut.length, r.pRef.length);
  assert.ok(r.dAA >= 1 && r.dAA <= 3, 'dAA = ' + r.dAA);
});

test('改在讀碼框外（5\' 非轉譯區）：蛋白質不變；起始密碼子壞了：讀不到原本的蛋白質；終止密碼子壞了：讀過頭', () => {
  const ref = G.HBB;
  assert.strictEqual(cls(ref, sub(start(ref), 3, 'G')).kind, 'noncoding');
  const ls = cls(ref, sub(start(ref), 13, 'C'));
  assert.ok(ls.kind === 'lost-start' || ls.kind === 'complex');
  assert.strictEqual(cls(ref, sub(start(ref), 12 + 31 * 3, 'C')).kind, 'readthrough');
});

test('編輯紀錄：改回原本的鹼基不算編輯；插入、刪除的位置以原本序列為準', () => {
  const ref = 'AAAATGCCCTAA';
  let st = sub(start(ref), 6, 'G');
  st = sub(st, 6, 'C');
  assert.deepStrictEqual(G.editsFromMap(ref, st.seq, st.src), []);
  st = ins(start(ref), 4, 'T');
  assert.deepStrictEqual(G.editsFromMap(ref, st.seq, st.src), [{ kind: 'ins', pos: 4, len: 1 }]);
  st = del(start(ref), 7, 2);
  assert.deepStrictEqual(G.editsFromMap(ref, st.seq, st.src), [{ kind: 'del', pos: 7, len: 2 }]);
});

test('雙股重疊基因：兩股各自讀出一條蛋白質；迴文序列等於自己的反向互補', () => {
  const b = G.bothStrands('GTTATGTTGGTGCTGGAGACATAG');
  assert.strictEqual(b.fwd, 'MLVLET');
  assert.strictEqual(b.rev, 'MSPAPT');
  assert.ok(G.isPalindrome('GAATTC'));          // EcoRI 切位
  assert.ok(G.isPalindrome('GGATCCGGATCC'));
  assert.ok(!G.isPalindrome('GATTACA'));
});

test('目標胜肽：M 開頭、長度對、encode 寫出的 DNA 真的會產生它；同義密碼子數相乘', () => {
  for (let s = 1; s < 200; s++) {
    const t = G.target(s, 5);
    assert.strictEqual(t.length, 5); assert.strictEqual(t[0], 'M');
    assert.ok(!/\*/.test(t));
    assert.strictEqual(G.protein(G.encode(t)), t);
  }
  assert.strictEqual(G.encodeCount('MW'), 1);
  assert.strictEqual(G.encodeCount('LSR'), 216);
});

test('Meselson–Stahl：條帶比例加總 = 1；半保留第 1 代全是中間帶、第 2 代中間：輕 = 1:1', () => {
  for (const m of ['semi', 'cons', 'disp']) for (let n = 0; n <= 4; n++) for (const d of [false, true]) {
    const b = G.bands(m, n, d);
    close(b.reduce((s, x) => s + x.frac, 0), 1, 1e-12, m + n + d);
  }
  const g1 = G.bands('semi', 1, false);
  assert.strictEqual(g1.length, 1); close(g1[0].rho, G.RHO.M, 1e-12);
  const g2 = G.bands('semi', 2, false);
  assert.strictEqual(g2.length, 2); close(g2[0].frac, 0.5, 1e-12);
  // 中間型密度在輕、重之間
  assert.ok(G.RHO.L < G.RHO.M && G.RHO.M < G.RHO.H);
});

test('Meselson–Stahl：第 1 代排除全保留，第 2 代（或第 1 代加熱變性）排除分散；全保留在單股時和半保留一樣', () => {
  assert.deepStrictEqual(G.consistent(1, false), { semi: true, cons: false, disp: true });
  assert.deepStrictEqual(G.consistent(2, false), { semi: true, cons: false, disp: false });
  assert.deepStrictEqual(G.consistent(1, true), { semi: true, cons: true, disp: false });
  assert.deepStrictEqual(G.consistent(0, false), { semi: true, cons: true, disp: true });
  assert.ok(!G.canEliminate('semi', [{ n: 1, denat: false }, { n: 3, denat: true }]));
  assert.ok(G.canEliminate('cons', [{ n: 0, denat: false }, { n: 1, denat: false }]));
  assert.ok(!G.canEliminate('disp', [{ n: 1, denat: false }]));
  assert.ok(G.canEliminate('disp', [{ n: 1, denat: true }]));
});

console.log(passed + ' 項通過');
